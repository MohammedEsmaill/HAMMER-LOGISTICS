import type { ClientAccount, ClientLedger, CompanySettings } from './account-api';
import { CURRENCIES } from './api';
import { logoImage, SheetWriter, type Col } from './report-excel';

const n = (v: string | number) => Number(v);
const day = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`);

export function statementPeriod(l: Pick<ClientLedger, 'from' | 'to'>) {
  if (!l.from && !l.to) return 'كل الفترات';
  return `الفترة: ${l.from ? `من ${l.from.slice(0, 10)}` : 'من البداية'} ${l.to ? `إلى ${l.to.slice(0, 10)}` : 'حتى اليوم'}`;
}

const STATEMENT: Col[] = [
  { header: 'التاريخ', width: 12, date: true },
  { header: 'النوع', width: 24 },
  { header: 'رقم المستند', width: 18 },
  { header: 'الملف', width: 12 },
  { header: 'مدين', width: 15, money: true },
  { header: 'دائن', width: 15, money: true },
  { header: 'الرصيد', width: 16, money: true },
];

/** The client statement as an .xlsx on the company letterhead, one currency. */
export async function downloadClientStatementExcel(ledger: ClientLedger, a: ClientAccount, company: CompanySettings) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = company.name;
  wb.created = new Date();
  const logo = await logoImage(wb);
  const cur = CURRENCIES[a.currency].label;
  const title = `كشف حساب ${ledger.client.name}`;
  const ws = wb.addWorksheet('كشف الحساب');
  ws.views = [{ rightToLeft: true }];
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  ws.headerFooter = { oddFooter: `&C${title} — صفحة &P من &N` };
  const sheet = new SheetWriter(ws, STATEMENT.length);
  sheet.letterhead(company, title, `${statementPeriod(ledger)} — بال${cur}`, [`الأرصدة على المستندات المعتمدة فقط  ·  ${new Date(ledger.generatedAt).toLocaleString('en-GB')}`], logo);

  sheet.heading('الملخص');
  sheet.table(
    [
      { header: 'إجمالي الفواتير', width: 15, money: true },
      { header: 'إجمالي التحصيل', width: 15, money: true },
      { header: 'الرصيد', width: 16, money: true },
      { header: 'حتى 30 يوم', width: 15, money: true },
      { header: '31 – 60', width: 15, money: true },
      { header: '61 – 90', width: 15, money: true },
      { header: 'أكثر من 90', width: 16, money: true },
    ],
    [[n(a.summary.billed), n(a.summary.collected), n(a.summary.balance), n(a.aging.upTo30), n(a.aging.from31To60), n(a.aging.from61To90), n(a.aging.over90)]],
  );

  sheet.heading('كشف الحساب');
  sheet.table(
    STATEMENT,
    [
      [null, 'رصيد أول المدة', '', '', null, null, n(a.statement.opening)],
      ...a.statement.lines.map((l) => [day(l.date), l.label, l.ref ?? '', l.fileNo, n(l.debit) || null, n(l.credit) || null, n(l.balance ?? 0)]),
    ],
    [[null, 'الإجمالي', '', '', n(a.statement.debit), n(a.statement.credit), n(a.statement.closing)]],
    [null, null, null, null, 'out', 'in', null],
  );

  if (a.shipments.length) {
    sheet.heading('حسب الشحنة');
    sheet.table(
      [
        { header: 'الملف', width: 12 },
        { header: 'حساب الشحنة', width: 24 },
        { header: 'المفوتر', width: 18, money: true },
        { header: 'المحصّل', width: 12, money: true },
        { header: 'الباقي', width: 15, money: true },
        { header: 'أقدم مستحق (يوم)', width: 15 },
      ],
      a.shipments.map((s) => [s.fileNo, s.accountStatus === 'FINISHED' ? 'منتهي' : 'مفتوح', n(s.billed), n(s.collected), n(s.remaining), s.ageDays ?? '']),
    );
  }

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title} (${cur}).xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
