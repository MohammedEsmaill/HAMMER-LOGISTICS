import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Circle, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
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
import {
  financeApi,
  financeKeys,
  money,
  OTHER_KINDS,
  STATUS,
  today,
  useAccounts,
  type MoneyAccount,
  type OtherMovement,
  type Transfer,
} from './api';

const dateTime = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '';
const who = (u?: { email: string } | null) => u?.email.split('@')[0] ?? '';

/** The document's way through the three approval levels. */
export function ApprovalTrail({ doc }: { doc: Transfer | OtherMovement }) {
  const steps = [
    { label: 'التسجيل', by: doc.createdBy, at: doc.createdAt, done: true },
    { label: 'مراجعة المحاسب', by: doc.reviewedBy, at: doc.reviewedAt, done: !!doc.reviewedAt },
    { label: 'مدير الحسابات', by: doc.managerBy, at: doc.managerAt, done: !!doc.managerAt },
    { label: 'الاعتماد النهائي', by: doc.approvedBy, at: doc.approvedAt, done: !!doc.approvedAt },
  ];
  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">الاعتماد</h3>
        <Badge tone={STATUS[doc.approvalStatus].tone}>{STATUS[doc.approvalStatus].label}</Badge>
      </div>
      <ol className="space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3 text-sm">
            <span className={`grid size-6 place-items-center rounded-full ${s.done ? 'gold-fill' : 'bg-surface-2 text-muted'}`}>
              {s.done ? <Check className="size-3.5" /> : <Circle className="size-2.5" />}
            </span>
            <span className={`flex-1 ${s.done ? '' : 'text-muted'}`}>{s.label}</span>
            {s.done && (
              <span className="text-xs text-muted">
                {who(s.by)} · {dateTime(s.at)}
              </span>
            )}
          </li>
        ))}
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

/** Who may change this document now (the API enforces the same rule). */
function useEditable(doc: Transfer | OtherMovement | null) {
  const { can, user } = useAuth();
  if (!doc) return can('finance.movements.create');
  if (doc.approvalStatus === 'APPROVED') return can('finance.approved.edit');
  return doc.createdBy.id === user?.id || can('finance.approved.edit');
}

const accountOptions = (accounts: MoneyAccount[], keep?: number) =>
  accounts
    .filter((a) => a.isActive || a.id === keep)
    .map((a) => ({ value: a.id, label: `${a.name} · ${money(a.balance, a.currency)}` }));

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
  const { data: accounts = [] } = useAccounts();
  const editable = useEditable(transfer);
  const { register, handleSubmit, reset, control, setError, formState } = useForm<TransferIn, unknown, TransferOut>({
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
      const body = { ...f, chequeNo: f.chequeNo || null, notes: f.notes || null };
      return transfer
        ? financeApi.updateTransfer(transfer.id, { ...body, version: transfer.version })
        : financeApi.createTransfer({ ...body, chequeNo: body.chequeNo ?? undefined, notes: body.notes ?? undefined });
    },
    { success: transfer ? 'اتحفظ التحويل' : 'اتسجل التحويل', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
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
    if (from?.type === 'BANK' && !f.chequeNo) return setError('chequeNo', { message: 'رقم الشيك مطلوب لما الفلوس تطلع من البنك' });
    return save.mutateAsync(f).then(onClose, () => undefined);
  };
  const e = formState.errors;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={transfer ? `تحويل #${transfer.id}` : 'تحويل جديد'}
      description="إيداع من الخزنة للبنك، أو سحب بشيك من البنك للخزنة، أو من بنك لبنك. بنفس العملة دايمًا."
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
          <SelectField label="من" options={accountOptions(accounts, transfer?.fromAccount.id)} error={e.fromAccountId?.message} {...register('fromAccountId')} />
          <SelectField
            label="إلى"
            placeholder={from ? `حسابات ${from.currency === 'USD' ? 'الدولار' : 'الجنيه'}` : 'اختار "من" الأول'}
            options={toOptions}
            error={e.toAccountId?.message}
            {...register('toAccountId')}
          />
          <TextField label={`المبلغ${from ? ` (${from.currency})` : ''}`} type="number" step="0.01" min="0.01" dir="ltr" error={e.amount?.message} {...register('amount')} />
          {from?.type === 'BANK' && <TextField label="رقم الشيك / التحويل" dir="ltr" error={e.chequeNo?.message} {...register('chequeNo')} />}
          <TextField label="التاريخ" type="date" max={today()} error={e.transferDate?.message} {...register('transferDate')} />
          <TextField label="ملاحظات (اختياري)" error={e.notes?.message} {...register('notes')} />
        </fieldset>
        {transfer && editable && transfer.approvalStatus !== 'APPROVED' && (
          <p className="text-xs text-muted">أي تعديل بيرجّع التحويل للمراجعة من الأول، والأرصدة بتتصحح بقيد عكسي.</p>
        )}
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
      description="تمويل من الإدارة، أو مصاريف بنكية، أو تسوية فرق. السبب إجباري."
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
