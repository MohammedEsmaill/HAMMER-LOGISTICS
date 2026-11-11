import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { IconButton } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { ApiError } from '@/lib/api-error';
import { useAction } from '@/lib/mutations';
import { accountApi, accountKeys, type Collection, type ShipmentAccountView } from './account-api';
import { CURRENCIES, financeKeys, money, today, useAccounts, type Currency } from './api';
import { useEditable } from './finance-helpers';
import { ApprovalTrail } from './MovementDrawers';

const ok = (v: string) => v !== '' && Number(v) >= 0 && Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) < 1e-6;

/** "إنهاء": the CLEARANCE from the quote (+ lines), dates, customer ref; warns about a missing certificate. */
export function FinishDrawer({ view, open, onClose }: { view: ShipmentAccountView; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<{ description: string; quantity: string; unitPrice: string }[]>([]);
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [valueDate, setValueDate] = useState(today());
  const [customerRef, setCustomerRef] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [problem, setProblem] = useState('');
  const noCertificate = !view.shipment.certificateNo;
  const save = useAction(
    () =>
      accountApi.finish(view.shipment.id, {
        version: view.account.version,
        clearanceLines: lines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
        invoiceDate,
        valueDate,
        customerRef: customerRef.trim() || undefined,
        confirmNoCertificate: confirm,
      }),
    { success: 'اتقفل حساب الشحنة وطلعت الفواتير', invalidate: [financeKeys.all] },
  );
  useEffect(() => {
    if (!open) return;
    save.reset();
    setLines([]);
    setInvoiceDate(today());
    setValueDate(today());
    setCustomerRef('');
    setConfirm(false);
    setProblem('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open]);

  const clearance = lines.reduce((t, l) => t + Number(l.quantity || 0) * Number(l.unitPrice || 0), Number(view.clearanceQuote.amount));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (view.openCustodies.length) return setProblem(`فيه عهد لسه ما اتصفتش: ${view.openCustodies.join('، ')}`);
    if (lines.some((l) => l.description.trim().length < 2 || !(Number(l.quantity) > 0) || !ok(l.unitPrice))) return setProblem('كمّل بيانات سطور الفاتورة');
    if (invoiceDate > today()) return setProblem('تاريخ الفاتورة مينفعش يبقى في المستقبل');
    if (noCertificate && !confirm) return setProblem('أكّد إنك عايز تكمل من غير رقم شهادة');
    setProblem('');
    save.mutateAsync(undefined).then(
      (v) => {
        queryClient.setQueryData(accountKeys.one(view.shipment.id), v);
        onClose();
      },
      (err) => {
        if (err instanceof ApiError && err.status === 409) void queryClient.invalidateQueries({ queryKey: accountKeys.one(view.shipment.id) });
      },
    );
  };
  const vat = Math.round(clearance * 10) / 100;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={`إنهاء حساب ${view.shipment.fileNo}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="finish-form" type="submit" loading={save.isPending}>
            إنهاء
          </Button>
        </div>
      }
    >
      <form id="finish-form" noValidate onSubmit={submit} className="space-y-5">
        {(['EGP', 'USD'] as Currency[]).map((c) =>
          Number(view.draft[c].total) > 0 ? (
            <p key={c} className="rounded-xl bg-surface-2 p-3 text-sm">
              STATEMENT {CURRENCIES[c].label}: <b dir="ltr">{money(view.draft[c].total, c)}</b> ·{' '}
              {view.draft[c].lines.filter((l) => !l.excluded).length} بند
            </p>
          ) : null,
        )}
        <section className="space-y-3">
          <h3 className="font-semibold text-gold">فاتورة CLEARANCE</h3>
          <div className="flex justify-between rounded-xl border border-line p-3 text-sm">
            <span>
              CLEARANCE <span className="text-muted">({money(view.clearanceQuote.base)} + {money(view.clearanceQuote.extra)} × {view.clearanceQuote.containers - 1})</span>
            </span>
            <b dir="ltr">{money(view.clearanceQuote.amount, 'EGP')}</b>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid items-start gap-2 sm:grid-cols-[1fr_6rem_8rem_auto]">
              <TextField label="الوصف" value={l.description} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, description: e.target.value } : y)))} />
              <TextField label="الكمية" type="number" min="0.01" step="0.01" dir="ltr" value={l.quantity} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, quantity: e.target.value } : y)))} />
              <TextField label="السعر" type="number" min="0" step="0.01" dir="ltr" value={l.unitPrice} onChange={(e) => setLines((x) => x.map((y, j) => (j === i ? { ...y, unitPrice: e.target.value } : y)))} />
              <div className="sm:mt-8">
                <IconButton label="شيل السطر" tone="danger" onClick={() => setLines((x) => x.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </div>
          ))}
          <Button type="button" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setLines((x) => [...x, { description: '', quantity: '1', unitPrice: '' }])}>
            سطر
          </Button>
          <div className="space-y-1 rounded-xl border border-gold/30 bg-gold/5 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">SubTotal</span>
              <span dir="ltr">{money(clearance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">VAT 10%</span>
              <span dir="ltr">{money(vat)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>الإجمالي</span>
              <span dir="ltr" className="text-gold">
                {money(clearance + vat, 'EGP')}
              </span>
            </div>
          </div>
        </section>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Invoice Date" type="date" max={today()} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          <TextField label="Value Date" type="date" value={valueDate} onChange={(e) => setValueDate(e.target.value)} />
          <TextField label="Customer Ref (اختياري)" dir="ltr" value={customerRef} onChange={(e) => setCustomerRef(e.target.value)} />
        </div>
        {noCertificate && (
          <label className="flex cursor-pointer gap-3 rounded-xl bg-warning/10 p-3 text-sm text-warning">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1 accent-[var(--gold)]" />
            <span>
              <AlertTriangle className="me-1 inline size-4" />
              رقم الشهادة مش متسجل في تاب النافذة، فالـ STATEMENT هياخد رقم الملف {view.shipment.fileNo}. أكّد إنك عايز تكمل.
            </span>
          </label>
        )}
        {problem && <p className="text-sm text-danger">{problem}</p>}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </form>
    </Drawer>
  );
}

export function ReopenDrawer({ view, open, onClose }: { view: ShipmentAccountView; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const save = useAction(() => accountApi.reopen(view.shipment.id, { version: view.account.version, reason: reason.trim() }), {
    success: 'اتفتح حساب الشحنة والفواتير اتلغت',
    invalidate: [financeKeys.all],
  });
  useEffect(() => {
    if (!open) return;
    save.reset();
    setReason('');
    setProblem('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open]);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="إعادة فتح حساب الشحنة"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="danger"
            loading={save.isPending}
            onClick={() => {
              if (reason.trim().length < 3) return setProblem('اكتب سبب إعادة الفتح');
              setProblem('');
              save.mutateAsync(undefined).then((v) => {
                queryClient.setQueryData(accountKeys.one(view.shipment.id), v);
                onClose();
              }, () => undefined);
            }}
          >
            إعادة فتح
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <TextField label="السبب" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} error={problem || undefined} />
        {save.error ? <ErrorBox error={save.error} /> : null}
      </div>
    </Drawer>
  );
}

/** A collection from the client: new on a shipment, or view / edit one. */
export function CollectionDrawer({
  view,
  collection,
  open,
  onClose,
}: {
  view?: ShipmentAccountView;
  collection: Collection | null;
  open: boolean;
  onClose: () => void;
}) {
  const editable = useEditable(collection, 'finance.collections.manage');
  const { data: accounts = [] } = useAccounts();
  const owed = view?.totals.filter((t) => Number(t.outstanding) > 0) ?? [];
  const [currency, setCurrency] = useState<Currency>('EGP');
  const [method, setMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [bankId, setBankId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState('');
  const outstanding = view?.totals.find((t) => t.currency === currency)?.outstanding;
  const banks = accounts.filter((a) => a.type === 'BANK' && a.isActive && a.currency === currency);
  const save = useAction(
    () =>
      collection
        ? accountApi.updateCollection(collection.id, {
            version: collection.version,
            amount: Number(amount),
            collectionDate: date,
            reference: reference.trim() || null,
            notes: notes.trim() || null,
          })
        : accountApi.collect({
            shipmentId: view!.shipment.id,
            currency,
            amount: Number(amount),
            method,
            bankAccountId: method === 'TRANSFER' ? Number(bankId) : undefined,
            collectionDate: date,
            reference: reference.trim() || undefined,
            notes: notes.trim() || undefined,
          }),
    { success: collection ? 'اتحفظ التحصيل' : 'اتسجل التحصيل', invalidate: [financeKeys.all] },
  );
  useEffect(() => {
    if (!open) return;
    save.reset();
    setProblem('');
    setCurrency(collection?.currency ?? owed[0]?.currency ?? 'EGP');
    setMethod(collection?.method ?? 'CASH');
    setBankId('');
    setAmount(collection?.amount ?? owed[0]?.outstanding ?? '');
    setDate(collection?.collectionDate.slice(0, 10) ?? today());
    setReference(collection?.reference ?? '');
    setNotes(collection?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, collection]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0) || !ok(amount)) return setProblem('اكتب مبلغ صحيح');
    if (!collection && outstanding !== undefined && n > Number(outstanding)) return setProblem(`أكبر من المتبقي (${money(outstanding, currency)})`);
    if (!collection && method === 'TRANSFER' && !bankId) return setProblem('اختار الحساب البنكي اللي استلم');
    if (!date || date > today()) return setProblem('التاريخ مينفعش يبقى فاضي أو في المستقبل');
    setProblem('');
    save.mutateAsync(undefined).then(onClose, () => undefined);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={collection ? `تحصيل #${collection.id}` : 'تحصيل من العميل'}
      subtitle={collection?.shipment ? `${collection.client?.name} · ملف ${collection.shipment.fileNo}` : view ? `${view.shipment.client.name} · ملف ${view.shipment.fileNo}` : undefined}
      footer={
        editable && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button form="collection-form" type="submit" loading={save.isPending}>
              {collection ? 'حفظ التعديل' : 'تسجيل'}
            </Button>
          </div>
        )
      }
    >
      <form id="collection-form" noValidate onSubmit={submit} className="space-y-4">
        <fieldset disabled={!editable} className="space-y-4">
          {!collection && (
            <>
              <SelectField
                label="العملة"
                options={(['EGP', 'USD'] as Currency[]).map((c) => ({
                  value: c,
                  label: `${CURRENCIES[c].label} · المتبقي ${money(view?.totals.find((t) => t.currency === c)?.outstanding ?? 0, c)}`,
                }))}
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              />
              <SelectField
                label="الطريقة"
                options={[
                  { value: 'CASH', label: 'كاش (للخزنة)' },
                  { value: 'TRANSFER', label: 'تحويل (لحساب بنكي)' },
                ]}
                value={method}
                onChange={(e) => setMethod(e.target.value as 'CASH' | 'TRANSFER')}
              />
              {method === 'TRANSFER' && (
                <SelectField
                  label="الحساب البنكي"
                  options={banks.map((b) => ({ value: b.id, label: b.name }))}
                  value={bankId}
                  onChange={(e) => setBankId(e.target.value ? Number(e.target.value) : '')}
                />
              )}
            </>
          )}
          <TextField label={`المبلغ (${CURRENCIES[collection?.currency ?? currency].label})`} type="number" step="0.01" min="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <TextField label="التاريخ" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          <TextField label="المرجع (اختياري)" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
          <TextField label="ملاحظات (لو فيه خصم اكتبه هنا)" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
        </fieldset>
        {problem && <p className="text-sm text-danger">{problem}</p>}
        {save.error ? <ErrorBox error={save.error} /> : null}
        {collection && <ApprovalTrail doc={collection} />}
      </form>
    </Drawer>
  );
}
