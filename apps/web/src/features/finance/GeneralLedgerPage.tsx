import { CheckCircle2, ChevronLeft, Printer, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { PageHeader } from '@/components/ui/misc';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { FormTabs } from '../shipments/FormTabs';
import { CURRENCIES, money, type Currency } from './api';
import { BalanceSheetView, IncomeStatementView, VatView } from './FinancialStatements';
import { GL_TYPES, useGlChart, useGlLedger, useTrialBalance, type GlAccount, type GlPeriod, type TrialLine } from './gl-api';

type View = 'trial' | 'income' | 'balance' | 'vat' | 'chart';

const num = (v: string) => (Number(v) === 0 ? '—' : money(v));

/** Group rows read bolder the higher they sit in the chart. */
const rowTone = (l: { group: boolean; level: number }) =>
  !l.group ? '' : l.level === 0 ? 'bg-gold/10 font-extrabold' : 'bg-surface-2 font-bold';

/**
 * The general ledger: the trial balance of each currency's books for a period, the
 * chart of accounts, and each account's ledger. Every line comes from the documents
 * themselves (custodies, invoices, collections, salaries …), old ones included.
 */
export default function GeneralLedgerPage() {
  const [view, setView] = useState<View>('trial');
  const [period, setPeriod] = useState<GlPeriod>({ currency: 'EGP', from: '', to: '' });
  const [open, setOpen] = useState<GlAccount | null>(null);

  return (
    <>
      <PageHeader
        title="الحسابات العامة"
        actions={
          view !== 'chart' && (
            <Link
              to={`/print/statements?${new URLSearchParams({ view, currency: period.currency, ...(view !== 'balance' && period.from ? { from: period.from } : {}), ...(period.to ? { to: period.to } : {}) })}`}
              target="_blank"
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-gold/40 px-4 py-2 text-sm font-semibold text-gold hover:bg-gold/10"
            >
              <Printer className="size-4" /> طباعة / PDF / Excel
            </Link>
          )
        }
      />

      <div className="mb-3">
        <FormTabs
          tabs={[
            { key: 'trial', label: 'ميزان المراجعة' },
            { key: 'income', label: 'قائمة الدخل' },
            { key: 'balance', label: 'الميزانية' },
            { key: 'vat', label: 'ضريبة القيمة المضافة' },
            { key: 'chart', label: 'دليل الحسابات' },
          ]}
          active={view}
          onChange={setView}
          layoutId="gl-view"
        />
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-xl border border-line bg-surface p-1" role="group" aria-label="العملة">
          {(Object.keys(CURRENCIES) as Currency[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={period.currency === c}
              onClick={() => setPeriod({ ...period, currency: c })}
              className={`focus-ring rounded-lg px-4 py-1.5 text-sm transition-colors ${period.currency === c ? 'gold-fill font-semibold' : 'text-muted hover:text-ink'}`}
            >
              دفاتر ال{CURRENCIES[c].label}
            </button>
          ))}
        </div>
        {view !== 'chart' && view !== 'balance' && (
          <TextField label="من" type="date" className="w-40" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} />
        )}
        {view !== 'chart' && (
          <TextField
            label={view === 'balance' ? 'في تاريخ' : 'إلى'}
            type="date"
            className="w-40"
            value={period.to}
            min={view === 'balance' ? undefined : period.from}
            onChange={(e) => setPeriod({ ...period, to: e.target.value })}
          />
        )}
      </div>

      {view === 'trial' && <TrialBalanceView period={period} onOpen={setOpen} />}
      {view === 'income' && <IncomeStatementView period={period} />}
      {view === 'balance' && <BalanceSheetView period={period} />}
      {view === 'vat' && <VatView period={period} />}
      {view === 'chart' && <ChartView onOpen={setOpen} />}

      <LedgerDrawer account={open} period={period} onClose={() => setOpen(null)} />
    </>
  );
}

function TrialBalanceView({ period, onOpen }: { period: GlPeriod; onOpen: (a: GlAccount) => void }) {
  const { data, error, isLoading } = useTrialBalance(period);
  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <Spinner className="mx-auto my-10 size-7 text-gold" />;
  const balanced = data.totals.debit === data.totals.credit && data.totals.closingDebit === data.totals.closingCredit;
  const ranged = !!period.from;

  return (
    <div className="space-y-3">
      <div className={`card flex items-center gap-2 p-3 text-sm ${balanced ? 'text-success' : 'text-danger'}`}>
        {balanced ? <CheckCircle2 className="size-5" /> : <TriangleAlert className="size-5" />}
        {balanced
          ? `الميزان متزن: إجمالي المدين = إجمالي الدائن = ${money(data.totals.debit, period.currency)}`
          : `الميزان مش متزن: المدين ${money(data.totals.debit)} والدائن ${money(data.totals.credit)}`}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="px-3 py-2 text-start">الكود</th>
              <th className="px-3 py-2 text-start">الحساب</th>
              {ranged && <th className="px-3 py-2 text-end">رصيد أول المدة</th>}
              <th className="px-3 py-2 text-end">مدين</th>
              <th className="px-3 py-2 text-end">دائن</th>
              <th className="px-3 py-2 text-end">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l: TrialLine) => (
              <tr
                key={l.key}
                onClick={l.group ? undefined : () => onOpen(l)}
                className={`border-t border-line ${rowTone(l)} ${l.group ? '' : 'cursor-pointer hover:bg-gold/5'}`}
              >
                <td className="px-3 py-2 tabular-nums" dir="ltr" style={{ textAlign: 'right' }}>
                  {l.code}
                </td>
                <td className="px-3 py-2" style={{ paddingInlineStart: `${0.75 + l.level * 1.1}rem` }}>
                  <span className="inline-flex items-center gap-1">
                    {l.name}
                    {!l.group && <ChevronLeft className="size-3.5 text-muted" />}
                  </span>
                </td>
                {ranged && <td className="px-3 py-2 text-end tabular-nums">{num(l.opening)}</td>}
                <td className="px-3 py-2 text-end tabular-nums">{num(l.debit)}</td>
                <td className="px-3 py-2 text-end tabular-nums">{num(l.credit)}</td>
                <td className={`px-3 py-2 text-end tabular-nums ${Number(l.closing) < 0 ? 'text-danger' : ''}`}>{num(l.closing)}</td>
              </tr>
            ))}
            {data.lines.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted">
                  مفيش قيود في الفترة دي
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-gold/50 font-extrabold">
            <tr>
              <td className="px-3 py-2" colSpan={ranged ? 3 : 2}>
                الإجمالي
              </td>
              <td className="px-3 py-2 text-end tabular-nums">{money(data.totals.debit)}</td>
              <td className="px-3 py-2 text-end tabular-nums">{money(data.totals.credit)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted">
        الرصيد بطبيعة الحساب: الأصول والمصروفات رصيدها مدين، والالتزامات وحقوق الملكية والإيرادات رصيدها دائن. الرقم الأحمر رصيد عكس طبيعة الحساب. دفاتر الدولار
        منفصلة عن دفاتر الجنيه ومفيش تحويل بينهم.
      </p>
    </div>
  );
}

function ChartView({ onOpen }: { onOpen: (a: GlAccount) => void }) {
  const { data = [], error, isLoading } = useGlChart();
  if (error) return <ErrorBox error={error} />;
  if (isLoading) return <Spinner className="mx-auto my-10 size-7 text-gold" />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th className="px-3 py-2 text-start">الكود</th>
            <th className="px-3 py-2 text-start">الحساب</th>
            <th className="px-3 py-2 text-start">النوع</th>
          </tr>
        </thead>
        <tbody>
          {data.map((a) => {
            const level = a.code.length - 1;
            return (
              <tr
                key={a.key}
                onClick={a.group ? undefined : () => onOpen(a)}
                className={`border-t border-line ${rowTone({ group: a.group, level })} ${a.group ? '' : 'cursor-pointer hover:bg-gold/5'}`}
              >
                <td className="px-3 py-2 tabular-nums" dir="ltr" style={{ textAlign: 'right' }}>
                  {a.code}
                </td>
                <td className="px-3 py-2" style={{ paddingInlineStart: `${0.75 + level * 1.1}rem` }}>
                  {a.name}
                </td>
                <td className="px-3 py-2 text-muted">{a.group ? 'مجموعة' : GL_TYPES[a.type]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LedgerDrawer({ account, period, onClose }: { account: GlAccount | null; period: GlPeriod; onClose: () => void }) {
  const { data, error, isLoading } = useGlLedger(account?.key ?? null, period);
  const range = [period.from && `من ${formatDate(period.from)}`, period.to && `إلى ${formatDate(period.to)}`].filter(Boolean).join(' ');
  return (
    <Drawer
      open={!!account}
      onClose={onClose}
      width="max-w-4xl"
      title={account ? `${account.code} · ${account.name}` : ''}
      subtitle={`دفاتر ال${CURRENCIES[period.currency].label}${range ? ` · ${range}` : ''}`}
    >
      {error ? (
        <ErrorBox error={error} />
      ) : isLoading || !data ? (
        <Spinner className="mx-auto my-10 size-7 text-gold" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-2 py-2 text-start">التاريخ</th>
                <th className="px-2 py-2 text-start">المستند</th>
                <th className="px-2 py-2 text-start">البيان</th>
                <th className="px-2 py-2 text-end">مدين</th>
                <th className="px-2 py-2 text-end">دائن</th>
                <th className="px-2 py-2 text-end">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line bg-gold/5 font-semibold">
                <td className="px-2 py-2" colSpan={5}>
                  رصيد أول المدة
                </td>
                <td className="px-2 py-2 text-end tabular-nums">{money(data.opening)}</td>
              </tr>
              {data.lines.map((l, i) => (
                <tr key={i} className="border-t border-line align-top">
                  <td className="px-2 py-2 whitespace-nowrap">{formatDate(l.date)}</td>
                  <td className="px-2 py-2 whitespace-nowrap" dir="ltr" style={{ textAlign: 'right' }}>
                    {l.ref}
                  </td>
                  <td className="px-2 py-2">
                    {l.description}
                    {(l.party || l.fileNo) && (
                      <div className="text-xs text-muted">{[l.party, l.fileNo].filter(Boolean).join(' · ')}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">{num(l.debit)}</td>
                  <td className="px-2 py-2 text-end tabular-nums">{num(l.credit)}</td>
                  <td className={`px-2 py-2 text-end tabular-nums ${Number(l.balance) < 0 ? 'text-danger' : ''}`}>{money(l.balance)}</td>
                </tr>
              ))}
              {data.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-muted">
                    مفيش حركة على الحساب ده في الفترة
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-gold/50 font-extrabold">
              <tr>
                <td className="px-2 py-2" colSpan={5}>
                  رصيد آخر المدة
                </td>
                <td className="px-2 py-2 text-end tabular-nums">{money(data.closing, period.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Drawer>
  );
}
