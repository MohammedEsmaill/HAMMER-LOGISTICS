import type { BankLine, ReconLine } from './close-api';

/**
 * Reading a bank statement exported as Excel (.xlsx) or CSV, whatever the bank: the
 * header row is found by its words (Arabic or English), then each row becomes a dated,
 * signed amount (+ into the account, − out of it), with the running balance if given.
 */

export type ColumnRole = 'date' | 'description' | 'debit' | 'credit' | 'amount' | 'balance';

export const COLUMN_ROLES: Record<ColumnRole, string> = {
  date: 'التاريخ',
  description: 'البيان',
  debit: 'مدين / سحب',
  credit: 'دائن / إيداع',
  amount: 'المبلغ (بالإشارة)',
  balance: 'الرصيد',
};

const WORDS: Record<ColumnRole, RegExp> = {
  date: /(تاريخ|date|value ?date|posting|التاريخ)/i,
  description: /(بيان|وصف|تفاصيل|description|details|narrative|particulars|remarks|reference|البيان)/i,
  debit: /(مدين|سحب|مسحوب|خصم|debit|withdraw|dr\b|out)/i,
  credit: /(دائن|إيداع|ايداع|مودع|إضافة|credit|deposit|cr\b|in\b)/i,
  amount: /^(المبلغ|مبلغ|amount|value)$/i,
  balance: /(رصيد|balance)/i,
};

export interface Sheet {
  rows: unknown[][];
}

export interface Mapping {
  headerRow: number;
  columns: Partial<Record<ColumnRole, number>>;
  headers: string[];
}

export async function readStatement(file: File): Promise<Sheet> {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
    return { rows: text.split(/\r?\n/).filter((l) => l.trim()).map((l) => splitCsv(l, sep)) };
  }
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets.find((w) => w.rowCount > 1) ?? wb.worksheets[0];
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as unknown[]).slice(1).map((v) => {
      if (v && typeof v === 'object') {
        const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
        if (o.result !== undefined) return o.result;
        if (o.richText) return o.richText.map((r) => r.text).join('');
        if (o.text !== undefined) return o.text;
      }
      return v;
    });
    rows.push(values);
  });
  return { rows };
}

function splitCsv(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** The header row and which column plays which part, guessed from the words. */
export function guessMapping(sheet: Sheet): Mapping | null {
  for (let r = 0; r < Math.min(sheet.rows.length, 40); r++) {
    const headers = sheet.rows[r].map((v) => String(v ?? '').trim());
    const columns: Partial<Record<ColumnRole, number>> = {};
    const used = new Set<number>();
    // the specific ones first, so «الرصيد» is not taken for an amount
    for (const role of ['balance', 'date', 'debit', 'credit', 'amount', 'description'] as ColumnRole[]) {
      const i = headers.findIndex((h, idx) => !used.has(idx) && h && WORDS[role].test(h));
      if (i >= 0) {
        columns[role] = i;
        used.add(i);
      }
    }
    if (columns.date !== undefined && (columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined))
      return { headerRow: r, columns, headers };
  }
  return null;
}

/** 1,234.50 · (1,234.50) · 1.234,50- · "١٢٣" → a number, or null */
export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  let s = String(v)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\d.,()\-+]/g, '')
    .trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s) || s.endsWith('-') || s.startsWith('-')) neg = true;
  s = s.replace(/[()+-]/g, '');
  // 1.234,50 → 1234.50 ; 1,234.50 → 1234.50
  if (/,\d{1,2}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** A Date, an Excel day number, 26/11/2026, 2026-11-26, 26-Nov-2026 → "2026-11-26", or null */
export function toDay(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  m = s.match(/^(\d{1,2})[- ]([a-z]{3})[a-z]*[- ](\d{2,4})/i);
  if (m) {
    const mo = months.indexOf(m[2].toLowerCase()) + 1;
    if (mo) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

/** The statement's rows as signed amounts, the rows that are not movements left out. */
export function statementLines(sheet: Sheet, map: Mapping): BankLine[] {
  const c = map.columns;
  const out: BankLine[] = [];
  for (const row of sheet.rows.slice(map.headerRow + 1)) {
    const date = c.date !== undefined ? toDay(row[c.date]) : null;
    if (!date) continue;
    let amount: number | null = null;
    if (c.amount !== undefined) amount = toNumber(row[c.amount]);
    else {
      const debit = c.debit !== undefined ? Math.abs(toNumber(row[c.debit]) ?? 0) : 0;
      const credit = c.credit !== undefined ? Math.abs(toNumber(row[c.credit]) ?? 0) : 0;
      amount = credit - debit;
    }
    if (!amount) continue;
    out.push({
      date,
      description: c.description !== undefined ? String(row[c.description] ?? '').trim() : '',
      amount: Math.round(amount * 100) / 100,
      balance: c.balance !== undefined ? toNumber(row[c.balance]) : null,
    });
  }
  return out;
}

/** The statement's closing balance: the balance on its last row, if it has one. */
export function closingBalance(lines: BankLine[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].balance !== null && lines[i].balance !== undefined) return lines[i].balance!;
  return null;
}

export interface MatchResult {
  /** our line key → the statement row it matched */
  matched: Map<string, BankLine>;
  /** statement rows found nowhere in our books */
  unmatched: BankLine[];
}

const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
const digits = (s: string): string[] => s.match(/\d{3,}/g) ?? [];

/**
 * Pairs each statement row with one of our open lines: the same amount and sign, within
 * the window of days, preferring a shared cheque/reference number, then the nearest date.
 * Each line pairs once.
 */
export function matchStatement(bank: BankLine[], ours: ReconLine[], windowDays = 7): MatchResult {
  const matched = new Map<string, BankLine>();
  const unmatched: BankLine[] = [];
  const free = ours.map((l) => ({ line: l, amount: Number(l.amount), nums: digits(`${l.ref} ${l.description}`) }));
  // the rows with fewer candidates first, so a sure pair is not taken by an unsure one
  const rows = bank
    .map((b) => ({ b, n: free.filter((f) => Math.abs(f.amount - b.amount) < 0.005).length }))
    .sort((x, y) => x.n - y.n)
    .map((x) => x.b);
  for (const b of rows) {
    const bNums = digits(b.description);
    let best: (typeof free)[number] | null = null;
    let bestScore = Infinity;
    for (const f of free) {
      if (matched.has(f.line.key) || Math.abs(f.amount - b.amount) >= 0.005) continue;
      const gap = days(f.line.date, b.date);
      if (gap > windowDays) continue;
      const shared = bNums.some((n) => f.nums.includes(n));
      const score = gap - (shared ? 100 : 0);
      if (score < bestScore) {
        best = f;
        bestScore = score;
      }
    }
    if (best) matched.set(best.line.key, b);
    else unmatched.push(b);
  }
  return { matched, unmatched };
}
