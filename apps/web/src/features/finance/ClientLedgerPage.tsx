import { ArrowRight, Clock, FileSpreadsheet, Printer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { toastError } from '@/lib/mutations';
import { FormTabs } from '../shipments/FormTabs';
import { useClientLedger, useCompany, type ClientAccount, type LedgerLine, type LedgerPeriod } from './account-api';
import { CURRENCIES, money, STATUS, type Currency } from './api';
import { downloadClientStatementExcel } from './client-statement-excel';

type View = 'statement' | 'shipments' | 'pending';

/** A signed balance: owed by the client, or (in brackets) owed to them. */
function balanceText(v: string | number, c: Currency) {
  const n = Number(v);
  return n < 0 ? `(${money(-n, c)})` : money(n, c);
}

function Kpi({ label, value, hint, tone, ltr = true }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string; ltr?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone ?? ''}`} dir={ltr ? 'ltr' : undefined} style={{ textAlign: 'right' }}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** The document of a line: the invoice opens printed; a collection names its reference. */
function DocRef({ l }: { l: LedgerLine }) {
  if (l.invoiceId) {
    return (
      <Link to={`/print/invoices/${l.invoiceId}`} target="_blank" className="text-gold hover:underline" dir="ltr">
        {l.ref}
      </Link>
    );
  }
  return <span dir="ltr">{l.ref ?? '—'}</span>;
}

function Lines({ lines, currency, opening, totals }: { lines: LedgerLine[]; currency: Currency; opening?: string; totals?: { debit: string; credit: string; closing: string } }) {
  const cell = 'px-3 py-2';
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-line text-muted">
            {['التاريخ', 'النوع', 'رقم المستند', 'الملف', 'مدين', 'دائن', ...(opening !== undefined ? ['الرصيد'] : ['الحالة'])].map((h) => (
              <th key={h} className="px-3 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {opening !== undefined && (
            <tr className="border-b border-line/60 bg-surface-2/60">
              <td className={cell} />
              <td className={`${cell} font-semibold`}>رصيد أول المدة</td>
              <td className={cell} colSpan={4} />
              <td className={`${cell} font-bold`} dir="ltr">
                {balanceText(opening, currency)}
              </td>
            </tr>
          )}
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-line/60">
              <td className={`${cell} whitespace-nowrap`}>{formatDate(l.date)}</td>
              <td className={cell}>{l.label}</td>
              <td className={cell}>
                <DocRef l={l} />
              </td>
              <td className={cell}>
                <Link to={`/shipment-accounts/${l.shipmentId}`} className="hover:text-gold" dir="ltr">
                  {l.fileNo}
                </Link>
              </td>
              <td className={`${cell} font-semibold text-debit`} dir="ltr">
                {Number(l.debit) ? money(l.debit) : ''}
              </td>
              <td className={`${cell} font-semibold text-credit`} dir="ltr">
                {Number(l.credit) ? money(l.credit) : ''}
              </td>
              <td className={cell} dir={l.balance !== null ? 'ltr' : undefined}>
                {l.balance !== null ? <b>{balanceText(l.balance, currency)}</b> : <Badge tone={STATUS[l.approvalStatus].tone}>{STATUS[l.approvalStatus].label}</Badge>}
              </td>
            </tr>
          ))}
          {totals && (
            <tr className="bg-gold/8 font-bold">
              <td className={cell} />
              <td className={cell}>الإجمالي</td>
              <td className={cell} colSpan={2} />
              <td className={`${cell} text-debit`} dir="ltr">
                {money(totals.debit)}
              </td>
              <td className={`${cell} text-credit`} dir="ltr">
                {money(totals.credit)}
              </td>
              <td className={cell} dir="ltr">
                {balanceText(totals.closing, currency)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!lines.length && <EmptyState compact text="لا توجد حركات في هذه الفترة" />}
    </div>
  );
}

function Shipments({ a }: { a: ClientAccount }) {
  const cell = 'px-3 py-2';
  if (!a.shipments.length) return <EmptyState compact text="لا توجد شحنات بفواتير معتمدة" />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-line text-muted">
            {['الملف', 'حساب الشحنة', 'المفوتر', 'المحصّل', 'الباقي', 'أقدم مستحق'].map((h) => (
              <th key={h} className="px-3 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {a.shipments.map((s) => (
            <tr key={s.shipmentId} className="border-b border-line/60">
              <td className={cell}>
                <Link to={`/shipment-accounts/${s.shipmentId}`} className="font-semibold text-gold hover:underline" dir="ltr">
                  {s.fileNo}
                </Link>
              </td>
              <td className={cell}>{s.accountStatus === 'FINISHED' ? <Badge tone="success">منتهي</Badge> : <Badge>مفتوح</Badge>}</td>
              <td className={`${cell} text-debit`} dir="ltr">
                {money(s.billed)}
              </td>
              <td className={`${cell} text-credit`} dir="ltr">
                {money(s.collected)}
              </td>
              <td className={`${cell} font-bold`} dir="ltr">
                {balanceText(s.remaining, a.currency)}
              </td>
              <td className={cell}>
                {s.ageDays === null ? '—' : <span className={s.ageDays > 90 ? 'font-semibold text-danger' : s.ageDays > 30 ? 'text-gold' : ''}>{s.ageDays} يوم</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Aging({ a }: { a: ClientAccount }) {
  const parts = [
    ['حتى 30 يوم', a.aging.upTo30, 'text-ink'],
    ['31 – 60 يوم', a.aging.from31To60, 'text-gold'],
    ['61 – 90 يوم', a.aging.from61To90, 'text-warning'],
    ['أكثر من 90 يوم', a.aging.over90, 'text-danger'],
  ] as const;
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Clock className="size-4 text-gold" /> أعمار المستحقات (من تاريخ الفاتورة)
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {parts.map(([label, value, tone]) => (
          <div key={label} className="rounded-xl bg-surface-2 p-3">
            <div className="text-xs text-muted">{label}</div>
            <div className={`mt-1 font-bold ${Number(value) ? tone : 'text-muted'}`} dir="ltr" style={{ textAlign: 'right' }}>
              {money(value, a.currency)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A client's account: summary, aging, the statement for a period, per shipment, pending. */
export default function ClientLedgerPage() {
  const id = Number(useParams().id);
  const [period, setPeriod] = useState<LedgerPeriod>({});
  const { data, error, isFetching } = useClientLedger(id, period);
  const { data: company } = useCompany();
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [view, setView] = useState<View>('statement');
  const [exporting, setExporting] = useState(false);

  if (error) return <ErrorBox error={error} />;
  if (!data) {
    return (
      <div className="grid h-64 place-items-center text-gold">
        <Spinner className="size-8" />
      </div>
    );
  }

  const active = data.currencies.filter((c) => c.active);
  const a = active.find((c) => c.currency === currency) ?? active[0];
  const query = new URLSearchParams({ ...(period.from ? { from: period.from } : {}), ...(period.to ? { to: period.to } : {}), ...(a ? { currency: a.currency } : {}) });

  return (
    <div className="space-y-5">
      <Link to="/client-ledgers" className="inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowRight className="size-4" /> حسابات العملاء
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{data.client.name}</h1>
          <div className="text-sm text-muted" dir="ltr" style={{ textAlign: 'right' }}>
            {data.client.mobile} · {data.client.email}
          </div>
        </div>
        {a && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              icon={<FileSpreadsheet className="size-4" />}
              loading={exporting}
              disabled={!company}
              onClick={() => {
                setExporting(true);
                downloadClientStatementExcel(data, a, company!)
                  .catch(toastError)
                  .finally(() => setExporting(false));
              }}
            >
              Excel
            </Button>
            <Link to={`/print/client-ledgers/${id}?${query}`} target="_blank">
              <Button icon={<Printer className="size-4" />}>طباعة / PDF</Button>
            </Link>
          </div>
        )}
      </div>

      {!a && <EmptyState text="لا توجد فواتير ولا تحصيل لهذا العميل بعد" />}
      {a && (
        <>
          {active.length > 1 && (
            <FormTabs
              tabs={active.map((c) => ({ key: c.currency, label: `بال${CURRENCIES[c.currency].label}` }))}
              active={a.currency}
              onChange={setCurrency}
              layoutId="client-currency"
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="إجمالي الفواتير المعتمدة" value={money(a.summary.billed, a.currency)} tone="text-debit" />
            <Kpi label="إجمالي التحصيل المعتمد" value={money(a.summary.collected, a.currency)} tone="text-credit" />
            <Kpi
              label={Number(a.summary.balance) < 0 ? 'رصيد للعميل' : 'المستحق على العميل'}
              value={money(Math.abs(Number(a.summary.balance)), a.currency)}
              tone={Number(a.summary.balance) > 0 ? 'text-gold' : 'text-success'}
              hint={a.summary.lastCollection ? `آخر تحصيل ${formatDate(a.summary.lastCollection)}` : 'لم يُحصَّل منه بعد'}
            />
            <Kpi
              label="أقدم مستحق"
              ltr={false}
              value={a.summary.oldestDays === null ? '—' : `${a.summary.oldestDays} يوم`}
              tone={a.summary.oldestDays !== null && a.summary.oldestDays > 90 ? 'text-danger' : undefined}
            />
          </div>

          {a.summary.pending.count > 0 && (
            <button
              type="button"
              onClick={() => setView('pending')}
              className="w-full rounded-xl border border-gold/40 bg-gold/8 px-4 py-3 text-start text-sm hover:border-gold"
            >
              <b>{a.summary.pending.count}</b> مستند قيد المراجعة غير محسوب في الرصيد
              {Number(a.summary.pending.billed) > 0 && <> · فواتير <b dir="ltr">{money(a.summary.pending.billed, a.currency)}</b></>}
              {Number(a.summary.pending.collected) > 0 && <> · تحصيل <b dir="ltr">{money(a.summary.pending.collected, a.currency)}</b></>}
            </button>
          )}

          <Aging a={a} />

          <div className="flex flex-wrap items-end justify-between gap-3">
            <FormTabs
              tabs={[
                { key: 'statement', label: 'كشف الحساب' },
                { key: 'shipments', label: 'حسب الشحنة', count: a.shipments.length },
                { key: 'pending', label: 'قيد المراجعة', count: a.pending.length || undefined },
              ]}
              active={view}
              onChange={setView}
              layoutId="client-ledger-view"
            />
            {view === 'statement' && (
              <div className="flex items-end gap-2">
                <TextField label="من" type="date" value={period.from ?? ''} onChange={(e) => setPeriod((p) => ({ ...p, from: e.target.value || undefined }))} />
                <TextField label="إلى" type="date" value={period.to ?? ''} onChange={(e) => setPeriod((p) => ({ ...p, to: e.target.value || undefined }))} />
                {(period.from || period.to) && (
                  <Button variant="ghost" onClick={() => setPeriod({})}>
                    كل الفترات
                  </Button>
                )}
                {isFetching && <Spinner className="mb-3 size-5 text-gold" />}
              </div>
            )}
          </div>

          {view === 'statement' && (
            <Lines
              lines={a.statement.lines}
              currency={a.currency}
              opening={a.statement.opening}
              totals={{ debit: a.statement.debit, credit: a.statement.credit, closing: a.statement.closing }}
            />
          )}
          {view === 'shipments' && <Shipments a={a} />}
          {view === 'pending' && (a.pending.length ? <Lines lines={a.pending} currency={a.currency} /> : <EmptyState compact text="لا توجد مستندات قيد المراجعة" />)}
        </>
      )}
    </div>
  );
}
