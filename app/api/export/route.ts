import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { buildFinalWorkbook } from '@/lib/excel';
import type { ReconciledRow } from '@/lib/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const batchId = new URL(request.url).searchParams.get('batchId');
    if (!batchId) return NextResponse.json({ error: 'batchId manquant.' }, { status: 400 });

    const pool = getPool();
    const [rows] = await pool.query(`
      SELECT
        i.bt_inv2024 AS btInv2024,
        i.designation_affect AS designationAffect,
        i.direction,
        i.code_invest AS codeInvest,
        i.designation,
        i.specification,
        r.etat AS readerEtat,
        c.reader_bt AS readerBt,
        r.date_heure_entree AS readerDate,
        c.result_status AS status
      FROM inventory_items i
      INNER JOIN comparison_results c
        ON c.inventory_item_id = i.id AND c.batch_id = i.batch_id
      LEFT JOIN reader_scans r ON r.id = c.reader_scan_id
      WHERE i.batch_id = ?
      ORDER BY i.id ASC
    `, [batchId]);

    if (!(rows as unknown[]).length) return NextResponse.json({ error: 'Aucun résultat pour ce batch.' }, { status: 404 });

    const workbook = buildFinalWorkbook(rows as ReconciledRow[]);
    return new NextResponse(workbook as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Mobilier_2025_Resultat_${batchId.slice(0, 8)}.xlsx"`
      }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur export.' }, { status: 500 });
  }
}
