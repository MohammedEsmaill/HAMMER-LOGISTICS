import { ArrowRight, Printer } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Spinner } from '@/components/ui/Spinner';
import { AR } from '@/lib/format';
import { useClientLedger, useCompany, type ClientAccount, type ClientLedger, type CompanySettings } from './account-api';
import { CURRENCIES, money, type Currency } from './api';
import { statementPeriod } from './client-statement-excel';

const INK = '#141414';
const GOLD = '#a8791f';
const GOLD_SOFT = '#f6efdc';
const LINE = '#d9d2c3';

const day = (v: string) => v.slice(0, 10).split('-').reverse().join('/');
const signed = (v: string | number, c: Currency) => (Number(v) < 0 ? `(${money(-Number(v), c)})` : money(v, c));

function Title({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h2 className="mt-6 mb-2.5 flex items-center gap-2 text-[15px] font-bold">
      <span className="grid size-6 place-items-center rounded-full text-xs text-white" style={{ background: GOLD }}>
        {n}
      </span>
      {children}
      <span className="h-px flex-1" style={{ background: LINE }} />
    </h2>
  );
}

function Table({ head, rows, foot }: { head: string[]; rows: ReactNode[][]; foot?: ReactNode[] }) {
  const td = 'border px-2 py-1';
  return (
    <table className="w-full border-collapse text-[11.5px]">
      <thead>
        <tr style={{ background: INK, color: '#f1d27a' }}>
          {head.map((h) => (
            <th key={h} className="border px-2 py-1.5 text-start font-bold" style={{ borderColor: INK }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ background: i % 2 ? '#faf8f3' : '#fff' }}>
            {r.map((c, j) => (
              <td key={j} className={td} style={{ borderColor: LINE }}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {foot && (
        <tfoot>
          <tr className="font-bold" style={{ background: GOLD_SOFT }}>
            {foot.map((c, j) => (
              <td key={j} className={td} style={{ borderColor: LINE }}>
                {c}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

const ltr = (v: ReactNode) => <span dir="ltr">{v}</span>;

function Statement({ ledger, a, company, printedBy }: { ledger: ClientLedger; a: ClientAccount; company: CompanySettings; printedBy: string }) {
  const c = a.currency;
  return (
    <div className="report-page mx-auto bg-white px-9 py-8 text-[12px] leading-relaxed" dir="rtl" style={{ width: '210mm', minHeight: '297mm', color: INK }}>
      <header className="flex items-start justify-between gap-6 border-b-4 pb-4" style={{ borderColor: GOLD }}>
        <div className="space-y-0.5">
          <div className="text-[19px] font-extrabold">{company.name}</div>
          <div>{company.address}</div>
          <div>
            الرقم الضريبي: <span dir="ltr">{company.taxNumber}</span> · السجل التجاري: <span dir="ltr">{company.crNumber}</span>
          </div>
          {company.emails.length > 0 && (
            <div dir="ltr" style={{ textAlign: 'right' }}>
              {company.emails.join(' · ')}
            </div>
          )}
        </div>
        <img src="/logo-full.png" alt="" className="h-20 w-auto object-contain" />
      </header>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-extrabold">كشف حساب عميل</h1>
          <div className="mt-1 text-[14px]">
            <b>{ledger.client.name}</b> · بال{CURRENCIES[c].label}
          </div>
          <div className="mt-0.5">{statementPeriod(ledger)}</div>
        </div>
        <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: GOLD_SOFT }}>
          <div>
            طُبع بواسطة: <b>{printedBy}</b>
          </div>
          <div>في: {new Intl.DateTimeFormat(AR, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ledger.generatedAt))}</div>
        </div>
      </div>

      <Title n={1}>الملخص</Title>
      <Table
        head={['إجمالي الفواتير', 'إجمالي التحصيل', 'الرصيد', 'حتى 30 يوم', '31 – 60', '61 – 90', 'أكثر من 90']}
        rows={[[a.summary.billed, a.summary.collected, a.summary.balance, a.aging.upTo30, a.aging.from31To60, a.aging.from61To90, a.aging.over90].map((v) => ltr(signed(v, c)))]}
      />
      <p className="mt-1 text-[10px]" style={{ color: '#6b6b6b' }}>
        الأرصدة على المستندات المعتمدة فقط. الأرقام بين قوسين رصيد للعميل. أعمار المستحقات من تاريخ الفاتورة.
      </p>

      <Title n={2}>كشف الحساب</Title>
      <Table
        head={['التاريخ', 'النوع', 'رقم المستند', 'الملف', 'مدين', 'دائن', 'الرصيد']}
        rows={[
          ['', <b>رصيد أول المدة</b>, '', '', '', '', ltr(<b>{signed(a.statement.opening, c)}</b>)],
          ...a.statement.lines.map((l) => [
            day(l.date),
            l.label,
            ltr(l.ref ?? '—'),
            ltr(l.fileNo),
            Number(l.debit) ? ltr(money(l.debit)) : '',
            Number(l.credit) ? ltr(money(l.credit)) : '',
            ltr(signed(l.balance ?? 0, c)),
          ]),
        ]}
        foot={['', 'الإجمالي', '', '', ltr(money(a.statement.debit)), ltr(money(a.statement.credit)), ltr(signed(a.statement.closing, c))]}
      />

      {a.shipments.length > 0 && (
        <>
          <Title n={3}>حسب الشحنة</Title>
          <Table
            head={['الملف', 'حساب الشحنة', 'المفوتر', 'المحصّل', 'الباقي', 'أقدم مستحق']}
            rows={a.shipments.map((s) => [
              ltr(s.fileNo),
              s.accountStatus === 'FINISHED' ? 'منتهي' : s.accountStatus === 'ISSUED' ? 'قيد الاعتماد' : 'مفتوح',
              ltr(money(s.billed)),
              ltr(money(s.collected)),
              ltr(<b>{signed(s.remaining, c)}</b>),
              s.ageDays === null ? '—' : `${s.ageDays} يوم`,
            ])}
          />
        </>
      )}
    </div>
  );
}

/** A client statement on A4, to print or save as PDF and send to the client. */
export default function ClientStatementPrintPage() {
  const id = Number(useParams().id);
  const [params] = useSearchParams();
  const period = { from: params.get('from') ?? undefined, to: params.get('to') ?? undefined };
  const { user } = useAuth();
  const { data, error } = useClientLedger(id, period);
  const { data: company } = useCompany();
  const a = data?.currencies.find((c) => c.currency === params.get('currency')) ?? data?.currencies.find((c) => c.active);

  useEffect(() => {
    if (data) document.title = `كشف حساب ${data.client.name}`;
    return () => {
      document.title = 'HAMMER LINE';
    };
  }, [data]);

  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;
  if (!data || !company || !a) {
    return (
      <div className="grid min-h-screen place-items-center text-gold">
        <Spinner className="size-8" />
      </div>
    );
  }
  return (
    <div className="report-print min-h-screen bg-neutral-300 pb-10 print:bg-white print:pb-0">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 print:hidden">
        <Link to={`/client-ledgers/${id}`} className="flex items-center gap-1 text-sm text-muted hover:text-gold">
          <ArrowRight className="size-4" /> حساب {data.client.name}
        </Link>
        <div className="flex-1" />
        <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
          طباعة / PDF
        </Button>
      </div>
      <div className="py-6 print:py-0">
        <div className="mx-auto w-fit shadow-2xl print:shadow-none">
          <Statement ledger={data} a={a} company={company} printedBy={user?.name || user?.email || ''} />
        </div>
      </div>
    </div>
  );
}
