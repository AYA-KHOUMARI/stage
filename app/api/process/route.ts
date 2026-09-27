import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE } from "@/lib/auth-constants";
import { getPool } from "@/lib/db";
import {
  parseReader,
  parseMobilier,
  reconcile,
  mergeReconciliation,
  normalizeCode,
} from "@/lib/reconcile";
import type { ReconciledRow } from "@/lib/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_SIZE = 2000;
const RETRYABLE_MYSQL_ERRORS = new Set([
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
]);

function sqlDate(date: Date | null) {
  return date ?? null;
}

async function executeWithRetry<T>(
  operation: () => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (!RETRYABLE_MYSQL_ERRORS.has(error?.code) || attempt === attempts)
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw lastError;
}

async function bulkInsert(
  connection: any,
  table: string,
  columns: string,
  rows: unknown[][],
  batchSize = BATCH_SIZE,
) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const placeholders = chunk
      .map((row) => `(${row.map(() => "?").join(",")})`)
      .join(",");
    const values = chunk.flat();
    await executeWithRetry(() =>
      connection.execute(
        `INSERT INTO ${table} (${columns}) VALUES ${placeholders}`,
        values,
      ),
    );
  }
}

/** Retrieve the authenticated user id from the session cookie. */
async function getAuthUserId(): Promise<number | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const session = await verifySession(token);
    return session?.userId ?? null;
  } catch {
    return null;
  }
}

function buildCounts(rows: ReconciledRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { Traité: 0, Deplacé: 0, Non_Trouvé: 0, Nouveau: 0 } as Record<
      string,
      number
    >,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 1 — Create a new inventory session
// FormData: { mobilier: File, lecteur: File }
// ─────────────────────────────────────────────────────────────────────────────
async function handleNewSession(
  mobilierFile: File,
  lecteurFile: File,
  userId: number,
) {
  const mobilierBuffer = Buffer.from(await mobilierFile.arrayBuffer());
  const lecteurBuffer = Buffer.from(await lecteurFile.arrayBuffer());

  const inventory = parseMobilier(mobilierBuffer);
  const readerResult = parseReader(lecteurBuffer);
  const reader = readerResult.rows;

  if (!inventory.length)
    throw new Error(
      "Aucune ligne de données trouvée dans le fichier Mobilier.",
    );
  if (!reader.length)
    throw new Error(
      `Aucune ligne valide trouvée dans la feuille « ${readerResult.meta.sheetName} » du fichier Lecteur.`,
    );

  const results = reconcile(inventory, reader);
  const sessionId = randomUUID();
  const batchId = randomUUID();
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // inventory_sessions
    await connection.execute(
      "INSERT INTO inventory_sessions (session_id, user_id, mobilier_filename) VALUES (?, ?, ?)",
      [sessionId, userId, mobilierFile.name],
    );

    // lecteur_batches (batch 1)
    await connection.execute(
      "INSERT INTO lecteur_batches (batch_id, session_id, filename, reader_rows) VALUES (?, ?, ?, ?)",
      [batchId, sessionId, lecteurFile.name, reader.length],
    );

    // inventory_items
    await bulkInsert(
      connection,
      "inventory_items",
      "session_id, last_lecteur_batch_id, bt_inv2024, designation_affect, direction, code_invest, designation, specification, original_etat, reader_etat, reader_bt, reader_date, result_status",
      results.map((row) => [
        sessionId,
        batchId,
        row.btInv2024,
        row.designationAffect,
        row.direction,
        row.codeInvest,
        row.designation,
        row.specification,
        row.originalEtat,
        row.readerEtat,
        row.readerBt,
        sqlDate(row.readerDate),
        row.status,
      ]),
    );

    // reader_scans
    await bulkInsert(
      connection,
      "reader_scans",
      "batch_id, barcode, etat, affect, date_heure_entree",
      reader.map((row) => [
        batchId,
        row.barcode,
        row.etat,
        row.affect,
        sqlDate(row.dateHeureEntree),
      ]),
    );

    // comparison_results
    const [inventoryIds] = await connection.query(
      "SELECT id, code_invest FROM inventory_items WHERE session_id = ? ORDER BY id ASC",
      [sessionId],
    );
    const [readerIds] = await connection.query(
      "SELECT id, barcode FROM reader_scans WHERE batch_id = ? ORDER BY id ASC",
      [batchId],
    );
    const inventoryIdRows = inventoryIds as Array<{
      id: number;
      code_invest: string;
    }>;
    const readerIdRows = readerIds as Array<{ id: number; barcode: string }>;

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

    const codeToInventoryIds = new Map<string, number[]>();
    for (const row of inventoryIdRows) {
      const key = normalizeCode(row.code_invest);
      if (!key) continue;
      const current = codeToInventoryIds.get(key) ?? [];
      current.push(row.id);
      codeToInventoryIds.set(key, current);
    }

    const comparisons: Array<
      [string, number, number | null, string | null, string | null, string]
    > = [];
    for (const row of results) {
      const key = normalizeCode(row.codeInvest);
      const ids = codeToInventoryIds.get(key) ?? [];
      const invId = ids.shift();
      if (invId === undefined) {
        throw new Error(
          `Impossible d'associer le code inventaire ${row.codeInvest} à un item de la session.`,
        );
      }
      codeToInventoryIds.set(key, ids);
      const readerId = latestReaderId.get(key) ?? null;
      comparisons.push([
        sessionId,
        invId,
        readerId,
        row.btInv2024,
        row.readerBt,
        row.status,
      ]);
    }

    await bulkInsert(
      connection,
      "comparison_results",
      "session_id, inventory_item_id, reader_scan_id, database_bt, reader_bt, result_status",
      comparisons,
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const counts = buildCounts(results);

  return NextResponse.json({
    sessionId,
    batchId,
    mobilierFilename: mobilierFile.name,
    lecteurFilename: lecteurFile.name,
    lecteurCount: 1,
    total: results.length,
    mobilierRows: inventory.length,
    readerRows: reader.length,
    readerMeaningfulRows: readerResult.meaningfulRows,
    readerInvalidBarcodeRows: readerResult.invalidBarcodeRows,
    readerSheet: readerResult.meta.sheetName,
    readerHeaderRow: readerResult.meta.headerRow,
    counts,
    rows: results
      .slice(0, 200)
      .map((row) => ({
        ...row,
        readerDate: row.readerDate?.toISOString() || null,
      })),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode 2 — Add a new Lecteur to an existing session
// FormData: { sessionId: string, lecteur: File }
// ─────────────────────────────────────────────────────────────────────────────
async function handleContinueSession(
  sessionId: string,
  lecteurFile: File,
  userId: number,
) {
  const pool = getPool();

  // Verify the session belongs to this user.
  const [sessionRows] = await pool.query(
    "SELECT session_id, mobilier_filename FROM inventory_sessions WHERE session_id = ? AND user_id = ?",
    [sessionId, userId],
  );
  if (!(sessionRows as unknown[]).length) {
    return NextResponse.json(
      { error: "Session introuvable." },
      { status: 404 },
    );
  }
  const session = (
    sessionRows as Array<{ session_id: string; mobilier_filename: string }>
  )[0];

  // Load the current inventory state from the DB.
  const [existingRows] = await pool.query<any[]>(
    `SELECT
       i.id AS dbId,
       i.bt_inv2024          AS btInv2024,
       i.designation_affect  AS designationAffect,
       i.direction,
       i.code_invest         AS codeInvest,
       i.designation,
       i.specification,
       i.original_etat       AS originalEtat,
       i.reader_etat         AS readerEtat,
       c.reader_bt           AS readerBt,
       i.reader_date         AS readerDate,
       i.result_status       AS status
     FROM inventory_items i
     LEFT JOIN comparison_results c
       ON c.inventory_item_id = i.id AND c.session_id = i.session_id
     WHERE i.session_id = ?
     ORDER BY i.id ASC`,
    [sessionId],
  );

  const existing: (ReconciledRow & { dbId: number })[] = (
    existingRows as any[]
  ).map((r: any) => ({
    dbId: r.dbId,
    btInv2024: r.btInv2024,
    designationAffect: r.designationAffect,
    direction: r.direction,
    codeInvest: r.codeInvest,
    designation: r.designation,
    specification: r.specification,
    originalEtat: r.originalEtat,
    readerEtat: r.readerEtat,
    readerBt: r.readerBt,
    readerDate: r.readerDate ? new Date(r.readerDate) : null,
    status: r.status,
  }));

  // Parse the new Lecteur.
  const lecteurBuffer = Buffer.from(await lecteurFile.arrayBuffer());
  const readerResult = parseReader(lecteurBuffer);
  const newScans = readerResult.rows;

  if (!newScans.length) {
    throw new Error(
      `Aucune ligne valide trouvée dans la feuille « ${readerResult.meta.sheetName} » du fichier Lecteur.`,
    );
  }

  // Merge.
  const merged = mergeReconciliation(existing, newScans);

  const batchId = randomUUID();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Insert the new lecteur_batch record.
    await connection.execute(
      "INSERT INTO lecteur_batches (batch_id, session_id, filename, reader_rows) VALUES (?, ?, ?, ?)",
      [batchId, sessionId, lecteurFile.name, newScans.length],
    );

    // Insert the new reader_scans.
    await bulkInsert(
      connection,
      "reader_scans",
      "batch_id, barcode, etat, affect, date_heure_entree",
      newScans.map((row) => [
        batchId,
        row.barcode,
        row.etat,
        row.affect,
        sqlDate(row.dateHeureEntree),
      ]),
    );

    // Build a map of the latest reader_scan id for each barcode in this new batch.
    const [newReaderIds] = await connection.query(
      "SELECT id, barcode FROM reader_scans WHERE batch_id = ? ORDER BY id ASC",
      [batchId],
    );
    const newReaderIdRows = newReaderIds as Array<{
      id: number;
      barcode: string;
    }>;
    const latestReaderId = new Map<string, number>();
    const latestReaderDate = new Map<string, number>();
    for (let i = 0; i < newScans.length; i++) {
      const key = normalizeCode(newScans[i].barcode);
      if (!key) continue;
      const currentTime = newScans[i].dateHeureEntree?.getTime() ?? 0;
      const previousTime = latestReaderDate.get(key);
      if (previousTime === undefined || currentTime >= previousTime) {
        latestReaderDate.set(key, currentTime);
        latestReaderId.set(key, newReaderIdRows[i].id);
      }
    }

    // Build lookup map: codeInvest → pending dbIds for existing items.
    const existingByCode = new Map<
      string,
      Array<ReconciledRow & { dbId: number }>
    >();
    for (const item of existing) {
      const key = normalizeCode(item.codeInvest);
      if (!key) continue;
      const stack = existingByCode.get(key) ?? [];
      stack.push(item);
      existingByCode.set(key, stack);
    }

    // Split merged rows into updates vs new inserts.
    const toUpdate: (ReconciledRow & { dbId: number })[] = [];
    const toInsert: ReconciledRow[] = [];

    for (const row of merged) {
      const key = normalizeCode(row.codeInvest);
      const candidates = existingByCode.get(key) ?? [];
      const existingItem = candidates.shift();
      if (existingItem) {
        existingByCode.set(key, candidates);
        toUpdate.push({ ...row, dbId: existingItem.dbId });
      } else {
        toInsert.push(row);
      }
    }

    // UPDATE changed inventory_items.
    for (const row of toUpdate) {
      await connection.execute(
        `UPDATE inventory_items
         SET reader_etat = ?, reader_bt = ?, reader_date = ?,
             result_status = ?, last_lecteur_batch_id = ?
         WHERE id = ?`,
        [
          row.readerEtat,
          row.readerBt,
          sqlDate(row.readerDate),
          row.status,
          batchId,
          row.dbId,
        ],
      );
    }

    // INSERT truly new inventory_items (Nouveau from this Lecteur).
    if (toInsert.length) {
      await bulkInsert(
        connection,
        "inventory_items",
        "session_id, last_lecteur_batch_id, bt_inv2024, designation_affect, direction, code_invest, designation, specification, original_etat, reader_etat, reader_bt, reader_date, result_status",
        toInsert.map((row) => [
          sessionId,
          batchId,
          row.btInv2024,
          row.designationAffect,
          row.direction,
          row.codeInvest,
          row.designation,
          row.specification,
          row.originalEtat,
          row.readerEtat,
          row.readerBt,
          sqlDate(row.readerDate),
          row.status,
        ]),
      );
    }

    // UPDATE comparison_results for items that changed.
    for (const row of toUpdate) {
      const readerId =
        latestReaderId.get(normalizeCode(row.codeInvest)) ?? null;
      await connection.execute(
        `INSERT INTO comparison_results
           (session_id, inventory_item_id, reader_scan_id, database_bt, reader_bt, result_status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           reader_scan_id = VALUES(reader_scan_id),
           reader_bt      = VALUES(reader_bt),
           result_status  = VALUES(result_status),
           compared_at    = NOW()`,
        [
          sessionId,
          row.dbId,
          readerId,
          row.btInv2024,
          row.readerBt,
          row.status,
        ],
      );
    }

    // INSERT comparison_results for new Nouveau items.
    if (toInsert.length) {
      const [newInventoryIds] = await connection.query(
        `SELECT id, code_invest FROM inventory_items
         WHERE session_id = ? AND last_lecteur_batch_id = ?
         ORDER BY id ASC`,
        [sessionId, batchId],
      );
      const newInvRows = newInventoryIds as Array<{
        id: number;
        code_invest: string;
      }>;
      for (const invRow of newInvRows) {
        const readerId =
          latestReaderId.get(normalizeCode(invRow.code_invest)) ?? null;
        const matchedRow = toInsert.find(
          (r) =>
            normalizeCode(r.codeInvest) === normalizeCode(invRow.code_invest),
        );
        if (!matchedRow) continue;
        await connection.execute(
          `INSERT IGNORE INTO comparison_results
             (session_id, inventory_item_id, reader_scan_id, database_bt, reader_bt, result_status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            sessionId,
            invRow.id,
            readerId,
            matchedRow.btInv2024,
            matchedRow.readerBt,
            matchedRow.status,
          ],
        );
      }
    }

    // Touch the session's updated_at timestamp.
    await connection.execute(
      "UPDATE inventory_sessions SET updated_at = NOW() WHERE session_id = ?",
      [sessionId],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  // Count lecteur batches for this session.
  const [batchCountRows] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM lecteur_batches WHERE session_id = ?",
    [sessionId],
  );
  const lecteurCount = Number(
    (batchCountRows as Array<{ cnt: number }>)[0]?.cnt || 0,
  );

  const counts = buildCounts(merged);

  return NextResponse.json({
    sessionId,
    batchId,
    mobilierFilename: session.mobilier_filename,
    lecteurFilename: lecteurFile.name,
    lecteurCount,
    total: merged.length,
    readerRows: newScans.length,
    readerMeaningfulRows: readerResult.meaningfulRows,
    readerInvalidBarcodeRows: readerResult.invalidBarcodeRows,
    readerSheet: readerResult.meta.sheetName,
    readerHeaderRow: readerResult.meta.headerRow,
    counts,
    rows: merged
      .slice(0, 200)
      .map((row) => ({
        ...row,
        readerDate: (row.readerDate as Date | null)?.toISOString() || null,
      })),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
    }

    const form = await request.formData();
    const sessionIdRaw = form.get("sessionId");
    const lecteurFile = form.get("lecteur");

    if (!(lecteurFile instanceof File)) {
      return NextResponse.json(
        { error: "Veuillez fournir un fichier Lecteur." },
        { status: 400 },
      );
    }

    // Mode 2 — continue an existing session.
    if (typeof sessionIdRaw === "string" && sessionIdRaw.trim()) {
      return await handleContinueSession(
        sessionIdRaw.trim(),
        lecteurFile,
        userId,
      );
    }

    // Mode 1 — create a new session.
    const mobilierFile = form.get("mobilier");
    if (!(mobilierFile instanceof File)) {
      return NextResponse.json(
        {
          error:
            "Veuillez fournir les fichiers Mobilier et Lecteur pour démarrer une nouvelle session.",
        },
        { status: 400 },
      );
    }
    return await handleNewSession(mobilierFile, lecteurFile, userId);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inattendue." },
      { status: 500 },
    );
  }
}
