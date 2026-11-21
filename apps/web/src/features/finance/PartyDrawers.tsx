import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Switch } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAction } from '@/lib/mutations';
import { accountOptions, useEditable } from './finance-helpers';
import { financeKeys, today, useAccounts } from './api';
import { ApprovalTrail } from './MovementDrawers';
import { BankPaymentFields, bankPaymentBody, bankPaymentOf, bankPaymentProblems, EMPTY_BANK_PAYMENT, type BankPaymentValue } from './BankPaymentFields';
import {
  PARTY_KINDS,
  PARTY_MOVEMENT_KINDS,
  partiesApi,
  usePartyOptions,
  type Party,
  type PartyMovement,
} from './parties-api';

const partySchema = z.object({
  name: z.string().trim().min(2, 'اكتب اسم الجهة').max(100),
  kind: z.enum(['SISTER_COMPANY', 'OWNER']),
  notes: z.string().trim().max(500).optional(),
});
type PartyForm = z.infer<typeof partySchema>;

/** CEO: a new party (sister company or owner), or an edit of one. */
export function PartyDrawer({ party, open, onClose }: { party: Party | null; open: boolean; onClose: () => void }) {
  const { register, handleSubmit, reset, formState } = useForm<PartyForm>({ resolver: zodResolver(partySchema) });
  const [active, setActive] = useState(true);
  const save = useAction(
    (f: PartyForm) =>
      party
        ? partiesApi.update(party.id, { name: f.name, notes: f.notes || null, isActive: active })
        : partiesApi.create({ name: f.name, kind: f.kind, notes: f.notes || undefined }),
    { success: party ? 'اتحفظت الجهة' : 'اتضافت الجهة', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    setActive(party?.isActive ?? true);
    reset({ name: party?.name ?? '', kind: party?.kind ?? 'SISTER_COMPANY', notes: party?.notes ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, party]);

  const e = formState.errors;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={party ? `تعديل ${party.name}` : 'جهة جديدة'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="party-form" type="submit" loading={save.isPending}>
            حفظ
          </Button>
        </div>
      }
    >
      <form id="party-form" noValidate className="space-y-4" onSubmit={handleSubmit((f) => save.mutateAsync(f).then(onClose, () => undefined))}>
        <TextField label="اسم الجهة" placeholder="هامر للنقل" error={e.name?.message} {...register('name')} />
        <SelectField
          label="النوع"
          disabled={!!party}
          title={party ? 'النوع مبيتغيرش' : undefined}
          options={Object.entries(PARTY_KINDS).map(([value, label]) => ({ value, label }))}
          {...register('kind')}
        />
        <TextField label="ملاحظات (اختياري)" error={e.notes?.message} {...register('notes')} />
        {party && (
          <div className="flex items-center justify-between rounded-xl border border-line p-3">
            <div>
              <div className="font-semibold">الجهة شغالة</div>
              <div className="text-xs text-muted">الموقوفة مبتظهرش في تسجيل حركة جديدة</div>
            </div>
            <Switch checked={active} onChange={setActive} label="الجهة شغالة" />
          </div>
        )}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </form>
    </Drawer>
  );
}

const amount = z.coerce.number({ message: 'اكتب المبلغ' }).positive('المبلغ لازم يكون أكبر من صفر').max(999_999_999_999);
const movementSchema = z
  .object({
    partyId: z.coerce.number().min(1, 'اختار الجهة'),
    kind: z.enum(['FUNDING', 'PAYMENT', 'SHARED_DEBT']),
    accountId: z.coerce.number().min(1, 'اختار الخزنة أو الحساب'),
    amount,
    movementDate: z.string().min(1, 'اختار التاريخ').refine((d) => d <= today(), 'التاريخ مينفعش يكون بعد النهاردة'),
    payee: z.string().trim().max(150).optional(),
    reference: z.string().trim().max(50).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((f) => f.kind !== 'SHARED_DEBT' || (f.payee ?? '').length >= 2, { path: ['payee'], message: 'اكتب اتدفع لمين' });
type MovementIn = z.input<typeof movementSchema>;
type MovementOut = z.output<typeof movementSchema>;

/**
 * A movement on an internal account: a new one (from the journal or the party's page),
 * or an existing one to view and, for its author until approval, to edit.
 */
export function PartyMovementDrawer({
  movement,
  partyId,
  open,
  onClose,
}: {
  movement: PartyMovement | null;
  partyId?: number;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const { data: allAccounts = [] } = useAccounts();
  // cash movements are the treasury manager's; the accountant records on banks only
  const accounts = can('finance.movements.create') ? allAccounts : allAccounts.filter((a) => a.type === 'BANK');
  const { data: parties = [] } = usePartyOptions(open);
  const editable = useEditable(movement, 'finance.parties.record');
  const [pay, setPay] = useState<BankPaymentValue>(EMPTY_BANK_PAYMENT);
  const [payErrors, setPayErrors] = useState<Partial<Record<keyof BankPaymentValue, string>>>({});
  const { register, handleSubmit, reset, control, formState } = useForm<MovementIn, unknown, MovementOut>({
    resolver: zodResolver(movementSchema),
  });
  const kind = useWatch({ control, name: 'kind' });
  const accountId = useWatch({ control, name: 'accountId' });
  const account = allAccounts.find((a) => a.id === Number(accountId));
  // money out of a bank: by transfer or cheque, with the charges
  const bankOut = account?.type === 'BANK' && kind !== 'FUNDING';
  const save = useAction(
    (f: MovementOut) =>
      movement
        ? partiesApi.updateMovement(movement.id, {
            version: movement.version,
            accountId: f.accountId,
            amount: f.amount,
            movementDate: f.movementDate,
            payee: f.kind === 'SHARED_DEBT' ? f.payee : undefined,
            reference: (bankOut ? pay.reference.trim() : f.reference) || null,
            notes: f.notes || null,
            ...(bankOut ? bankPaymentBody(pay) : {}),
          })
        : partiesApi.createMovement({
            ...f,
            payee: f.kind === 'SHARED_DEBT' ? f.payee : undefined,
            reference: (bankOut ? pay.reference.trim() : f.reference) || undefined,
            notes: f.notes || undefined,
            ...(bankOut ? bankPaymentBody(pay) : {}),
          }),
    { success: movement ? 'اتحفظت الحركة' : 'اتسجلت الحركة', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    setPay(bankPaymentOf(movement, movement?.reference));
    setPayErrors({});
    reset({
      partyId: movement?.party.id ?? partyId ?? '',
      kind: movement?.kind ?? 'FUNDING',
      accountId: movement?.account.id ?? '',
      amount: movement?.amount ?? '',
      movementDate: movement?.movementDate.slice(0, 10) ?? today(),
      payee: movement?.payee ?? '',
      reference: movement?.reference ?? '',
      notes: movement?.notes ?? '',
    } as unknown as MovementIn); // an empty select starts as ''
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, movement]);

  // an edit keeps the currency: only accounts of the same currency
  const accountChoices = movement ? accounts.filter((a) => a.currency === movement.currency) : accounts;
  const submit = (f: MovementOut) => {
    if (bankOut) {
      const p = bankPaymentProblems(pay);
      setPayErrors(p);
      if (Object.keys(p).length) return;
    }
    return save.mutateAsync(f).then(onClose, () => undefined);
  };
  const e = formState.errors;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={movement ? `${PARTY_MOVEMENT_KINDS[movement.kind].label} · ${movement.party.name} #${movement.id}` : 'حركة حساب داخلي'}
      footer={
        editable && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button form="party-movement-form" type="submit" loading={save.isPending}>
              {movement ? 'حفظ التعديل' : 'تسجيل'}
            </Button>
          </div>
        )
      }
    >
      <form id="party-movement-form" noValidate className="space-y-4" onSubmit={handleSubmit(submit)}>
        <fieldset disabled={!editable} className="space-y-4">
          <SelectField
            label="الجهة"
            disabled={!!movement || !!partyId}
            options={(movement ? [movement.party] : parties).map((p) => ({ value: p.id, label: `${p.name} · ${PARTY_KINDS[p.kind]}` }))}
            error={e.partyId?.message}
            {...register('partyId')}
          />
          <SelectField
            label="نوع الحركة"
            disabled={!!movement}
            options={Object.entries(PARTY_MOVEMENT_KINDS).map(([value, k]) => ({ value, label: k.label }))}
            {...register('kind')}
          />
          {kind && <p className="-mt-2 text-xs text-muted">{PARTY_MOVEMENT_KINDS[kind].hint}</p>}
          <SelectField
            label={kind === 'FUNDING' ? 'دخلت على' : 'اتصرفت من'}
            options={accountOptions(accountChoices, movement?.account.id)}
            error={e.accountId?.message}
            {...register('accountId')}
          />
          <TextField label={`المبلغ${account ? ` (${account.currency})` : ''}`} type="number" step="0.01" min="0.01" dir="ltr" error={e.amount?.message} {...register('amount')} />
          {kind === 'SHARED_DEBT' && <TextField label="اتدفع لمين" error={e.payee?.message} {...register('payee')} />}
          {bankOut ? (
            <BankPaymentFields value={pay} onChange={setPay} errors={payErrors} currency={account?.currency} />
          ) : (
            <TextField label="رقم مرجعي (اختياري)" dir="ltr" error={e.reference?.message} {...register('reference')} />
          )}
          <TextField label="التاريخ" type="date" max={today()} error={e.movementDate?.message} {...register('movementDate')} />
          <TextField label="ملاحظات (اختياري)" error={e.notes?.message} {...register('notes')} />
        </fieldset>
        {save.error ? <ErrorBox error={save.error} /> : null}
        {movement && <ApprovalTrail doc={movement} />}
      </form>
    </Drawer>
  );
}
