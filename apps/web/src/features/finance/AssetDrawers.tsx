import { Monitor, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { useAction } from '@/lib/mutations';
import { useEmployeeOptions } from '../employees/api';
import { financeKeys, money, STATUS, today, useAccounts } from './api';
import {
  ASSET_CATEGORIES,
  ASSET_STATUS,
  assetKeys,
  assetsApi,
  DEFAULT_LIFE_MONTHS,
  MIN_ASSET_COST,
  TX_KINDS,
  useAsset,
  type AssetCategory,
  type AssetTx,
} from './assets-api';
import { BankPaymentFields, bankPaymentBody, bankPaymentProblems, EMPTY_BANK_PAYMENT, type BankPaymentValue } from './BankPaymentFields';
import { accountOptions } from './finance-helpers';
import { ApprovalTrail } from './MovementDrawers';

const validAmount = (v: string) => /^\d+(\.\d{1,2})?$/.test(v.trim()) && Number(v) > 0;
const years = (months: number) => (months % 12 === 0 ? `${months / 12} سنين` : `${months} شهر`);

interface Info {
  category: AssetCategory | '';
  name: string;
  model: string;
  serialNo: string;
  location: string;
  custodianEmployeeId: number | '';
  lifeYears: string;
  notes: string;
}
const EMPTY_INFO: Info = { category: '', name: '', model: '', serialNo: '', location: '', custodianEmployeeId: '', lifeYears: '5', notes: '' };

function InfoFields({ info, set, problems }: { info: Info; set: (i: Info) => void; problems: Record<string, string> }) {
  const { data: employees = [] } = useEmployeeOptions();
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="النوع"
          placeholder="اختار النوع"
          options={Object.entries(ASSET_CATEGORIES).map(([value, label]) => ({ value, label }))}
          value={info.category}
          error={problems.category}
          onChange={(e) => set({ ...info, category: e.target.value as AssetCategory })}
        />
        <TextField label="اسم الجهاز" value={info.name} error={problems.name} placeholder="مثلاً: لابتوب مدير الحسابات" onChange={(e) => set({ ...info, name: e.target.value })} />
        <TextField label="الموديل (اختياري)" value={info.model} onChange={(e) => set({ ...info, model: e.target.value })} />
        <TextField label="الرقم التسلسلي Serial (اختياري)" dir="ltr" value={info.serialNo} onChange={(e) => set({ ...info, serialNo: e.target.value })} />
        <SelectField
          label="مع مين (اختياري)"
          placeholder="محدش"
          options={employees.map((e) => ({ value: e.id, label: `${e.fullName} · ${e.code}` }))}
          value={info.custodianEmployeeId}
          onChange={(e) => set({ ...info, custodianEmployeeId: e.target.value ? Number(e.target.value) : '' })}
        />
        <TextField label="المكان (اختياري)" value={info.location} placeholder="مثلاً: مكتب الحسابات" onChange={(e) => set({ ...info, location: e.target.value })} />
        <TextField
          label="العمر الإنتاجي (سنين)"
          inputMode="numeric"
          value={info.lifeYears}
          error={problems.life}
          onChange={(e) => set({ ...info, lifeYears: e.target.value.replace(/[^\d]/g, '') })}
        />
      </div>
      <TextField label="ملاحظات (اختياري)" value={info.notes} onChange={(e) => set({ ...info, notes: e.target.value })} />
    </>
  );
}

const infoProblems = (info: Info) => {
  const p: Record<string, string> = {};
  if (!info.category) p.category = 'اختار النوع';
  if (info.name.trim().length < 2) p.name = 'اكتب اسم الجهاز';
  const y = Number(info.lifeYears);
  if (!y || y > 50) p.life = 'من سنة لـ 50 سنة';
  return p;
};

const infoBody = (info: Info) => ({
  category: info.category as AssetCategory,
  name: info.name.trim(),
  model: info.model.trim() || undefined,
  serialNo: info.serialNo.trim() || undefined,
  location: info.location.trim() || undefined,
  custodianEmployeeId: info.custodianEmployeeId || undefined,
  usefulLifeMonths: Number(info.lifeYears) * 12,
  notes: info.notes.trim() || undefined,
});

/**
 * A new device: bought now (paid from a cash box or bank, in the approval cycle), or one
 * the company already had (its original date and cost, no money moving).
 */
export function NewAssetDrawer({ mode, onClose, onSaved }: { mode: 'purchase' | 'existing' | null; onClose: () => void; onSaved: (id: number) => void }) {
  const { data: accounts = [] } = useAccounts();
  const egp = accounts.filter((a) => a.currency === 'EGP' && a.ownership === 'COMPANY');
  const [info, setInfo] = useState<Info>(EMPTY_INFO);
  const [cost, setCost] = useState('');
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState<number | ''>('');
  const [pay, setPay] = useState<BankPaymentValue>(EMPTY_BANK_PAYMENT);
  const [supplier, setSupplier] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const account = egp.find((a) => a.id === accountId);
  const bank = account?.type === 'BANK';

  useEffect(() => {
    if (!mode) return;
    setInfo(EMPTY_INFO);
    setCost('');
    setDate(today());
    setAccountId('');
    setPay(EMPTY_BANK_PAYMENT);
    setSupplier('');
    setInvoiceNo('');
    setProblems({});
  }, [mode]);

  const save = useAction(
    () =>
      mode === 'purchase'
        ? assetsApi.purchase({
            ...infoBody(info),
            cost: Number(cost),
            accountId: Number(accountId),
            ...(bank ? { ...bankPaymentBody(pay), reference: pay.reference.trim() } : {}),
            supplier: supplier.trim() || undefined,
            invoiceNo: invoiceNo.trim() || undefined,
            purchaseDate: date,
          })
        : assetsApi.existing({ ...infoBody(info), cost: Number(cost), acquiredOn: date }),
    { success: mode === 'purchase' ? 'اتسجل شراء الجهاز' : 'اتسجل الجهاز', invalidate: [assetKeys.all, financeKeys.all] },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = infoProblems(info);
    if (!validAmount(cost)) p.cost = 'اكتب مبلغ صحيح';
    else if (Number(cost) < MIN_ASSET_COST) p.cost = `أقل من ${money(MIN_ASSET_COST)} ج بيتسجل مصروف عادي مش أصل ثابت`;
    if (!date || date > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    if (mode === 'purchase') {
      if (!account) p.account = 'اختار الخزنة أو الحساب';
      else if (Number(cost) + Number(pay.bankCharges || 0) > Number(account.balance)) p.account = `رصيد ${account.name} ${money(account.balance)} بس`;
      if (bank) Object.assign(p, bankPaymentProblems(pay));
    }
    setProblems(p);
    if (Object.keys(p).length === 0) save.mutateAsync(undefined).then((a) => onSaved(a.id), () => undefined);
  };

  return (
    <Drawer
      open={!!mode}
      onClose={onClose}
      width="max-w-2xl"
      title={mode === 'purchase' ? 'شراء جهاز' : 'تسجيل جهاز موجود'}
      subtitle={mode === 'existing' ? 'جهاز الشركة كانت شارياه قبل السيستم: بتاريخ وتكلفة شرائه الأصليين، ومفيش فلوس بتطلع' : 'الفلوس بتطلع من الخزنة أو البنك، وتدخل دورة الاعتماد'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="asset-form" type="submit" loading={save.isPending}>
            {mode === 'purchase' ? 'سجّل الشراء' : 'سجّل الجهاز'}
          </Button>
        </div>
      }
    >
      <form id="asset-form" noValidate onSubmit={submit} className="space-y-4">
        <InfoFields info={info} set={setInfo} problems={problems} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={mode === 'purchase' ? 'سعر الشراء' : 'تكلفة الشراء الأصلية'}
            inputMode="decimal"
            dir="ltr"
            value={cost}
            error={problems.cost}
            hint={`من ${money(MIN_ASSET_COST)} ج وطالع`}
            onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))}
          />
          <TextField label="تاريخ الشراء" type="date" value={date} max={today()} error={problems.date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {mode === 'purchase' && (
          <>
            <SelectField
              label="اتدفع من"
              placeholder="اختار الخزنة أو الحساب"
              options={accountOptions(egp)}
              value={accountId}
              error={problems.account}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
            />
            {bank && <BankPaymentFields value={pay} onChange={setPay} errors={problems} />}
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="المورّد (اختياري)" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              <TextField label="رقم الفاتورة (اختياري)" dir="ltr" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </div>
          </>
        )}
        <p className="text-xs text-muted">
          الإهلاك بيتحسب لوحده كل آخر شهر بالقسط الثابت (التكلفة ÷ عدد الشهور). العمر الافتراضي {DEFAULT_LIFE_MONTHS / 12} سنين.
          {mode === 'existing' && ' الجهاز الموجود بيدخل الدفاتر النهارده بقيمته بعد الإهلاك اللي اتراكم عليه لحد النهارده.'}
        </p>
      </form>
    </Drawer>
  );
}

function Stat({ label, value, hint, tone = '' }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`font-bold tabular-nums ${tone}`} dir="ltr" style={{ textAlign: 'right' }}>
        {value}
      </div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** One device: its data and value, who holds it, its money, and selling or scrapping it. */
export function AssetDrawer({ assetId, onClose, onOpenTx }: { assetId: number | null; onClose: () => void; onOpenTx: (id: number) => void }) {
  const { can } = useAuth();
  const { data: a, error } = useAsset(assetId);
  const { data: accounts = [] } = useAccounts();
  const egp = accounts.filter((x) => x.currency === 'EGP' && x.ownership === 'COMPANY');
  const [mode, setMode] = useState<'view' | 'edit' | 'dispose'>('view');
  const [info, setInfo] = useState<Info>(EMPTY_INFO);
  const [cost, setCost] = useState('');
  const [acquiredOn, setAcquiredOn] = useState('');
  const [kind, setKind] = useState<'SALE' | 'SCRAP'>('SALE');
  const [price, setPrice] = useState('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [pay, setPay] = useState<BankPaymentValue>(EMPTY_BANK_PAYMENT);
  const [buyer, setBuyer] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const account = egp.find((x) => x.id === accountId);

  useEffect(() => {
    setMode('view');
    setProblems({});
  }, [assetId]);

  const startEdit = () => {
    if (!a) return;
    setInfo({
      category: a.category,
      name: a.name,
      model: a.model ?? '',
      serialNo: a.serialNo ?? '',
      location: a.location ?? '',
      custodianEmployeeId: a.custodianEmployeeId ?? '',
      lifeYears: String(Math.round(a.usefulLifeMonths / 12)),
      notes: a.notes ?? '',
    });
    setCost(String(Number(a.cost)));
    setAcquiredOn(a.acquiredOn.slice(0, 10));
    setProblems({});
    setMode('edit');
  };
  const startDispose = () => {
    setKind('SALE');
    setPrice('');
    setAccountId('');
    setPay(EMPTY_BANK_PAYMENT);
    setBuyer('');
    setDate(today());
    setNotes('');
    setProblems({});
    setMode('dispose');
  };

  const edit = useAction(
    () =>
      assetsApi.update(a!.id, {
        version: a!.version,
        ...infoBody(info),
        model: info.model.trim(),
        serialNo: info.serialNo.trim(),
        location: info.location.trim(),
        notes: info.notes.trim(),
        custodianEmployeeId: info.custodianEmployeeId || null,
        ...(a!.acquisition === 'EXISTING' ? { cost: Number(cost), acquiredOn } : {}),
      }),
    { success: 'اتحفظت بيانات الجهاز', invalidate: [assetKeys.all, financeKeys.all] },
  );
  const dispose = useAction(
    () =>
      assetsApi.dispose(a!.id, {
        kind,
        ...(kind === 'SALE'
          ? {
              amount: Number(price),
              accountId: Number(accountId),
              ...(account?.type === 'BANK' ? { paymentMethod: pay.paymentMethod || undefined, reference: pay.reference.trim() } : {}),
              buyer: buyer.trim() || undefined,
            }
          : {}),
        date,
        notes: notes.trim(),
      }),
    { success: kind === 'SALE' ? 'اتسجل بيع الجهاز' : 'اتسجل تكهين الجهاز', invalidate: [assetKeys.all, financeKeys.all] },
  );

  if (!a)
    return (
      <Drawer open={!!assetId} onClose={onClose} title="الجهاز">
        {error ? <ErrorBox error={error} /> : <div className="h-40 rounded-2xl shimmer" />}
      </Drawer>
    );

  const d = a.depreciation;
  const active = a.status === 'ACTIVE';
  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = infoProblems(info);
    if (a.acquisition === 'EXISTING') {
      if (!validAmount(cost) || Number(cost) < MIN_ASSET_COST) p.cost = `من ${money(MIN_ASSET_COST)} ج وطالع`;
      if (!acquiredOn || acquiredOn > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    }
    setProblems(p);
    if (Object.keys(p).length === 0) edit.mutateAsync(undefined).then(() => setMode('view'), () => undefined);
  };
  const submitDispose = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (kind === 'SALE') {
      if (!validAmount(price)) p.price = 'اكتب سعر البيع';
      if (!account) p.account = 'اختار الخزنة أو الحساب';
      if (account?.type === 'BANK') {
        const b = bankPaymentProblems({ ...pay, bankCharges: '' });
        if (b.paymentMethod) p.paymentMethod = b.paymentMethod;
        if (b.reference) p.reference = b.reference;
      }
    }
    if (!date || date > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    if (notes.trim().length < 3) p.notes = 'اكتب السبب أو التفاصيل';
    setProblems(p);
    if (Object.keys(p).length === 0) dispose.mutateAsync(undefined).then(() => setMode('view'), () => undefined);
  };
  const gain = kind === 'SALE' && validAmount(price) ? Number(price) - Number(d.netBookValue) : -Number(d.netBookValue);

  return (
    <Drawer
      open={!!assetId}
      onClose={onClose}
      width="max-w-2xl"
      title={`${a.assetNo} · ${a.name}`}
      subtitle={`${ASSET_CATEGORIES[a.category]}${a.model ? ` · ${a.model}` : ''}${a.serialNo ? ` · S/N ${a.serialNo}` : ''}`}
      footer={
        mode === 'edit' ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMode('view')}>
              رجوع
            </Button>
            <Button form="asset-edit" type="submit" loading={edit.isPending}>
              حفظ
            </Button>
          </div>
        ) : mode === 'dispose' ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMode('view')}>
              رجوع
            </Button>
            <Button form="asset-dispose" type="submit" variant={kind === 'SCRAP' ? 'danger' : 'primary'} loading={dispose.isPending}>
              {kind === 'SALE' ? 'سجّل البيع' : 'سجّل التكهين'}
            </Button>
          </div>
        ) : null
      }
    >
      {mode === 'view' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ASSET_STATUS[a.status].tone}>{ASSET_STATUS[a.status].label}</Badge>
            {a.acquisition === 'EXISTING' && <Badge>كان موجود قبل السيستم</Badge>}
            <div className="flex-1" />
            {active && can('assets.manage') && (
              <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={startEdit}>
                تعديل البيانات
              </Button>
            )}
            {active && can('assets.transact') && (
              <Button variant="ghost" onClick={startDispose}>
                بيع / تكهين
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="التكلفة" value={money(a.cost, 'EGP')} hint={`اتشرى ${formatDate(a.acquiredOn)}`} />
            <Stat label="الإهلاك المتراكم" value={money(d.accumulated, 'EGP')} hint={`${d.monthsDone} من ${a.usefulLifeMonths} شهر`} tone="text-warning" />
            <Stat label={active ? 'صافي القيمة' : 'صافي القيمة وقت الخروج'} value={money(d.netBookValue, 'EGP')} hint={active ? `بيخلص إهلاكه ${formatDate(d.fullyDepreciatedOn)}` : `خرج ${formatDate(a.disposedOn)}`} tone="text-gold" />
          </div>
          <div className="grid gap-x-6 gap-y-2 rounded-xl border border-line p-4 text-sm sm:grid-cols-2">
            <Row label="مع مين" value={a.custodian ? `${a.custodian.fullName} · ${a.custodian.code}` : '—'} />
            <Row label="المكان" value={a.location ?? '—'} />
            <Row label="العمر الإنتاجي" value={years(a.usefulLifeMonths)} />
            <Row label="الإهلاك الشهري" value={money(d.monthly, 'EGP')} />
            {a.notes && <Row label="ملاحظات" value={a.notes} />}
          </div>
          {!!a.transactions?.length && (
            <section>
              <h3 className="mb-2 font-semibold text-gold">الفلوس</h3>
              <div className="space-y-2">
                {a.transactions.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onOpenTx(t.id)}
                    className="focus-ring flex w-full flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-start text-sm hover:border-gold/50"
                  >
                    <b>{TX_KINDS[t.kind]}</b>
                    <span className="text-muted" dir="ltr">
                      AT-{t.id}
                    </span>
                    <span>{formatDate(t.txDate)}</span>
                    {t.kind !== 'SCRAP' && <span className="tabular-nums">{money(t.amount, 'EGP')}</span>}
                    {t.account && <span className="text-muted">{t.kind === 'PURCHASE' ? `من ${t.account.name}` : `في ${t.account.name}`}</span>}
                    {t.party && <span className="text-muted">· {t.party}</span>}
                    <span className="flex-1" />
                    <Badge tone={STATUS[t.approvalStatus].tone}>{STATUS[t.approvalStatus].label}</Badge>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {mode === 'edit' && (
        <form id="asset-edit" noValidate onSubmit={submitEdit} className="space-y-4">
          <InfoFields info={info} set={setInfo} problems={problems} />
          {a.acquisition === 'EXISTING' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="تكلفة الشراء الأصلية" inputMode="decimal" dir="ltr" value={cost} error={problems.cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} />
              <TextField label="تاريخ الشراء" type="date" value={acquiredOn} max={today()} error={problems.date} onChange={(e) => setAcquiredOn(e.target.value)} />
            </div>
          ) : (
            <p className="text-xs text-muted">سعر وتاريخ الشراء بيتعدّلوا من حركة الشراء نفسها (قبل اعتمادها).</p>
          )}
        </form>
      )}

      {mode === 'dispose' && (
        <form id="asset-dispose" noValidate onSubmit={submitDispose} className="space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(['SALE', 'SCRAP'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`focus-ring rounded-xl border px-3 py-2.5 text-sm font-semibold ${kind === k ? 'border-gold bg-gold/12 text-gold' : 'border-line text-muted hover:border-gold/40'}`}
              >
                {k === 'SALE' ? 'بيع' : 'تكهين (عطلان / اتشال)'}
              </button>
            ))}
          </div>
          {kind === 'SALE' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="سعر البيع" inputMode="decimal" dir="ltr" value={price} error={problems.price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
                <TextField label="المشتري (اختياري)" value={buyer} onChange={(e) => setBuyer(e.target.value)} />
              </div>
              <SelectField
                label="الفلوس دخلت"
                placeholder="اختار الخزنة أو الحساب"
                options={accountOptions(egp)}
                value={accountId}
                error={problems.account}
                onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
              />
              {account?.type === 'BANK' && <BankPaymentFields value={{ ...pay, bankCharges: '' }} onChange={(v) => setPay({ ...v, bankCharges: '' })} errors={problems} />}
            </>
          )}
          <TextField label="التاريخ" type="date" value={date} max={today()} error={problems.date} onChange={(e) => setDate(e.target.value)} />
          <TextField label={kind === 'SALE' ? 'تفاصيل' : 'سبب التكهين'} value={notes} error={problems.notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
            صافي قيمة الجهاز النهارده {money(d.netBookValue, 'EGP')}
            {(kind === 'SCRAP' || validAmount(price)) && (
              <div className={gain >= 0 ? 'text-success' : 'text-danger'}>
                {gain >= 0 ? `مكسب ${money(gain, 'EGP')}` : `خسارة ${money(-gain, 'EGP')}`} في قائمة الدخل
              </div>
            )}
          </div>
        </form>
      )}
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** A purchase, sale or scrapping as a financial document: for its approvers. */
export function AssetTxDrawer({ tx, open, onClose }: { tx: AssetTx | null; open: boolean; onClose: () => void }) {
  const { can, user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  useEffect(() => setEditing(false), [tx?.id]);
  // its author before approval, the CEO after (as for any financial document)
  const mayEdit =
    !!tx &&
    (tx.approvalStatus === 'APPROVED' ? can('finance.approved.edit') : tx.createdBy?.id === user?.id || can('finance.approved.edit'));
  const save = useAction(
    () =>
      assetsApi.updateTx(tx!.id, {
        version: tx!.version,
        ...(tx!.kind !== 'SCRAP' ? { amount: Number(amount) } : {}),
        date,
        notes: notes.trim() || undefined,
      }),
    { success: 'اتعدّلت الحركة', invalidate: [assetKeys.all, financeKeys.all] },
  );
  const start = () => {
    if (!tx) return;
    setAmount(String(Number(tx.amount)));
    setDate(tx.txDate.slice(0, 10));
    setNotes(tx.notes ?? '');
    setEditing(true);
  };
  return (
    <Drawer open={open} onClose={onClose} title={tx ? `${TX_KINDS[tx.kind]} أصل ثابت · AT-${tx.id}` : 'أصل ثابت'} subtitle={tx?.asset ? `${tx.asset.assetNo} · ${tx.asset.name}` : undefined}>
      {tx && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="grid size-10 place-items-center rounded-lg bg-gold/10 text-gold">
              <Monitor className="size-5" />
            </span>
            <div className="flex-1">
              <div className="font-bold">{tx.asset ? `${ASSET_CATEGORIES[tx.asset.category]} · ${tx.asset.name}` : ''}</div>
              <div className="text-xs text-muted">تكلفة الجهاز {money(tx.asset?.cost ?? 0, 'EGP')}</div>
            </div>
          </div>
          <div className="grid gap-x-6 gap-y-2 rounded-xl border border-line p-4 text-sm">
            <Row label="التاريخ" value={formatDate(tx.txDate)} />
            {tx.kind !== 'SCRAP' && <Row label={tx.kind === 'PURCHASE' ? 'سعر الشراء' : 'سعر البيع'} value={money(tx.amount, 'EGP')} />}
            {tx.account && <Row label={tx.kind === 'PURCHASE' ? 'اتدفع من' : 'دخل في'} value={tx.account.name} />}
            {Number(tx.bankCharges) > 0 && <Row label="مصاريف بنكية" value={money(tx.bankCharges, 'EGP')} />}
            {tx.reference && <Row label="المرجع" value={tx.reference} />}
            {tx.party && <Row label={tx.kind === 'PURCHASE' ? 'المورّد' : 'المشتري'} value={tx.party} />}
            {tx.invoiceNo && <Row label="رقم الفاتورة" value={tx.invoiceNo} />}
            {tx.notes && <Row label="ملاحظات" value={tx.notes} />}
          </div>
          {editing ? (
            <div className="space-y-3 rounded-xl border border-gold/40 p-3">
              {tx.kind !== 'SCRAP' && (
                <TextField
                  label={tx.kind === 'PURCHASE' ? 'سعر الشراء' : 'سعر البيع'}
                  inputMode="decimal"
                  dir="ltr"
                  value={amount}
                  hint={tx.kind === 'PURCHASE' ? `من ${money(MIN_ASSET_COST)} ج وطالع` : undefined}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                />
              )}
              <TextField label="التاريخ" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
              <TextField label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="flex gap-2">
                <Button loading={save.isPending} disabled={tx.kind !== 'SCRAP' && !validAmount(amount)} onClick={() => save.mutateAsync(undefined).then(onClose, () => undefined)}>
                  حفظ
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  رجوع
                </Button>
              </div>
              <p className="text-xs text-muted">التعديل قبل الاعتماد بيرجّع الحركة للاعتماد من الأول، وتكلفة الجهاز بتتبع سعر الشراء.</p>
            </div>
          ) : (
            mayEdit && (
              <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={start}>
                تعديل الحركة
              </Button>
            )
          )}
          <ApprovalTrail doc={tx} />
        </div>
      )}
    </Drawer>
  );
}
