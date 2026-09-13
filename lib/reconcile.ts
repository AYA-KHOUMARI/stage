import * as XLSX from 'xlsx';

export type InventoryRow = {
  btInv2024: string | null;
  designationAffect: string | null;
  direction: string | null;
  codeInvest: string;
  designation: string | null;
  specification: string | null;
  originalEtat: string | null;
};

export type ReaderRow = {
  barcode: string;
  etat: string | null;
  affect: string | null;
  dateHeureEntree: Date | null;
};

export type ResultStatus = 'DONE' | 'DEPLACE' | 'NON_TROUVE';

export type ReconciledRow = InventoryRow & {
  readerEtat: string | null;
  readerBt: string | null;
  readerDate: Date | null;
  status: ResultStatus;
};

export type SheetMeta = {
  sheetName: string;
  headerRow: number;
};

function clean(value: unknown): string | null {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return String(value).trim();
}

export function normalizeCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

/** Normalize column labels so case, accents, spaces and punctuation do not matter. */
function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function excelDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
  }
  const text = clean(value);
  if (!text) return null;

  // Handle common French Excel text dates such as 11/11/2025 15:17:24.
  const fr = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (fr) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = fr;
    return new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type HeaderAliases = Record<string, string[]>;

const mobilierAliases: HeaderAliases = {
  btInv2024: ['btinv2024'],
  codeInvest: ['codeinvest'],
  designationAffect: ['designaffect', 'designationaffect'],
  direction: ['direction'],
  designation: ['designation'],
  specification: ['specification'],
  originalEtat: ['etat', 'state', 'status']
};

const readerAliases: HeaderAliases = {
  barcode: ['barcode', 'codebarre', 'codebarres', 'codemachine', 'codemachinelecteur'],
  etat: ['etat', 'state', 'status'],
  affect: ['affect', 'btdetecte', 'btdetected', 'bt', 'emplacement', 'emplacementdetecte'],
  dateHeureEntree: ['dateheureentree', 'dateheure', 'datelecture', 'date']
};

function findHeaderedSheet(
  workbook: XLSX.WorkBook,
  aliases: HeaderAliases,
  requiredKeys: string[],
  label: string
): { sheet: XLSX.WorkSheet; meta: SheetMeta; columns: Record<string, number> } {
  const candidates: Array<{ sheet: XLSX.WorkSheet; meta: SheetMeta; columns: Record<string, number>; dataRows: number }> = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][];
    const maxHeaderRows = Math.min(matrix.length, 50);

    for (let rowIndex = 0; rowIndex < maxHeaderRows; rowIndex++) {
      const row = matrix[rowIndex] || [];
      const normalized = row.map(normalizeHeader);
      const columns: Record<string, number> = {};

      for (const [key, names] of Object.entries(aliases)) {
        const accepted = new Set(names.map(normalizeHeader));
        const index = normalized.findIndex((cell) => cell && accepted.has(cell));
        if (index >= 0) columns[key] = index;
      }

      if (requiredKeys.every((key) => columns[key] !== undefined)) {
        candidates.push({
          sheet,
          meta: { sheetName, headerRow: rowIndex + 1 },
          columns,
          dataRows: Math.max(0, matrix.length - rowIndex - 1)
        });
        break;
      }
    }
  }

  if (!candidates.length) {
    const requiredText = requiredKeys.map((key) => aliases[key][0]).join(', ');
    throw new Error(`Impossible de trouver dans le fichier une feuille contenant les colonnes nécessaires pour ${label} : ${requiredText}. Le nom de la feuille n'a pas d'importance.`);
  }

  candidates.sort((a, b) => b.dataRows - a.dataRows);
  return candidates[0];
}

function readDataRows(sheet: XLSX.WorkSheet, headerRow: number): unknown[][] {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    range: Math.max(0, headerRow - 1),
    defval: null,
    raw: true
  }) as unknown[][];
}

export function parseMobilier(buffer: Buffer): InventoryRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const found = findHeaderedSheet(workbook, mobilierAliases, ['btInv2024', 'codeInvest'], 'le fichier Mobilier');
  const rows = readDataRows(found.sheet, found.meta.headerRow);

  return rows
    .map((row) => ({
      btInv2024: clean(row[found.columns.btInv2024]),
      designationAffect: clean(row[found.columns.designationAffect]),
      direction: clean(row[found.columns.direction]),
      codeInvest: clean(row[found.columns.codeInvest]) || '',
      designation: clean(row[found.columns.designation]),
      specification: clean(row[found.columns.specification]),
      originalEtat: clean(row[found.columns.originalEtat])
    }))
    .filter((row) => row.codeInvest !== '');
}

export function parseReader(buffer: Buffer): { rows: ReaderRow[]; meta: SheetMeta } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const found = findHeaderedSheet(workbook, readerAliases, ['barcode', 'etat', 'affect', 'dateHeureEntree'], 'le fichier Lecteur');
  const rows = readDataRows(found.sheet, found.meta.headerRow);

  const parsed = rows
    .map((row) => ({
      barcode: clean(row[found.columns.barcode]) || '',
      etat: clean(row[found.columns.etat]),
      affect: clean(row[found.columns.affect]),
      dateHeureEntree: excelDate(row[found.columns.dateHeureEntree])
    }))
    .filter((row) => row.barcode !== '' && normalizeHeader(row.barcode) !== 'barcode');

  return { rows: parsed, meta: found.meta };
}

// Kept for compatibility with the previous project API.
export function parseFeuil2(buffer: Buffer): ReaderRow[] {
  return parseReader(buffer).rows;
}

export function reconcile(inventory: InventoryRow[], reader: ReaderRow[]): ReconciledRow[] {
  // If a barcode appears more than once, use the most recent reading.
  const latest = new Map<string, ReaderRow>();
  for (const scan of reader) {
    const key = normalizeCode(scan.barcode);
    const previous = latest.get(key);
    if (!previous || ((scan.dateHeureEntree?.getTime() ?? 0) >= (previous.dateHeureEntree?.getTime() ?? 0))) {
      latest.set(key, scan);
    }
  }

  return inventory.map((item) => {
    const scan = latest.get(normalizeCode(item.codeInvest));
    if (!scan) {
      return { ...item, readerEtat: null, readerBt: null, readerDate: null, status: 'NON_TROUVE' };
    }

    const dbBt = normalizeCode(item.btInv2024);
    const readerBt = normalizeCode(scan.affect);
    const bothBtCodes = dbBt.startsWith('BT') && readerBt.startsWith('BT');
    const status: ResultStatus = bothBtCodes && dbBt === readerBt ? 'DONE' : 'DEPLACE';

    return {
      ...item,
      readerEtat: scan.etat,
      readerBt: scan.affect,
      readerDate: scan.dateHeureEntree,
      status
    };
  });
}
