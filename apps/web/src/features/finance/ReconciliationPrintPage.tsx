import { ArrowRight, FileSpreadsheet, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/lib/mutations';
import { useCompany, type CompanySettings } from './account-api';
import { CURRENCIES } from './api';
import { useReconciliation, type Reconciliation } from './close-api';
import { logoImage, SheetWriter } from './report-excel';
import { amount, day, Letterhead } from './StatementsPrintPage';

const LINE = '#d9d2c3';
const INK = '#141414';
const GOLD_SOFT = '#f6efdc';
const td = 'border px-2 py-1 text-start';
const cell = { borderColor: LINE };

export const reconPeriod = (r: Reconciliation) =>
  `${r.account.name} · ${CURRENCIES[r.account.currency].label} · ${r.fromDate.slice(0, 10) === r.toDate.slice(0, 10) ? `يوم ${day(r.toDate)}` : `من ${day(r.fromDate)} إلى ${day(r.toDate)}`}`;

/** The figures: our balance, what is outstanding, what the bank should hold, the difference. */
const summary = (r: Reconciliation): [string, string][] => [
  ['رصيد السيستم', r.systemBalance],
  ['(-) إيداعات لسه ما ظهرتش في البنك', r.outstandingIn],
  ['(+) شيكات ومدفوعات لسه ما اتصرفتش', r.outstandingOut],
  ['المفروض يكون في البنك', String(Number(r.systemBalance) - Number(r.outstandingIn) + Number(r.outstandingOut))],
  ['رصيد كشف البنك', r.statementBalance],
  ['الفرق', r.difference],
];

async function downloadExcel(r: Reconciliation, company: CompanySettings) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const logo = await logoImage(wb);
  const title = 'تسوية البنك';
  const ws = wb.addWorksheet(title);
  ws.views = [{ rightToLeft: true }];
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const sheet = new SheetWriter(ws, 6);
  sheet.letterhead(company, title, reconPeriod(r), [`الحالة: ${r.status === 'MATCHED' ? 'متطابقة' : 'فيها فرق'} · بواسطة ${r.createdBy}`, ...(r.note ? [`ملاحظة: ${r.note}`] : [])], logo);
  sheet.table(
    [
      { header: 'البند', width: 40 },
      { header: 'المبلغ', width: 20, money: true },
    ],
    summary(r).map(([l, v]) => [l, Number(v)]),
  );
  const lines = r.lines ?? [];
  for (const [heading, list] of [
    ['حركات ظاهرة في البنك', lines.filter((l) => l.cleared)],
    ['حركات معلّقة (لسه ما ظهرتش في البنك)', lines.filter((l) => !l.cleared)],
  ] as const) {
    sheet.heading(`${heading} (${list.length})`);
    sheet.table(
      [
        { header: 'التاريخ', width: 12, date: true },
        { header: 'المستند', width: 14 },
        { header: 'البيان', width: 40 },
        { header: 'وارد', width: 16, money: true },
        { header: 'منصرف', width: 16, money: true },
      ],
      list.map((l) => [new Date(`${l.date}T00:00:00`), l.ref, [l.description, l.party, l.fileNo].filter(Boolean).join(' · '), Number(l.amount) > 0 ? Number(l.amount) : null, Number(l.amount) < 0 ? -Number(l.amount) : null]),
    );
  }
  if (r.bankLines?.length) {
    sheet.heading(`في كشف البنك ومش في الدفاتر (${r.bankLines.length})`);
    sheet.table(
      [
        { header: 'التاريخ', width: 12 },
        { header: 'البيان', width: 40 },
        { header: 'المبلغ', width: 16, money: true },
      ],
      r.bankLines.map((b) => [day(b.date), b.description, b.amount]),
    );
  }
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title} ${r.account.name} ${r.toDate.slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function LinesTable({ title, lines }: { title: string; lines: NonNullable<Reconciliation['lines']> }) {
  return (
    <>
      <div className="mt-5 text-[13px] font-extrabold">
        {title} ({lines.length})
      </div>
      <table className="mt-1.5 w-full border-collapse">
        <thead>
          <tr style={{ background: INK, color: '#f1d27a' }}>
            {['التاريخ', 'المستند', 'البيان', 'وارد', 'منصرف'].map((h) => (
              <th key={h} className="border px-2 py-1.5 text-start font-bold" style={{ borderColor: INK }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.key} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
              <td className={`${td} whitespace-nowrap`} style={cell}>{day(l.date)}</td>
              <td className={td} style={cell} dir="ltr">{l.ref}</td>
              <td className={td} style={cell}>{[l.description, l.party, l.fileNo].filter(Boolean).join(' · ')}</td>
              <td className={`${td} text-end`} style={cell}>{Number(l.amount) > 0 ? amount(l.amount) : ''}</td>
              <td className={`${td} text-end`} style={cell}>{Number(l.amount) < 0 ? amount(-Number(l.amount)) : ''}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={5} className={`${td} text-center`} style={cell}>
                —
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}

/** A saved bank reconciliation on the company letterhead, to print, save as PDF or download as Excel. */
export default function ReconciliationPrintPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: r, error } = useReconciliation(Number(id) || null);
  const { data: company } = useCompany();
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    document.title = 'تسوية البنك';
    return () => {
      document.title = 'HAMMER LINE';
    };
  }, []);

  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;
  if (!r || !company)
    return (
      <div className="grid min-h-screen place-items-center text-gold">
        <Spinner className="size-8" />
      </div>
    );
  const ok = r.status === 'MATCHED';
  const lines = r.lines ?? [];

  return (
    <div className="report-print min-h-screen bg-neutral-300 pb-10 print:min-h-0 print:bg-white print:pb-0">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 print:hidden">
        <Link to="/general-ledger?tab=reconcile" className="flex items-center gap-1 text-sm text-muted hover:text-gold">
          <ArrowRight className="size-4" /> تسوية البنك
        </Link>
        <div className="flex-1" />
        <Button
          variant="ghost"
          icon={<FileSpreadsheet className="size-4" />}
          loading={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await downloadExcel(r, company);
            } catch (e) {
              toastError(e);
            } finally {
              setExporting(false);
            }
          }}
        >
          Excel
        </Button>
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
          طباعة / PDF
        </Button>
      </div>
      <div className="overflow-x-auto py-6 print:overflow-visible print:py-0">
        <div className="mx-auto w-fit shadow-2xl print:shadow-none">
          <Letterhead company={company} title="تسوية البنك" period={reconPeriod(r)} printedBy={user?.name ?? ''}>
            <div className="mt-3 rounded-lg px-3 py-2 text-[12px] font-bold" style={{ background: ok ? '#e8f6ec' : '#fdecec', color: ok ? '#15803d' : '#b42318' }}>
              {ok ? 'متطابقة' : `فيها فرق ${amount(Math.abs(Number(r.difference)))}`} · اتعملت بواسطة {r.createdBy} في {day(r.createdAt)}
              {r.note && <div className="mt-0.5 font-normal" style={{ color: INK }}>ملاحظة: {r.note}</div>}
            </div>
            <table className="mt-3 w-full border-collapse">
              <tbody>
                {summary(r).map(([label, v], i) => (
                  <tr key={label} style={{ background: i >= 3 ? GOLD_SOFT : '#fff', fontWeight: i >= 3 ? 800 : 400 }}>
                    <td className={td} style={cell}>{label}</td>
                    <td className={`${td} w-40 text-end`} style={cell} dir="ltr">{amount(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <LinesTable title="حركات معلّقة (لسه ما ظهرتش في البنك)" lines={lines.filter((l) => !l.cleared)} />
            <LinesTable title="حركات ظاهرة في البنك" lines={lines.filter((l) => l.cleared)} />
            {!!r.bankLines?.length && (
              <>
                <div className="mt-5 text-[13px] font-extrabold">في كشف البنك ومش في الدفاتر ({r.bankLines.length})</div>
                <table className="mt-1.5 w-full border-collapse">
                  <tbody>
                    {r.bankLines.map((b, i) => (
                      <tr key={i}>
                        <td className={`${td} whitespace-nowrap`} style={cell}>{day(b.date)}</td>
                        <td className={td} style={cell}>{b.description}</td>
                        <td className={`${td} text-end`} style={cell} dir="ltr">{amount(b.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <div className="mt-10 grid grid-cols-3 gap-6 text-center text-[11px]">
              {['أعدّها', 'راجعها', 'اعتمدها'].map((s) => (
                <div key={s}>
                  <div className="font-bold">{s}</div>
                  <div className="mx-auto mt-8 w-4/5 border-t" style={{ borderColor: INK }} />
                </div>
              ))}
            </div>
          </Letterhead>
        </div>
      </div>
    </div>
  );
}
