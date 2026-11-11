import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
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
import { financeKeys, money, STATUS, today, useAccounts } from './api';
import { accountOptions, useEditable } from './finance-helpers';
import { ApprovalTrail } from './MovementDrawers';
import {
  ADJUSTMENTS,
  currentMonth,
  monthLabel,
  officeApi,
  useAdvanceStatement,
  useSalaryPreview,
  type Adjustment,
  type AdjustmentKind,
  type Advance,
  type Salary,
} from './office-api';

const cents = (v: number | string) => Math.round(Number(v || 0) * 100);
const validAmount = (v: number | string) => v !== '' && Number(v) > 0 && Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) < 1e-6;

function Footer({ onClose, form, busy, label }: { onClose: () => void; form: string; busy: boolean; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onClose}>
        إلغاء
      </Button>
      <Button form={form} type="submit" loading={busy}>
        {label}
      </Button>
    </div>
  );
}

/** Pay one month's salary, or edit / view a salary already paid. */
export function SalaryDrawer({ salary, open, onClose }: { salary: Salary | null; open: boolean; onClose: () => void }) {
  const editable = useEditable(salary, 'finance.payroll.manage');
  const { data: employees = [] } = useEmployeeOptions(undefined, open && !salary);
  const { data: accounts = [] } = useAccounts();
  const egp = accounts.filter((a) => a.currency === 'EGP');
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [month, setMonth] = useState(currentMonth());
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [advanceDeduction, setAdvanceDeduction] = useState<number | string>('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const preview = useSalaryPreview(salary ? undefined : employeeId || undefined, month).data;

  const save = useAction(
    () => {
      const body = {
        adjustments: adjustments.map((a) => ({ kind: a.kind, amount: Number(a.amount), reason: a.reason.trim() })),
        advanceDeduction: Number(advanceDeduction || 0),
        accountId: Number(accountId),
        paymentDate,
        notes: notes.trim() || null,
      };
      return salary
        ? officeApi.updateSalary(salary.id, { ...body, version: salary.version })
        : officeApi.createSalary({ ...body, employeeId: Number(employeeId), salaryMonth: month, notes: body.notes ?? undefined });
    },
    { success: salary ? 'اتحفظ المرتب' : 'اتصرف المرتب', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    setProblems({});
    setEmployeeId(salary?.employee.id ?? '');
    setMonth(salary?.salaryMonth.slice(0, 7) ?? currentMonth());
    setAdjustments(salary?.adjustments ?? []);
    setAdvanceDeduction(salary ? salary.advanceDeduction : '');
    setAccountId(salary?.account.id ?? egp.find((a) => a.type === 'CASH')?.id ?? '');
    setPaymentDate(salary?.paymentDate.slice(0, 10) ?? today());
    setNotes(salary?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, salary]);

  const basic = salary ? salary.basic : (preview?.basic ?? '0');
  // while editing, this salary's own deduction is part of what may be deducted
  const advanceBalance = salary ? undefined : preview?.advanceBalance;
  const totals = useMemo(() => {
    const add = adjustments.filter((a) => ADJUSTMENTS[a.kind].adds).reduce((s, a) => s + cents(a.amount), 0);
    const ded = adjustments.filter((a) => !ADJUSTMENTS[a.kind].adds).reduce((s, a) => s + cents(a.amount), 0);
    const net = cents(basic) + add - ded - cents(advanceDeduction);
    return { add: add / 100, ded: ded / 100, net: net / 100 };
  }, [adjustments, advanceDeduction, basic]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (!salary && !employeeId) p.employee = 'اختار الموظف';
    if (!salary && month > currentMonth()) p.month = 'الشهر لسه مجاش';
    if (preview?.alreadyPaid) p.month = 'مرتب الشهر ده اتصرف قبل كده';
    adjustments.forEach((a, i) => {
      if (!validAmount(a.amount)) p[`amount${i}`] = 'اكتب مبلغ صحيح';
      if (a.reason.trim().length < 3) p[`reason${i}`] = 'اكتب السبب';
    });
    if (advanceDeduction !== '' && (Number(advanceDeduction) < 0 || Number.isNaN(Number(advanceDeduction)))) p.advance = 'مبلغ غير صحيح';
    if (advanceBalance !== undefined && Number(advanceDeduction || 0) > Number(advanceBalance)) p.advance = `أكبر من رصيد السلف (${money(advanceBalance)})`;
    if (totals.net < 0) p.net = 'الخصومات أكبر من المرتب';
    if (!accountId) p.account = 'اختار الخزنة أو الحساب';
    if (!paymentDate || paymentDate > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    setProblems(p);
    if (Object.keys(p).length === 0) save.mutateAsync(undefined).then(onClose, () => undefined);
  };

  const setAdj = (i: number, patch: Partial<Adjustment>) => setAdjustments((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={salary ? `مرتب ${salary.employee.fullName} · ${monthLabel(salary.salaryMonth)}` : 'صرف مرتب'}
      footer={editable && <Footer onClose={onClose} form="salary-form" busy={save.isPending} label={salary ? 'حفظ التعديل' : 'صرف'} />}
    >
      <form id="salary-form" noValidate onSubmit={submit} className="space-y-5">
        <fieldset disabled={!editable} className="space-y-5">
          {!salary && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ComboField
                label="الموظف"
                options={employees.map((e) => ({ value: e.id, label: `${e.fullName} (${e.code})` }))}
                value={employeeId}
                onChange={(v) => setEmployeeId(v === '' ? '' : Number(v))}
                error={problems.employee}
              />
              <TextField label="الشهر" type="month" max={currentMonth()} value={month} onChange={(e) => setMonth(e.target.value)} error={problems.month} />
            </div>
          )}
          {preview?.alreadyPaid && (
            <p className="flex items-center gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
              <AlertTriangle className="size-4" /> مرتب الشهر ده اتصرف يوم {formatDate(preview.alreadyPaid.paymentDate)} بصافي {money(preview.alreadyPaid.net)} ج
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-xs text-muted">المرتب الأساسي</div>
              <div className="text-lg font-bold" dir="ltr" style={{ textAlign: 'right' }}>
                {money(basic, 'EGP')}
              </div>
            </div>
            {advanceBalance !== undefined && (
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">رصيد السلف</div>
                <div className="text-lg font-bold text-warning" dir="ltr" style={{ textAlign: 'right' }}>
                  {money(advanceBalance, 'EGP')}
                </div>
              </div>
            )}
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gold">الزيادات والخصومات</h3>
              {editable && (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-3 text-sm"
                  icon={<Plus className="size-4" />}
                  onClick={() => setAdjustments((l) => [...l, { kind: 'BONUS', amount: '', reason: '' }])}
                >
                  بند
                </Button>
              )}
            </div>
            {adjustments.length === 0 && <EmptyState compact text="مفيش زيادات ولا خصومات." />}
            {adjustments.map((a, i) => (
              <div key={i} className="grid items-start gap-2 rounded-xl border border-line p-3 sm:grid-cols-[8rem_8rem_1fr_auto]">
                <SelectField
                  label="النوع"
                  options={Object.entries(ADJUSTMENTS).map(([value, k]) => ({ value, label: `${k.label} (${k.adds ? '+' : '−'})` }))}
                  value={a.kind}
                  onChange={(e) => setAdj(i, { kind: e.target.value as AdjustmentKind })}
                />
                <TextField label="المبلغ" type="number" step="0.01" min="0.01" dir="ltr" value={a.amount} onChange={(e) => setAdj(i, { amount: e.target.value })} error={problems[`amount${i}`]} />
                <TextField label="السبب" value={a.reason} maxLength={300} onChange={(e) => setAdj(i, { reason: e.target.value })} error={problems[`reason${i}`]} />
                {editable && (
                  <div className="sm:mt-8">
                    <IconButton label="شيل البند" tone="danger" onClick={() => setAdjustments((l) => l.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                )}
              </div>
            ))}
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="خصم السلف"
              type="number"
              step="0.01"
              min="0"
              dir="ltr"
              value={advanceDeduction}
              onChange={(e) => setAdvanceDeduction(e.target.value)}
              error={problems.advance}
            />
            <SelectField
              label="الصرف من"
              options={accountOptions(egp, salary?.account.id)}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
              error={problems.account}
            />
            <TextField label="تاريخ الصرف" type="date" max={today()} value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} error={problems.date} />
            <TextField label="ملاحظات (اختياري)" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </fieldset>

        <div className="space-y-1 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm">
          <Row label="الأساسي" value={money(basic)} />
          <Row label="الزيادات" value={`+ ${money(totals.add)}`} tone="text-success" />
          <Row label="الخصومات" value={`− ${money(totals.ded)}`} tone="text-danger" />
          <Row label="خصم السلف" value={`− ${money(advanceDeduction || 0)}`} tone="text-danger" />
          <div className="mt-2 flex justify-between border-t border-gold/20 pt-2 text-lg font-bold">
            <span>الصافي</span>
            <span dir="ltr" className={totals.net < 0 ? 'text-danger' : 'text-gold'}>
              {money(totals.net, 'EGP')}
            </span>
          </div>
          {problems.net && <p className="text-danger">{problems.net}</p>}
        </div>
        {save.error ? <ErrorBox error={save.error} /> : null}
        {salary && <ApprovalTrail doc={salary} finalOnly />}
      </form>
    </Drawer>
  );
}

function Row({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span dir="ltr" className={tone}>
        {value}
      </span>
    </div>
  );
}

/** A new advance, or an edit / view of one. */
export function AdvanceDrawer({
  advance,
  open,
  onClose,
  employeeId: presetEmployee,
}: {
  advance: Advance | null;
  open: boolean;
  onClose: () => void;
  employeeId?: number;
}) {
  const editable = useEditable(advance, 'finance.payroll.manage');
  const { data: employees = [] } = useEmployeeOptions(undefined, open && !advance);
  const { data: accounts = [] } = useAccounts();
  const egp = accounts.filter((a) => a.currency === 'EGP');
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [amount, setAmount] = useState<number | string>('');
  const [accountId, setAccountId] = useState<number | ''>('');
  const [advanceDate, setAdvanceDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useAction(
    () =>
      advance
        ? officeApi.updateAdvance(advance.id, { version: advance.version, amount: Number(amount), accountId: Number(accountId), advanceDate, notes: notes.trim() || null })
        : officeApi.createAdvance({ employeeId: Number(employeeId), amount: Number(amount), accountId: Number(accountId), advanceDate, notes: notes.trim() || undefined }),
    { success: advance ? 'اتحفظت السلفة' : 'اتصرفت السلفة', invalidate: [financeKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    setProblems({});
    setEmployeeId(advance?.employee.id ?? presetEmployee ?? '');
    setAmount(advance?.amount ?? '');
    setAccountId(advance?.account.id ?? egp.find((a) => a.type === 'CASH')?.id ?? '');
    setAdvanceDate(advance?.advanceDate.slice(0, 10) ?? today());
    setNotes(advance?.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, advance]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p: Record<string, string> = {};
    if (!advance && !employeeId) p.employee = 'اختار الموظف';
    if (!validAmount(amount)) p.amount = 'اكتب مبلغ صحيح (رقمين عشريين بالكتير)';
    if (!accountId) p.account = 'اختار الخزنة أو الحساب';
    if (!advanceDate || advanceDate > today()) p.date = 'التاريخ مينفعش يبقى فاضي أو في المستقبل';
    setProblems(p);
    if (Object.keys(p).length === 0) save.mutateAsync(undefined).then(onClose, () => undefined);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={advance ? `سلفة ${advance.employee.fullName} #${advance.id}` : 'سلفة جديدة'}
      footer={editable && <Footer onClose={onClose} form="advance-form" busy={save.isPending} label={advance ? 'حفظ التعديل' : 'صرف'} />}
    >
      <form id="advance-form" noValidate onSubmit={submit} className="space-y-4">
        <fieldset disabled={!editable} className="space-y-4">
          {!advance && (
            <ComboField
              label="الموظف"
              options={employees.map((e) => ({ value: e.id, label: `${e.fullName} (${e.code})` }))}
              value={employeeId}
              onChange={(v) => setEmployeeId(v === '' ? '' : Number(v))}
              error={problems.employee}
            />
          )}
          <TextField label="المبلغ (جنيه)" type="number" step="0.01" min="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} error={problems.amount} />
          <SelectField
            label="الصرف من"
            options={accountOptions(egp, advance?.account.id)}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}
            error={problems.account}
          />
          <TextField label="التاريخ" type="date" max={today()} value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} error={problems.date} />
          <TextField label="ملاحظات (اختياري)" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
        </fieldset>
        {save.error ? <ErrorBox error={save.error} /> : null}
        {advance && <ApprovalTrail doc={advance} finalOnly />}
      </form>
    </Drawer>
  );
}

/** كشف سلف الموظف: advances, salary deductions, running balance. */
export function StatementDrawer({ employeeId, onClose, onNewAdvance }: { employeeId: number | null; onClose: () => void; onNewAdvance?: () => void }) {
  const { data, isLoading, error } = useAdvanceStatement(employeeId);
  return (
    <Drawer open={!!employeeId} onClose={onClose} width="max-w-3xl" title={data ? `كشف سلف ${data.employee.fullName}` : 'كشف السلف'}>
      {isLoading && <div className="h-40 rounded-2xl shimmer" />}
      {error ? <ErrorBox error={error} /> : null}
      {data && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['إجمالي السلف', data.totals.advances, ''],
              ['اتخصم من المرتبات', data.totals.deducted, 'text-success'],
              ['الرصيد عليه', data.totals.balance, 'text-warning'],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">{label}</div>
                <div className={`text-lg font-bold ${tone}`} dir="ltr" style={{ textAlign: 'right' }}>
                  {money(value, 'EGP')}
                </div>
              </div>
            ))}
          </div>
          {onNewAdvance && (
            <Button variant="ghost" icon={<Plus className="size-4" />} onClick={onNewAdvance}>
              سلفة جديدة له
            </Button>
          )}
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">التاريخ</th>
                  <th className="px-3 py-2 text-start font-medium">البيان</th>
                  <th className="px-3 py-2 text-start font-medium">سلفة</th>
                  <th className="px-3 py-2 text-start font-medium">خصم</th>
                  <th className="px-3 py-2 text-start font-medium">الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState compact text="مفيش سلف" />
                    </td>
                  </tr>
                )}
                {data.lines.map((l) => (
                  <tr key={`${l.kind}-${l.id}`} className="border-t border-line">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.date)}</td>
                    <td className="px-3 py-2">
                      {l.description} <Badge tone={STATUS[l.approvalStatus].tone}>{STATUS[l.approvalStatus].label}</Badge>
                    </td>
                    <td className="px-3 py-2" dir="ltr">
                      {Number(l.debit) ? money(l.debit) : ''}
                    </td>
                    <td className="px-3 py-2 text-success" dir="ltr">
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
      )}
    </Drawer>
  );
}
