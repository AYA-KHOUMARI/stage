import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/db';
import { parseReader, parseMobilier, reconcile, normalizeCode } from '@/lib/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 2000;
const RETRYABLE_MYSQL_ERRORS = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

function sqlDate(date: Date | null) { return date ?? null; }

async function executeWithRetry<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (!RETRYABLE_MYSQL_ERRORS.has(error?.code) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError;
}

async function bulkInsert(connection: any, table: string, columns: string, rows: unknown[][], batchSize = BATCH_SIZE) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const placeholders = chunk.map((row) => `(${row.map(() => '?').join(',')})`).join(',');
    const values = chunk.flat();
    await executeWithRetry(() => connection.execute(`INSERT INTO ${table} (${columns}) VALUES ${placeholders}`, values));
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const mobilierFile = form.get('mobilier');
    const lecteurFile = form.get('lecteur');

    if (!(mobilierFile instanceof File) || !(lecteurFile instanceof File)) {
      return NextResponse.json({ error: 'Veuillez fournir les deux fichiers Excel.' }, { status: 400 });
    }

    const mobilierBuffer = Buffer.from(await mobilierFile.arrayBuffer());
    const lecteurBuffer = Buffer.from(await lecteurFile.arrayBuffer());
    const inventory = parseMobilier(mobilierBuffer);
    const readerResult = parseReader(lecteurBuffer);
    const reader = readerResult.rows;

    if (!inventory.length) throw new Error('Aucune ligne de données trouvée dans le fichier Mobilier.');
    if (!reader.length) throw new Error(`Aucune ligne valide trouvée dans la feuille « ${readerResult.meta.sheetName} » du fichier Lecteur.`);

    const results = reconcile(inventory, reader);
    const newMachines = results.filter((row) => row.status === 'Nouveau').length;
    const batchId = randomUUID();
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      // Each operation is committed in one transaction, but every INSERT is
      // capped at 2,000 rows. No giant INSERT is generated.
      await connection.beginTransaction();
      await connection.execute(
        'INSERT INTO imports (batch_id, mobilier_filename, lecteur_filename) VALUES (?, ?, ?)',
        [batchId, mobilierFile.name, lecteurFile.name]
      );

      await bulkInsert(connection, 'inventory_items',
        'batch_id, bt_inv2024, designation_affect, direction, code_invest, designation, specification, original_etat, reader_etat, reader_bt, reader_date, result_status',
        results.map((row) => [
          batchId, row.btInv2024, row.designationAffect, row.direction,
          row.codeInvest, row.designation, row.specification, row.originalEtat,
          row.readerEtat, row.readerBt, sqlDate(row.readerDate), row.status
        ])
      );

      await bulkInsert(connection, 'reader_scans',
        'batch_id, barcode, etat, affect, date_heure_entree',
        reader.map((row) => [batchId, row.barcode, row.etat, row.affect, sqlDate(row.dateHeureEntree)])
      );

      const [inventoryIds] = await connection.query(
        'SELECT id FROM inventory_items WHERE batch_id = ? ORDER BY id ASC', [batchId]
      );
      const [readerIds] = await connection.query(
        'SELECT id FROM reader_scans WHERE batch_id = ? ORDER BY id ASC', [batchId]
      );
      const inventoryIdRows = inventoryIds as Array<{ id: number }>;
      const readerIdRows = readerIds as Array<{ id: number }>;

      if (inventoryIdRows.length !== results.length) {
        throw new Error(`Contrôle d'intégrité échoué : ${results.length} lignes finales calculées, mais ${inventoryIdRows.length} enregistrées.`);
      }
      if (readerIdRows.length !== reader.length) {
        throw new Error(`Contrôle d'intégrité échoué : ${reader.length} lignes Lecteur valides, mais ${readerIdRows.length} enregistrées.`);
      }

      const latestReaderId = new Map<string, number>();
      const latestReaderDate = new Map<string, number>();
      for (let i = 0; i < reader.length; i++) {
        const key = normalizeCode(reader[i].barcode);
        if (!key) continue;
        const currentTime = reader[i].dateHeureEntree?.getTime() ?? 0;
        const previousTime = latestReaderDate.get(key);
        if (previousTime === undefined || currentTime >= previousTime) {
          latestReaderDate.set(key, currentTime);
          latestReaderId.set(key, readerIdRows[i].id);
        }
      }

      const comparisons = results.map((row, i) => {
        const readerId = latestReaderId.get(normalizeCode(row.codeInvest)) ?? null;
        return [batchId, inventoryIdRows[i].id, readerId, row.btInv2024, row.readerBt, row.status];
      });

      await bulkInsert(connection, 'comparison_results',
        'batch_id, inventory_item_id, reader_scan_id, database_bt, reader_bt, result_status',
        comparisons
      );

      const [countRows] = await connection.query(
        `SELECT COUNT(*) AS total FROM comparison_results WHERE batch_id = ?`, [batchId]
      );
      const storedTotal = Number((countRows as Array<any>)[0]?.total || 0);
      if (storedTotal !== results.length) {
        throw new Error(`Contrôle d'intégrité échoué : ${results.length} résultats attendus, ${storedTotal} enregistrés.`);
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const counts = results.reduce((acc, row) => {
      acc[row.status] += 1;
      return acc;
    }, { Traité: 0, Deplacé: 0, Non_Trouvé: 0, Nouveau: 0 });

    return NextResponse.json({
      batchId,
      files: { mobilier: mobilierFile.name, lecteur: lecteurFile.name },
      total: results.length,
      mobilierRows: inventory.length,
      readerRows: reader.length,
      readerMeaningfulRows: readerResult.meaningfulRows,
      readerInvalidBarcodeRows: readerResult.invalidBarcodeRows,
      newMachines,
      readerSheet: readerResult.meta.sheetName,
      readerHeaderRow: readerResult.meta.headerRow,
      counts,
      rows: results.slice(0, 200).map((row) => ({ ...row, readerDate: row.readerDate?.toISOString() || null }))
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur inattendue.' }, { status: 500 });
  }
}
