import * as XLSX from 'xlsx';
import type { ReconciledRow } from './reconcile';

function formatDate(value: Date | null) {
  if (!value) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

export function buildFinalWorkbook(rows: ReconciledRow[]) {
  const output = rows.map((row) => ({
    'BT INV2024': row.btInv2024 || '',
    'Désign. Affect.': row.designationAffect || '',
    Direction: row.direction || '',
    'Code Invest': row.codeInvest,
    Désignation: row.designation || '',
    Spécification: row.specification || '',
    Etat: row.readerEtat || row.originalEtat || '',
    'EMPL Lecteur': row.readerBt || '',
    Date: formatDate(row.readerDate),
    Statut: row.status
  }));

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(output);
  sheet['!cols'] = [
    { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 26 },
    { wch: 38 }, { wch: 14 }, { wch: 18 }, { wch: 24 }, { wch: 16 }
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, 'Resultat');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
