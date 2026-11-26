import { api } from '@/lib/api-client';
import type { CompanySettings } from './account-api';
import type { BalanceSheet, GlPeriod, IncomeStatement, StatementSection, TrialBalance, VatReport } from './gl-api';
import { logoImage, SheetWriter, type Cell, type Col } from './report-excel';
import { STATEMENT_TITLES, type StatementKind } from './StatementsPrintPage';

const n = Number;
const fmt = (v: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const indent = (name: string, level: number) => `${'   '.repeat(Math.max(0, level))}${name}`;
const query = (p: GlPeriod, extra: Record<string, string> = {}) =>
  new URLSearchParams(Object.entries({ currency: p.currency, from: p.from, to: p.to, ...extra }).filter(([, v]) => v) as [string, string][]).toString();

/** A statement as an .xlsx on the company letterhead, with the same lines as the printed page. */
export async function downloadStatementExcel(kind: StatementKind, period: GlPeriod, company: CompanySettings, periodText: string) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const logo = await logoImage(wb);
  const title = STATEMENT_TITLES[kind];
  const ws = wb.addWorksheet(title);
  ws.views = [{ rightToLeft: true }];
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const span = kind === 'vat' ? 8 : kind === 'trial' ? 6 : 4;
  const sheet = new SheetWriter(ws, span);
  sheet.letterhead(company, title, periodText, [new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo' })], logo);

  const section = (heading: string, s: StatementSection, totalLabel: string) => {
    const cols: Col[] = [
      { header: 'الكود', width: 10 },
      { header: heading, width: 46 },
      { header: 'المبلغ', width: 20, money: true },
    ];
    sheet.table(
      cols,
      s.lines.map((l) => [l.code, indent(l.name, l.level), n(l.amount)]),
      [['', totalLabel, n(s.total)]],
    );
  };

  if (kind === 'trial') {
    const tb = await api.get<TrialBalance>(`/finance/gl/trial-balance?${query(period)}`);
    const ranged = !!period.from;
    const cols: Col[] = [
      { header: 'الكود', width: 10 },
      { header: 'الحساب', width: 44 },
      ...(ranged ? [{ header: 'أول المدة', width: 18, money: true }] : []),
      { header: 'مدين', width: 18, money: true },
      { header: 'دائن', width: 18, money: true },
      { header: 'الرصيد', width: 18, money: true },
    ];
    sheet.table(
      cols,
      tb.lines.map((l) => [l.code, indent(l.name, l.level), ...(ranged ? [n(l.opening)] : []), n(l.debit), n(l.credit), n(l.closing)]),
      [['', 'الإجمالي', ...(ranged ? [null] : []), n(tb.totals.debit), n(tb.totals.credit), null]],
    );
  } else if (kind === 'income') {
    const s = await api.get<IncomeStatement>(`/finance/gl/income-statement?${query(period)}`);
    section('الإيرادات', s.revenues, 'إجمالي الإيرادات');
    section('المصروفات', s.expenses, 'إجمالي المصروفات');
    const net = n(s.net);
    sheet.heading(`${net >= 0 ? 'صافي الربح' : 'صافي الخسارة'}: ${fmt(Math.abs(net))}${net > 0 && s.margin ? ` (${s.margin}% من الإيرادات)` : ''}`);
  } else if (kind === 'balance') {
    const b = await api.get<BalanceSheet>(`/finance/gl/balance-sheet?${new URLSearchParams({ currency: period.currency, ...(period.to ? { asOf: period.to } : {}) })}`);
    section('الأصول', b.assets, 'إجمالي الأصول');
    section('الالتزامات', b.liabilities, 'إجمالي الالتزامات');
    section('حقوق الملكية', b.equity, 'إجمالي حقوق الملكية');
    sheet.heading(`الالتزامات + حقوق الملكية: ${fmt(n(b.totalLiabilitiesAndEquity))}`);
  } else {
    const v = await api.get<VatReport>(`/finance/gl/vat?${query(period)}`);
    sheet.heading('حسب النسبة');
    sheet.table(
      [
        { header: 'النسبة', width: 12 },
        { header: 'عدد الفواتير', width: 14 },
        { header: 'قبل الضريبة', width: 18, money: true },
        { header: 'الضريبة', width: 18, money: true },
        { header: 'الإجمالي', width: 18, money: true },
      ],
      v.rates.map((r) => [`${n(r.rate)}%`, r.count, n(r.subtotal), n(r.vat), n(r.total)]),
      [['الإجمالي', v.totals.count, n(v.totals.subtotal), n(v.totals.vat), n(v.totals.total)]],
    );
    sheet.heading('الفواتير');
    const rows: Cell[][] = v.invoices.map((i) => [
      new Date(`${i.date.slice(0, 10)}T00:00:00`),
      i.invoiceNo,
      i.client,
      i.fileNo,
      `${n(i.rate)}%`,
      n(i.subtotal),
      n(i.vat),
      n(i.total),
    ]);
    sheet.table(
      [
        { header: 'التاريخ', width: 12, date: true },
        { header: 'رقم الفاتورة', width: 16 },
        { header: 'العميل', width: 28 },
        { header: 'الملف', width: 14 },
        { header: 'النسبة', width: 9 },
        { header: 'قبل الضريبة', width: 16, money: true },
        { header: 'الضريبة', width: 14, money: true },
        { header: 'الإجمالي', width: 16, money: true },
      ],
      rows,
    );
  }

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
