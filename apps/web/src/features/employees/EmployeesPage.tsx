import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate, formatMoney } from '@/lib/format';
import { useAction } from '@/lib/mutations';
import { money, nationalId, optionalText } from '@/lib/schemas';
import {
  DEPARTMENTS,
  employeeKeys,
  employeesApi,
  useEmployees,
  type Department,
  type Employee,
  type EmployeesQuery,
  type EmployeeStatus,
} from './api';

const departmentOptions = Object.entries(DEPARTMENTS).map(([value, label]) => ({ value, label }));

/** A recorded date is today at the latest (as this computer counts the day). */
const notAfterToday = (v: string) => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return v <= d.toISOString().slice(0, 10);
};

const schema = z
  .object({
    code: z.string().trim().min(1, 'اكتب رقم البصمة').max(20, '20 حرف بالكتير'),
    fullName: z.string().trim().min(3, 'الاسم 3 حروف على الأقل').max(120),
    nationalId,
    phone: z.string().trim().min(1, 'اكتب التليفون').max(20),
    address: optionalText(255),
    department: z.enum(Object.keys(DEPARTMENTS) as [Department, ...Department[]], {
      errorMap: () => ({ message: 'اختار القسم' }),
    }),
    jobTitle: z.string().trim().min(1, 'اكتب المسمى الوظيفي').max(80),
    hireDate: z.string().min(1, 'اختار تاريخ التعيين').refine(notAfterToday, 'تاريخ التعيين مينفعش يبقى بعد النهاردة'),
    basicSalary: money.optional(),
    status: z.enum(['ACTIVE', 'LEFT']),
    leaveDate: z.string().optional().refine((v) => !v || notAfterToday(v), 'تاريخ ترك العمل مينفعش يبقى بعد النهاردة'),
    notes: optionalText(1000),
  })
  .refine((v) => v.status !== 'LEFT' || !!v.leaveDate, {
    path: ['leaveDate'],
    message: 'اكتب تاريخ ترك العمل',
  });
type Form = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

function EmployeeDrawer({
  employee,
  open,
  onClose,
}: {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const salaryAccess = can('employees.salary.view');
  const { register, handleSubmit, reset, control, formState } = useForm<Form, unknown, Parsed>({
    resolver: zodResolver(schema),
  });
  const status = useWatch({ control, name: 'status' });

  useEffect(() => {
    if (!open) return;
    reset({
      code: employee?.code ?? '',
      fullName: employee?.fullName ?? '',
      nationalId: employee?.nationalId ?? '',
      phone: employee?.phone ?? '',
      address: employee?.address ?? '',
      department: employee?.department,
      jobTitle: employee?.jobTitle ?? '',
      hireDate: day(employee?.hireDate),
      basicSalary: employee?.basicSalary ?? (salaryAccess ? '' : undefined),
      status: employee?.status ?? 'ACTIVE',
      leaveDate: day(employee?.leaveDate),
      notes: employee?.notes ?? '',
    });
  }, [open, employee, reset, salaryAccess]);

  const save = useAction(
    async (form: Parsed) => {
      const { status: s, leaveDate, basicSalary, ...rest } = form;
      const payload = {
        ...rest,
        ...(salaryAccess ? { basicSalary } : {}),
      };
      if (!employee) return employeesApi.create(payload);
      const result = await employeesApi.update(employee.id, {
        ...payload,
        status: s,
        leaveDate: s === 'LEFT' ? leaveDate : null,
      });
      if (result.handover && (result.handover.clients || result.handover.activeShipments)) {
        toast.warning('الموظف ساب الشغل وحسابه اتقفل', {
          description: `لسه مسؤول عن ${result.handover.clients} عميل و${result.handover.activeShipments} شحنة شغالة. الـ CEO لازم ينقلهم لموظف تاني.`,
          duration: 12000,
        });
      }
      return result;
    },
    { success: employee ? 'اتحفظت بيانات الموظف' : 'اتضاف الموظف', invalidate: [employeeKeys.all] },
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={employee ? `تعديل ${employee.fullName}` : 'موظف جديد'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="employee-form" type="submit" loading={save.isPending}>
            حفظ
          </Button>
        </div>
      }
    >
      <form
        id="employee-form"
        noValidate
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={handleSubmit((form) => save.mutateAsync(form).then(onClose).catch(() => undefined))}
      >
        <TextField label="الاسم بالكامل" className="sm:col-span-2" error={formState.errors.fullName?.message} {...register('fullName')} />
        <TextField label="رقم البصمة (الكود)" dir="ltr" error={formState.errors.code?.message} {...register('code')} />
        <TextField label="الرقم القومي" dir="ltr" inputMode="numeric" maxLength={14} error={formState.errors.nationalId?.message} {...register('nationalId')} />
        <TextField label="التليفون" dir="ltr" inputMode="tel" error={formState.errors.phone?.message} {...register('phone')} />
        <SelectField label="القسم" options={departmentOptions} error={formState.errors.department?.message} {...register('department')} />
        <TextField label="المسمى الوظيفي" error={formState.errors.jobTitle?.message} {...register('jobTitle')} />
        <TextField label="تاريخ التعيين" type="date" error={formState.errors.hireDate?.message} {...register('hireDate')} />
        {salaryAccess && (
          <TextField label="المرتب الأساسي (جنيه)" type="number" step="0.01" min="0" dir="ltr" error={formState.errors.basicSalary?.message} {...register('basicSalary')} />
        )}
        <TextField label="العنوان" className="sm:col-span-2" error={formState.errors.address?.message} {...register('address')} />
        {employee && (
          <>
            <SelectField
              label="الحالة"
              options={[
                { value: 'ACTIVE', label: 'شغال' },
                { value: 'LEFT', label: 'ساب الشغل' },
              ]}
              {...register('status')}
            />
            {status === 'LEFT' && (
              <TextField label="تاريخ ترك العمل" type="date" error={formState.errors.leaveDate?.message} {...register('leaveDate')} />
            )}
          </>
        )}
        <TextField label="ملاحظات" className="sm:col-span-2" error={formState.errors.notes?.message} {...register('notes')} />
        {status === 'LEFT' && employee?.status === 'ACTIVE' && (
          <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning sm:col-span-2">
            حساب الدخول بتاعه هيتقفل في نفس اللحظة.
          </p>
        )}
        {save.error ? (
          <div className="sm:col-span-2">
            <ErrorBox error={save.error} />
          </div>
        ) : null}
      </form>
    </Drawer>
  );
}

export default function EmployeesPage() {
  const { can } = useAuth();
  const [query, setQuery] = useState<EmployeesQuery>({ page: 1, search: '', department: '', status: '' });
  const { data, isLoading, error } = useEmployees(query);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const remove = useAction((id: number) => employeesApi.remove(id), {
    success: 'اتمسح الموظف',
    invalidate: [employeeKeys.all],
  });

  const open = (e: Employee | null) => {
    setEditing(e);
    setDrawerOpen(true);
  };

  const columns: Column<Employee>[] = [
    {
      header: 'الموظف',
      cell: (e) => (
        <div>
          <div className="font-semibold">{e.fullName}</div>
          <div className="text-xs text-muted">{e.jobTitle}</div>
        </div>
      ),
    },
    { header: 'الكود', cell: (e) => <span dir="ltr">{e.code}</span> },
    { header: 'القسم', cell: (e) => <Badge>{DEPARTMENTS[e.department]}</Badge> },
    { header: 'التليفون', cell: (e) => <span dir="ltr">{e.phone}</span> },
    { header: 'التعيين', cell: (e) => <span className="text-muted">{formatDate(e.hireDate)}</span> },
    ...(can('employees.salary.view')
      ? [{ header: 'المرتب', cell: (e: Employee) => formatMoney(e.basicSalary) }]
      : []),
    {
      header: 'الحالة',
      cell: (e) => <Badge tone={e.status === 'ACTIVE' ? 'success' : 'danger'}>{e.status === 'ACTIVE' ? 'شغال' : 'ساب الشغل'}</Badge>,
    },
    {
      header: '',
      className: 'w-0 whitespace-nowrap',
      cell: (e) => (
        <div className="flex justify-end">
          <IconButton label="تعديل" onClick={() => open(e)}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label="حذف" tone="danger" onClick={() => setDeleting(e)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="الموظفين"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => open(null)}>
            موظف جديد
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={query.search ?? ''} onChange={(search) => setQuery((q) => ({ ...q, search, page: 1 }))} placeholder="بحث بالاسم أو الكود أو الرقم القومي" />
        <select
          aria-label="القسم"
          value={query.department}
          onChange={(e) => setQuery((q) => ({ ...q, department: e.target.value as Department | '', page: 1 }))}
          className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"
        >
          <option value="">كل الأقسام</option>
          {departmentOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="الحالة"
          value={query.status}
          onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value as EmployeeStatus | '', page: 1 }))}
          className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"
        >
          <option value="">كل الحالات</option>
          <option value="ACTIVE">شغال</option>
          <option value="LEFT">ساب الشغل</option>
        </select>
      </div>
      <DataTable columns={columns} rows={data?.items} rowKey={(e) => e.id} loading={isLoading} error={error} empty="مفيش موظفين بالبحث ده" onRowClick={open} />
      <div className="mt-4">
        <Pagination page={query.page} pageSize={25} total={data?.total ?? 0} onChange={(page) => setQuery((q) => ({ ...q, page }))} />
      </div>

      <EmployeeDrawer employee={editing} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        title="حذف الموظف"
        message={`هتمسح ${deleting?.fullName} وحساب الدخول بتاعه. الحذف مش مسموح لو لسه مسؤول عن عملاء أو شحنات.`}
        confirmLabel="حذف"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
