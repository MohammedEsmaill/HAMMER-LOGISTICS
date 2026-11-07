import { HandCoins, Scale } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { useAction } from '@/lib/mutations';
import { financeKeys, money, STATUS, today, useAccounts } from './api';
import { custodyApi, useFees, type Fee, type FeeAdjustment, type FeePayment, type Statement } from './custody-api';
import { BeneficiaryPicker } from './BeneficiaryPicker';
import { useEditable } from './finance-helpers';
import { SelectField } from '@/components/ui/SelectField';
import { ApprovalTrail } from './MovementDrawers';

/** The statement table: عليه / له / الرصيد after each line. */
export function StatementTable({ statement }: { statement: Statement }) {
  const cur = statement.currency;
  const b = Number(statement.totals.balance);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Box label="عليه (استلم من المكتب)" value={money(statement.totals.debit, cur)} />
        <Box label="له (صرف ورد وأتعاب)" value={money(statement.totals.credit, cur)} />
        <Box
          label={b > 0 ? 'الرصيد: معاه فلوس للمكتب' : b < 0 ? 'الرصيد: المكتب عليه فلوس له' : 'الرصيد'}
          value={money(Math.abs(b), cur)}
          tone={b > 0 ? 'text-warning' : b < 0 ? 'text-success' : 'text-gold'}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-muted">
            <tr>
              {['التاريخ', 'البيان', 'المرجع', 'عليه', 'له', 'الرصيد'].map((h) => (
                <th key={h} className="px-3 py-2 text-start font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {statement.lines.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  مفيش حركات
                </td>
              </tr>
            )}
            {statement.lines.map((l, i) => (
              <tr key={i} className="border-t border-line">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.date)}</td>
                <td className="px-3 py-2">
                  {l.description}
                  {l.approvalStatus && (
                    <span className="ms-2">
                      <Badge tone={STATUS[l.approvalStatus].tone}>{STATUS[l.approvalStatus].label}</Badge>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted">
                  <span dir="ltr">{l.reference}</span> · {l.fileNo}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {Number(l.debit) ? money(l.debit) : ''}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {Number(l.credit) ? money(l.credit) : ''}
                </td>
                <td className="px-3 py-2 font-bold" dir="ltr">
                  {money(l.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Box({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-bold ${tone}`} dir="ltr" style={{ textAlign: 'right' }}>
        {value}
      </div>
    </div>
  );
}

/** A clearer's fees per shipment: computed, adjusted, paid, left; pay or adjust from here. */
export function ClearerFeesPanel({ clearerId }: { clearerId: number }) {
  const { can } = useAuth();
  const { data } = useFees({ clearerId });
  const [paying, setPaying] = useState<Fee | null>(null);
  const [adjusting, setAdjusting] = useState<Fee | null>(null);
  if (!data?.items.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-gold">الأتعاب</h3>
      {data.items.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm">
          <div className="min-w-40 flex-1">
            <div className="font-semibold">ملف {f.shipment.fileNo}</div>
            <div className="text-xs text-muted">
              {money(f.base)} + {money(f.extraRate)} × {f.containersCount - 1} · عهدة {f.custody.custodyNo}
            </div>
          </div>
          <div>
            الأتعاب <b dir="ltr">{money(f.total)}</b>
          </div>
          <div className="text-success">
            اتصرف <b dir="ltr">{money(f.paid)}</b>
          </div>
          <div className={Number(f.remaining) > 0 ? 'text-warning' : 'text-muted'}>
            الباقي <b dir="ltr">{money(f.remaining)}</b>
          </div>
          {can('finance.custody.manage') && Number(f.remaining) > 0 && (
            <Button className="h-9 px-3 text-sm" icon={<HandCoins className="size-4" />} onClick={() => setPaying(f)}>
              صرف
            </Button>
          )}
          {can('finance.fees.adjust') && (
            <Button variant="ghost" className="h-9 px-3 text-sm" icon={<Scale className="size-4" />} onClick={() => setAdjusting(f)}>
              تسوية
            </Button>
          )}
        </div>
      ))}
      <FeePaymentDrawer fee={paying} payment={null} open={!!paying} onClose={() => setPaying(null)} />
      <AdjustFeeDrawer fee={adjusting} onClose={() => setAdjusting(null)} />
    </section>
  );
}

/** Pay a fee installment, or view / edit one (from the approvals screen). */
export function FeePaymentDrawer({ fee, payment, open, onClose }: { fee: Fee | null; payment: FeePayment | null; open: boolean; onClose: () => void }) {
  const editable = useEditable(payment, 'finance.custody.manage');
  const { data: accounts = [] } = useAccounts();
  const box = accounts.find((a) => a.type === 'CASH' && a.currency === 'EGP');
  const sources = accounts.filter((a) => a.currency === 'EGP' && (a.isActive || a.id === payment?.account.id));
  const [accountId, setAccountId] = useState<number | ''>('');
  const [beneficiaryId, setBeneficiaryId] = useState<number | ''>('');
  const [transferRef, setTransferRef] = useState('');
  const source = accounts.find((a) => a.id === accountId);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState('');
  const save = useAction(
    () =>
      payment
        ? custodyApi.updateFeePayment(payment.id, { version: payment.version, amount: Number(amount), paymentDate: date, notes: notes.trim() || null })
        : custodyApi.payFee({
            feeId: fee!.id,
            amount: Number(amount),
            accountId: Number(accountId),
            beneficiaryId: source?.type === 'BANK' ? Number(beneficiaryId) : undefined,
            transferRef: source?.type === 'BANK' ? transferRef.trim() || undefined : undefined,
            paymentDate: date,
            notes: notes.trim() || undefined,
          }),
    { success: payment ? 'اتحفظ صرف الأتعاب' : 'اتصرفت الأتعاب', invalidate: [financeKeys.all] },
  );
  useEffect(() => {
    if (!open) return;
    save.reset();
    setProblem('');
    setAmount(payment?.amount ?? fee?.remaining ?? '');
    setDate(payment?.paymentDate.slice(0, 10) ?? today());
    setNotes(payment?.notes ?? '');
    setAccountId(payment?.account.id ?? box?.id ?? '');
    setBeneficiaryId(payment?.beneficiary?.id ?? '');
    setTransferRef(payment?.transferRef ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, payment, fee]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!(n > 0) || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return setProblem('اكتب مبلغ صحيح');
    if (fee && n > Number(fee.remaining)) return setProblem(`أكبر من الباقي (${money(fee.remaining)})`);
    if (!payment && source && n > Number(source.balance)) return setProblem(`رصيد ${source.name} ${money(source.balance)} بس`);
    if (!payment && source?.type === 'BANK' && !beneficiaryId) return setProblem('اختار حساب المستخلص اللي هتحوّل له');
    if (!date || date > today()) return setProblem('التاريخ مينفعش يبقى فاضي أو في المستقبل');
    setProblem('');
    save.mutateAsync(undefined).then(onClose, () => undefined);
  };
  const who = payment?.fee ?? fee;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={payment ? `صرف أتعاب #${payment.id}` : 'صرف أتعاب'}
      description={who ? `${who.clearer.fullName} · ملف ${who.shipment.fileNo}` : undefined}
      footer={
        editable && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button form="fee-pay-form" type="submit" loading={save.isPending}>
              {payment ? 'حفظ التعديل' : 'صرف'}
            </Button>
          </div>
        )
      }
    >
      <form id="fee-pay-form" noValidate onSubmit={submit} className="space-y-4">
        {fee && <p className="rounded-xl bg-surface-2 p-3 text-sm">الباقي من الأتعاب: <b dir="ltr">{money(fee.remaining, 'EGP')}</b></p>}
        <fieldset disabled={!editable} className="space-y-4">
          <SelectField
            label="الصرف من"
            disabled={!!payment}
            options={sources.map((a) => ({ value: a.id, label: `${a.name} · ${money(a.balance, a.currency)}` }))}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
          />
          {source?.type === 'BANK' &&
            (payment ? (
              <p className="rounded-xl bg-surface-2 p-3 text-sm">
                تحويل لـ {payment.beneficiary?.name} · {payment.beneficiary?.bankName} {payment.beneficiary?.accountNumber}
                {payment.transferRef && ` · ${payment.transferRef}`}
              </p>
            ) : (
              who && (
                <>
                  <BeneficiaryPicker value={beneficiaryId} onChange={setBeneficiaryId} clearer={who.clearer} />
                  <TextField label="رقم التحويل (اختياري)" dir="ltr" value={transferRef} onChange={(e) => setTransferRef(e.target.value)} />
                </>
              )
            ))}
          <TextField label="المبلغ (جنيه)" type="number" step="0.01" min="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <TextField label="التاريخ" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          <TextField label="ملاحظات (اختياري)" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </fieldset>
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        {save.error ? <ErrorBox error={save.error} /> : null}
        {payment && <ApprovalTrail doc={payment} />}
      </form>
    </Drawer>
  );
}

/** CEO: raise or lower a fee, with the reason. */
function AdjustFeeDrawer({ fee, onClose }: { fee: Fee | null; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState('');
  const save = useAction(() => custodyApi.adjustFee({ feeId: fee!.id, amount: Number(amount), notes: notes.trim() }), {
    success: 'اتسجلت التسوية',
    invalidate: [financeKeys.all],
  });
  useEffect(() => {
    if (!fee) return;
    save.reset();
    setAmount('');
    setNotes('');
    setProblem('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [fee]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!n || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return setProblem('اكتب مبلغ (بالسالب للتخفيض)');
    if (fee && Number(fee.total) + n < Number(fee.paid)) return setProblem(`الأتعاب هتبقى أقل من اللي اتصرف (${money(fee.paid)})`);
    if (notes.trim().length < 3) return setProblem('اكتب سبب التسوية');
    setProblem('');
    save.mutateAsync(undefined).then(onClose, () => undefined);
  };
  return (
    <Drawer
      open={!!fee}
      onClose={onClose}
      title="تسوية أتعاب"
      description={fee ? `${fee.clearer.fullName} · ملف ${fee.shipment.fileNo} · الأتعاب الحالية ${money(fee.total)}` : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="fee-adjust-form" type="submit" loading={save.isPending}>
            تسجيل
          </Button>
        </div>
      }
    >
      <form id="fee-adjust-form" noValidate onSubmit={submit} className="space-y-4">
        <TextField label="المبلغ" hint="موجب للزيادة، سالب للتخفيض" type="number" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField label="السبب" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </form>
    </Drawer>
  );
}

/** A fee adjustment, read-only (the approvals screen opens it). */
export function FeeAdjustmentDrawer({ adjustment, open, onClose }: { adjustment: FeeAdjustment | null; open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onClose={onClose} title={adjustment ? `تسوية أتعاب #${adjustment.id}` : 'تسوية أتعاب'}>
      {adjustment && (
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl bg-surface-2 p-4 text-sm">
            <div>
              {adjustment.fee.clearer.fullName} · ملف {adjustment.fee.shipment.fileNo}
            </div>
            <div className="text-lg font-bold" dir="ltr" style={{ textAlign: 'right' }}>
              {Number(adjustment.amount) > 0 ? '+' : ''}
              {money(adjustment.amount, 'EGP')}
            </div>
            <div className="text-muted">
              {adjustment.reason === 'CONTAINERS_CHANGED'
                ? `الحاويات اتغيرت من ${adjustment.containersFrom} لـ ${adjustment.containersTo}`
                : adjustment.notes}
            </div>
          </div>
          <ApprovalTrail doc={adjustment} />
        </div>
      )}
    </Drawer>
  );
}
