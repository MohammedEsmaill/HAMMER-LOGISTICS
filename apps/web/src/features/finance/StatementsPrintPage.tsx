import { ArrowRight, FileSpreadsheet, Printer } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Spinner } from '@/components/ui/Spinner';
import { AR } from '@/lib/format';
import { toastError } from '@/lib/mutations';
import { useCompany, type CompanySettings } from './account-api';
import { CURRENCIES, type Currency } from './api';
import {
  useBalanceSheet,
  useIncomeStatement,
  useTrialBalance,
  useVatReport,
  type GlPeriod,
  type StatementSection,
} from './gl-api';

export type StatementKind = 'trial' | 'income' | 'balance' | 'vat';

export const STATEMENT_TITLES: Record<StatementKind, string> = {
  trial: 'ميزان المراجعة',
  income: 'قائمة الدخل',
  balance: 'الميزانية العمومية',
  vat: 'تقرير ضريبة القيمة المضافة',
};

const INK = '#141414';
const GOLD = '#a8791f';
const GOLD_SOFT = '#f6efdc';
const LINE = '#d9d2c3';
const RED = '#b42318';

/** 2026-11-15 → 15/11/2026 */
export const day = (v: string | null | undefined) => (v ? v.slice(0, 10).split('-').reverse().join('/') : '');
export const amount = (v: string | number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));

/** The period in words: «من 01/11/2026 إلى 30/11/2026», «في 30/11/2026» for the balance sheet. */
export function periodText(kind: StatementKind, p: GlPeriod) {
  const currency = `دفاتر ال${CURRENCIES[p.currency].label}`;
  if (kind === 'balance') return `${currency} · في ${p.to ? day(p.to) : day(new Date().toISOString())}`;
  const range =
    p.from && p.to ? `من ${day(p.from)} إلى ${day(p.to)}` : p.from ? `من ${day(p.from)} حتى اليوم` : p.to ? `من أول التشغيل حتى ${day(p.to)}` : 'من أول التشغيل حتى اليوم';
  return `${currency} · ${range}`;
}

const td = 'border px-2 py-1 text-start';
const cell = { borderColor: LINE };
const num = (v: string) => (
  <span style={{ color: Number(v) < 0 ? RED : undefined }} dir="ltr">
    {Number(v) === 0 ? '—' : amount(v)}
  </span>
);

function Head({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr style={{ background: INK, color: '#f1d27a' }}>
        {cols.map((h, i) => (
          <th key={h} className={`border px-2 py-1.5 font-bold ${i > 1 ? 'text-end' : 'text-start'}`} style={{ borderColor: INK }}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function TotalRow({ label, values, span }: { label: string; values: string[]; span: number }) {
  return (
    <tr style={{ background: GOLD_SOFT, fontWeight: 800 }}>
      <td className={td} style={cell} colSpan={span}>
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className={`${td} text-end`} style={cell}>
          {v === '' ? '' : num(v)}
        </td>
      ))}
    </tr>
  );
}

/** A statement block: code, name indented under its group, amount, then its total. */
function SectionTable({ title, section, totalLabel }: { title: string; section: StatementSection; totalLabel: string }) {
  return (
    <table className="mt-3 w-full border-collapse">
      <Head cols={['الكود', title, 'المبلغ']} />
      <tbody>
        {section.lines.map((l) => (
          <tr key={l.key} style={{ fontWeight: l.group ? 700 : 400, background: l.group ? '#faf8f3' : '#fff' }}>
            <td className={`${td} w-16`} style={cell} dir="ltr">
              {l.code}
            </td>
            <td className={td} style={{ ...cell, paddingInlineStart: `${0.5 + l.level * 1}rem` }}>
              {l.name}
            </td>
            <td className={`${td} w-36 text-end`} style={cell}>
              {num(l.amount)}
            </td>
          </tr>
        ))}
        <TotalRow label={totalLabel} values={[section.total]} span={2} />
      </tbody>
    </table>
  );
}

function TrialBody({ period }: { period: GlPeriod }) {
  const { data } = useTrialBalance(period);
  if (!data) return <Spinner className="mx-auto my-10 size-7" />;
  const ranged = !!period.from;
  const cols = ['الكود', 'الحساب', ...(ranged ? ['أول المدة'] : []), 'مدين', 'دائن', 'الرصيد'];
  return (
    <table className="mt-4 w-full border-collapse">
      <Head cols={cols} />
      <tbody>
        {data.lines.map((l) => (
          <tr key={l.key} style={{ fontWeight: l.group ? 700 : 400, background: l.level === 0 ? GOLD_SOFT : l.group ? '#faf8f3' : '#fff' }}>
            <td className={`${td} w-14`} style={cell} dir="ltr">
              {l.code}
            </td>
            <td className={td} style={{ ...cell, paddingInlineStart: `${0.5 + l.level * 1}rem` }}>
              {l.name}
            </td>
            {ranged && <td className={`${td} text-end`} style={cell}>{num(l.opening)}</td>}
            <td className={`${td} text-end`} style={cell}>{num(l.debit)}</td>
            <td className={`${td} text-end`} style={cell}>{num(l.credit)}</td>
            <td className={`${td} text-end`} style={cell}>{num(l.closing)}</td>
          </tr>
        ))}
        <TotalRow label="الإجمالي" values={[data.totals.debit, data.totals.credit, '']} span={ranged ? 3 : 2} />
      </tbody>
    </table>
  );
}

function IncomeBody({ period }: { period: GlPeriod }) {
  const { data } = useIncomeStatement(period);
  if (!data) return <Spinner className="mx-auto my-10 size-7" />;
  const net = Number(data.net);
  return (
    <>
      <SectionTable title="الإيرادات" section={data.revenues} totalLabel="إجمالي الإيرادات" />
      <SectionTable title="المصروفات" section={data.expenses} totalLabel="إجمالي المصروفات" />
      <div className="mt-3 flex justify-between rounded-lg px-4 py-2.5 text-[13px] font-extrabold" style={{ background: INK, color: '#f1d27a' }}>
        <span>
          {net >= 0 ? 'صافي الربح' : 'صافي الخسارة'}
          {net > 0 && data.margin && ` (${data.margin}% من الإيرادات)`}
        </span>
        <span dir="ltr">{amount(Math.abs(net))}</span>
      </div>
    </>
  );
}

function BalanceBody({ period }: { period: GlPeriod }) {
  const { data } = useBalanceSheet(period);
  if (!data) return <Spinner className="mx-auto my-10 size-7" />;
  return (
    <>
      <SectionTable title="الأصول" section={data.assets} totalLabel="إجمالي الأصول" />
      <SectionTable title="الالتزامات" section={data.liabilities} totalLabel="إجمالي الالتزامات" />
      <SectionTable title="حقوق الملكية" section={data.equity} totalLabel="إجمالي حقوق الملكية" />
      <div className="mt-3 flex justify-between rounded-lg px-4 py-2.5 text-[13px] font-extrabold" style={{ background: INK, color: '#f1d27a' }}>
        <span>الالتزامات + حقوق الملكية</span>
        <span dir="ltr">{amount(data.totalLiabilitiesAndEquity)}</span>
      </div>
      {!data.balanced && <div className="mt-2 font-bold" style={{ color: RED }}>تنبيه: الميزانية مش متزنة</div>}
    </>
  );
}

function VatBody({ period }: { period: GlPeriod }) {
  const { data } = useVatReport(period);
  if (!data) return <Spinner className="mx-auto my-10 size-7" />;
  return (
    <>
      <table className="mt-4 w-full border-collapse">
        <Head cols={['النسبة', 'عدد الفواتير', 'قبل الضريبة', 'الضريبة', 'الإجمالي']} />
        <tbody>
          {data.rates.map((r) => (
            <tr key={r.rate}>
              <td className={`${td} font-bold`} style={cell}>{Number(r.rate)}%</td>
              <td className={td} style={cell}>{r.count}</td>
              <td className={`${td} text-end`} style={cell}>{num(r.subtotal)}</td>
              <td className={`${td} text-end font-bold`} style={cell}>{num(r.vat)}</td>
              <td className={`${td} text-end`} style={cell}>{num(r.total)}</td>
            </tr>
          ))}
          <tr style={{ background: GOLD_SOFT, fontWeight: 800 }}>
            <td className={td} style={cell}>الإجمالي</td>
            <td className={td} style={cell}>{data.totals.count}</td>
            <td className={`${td} text-end`} style={cell}>{num(data.totals.subtotal)}</td>
            <td className={`${td} text-end`} style={cell}>{num(data.totals.vat)}</td>
            <td className={`${td} text-end`} style={cell}>{num(data.totals.total)}</td>
          </tr>
        </tbody>
      </table>
      {data.invoices.length > 0 && (
        <>
          <div className="mt-5 text-[13px] font-extrabold">الفواتير</div>
          <table className="mt-1.5 w-full border-collapse">
            <Head cols={['التاريخ', 'رقم الفاتورة', 'العميل', 'الملف', 'النسبة', 'قبل الضريبة', 'الضريبة', 'الإجمالي']} />
            <tbody>
              {data.invoices.map((i, n) => (
                <tr key={i.id} style={{ background: n % 2 ? '#faf8f3' : '#fff' }}>
                  <td className={`${td} whitespace-nowrap`} style={cell}>{day(i.date)}</td>
                  <td className={td} style={cell} dir="ltr">{i.invoiceNo}</td>
                  <td className={td} style={cell}>{i.client}</td>
                  <td className={td} style={cell} dir="ltr">{i.fileNo}</td>
                  <td className={`${td} text-end`} style={cell}>{Number(i.rate)}%</td>
                  <td className={`${td} text-end`} style={cell}>{num(i.subtotal)}</td>
                  <td className={`${td} text-end`} style={cell}>{num(i.vat)}</td>
                  <td className={`${td} text-end`} style={cell}>{num(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

export function Letterhead({ company, title, period, printedBy, children }: { company: CompanySettings; title: string; period: string; printedBy: string; children: ReactNode }) {
  return (
    <div className="report-page mx-auto bg-white px-8 py-7 text-[11px] leading-relaxed" dir="rtl" style={{ width: '210mm', minHeight: '297mm', color: INK }}>
      <header className="flex items-start justify-between gap-6 border-b-4 pb-3" style={{ borderColor: GOLD }}>
        <div className="space-y-0.5">
          <div className="text-[17px] font-extrabold">{company.name}</div>
          <div>{company.address}</div>
        </div>
        <img src="/logo-full.png" alt="" className="h-16 w-auto object-contain" />
      </header>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-extrabold">{title}</h1>
          <div className="mt-0.5" style={{ color: '#6f685a' }}>{period}</div>
        </div>
        <div className="rounded-lg px-3 py-2 text-[10.5px]" style={{ background: GOLD_SOFT }}>
          <div>
            طُبع بواسطة: <b>{printedBy}</b>
          </div>
          <div>في: {new Intl.DateTimeFormat(AR, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * A financial statement on the company letterhead (the kind, currency and period come
 * from the address), to print or save as PDF, or download as Excel.
 */
export default function StatementsPrintPage() {
  const [params] = useSearchParams();
  const kind = (params.get('view') as StatementKind) in STATEMENT_TITLES ? (params.get('view') as StatementKind) : 'trial';
  const period: GlPeriod = {
    currency: (params.get('currency') === 'USD' ? 'USD' : 'EGP') as Currency,
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  };
  const { user } = useAuth();
  const { data: company, error } = useCompany();
  const [exporting, setExporting] = useState(false);
  const title = STATEMENT_TITLES[kind];
  const text = periodText(kind, period);
  const printedBy = user?.name ?? '';

  useEffect(() => {
    document.title = title;
    return () => {
      document.title = 'HAMMER LINE';
    };
  }, [title]);

  const excel = async () => {
    if (!company) return;
    setExporting(true);
    try {
      const { downloadStatementExcel } = await import('./statements-excel');
      await downloadStatementExcel(kind, period, company, text);
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;
  if (!company) {
    return (
      <div className="grid min-h-screen place-items-center text-gold">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="report-print min-h-screen bg-neutral-300 pb-10 print:min-h-0 print:bg-white print:pb-0">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 print:hidden">
        <Link to="/general-ledger" className="flex items-center gap-1 text-sm text-muted hover:text-gold">
          <ArrowRight className="size-4" /> الحسابات العامة
        </Link>
        <span className="text-sm text-muted">· {title}</span>
        <div className="flex-1" />
        <Button variant="ghost" icon={<FileSpreadsheet className="size-4" />} loading={exporting} onClick={excel}>
          Excel
        </Button>
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
          طباعة / PDF
        </Button>
      </div>
      <div className="overflow-x-auto py-6 print:overflow-visible print:py-0">
        <div className="mx-auto w-fit shadow-2xl print:shadow-none">
          <Letterhead company={company} title={title} period={text} printedBy={printedBy}>
            {kind === 'trial' && <TrialBody period={period} />}
            {kind === 'income' && <IncomeBody period={period} />}
            {kind === 'balance' && <BalanceBody period={period} />}
            {kind === 'vat' && <VatBody period={period} />}
          </Letterhead>
        </div>
      </div>
    </div>
  );
}
