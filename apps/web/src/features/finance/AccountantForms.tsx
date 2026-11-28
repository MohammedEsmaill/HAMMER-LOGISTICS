import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ComboField } from '@/components/ui/ComboField';
import { Drawer } from '@/components/ui/Drawer';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { toastError, useAction } from '@/lib/mutations';
import { BANK_METHODS, CURRENCIES, EXPENSE_CATEGORIES, financeApi, financeKeys, money, today, useAccounts, type BankPaymentMethod, type MoneyAccount } from './api';
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

const egpBox = (accounts: MoneyAccount[]) => accounts.find((a) => a.type === 'CASH' && a.currency === 'EGP' && a.isActive);

function cashProblems(p: Record<string, string>, box: MoneyAccount | undefined, amount: string) {
  if (!box) p.amount = 'خزنة الجنيه مش موجودة';
  else if (!validAmount(amount)) p.amount = 'اكتب مبلغ صحيح';
  else if (Number(amount) > Number(box.balance)) p.amount = `رصيد ${box.name} ${money(box.balance)} بس`;
}

/** Cash from the cash box, or by bank. */
function PaySegment({ byBank, onChange }: { byBank: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field label="طريقة الصرف">
      <Segment
        value={byBank ? 'BANK' : 'CASH'}
        options={[
          ['CASH', 'نقدي'],
          ['BANK', 'تحويل بنكي'],
        ]}
        onChange={(v) => onChange(v === 'BANK')}
      />
    </Field>
  );
}

function CashFields({ box, amount, setAmount, date, setDate, notes, setNotes, problems }: { box: MoneyAccount | undefined; amount: string; setAmount: (v: string) => void; date: string; setDate: (v: string) => void; notes: string; setNotes: (v: string) => void; problems: Record<string, string> }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="المبلغ" dir="ltr" inputMode="decimal" value={amount} error={problems.amount} hint={box ? `${box.name} · ${money(box.balance, box.currency)}` : undefined} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        <TextField label="التاريخ" type="date" value={date} max={today()} error={problems.date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <TextField label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
    </>
  );
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

/** 2 · A clearer's custody, by bank into one of his own saved accounts (the treasury manager: or cash). */
export function ClearerCustodyDrawer({ open, onClose, cash = false }: { open: boolean; onClose: () => void; cash?: boolean }) {
  const { data: accounts = [] } = useAccounts();
  const banks = accounts.filter((a) => a.type === 'BANK' && a.ownership === 'COMPANY' && a.isActive && a.currency === 'EGP');
  const box = egpBox(accounts);
  const [byBank, setByBank] = useState(!cash);
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
  const noAccount = byBank && !!clearer && !loadingAccounts && clearerAccounts.length === 0;

  useEffect(() => {
    if (!open) return;
    setByBank(!cash);
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
        ...(byBank
          ? { bankAccountId: Number(accountId), beneficiaryId: Number(beneficiaryId), paymentMethod: method, transferRef: reference.trim(), bankCharges: Number(charges || 0) }
          : {}),
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
    if (byBank) {
      if (noAccount) p.beneficiary = 'المستخلص ملوش حساب بنكي متسجل';
      else if (!beneficiaryId) p.beneficiary = 'اختار حساب المستخلص';
      bankProblems(p, account, reference, amount, charges);
    } else cashProblems(p, box, amount);
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
        {cash && <PaySegment byBank={byBank} onChange={setByBank} />}
        {!byBank ? (
          <CashFields box={box} amount={amount} setAmount={setAmount} date={date} setDate={setDate} notes={notes} setNotes={setNotes} problems={problems} />
        ) : noAccount ? (
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
        {byBank && !noAccount && (
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

/** 3 · A general expense: an item from the fixed list, paid from a bank (the treasury manager: or cash). */
export function AccountantExpenseDrawer({ open, onClose, cash = false }: { open: boolean; onClose: () => void; cash?: boolean }) {
  const { data: accounts = [] } = useAccounts();
  const banks = accounts.filter((a) => a.type === 'BANK' && a.ownership === 'COMPANY' && a.isActive && a.currency === 'EGP');
  const box = egpBox(accounts);
  const [byBank, setByBank] = useState(!cash);
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
    setByBank(!cash);
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
        ...(byBank
          ? { accountId: Number(accountId), paymentMethod: method, reference: reference.trim(), bankCharges: Number(charges || 0) }
          : { accountId: box!.id }),
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
    if (byBank) bankProblems(p, account, reference, amount, charges);
    else cashProblems(p, box, amount);
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
        {cash && <PaySegment byBank={byBank} onChange={setByBank} />}
        {!byBank ? (
          box && <div className="text-sm text-muted">من {box.name} · رصيد {money(box.balance, box.currency)}</div>
        ) : (
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
        )}
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

type Between = 'ASSETS' | 'SISTER_COMPANY' | 'OWNER';

/**
 * The treasury manager's internal transfer: between the company's own cash boxes and
 * banks, or funding from / a payment to a sister company or an owner. Same currency
 * on both sides.
 */
export function TreasuryTransferDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: all = [] } = useAccounts();
  const accounts = all.filter((a) => a.ownership === 'COMPANY' && a.isActive);
  const { data: parties = [] } = usePartyOptions(open);
  const [between, setBetween] = useState<Between>('ASSETS');
  const [partyId, setPartyId] = useState<number | ''>('');
  const [kind, setKind] = useState<'FUNDING' | 'PAYMENT'>('FUNDING');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [toId, setToId] = useState<number | ''>('');
  const [target, setTarget] = useState('');
  const [method, setMethod] = useState<BankPaymentMethod>('TRANSFER');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [charges, setCharges] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const account = accounts.find((a) => a.id === accountId);
  const isBank = account?.type === 'BANK';
  const paying = between === 'ASSETS' || kind === 'PAYMENT';
  const { data: partyAccounts = [] } = useBeneficiaries({ partyId: partyId || undefined }, !!partyId && kind === 'PAYMENT');
  // where a payment goes: the party's bank accounts, and an owner's personal accounts, in the paying account's currency
  const targets = [
    ...partyAccounts.filter((b) => b.currency === account?.currency).map((b) => ({ value: `B:${b.id}`, label: `${b.bankName} · ${b.accountNumber}` })),
    ...(between === 'OWNER'
      ? all
          .filter((a) => a.ownership === 'PERSONAL' && a.isActive && a.ownerParty?.id === partyId && a.currency === account?.currency)
          .map((a) => ({ value: `P:${a.id}`, label: `${a.name}${a.bankName ? ` · ${a.bankName}` : ''}` }))
      : []),
  ];
  const toChoices = accounts.filter((a) => a.id !== accountId && a.currency === account?.currency);

  useEffect(() => {
    if (!open) return;
    setBetween('ASSETS');
    setPartyId('');
    setKind('FUNDING');
    setAccountId('');
    setToId('');
    setTarget('');
    setMethod('TRANSFER');
    setReference('');
    setAmount('');
    setCharges('');
    setDate(today());
    setNotes('');
    setProblems({});
  }, [open]);
  useEffect(() => {
    setPartyId('');
    setTarget('');
  }, [between]);
  useEffect(() => setTarget(''), [partyId, kind, accountId]);
  useEffect(() => setToId(''), [accountId]);

  const bank = isBank ? { paymentMethod: method, reference: reference.trim(), bankCharges: paying ? Number(charges || 0) : 0 } : {};
  const save = useAction(
    async (): Promise<unknown> => {
      if (between === 'ASSETS')
        return financeApi.createTransfer({
          fromAccountId: Number(accountId),
          toAccountId: Number(toId),
          amount: Number(amount),
          ...(isBank ? { paymentMethod: method, chequeNo: reference.trim(), bankCharges: Number(charges || 0) } : {}),
          transferDate: date,
          notes: notes.trim() || undefined,
        });
      const [t, id] = target.split(':');
      return partiesApi.createMovement({
        partyId: Number(partyId),
        kind,
        accountId: Number(accountId),
        amount: Number(amount),
        ...bank,
        ...(kind === 'PAYMENT' && t === 'B' ? { beneficiaryId: Number(id) } : {}),
        ...(kind === 'PAYMENT' && t === 'P' ? { personalAccountId: Number(id) } : {}),
        movementDate: date,
        notes: notes.trim() || undefined,
      });
    },
    { success: 'اتسجل التحويل', invalidate: [financeKeys.all] },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (between !== 'ASSETS' && !partyId) p.party = 'اختار الجهة';
    if (!account) p.account = 'اختار الخزنة أو الحساب';
    if (between === 'ASSETS' && !toId) p.to = 'اختار الحساب المستلم';
    if (between !== 'ASSETS' && kind === 'PAYMENT' && isBank && !target) p.target = targets.length ? 'اختار الحساب' : 'مفيش حساب بنفس العملة';
    if (isBank && !REF.test(reference.trim())) p.reference = 'الرقم المرجعي إجباري (حروف وأرقام)';
    if (charges && !/^\d+(\.\d{1,2})?$/.test(charges)) p.charges = 'مبلغ غير صحيح';
    if (!validAmount(amount)) p.amount = 'اكتب مبلغ صحيح';
    else if (paying && account && Number(amount) + Number(charges || 0) > Number(account.balance)) p.amount = `رصيد ${account.name} ${money(account.balance)} بس`;
    if (!date || date > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    setProblems(p);
    if (Object.keys(p).length === 0) save.mutateAsync(undefined).then(onClose, () => undefined);
  };

  const options = (list: MoneyAccount[]) => list.map((a) => ({ value: a.id, label: `${a.name} · ${money(a.balance, a.currency)}` }));
  return (
    <Shell open={open} onClose={onClose} title="تحويل داخلي" saving={save.isPending} submitLabel="تسجيل" formId="treasury-transfer-form">
      <form id="treasury-transfer-form" noValidate onSubmit={submit} className="space-y-4">
        <Field label="بين">
          <Segment<Between>
            value={between}
            options={[
              ['ASSETS', 'أصول الشركة'],
              ['SISTER_COMPANY', 'شركة شقيقة'],
              ['OWNER', 'مالك'],
            ]}
            onChange={setBetween}
          />
        </Field>
        {between !== 'ASSETS' && (
          <>
            <SelectField
              label={between === 'OWNER' ? 'المالك' : 'الشركة'}
              placeholder="اختار"
              options={parties.filter((p) => p.kind === between).map((p) => ({ value: p.id, label: p.name }))}
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
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={between === 'ASSETS' ? 'من' : kind === 'FUNDING' ? 'دخلت على' : 'اتصرفت من'}
            placeholder="اختار"
            options={options(accounts)}
            value={accountId}
            error={problems.account}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
          />
          {between === 'ASSETS' ? (
            <SelectField
              label="إلى"
              placeholder={account ? 'اختار' : 'اختار "من" الأول'}
              disabled={!account}
              options={options(toChoices)}
              value={toId}
              error={problems.to}
              onChange={(e) => setToId(e.target.value ? Number(e.target.value) : '')}
            />
          ) : (
            kind === 'PAYMENT' &&
            isBank && (
              <SelectField
                label="لحساب"
                placeholder={partyId ? 'اختار' : 'اختار الجهة الأول'}
                disabled={!partyId}
                options={targets}
                value={target}
                error={problems.target}
                onChange={(e) => setTarget(e.target.value)}
              />
            )
          )}
        </div>
        {isBank && (
          <>
            <Field label="طريقة الدفع">
              <Segment value={method} options={Object.entries(BANK_METHODS).map(([k, v]) => [k as BankPaymentMethod, v])} onChange={setMethod} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="الرقم المرجعي" dir="ltr" value={reference} error={problems.reference} onChange={(e) => setReference(e.target.value)} />
              {paying && <TextField label="مصاريف بنكية" dir="ltr" inputMode="decimal" value={charges} error={problems.charges} onChange={(e) => setCharges(e.target.value.replace(/[^\d.]/g, ''))} />}
            </div>
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={`المبلغ${account ? ` (${CURRENCIES[account.currency].label})` : ''}`} dir="ltr" inputMode="decimal" value={amount} error={problems.amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
          <TextField label="التاريخ" type="date" value={date} max={today()} error={problems.date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <TextField label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </form>
    </Shell>
  );
}
