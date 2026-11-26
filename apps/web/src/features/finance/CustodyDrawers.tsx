import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ComboField } from '@/components/ui/ComboField';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { useAction } from '@/lib/mutations';
import { useEmployeeOptions } from '../employees/api';
import { BANK_METHODS, CURRENCIES, financeKeys, money, today, useAccounts } from './api';
import {
  custodyApi,
  HOLDERS,
  PURPOSES,
  useCustodies,
  useCustody,
  useShipmentExpenseTypes,
  useShipmentSearch,
  type Custody,
  type CustodiesQuery,
  type HolderType,
  type Purpose,
  type ReceiptKind,
  RECEIPT_KINDS,
} from './custody-api';
import { usePrices, type SettlementItem } from './prices-api';
import { BeneficiaryPicker } from './BeneficiaryPicker';
import { ApprovalTrail } from './MovementDrawers';
import { BankPaymentFields, bankPaymentBody, bankPaymentProblems, EMPTY_BANK_PAYMENT, type BankPaymentValue } from './BankPaymentFields';
import { accountOptions } from './finance-helpers';

const cents = (v: number | string) => Math.round(Number(v || 0) * 100);
const validAmount = (v: number | string) => v !== '' && Number(v) > 0 && Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) < 1e-6;

/** A new custody on a shipment. */
export function IssueCustodyDrawer({ open, onClose, onIssued }: { open: boolean; onClose: () => void; onIssued?: (c: Custody) => void }) {
  const [search, setSearch] = useState('');
  const { data: shipments } = useShipmentSearch(search);
  const { data: agents = [] } = useEmployeeOptions('AGENTS', open);
  const { can } = useAuth();
  const { data: accounts = [] } = useAccounts();
  const banks = accounts.filter((a) => a.type === 'BANK' && a.isActive);
  // cash custodies are the treasury manager's; the accountant pays by bank only
  const cash = can('finance.custody.manage');
  const holders = (Object.keys(HOLDERS) as HolderType[]).filter((h) => cash || h === 'BANK_TRANSFER' || h === 'CLEARER');
  const [shipmentId, setShipmentId] = useState<number | ''>('');
  const [holderType, setHolderType] = useState<HolderType>(cash ? 'AGENT' : 'BANK_TRANSFER');
  const [clearerByBank, setClearerByBank] = useState(!cash);
  const [pay, setPay] = useState<BankPaymentValue>(EMPTY_BANK_PAYMENT);
  const [agentId, setAgentId] = useState<number | ''>('');
  const [purpose, setPurpose] = useState<Purpose | ''>('');
  const [bankId, setBankId] = useState<number | ''>('');
  const [beneficiaryId, setBeneficiaryId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const rule = HOLDERS[holderType];
  const shipment = shipments?.items.find((s) => s.id === shipmentId);
  // one clearer custody per shipment: tell before saving
  const { data: onShipment } = useCustodies({ shipmentId: shipmentId || undefined, holderType: 'CLEARER', page: 1, pageSize: 10 } satisfies CustodiesQuery);
  const liveClearer = holderType === 'CLEARER' && shipmentId ? onShipment?.items.find((c) => !c.cancelledAt && c.shipment.id === shipmentId) : undefined;
  // by bank: a transfer to an external account, or a clearer custody into his own account
  const byBank = holderType === 'BANK_TRANSFER' || (holderType === 'CLEARER' && clearerByBank);
  const bankChoices = holderType === 'CLEARER' ? banks.filter((b) => b.currency === 'EGP') : banks;
  const bank = banks.find((b) => b.id === bankId);
  const currency = holderType === 'WAY_OUT' ? 'USD' : holderType === 'BANK_TRANSFER' ? bank?.currency : 'EGP';
  const source = byBank ? bank : accounts.find((a) => a.type === 'CASH' && a.currency === (holderType === 'WAY_OUT' ? 'USD' : 'EGP'));

  const save = useAction(
    () =>
      custodyApi.issue({
        shipmentId: Number(shipmentId),
        holderType,
        agentEmployeeId: holderType === 'AGENT' ? Number(agentId) : undefined,
        purpose: rule.purposes ? (purpose as Purpose) : undefined,
        bankAccountId: byBank ? Number(bankId) : undefined,
        beneficiaryId: byBank ? Number(beneficiaryId) : undefined,
        ...(byBank ? { ...bankPaymentBody(pay), transferRef: pay.reference.trim() } : {}),
        amount: Number(amount),
        issueDate,
        notes: notes.trim() || undefined,
      }),
    { success: 'اتصرفت العهدة', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    setProblems({});
    setSearch('');
    setShipmentId('');
    setHolderType(cash ? 'AGENT' : 'BANK_TRANSFER');
    setClearerByBank(!cash);
    setPay(EMPTY_BANK_PAYMENT);
    setAgentId('');
    setPurpose('');
    setBankId('');
    setBeneficiaryId('');
    setAmount('');
    setIssueDate(today());
    setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open]);

  useEffect(() => setPurpose(''), [holderType]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (!shipmentId) p.shipment = 'اختار الشحنة';
    else if (liveClearer) p.shipment = `الشحنة عليها عهدة مستخلص ${liveClearer.custodyNo}: زوّد مبلغها بدل عهدة جديدة`;
    if (holderType === 'AGENT' && !agentId) p.agent = 'اختار المندوب';
    if (rule.purposes && !purpose) p.purpose = 'اختار الغرض';
    if (byBank && !bankId) p.bank = 'اختار الحساب البنكي';
    if (byBank && !beneficiaryId) p.beneficiary = holderType === 'CLEARER' ? 'اختار حساب المستخلص' : 'اختار الحساب المستلم';
    if (byBank) Object.assign(p, bankPaymentProblems(pay));
    if (!validAmount(amount)) p.amount = 'اكتب مبلغ صحيح (رقمين عشريين بالكتير)';
    else if (source && Number(amount) > Number(source.balance)) p.amount = `رصيد ${source.name} ${money(source.balance)} بس`;
    if (!issueDate || issueDate > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    setProblems(p);
    if (Object.keys(p).length === 0)
      save.mutateAsync(undefined).then((c) => {
        onClose();
        onIssued?.(c);
      }, () => undefined);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-xl"
      title="صرف عهدة"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="issue-form" type="submit" loading={save.isPending}>
            صرف
          </Button>
        </div>
      }
    >
      <form id="issue-form" noValidate onSubmit={submit} className="space-y-4">
        <ComboField
          label="الشحنة"
          placeholder="اكتب رقم الملف أو البوليصة أو العميل"
          options={(shipments?.items ?? []).map((s) => ({ value: s.id, label: `${s.fileNo} · ${s.client.name} · ${s.commodity}` }))}
          value={shipmentId}
          onChange={(v) => setShipmentId(v === '' ? '' : Number(v))}
          onQueryChange={setSearch}
          error={problems.shipment}
        />
        {liveClearer && (
          <div className="flex gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            الشحنة دي عليها عهدة مستخلص {liveClearer.custodyNo} ({money(liveClearer.amount, 'EGP')})، والشحنة ليها عهدة مستخلص واحدة بس. لو محتاج فلوس زيادة زوّد مبلغ
            العهدة دي.
          </div>
        )}
        <div>
          <div className="mb-1.5 text-sm font-medium text-muted">المستلم</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
            {holders.map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={holderType === h}
                onClick={() => setHolderType(h)}
                className={`focus-ring rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  holderType === h ? 'border-gold bg-gold/12 text-gold' : 'border-line text-muted hover:border-gold/40'
                }`}
              >
                {HOLDERS[h].label}
              </button>
            ))}
          </div>
        </div>
        {holderType === 'AGENT' && (
          <ComboField
            label="المندوب"
            options={agents.map((a) => ({ value: a.id, label: `${a.fullName} (${a.code})` }))}
            value={agentId}
            onChange={(v) => setAgentId(v === '' ? '' : Number(v))}
            error={problems.agent}
            empty="مفيش موظفين في قسم مندوبين التوكيلات"
          />
        )}
        {holderType === 'CLEARER' && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1" role="radiogroup" aria-label="طريقة صرف عهدة المستخلص">
            {[
              { v: false, label: 'نقدي من الخزنة', show: cash },
              { v: true, label: 'تحويل بنكي لحسابه', show: true },
            ]
              .filter((o) => o.show)
              .map((o) => (
                <button
                  key={String(o.v)}
                  type="button"
                  role="radio"
                  aria-checked={clearerByBank === o.v}
                  onClick={() => {
                    setClearerByBank(o.v);
                    setBankId('');
                    setBeneficiaryId('');
                  }}
                  className={`focus-ring rounded-lg px-3 py-2 text-sm font-semibold ${clearerByBank === o.v ? 'gold-fill' : 'text-muted'}`}
                >
                  {o.label}
                </button>
              ))}
          </div>
        )}
        {byBank && (
          <SelectField
            label="الحساب البنكي"
            options={bankChoices.map((b) => ({ value: b.id, label: `${b.name} · ${money(b.balance, b.currency)}` }))}
            value={bankId}
            onChange={(e) => setBankId(e.target.value ? Number(e.target.value) : '')}
            error={problems.bank}
          />
        )}
        {byBank && holderType === 'CLEARER' && !shipment?.clearer && <p className="text-sm text-muted">اختار الشحنة الأول علشان يظهر حساب مستخلصها.</p>}
        {byBank && (holderType === 'BANK_TRANSFER' || shipment?.clearer) && (
          <BeneficiaryPicker
            value={beneficiaryId}
            onChange={setBeneficiaryId}
            error={problems.beneficiary}
            clearer={holderType === 'CLEARER' ? (shipment?.clearer ?? undefined) : undefined}
          />
        )}
        {byBank && <BankPaymentFields value={pay} onChange={setPay} errors={problems} currency={currency} />}
        {rule.purposes && (
          <SelectField
            label="الغرض"
            options={rule.purposes.map((p) => ({ value: p, label: PURPOSES[p] }))}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as Purpose)}
            error={problems.purpose}
          />
        )}
        <TextField
          label={`المبلغ${currency ? ` (${CURRENCIES[currency].label})` : ''}`}
          type="number"
          step="0.01"
          min="0.01"
          dir="ltr"
          hint={source ? `رصيد ${source.name}: ${money(source.balance, source.currency)}` : undefined}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={problems.amount}
        />
        <TextField label="تاريخ الصرف" type="date" max={today()} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} error={problems.date} />
        <TextField label="ملاحظات (اختياري)" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
        {save.error ? <ErrorBox error={save.error} /> : null}
      </form>
    </Drawer>
  );
}

interface ItemRow {
  /** a fixed-price item: name and amount come from the price list */
  settlementItemId?: number;
  quantity?: number;
  expenseType: string;
  amount: string;
  receiptNo: string;
  receiptKind: ReceiptKind;
  description: string;
}

/** A custody: its details, its settlement (new or edited) and its approval. */
export function CustodyDrawer({ custodyId, onClose }: { custodyId: number | null; onClose: () => void }) {
  const { can, user } = useAuth();
  const { data: custody, error } = useCustody(custodyId);
  const { data: types = [] } = useShipmentExpenseTypes();
  const isClearer = custody?.holderType === 'CLEARER';
  const { data: prices } = usePrices(isClearer);
  const listId = useId();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [settlementDate, setSettlementDate] = useState(today());
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  // a clearer's overspend: the account it is paid from (cash or bank) and how
  const { data: allAccounts = [] } = useAccounts();
  const [extraAccountId, setExtraAccountId] = useState<number | ''>('');
  const [extraPay, setExtraPay] = useState<BankPaymentValue>(EMPTY_BANK_PAYMENT);

  const settled = custody?.status === 'SETTLED';
  // the first settlement: any accountant; after that, whoever settled it until approval
  const isSettler = !settled || custody?.settledBy?.id === user?.id || can('finance.approved.edit');
  const canSettle =
    !!custody &&
    !custody.cancelledAt &&
    (can('finance.custody.settle') || can('finance.approved.edit')) &&
    (custody.approvalStatus === 'APPROVED' ? can('finance.approved.edit') : isSettler);

  const save = useAction(
    () =>
      custodyApi.settle(custody!.id, {
        version: custody!.version,
        settlementDate,
        items: items.map((i) => ({
          ...(i.settlementItemId
            ? { settlementItemId: i.settlementItemId }
            : { expenseType: i.expenseType.trim(), amount: Number(i.amount) }),
          receiptNo: i.receiptNo.trim() || undefined,
          receiptKind: i.receiptNo.trim() ? i.receiptKind : undefined,
          description: i.description.trim() || undefined,
        })),
        ...(totals.diff < 0 && extraAccount
          ? {
              extraAccountId: extraAccount.id,
              ...(extraAccount.type === 'BANK' ? { extraPaymentMethod: extraPay.paymentMethod || undefined, extraReference: extraPay.reference.trim() } : {}),
            }
          : {}),
      }),
    { success: settled ? 'اتحفظت التصفية' : 'اتصفت العهدة', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!custody) return;
    save.reset();
    setProblems({});
    setEditing(!settled && canSettle);
    setSettlementDate(custody.settlementDate?.slice(0, 10) ?? today());
    setExtraAccountId(custody.extraAccountId ?? custody.sourceAccount.id);
    setExtraPay({ paymentMethod: custody.extraPaymentMethod ?? custody.paymentMethod ?? '', reference: custody.extraReference ?? custody.transferRef ?? '', bankCharges: '' });
    setItems(
      custody.items?.length
        ? custody.items.map((i) => ({
            settlementItemId: i.settlementItemId ?? undefined,
            quantity: i.quantity,
            expenseType: i.expenseType.name,
            amount: i.amount,
            receiptNo: i.receiptNo ?? '',
            receiptKind: i.receiptKind ?? 'PAYMENT_RECEIPT',
            description: i.description ?? '',
          }))
        : // a bank transfer is spent exactly: one line for the whole amount to start from
          [{ expenseType: '', amount: custody.holderType === 'BANK_TRANSFER' ? custody.amount : '', receiptNo: '', receiptKind: 'PAYMENT_RECEIPT', description: '' }],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when another custody (or version) loads
  }, [custody?.id, custody?.version]);

  const totals = useMemo(() => {
    const spent = items.reduce((s, i) => s + cents(i.amount), 0);
    const amount = cents(custody?.amount ?? 0);
    return { spent: spent / 100, diff: (amount - spent) / 100 };
  }, [items, custody?.amount]);

  if (!custody) {
    return (
      <Drawer open={!!custodyId} onClose={onClose} title="العهدة">
        {error ? <ErrorBox error={error} /> : <div className="h-40 rounded-2xl shimmer" />}
      </Drawer>
    );
  }
  const rule = HOLDERS[custody.holderType];
  const cur = custody.currency;
  const extraAccount = allAccounts.find((a) => a.id === extraAccountId);
  const holderName = custody.agent?.fullName ?? custody.clearer?.fullName ?? rule.label;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (items.length === 0) p.items = 'ضيف بند واحد على الأقل';
    items.forEach((it, i) => {
      if (!it.settlementItemId && it.expenseType.trim().length < 2) p[`type${i}`] = 'اكتب النوع';
      if (!it.settlementItemId && !validAmount(it.amount)) p[`amount${i}`] = 'مبلغ غير صحيح';
      if (it.receiptNo && !/^[0-9]+(-[0-9]+)*$/.test(it.receiptNo.trim())) p[`receipt${i}`] = 'أرقام وشرطة بس (861-26)';
      if (!it.receiptNo.trim() && !it.description.trim()) p[`receipt${i}`] = 'الإيصال أو الملاحظات';
    });
    if (custody.holderType === 'BANK_TRANSFER' && totals.diff !== 0) p.items = `في التحويل البنكي المصروف لازم يساوي ${money(custody.amount)} بالظبط`;
    if (!rule.overspend && totals.diff < 0) p.items = 'المصروف أكبر من العهدة، والصرف أكتر من العهدة للمستخلص بس';
    if (!settlementDate || settlementDate > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    if (settlementDate < custody.issueDate.slice(0, 10)) p.date = 'قبل تاريخ صرف العهدة';
    if (totals.diff < 0 && rule.overspend) {
      if (!extraAccount) p.extraAccount = 'اختار هتصرف الزيادة منين';
      else if (extraAccount.type === 'BANK') {
        const b = bankPaymentProblems({ ...extraPay, bankCharges: '' });
        if (b.paymentMethod) p.paymentMethod = b.paymentMethod;
        if (b.reference) p.reference = b.reference;
      }
    }
    setProblems(p);
    if (Object.keys(p).length === 0) save.mutateAsync(undefined).then(() => setEditing(false), () => undefined);
  };
  const setItem = (i: number, patch: Partial<ItemRow>) => {
    setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    // a line's error goes once the line is edited; the next save checks again
    setProblems((p) => {
      const rest = { ...p };
      for (const k of [`type${i}`, `amount${i}`, `receipt${i}`, 'items']) delete rest[k];
      return rest;
    });
  };
  // price-list items still free on this shipment: each one once per shipment
  const containers = custody.shipmentContainers ?? 1;
  const taken = new Set([...(custody.usedSettlementItemIds ?? []), ...items.map((i) => i.settlementItemId)]);
  // the shipment's factory has its own price for each item (its default where none)
  const factoryPrice = new Map((custody.itemPrices ?? []).map((p) => [p.settlementItemId, p.price]));
  const available = (prices?.items ?? [])
    .filter((p) => p.isActive && !taken.has(p.id))
    .map((p) => ({ ...p, price: factoryPrice.get(p.id) ?? p.price }));
  const addFixed = (p: SettlementItem) => {
    const quantity = p.perContainer ? containers : 1;
    const row: ItemRow = {
      settlementItemId: p.id,
      quantity,
      expenseType: p.name,
      amount: (Number(p.price) * quantity).toFixed(2),
      receiptNo: '',
      receiptKind: 'PAYMENT_RECEIPT',
      description: '',
    };
    // replaces an empty first line, otherwise joins the list
    setItems((l) => (l.length === 1 && !l[0].expenseType.trim() && !l[0].amount ? [row] : [...l, row]));
  };

  return (
    <Drawer
      open={!!custodyId}
      onClose={onClose}
      width="max-w-3xl"
      title={`عهدة ${custody.custodyNo}`}
      footer={
        editing && (
          <div className="flex justify-end gap-2">
            {settled && (
              <Button variant="ghost" onClick={() => setEditing(false)}>
                إلغاء
              </Button>
            )}
            <Button form="settle-form" type="submit" loading={save.isPending}>
              {settled ? 'حفظ التصفية' : 'تصفية العهدة'}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Info label="المستلم" value={holderName} hint={rule.label} />
          {custody.beneficiary ? (
            <Info
              label="حوّلنا لـ"
              value={custody.beneficiary.name}
              hint={`من ${custody.sourceAccount.name} · ${custody.beneficiary.bankName} ${custody.beneficiary.accountNumber}${
                custody.transferRef ? ` · ${custody.paymentMethod === 'CHEQUE' ? 'شيك' : 'تحويل'} ${custody.transferRef}` : ''
              }${Number(custody.bankCharges ?? 0) > 0 ? ` · مصاريف بنكية ${money(custody.bankCharges, cur)}` : ''}`}
            />
          ) : (
            <Info
              label={isClearer ? 'المصدر' : 'الغرض'}
              value={isClearer ? custody.sourceAccount.name : custody.purpose ? PURPOSES[custody.purpose] : '—'}
              hint={isClearer ? `ملف ${custody.shipment.fileNo}` : `من ${custody.sourceAccount.name}`}
            />
          )}
          <Info label="مبلغ العهدة" value={money(custody.amount, cur)} hint={formatDate(custody.issueDate)} ltr />
        </div>
        {settled && !editing && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Info label="المصروف" value={money(custody.spentAmount, cur)} ltr />
            {Number(custody.returnedAmount) > 0 && <Info label="رجع للخزنة" value={money(custody.returnedAmount, cur)} ltr tone="text-success" />}
            {Number(custody.keptAmount ?? 0) > 0 && <Info label="في حساب المستخلص (يُخصم من أتعابه)" value={money(custody.keptAmount, cur)} ltr tone="text-success" />}
            {Number(custody.extraAmount) > 0 && <Info label="اتصرف زيادة" value={money(custody.extraAmount, cur)} ltr tone="text-warning" />}
            {custody.computedFee && <Info label="أتعاب المستخلص" value={money(custody.computedFee.amount, 'EGP')} ltr />}
          </div>
        )}
        {custody.cancelledAt ? (
          <div className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
            <div className="font-bold text-danger">العهدة دي اتلغت في {formatDate(custody.cancelledAt)}</div>
            <div className="text-muted">
              المبلغ كله ({money(custody.amount, cur)}) رجع لـ {custody.sourceAccount.name}. السبب: {custody.cancelReason}
            </div>
          </div>
        ) : (
          !settled && <IssueFix custody={custody} onCancelled={onClose} />
        )}
                {custody.duplicateReceipts && custody.duplicateReceipts.length > 0 && (
          <div className="flex gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              أرقام إيصالات متكررة في عهد تانية:
              {custody.duplicateReceipts.map((d) => (
                <div key={`${d.receiptNo}-${d.custodyNo}`}>
                  إيصال {d.receiptNo} على العهدة {d.custodyNo} (ملف {d.fileNo})
                </div>
              ))}
            </div>
          </div>
        )}

        {editing ? (
          <form id="settle-form" noValidate onSubmit={submit} className="space-y-3">
            <h3 className="font-semibold text-gold">بنود التصفية</h3>
            {isClearer && available.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {available.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addFixed(p)}
                    className="focus-ring flex items-center gap-2 rounded-full border border-gold/40 bg-gold/5 px-3 py-1.5 text-sm transition-colors hover:bg-gold/15"
                  >
                    <Plus className="size-3.5 text-gold" />
                    {p.name}
                    <span className="text-xs text-muted" dir="ltr">
                      {money(p.price)}
                      {p.perContainer ? ` × ${containers}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <datalist id={listId}>
              {types.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
            {items.map((it, i) => (
              <div key={i} className="grid items-start gap-2 rounded-xl border border-line p-3 sm:grid-cols-[2rem_1fr_7rem_7rem_1fr_auto]">
                <span className="grid size-8 place-items-center rounded-lg bg-gold/10 text-sm font-bold text-gold sm:mt-8">{i + 1}</span>
                {it.settlementItemId ? (
                  <>
                    <TextField label="البند" value={it.expenseType} readOnly />
                    <TextField label={it.quantity && it.quantity > 1 ? `المبلغ (× ${it.quantity})` : 'المبلغ'} dir="ltr" value={money(it.amount)} readOnly />
                  </>
                ) : (
                  <>
                    <TextField label="النوع" list={listId} value={it.expenseType} onChange={(e) => setItem(i, { expenseType: e.target.value })} error={problems[`type${i}`]} />
                    <TextField label="المبلغ" type="number" step="0.01" min="0.01" dir="ltr" value={it.amount} onChange={(e) => setItem(i, { amount: e.target.value })} error={problems[`amount${i}`]} />
                  </>
                )}
<div className="space-y-1">
                  <TextField label="رقم الإيصال" dir="ltr" placeholder="861-26" value={it.receiptNo} onChange={(e) => setItem(i, { receiptNo: e.target.value })} error={problems[`receipt${i}`]} />
                  {it.receiptNo && (
                    <select
                      aria-label="نوع المستند"
                      value={it.receiptKind}
                      onChange={(e) => setItem(i, { receiptKind: e.target.value as ReceiptKind })}
                      className="h-8 w-full rounded-lg border border-line bg-surface-2 px-2 text-xs"
                      dir="ltr"
                    >
                      {(Object.keys(RECEIPT_KINDS) as ReceiptKind[]).map((k) => (
                        <option key={k} value={k}>
                          {RECEIPT_KINDS[k].label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <TextField label="ملاحظات" value={it.description} maxLength={300} onChange={(e) => setItem(i, { description: e.target.value })} />
                <div className="sm:mt-8">
                  <IconButton label={`شيل البند ${i + 1}`} tone="danger" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>
            ))}
            <Button type="button" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setItems((l) => [...l, { expenseType: '', amount: '', receiptNo: '', receiptKind: 'PAYMENT_RECEIPT', description: '' }])}>
              بند
            </Button>
            <TextField label="تاريخ التصفية" type="date" className="max-w-56" max={today()} value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} error={problems.date} />
            <div className="sticky bottom-0 z-10 space-y-1 rounded-xl border border-gold/30 bg-surface p-4 text-sm shadow-lg">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div
                  className={`h-full rounded-full transition-all ${totals.diff < 0 ? 'bg-warning' : 'bg-gold'}`}
                  style={{ width: `${Math.min(100, Number(custody.amount) > 0 ? (totals.spent / Number(custody.amount)) * 100 : 0)}%` }}
                />
              </div>
              <Row label="العهدة" value={money(custody.amount, cur)} />
              <Row label={`المصروف (${items.length} بند)`} value={money(totals.spent, cur)} />
              <div className="flex justify-between border-t border-gold/20 pt-2 font-bold">
                <span>
                  {custody.holderType === 'BANK_TRANSFER'
                    ? 'الفرق (لازم يبقى صفر)'
                    : totals.diff >= 0
                      ? custody.holderType === 'CLEARER'
                        ? 'في حساب المستخلص: يُخصم من أتعابه'
                        : `يرجع لـ ${custody.sourceAccount.name}`
                      : 'يتصرف زيادة'}
                </span>
                <span dir="ltr" className={totals.diff >= 0 ? 'text-success' : rule.overspend ? 'text-warning' : 'text-danger'}>
                  {money(Math.abs(totals.diff), cur)}
                </span>
              </div>
              {custody.holderType === 'CLEARER' && totals.diff > 0 && (
                <p className="text-xs text-muted">بيتخصم من أتعاب الشحنة دي الأول، واللي يفضل من أتعاب الشحنات الجاية</p>
              )}
              {rule.overspend && totals.diff < 0 && <p className="text-xs text-muted">الزيادة بتتصرف دلوقتي وتتضاف لعهد الشحنة: اختار هتتصرف منين تحت</p>}
              {problems.items && <p className="text-danger">{problems.items}</p>}
            </div>
            {rule.overspend && totals.diff < 0 && (
              <div className="space-y-3">
                <SelectField
                  label="الزيادة تتصرف من"
                  options={accountOptions(
                    allAccounts.filter((a) => a.currency === cur),
                    custody.extraAccountId ?? undefined,
                  )}
                  value={extraAccountId}
                  onChange={(e) => setExtraAccountId(e.target.value ? Number(e.target.value) : '')}
                  error={problems.extraAccount}
                />
                {extraAccount?.type === 'BANK' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      label="طريقة الدفع"
                      options={Object.entries(BANK_METHODS).map(([v, l]) => ({ value: v, label: l }))}
                      value={extraPay.paymentMethod}
                      onChange={(e) => setExtraPay((v) => ({ ...v, paymentMethod: e.target.value as BankPaymentValue['paymentMethod'] }))}
                      error={problems.paymentMethod}
                    />
                    <TextField
                      label={extraPay.paymentMethod === 'CHEQUE' ? 'رقم الشيك' : 'الرقم المرجعي للتحويل'}
                      dir="ltr"
                      value={extraPay.reference}
                      onChange={(e) => setExtraPay((v) => ({ ...v, reference: e.target.value }))}
                      error={problems.reference}
                    />
                  </div>
                )}
              </div>
            )}
            {save.error ? <ErrorBox error={save.error} /> : null}
          </form>
        ) : (
          settled && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gold">بنود التصفية · {formatDate(custody.settlementDate)}</h3>
                {canSettle && (
                  <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setEditing(true)}>
                    تعديل التصفية
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <tbody>
                    {custody.items?.map((i) => (
                      <tr key={i.id} className="border-b border-line last:border-0">
                        <td className="px-3 py-2 text-muted">{i.lineNo}</td>
                        <td className="px-3 py-2">
                          {i.expenseType.name}
                          {i.quantity > 1 && <span className="ms-1 text-xs text-muted">× {i.quantity}</span>}
                        </td>
                        <td className="px-3 py-2" dir="ltr">
                          {i.receiptNo ? RECEIPT_KINDS[i.receiptKind ?? 'PAYMENT_RECEIPT'].line(i.receiptNo) : null}
                          {i.receiptNo && i.description ? ' · ' : null}
                          {i.description}
                        </td>
                        <td className="px-3 py-2 font-semibold" dir="ltr">
                          {money(i.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        )}
        {!settled && !canSettle && <p className="text-sm text-muted">العهدة لسه مفتوحة ومستنية التصفية.</p>}
        {settled ? <ApprovalTrail doc={custody} /> : <Badge tone="muted">بتتعتمد بعد التصفية</Badge>}
      </div>
    </Drawer>
  );
}

/**
 * While a custody is open, the treasury manager moves it to the right shipment
 * (a clearer's: same clearer only), or cancels it: the money goes back to where it came from.
 */
function IssueFix({ custody, onCancelled }: { custody: Custody; onCancelled: () => void }) {
  const { can } = useAuth();
  const [mode, setMode] = useState<'move' | 'cancel' | null>(null);
  const [search, setSearch] = useState('');
  const { data: shipments } = useShipmentSearch(search);
  const [shipmentId, setShipmentId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const move = useAction(() => custodyApi.updateIssue(custody.id, { version: custody.version, shipmentId: Number(shipmentId) }), {
    success: 'اتنقلت العهدة للشحنة الصح',
    invalidate: [financeKeys.all],
  });
  const cancel = useAction(() => custodyApi.cancel(custody.id, { version: custody.version, reason: reason.trim() }), {
    success: 'اتلغت العهدة ورجعت الفلوس لمصدرها',
    invalidate: [financeKeys.all],
  });
  // changing or cancelling a custody: the treasury manager only (the CEO holds everything)
  if (!can('finance.custody.manage')) return null;
  const isClearer = custody.holderType === 'CLEARER';
  // a clearer's custody moves only to a shipment of the same clearer
  const options = (shipments?.items ?? []).filter((s) => s.id !== custody.shipment.id && (!isClearer || s.clearer?.id === custody.clearer?.id));

  return (
    <div className="rounded-xl border border-line p-3">
      {!mode && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">العهدة اتسجلت غلط؟</span>
          <Button variant="ghost" onClick={() => setMode('move')}>
            تغيير الشحنة
          </Button>
          <Button variant="ghost" onClick={() => setMode('cancel')}>
            إلغاء العهدة
          </Button>
        </div>
      )}
      {mode === 'move' && (
        <div className="space-y-3">
          <ComboField
            label={`الشحنة الصح (بدل ${custody.shipment.fileNo})`}
            placeholder="اكتب رقم الملف أو البوليصة أو العميل"
            options={options.map((s) => ({ value: s.id, label: `${s.fileNo} · ${s.client.name}${s.clearer ? ` · ${s.clearer.fullName}` : ''}` }))}
            value={shipmentId}
            onChange={(v) => setShipmentId(v === '' ? '' : Number(v))}
            onQueryChange={setSearch}
          />
          {isClearer && (
            <p className="text-xs text-muted">
              بتظهر بس شحنات {custody.clearer?.fullName}. لو الشحنة الصح لمستخلص تاني، ألغِ العهدة (الفلوس بترجع لمصدرها) وسجّل عهدة جديدة. بعد التغيير العهدة بترجع
              للاعتماد من الأول.
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={!shipmentId} loading={move.isPending} onClick={() => move.mutateAsync(undefined).then(() => setMode(null), () => undefined)}>
              انقل العهدة
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)}>
              رجوع
            </Button>
          </div>
        </div>
      )}
      {mode === 'cancel' && (
        <div className="space-y-3">
          <TextField label="سبب الإلغاء" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: اتسجلت على شحنة مستخلص تاني" />
          <p className="text-xs text-muted">
            المبلغ كله ({money(custody.amount, custody.currency)}) بيرجع لـ {custody.sourceAccount.name} بتاريخ النهاردة، ومفيش أتعاب بتتحسب. بعدها تقدر تسجّل عهدة
            جديدة على الشحنة الصح.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={reason.trim().length < 5}
              loading={cancel.isPending}
              onClick={() => cancel.mutateAsync(undefined).then(() => onCancelled(), () => undefined)}
            >
              ألغِ العهدة
            </Button>
            <Button variant="ghost" onClick={() => setMode(null)}>
              رجوع
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value, hint, ltr, tone = '' }: { label: string; value: string; hint?: string; ltr?: boolean; tone?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-bold ${tone}`} dir={ltr ? 'ltr' : undefined} style={ltr ? { textAlign: 'right' } : undefined}>
        {value}
      </div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span dir="ltr">{value}</span>
    </div>
  );
}
