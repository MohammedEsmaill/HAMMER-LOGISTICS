import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, CheckCircle2, FileUp, Plus, Printer, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useAuth, useIsTopManager } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { toastError } from '@/lib/mutations';
import { CURRENCIES, money } from './api';
import {
  closingBalance,
  COLUMN_ROLES,
  guessMapping,
  matchStatement,
  readStatement,
  statementLines,
  type ColumnRole,
  type Mapping,
  type Sheet,
} from './bank-statement';
import {
  closeKeys,
  QUICK_KINDS,
  reconApi,
  useReconAccounts,
  useReconciliation,
  useReconciliations,
  useReconDraft,
  type BankLine,
  type QuickKind,
  type ReconLine,
  type ReconStatus,
} from './close-api';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const r2 = (n: number) => Math.round(n * 100) / 100;

function StatusBadges({ status, pending }: { status: ReconStatus; pending?: number }) {
  return (
    <span className="inline-flex flex-wrap justify-center gap-1">
      {status === 'MATCHED' ? <Badge tone="success">متطابقة</Badge> : <Badge tone="danger">فيها فرق</Badge>}
      {!!pending && <Badge tone="warning">{pending} معلّقة</Badge>}
    </span>
  );
}

function Stat({ label, value, hint, tone, ring }: { label: string; value: string; hint?: string; tone?: string; ring?: string }) {
  return (
    <div className={`card px-4 py-3 ${ring ?? ''}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums ${tone ?? ''}`} dir="ltr" style={{ textAlign: 'right' }}>
        {value}
      </div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** The saved reconciliations, newest first, and the way to a new one. */
function ReconList({ onOpen, onNew }: { onOpen: (id: number) => void; onNew: () => void }) {
  const { can } = useAuth();
  const [accountId, setAccountId] = useState<number | ''>('');
  const [status, setStatus] = useState<ReconStatus | ''>('');
  const { data: accounts = [] } = useReconAccounts();
  const { data = [], error, isLoading } = useReconciliations({ accountId, status });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="الحساب البنكي"
          className="w-60"
          placeholder="الكل"
          options={accounts.map((a) => ({ value: a.id, label: `${a.name} · ${CURRENCIES[a.currency].label}` }))}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
        />
        <SelectField
          label="الحالة"
          className="w-44"
          placeholder="الكل"
          options={[
            { value: 'MATCHED', label: 'متطابقة' },
            { value: 'DIFFERENCE', label: 'فيها فرق' },
          ]}
          value={status}
          onChange={(e) => setStatus(e.target.value as ReconStatus | '')}
        />
        <div className="flex-1" />
        {can('finance.bank.reconcile') && (
          <Button icon={<Plus className="size-4" />} onClick={onNew}>
            تسوية جديدة
          </Button>
        )}
      </div>

      {accounts.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {accounts.map((a) => (
            <div key={a.id} className="card px-4 py-3 text-sm">
              <div className="font-bold">{a.name}</div>
              <div className="text-xs text-muted">
                {CURRENCIES[a.currency].label}
                {a.bankName ? ` · ${a.bankName}` : ''}
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-xs">
                {a.last ? (
                  <>
                    آخر تسوية لحد {formatDate(a.last.to)} <StatusBadges status={a.last.status} />
                  </>
                ) : (
                  <span className="text-warning">لسه ما اتسوّاش</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {error ? (
        <ErrorBox error={error} />
      ) : isLoading ? (
        <Spinner className="mx-auto my-10 size-7 text-gold" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-surface-2 text-muted">
              <tr>
                <th className="px-3 py-2">تاريخ التسوية</th>
                <th className="px-3 py-2">الحساب</th>
                <th className="px-3 py-2">الفترة</th>
                <th className="px-3 py-2">رصيد كشف البنك</th>
                <th className="px-3 py-2">الفرق</th>
                <th className="px-3 py-2">الحالة</th>
                <th className="px-3 py-2">اتعملت بواسطة</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer border-t border-line hover:bg-gold/5">
                  <td className="px-3 py-2.5">{formatDate(r.createdAt)}</td>
                  <td className="px-3 py-2.5 font-semibold">
                    {r.account.name} <span className="text-xs text-muted">· {CURRENCIES[r.account.currency].label}</span>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {r.fromDate.slice(0, 10) === r.toDate.slice(0, 10) ? `${formatDate(r.toDate)} (يوم)` : `${formatDate(r.fromDate)} ← ${formatDate(r.toDate)}`}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{money(r.statementBalance, r.account.currency)}</td>
                  <td className={`px-3 py-2.5 tabular-nums ${Number(r.difference) === 0 ? 'text-success' : 'text-danger'}`}>{money(r.difference)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadges status={r.status} />
                  </td>
                  <td className="px-3 py-2.5 text-muted">{r.createdBy}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted">
                    مفيش تسويات لسه
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        التسوية اللي «فيها فرق» تقدر تفتحها وتكمّلها لما الفرق يتحل (آخر تسوية للحساب بس). اللي يسوّوا: المحاسب، مدير الخزنة، مدير الحسابات، والمدير التنفيذي.
      </p>
    </div>
  );
}

/** Reading the statement: which column is which, guessed then adjustable. */
function MappingPanel({
  sheet,
  mapping,
  onChange,
  onApply,
  onCancel,
}: {
  sheet: Sheet;
  mapping: Mapping;
  onChange: (m: Mapping) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const headers = sheet.rows[mapping.headerRow].map((v, i) => String(v ?? '').trim() || `عمود ${i + 1}`);
  return (
    <div className="card space-y-3 border-gold/40 p-4">
      <div className="font-bold">قراءة كشف البنك: اتأكد إن كل عمود في مكانه</div>
      <div className="flex flex-wrap gap-3">
        {(Object.keys(COLUMN_ROLES) as ColumnRole[]).map((role) => (
          <SelectField
            key={role}
            label={COLUMN_ROLES[role]}
            className="w-44"
            placeholder="مش موجود"
            options={headers.map((h, i) => ({ value: i, label: h }))}
            value={mapping.columns[role] ?? ''}
            onChange={(e) => onChange({ ...mapping, columns: { ...mapping.columns, [role]: e.target.value === '' ? undefined : Number(e.target.value) } })}
          />
        ))}
      </div>
      <p className="text-xs text-muted">لو الكشف فيه عمود مبلغ واحد بالإشارة (سالب للسحب) اختاره في «المبلغ»، ولو عمودين اختار «مدين» و«دائن».</p>
      <div className="flex gap-2">
        <Button icon={<Check className="size-4" />} onClick={onApply}>
          طابق مع الدفاتر
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </div>
  );
}

interface Quick {
  kind: QuickKind;
  date: string;
  amount: string;
  reason: string;
}

/**
 * One reconciliation: the account, the period, the bank statement's balance, our lines
 * ticked as shown in the bank (by hand or from the uploaded statement), the difference.
 */
function ReconEditor({ id, onBack }: { id: number | null; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const isCeo = useIsTopManager();
  const mayReconcile = can('finance.bank.reconcile');
  const { data: accounts = [] } = useReconAccounts();
  const { data: saved, error: savedError } = useReconciliation(id);

  const [accountId, setAccountId] = useState<number | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today());
  const [statement, setStatement] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [bankLines, setBankLines] = useState<BankLine[] | null>(null);
  const [unmatched, setUnmatched] = useState<BankLine[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [matchInfo, setMatchInfo] = useState<string | null>(null);
  const [quick, setQuick] = useState<Quick | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadedId = useRef<number | null>(null);

  // a saved one: its figures once
  useEffect(() => {
    if (!saved || loadedId.current === saved.id) return;
    loadedId.current = saved.id;
    setAccountId(saved.accountId);
    setFrom(saved.fromDate.slice(0, 10));
    setTo(saved.toDate.slice(0, 10));
    setStatement(String(Number(saved.statementBalance)));
    setChecked(new Set((saved.lines ?? []).filter((l) => l.cleared).map((l) => l.key)));
    setNote(saved.note ?? '');
    setBankLines(saved.bankLines);
    setUnmatched(saved.bankLines ?? []);
  }, [saved]);

  const isNew = id === null;
  const { data: draft, error: draftError, isFetching } = useReconDraft(isNew && accountId ? { accountId, from, to } : null);
  // the period starts after the last one: take it from the draft the first time
  useEffect(() => {
    if (isNew && draft && !from) setFrom(draft.from);
  }, [isNew, draft, from]);

  const editable = mayReconcile && (isNew || (!!saved?.latest && (saved.status === 'DIFFERENCE' || isCeo)));
  const lines: ReconLine[] = (isNew ? draft?.lines : saved?.lines) ?? [];
  const currency = isNew ? draft?.account.currency : saved?.account.currency;
  const system = Number((isNew ? draft?.systemBalance : saved?.systemBalance) ?? 0);

  const figures = useMemo(() => {
    const pending = lines.filter((l) => !checked.has(l.key));
    const pIn = r2(pending.filter((l) => Number(l.amount) > 0).reduce((s, l) => s + Number(l.amount), 0));
    const pOut = r2(pending.filter((l) => Number(l.amount) < 0).reduce((s, l) => s - Number(l.amount), 0));
    const expected = r2(system - pIn + pOut);
    const st = statement.trim() === '' ? null : Number(statement);
    const diff = st === null || Number.isNaN(st) ? null : r2(st - expected);
    return { pending, pIn, pOut, expected, diff, inCount: pending.filter((l) => Number(l.amount) > 0).length, outCount: pending.filter((l) => Number(l.amount) < 0).length };
  }, [lines, checked, system, statement]);

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const upload = async (file: File) => {
    try {
      const s = await readStatement(file);
      const m = guessMapping(s) ?? { headerRow: 0, columns: {}, headers: [] };
      setSheet(s);
      setMapping(m);
      setMatchInfo(null);
    } catch (e) {
      toastError(e);
    }
  };

  const applyMatch = () => {
    if (!sheet || !mapping) return;
    const all = statementLines(sheet, mapping);
    if (!all.length) {
      toast.error('مش لاقي حركات في الكشف: اتأكد من عمود التاريخ والمبالغ');
      return;
    }
    const inPeriod = all.filter((b) => (!from || b.date >= from) && b.date <= to);
    const { matched, unmatched: rest } = matchStatement(inPeriod, lines);
    setChecked(new Set(matched.keys()));
    setUnmatched(rest);
    setBankLines(inPeriod);
    const bal = closingBalance(inPeriod.length ? inPeriod : all);
    if (bal !== null) setStatement(String(bal));
    setMatchInfo(`اتطابق ${matched.size} من ${inPeriod.length} سطر في كشف البنك${rest.length ? `، و${rest.length} سطر مش لاقيينه في الدفاتر` : ''}`);
    setSheet(null);
  };

  const record = async () => {
    if (!quick || !accountId) return;
    setBusy(true);
    try {
      const amount = Number(quick.amount);
      const res = await reconApi.record({ accountId, kind: quick.kind, amount, date: quick.date, reason: quick.reason });
      const sign = QUICK_KINDS[quick.kind].sign;
      const key = `OTHER:${res.id}:${sign > 0 ? 'D' : 'C'}:${amount.toFixed(2)}#1`;
      await queryClient.invalidateQueries({ queryKey: closeKeys.recon });
      setChecked((prev) => new Set(prev).add(key));
      setUnmatched((prev) => {
        const i = prev.findIndex((b) => Math.abs(b.amount - sign * amount) < 0.005);
        return i < 0 ? prev : [...prev.slice(0, i), ...prev.slice(i + 1)];
      });
      setQuick(null);
      toast.success('اتسجلت الحركة واتعلّمت ظاهرة في البنك');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!accountId || figures.diff === null) return;
    setBusy(true);
    try {
      const body = {
        statementBalance: Number(statement),
        clearedKeys: lines.filter((l) => checked.has(l.key)).map((l) => l.key),
        note: note.trim() || undefined,
        bankLines: unmatched.length ? unmatched : undefined,
      };
      const res = isNew ? await reconApi.create({ ...body, accountId, from, to }) : await reconApi.update(id!, { ...body, version: saved!.version });
      toast.success(res.status === 'MATCHED' ? 'اتحفظت التسوية: متطابقة' : 'اتحفظت التسوية: فيها فرق');
      await queryClient.invalidateQueries({ queryKey: closeKeys.recon });
      onBack();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!id || !window.confirm('تحذف التسوية دي؟ الحركات اللي اتعلّمت فيها هترجع معلّقة.')) return;
    setBusy(true);
    try {
      await reconApi.remove(id);
      toast.success('اتحذفت التسوية');
      await queryClient.invalidateQueries({ queryKey: closeKeys.recon });
      onBack();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  if (savedError) return <ErrorBox error={savedError} />;
  if (!isNew && !saved) return <Spinner className="mx-auto my-10 size-7 text-gold" />;
  const ok = figures.diff === 0;
  const sym = currency ? CURRENCIES[currency].symbol : '';

  let banner: ReactNode = null;
  if (figures.diff !== null)
    banner = (
      <div className={`card flex items-start gap-3 p-4 ${ok ? 'border-success/40 bg-success/5 text-success' : 'border-danger/40 bg-danger/5 text-danger'}`}>
        {ok ? <CheckCircle2 className="mt-0.5 size-6 shrink-0" /> : <TriangleAlert className="mt-0.5 size-6 shrink-0" />}
        <div>
          <div className="font-bold">
            {ok
              ? figures.pending.length
                ? `متطابقة: الفرق صفر، وفيه ${figures.pending.length} حركة معلّقة هتتنقل لتسوية الفترة الجاية`
                : 'متطابقة: رصيد كشف البنك = رصيد السيستم، وكل الحركات ظاهرة في البنك'
              : `فيها فرق ${money(Math.abs(figures.diff!))} ${sym}: كشف البنك ${figures.diff! < 0 ? 'أقل' : 'أكتر'} من المفروض`}
          </div>
          <div className="text-xs text-muted">
            {ok
              ? 'تقدر تحفظ التسوية، وتتسجل باسمك وتاريخها.'
              : 'غالباً حركة في كشف البنك مش متسجلة عندنا (مصاريف بنكية، فوايد، رسوم تحويل) أو حركة اتعلّمت غلط. سجّلها من تحت، أو احفظ التسوية «فيها فرق» بملاحظة.'}
          </div>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onBack} className="focus-ring flex items-center gap-1 text-sm text-muted hover:text-gold">
          <ArrowRight className="size-4" /> سجل التسويات
        </button>
        {!isNew && saved && (
          <>
            <span className="text-sm text-muted">
              · {saved.account.name} · اتعملت بواسطة {saved.createdBy} في {formatDate(saved.createdAt)}
            </span>
            <StatusBadges status={saved.status} />
            <div className="flex-1" />
            <Link to={`/print/reconciliations/${saved.id}`} target="_blank" className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-sm hover:text-gold">
              <Printer className="size-4" /> طباعة / PDF / Excel
            </Link>
            {isCeo && saved.latest && (
              <Button variant="ghost" icon={<Trash2 className="size-4" />} loading={busy} onClick={remove}>
                حذف
              </Button>
            )}
          </>
        )}
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <SelectField
          label="الحساب البنكي"
          className="w-64"
          placeholder="اختار الحساب"
          disabled={!isNew}
          options={accounts.filter((a) => a.isActive || a.id === accountId).map((a) => ({ value: a.id, label: `${a.name} · ${CURRENCIES[a.currency].label}` }))}
          value={accountId ?? ''}
          onChange={(e) => {
            setAccountId(e.target.value ? Number(e.target.value) : null);
            setFrom('');
            setChecked(new Set());
            setUnmatched([]);
            setBankLines(null);
            setMatchInfo(null);
          }}
        />
        <TextField label="من" type="date" className="w-40" disabled={!isNew} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="إلى" type="date" className="w-40" disabled={!isNew} value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
        <TextField
          label={`رصيد كشف البنك في ${to ? formatDate(to) : '…'}`}
          className="w-52"
          inputMode="decimal"
          dir="ltr"
          disabled={!editable}
          value={statement}
          onChange={(e) => setStatement(e.target.value.replace(/[^\d.-]/g, ''))}
        />
        {editable && accountId && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
            <Button variant="ghost" icon={<FileUp className="size-4" />} onClick={() => fileRef.current?.click()}>
              ارفع كشف البنك (Excel)
            </Button>
          </>
        )}
        <div className="flex-1" />
        {isNew && draft?.last && (
          <div className="text-xs text-muted">
            آخر تسوية للحساب: لحد {formatDate(draft.last.to)} · {draft.last.status === 'MATCHED' ? 'متطابقة' : 'فيها فرق'}
          </div>
        )}
      </div>

      {sheet && mapping && <MappingPanel sheet={sheet} mapping={mapping} onChange={setMapping} onApply={applyMatch} onCancel={() => setSheet(null)} />}
      {matchInfo && <div className="card border-gold/40 bg-gold/5 p-3 text-sm font-semibold text-gold">{matchInfo}</div>}

      {draftError && <ErrorBox error={draftError} />}
      {!accountId ? (
        <div className="card p-8 text-center text-muted">اختار الحساب البنكي عشان تبدأ</div>
      ) : (isNew && !draft) || isFetching ? (
        <Spinner className="mx-auto my-10 size-7 text-gold" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="رصيد السيستم" value={money(system)} hint={`رصيد الحساب في ${formatDate(to)} عندنا`} />
            <Stat label="إيداعات لسه ما ظهرتش في البنك" value={figures.pIn ? `- ${money(figures.pIn)}` : '0.00'} hint={`${figures.inCount} حركة`} tone="text-warning" />
            <Stat label="شيكات / مدفوعات لسه ما اتصرفتش" value={figures.pOut ? `+ ${money(figures.pOut)}` : '0.00'} hint={`${figures.outCount} حركة`} tone="text-warning" />
            <Stat label="المفروض يكون في البنك" value={money(figures.expected)} hint="رصيد السيستم بعد المعلّق" />
            <Stat
              label="الفرق مع كشف البنك"
              value={figures.diff === null ? '—' : money(figures.diff)}
              hint={figures.diff === null ? 'اكتب رصيد الكشف' : ok ? 'مفيش فرق' : figures.diff < 0 ? 'البنك أقل من المفروض' : 'البنك أكتر من المفروض'}
              tone={figures.diff === null ? 'text-muted' : ok ? 'text-success' : 'text-danger'}
              ring={figures.diff === null ? '' : ok ? 'border-success/50' : 'border-danger/60'}
            />
          </div>

          {banner}

          {editable && (unmatched.length > 0 || (figures.diff !== null && !ok)) && (
            <div className="card space-y-3 border-dashed border-danger/50 p-4">
              <div className="font-bold">حاجة في كشف البنك ومش عندنا؟ سجّلها من هنا</div>
              {unmatched.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-muted">
                      <tr>
                        <th className="px-2 py-1.5">التاريخ</th>
                        <th className="px-2 py-1.5">البيان في الكشف</th>
                        <th className="px-2 py-1.5">المبلغ</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {unmatched.map((b, i) => (
                        <tr key={i} className="border-t border-line">
                          <td className="px-2 py-1.5">{formatDate(b.date)}</td>
                          <td className="px-2 py-1.5">{b.description || '—'}</td>
                          <td className={`px-2 py-1.5 tabular-nums ${b.amount < 0 ? 'text-danger' : 'text-success'}`}>{money(b.amount)}</td>
                          <td className="px-2 py-1.5">
                            <Button
                              variant="ghost"
                              onClick={() =>
                                setQuick({ kind: b.amount < 0 ? 'BANK_CHARGES' : 'INTEREST', date: b.date, amount: String(Math.abs(b.amount)), reason: b.description || '' })
                              }
                            >
                              سجّلها
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {quick ? (
                <div className="flex flex-wrap items-end gap-3">
                  <SelectField
                    label="النوع"
                    className="w-44"
                    options={(Object.keys(QUICK_KINDS) as QuickKind[]).map((k) => ({ value: k, label: QUICK_KINDS[k].label }))}
                    value={quick.kind}
                    onChange={(e) => setQuick({ ...quick, kind: e.target.value as QuickKind })}
                  />
                  <TextField label="التاريخ" type="date" className="w-40" value={quick.date} max={today()} onChange={(e) => setQuick({ ...quick, date: e.target.value })} />
                  <TextField label="المبلغ" className="w-36" dir="ltr" inputMode="decimal" value={quick.amount} onChange={(e) => setQuick({ ...quick, amount: e.target.value.replace(/[^\d.]/g, '') })} />
                  <TextField label="البيان" className="min-w-56 flex-1" value={quick.reason} onChange={(e) => setQuick({ ...quick, reason: e.target.value })} />
                  <Button loading={busy} disabled={!(Number(quick.amount) > 0) || quick.reason.trim().length < 3} onClick={record}>
                    سجّل الحركة
                  </Button>
                  <Button variant="ghost" onClick={() => setQuick(null)}>
                    إلغاء
                  </Button>
                  <p className="w-full text-xs text-muted">
                    بتتسجل حركة على الحساب بالتاريخ ده وتدخل دورة الاعتماد زي أي حركة، وبتتعلّم ظاهرة في البنك. اليوم اللي يوميته اتقفلت مينفعش يتسجل عليه، فسجّلها
                    بتاريخ النهاردة.
                  </p>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  icon={<Plus className="size-4" />}
                  onClick={() => setQuick({ kind: (figures.diff ?? 0) < 0 ? 'BANK_CHARGES' : 'INTEREST', date: today(), amount: figures.diff ? String(Math.abs(figures.diff)) : '', reason: '' })}
                >
                  سجّل حركة
                </Button>
              )}
            </div>
          )}

          <div className="card overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-bold">حركات الحساب ({lines.length})</span>
              {editable && lines.length > 0 && (
                <span className="flex gap-2">
                  <Button variant="ghost" onClick={() => setChecked(new Set(lines.map((l) => l.key)))}>
                    علّم الكل
                  </Button>
                  <Button variant="ghost" onClick={() => setChecked(new Set())}>
                    شيل العلامات
                  </Button>
                </span>
              )}
            </div>
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-surface-2 text-muted">
                <tr>
                  <th className="w-28 px-3 py-2">ظاهرة في البنك</th>
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">المستند</th>
                  <th className="px-3 py-2">البيان</th>
                  <th className="px-3 py-2">وارد</th>
                  <th className="px-3 py-2">منصرف</th>
                  <th className="px-3 py-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const on = checked.has(l.key);
                  const amt = Number(l.amount);
                  return (
                    <tr key={l.key} className={`border-t border-line ${on ? '' : 'bg-warning/5'}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" className="size-4 accent-[var(--gold-2)]" checked={on} disabled={!editable} onChange={() => toggle(l.key)} aria-label="ظاهرة في البنك" />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.date)}</td>
                      <td className="px-3 py-2" dir="ltr">
                        {l.ref}
                      </td>
                      <td className="px-3 py-2">
                        {l.description}
                        {(l.party || l.fileNo) && <div className="text-xs text-muted">{[l.party, l.fileNo].filter(Boolean).join(' · ')}</div>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-success">{amt > 0 ? money(amt) : ''}</td>
                      <td className="px-3 py-2 tabular-nums text-danger">{amt < 0 ? money(-amt) : ''}</td>
                      <td className="px-3 py-2">
                        {on ? (
                          <Badge tone="success">ظاهرة</Badge>
                        ) : (
                          <span className="inline-flex flex-wrap justify-center gap-1">
                            <Badge tone="warning">{amt < 0 ? 'لسه ما اتصرفش' : 'إيداع في الطريق'}</Badge>
                            {l.prior && <Badge>من فترة سابقة</Badge>}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted">
                      مفيش حركات معلّقة على الحساب لحد التاريخ ده
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {bankLines && bankLines.length > 0 && !isNew && (
            <div className="text-xs text-muted">الكشف المرفوع كان فيه {bankLines.length} سطر مش متطابق اتحفظوا مع التسوية.</div>
          )}

          {editable && (
            <div className="flex flex-wrap items-end gap-3">
              <TextField
                label={ok || figures.diff === null ? 'ملاحظة (اختياري)' : 'ملاحظة (لازمة عشان تحفظ وفيه فرق)'}
                className="min-w-72 flex-1"
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button loading={busy} disabled={figures.diff === null || (!ok && note.trim().length < 3) || !from} onClick={save}>
                {figures.diff === null ? 'حفظ التسوية' : ok ? 'حفظ التسوية · متطابقة' : 'حفظ التسوية · فيها فرق'}
              </Button>
            </div>
          )}
          {!editable && saved?.note && <div className="card p-3 text-sm">ملاحظة: {saved.note}</div>}
        </>
      )}
    </div>
  );
}

/** Bank reconciliation: the record of them, and one to do or review. */
export function ReconcileTab() {
  const [open, setOpen] = useState<{ id: number | null } | null>(null);
  return open ? <ReconEditor key={open.id ?? 'new'} id={open.id} onBack={() => setOpen(null)} /> : <ReconList onOpen={(id) => setOpen({ id })} onNew={() => setOpen({ id: null })} />;
}
