import { Plus, Receipt } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useId, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { useAction } from '@/lib/mutations';
import { financeKeys, money, STATUS, today, useAccounts, useDocument, type ApprovalStatus } from './api';
import { useEditable } from './finance-helpers';
import { ApprovalTrail } from './MovementDrawers';
import { officeApi, useExpenseReport, useExpenses, useExpenseTypes, type Expense, type ExpensesQuery } from './office-api';

/** A general expense from the EGP cash box: a new one, or an edit / view. */
export function ExpenseDrawer({ expense, open, onClose }: { expense: Expense | null; open: boolean; onClose: () => void }) {
  const editable = useEditable(expense, 'finance.expenses.manage');
  const { data: types = [] } = useExpenseTypes();
  const { data: accounts = [] } = useAccounts();
  const box = accounts.find((a) => a.type === 'CASH' && a.currency === 'EGP');
  const listId = useId();
  const [f, setF] = useState({ expenseType: '', payee: '', amount: '', receiptNo: '', expenseDate: today(), notes: '' });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useAction(
    () => {
      const body = {
        expenseType: f.expenseType.trim(),
        payee: f.payee.trim(),
        amount: Number(f.amount),
        receiptNo: f.receiptNo.trim(),
        expenseDate: f.expenseDate,
      };
      return expense
        ? officeApi.updateExpense(expense.id, { ...body, notes: f.notes.trim() || null, version: expense.version })
        : officeApi.createExpense({ ...body, notes: f.notes.trim() || undefined });
    },
    { success: expense ? 'اتحفظ المصروف' : 'اتصرف المصروف', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    setProblems({});
    setF({
      expenseType: expense?.expenseType.name ?? '',
      payee: expense?.payee ?? '',
      amount: expense?.amount ?? '',
      receiptNo: expense?.receiptNo ?? '',
      expenseDate: expense?.expenseDate.slice(0, 10) ?? today(),
      notes: expense?.notes ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, expense]);

  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF((v) => ({ ...v, [key]: e.target.value }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (f.expenseType.trim().length < 2) p.expenseType = 'اكتب أو اختار نوع المصروف';
    if (f.payee.trim().length < 2) p.payee = 'اكتب الجهة اللي اتدفعلها';
    const n = Number(f.amount);
    if (!(n > 0) || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) p.amount = 'اكتب مبلغ صحيح (رقمين عشريين بالكتير)';
    if (!/^[A-Za-z0-9/-]{1,30}$/.test(f.receiptNo.trim())) p.receiptNo = 'رقم الإيصال إجباري (حروف وأرقام)';
    if (!f.expenseDate || f.expenseDate > today()) p.expenseDate = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    if (!expense && box && n > Number(box.balance)) p.amount = `رصيد خزنة الجنيه ${money(box.balance)} بس`;
    setProblems(p);
    if (Object.keys(p).length === 0) save.mutateAsync(undefined).then(onClose, () => undefined);
  };
  const isNewType = f.expenseType.trim().length >= 2 && !types.some((t) => t.name === f.expenseType.trim());

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={expense ? `مصروف #${expense.id}` : 'مصروف جديد'}
      description={`بيتصرف من خزنة الجنيه${box ? ` (الرصيد ${money(box.balance)} ج)` : ''}.`}
      footer={
        editable && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button form="expense-form" type="submit" loading={save.isPending}>
              {expense ? 'حفظ التعديل' : 'صرف'}
            </Button>
          </div>
        )
      }
    >
      <form id="expense-form" noValidate onSubmit={submit} className="space-y-4">
        <fieldset disabled={!editable} className="space-y-4">
          <div>
            <TextField
              label="نوع المصروف"
              list={listId}
              placeholder="كهربا، بوفيه، أدوات مكتبية..."
              value={f.expenseType}
              onChange={set('expenseType')}
              error={problems.expenseType}
              hint={isNewType ? 'نوع جديد: هيتضاف للقائمة تلقائي' : undefined}
            />
            <datalist id={listId}>
              {types.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
          </div>
          <TextField label="الجهة اللي اتدفعلها" value={f.payee} maxLength={150} onChange={set('payee')} error={problems.payee} />
          <TextField label="المبلغ (جنيه)" type="number" step="0.01" min="0.01" dir="ltr" value={f.amount} onChange={set('amount')} error={problems.amount} />
          <TextField label="رقم الإيصال" dir="ltr" maxLength={30} value={f.receiptNo} onChange={set('receiptNo')} error={problems.receiptNo} />
          <TextField label="التاريخ" type="date" max={today()} value={f.expenseDate} onChange={set('expenseDate')} error={problems.expenseDate} />
          <TextField label="ملاحظات (اختياري)" maxLength={500} value={f.notes} onChange={set('notes')} />
        </fieldset>
        {save.error ? <ErrorBox error={save.error} /> : null}
        {expense && <ApprovalTrail doc={expense} />}
      </form>
    </Drawer>
  );
}

function Report({ q }: { q: Omit<ExpensesQuery, 'page'> }) {
  const { data } = useExpenseReport(q, true);
  if (!data) return <div className="h-32 rounded-2xl shimmer" />;
  const max = Math.max(...data.byType.map((t) => Number(t.total)), 1);
  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-gold">التقرير</h3>
        <div className="text-sm text-muted">
          {data.count} مصروف · الإجمالي{' '}
          <b className="text-lg text-gold" dir="ltr">
            {money(data.total, 'EGP')}
          </b>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm text-muted">حسب النوع</div>
          {data.byType.length === 0 && <p className="text-sm text-muted">مفيش مصاريف</p>}
          {data.byType.map((t, i) => (
            <div key={t.expenseType.id} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>
                  {t.expenseType.name} <span className="text-muted">({t.count})</span>
                </span>
                <b dir="ltr">{money(t.total)}</b>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <motion.div
                  className="h-full gold-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${(Number(t.total) / max) * 100}%` }}
                  transition={{ delay: i * 0.05, duration: 0.6 }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="text-sm text-muted">أعلى الجهات</div>
          {data.byPayee.slice(0, 8).map((p) => (
            <div key={p.payee} className="flex justify-between rounded-lg border border-line px-3 py-2 text-sm">
              <span>
                {p.payee} <span className="text-muted">({p.count})</span>
              </span>
              <b dir="ltr">{money(p.total)}</b>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function ExpensesPage() {
  const { can } = useAuth();
  const [q, setQ] = useState<ExpensesQuery>({ page: 1, expenseTypeId: '', status: '' });
  const { data, isLoading, error } = useExpenses(q);
  const { data: types = [] } = useExpenseTypes();
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const expense = useDocument<Expense>('EXPENSE', openId).data;
  const set = (patch: Partial<ExpensesQuery>) => setQ((p) => ({ ...p, page: 1, ...patch }));
  const filters = { from: q.from, to: q.to, expenseTypeId: q.expenseTypeId, payee: q.payee, status: q.status };

  const columns: Column<Expense>[] = [
    { header: 'التاريخ', cell: (e) => <span className="whitespace-nowrap">{formatDate(e.expenseDate)}</span> },
    {
      header: 'النوع',
      cell: (e) => (
        <span className="flex items-center gap-2">
          <Receipt className="size-4 text-gold" />
          {e.expenseType.name}
        </span>
      ),
    },
    { header: 'الجهة', cell: (e) => e.payee },
    { header: 'الإيصال', cell: (e) => <span dir="ltr">{e.receiptNo}</span> },
    { header: 'المبلغ', cell: (e) => <b dir="ltr">{money(e.amount, 'EGP')}</b> },
    { header: 'الحالة', cell: (e) => <Badge tone={STATUS[e.approvalStatus].tone}>{STATUS[e.approvalStatus].label}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="المصاريف العمومية"
        description="مصاريف المكتب والنثريات من خزنة الجنيه. أي نوع جديد بتكتبه بيتضاف للقائمة."
        actions={
          can('finance.expenses.manage') && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              مصروف جديد
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <TextField label="من" type="date" className="w-44" value={q.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
        <TextField label="إلى" type="date" className="w-44" value={q.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
        <div className="w-48">
          <SelectField
            label="النوع"
            placeholder="كل الأنواع"
            options={types.map((t) => ({ value: t.id, label: t.name }))}
            value={q.expenseTypeId}
            onChange={(e) => set({ expenseTypeId: e.target.value ? Number(e.target.value) : '' })}
          />
        </div>
        <TextField label="الجهة" className="w-48" value={q.payee ?? ''} onChange={(e) => set({ payee: e.target.value || undefined })} />
        <div className="w-48">
          <SelectField
            label="الحالة"
            placeholder="كل الحالات"
            options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))}
            value={q.status}
            onChange={(e) => set({ status: e.target.value as ApprovalStatus | '' })}
          />
        </div>
      </div>
      {can('finance.expenses.report') && (
        <div className="mb-5">
          <Report q={filters} />
        </div>
      )}
      <DataTable columns={columns} rows={data?.items} rowKey={(e) => e.id} loading={isLoading} error={error} empty="مفيش مصاريف بالفلتر ده" onRowClick={(e) => setOpenId(e.id)} />
      <div className="mt-4">
        <Pagination page={q.page} pageSize={25} total={data?.total ?? 0} onChange={(page) => setQ((p) => ({ ...p, page }))} />
      </div>
      <ExpenseDrawer expense={null} open={creating} onClose={() => setCreating(false)} />
      <ExpenseDrawer expense={expense ?? null} open={!!expense && openId !== null} onClose={() => setOpenId(null)} />
    </>
  );
}

