import { AR } from '@/lib/format';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Circle, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAction } from '@/lib/mutations';
import { BankPaymentFields, bankPaymentBody, bankPaymentOf, bankPaymentProblems, EMPTY_BANK_PAYMENT, type BankPaymentValue } from './BankPaymentFields';
import { accountOptions, useEditable } from './finance-helpers';
import {
  financeApi,
  financeKeys,
  OTHER_KINDS,
  STATUS,
  today,
  useAccounts,
  type Approval,
  type OtherMovement,
  type Transfer,
} from './api';

const dateTime = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat(AR, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '';
const who = (u?: { email: string } | null) => u?.email.split('@')[0] ?? '';

/**
 * The document's way through approval: the general auditor reviews, then the accounts
 * manager approves. Older documents may still show the accounts manager middle step,
 * or (salaries and advances) a single approval.
 */
export function ApprovalTrail({ doc }: { doc: Approval }) {
  const { can, user } = useAuth();
  const singleStep = !!doc.approvedAt && !doc.reviewedAt;
  const steps = [
    { label: 'التسجيل', by: doc.createdBy, at: doc.createdAt, done: true, role: '', permission: null },
    ...(singleStep
      ? []
      : [{ label: 'المراجعة', by: doc.reviewedBy, at: doc.reviewedAt, done: !!doc.reviewedAt, role: 'المراجع العام', permission: 'finance.review' as const }]),
    ...(doc.managerAt ? [{ label: 'موافقة مدير الحسابات', by: doc.managerBy, at: doc.managerAt, done: true, role: '', permission: null }] : []),
    { label: 'الاعتماد النهائي', by: doc.approvedBy, at: doc.approvedAt, done: !!doc.approvedAt, role: 'مدير الحسابات', permission: 'finance.approve' as const },
  ];
  // the step it waits at now (none once approved or rejected)
  const open = doc.approvalStatus === 'APPROVED' || doc.approvalStatus === 'REJECTED' ? -1 : steps.findIndex((s) => !s.done);
  const mine = (s: (typeof steps)[number]) => !!s.permission && can(s.permission) && doc.createdBy.id !== user?.id;
  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">مسار الاعتماد</h3>
        <Badge tone={STATUS[doc.approvalStatus].tone}>{STATUS[doc.approvalStatus].label}</Badge>
      </div>
      <ol className="relative space-y-3">
        {steps.map((s, i) => {
          const current = i === open;
          return (
            <li key={s.label} className="relative flex items-center gap-3 text-sm">
              {i < steps.length - 1 && (
                <span aria-hidden className={`absolute start-3 top-6 h-3 w-px -translate-x-1/2 ${s.done ? 'bg-gold' : 'bg-line'}`} />
              )}
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full ${
                  s.done ? 'gold-fill' : current ? 'border-2 border-gold text-gold' : 'bg-surface-2 text-muted'
                }`}
              >
                {s.done ? <Check className="size-3.5" /> : <Circle className={`size-2.5 ${current ? 'fill-current' : ''}`} />}
              </span>
              <span className={`flex-1 ${s.done ? '' : current ? 'font-semibold' : 'text-muted'}`}>{s.label}</span>
              {s.done && (
                <span className="text-xs text-muted">
                  {who(s.by)} · {dateTime(s.at)}
                </span>
              )}
              {current && <Badge tone="gold">{mine(s) ? 'مستنياك' : `مستنية ${s.role}`}</Badge>}
            </li>
          );
        })}
      </ol>
      {doc.approvalStatus === 'REJECTED' && (
        <div className="flex gap-2 rounded-lg bg-danger/10 p-3 text-sm text-danger">
          <X className="mt-0.5 size-4 shrink-0" />
          <div>
            <b>
              رفضها {who(doc.rejectedBy)} · {dateTime(doc.rejectedAt)}
            </b>
            <div>{doc.rejectionReason}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const amount = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.coerce
    .number({ required_error: 'اكتب المبلغ', invalid_type_error: 'اكتب رقم' })
    .positive('المبلغ لازم يكون أكبر من صفر')
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'رقمين عشريين بالكتير'),
);
const notFuture = z
  .string()
  .min(1, 'اختار التاريخ')
  .refine((v) => v <= today(), 'التاريخ مينفعش يبقى في المستقبل');

const transferSchema = z.object({
  fromAccountId: z.coerce.number().min(1, 'اختار الحساب'),
  toAccountId: z.coerce.number().min(1, 'اختار الحساب'),
  amount,
  chequeNo: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{0,30}$/, 'رقم الشيك حروف وأرقام بس'),
  transferDate: notFuture,
  notes: z.string().trim().max(500),
});
type TransferIn = z.input<typeof transferSchema>;
type TransferOut = z.output<typeof transferSchema>;

export function TransferDrawer({ transfer, open, onClose }: { transfer: Transfer | null; open: boolean; onClose: () => void }) {
  const { can } = useAuth();
  const { data: accounts = [] } = useAccounts();
  const cash = can('finance.movements.create');
  const editable = useEditable(transfer, cash ? 'finance.movements.create' : 'finance.bank.record');
  // money out of a cash box is the treasury manager's; out of a bank the accountant's too
  const fromAccounts = cash ? accounts : accounts.filter((a) => a.type === 'BANK');
  const [bank, setBank] = useState<BankPaymentValue>(EMPTY_BANK_PAYMENT);
  const [bankErrors, setBankErrors] = useState<Partial<Record<keyof BankPaymentValue, string>>>({});
  const { register, handleSubmit, reset, control, formState } = useForm<TransferIn, unknown, TransferOut>({
    resolver: zodResolver(transferSchema),
  });
  const fromId = Number(useWatch({ control, name: 'fromAccountId' }));
  const from = accounts.find((a) => a.id === fromId);
  const toOptions = useMemo(
    () => accountOptions(accounts.filter((a) => a.id !== fromId && (!from || a.currency === from.currency)), transfer?.toAccount.id),
    [accounts, fromId, from, transfer],
  );
  const save = useAction(
    (f: TransferOut) => {
      const pay = from?.type === 'BANK' ? { ...bankPaymentBody(bank), chequeNo: bank.reference.trim() } : { chequeNo: null };
      const body = { ...f, ...pay, notes: f.notes || null };
      return transfer
        ? financeApi.updateTransfer(transfer.id, { ...body, version: transfer.version })
        : financeApi.createTransfer({ ...body, chequeNo: body.chequeNo ?? undefined, notes: body.notes ?? undefined });
    },
    { success: transfer ? 'اتحفظ التحويل' : 'اتسجل التحويل', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    setBank(bankPaymentOf(transfer, transfer?.chequeNo));
    setBankErrors({});
    reset({
      fromAccountId: transfer?.fromAccount.id ?? '',
      toAccountId: transfer?.toAccount.id ?? '',
      amount: transfer?.amount ?? '',
      chequeNo: transfer?.chequeNo ?? '',
      transferDate: transfer?.transferDate.slice(0, 10) ?? today(),
      notes: transfer?.notes ?? '',
    } as unknown as TransferIn); // empty selects start as ''
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, transfer]);

  const submit = (f: TransferOut) => {
    if (from?.type === 'BANK') {
      const p = bankPaymentProblems(bank);
      setBankErrors(p);
      if (Object.keys(p).length) return;
    }
    return save.mutateAsync(f).then(onClose, () => undefined);
  };
  const e = formState.errors;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={transfer ? `تحويل #${transfer.id}` : 'تحويل جديد'}
      footer={
        editable && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button form="transfer-form" type="submit" loading={save.isPending}>
              {transfer ? 'حفظ التعديل' : 'تسجيل'}
            </Button>
          </div>
        )
      }
    >
      <form id="transfer-form" noValidate className="space-y-4" onSubmit={handleSubmit(submit)}>
        <fieldset disabled={!editable} className="space-y-4">
          <SelectField label="من" options={accountOptions(fromAccounts, transfer?.fromAccount.id)} error={e.fromAccountId?.message} {...register('fromAccountId')} />
          <SelectField
            label="إلى"
            placeholder={from ? `حسابات ${from.currency === 'USD' ? 'الدولار' : 'الجنيه'}` : 'اختار "من" الأول'}
            options={toOptions}
            error={e.toAccountId?.message}
            {...register('toAccountId')}
          />
          <TextField label={`المبلغ${from ? ` (${from.currency})` : ''}`} type="number" step="0.01" min="0.01" dir="ltr" error={e.amount?.message} {...register('amount')} />
          {from?.type === 'BANK' && <BankPaymentFields value={bank} onChange={setBank} errors={bankErrors} currency={from.currency} />}
          <TextField label="التاريخ" type="date" max={today()} error={e.transferDate?.message} {...register('transferDate')} />
          <TextField label="ملاحظات (اختياري)" error={e.notes?.message} {...register('notes')} />
        </fieldset>
        {save.error ? <ErrorBox error={save.error} /> : null}
        {transfer && <ApprovalTrail doc={transfer} />}
      </form>
    </Drawer>
  );
}

const otherSchema = z.object({
  accountId: z.coerce.number().min(1, 'اختار الحساب'),
  kind: z.enum(['FUNDING', 'BANK_CHARGES', 'ADJUSTMENT']),
  direction: z.enum(['IN', 'OUT']),
  amount,
  reason: z.string().trim().min(3, 'اكتب السبب (3 حروف على الأقل)').max(500),
  movementDate: notFuture,
});
type OtherIn = z.input<typeof otherSchema>;
type OtherOut = z.output<typeof otherSchema>;

export function OtherDrawer({ movement, open, onClose }: { movement: OtherMovement | null; open: boolean; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const editable = useEditable(movement);
  const { register, handleSubmit, reset, control, setError, setValue, formState } = useForm<OtherIn, unknown, OtherOut>({
    resolver: zodResolver(otherSchema),
  });
  const kind = useWatch({ control, name: 'kind' });
  const accountId = Number(useWatch({ control, name: 'accountId' }));
  const account = accounts.find((a) => a.id === accountId);
  const save = useAction(
    (f: OtherOut) =>
      movement
        ? financeApi.updateOther(movement.id, { version: movement.version, amount: f.amount, reason: f.reason, movementDate: f.movementDate })
        : financeApi.createOther({ ...f, direction: f.kind === 'ADJUSTMENT' ? f.direction : undefined }),
    { success: movement ? 'اتحفظت الحركة' : 'اتسجلت الحركة', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    reset({
      accountId: movement?.account.id ?? '',
      kind: movement?.kind ?? 'FUNDING',
      direction: movement?.direction ?? 'IN',
      amount: movement?.amount ?? '',
      reason: movement?.reason ?? '',
      movementDate: movement?.movementDate.slice(0, 10) ?? today(),
    } as unknown as OtherIn); // an empty select starts as ''
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, movement]);

  useEffect(() => {
    if (kind === 'FUNDING') setValue('direction', 'IN');
    if (kind === 'BANK_CHARGES') setValue('direction', 'OUT');
  }, [kind, setValue]);

  const submit = (f: OtherOut) => {
    if (f.kind === 'BANK_CHARGES' && account?.type !== 'BANK') return setError('accountId', { message: 'المصاريف البنكية على حساب بنكي بس' });
    return save.mutateAsync(f).then(onClose, () => undefined);
  };
  const e = formState.errors;
  const fixed = !!movement; // account, kind and direction do not change after recording

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={movement ? `${OTHER_KINDS[movement.kind]} #${movement.id}` : 'حركة جديدة'}
      footer={
        editable && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button form="other-form" type="submit" loading={save.isPending}>
              {movement ? 'حفظ التعديل' : 'تسجيل'}
            </Button>
          </div>
        )
      }
    >
      <form id="other-form" noValidate className="space-y-4" onSubmit={handleSubmit(submit)}>
        <fieldset disabled={!editable} className="space-y-4">
          <SelectField
            label="النوع"
            disabled={fixed}
            options={Object.entries(OTHER_KINDS).map(([value, label]) => ({ value, label }))}
            {...register('kind')}
          />
          <SelectField
            label="الخزنة / الحساب"
            disabled={fixed}
            options={accountOptions(kind === 'BANK_CHARGES' ? accounts.filter((a) => a.type === 'BANK') : accounts, movement?.account.id)}
            error={e.accountId?.message}
            {...register('accountId')}
          />
          {kind === 'ADJUSTMENT' && (
            <SelectField
              label="الاتجاه"
              disabled={fixed}
              options={[
                { value: 'IN', label: 'دخول (زيادة الرصيد)' },
                { value: 'OUT', label: 'خروج (نقص الرصيد)' },
              ]}
              {...register('direction')}
            />
          )}
          <TextField label={`المبلغ${account ? ` (${account.currency})` : ''}`} type="number" step="0.01" min="0.01" dir="ltr" error={e.amount?.message} {...register('amount')} />
          <TextField label="السبب" error={e.reason?.message} {...register('reason')} />
          <TextField label="التاريخ" type="date" max={today()} error={e.movementDate?.message} {...register('movementDate')} />
        </fieldset>
        {save.error ? <ErrorBox error={save.error} /> : null}
        {movement && <ApprovalTrail doc={movement} />}
      </form>
    </Drawer>
  );
}
