import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/auth-constants';
import { getPool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId manquant.' }, { status: 400 });
    }

    const pool = getPool();

    // Verify session ownership.
    const [sessionRows] = await pool.query(
      'SELECT session_id, mobilier_filename, created_at, updated_at FROM inventory_sessions WHERE session_id = ? AND user_id = ?',
      [sessionId, userId]
    );
    if (!(sessionRows as unknown[]).length) {
      return NextResponse.json({ error: 'Session introuvable.' }, { status: 404 });
    }
    const session = (sessionRows as Array<{
      session_id: string;
      mobilier_filename: string;
      created_at: Date;
      updated_at: Date;
    }>)[0];

    // Fetch lecteur batches.
    const [batchRows] = await pool.query(
      'SELECT batch_id, filename, reader_rows, imported_at FROM lecteur_batches WHERE session_id = ? ORDER BY imported_at ASC',
      [sessionId]
    );

    // Fetch current inventory state with reader data.
    const [itemRows] = await pool.query(
      `SELECT
         i.bt_inv2024         AS btInv2024,
         i.designation_affect AS designationAffect,
         i.direction,
         i.code_invest        AS codeInvest,
         i.designation,
         i.specification,
         i.original_etat      AS originalEtat,
         i.reader_etat        AS readerEtat,
         c.reader_bt          AS readerBt,
         i.reader_date        AS readerDate,
         i.result_status      AS status
       FROM inventory_items i
       LEFT JOIN comparison_results c
         ON c.inventory_item_id = i.id AND c.session_id = i.session_id
       WHERE i.session_id = ?
       ORDER BY i.id ASC`,
      [sessionId]
    );

    const rows = itemRows as Array<Record<string, unknown>>;
    const total = rows.length;

    const counts: Record<string, number> = { Traité: 0, Deplacé: 0, Non_Trouvé: 0, Nouveau: 0 };
    for (const row of rows) {
      const s = row.status as string;
      if (s in counts) counts[s] += 1;
    }

    // Progress = items that have been scanned (Traité + Deplacé + Nouveau) / total.
    const scanned = counts.Traité + counts.Deplacé + counts.Nouveau;
    const progressPct = total > 0 ? Math.round((scanned / total) * 100) : 0;

    return NextResponse.json({
      sessionId: session.session_id,
      mobilierFilename: session.mobilier_filename,
      createdAt:  session.created_at,
      updatedAt:  session.updated_at,
      lecteurBatches: batchRows,
      lecteurCount: (batchRows as unknown[]).length,
      total,
      counts,
      progressPct,
      rows: rows.slice(0, 200).map((row) => ({
        ...row,
        readerDate: row.readerDate
          ? new Date(row.readerDate as string).toISOString()
          : null,
      })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur inattendue.' },
      { status: 500 }
    );
  }
}
