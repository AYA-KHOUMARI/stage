import * as XLSX from 'xlsx';

export type ResultStatus = 'Traité' | 'Deplacé' | 'Non_Trouvé' | 'Nouveau';

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

export type ReconciledRow = InventoryRow & {
  readerEtat: string | null;
  readerBt: string | null;
  readerDate: Date | null;
  status: ResultStatus;
};

type SheetMeta = { sheetName: string; headerRow: number };
type HeaderAliases = Record<string, string[]>;

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function excelDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S));
  }
  const text = String(value ?? '').trim();
  if (!text) return null;
  const fr = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{1,2}):?(\d{2})?(?::(\d{2}))?)?$/);
  if (fr) {
    const [, d, m, y, hh = '0', mm = '0', ss = '0'] = fr;
    const year = Number(y.length === 2 ? `20${y}` : y);
    return new Date(year, Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const mobilierAliases: HeaderAliases = {
  // Year-independent: accepts BT INV2024, BT INV2025, BT INV 2026, BT_INV2027, etc.
  btInv2024: ['btinv'],
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

function isMeaningfulRow(row: unknown[]): boolean {
  return row.some((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

function findHeaderedSheet(
  workbook: XLSX.WorkBook,
  aliases: HeaderAliases,
  requiredKeys: string[],
  label: string
): { sheet: XLSX.WorkSheet; meta: SheetMeta; columns: Record<string, number> } {
  const candidates: Array<{ sheet: XLSX.WorkSheet; meta: SheetMeta; columns: Record<string, number>; dataRows: number }> = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const ref = sheet['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    const maxHeaderRows = Math.min(50, range.e.r + 1);
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      range: { s: { r: range.s.r, c: range.s.c }, e: { r: range.s.r + maxHeaderRows - 1, c: range.e.c } },
      defval: null,
      raw: true
    }) as unknown[][];

    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
      const row = matrix[rowIndex] || [];
      const normalized = row.map(normalizeHeader);
      const columns: Record<string, number> = {};
      for (const [key, names] of Object.entries(aliases)) {
        const accepted = new Set(names.map(normalizeHeader));
        const index = normalized.findIndex((cell) => {
          if (!cell) return false;

          // The inventory BT column is deliberately year-independent.
          // Examples accepted:
          // BT INV2024, BT INV2025, BT INV 2026, BT_INV2027
          // (all normalize to btinv2024 / btinv2025 / ...)
          if (key === 'btInv2024') {
            return /^btinv(?:19|20)\d{2}$/.test(cell) || cell === 'btinv';
          }

          return accepted.has(cell);
        });
        if (index >= 0) columns[key] = index;
      }
      if (requiredKeys.every((key) => columns[key] !== undefined)) {
        candidates.push({
          sheet,
          meta: { sheetName, headerRow: range.s.r + rowIndex + 1 },
          columns,
          dataRows: Math.max(0, range.e.r - (range.s.r + rowIndex))
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
  const ref = sheet['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    range: { s: { r: headerRow - 1, c: range.s.c }, e: { r: range.e.r, c: range.e.c } },
    defval: null,
    raw: true
  }) as unknown[][];
}

export function parseMobilier(buffer: Buffer): InventoryRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: true });
  const found = findHeaderedSheet(workbook, mobilierAliases, ['btInv2024', 'codeInvest'], 'le fichier Mobilier');
  const rows = readDataRows(found.sheet, found.meta.headerRow);
  return rows.slice(1).filter(isMeaningfulRow).map((row) => ({
    btInv2024: clean(row[found.columns.btInv2024]),
    designationAffect: clean(row[found.columns.designationAffect]),
    direction: clean(row[found.columns.direction]),
    codeInvest: clean(row[found.columns.codeInvest]) || '',
    designation: clean(row[found.columns.designation]),
    specification: clean(row[found.columns.specification]),
    originalEtat: clean(row[found.columns.originalEtat])
  }));
}

export function parseReader(buffer: Buffer): { rows: ReaderRow[]; meta: SheetMeta; meaningfulRows: number; invalidBarcodeRows: number } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, dense: true });
  const found = findHeaderedSheet(workbook, readerAliases, ['barcode', 'etat', 'affect', 'dateHeureEntree'], 'le fichier Lecteur');
  const rows = readDataRows(found.sheet, found.meta.headerRow);
  const meaningful = rows.slice(1).filter(isMeaningfulRow).map((row) => ({
    barcode: clean(row[found.columns.barcode]) || '',
    etat: clean(row[found.columns.etat]),
    affect: clean(row[found.columns.affect]),
    dateHeureEntree: excelDate(row[found.columns.dateHeureEntree])
  }));
  const invalidBarcodeRows = meaningful.filter((row) => !row.barcode).length;
  return {
    rows: meaningful.filter((row) => row.barcode !== ''),
    meta: found.meta,
    meaningfulRows: meaningful.length,
    invalidBarcodeRows
  };
}

export function parseFeuil2(buffer: Buffer): ReaderRow[] {
  return parseReader(buffer).rows;
}

export function reconcile(inventory: InventoryRow[], reader: ReaderRow[]): ReconciledRow[] {
  const latest = new Map<string, ReaderRow>();
  for (const scan of reader) {
    const key = normalizeCode(scan.barcode);
    if (!key) continue;
    const previous = latest.get(key);
    if (!previous || ((scan.dateHeureEntree?.getTime() ?? 0) >= (previous.dateHeureEntree?.getTime() ?? 0))) {
      latest.set(key, scan);
    }
  }

  const inventoryCodes = new Set<string>();
  const results: ReconciledRow[] = [];

  for (const item of inventory) {
    const code = normalizeCode(item.codeInvest);
    if (code) inventoryCodes.add(code);
    const scan = latest.get(code);
    if (!scan) {
      results.push({ ...item, readerEtat: null, readerBt: null, readerDate: null, status: 'Non_Trouvé' });
      continue;
    }
    const dbBt = normalizeCode(item.btInv2024);
    const readerBt = normalizeCode(scan.affect);
    const bothBtCodes = dbBt.startsWith('BT') && readerBt.startsWith('BT');
    const status: ResultStatus = bothBtCodes && dbBt === readerBt ? 'Traité' : 'Deplacé';
    results.push({ ...item, readerEtat: scan.etat, readerBt: scan.affect, readerDate: scan.dateHeureEntree, status });
  }

  // Reader-only machines are new inventory records. They are added to the
  // database with their barcode as Code Invest and are explicitly marked
  // Nouveau so they are never confused with a moved or missing machine.
  for (const scan of latest.values()) {
    const code = normalizeCode(scan.barcode);
    if (!code || inventoryCodes.has(code)) continue;
    results.push({
      btInv2024: null,
      designationAffect: null,
      direction: null,
      codeInvest: scan.barcode,
      designation: null,
      specification: null,
      originalEtat: null,
      readerEtat: scan.etat,
      readerBt: scan.affect,
      readerDate: scan.dateHeureEntree,
      status: 'Nouveau'
    });
  }

  return results;
}
