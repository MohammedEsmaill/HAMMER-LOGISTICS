import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { PageHeader } from '@/components/ui/misc';
import { TextField } from '@/components/ui/TextField';
import { useAction } from '@/lib/mutations';
import { accountApi, accountKeys, useCompany } from '../finance/account-api';

/** CEO: the company data printed on invoices and statements. */
export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useCompany();
  const [f, setF] = useState({ name: '', address: '', taxNumber: '', crNumber: '', emails: '' });
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (data) setF({ ...data, emails: data.emails.join('\n') });
  }, [data]);
  const save = useAction(
    () =>
      accountApi.updateCompany({
        name: f.name.trim(),
        address: f.address.trim(),
        taxNumber: f.taxNumber.trim(),
        crNumber: f.crNumber.trim(),
        emails: f.emails.split(/[\s,]+/).filter(Boolean),
      }),
    { success: 'اتحفظت بيانات الشركة' },
  );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const emails = f.emails.split(/[\s,]+/).filter(Boolean);
    if (emails.some((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m))) return setProblem('فيه إيميل مش صحيح');
    if (f.address.trim().length < 5) return setProblem('اكتب العنوان');
    setProblem('');
    save.mutateAsync(undefined).then((v) => queryClient.setQueryData(accountKeys.company, v), () => undefined);
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <PageHeader title="إعدادات الشركة" />
      <form noValidate onSubmit={submit} className="card max-w-2xl space-y-4 p-5">
        <TextField label="اسم الشركة" value={f.name} onChange={set('name')} />
        <TextField label="العنوان (بالإنجليزي زي ما بيتطبع)" dir="ltr" value={f.address} onChange={set('address')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="الرقم الضريبي" dir="ltr" value={f.taxNumber} onChange={set('taxNumber')} />
          <TextField label="السجل التجاري" dir="ltr" value={f.crNumber} onChange={set('crNumber')} />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">الإيميلات (واحد في كل سطر)</span>
          <textarea dir="ltr" rows={4} value={f.emails} onChange={set('emails')} className="w-full rounded-xl border border-line bg-surface-2 p-3 outline-none focus:border-gold" />
        </label>
        {problem && <p className="text-sm text-danger">{problem}</p>}
        {save.error ? <ErrorBox error={save.error} /> : null}
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>
            حفظ
          </Button>
        </div>
      </form>
    </>
  );
}
