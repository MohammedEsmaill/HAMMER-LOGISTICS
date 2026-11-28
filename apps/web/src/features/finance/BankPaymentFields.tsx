import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { BANK_METHODS, type BankPaymentMethod } from './api';

export interface BankPaymentValue {
  paymentMethod: BankPaymentMethod | '';
  reference: string;
  bankCharges: string;
}

export const EMPTY_BANK_PAYMENT: BankPaymentValue = { paymentMethod: '', reference: '', bankCharges: '' };

/** The value of a stored document, for its edit form. */
export const bankPaymentOf = (doc?: { paymentMethod?: BankPaymentMethod | null; bankCharges?: string } | null, reference?: string | null): BankPaymentValue => ({
  paymentMethod: doc?.paymentMethod ?? '',
  reference: reference ?? '',
  bankCharges: doc?.bankCharges && Number(doc.bankCharges) > 0 ? doc.bankCharges : '',
});

/** What is wrong with a bank payment, by field (empty when fine). */
export function bankPaymentProblems(v: BankPaymentValue): Partial<Record<keyof BankPaymentValue, string>> {
  const p: Partial<Record<keyof BankPaymentValue, string>> = {};
  if (!v.paymentMethod) p.paymentMethod = 'اختار طريقة الدفع';
  if (!/^[A-Za-z0-9/-]{1,40}$/.test(v.reference.trim()))
    p.reference = v.paymentMethod === 'CHEQUE' ? 'اكتب رقم الشيك (حروف وأرقام)' : 'اكتب الرقم المرجعي للتحويل (حروف وأرقام)';
  const n = Number(v.bankCharges || 0);
  if (!(n >= 0) || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) p.bankCharges = 'اكتب مبلغ صحيح';
  return p;
}

/** The body fields of a bank payment, for the API. */
export const bankPaymentBody = (v: BankPaymentValue) => ({
  paymentMethod: v.paymentMethod || undefined,
  // a cheque has no bank charges
  bankCharges: v.bankCharges && v.paymentMethod !== 'CHEQUE' ? Number(v.bankCharges) : 0,
});

/**
 * How money leaves a bank account: by transfer (its reference) or cheque (its number,
 * recorded on the day the bank paid it), and the bank's charges taken with it.
 */
export function BankPaymentFields({
  value,
  onChange,
  errors = {},
  currency = 'EGP',
}: {
  value: BankPaymentValue;
  onChange: (v: BankPaymentValue) => void;
  errors?: Partial<Record<keyof BankPaymentValue, string>>;
  currency?: string;
}) {
  const set = (key: keyof BankPaymentValue) => (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="space-y-3 rounded-xl border border-gold/30 bg-gold/5 p-3">
      <div className="text-sm font-semibold text-gold">الدفع من البنك</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="طريقة الدفع"
          options={Object.entries(BANK_METHODS).map(([v, l]) => ({ value: v, label: l }))}
          value={value.paymentMethod}
          onChange={(e) =>
            onChange({ ...value, paymentMethod: e.target.value as BankPaymentMethod | '', ...(e.target.value === 'CHEQUE' ? { bankCharges: '' } : {}) })
          }
          error={errors.paymentMethod}
        />
        <TextField
          label={value.paymentMethod === 'CHEQUE' ? 'رقم الشيك' : 'الرقم المرجعي للتحويل'}
          dir="ltr"
          maxLength={40}
          value={value.reference}
          onChange={set('reference')}
          error={errors.reference}
        />
      </div>
      {value.paymentMethod !== 'CHEQUE' && (
      <TextField
        label={`مصاريف البنك (${currency}، اختياري)`}
        type="number"
        step="0.01"
        min="0"
        dir="ltr"
        value={value.bankCharges}
        onChange={set('bankCharges')}
        error={errors.bankCharges}
      />
      )}
      {value.paymentMethod === 'CHEQUE' && <p className="text-xs text-muted">الشيك بيتسجّل بتاريخ صرفه من البنك.</p>}
    </div>
  );
}
