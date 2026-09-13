import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/db';
import { parseReader, parseMobilier, reconcile } from '@/lib/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sqlDate(date: Date | null) { return date ? date : null; }

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

    if (!inventory.length) throw new Error('Aucune ligne valide trouvée dans Mobilier Global.');
    if (!reader.length) throw new Error(`Aucune ligne valide trouvée dans la feuille « ${readerResult.meta.sheetName} » du fichier Lecteur.`);

    const preview = reconcile(inventory, reader);
    const batchId = randomUUID();
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.execute(
        'INSERT INTO imports (batch_id, mobilier_filename, lecteur_filename) VALUES (?, ?, ?)',
        [batchId, mobilierFile.name, lecteurFile.name]
      );

      for (let i = 0; i < inventory.length; i += 500) {
        const chunk = inventory.slice(i, i + 500);
        const placeholders = chunk.map(() => '(?,?,?,?,?,?,?, ?,NULL,NULL)').join(',');
        const values = chunk.flatMap((row) => [
          batchId, row.btInv2024, row.designationAffect, row.direction,
          row.codeInvest, row.designation, row.specification, row.originalEtat
        ]);
        await connection.execute(
          `INSERT INTO inventory_items (batch_id, bt_inv2024, designation_affect, direction, code_invest, designation, specification, original_etat, reader_etat, reader_bt) VALUES ${placeholders}`,
          values
        );
      }

      for (let i = 0; i < reader.length; i += 500) {
        const chunk = reader.slice(i, i + 500);
        const placeholders = chunk.map(() => '(?,?,?,?,?)').join(',');
        const values = chunk.flatMap((row) => [batchId, row.barcode, row.etat, row.affect, sqlDate(row.dateHeureEntree)]);
        await connection.execute(
          `INSERT INTO reader_scans (batch_id, barcode, etat, affect, date_heure_entree) VALUES ${placeholders}`,
          values
        );
      }

      // The final database reconciliation is a real SQL JOIN. We pick the latest reader scan per barcode.
      await connection.execute(`
        INSERT INTO comparison_results (batch_id, inventory_item_id, reader_scan_id, database_bt, reader_bt, result_status)
        SELECT
          i.batch_id,
          i.id,
          r.id,
          i.bt_inv2024,
          r.affect,
          CASE
            WHEN r.id IS NULL THEN 'NON_TROUVE'
            WHEN UPPER(TRIM(COALESCE(i.bt_inv2024, ''))) LIKE 'BT%'
             AND UPPER(TRIM(COALESCE(r.affect, ''))) LIKE 'BT%'
             AND UPPER(TRIM(i.bt_inv2024)) = UPPER(TRIM(r.affect)) THEN 'DONE'
            ELSE 'DEPLACE'
          END
        FROM inventory_items i
        LEFT JOIN reader_scans r
          ON r.id = (
            SELECT r2.id
            FROM reader_scans r2
            WHERE r2.batch_id = i.batch_id
              AND UPPER(TRIM(r2.barcode)) = UPPER(TRIM(i.code_invest))
            ORDER BY r2.date_heure_entree DESC, r2.id DESC
            LIMIT 1
          )
        WHERE i.batch_id = ?
      `, [batchId]);

      await connection.execute(`
        UPDATE inventory_items i
        INNER JOIN comparison_results c ON c.inventory_item_id = i.id AND c.batch_id = i.batch_id
        LEFT JOIN reader_scans r ON r.id = c.reader_scan_id
        SET i.reader_etat = r.etat,
            i.reader_bt = r.affect,
            i.reader_date = r.date_heure_entree,
            i.result_status = c.result_status
        WHERE i.batch_id = ?
      `, [batchId]);

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const counts = preview.reduce((acc, row) => {
      acc[row.status] += 1;
      return acc;
    }, { DONE: 0, DEPLACE: 0, NON_TROUVE: 0 });

    return NextResponse.json({
      batchId,
      files: { mobilier: mobilierFile.name, lecteur: lecteurFile.name },
      total: preview.length,
      readerRows: reader.length,
      readerSheet: readerResult.meta.sheetName,
      readerHeaderRow: readerResult.meta.headerRow,
      counts,
      rows: preview.slice(0, 200).map((row) => ({ ...row, readerDate: row.readerDate?.toISOString() || null }))
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur inattendue.' }, { status: 500 });
  }
}
