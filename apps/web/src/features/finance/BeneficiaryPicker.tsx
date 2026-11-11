import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ComboField } from '@/components/ui/ComboField';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/auth/auth-context';
import { BENEFICIARY_KINDS, beneficiariesApi, useBeneficiaries, type BeneficiaryKind } from './custody-api';

/**
 * Picks the external account a bank transfer pays into, or adds a new one on the spot
 * (it is kept for next time). With clearerId only that clearer's accounts are offered.
 */
export function BeneficiaryPicker({
  value,
  onChange,
  error,
  clearer,
}: {
  value: number | '';
  onChange: (id: number | '') => void;
  error?: string;
  clearer?: { id: number; fullName: string };
}) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const { data: list = [] } = useBeneficiaries({ clearerId: clearer?.id });
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', kind: 'SHIPPING_AGENCY' as BeneficiaryKind, bankName: '', accountNumber: '' });
  const [problem, setProblem] = useState('');
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const kind = clearer ? 'CLEARER' : f.kind;
    if (f.name.trim().length < 2) return setProblem('اكتب اسم المستفيد');
    if (f.bankName.trim().length < 2) return setProblem('اكتب اسم البنك');
    if (!/^[A-Za-z0-9 -]{4,40}$/.test(f.accountNumber.trim())) return setProblem('رقم الحساب أو الـ IBAN: من 4 لـ 34 حرف أو رقم');
    if (kind === 'CLEARER' && !clearer) return setProblem('حساب المستخلص بيتضاف من صرف أتعابه');
    setProblem('');
    setBusy(true);
    setFailure(null);
    try {
      const created = await beneficiariesApi.create({
        name: f.name.trim(),
        kind,
        clearerId: clearer?.id,
        bankName: f.bankName.trim(),
        accountNumber: f.accountNumber.trim(),
      });
      await queryClient.invalidateQueries({ queryKey: ['finance', 'beneficiaries'] });
      onChange(created.id);
      setAdding(false);
      setF({ name: '', kind: 'SHIPPING_AGENCY', bankName: '', accountNumber: '' });
    } catch (e) {
      setFailure(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <ComboField
        label={clearer ? `حساب ${clearer.fullName}` : 'الحساب المستلم (المستفيد)'}
        placeholder={list.length ? 'اختار الحساب' : 'لا توجد حسابات مسجلة'}
        options={list.map((b) => ({ value: b.id, label: `${b.name} · ${BENEFICIARY_KINDS[b.kind]} · ${b.bankName} ${b.accountNumber}` }))}
        value={value}
        onChange={(v) => onChange(v === '' ? '' : Number(v))}
        error={error}
      />
      {can('finance.custody.manage') && !adding && (
        <button type="button" className="flex items-center gap-1 text-sm text-gold hover:underline" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> حساب جديد
        </button>
      )}
      {adding && (
        <div className="space-y-3 rounded-xl border border-dashed border-gold/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="اسم المستفيد" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            {clearer ? (
              <TextField label="النوع" value="مستخلص" disabled />
            ) : (
              <SelectField
                label="النوع"
                options={(['SHIPPING_AGENCY', 'OTHER'] as BeneficiaryKind[]).map((k) => ({ value: k, label: BENEFICIARY_KINDS[k] }))}
                value={f.kind}
                onChange={(e) => setF({ ...f, kind: e.target.value as BeneficiaryKind })}
              />
            )}
            <TextField label="البنك" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} />
            <TextField label="رقم الحساب / IBAN" dir="ltr" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} />
          </div>
          {problem && <p className="text-sm text-danger">{problem}</p>}
          {failure ? <ErrorBox error={failure} /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="h-9 px-3 text-sm" onClick={() => setAdding(false)}>
              إلغاء
            </Button>
            <Button type="button" className="h-9 px-3 text-sm" loading={busy} onClick={add}>
              حفظ الحساب
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
