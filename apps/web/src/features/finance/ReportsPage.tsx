import { BookOpenText, FileSpreadsheet, Landmark, Printer, Receipt, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { PageHeader } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { toastError } from '@/lib/mutations';
import { useCompany } from './account-api';
import { CURRENCIES, STATUS, useAccounts, type ApprovalStatus, type Currency } from './api';
import { defaultPeriodValue, JOURNAL_TYPES, PERIOD_KINDS, periodRange, type JournalType, type PeriodKind } from './journal-api';
import { describeFilters, REPORT_KINDS, reportSearch, useReport, type ReportKind, type ReportQuery } from './report-api';
import { ReportDocument } from './ReportDocument';
import { downloadReportExcel } from './report-excel';

const ICONS: Record<ReportKind, LucideIcon> = { journal: BookOpenText, accounts: Landmark, expenses: Receipt };

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => String(thisYear - i));

/**
 * The finance reports: pick a report and a period (a day, a month, a year or a range),
 * see it on the company's letterhead, then print it as PDF or download it as Excel.
 */
export default function ReportsPage() {
  const { user, canAny } = useAuth();
  const salaryData = canAny('finance.payroll.manage', 'finance.approve');
  const { data: accounts = [] } = useAccounts();
  const { data: company } = useCompany();
  const [kind, setKind] = useState<ReportKind>('journal');
  const [period, setPeriod] = useState<PeriodKind>('month');
  const [value, setValue] = useState(defaultPeriodValue('month'));
  const [rangeTo, setRangeTo] = useState('');
  const [types, setTypes] = useState<JournalType[]>([]);
  const [accountId, setAccountId] = useState<number | ''>('');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [status, setStatus] = useState<ApprovalStatus | ''>('');
  const [asked, setAsked] = useState<{ kind: ReportKind; q: ReportQuery } | null>(null);
  const [exporting, setExporting] = useState(false);
  const { data: report, isFetching, error } = useReport(asked?.kind ?? kind, asked?.q ?? null);

  const range = periodRange(period, value, rangeTo);
  const generatedBy = user?.name || user?.email || '';
  const filters = asked ? describeFilters(asked.q, accounts) : [];

  const choosePeriod = (p: PeriodKind) => {
    setPeriod(p);
    setValue(defaultPeriodValue(p));
    setRangeTo('');
  };

  const show = () => {
    if (!range) return;
    setAsked({
      kind,
      q: { ...range, types: kind === 'journal' ? types : [], accountId, currency, status: kind === 'accounts' ? '' : status },
    });
  };

  const excel = async () => {
    if (!report || !company) return;
    setExporting(true);
    try {
      await downloadReportExcel(report, company, filters, generatedBy);
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader title="التقارير" />

      <div className="grid gap-3 md:grid-cols-3">
        {(Object.keys(REPORT_KINDS) as ReportKind[]).map((k) => {
          const Icon = ICONS[k];
          const on = k === kind;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => setKind(k)}
              className={`card focus-ring flex items-start gap-3 p-4 text-start transition-colors ${on ? 'border-gold/60 bg-gold/5' : 'hover:border-gold/30'}`}
            >
              <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${on ? 'gold-fill' : 'bg-gold/10 text-gold'}`}>
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block font-bold">{REPORT_KINDS[k].title}</span>
                <span className="block text-sm text-muted">{REPORT_KINDS[k].hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <section className="card mt-4 space-y-4 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="نوع الفترة">
          {(Object.keys(PERIOD_KINDS) as PeriodKind[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={p === period}
              onClick={() => choosePeriod(p)}
              className={`focus-ring rounded-xl border px-4 py-2 text-sm transition-colors ${p === period ? 'border-gold bg-gold/15 font-semibold text-gold' : 'border-line text-muted hover:text-ink'}`}
            >
              {PERIOD_KINDS[p]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {period === 'day' && <TextField label="اليوم" type="date" className="w-48" value={value} onChange={(e) => setValue(e.target.value)} />}
          {period === 'month' && <TextField label="الشهر" type="month" className="w-48" value={value} onChange={(e) => setValue(e.target.value)} />}
          {period === 'year' && (
            <SelectField label="السنة" className="w-40" placeholder="اختار السنة" options={YEARS.map((y) => ({ value: y, label: y }))} value={value} onChange={(e) => setValue(e.target.value)} />
          )}
          {period === 'range' && (
            <>
              <TextField label="من" type="date" className="w-44" value={value} onChange={(e) => setValue(e.target.value)} />
              <TextField label="إلى" type="date" className="w-44" value={rangeTo} min={value} onChange={(e) => setRangeTo(e.target.value)} />
            </>
          )}
          <SelectField
            label="الخزنة / الحساب"
            className="w-56"
            placeholder="الكل"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
          />
          <SelectField
            label="العملة"
            className="w-36"
            placeholder="الكل"
            options={Object.entries(CURRENCIES).map(([v, c]) => ({ value: v, label: c.label }))}
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency | '')}
          />
          {kind !== 'accounts' && (
            <SelectField
              label="الحالة"
              className="w-48"
              placeholder="كل الحالات"
              options={Object.entries(STATUS).map(([v, s]) => ({ value: v, label: s.label }))}
              value={status}
              onChange={(e) => setStatus(e.target.value as ApprovalStatus | '')}
            />
          )}
        </div>
        {kind === 'journal' && (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(JOURNAL_TYPES) as JournalType[])
              .filter((t) => salaryData || !JOURNAL_TYPES[t].restricted)
              .map((t) => {
                const on = types.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTypes(on ? types.filter((x) => x !== t) : [...types, t])}
                    className={`focus-ring rounded-full border px-3 py-1.5 text-sm ${on ? 'border-gold bg-gold/15 font-semibold text-gold' : 'border-line text-muted hover:text-ink'}`}
                  >
                    {JOURNAL_TYPES[t].label}
                  </button>
                );
              })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button onClick={show} disabled={!range} loading={isFetching}>
            عرض التقرير
          </Button>
          {report && company && asked && (
            <>
              <a href={`/print/reports/${asked.kind}?${reportSearch(asked.q)}`} target="_blank" rel="noreferrer">
                <Button variant="ghost" icon={<Printer className="size-4" />}>
                  PDF / طباعة
                </Button>
              </a>
              <Button variant="ghost" icon={<FileSpreadsheet className="size-4" />} loading={exporting} onClick={excel}>
                Excel
              </Button>
            </>
          )}
          {!range && period === 'range' && <span className="text-sm text-muted">اختار تاريخ البداية والنهاية</span>}
        </div>
      </section>

      {error ? <div className="mt-4"><ErrorBox error={error} /></div> : null}
      {report && company && (
        <div className="mt-6 overflow-x-auto rounded-2xl bg-neutral-300/60 p-4 dark:bg-neutral-800">
          <div className="mx-auto w-fit shadow-2xl">
            <ReportDocument report={report} company={company} filters={filters} generatedBy={generatedBy} />
          </div>
        </div>
      )}
    </>
  );
}
