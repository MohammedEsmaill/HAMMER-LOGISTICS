import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDownLeft, ArrowUpRight, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Switch } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { useAction } from '@/lib/mutations';
import { useListState, usePageSize } from '@/lib/use-list-state';
import { money as moneyField } from '@/lib/schemas';
import { usePartyOptions } from './parties-api';
import { CURRENCIES, financeApi, financeKeys, money, OTHER_KINDS, today, useLedger, type LedgerLine, type MoneyAccount } from './api';

const accountNumber = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{4,34}$/, 'رقم الحساب من 4 لـ 34 حرف أو رقم (ممكن IBAN)');

const bankSchema = z.object({
  name: z.string().trim().min(2, 'اكتب اسم الحساب').max(100),
  bankName: z.string().trim().min(2, 'اكتب اسم البنك').max(100),
  accountNumber,
  currency: z.enum(['EGP', 'USD']),
  openingBalance: moneyField,
  ownership: z.enum(['COMPANY', 'PERSONAL']),
  ownerPartyId: z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.number().int().optional()),
});
/** A cash box has no bank and no account number. */
const cashSchema = bankSchema.extend({ bankName: z.string().optional(), accountNumber: z.string().optional() });
type BankIn = z.input<typeof bankSchema>;
type BankOut = z.output<typeof bankSchema>;

/** CEO: a new bank account, or an edit of any account (cash boxes: name and opening balance). */
export function AccountDrawer({ account, open, onClose }: { account: MoneyAccount | null; open: boolean; onClose: () => void }) {
  const isCash = account?.type === 'CASH';
  const { register, handleSubmit, reset, control, setError, setValue, formState } = useForm<BankIn, unknown, BankOut>({
    resolver: zodResolver(isCash ? cashSchema : bankSchema) as never,
  });
  const ownership = useWatch({ control, name: 'ownership' });
  const personal = (account?.ownership ?? ownership) === 'PERSONAL';
  // who only sets the accounts up (the moderator) sees no figures: the opening balance stays as it is
  const noFigures = !!account && account.openingBalance === null;
  const { data: parties = [] } = usePartyOptions(open && !account);
  const owners = parties.filter((p) => p.kind === 'OWNER');
  // a personal account has no opening balance: the hidden field holds 0
  useEffect(() => {
    if (personal || noFigures) setValue('openingBalance', 0 as unknown as BankIn['openingBalance']);
  }, [personal, noFigures, setValue]);
  const [active, setActive] = useState(true);
  const save = useAction(
    (f: BankOut) => {
      if (!account) {
        return financeApi.createBank({
          ...f,
          openingBalance: f.ownership === 'PERSONAL' ? 0 : f.openingBalance,
          ownerPartyId: f.ownership === 'PERSONAL' ? f.ownerPartyId : undefined,
        });
      }
      const opening = !noFigures && Number(f.openingBalance) !== Number(account.openingBalance) ? f.openingBalance : undefined;
      return financeApi.updateAccount(account.id, {
        name: f.name,
        ...(isCash ? {} : { bankName: f.bankName, accountNumber: f.accountNumber }),
        openingBalance: opening,
        ...(isCash ? {} : { isActive: active }),
      });
    },
    { success: account ? 'اتحفظ الحساب' : 'اتضاف الحساب البنكي', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    setActive(account?.isActive ?? true);
    reset({
      name: account?.name ?? '',
      bankName: account?.bankName ?? '',
      accountNumber: account?.accountNumber ?? '',
      currency: account?.currency ?? 'EGP',
      openingBalance: account?.openingBalance ?? (account ? 0 : ''),
      ownership: account?.ownership ?? 'COMPANY',
      ownerPartyId: account?.ownerParty?.id ?? '',
    } as unknown as BankIn);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, account]);

  const e = formState.errors;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={account ? `تعديل ${account.name}` : personal ? 'حساب شخصي لمالك' : 'حساب بنكي جديد'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="account-form" type="submit" loading={save.isPending}>
            حفظ
          </Button>
        </div>
      }
    >
      <form
        id="account-form"
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit((f) => {
          if (!account && f.ownership === 'PERSONAL' && !f.ownerPartyId) return setError('ownerPartyId', { message: 'اختار المالك' });
          return save.mutateAsync(f).then(onClose, () => undefined);
        })}
      >
        {!account && (
          <>
            <SelectField
              label="نوع الحساب"
              options={[
                { value: 'COMPANY', label: 'حساب الشركة' },
                { value: 'PERSONAL', label: 'حساب شخصي لمالك (قناة دفع)' },
              ]}
              {...register('ownership')}
            />
            {personal && (
              <>
                <SelectField
                  label="المالك"
                  placeholder={owners.length ? 'اختار...' : 'ضيف المالك الأول من الحسابات الداخلية'}
                  options={owners.map((p) => ({ value: p.id, label: p.name }))}
                  error={e.ownerPartyId?.message}
                  {...register('ownerPartyId')}
                />
                <p className="-mt-2 text-xs text-muted">الحساب الشخصي بيظهر فيه الداخل والخارج بس، ملوش رصيد ومش داخل في إجمالي الخزن.</p>
              </>
            )}
          </>
        )}
        <TextField label="اسم الحساب" placeholder="البنك الأهلي - جنيه" error={e.name?.message} {...register('name')} />
        {!isCash && (
          <>
            <TextField label="اسم البنك" error={e.bankName?.message} {...register('bankName')} />
            <TextField label="رقم الحساب / IBAN" dir="ltr" error={e.accountNumber?.message} {...register('accountNumber')} />
            <SelectField
              label="العملة"
              disabled={!!account}
              title={account ? 'العملة مبتتغيرش' : undefined}
              options={Object.entries(CURRENCIES).map(([value, c]) => ({ value, label: c.label }))}
              {...register('currency')}
            />
          </>
        )}
        {!personal && !noFigures && (
          <TextField
            label="الرصيد الافتتاحي"
            type="number"
            step="0.01"
            min={0}
            dir="ltr"
            error={e.openingBalance?.message}
            {...register('openingBalance')}
          />
        )}
        {account && !isCash && (
          <div className="flex items-center justify-between rounded-xl border border-line p-3">
            <div>
              <div className="font-semibold">الحساب شغال</div>
            </div>
            <Switch checked={active} onChange={setActive} label="الحساب شغال" />
          </div>
        )}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </form>
    </Drawer>
  );
}

function describe(l: LedgerLine): string {
  if (l.transfer) {
    const t = l.transfer;
    return `${l.direction === 'IN' ? `من ${t.fromAccount.name}` : `إلى ${t.toAccount.name}`}${t.chequeNo ? ` · شيك ${t.chequeNo}` : ''}`;
  }
  if (l.otherMovement) return `${OTHER_KINDS[l.otherMovement.kind]} · ${l.otherMovement.reason}`;
  if (l.salary) return `${l.salary.employee.fullName} · ${l.salary.salaryMonth.slice(0, 7)}`;
  if (l.advance) return l.advance.employee.fullName;
  if (l.custody) return `${l.custody.custodyNo} · ملف ${l.custody.shipment.fileNo}`;
  if (l.collection) return `${l.collection.client.name} · ملف ${l.collection.shipment.fileNo}`;
  if (l.feePayment) return `أتعاب ${l.feePayment.fee.clearer.fullName} · ملف ${l.feePayment.fee.shipment.fileNo}`;
  if (l.partyMovement) return `${l.partyMovement.party.name}${l.partyMovement.payee ? ` · ${l.partyMovement.payee}` : ''}`;
  if (l.expense) return `${l.expense.expenseType.name} · ${l.expense.payee} · إيصال ${l.expense.receiptNo}`;
  return l.sourceLabel;
}

/** The document a statement line came from. */
export const lineDocument = (l: LedgerLine) => ({
  type: l.source,
  id: (l.transfer?.id ?? l.otherMovement?.id ?? l.salary?.id ?? l.advance?.id ?? l.expense?.id ?? l.custody?.id ?? l.feePayment?.id ?? l.collection?.id ?? l.partyMovement?.id)!,
});

/** The account statement: every line with its running balance, by period, page by page. */
/** The first and last day of this month or the one before, as yyyy-mm-dd. */
function monthRange(back: 0 | 1) {
  const now = today();
  const [y, m] = now.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 - back, 1));
  const last = new Date(Date.UTC(y, m - back, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: back ? iso(last) : now };
}

const PERIODS = [
  { key: 'month', label: 'الشهر ده', range: () => monthRange(0) },
  { key: 'last', label: 'الشهر اللي فات', range: () => monthRange(1) },
  { key: 'all', label: 'كل الفترات', range: () => ({ from: '', to: '' }) },
] as const;

const DIRECTIONS = [
  { key: '', label: 'الكل' },
  { key: 'IN', label: 'وارد بس' },
  { key: 'OUT', label: 'منصرف بس' },
] as const;

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`focus-ring h-9 rounded-full border px-4 text-sm transition-colors ${
        on ? 'border-gold/40 bg-gold/15 font-semibold text-gold' : 'border-line text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold whitespace-nowrap ${tone ?? ''}`} dir="ltr">
        {value}
      </div>
    </div>
  );
}

export function AccountStatement({ account, onOpenLine }: { account: MoneyAccount; onOpenLine?: (l: LedgerLine) => void }) {
  const [pageSize, setPageSize] = usePageSize();
  const [{ from, to, direction, page }, setList] = useListState({ from: '', to: '', direction: '' as '' | 'IN' | 'OUT', page: 1 });
  const { data, isLoading, error } = useLedger(account.id, { from: from || undefined, to: to || undefined, page, direction: direction || undefined, pageSize });
  const setRange = (r: { from: string; to: string }) => setList(r);
  const setDirection = (d: '' | 'IN' | 'OUT') => setList({ direction: d });
  const setPage = (p: number) => setList({ page: p });
  const cur = account.currency;
  const period = PERIODS.find((p) => {
    const r = p.range();
    return r.from === from && r.to === to;
  })?.key;
  const setFrom = (v: string) => setList({ from: v });
  const setTo = (v: string) => setList({ to: v });

  const columns: Column<LedgerLine>[] = [
    { header: 'التاريخ', cell: (l) => <span className="whitespace-nowrap">{formatDate(l.movementDate)}</span> },
    {
      header: 'البيان',
      cell: (l) => (
        <div className="flex items-start gap-2">
          {l.reversalOfId ? (
            <Undo2 className="mt-0.5 size-4 shrink-0 text-warning" />
          ) : l.direction === 'IN' ? (
            <ArrowDownLeft className="mt-0.5 size-4 shrink-0 text-success" />
          ) : (
            <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-danger" />
          )}
          <div className="min-w-0">
            <div className="text-sm">
              {l.reversalOfId && <span className="text-warning">قيد عكسي · </span>}
              {l.sourceLabel} #{lineDocument(l).id}
            </div>
            <div className="truncate text-xs text-muted">{describe(l)}</div>
          </div>
        </div>
      ),
    },
    { header: 'وارد', cell: (l) => (l.direction === 'IN' ? <span className="text-success" dir="ltr">{money(l.amount)}</span> : '') },
    { header: 'منصرف', cell: (l) => (l.direction === 'OUT' ? <span className="text-danger" dir="ltr">{money(l.amount)}</span> : '') },
    // a personal account is a payment channel: no running balance
    ...(account.ownership === 'PERSONAL' ? [] : [{ header: 'الرصيد', cell: (l: LedgerLine) => <b dir="ltr">{money(l.balanceAfter)}</b> }]),
  ];

  return (
    <div className="space-y-4">
      {/* the current balance is in the page header above */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="وارد الفترة" value={money(data?.totals.in, cur)} tone="text-success" />
        <StatCard label="منصرف الفترة" value={money(data?.totals.out, cur)} tone="text-danger" />
        <StatCard label="عدد الحركات" value={data?.totals.count ?? 0} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Chip key={p.key} on={period === p.key} onClick={() => setRange(p.range())}>
            {p.label}
          </Chip>
        ))}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        {DIRECTIONS.map((d) => (
          <Chip key={d.key} on={direction === d.key} onClick={() => setDirection(d.key)}>
            {d.label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <TextField label="من" type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label="إلى" type="date" className="w-44" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(l) => l.id}
        loading={isLoading}
        error={error}
        empty={direction ? `مفيش ${direction === 'IN' ? 'وارد' : 'منصرف'} في الفترة دي` : 'مفيش حركات في الفترة دي'}
        onRowClick={onOpenLine}
      />
      <Pagination page={page} pageSize={pageSize} total={data?.total ?? 0} onChange={setPage} onPageSizeChange={(n) => (setPageSize(n), setPage(1))} />
    </div>
  );
}
