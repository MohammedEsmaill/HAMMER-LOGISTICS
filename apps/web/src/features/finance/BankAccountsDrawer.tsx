import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Badge } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { CURRENCIES, type Currency } from './api';
import { toastError } from '@/lib/mutations';
import { beneficiariesApi, useBeneficiaries } from './custody-api';

/**
 * The bank accounts we pay someone into: a clearer's (from the users screen) or a sister
 * company's / owner's (from the internal accounts). Added and stopped here only.
 */
export function BankAccountsDrawer({
  owner,
  onClose,
}: {
  owner: { kind: 'CLEARER'; id: number; name: string } | { kind: 'PARTY'; id: number; name: string } | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const q = owner?.kind === 'CLEARER' ? { clearerId: owner.id, activeOnly: false } : { partyId: owner?.id, activeOnly: false };
  const { data: list = [] } = useBeneficiaries(q, !!owner);
  const [f, setF] = useState({ bankName: '', accountNumber: '', currency: 'EGP' as Currency });
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setF({ bankName: '', accountNumber: '', currency: 'EGP' });
    setProblem('');
  }, [owner?.id, owner?.kind]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['finance', 'beneficiaries'] });
  const add = async () => {
    if (!owner) return;
    if (f.bankName.trim().length < 2) return setProblem('اكتب اسم البنك');
    if (!/^[A-Za-z0-9 -]{4,40}$/.test(f.accountNumber.trim())) return setProblem('رقم الحساب أو الـ IBAN: من 4 لـ 34 حرف أو رقم');
    setProblem('');
    setBusy(true);
    try {
      await beneficiariesApi.create({
        name: owner.name,
        kind: owner.kind,
        ...(owner.kind === 'CLEARER' ? { clearerId: owner.id } : { partyId: owner.id }),
        bankName: f.bankName.trim(),
        accountNumber: f.accountNumber.trim(),
        ...(owner.kind === 'PARTY' ? { currency: f.currency } : {}),
      });
      setF({ bankName: '', accountNumber: '', currency: 'EGP' });
      await refresh();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (id: number, isActive: boolean) => {
    try {
      await beneficiariesApi.update(id, { isActive });
      await refresh();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Drawer open={!!owner} onClose={onClose} title={`الحسابات البنكية · ${owner?.name ?? ''}`}>
      <div className="space-y-4">
        <div className="space-y-2">
          {list.map((b) => (
            <div key={b.id} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm">
              <div className="flex-1">
                <div className="font-semibold">
                  {b.bankName}
                  {b.currency && <span className="ms-2 text-xs text-muted">{CURRENCIES[b.currency].label}</span>}
                </div>
                <div className="text-muted" dir="ltr" style={{ textAlign: 'right' }}>
                  {b.accountNumber}
                </div>
              </div>
              {b.isActive ? <Badge tone="success">شغّال</Badge> : <Badge>موقوف</Badge>}
              <Button variant="ghost" onClick={() => toggle(b.id, !b.isActive)}>
                {b.isActive ? 'إيقاف' : 'تشغيل'}
              </Button>
            </div>
          ))}
          {list.length === 0 && <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">مفيش حسابات بنكية</div>}
        </div>
        <div className="space-y-3 rounded-xl border border-gold/40 p-3">
          <div className={`grid gap-2 ${owner?.kind === 'PARTY' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            <TextField label="البنك" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} />
            <TextField label="رقم الحساب / IBAN" dir="ltr" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} />
            {owner?.kind === 'PARTY' && (
              <SelectField
                label="العملة"
                options={Object.entries(CURRENCIES).map(([value, c]) => ({ value, label: c.label }))}
                value={f.currency}
                onChange={(e) => setF({ ...f, currency: e.target.value as Currency })}
              />
            )}
          </div>
          {problem && <p className="text-xs text-danger">{problem}</p>}
          <Button icon={<Plus className="size-4" />} loading={busy} onClick={add}>
            إضافة حساب
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
