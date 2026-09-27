import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { buildFinalWorkbook } from '@/lib/excel';
import type { ReconciledRow } from '@/lib/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get('sessionId');
    if (!sessionId) return NextResponse.json({ error: 'sessionId manquant.' }, { status: 400 });

    const pool = getPool();
    const [rows] = await pool.query(
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
       INNER JOIN comparison_results c
         ON c.inventory_item_id = i.id AND c.session_id = i.session_id
       WHERE i.session_id = ?
       ORDER BY i.id ASC`,
      [sessionId]
    );

    if (!(rows as unknown[]).length)
      return NextResponse.json({ error: 'Aucun résultat pour cette session.' }, { status: 404 });

    const workbook = buildFinalWorkbook(rows as ReconciledRow[]);
    return new NextResponse(workbook as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Inventaire_Resultat_${sessionId.slice(0, 8)}.xlsx"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur export.' },
      { status: 500 }
    );
  }
}
