import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDownLeft, ArrowUpRight, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { money as moneyField } from '@/lib/schemas';
import { CURRENCIES, financeApi, financeKeys, money, OTHER_KINDS, useLedger, type LedgerLine, type MoneyAccount } from './api';

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
});
/** A cash box has no bank and no account number. */
const cashSchema = bankSchema.extend({ bankName: z.string().optional(), accountNumber: z.string().optional() });
type BankIn = z.input<typeof bankSchema>;
type BankOut = z.output<typeof bankSchema>;

/** CEO: a new bank account, or an edit of any account (cash boxes: name and opening balance). */
export function AccountDrawer({ account, open, onClose }: { account: MoneyAccount | null; open: boolean; onClose: () => void }) {
  const isCash = account?.type === 'CASH';
  const { register, handleSubmit, reset, formState } = useForm<BankIn, unknown, BankOut>({
    resolver: zodResolver(isCash ? cashSchema : bankSchema) as never,
  });
  const [active, setActive] = useState(true);
  const save = useAction(
    (f: BankOut) => {
      if (!account) return financeApi.createBank(f);
      const opening = Number(f.openingBalance) !== Number(account.openingBalance) ? f.openingBalance : undefined;
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
      openingBalance: account?.openingBalance ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, account]);

  const e = formState.errors;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={account ? `تعديل ${account.name}` : 'حساب بنكي جديد'}
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
      <form id="account-form" noValidate className="space-y-4" onSubmit={handleSubmit((f) => save.mutateAsync(f).then(onClose, () => undefined))}>
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
        <TextField
          label="الرصيد الافتتاحي"
          type="number"
          step="0.01"
          min={0}
          dir="ltr"
          hint={account ? 'بيتعدل قبل أول حركة بس. أي فرق بعد كده يتسجل تسوية.' : 'الرصيد الحالي وقت إضافة الحساب'}
          error={e.openingBalance?.message}
          {...register('openingBalance')}
        />
        {account && !isCash && (
          <div className="flex items-center justify-between rounded-xl border border-line p-3">
            <div>
              <div className="font-semibold">الحساب شغال</div>
              <div className="text-xs text-muted">الحساب الموقوف مبتتسجلش عليه حركات جديدة، ومفيش حذف.</div>
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
  if (l.expense) return `${l.expense.expenseType.name} · ${l.expense.payee} · إيصال ${l.expense.receiptNo}`;
  return l.sourceLabel;
}

/** The account statement: every line with its running balance. */
export function LedgerDrawer({ account, onClose }: { account: MoneyAccount | null; onClose: () => void }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useLedger(account?.id ?? null, { from: from || undefined, to: to || undefined, page });
  const cur = account?.currency;

  useEffect(() => {
    setFrom('');
    setTo('');
    setPage(1);
  }, [account?.id]);

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
              {l.sourceLabel} #{l.transfer?.id ?? l.otherMovement?.id ?? l.salary?.id ?? l.advance?.id ?? l.expense?.id ?? l.custody?.id ?? l.feePayment?.id ?? l.collection?.id}
            </div>
            <div className="truncate text-xs text-muted">{describe(l)}</div>
          </div>
        </div>
      ),
    },
    { header: 'وارد', cell: (l) => (l.direction === 'IN' ? <span className="text-success" dir="ltr">{money(l.amount)}</span> : '') },
    { header: 'منصرف', cell: (l) => (l.direction === 'OUT' ? <span className="text-danger" dir="ltr">{money(l.amount)}</span> : '') },
    { header: 'الرصيد', cell: (l) => <b dir="ltr">{money(l.balanceAfter)}</b> },
  ];

  return (
    <Drawer open={!!account} onClose={onClose} width="max-w-4xl" title={account ? `كشف ${account.name}` : 'كشف الحساب'}>
      {account && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">الرصيد الحالي</div>
              <div className="text-xl font-bold text-gold" dir="ltr" style={{ textAlign: 'right' }}>
                {money(data?.account.balance ?? account.balance, cur)}
              </div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">وارد الفترة</div>
              <div className="text-lg font-bold text-success" dir="ltr" style={{ textAlign: 'right' }}>
                {money(data?.totals.in, cur)}
              </div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">منصرف الفترة</div>
              <div className="text-lg font-bold text-danger" dir="ltr" style={{ textAlign: 'right' }}>
                {money(data?.totals.out, cur)}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <TextField label="من" type="date" className="w-44" value={from} onChange={(e) => (setFrom(e.target.value), setPage(1))} />
            <TextField label="إلى" type="date" className="w-44" value={to} onChange={(e) => (setTo(e.target.value), setPage(1))} />
          </div>
          <p className="text-xs text-muted">الرصيد الافتتاحي: {money(account.openingBalance, cur)}</p>
          <DataTable columns={columns} rows={data?.items} rowKey={(l) => l.id} loading={isLoading} error={error} empty="مفيش حركات في الفترة دي" />
          <Pagination page={page} pageSize={30} total={data?.total ?? 0} onChange={setPage} />
        </div>
      )}
    </Drawer>
  );
}
