import type { Workbook, Worksheet } from 'exceljs';
import type { CompanySettings } from './account-api';
import { CURRENCIES, STATUS, type Currency } from './api';
import { JOURNAL_TYPES, type JournalRow, type JournalTotals } from './journal-api';
import { REPORT_KINDS, type AccountsReport, type ExpensesReport, type JournalReport, type Report } from './report-api';

const INK = 'FF141414';
const GOLD = 'FFD4A73C';
const GOLD_DARK = 'FFA8791F';
const GOLD_SOFT = 'FFF6EFDC';
const ZEBRA = 'FFFAF8F3';
const LINE = 'FFD9D2C3';
const IN = 'FF15803D';
const OUT = 'FFB91C1C';
const MONEY = '#,##0.00';

interface Col {
  header: string;
  width: number;
  money?: boolean;
  date?: boolean;
}

type Cell = string | number | Date | null;

const thin = { style: 'thin' as const, color: { argb: LINE } };
const box = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
const n = (v: string | number) => Number(v);
const day = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`);

/**
 * Builds the sheets of a report on the company's letterhead: the company and the logo,
 * the report title, period and filters, then styled tables with totals.
 */
class SheetWriter {
  row = 1;
  readonly ws: Worksheet;
  readonly span: number;

  constructor(ws: Worksheet, span: number) {
    this.ws = ws;
    this.span = span;
  }

  /** Company block, title, period, filters; returns the next free row. */
  letterhead(company: CompanySettings, title: string, period: string, lines: string[], logo: number | null) {
    const ws = this.ws;
    const merge = (r: number) => ws.mergeCells(r, 1, r, Math.max(2, this.span - 2));
    const put = (r: number, value: string, font: object) => {
      merge(r);
      const c = ws.getCell(r, 1);
      c.value = value;
      c.font = font;
      c.alignment = { horizontal: 'right', vertical: 'middle' };
    };
    put(1, company.name, { bold: true, size: 15, color: { argb: INK } });
    put(2, company.address, { size: 10 });
    put(3, `الرقم الضريبي: ${company.taxNumber}    السجل التجاري: ${company.crNumber}`, { size: 10 });
    put(4, company.emails.join('  ·  '), { size: 10, color: { argb: 'FF555555' } });
    if (logo !== null) {
      ws.addImage(logo, { tl: { col: this.span - 2, row: 0 }, ext: { width: 150, height: 72 } });
    }
    for (let c = 1; c <= this.span; c++) ws.getCell(5, c).border = { bottom: { style: 'medium', color: { argb: GOLD_DARK } } };
    ws.getRow(5).height = 6;

    put(7, title, { bold: true, size: 17, color: { argb: INK } });
    ws.getRow(7).height = 26;
    put(8, period, { bold: true, size: 11, color: { argb: GOLD_DARK } });
    lines.forEach((l, i) => put(9 + i, l, { size: 10, color: { argb: 'FF555555' } }));
    this.row = 10 + lines.length;
  }

  heading(text: string) {
    const ws = this.ws;
    ws.mergeCells(this.row, 1, this.row, this.span);
    const c = ws.getCell(this.row, 1);
    c.value = text;
    c.font = { bold: true, size: 12, color: { argb: INK } };
    c.fill = fill(GOLD_SOFT);
    c.border = { right: { style: 'thick', color: { argb: GOLD } } };
    c.alignment = { horizontal: 'right', vertical: 'middle' };
    ws.getRow(this.row).height = 22;
    this.row += 1;
  }

  /** A table: dark header row with gold text, zebra rows, money formats, total rows. */
  table(cols: Col[], rows: Cell[][], totals: Cell[][] = [], tones: ('in' | 'out' | null)[] = []) {
    const ws = this.ws;
    const headerRow = this.row;
    cols.forEach((col, i) => {
      const c = ws.getCell(headerRow, i + 1);
      c.value = col.header;
      c.font = { bold: true, color: { argb: GOLD } };
      c.fill = fill(INK);
      c.border = box;
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      const column = ws.getColumn(i + 1);
      column.width = Math.max(column.width ?? 0, col.width);
    });
    ws.getRow(headerRow).height = 22;
    this.row += 1;
    rows.forEach((r, ri) => {
      r.forEach((value, i) => {
        const c = ws.getCell(this.row, i + 1);
        c.value = value;
        c.border = box;
        c.alignment = { vertical: 'top', wrapText: !cols[i].money && !cols[i].date, horizontal: cols[i].money ? 'left' : 'right' };
        if (ri % 2) c.fill = fill(ZEBRA);
        if (cols[i].money) {
          c.numFmt = MONEY;
          const tone = tones[i];
          if (tone && typeof value === 'number' && value) c.font = { color: { argb: tone === 'in' ? IN : OUT } };
        }
        if (cols[i].date) c.numFmt = 'yyyy-mm-dd';
      });
      this.row += 1;
    });
    totals.forEach((r) => {
      r.forEach((value, i) => {
        const c = ws.getCell(this.row, i + 1);
        c.value = value;
        c.font = { bold: true };
        c.fill = fill(GOLD_SOFT);
        c.border = { ...box, top: { style: 'medium', color: { argb: GOLD_DARK } } };
        c.alignment = { horizontal: cols[i].money ? 'left' : 'right' };
        if (cols[i].money) c.numFmt = MONEY;
      });
      this.row += 1;
    });
    this.row += 1;
    return headerRow;
  }

  signatures() {
    const ws = this.ws;
    this.row += 1;
    const third = Math.max(1, Math.floor(this.span / 3));
    ['مراجعة', 'مدير الحسابات', 'الاعتماد'].forEach((label, i) => {
      const start = i * third + 1;
      const end = i === 2 ? this.span : start + third - 1;
      ws.mergeCells(this.row, start, this.row, end);
      ws.mergeCells(this.row + 1, start, this.row + 3, end);
      const head = ws.getCell(this.row, start);
      head.value = label;
      head.font = { bold: true };
      head.alignment = { horizontal: 'center' };
      head.fill = fill(GOLD_SOFT);
      head.border = box;
      ws.getCell(this.row + 1, start).border = box;
    });
    this.row += 4;
  }
}

const OPERATION_COLS: Col[] = [
  { header: 'م', width: 6 },
  { header: 'التاريخ', width: 12, date: true },
  { header: 'المرجع', width: 13 },
  { header: 'النوع', width: 14 },
  { header: 'الطرف', width: 22 },
  { header: 'البيان', width: 40 },
  { header: 'رقم الملف', width: 12 },
  { header: 'من', width: 18 },
  { header: 'إلى', width: 18 },
  { header: 'العملة', width: 8 },
  { header: 'وارد', width: 15, money: true },
  { header: 'منصرف', width: 15, money: true },
  { header: 'تحويل بين الحسابات', width: 15, money: true },
  { header: 'الحالة', width: 16 },
  { header: 'سجّلها', width: 14 },
];

function operations(sheet: SheetWriter, rows: JournalRow[], totals: JournalTotals[]) {
  const header = sheet.table(
    OPERATION_COLS,
    rows.map((r, i) => [
      i + 1,
      day(r.operationDate),
      r.ref,
      JOURNAL_TYPES[r.type].label,
      r.counterparty ?? '',
      r.description,
      r.fileNo ?? '',
      r.fromAccount?.name ?? '',
      r.toAccount?.name ?? '',
      CURRENCIES[r.currency].label,
      r.flow === 'IN' ? n(r.amount) : null,
      r.flow === 'OUT' ? n(r.amount) : null,
      r.flow === 'MOVE' ? n(r.amount) : null,
      STATUS[r.approvalStatus].label,
      r.createdBy.email.split('@')[0],
    ]),
    totals.map((t) => [
      '',
      '',
      '',
      `الإجمالي (${CURRENCIES[t.currency].label})`,
      `${t.count} معاملة`,
      '',
      '',
      '',
      '',
      CURRENCIES[t.currency].label,
      n(t.in),
      n(t.out),
      null,
      '',
      '',
    ]),
    [null, null, null, null, null, null, null, null, null, null, 'in', 'out', null, null, null],
  );
  sheet.ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: header }];
  sheet.ws.autoFilter = { from: { row: header, column: 1 }, to: { row: header + rows.length, column: OPERATION_COLS.length } };
}

function kpis(sheet: SheetWriter, totals: JournalTotals[]) {
  sheet.table(
    [
      { header: 'العملة', width: 14 },
      { header: 'وارد', width: 18, money: true },
      { header: 'منصرف', width: 18, money: true },
      { header: 'الصافي', width: 18, money: true },
      { header: 'عدد المعاملات', width: 14 },
    ],
    totals.map((t) => [CURRENCIES[t.currency].label, n(t.in), n(t.out), n(t.in) - n(t.out), t.count]),
    [],
    [null, 'in', 'out', null, null],
  );
}

function journalSheets(wb: Workbook, report: JournalReport, head: Head) {
  const summary = head(wb.addWorksheet('الملخص'), 6);
  summary.heading('ملخص التقرير');
  kpis(summary, report.summary.totals);
  summary.heading('حسب نوع المعاملة');
  summary.table(
    [
      { header: 'النوع', width: 18 },
      { header: 'العملة', width: 18 },
      { header: 'عدد', width: 18 },
      { header: 'وارد', width: 18, money: true },
      { header: 'منصرف', width: 18, money: true },
      { header: 'تحويلات بين الحسابات', width: 18, money: true },
    ],
    report.summary.byType.map((t) => [JOURNAL_TYPES[t.type].label, CURRENCIES[t.currency].label, t.count, n(t.in) || null, n(t.out) || null, n(t.moved) || null]),
    [],
    [null, null, null, 'in', 'out', null],
  );
  summary.signatures();
  const detail = head(wb.addWorksheet('التفاصيل'), OPERATION_COLS.length);
  detail.heading('التفاصيل');
  operations(detail, report.rows, report.summary.totals);
}

function expensesSheets(wb: Workbook, report: ExpensesReport, head: Head) {
  const summary = head(wb.addWorksheet('الملخص'), 5);
  summary.heading('ملخص التقرير: المصاريف حسب البند');
  const totals = new Map(report.summary.totals.map((t) => [t.currency, n(t.out)]));
  summary.table(
    [
      { header: 'بند المصروف', width: 28 },
      { header: 'العملة', width: 12 },
      { header: 'عدد', width: 10 },
      { header: 'الإجمالي', width: 18, money: true },
      { header: 'النسبة %', width: 12 },
    ],
    report.summary.byItem.map((b) => [
      b.name,
      CURRENCIES[b.currency].label,
      b.count,
      n(b.total),
      totals.get(b.currency) ? Math.round((n(b.total) / totals.get(b.currency)!) * 1000) / 10 : null,
    ]),
    report.summary.totals.map((t) => [`الإجمالي (${CURRENCIES[t.currency].label})`, CURRENCIES[t.currency].label, t.count, n(t.out), 100]),
  );
  summary.signatures();
  const detail = head(wb.addWorksheet('التفاصيل'), OPERATION_COLS.length);
  detail.heading('التفاصيل');
  operations(detail, report.rows, report.summary.totals);
}

function accountsSheets(wb: Workbook, report: AccountsReport, head: Head) {
  const summary = head(wb.addWorksheet('الملخص'), 6);
  summary.heading('ملخص التقرير: الخزن والحسابات البنكية');
  const cols: Col[] = [
    { header: 'الخزنة / الحساب', width: 28 },
    { header: 'العملة', width: 10 },
    { header: 'رصيد أول المدة', width: 18, money: true },
    { header: 'وارد', width: 18, money: true },
    { header: 'منصرف', width: 18, money: true },
    { header: 'رصيد آخر المدة', width: 18, money: true },
  ];
  for (const c of ['EGP', 'USD'] as Currency[]) {
    const list = report.summary.accounts.filter((a) => a.account.currency === c);
    if (!list.length) continue;
    const sum = (k: 'opening' | 'in' | 'out' | 'closing') => list.reduce((s, a) => s + n(a[k]), 0);
    summary.table(
      cols,
      list.map((a) => [a.account.name, CURRENCIES[c].label, n(a.opening), n(a.in), n(a.out), n(a.closing)]),
      [[`إجمالي ${CURRENCIES[c].label}`, CURRENCIES[c].label, sum('opening'), sum('in'), sum('out'), sum('closing')]],
      [null, null, null, 'in', 'out', null],
    );
  }
  summary.signatures();

  const lineCols: Col[] = [
    { header: 'التاريخ', width: 12, date: true },
    { header: 'المرجع', width: 14 },
    { header: 'النوع', width: 14 },
    { header: 'الطرف', width: 22 },
    { header: 'البيان', width: 40 },
    { header: 'وارد', width: 16, money: true },
    { header: 'منصرف', width: 16, money: true },
    { header: 'الرصيد', width: 18, money: true },
  ];
  const detail = head(wb.addWorksheet('التفاصيل'), lineCols.length);
  for (const a of report.accounts) {
    detail.heading(`${a.account.name}${a.account.bankName ? ` · ${a.account.bankName} ${a.account.accountNumber}` : ''} (${CURRENCIES[a.account.currency].label})`);
    detail.table(
      lineCols,
      [
        [null, '', '', '', 'رصيد أول المدة', null, null, n(a.opening)],
        ...a.lines.map((l) => [
          day(l.date),
          l.ref ?? '',
          `${l.reversal ? 'قيد عكسي · ' : ''}${JOURNAL_TYPES[l.source]?.label ?? l.source}`,
          l.counterparty ?? '',
          l.description ?? '',
          l.direction === 'IN' ? n(l.amount) : null,
          l.direction === 'OUT' ? n(l.amount) : null,
          n(l.balance),
        ]),
      ],
      [['', '', '', `${a.lines.length} حركة`, 'الإجمالي ورصيد آخر المدة', n(a.in), n(a.out), n(a.closing)]],
      [null, null, null, null, null, 'in', 'out', null],
    );
  }
  detail.ws.views = [{ rightToLeft: true }];
}

type Head = (ws: Worksheet, span: number) => SheetWriter;

async function logoImage(wb: Workbook): Promise<number | null> {
  try {
    const blob = await (await fetch('/logo-full.png')).blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return wb.addImage({ base64, extension: 'png' });
  } catch {
    return null; // the sheets are still useful without the logo
  }
}

/** The report as an .xlsx: a summary sheet and a detail sheet, right to left. */
export async function downloadReportExcel(report: Report, company: CompanySettings, filters: string[], generatedBy: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = company.name;
  wb.created = new Date();
  const logo = await logoImage(wb);
  const title = REPORT_KINDS[report.kind].title;
  const period = `الفترة: من ${report.from.slice(0, 10)} إلى ${report.to.slice(0, 10)}`;
  const meta = [
    ...(filters.length ? [filters.join('  ·  ')] : []),
    `طلّعه: ${generatedBy}  ·  ${new Date(report.generatedAt).toLocaleString('ar-EG')}`,
    ...(report.truncated ? ['التقرير كبير، واتعرض أول 20,000 سطر بس.'] : []),
  ];
  const head: Head = (ws, span) => {
    ws.views = [{ rightToLeft: true }];
    ws.pageSetup = { paperSize: 9, orientation: span > 8 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    ws.headerFooter = { oddFooter: `&C${title} — صفحة &P من &N` };
    const sheet = new SheetWriter(ws, span);
    sheet.letterhead(company, title, period, meta, logo);
    return sheet;
  };

  if (report.kind === 'journal') journalSheets(wb, report, head);
  else if (report.kind === 'expenses') expensesSheets(wb, report, head);
  else accountsSheets(wb, report, head);

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title} ${report.from.slice(0, 10)} - ${report.to.slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
