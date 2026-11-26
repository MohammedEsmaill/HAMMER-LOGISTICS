import { useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { TextField } from '@/components/ui/TextField';
import { api } from '@/lib/api-client';
import { toastError } from '@/lib/mutations';
import { SIGNATURE_FONT, SIGNATURE_INK, signatureSize } from '@/lib/signature-font';
import { ownerName, userKeys, type User } from './api';

/** How the signature sits in its box on an invoice. */
export function SignaturePreview({ signature, name, title }: { signature: string; name: string; title: string }) {
  return (
    <div className="mx-auto w-64 overflow-hidden rounded-lg border-2 border-black bg-white text-center text-black">
      <div className="border-b-2 border-black py-1 text-sm font-bold">{title}</div>
      <div className="grid h-20 place-items-center overflow-hidden px-2">
        <span
          dir="rtl"
          className="whitespace-nowrap"
          style={{ fontFamily: SIGNATURE_FONT, fontWeight: 700, fontSize: signatureSize(signature, 30), color: SIGNATURE_INK, transform: 'rotate(-4deg)', lineHeight: 1.1 }}
        >
          {signature}
        </span>
      </div>
      <div className="mx-auto w-4/5 border-t border-black/60 py-1 text-xs font-semibold">{name}</div>
    </div>
  );
}

/**
 * The CEO and the moderator set the name a user signs the invoices with: it is written
 * in Ruqaa. Left empty, the employee's name signs.
 */
export function SignatureDrawer({ user, onClose }: { user: User | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(user?.signatureName ?? ''), [user]);

  const name = user ? ownerName(user) : '';
  const shown = value.trim() || name;
  const changed = (value.trim() || null) !== (user?.signatureName ?? null);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
      if (value.trim()) await api.put(`/users/${user.id}/signature`, { name: value.trim() });
      else await api.delete(`/users/${user.id}/signature`);
      toast.success('اتحفظ التوقيع');
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      title={`توقيع ${name}`}
      subtitle="الاسم ده بيتكتب بخط الرقعة في خانة الخطوة اللي عملها على الفواتير (إصدار، مراجعة، اعتماد)."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button disabled={!changed} loading={busy} onClick={save}>
            حفظ التوقيع
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-end gap-2">
          <TextField
            label="اسم التوقيع"
            className="flex-1"
            maxLength={40}
            placeholder={name}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {value && (
            <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setValue('')}>
              اسم الموظف
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">اكتبه بالعربي عشان يطلع بخط الرقعة. لو فاضي، اسم الموظف هو اللي بيتكتب.</p>
        <div className="space-y-2">
          <div className="text-sm font-semibold">هيظهر كده على الفاتورة</div>
          <SignaturePreview signature={shown} name={name} title="اعتماد" />
        </div>
      </div>
    </Drawer>
  );
}
