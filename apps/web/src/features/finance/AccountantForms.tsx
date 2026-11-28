import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ComboField } from '@/components/ui/ComboField';
import { Drawer } from '@/components/ui/Drawer';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { toastError, useAction } from '@/lib/mutations';
import { BANK_METHODS, CURRENCIES, EXPENSE_CATEGORIES, financeKeys, money, today, useAccounts, type BankPaymentMethod, type MoneyAccount } from './api';
import { beneficiariesApi, custodyApi, useBeneficiaries, useCustodies, useShipmentSearch, type CustodiesQuery, type Purpose } from './custody-api';
import { officeApi, useExpenseTypes } from './office-api';
import { partiesApi, usePartyOptions, PARTY_KINDS } from './parties-api';

/**
 * The accountant's four forms (bank only): a transfer to a shipping line, a clearer's
 * custody, a general expense from the fixed list, and an internal transfer with a
 * sister company or an owner.
 */

export type AccountantForm = 'SHIP' | 'CLEARER' | 'EXPENSE' | 'INTERNAL';

const validAmount = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) > 0;
const REF = /^[A-Za-z0-9/-]{1,40}$/;

const bankOptions = (banks: MoneyAccount[]) => banks.map((a) => ({ value: a.id, label: `${a.name} · ${money(a.balance, a.currency)}` }));

function Segment<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-xl bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }} role="radiogroup">
      {options.map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`focus-ring rounded-lg px-3 py-2 text-sm font-semibold ${value === k ? 'gold-fill' : 'text-muted hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-muted">{label}</div>
      {children}
    </div>
  );
}

function Shell({ open, title, onClose, saving, submitLabel, children, formId }: { open: boolean; title: string; onClose: () => void; saving: boolean; submitLabel: string; children: ReactNode; formId: string }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-xl"
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form={formId} type="submit" loading={saving}>
            {submitLabel}
          </Button>
        </div>
      }
    >
      {children}
    </Drawer>
  );
}

/** The bank side of a payment: the account, transfer or cheque, its reference, the charges. */
function BankFields({
  banks,
  accountId,
  setAccountId,
  method,
  setMethod,
  reference,
  setReference,
  charges,
  setCharges,
  problems,
  accountLabel = 'اتحوّل من',
  withCharges = true,
}: {
  banks: MoneyAccount[];
  accountId: number | '';
  setAccountId: (v: number | '') => void;
  method: BankPaymentMethod;
  setMethod: (m: BankPaymentMethod) => void;
  reference: string;
  setReference: (v: string) => void;
  charges?: string;
  setCharges?: (v: string) => void;
  problems: Record<string, string>;
  accountLabel?: string;
  withCharges?: boolean;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={accountLabel}
          placeholder="اختار الحساب البنكي"
          options={bankOptions(banks)}
          value={accountId}
          error={problems.account}
          onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
        />
        <Field label="طريقة الدفع">
          <Segment value={method} options={Object.entries(BANK_METHODS).map(([k, v]) => [k as BankPaymentMethod, v])} onChange={setMethod} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="الرقم المرجعي" dir="ltr" value={reference} error={problems.reference} onChange={(e) => setReference(e.target.value)} />
        {withCharges && setCharges && (
          <TextField label="مصاريف بنكية" dir="ltr" inputMode="decimal" value={charges} error={problems.charges} onChange={(e) => setCharges(e.target.value.replace(/[^\d.]/g, ''))} />
        )}
      </div>
    </>
  );
}

function bankProblems(p: Record<string, string>, account: MoneyAccount | undefined, reference: string, amount: string, charges = '') {
  if (!account) p.account = 'اختار الحساب البنكي';
  if (!REF.test(reference.trim())) p.reference = 'الرقم المرجعي إجباري (حروف وأرقام)';
  if (charges && !/^\d+(\.\d{1,2})?$/.test(charges)) p.charges = 'مبلغ غير صحيح';
  if (!validAmount(amount)) p.amount = 'اكتب مبلغ صحيح';
  else if (account && Number(amount) + Number(charges || 0) > Number(account.balance)) p.amount = `رصيد ${account.name} ${money(account.balance)} بس`;
}

/** 1 · A transfer to a shipping line: a custody on the shipment, settled onto its account. */
export function ShippingLineDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useAccounts();
  const banks = accounts.filter((a) => a.type === 'BANK' && a.ownership === 'COMPANY' && a.isActive);
  const [search, setSearch] = useState('');
  const { data: shipments } = useShipmentSearch(search);
  const { data: agencies = [] } = useBeneficiaries({ kind: 'SHIPPING_AGENCY' }, open);
  const [shipmentId, setShipmentId] = useState<number | ''>('');
  const [beneficiaryId, setBeneficiaryId] = useState<number | ''>('');
  const [purpose, setPurpose] = useState<Purpose | ''>('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [method, setMethod] = useState<BankPaymentMethod>('TRANSFER');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [charges, setCharges] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [agency, setAgency] = useState({ name: '', bankName: '', accountNumber: '' });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const account = banks.find((a) => a.id === accountId);

  useEffect(() => {
    if (!open) return;
    setShipmentId('');
    setBeneficiaryId('');
    setPurpose('');
    setAccountId('');
    setMethod('TRANSFER');
    setReference('');
    setAmount('');
    setCharges('');
    setDate(today());
    setNotes('');
    setAdding(false);
    setProblems({});
  }, [open]);

  const save = useAction(
    () =>
      custodyApi.issue({
        shipmentId: Number(shipmentId),
        holderType: 'BANK_TRANSFER',
        purpose: purpose as Purpose,
        bankAccountId: Number(accountId),
        beneficiaryId: Number(beneficiaryId),
        paymentMethod: method,
        transferRef: reference.trim(),
        bankCharges: Number(charges || 0),
        amount: Number(amount),
        issueDate: date,
        notes: notes.trim() || undefined,
      }),
    { success: 'اتسجل التحويل', invalidate: [financeKeys.all] },
  );

  const addAgency = async () => {
    if (agency.name.trim().length < 2 || agency.bankName.trim().length < 2 || !/^[A-Za-z0-9 -]{4,40}$/.test(agency.accountNumber.trim()))
      return setProblems({ ...problems, agency: 'اكتب الاسم والبنك ورقم الحساب' });
    try {
      const created = await beneficiariesApi.create({ kind: 'SHIPPING_AGENCY', name: agency.name.trim(), bankName: agency.bankName.trim(), accountNumber: agency.accountNumber.trim() });
      await queryClient.invalidateQueries({ queryKey: ['finance', 'beneficiaries'] });
      setBeneficiaryId(created.id);
      setAdding(false);
      setAgency({ name: '', bankName: '', accountNumber: '' });
      setProblems({});
    } catch (e) {
      toastError(e);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (!shipmentId) p.shipment = 'اختار الشحنة';
    if (!beneficiaryId) p.beneficiary = 'اختار التوكيل';
    if (!purpose) p.purpose = 'اختار الغرض';
    bankProblems(p, account, reference, amount, charges);
    if (!date || date > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    setProblems(p);
    if (Object.keys(p).length === 0) save.mutateAsync(undefined).then(onClose, () => undefined);
  };

  return (
    <Shell open={open} onClose={onClose} title="تحويل لخط ملاحي" saving={save.isPending} submitLabel="سجّل التحويل" formId="ship-form">
      <form id="ship-form" noValidate onSubmit={submit} className="space-y-4">
        <ComboField
          label="الشحنة"
          placeholder="رقم الملف أو البوليصة أو العميل"
          options={(shipments?.items ?? []).map((s) => ({ value: s.id, label: `${s.fileNo} · ${s.client.name}` }))}
          value={shipmentId}
          onChange={(v) => setShipmentId(v === '' ? '' : Number(v))}
          onQueryChange={setSearch}
          error={problems.shipment}
        />
        <div className="space-y-2">
          <ComboField
            label="الخط الملاحي / التوكيل المستفيد"
            placeholder="اختار التوكيل"
            options={agencies.map((b) => ({ value: b.id, label: `${b.name} · ${b.bankName} ${b.accountNumber}` }))}
            value={beneficiaryId}
            onChange={(v) => setBeneficiaryId(v === '' ? '' : Number(v))}
            error={problems.beneficiary}
          />
          {adding ? (
            <div className="space-y-2 rounded-xl border border-dashed border-gold/40 p-3">
              <TextField label="اسم التوكيل" value={agency.name} onChange={(e) => setAgency({ ...agency, name: e.target.value })} />
              <div className="grid gap-2 sm:grid-cols-2">
                <TextField label="البنك" value={agency.bankName} onChange={(e) => setAgency({ ...agency, bankName: e.target.value })} />
                <TextField label="رقم الحساب / IBAN" dir="ltr" value={agency.accountNumber} onChange={(e) => setAgency({ ...agency, accountNumber: e.target.value })} />
              </div>
              {problems.agency && <p className="text-xs text-danger">{problems.agency}</p>}
              <div className="flex gap-2">
                <Button type="button" onClick={addAgency}>
                  إضافة
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                  رجوع
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" className="flex items-center gap-1 text-sm text-gold hover:underline" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> توكيل جديد
            </button>
          )}
        </div>
        <Field label="الغرض">
          <Segment<Purpose | ''>
            value={purpose}
            options={[
              ['UNLOADING', 'مصاريف تفريغ'],
              ['STORAGE', 'مصاريف أرضيات'],
              ['RELEASE', 'مصاريف صرف'],
            ]}
            onChange={setPurpose}
          />
          {problems.purpose && <p className="mt-1 text-xs text-danger">{problems.purpose}</p>}
        </Field>
        <BankFields
          banks={banks}
          accountId={accountId}
          setAccountId={setAccountId}
          method={method}
          setMethod={setMethod}
          reference={reference}
          setReference={setReference}
          charges={charges}
          setCharges={setCharges}
          problems={problems}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={`المبلغ${account ? ` (${CURRENCIES[account.currency].label})` : ''}`} dir="ltr" inputMode="decimal" value={amount} error={problems.amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          <TextField label="التاريخ" type="date" value={date} max={today()} error={problems.date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <TextField label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </Shell>
  );
}

/** 2 · A clearer's custody, by bank into one of his own saved accounts. */
export function ClearerCustodyDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const banks = accounts.filter((a) => a.type === 'BANK' && a.ownership === 'COMPANY' && a.isActive && a.currency === 'EGP');
  const [search, setSearch] = useState('');
  const { data: shipments } = useShipmentSearch(search);
  const [shipmentId, setShipmentId] = useState<number | ''>('');
  const shipment = shipments?.items.find((s) => s.id === shipmentId);
  const clearer = shipment?.clearer ?? null;
  const { data: clearerAccounts = [], isFetching: loadingAccounts } = useBeneficiaries({ clearerId: clearer?.id }, !!clearer);
  const { data: onShipment } = useCustodies({ shipmentId: shipmentId || undefined, holderType: 'CLEARER', page: 1, pageSize: 10 } satisfies CustodiesQuery);
  const live = shipmentId ? onShipment?.items.find((c) => !c.cancelledAt && c.shipment.id === shipmentId) : undefined;
  const [beneficiaryId, setBeneficiaryId] = useState<number | ''>('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [method, setMethod] = useState<BankPaymentMethod>('TRANSFER');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [charges, setCharges] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const account = banks.find((a) => a.id === accountId);
  const noAccount = !!clearer && !loadingAccounts && clearerAccounts.length === 0;

  useEffect(() => {
    if (!open) return;
    setShipmentId('');
    setBeneficiaryId('');
    setAccountId('');
    setMethod('TRANSFER');
    setReference('');
    setAmount('');
    setCharges('');
    setDate(today());
    setNotes('');
    setProblems({});
  }, [open]);
  useEffect(() => setBeneficiaryId(''), [shipmentId]);

  const save = useAction(
    () =>
      custodyApi.issue({
        shipmentId: Number(shipmentId),
        holderType: 'CLEARER',
        bankAccountId: Number(accountId),
        beneficiaryId: Number(beneficiaryId),
        paymentMethod: method,
        transferRef: reference.trim(),
        bankCharges: Number(charges || 0),
        amount: Number(amount),
        issueDate: date,
        notes: notes.trim() || undefined,
      }),
    { success: 'اتصرفت العهدة', invalidate: [financeKeys.all] },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (!shipmentId) p.shipment = 'اختار الشحنة';
    else if (live) p.shipment = `الشحنة عليها عهدة مستخلص ${live.custodyNo}: زوّد مبلغها`;
    if (noAccount) p.beneficiary = 'المستخلص ملوش حساب بنكي متسجل';
    else if (!beneficiaryId) p.beneficiary = 'اختار حساب المستخلص';
    bankProblems(p, account, reference, amount, charges);
    if (!date || date > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    setProblems(p);
    if (Object.keys(p).length === 0) save.mutateAsync(undefined).then(onClose, () => undefined);
  };

  return (
    <Shell open={open} onClose={onClose} title="عهدة مستخلص" saving={save.isPending} submitLabel="صرف العهدة" formId="clearer-form">
      <form id="clearer-form" noValidate onSubmit={submit} className="space-y-4">
        <ComboField
          label="الشحنة"
          placeholder="رقم الملف أو البوليصة أو العميل"
          options={(shipments?.items ?? []).map((s) => ({ value: s.id, label: `${s.fileNo} · ${s.client.name}` }))}
          value={shipmentId}
          onChange={(v) => setShipmentId(v === '' ? '' : Number(v))}
          onQueryChange={setSearch}
          error={problems.shipment}
        />
        {live && (
          <div className="flex gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> الشحنة عليها عهدة مستخلص {live.custodyNo}: زوّد مبلغها
          </div>
        )}
        <TextField label="المستخلص" value={clearer?.fullName ?? ''} readOnly disabled />
        {noAccount ? (
          <div className="flex gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> المستخلص ملوش حساب بنكي متسجل
          </div>
        ) : (
          <SelectField
            label="لحساب المستخلص"
            placeholder={clearer ? 'اختار الحساب' : 'اختار الشحنة الأول'}
            disabled={!clearer}
            options={clearerAccounts.map((b) => ({ value: b.id, label: `${b.bankName} · ${b.accountNumber}` }))}
            value={beneficiaryId}
            error={problems.beneficiary}
            onChange={(e) => setBeneficiaryId(e.target.value ? Number(e.target.value) : '')}
          />
        )}
        {!noAccount && (
          <>
            <BankFields
              banks={banks}
              accountId={accountId}
              setAccountId={setAccountId}
              method={method}
              setMethod={setMethod}
              reference={reference}
              setReference={setReference}
              charges={charges}
              setCharges={setCharges}
              problems={problems}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="المبلغ" dir="ltr" inputMode="decimal" value={amount} error={problems.amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
              <TextField label="التاريخ" type="date" value={date} max={today()} error={problems.date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <TextField label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </>
        )}
      </form>
    </Shell>
  );
}

/** 3 · A general expense: an item from the fixed list, paid from a bank. */
export function AccountantExpenseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const banks = accounts.filter((a) => a.type === 'BANK' && a.ownership === 'COMPANY' && a.isActive && a.currency === 'EGP');
  const { data: types = [] } = useExpenseTypes();
  const [typeId, setTypeId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [method, setMethod] = useState<BankPaymentMethod>('TRANSFER');
  const [reference, setReference] = useState('');
  const [charges, setCharges] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const account = banks.find((a) => a.id === accountId);
  const type = types.find((t) => t.id === typeId);
  // grouped under their main item
  const sorted = [...types].sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name, 'ar'));

  useEffect(() => {
    if (!open) return;
    setTypeId('');
    setAmount('');
    setAccountId('');
    setMethod('TRANSFER');
    setReference('');
    setCharges('');
    setReceiptNo('');
    setDate(today());
    setNotes('');
    setProblems({});
  }, [open]);

  const save = useAction(
    () =>
      officeApi.createExpense({
        expenseType: type!.name,
        amount: Number(amount),
        accountId: Number(accountId),
        paymentMethod: method,
        reference: reference.trim(),
        bankCharges: Number(charges || 0),
        receiptNo: receiptNo.trim(),
        expenseDate: date,
        notes: notes.trim() || undefined,
      }),
    { success: 'اتسجل المصروف', invalidate: [financeKeys.all] },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (!type) p.type = 'اختار البند';
    bankProblems(p, account, reference, amount, charges);
    if (!/^[A-Za-z0-9/-]{1,30}$/.test(receiptNo.trim())) p.receipt = 'رقم الإيصال (حروف وأرقام)';
    if (!date || date > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    setProblems(p);
    if (Object.keys(p).length === 0) save.mutateAsync(undefined).then(onClose, () => undefined);
  };

  return (
    <Shell open={open} onClose={onClose} title="مصروف عمومي" saving={save.isPending} submitLabel="صرف" formId="expense-form">
      <form id="expense-form" noValidate onSubmit={submit} className="space-y-4">
        <ComboField
          label="البند"
          placeholder="اختار البند"
          options={sorted.map((t) => ({ value: t.id, label: `${t.category ? `${EXPENSE_CATEGORIES[t.category]} · ` : ''}${t.name}` }))}
          value={typeId}
          onChange={(v) => setTypeId(v === '' ? '' : Number(v))}
          error={problems.type}
        />
        <TextField label="المبلغ" dir="ltr" inputMode="decimal" value={amount} error={problems.amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        <BankFields
          banks={banks}
          accountId={accountId}
          setAccountId={setAccountId}
          method={method}
          setMethod={setMethod}
          reference={reference}
          setReference={setReference}
          charges={charges}
          setCharges={setCharges}
          problems={problems}
          accountLabel="اتدفع من"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="رقم الإيصال" dir="ltr" value={receiptNo} error={problems.receipt} onChange={(e) => setReceiptNo(e.target.value)} />
          <TextField label="التاريخ" type="date" value={date} max={today()} error={problems.date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <TextField label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </Shell>
  );
}

/** 4 · An internal transfer: funding from a party into our bank, or a payment from our bank into the party's account. */
export function InternalTransferDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts();
  const banks = accounts.filter((a) => a.type === 'BANK' && a.ownership === 'COMPANY' && a.isActive);
  const { data: parties = [] } = usePartyOptions(open);
  const [partyId, setPartyId] = useState<number | ''>('');
  const [kind, setKind] = useState<'FUNDING' | 'PAYMENT'>('FUNDING');
  const { data: partyAccounts = [], isFetching } = useBeneficiaries({ partyId: partyId || undefined }, !!partyId && kind === 'PAYMENT');
  const [beneficiaryId, setBeneficiaryId] = useState<number | ''>('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [method, setMethod] = useState<BankPaymentMethod>('TRANSFER');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const account = banks.find((a) => a.id === accountId);
  const noAccount = kind === 'PAYMENT' && !!partyId && !isFetching && partyAccounts.length === 0;

  useEffect(() => {
    if (!open) return;
    setPartyId('');
    setKind('FUNDING');
    setBeneficiaryId('');
    setAccountId('');
    setMethod('TRANSFER');
    setReference('');
    setAmount('');
    setDate(today());
    setNotes('');
    setProblems({});
  }, [open]);
  useEffect(() => setBeneficiaryId(''), [partyId, kind]);

  const save = useAction(
    () =>
      partiesApi.createMovement({
        partyId: Number(partyId),
        kind,
        accountId: Number(accountId),
        amount: Number(amount),
        paymentMethod: method,
        reference: reference.trim(),
        ...(kind === 'PAYMENT' ? { beneficiaryId: Number(beneficiaryId) } : {}),
        movementDate: date,
        notes: notes.trim() || undefined,
      }),
    { success: 'اتسجل التحويل', invalidate: [financeKeys.all] },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (!partyId) p.party = 'اختار الجهة';
    if (kind === 'PAYMENT') {
      if (noAccount) p.beneficiary = 'الجهة ملهاش حساب بنكي متسجل';
      else if (!beneficiaryId) p.beneficiary = 'اختار حساب الجهة';
    }
    if (kind === 'PAYMENT') bankProblems(p, account, reference, amount);
    else {
      if (!account) p.account = 'اختار الحساب البنكي';
      if (!REF.test(reference.trim())) p.reference = 'الرقم المرجعي إجباري (حروف وأرقام)';
      if (!validAmount(amount)) p.amount = 'اكتب مبلغ صحيح';
    }
    if (!date || date > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    setProblems(p);
    if (Object.keys(p).length === 0) save.mutateAsync(undefined).then(onClose, () => undefined);
  };

  return (
    <Shell open={open} onClose={onClose} title="تحويل داخلي" saving={save.isPending} submitLabel="تسجيل" formId="internal-form">
      <form id="internal-form" noValidate onSubmit={submit} className="space-y-4">
        <SelectField
          label="الجهة"
          placeholder="اختار الجهة"
          options={parties.map((p) => ({ value: p.id, label: `${p.name} · ${PARTY_KINDS[p.kind]}` }))}
          value={partyId}
          error={problems.party}
          onChange={(e) => setPartyId(e.target.value ? Number(e.target.value) : '')}
        />
        <Field label="النوع">
          <Segment
            value={kind}
            options={[
              ['FUNDING', 'تغذية'],
              ['PAYMENT', 'صرف'],
            ]}
            onChange={setKind}
          />
        </Field>
        {kind === 'PAYMENT' &&
          (noAccount ? (
            <div className="flex gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> الجهة ملهاش حساب بنكي متسجل
            </div>
          ) : (
            <SelectField
              label="لحساب"
              placeholder={partyId ? 'اختار حساب الجهة' : 'اختار الجهة الأول'}
              disabled={!partyId}
              options={partyAccounts.map((b) => ({ value: b.id, label: `${b.name} · ${b.bankName} ${b.accountNumber}` }))}
              value={beneficiaryId}
              error={problems.beneficiary}
              onChange={(e) => setBeneficiaryId(e.target.value ? Number(e.target.value) : '')}
            />
          ))}
        {!noAccount && (
          <>
            <BankFields
              banks={banks}
              accountId={accountId}
              setAccountId={setAccountId}
              method={method}
              setMethod={setMethod}
              reference={reference}
              setReference={setReference}
              problems={problems}
              accountLabel={kind === 'FUNDING' ? 'دخلت على' : 'اتصرفت من'}
              withCharges={false}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={`المبلغ${account ? ` (${CURRENCIES[account.currency].label})` : ''}`} dir="ltr" inputMode="decimal" value={amount} error={problems.amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
              <TextField label="التاريخ" type="date" value={date} max={today()} error={problems.date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <TextField label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </>
        )}
      </form>
    </Shell>
  );
}
