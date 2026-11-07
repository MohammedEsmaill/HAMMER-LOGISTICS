import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Lock, Mail, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, PageHeader, Switch } from '@/components/ui/misc';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { toastError, useAction } from '@/lib/mutations';
import { companyEmail, requiredId, strongPassword } from '@/lib/schemas';
import { useRoleOptions } from '../roles/api';
import {
  ownerName,
  useCandidates,
  useUsers,
  userKeys,
  usersApi,
  type AccountType,
  type User,
} from './api';

const createSchema = z.object({
  accountType: z.enum(['EMPLOYEE', 'CLEARER']),
  ownerId: requiredId,
  email: companyEmail,
  password: strongPassword,
  roleId: requiredId,
});
type CreateForm = z.infer<typeof createSchema>;

const editSchema = z.object({ email: companyEmail, roleId: requiredId });
type EditForm = z.infer<typeof editSchema>;

function CreateUserDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { can } = useAuth();
  const { data: roles = [] } = useRoleOptions();
  const { register, handleSubmit, control, reset, setValue, formState } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { accountType: 'EMPLOYEE' },
  });
  const accountType = useWatch({ control, name: 'accountType' }) as AccountType;
  const { data: candidates = [], isLoading } = useCandidates(accountType, open);
  const create = useAction(usersApi.create, {
    success: 'اتعمل الحساب',
    invalidate: [userKeys.all, ['users', 'candidates']],
  });

  useEffect(() => {
    if (open) {
      reset({ accountType: 'EMPLOYEE' });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the drawer opens
  }, [open]);

  const isCeo = can('roles.manage'); // only the CEO holds it, and only the CEO grants the CEO role

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="حساب دخول جديد"
      description="الحساب لموظف أو مستخلص متسجل بالفعل ومعندوش حساب."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="create-user" type="submit" loading={create.isPending} icon={<UserPlus className="size-4" />}>
            إنشاء الحساب
          </Button>
        </div>
      }
    >
      <form
        id="create-user"
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit((form) => create.mutateAsync(form).then(onClose).catch(() => undefined))}
      >
        <div role="radiogroup" aria-label="نوع الحساب" className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1">
          {(['EMPLOYEE', 'CLEARER'] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={accountType === type}
              onClick={() => {
                setValue('accountType', type);
                setValue('ownerId', undefined as unknown as number);
              }}
              className={`focus-ring h-10 rounded-lg text-sm font-semibold transition-colors ${accountType === type ? 'gold-fill' : 'text-muted hover:text-ink'}`}
            >
              {type === 'EMPLOYEE' ? 'موظف' : 'مستخلص'}
            </button>
          ))}
        </div>
        <SelectField
          label={accountType === 'EMPLOYEE' ? 'الموظف' : 'المستخلص'}
          placeholder={isLoading ? 'جاري التحميل...' : candidates.length ? 'اختار...' : 'مفيش حد من غير حساب'}
          options={candidates.map((c) => ({
            value: c.id,
            label: c.code ? `${c.fullName} (${c.code})` : c.fullName,
          }))}
          error={formState.errors.ownerId?.message}
          {...register('ownerId')}
        />
        <TextField
          label="إيميل الدخول"
          type="email"
          dir="ltr"
          placeholder="name@hammerline.com"
          icon={<Mail className="size-4" />}
          error={formState.errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="كلمة السر"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          icon={<Lock className="size-4" />}
          hint="8 حروف على الأقل، فيها حروف وأرقام"
          error={formState.errors.password?.message}
          {...register('password')}
        />
        <SelectField
          label="الدور"
          options={roles.map((r) => ({ value: r.id, label: r.name, disabled: r.isSystem && !isCeo }))}
          error={formState.errors.roleId?.message}
          {...register('roleId')}
        />
        {create.error ? <ErrorBox error={create.error} /> : null}
      </form>
    </Drawer>
  );
}

function EditUserDrawer({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { data: roles = [] } = useRoleOptions();
  const { register, handleSubmit, formState } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    values: user ? { email: user.email, roleId: user.role.id } : undefined,
  });
  const update = useAction((form: EditForm) => usersApi.update(user!.id, form), {
    success: 'اتحفظت التعديلات',
    invalidate: [userKeys.all],
  });

  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      title={`تعديل حساب ${user ? ownerName(user) : ''}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="edit-user" type="submit" loading={update.isPending}>
            حفظ
          </Button>
        </div>
      }
    >
      <form
        id="edit-user"
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit((form) => update.mutateAsync(form).then(onClose).catch(() => undefined))}
      >
        <TextField label="إيميل الدخول" type="email" dir="ltr" error={formState.errors.email?.message} {...register('email')} />
        <SelectField
          label="الدور"
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
          error={formState.errors.roleId?.message}
          {...register('roleId')}
        />
        {update.error ? <ErrorBox error={update.error} /> : null}
      </form>
    </Drawer>
  );
}

function ResetPasswordDrawer({ user, onClose }: { user: User | null; onClose: () => void }) {
  const schema = z.object({ password: strongPassword });
  const { register, handleSubmit, reset, formState } = useForm<{ password: string }>({
    resolver: zodResolver(schema),
  });
  const action = useAction((password: string) => usersApi.resetPassword(user!.id, password), {
    success: 'اتغيرت كلمة السر، والجلسة الحالية للحساب اتقفلت',
  });
  useEffect(() => {
    if (user) reset({ password: '' });
  }, [user, reset]);

  return (
    <Drawer
      open={!!user}
      onClose={onClose}
      title="كلمة سر جديدة"
      description={user ? `لحساب ${user.email}` : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="reset-password" type="submit" loading={action.isPending} icon={<KeyRound className="size-4" />}>
            تغيير
          </Button>
        </div>
      }
    >
      <form
        id="reset-password"
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit(({ password }) => action.mutateAsync(password).then(onClose).catch(() => undefined))}
      >
        <TextField
          label="كلمة السر الجديدة"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          hint="8 حروف على الأقل، فيها حروف وأرقام"
          error={formState.errors.password?.message}
          {...register('password')}
        />
        {action.error ? <ErrorBox error={action.error} /> : null}
      </form>
    </Drawer>
  );
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const { data: users, isLoading, error } = useUsers();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const setActive = useAction((u: { id: number; isActive: boolean }) => usersApi.update(u.id, { isActive: u.isActive }), {
    invalidate: [userKeys.all],
  });
  const remove = useAction((id: number) => usersApi.remove(id), {
    success: 'اتمسح الحساب',
    invalidate: [userKeys.all, ['users', 'candidates']],
  });

  const q = search.toLowerCase();
  const rows = users?.filter(
    (u) => !q || u.email.includes(q) || ownerName(u).toLowerCase().includes(q) || u.role.name.toLowerCase().includes(q),
  );

  const columns: Column<User>[] = [
    {
      header: 'الاسم',
      cell: (u) => (
        <div>
          <div className="font-semibold">{ownerName(u)}</div>
          <div className="text-xs text-muted" dir="ltr">
            {u.email}
          </div>
        </div>
      ),
    },
    {
      header: 'النوع',
      cell: (u) => <Badge tone={u.accountType === 'CLEARER' ? 'gold' : 'muted'}>{u.accountType === 'CLEARER' ? 'مستخلص' : 'موظف'}</Badge>,
    },
    { header: 'الدور', cell: (u) => <span dir="auto">{u.role.name}</span> },
    { header: 'آخر دخول', cell: (u) => <span className="text-muted">{formatDate(u.lastLoginAt)}</span> },
    {
      header: 'الحالة',
      cell: (u) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={u.isActive}
            label={u.isActive ? 'إيقاف الحساب' : 'تفعيل الحساب'}
            disabled={u.id === me?.id || setActive.isPending}
            onChange={(isActive) => setActive.mutateAsync({ id: u.id, isActive }).catch(toastError)}
          />
          <span className={`text-xs ${u.isActive ? 'text-success' : 'text-muted'}`}>{u.isActive ? 'شغال' : 'موقوف'}</span>
        </div>
      ),
    },
    {
      header: '',
      className: 'w-0 whitespace-nowrap',
      cell: (u) =>
        u.id === me?.id ? null : (
          <div className="flex justify-end">
            <IconButton label="تعديل" onClick={() => setEditing(u)}>
              <Pencil className="size-4" />
            </IconButton>
            <IconButton label="كلمة سر جديدة" onClick={() => setResetting(u)}>
              <KeyRound className="size-4" />
            </IconButton>
            <IconButton label="حذف" tone="danger" onClick={() => setDeleting(u)}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="المستخدمين"
        description="حسابات الدخول للموظفين والمستخلصين."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            حساب جديد
          </Button>
        }
      />
      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو الإيميل أو الدور" />
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(u) => u.id} loading={isLoading} error={error} empty="مفيش حسابات" />

      <CreateUserDrawer open={creating} onClose={() => setCreating(false)} />
      <EditUserDrawer user={editing} onClose={() => setEditing(null)} />
      <ResetPasswordDrawer user={resetting} onClose={() => setResetting(null)} />
      <ConfirmDialog
        open={!!deleting}
        title="حذف الحساب"
        message={`حساب ${deleting?.email} هيتقفل ويتمسح. الموظف أو المستخلص نفسه هيفضل، وتقدر تعمله حساب جديد بعدين.`}
        confirmLabel="حذف"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
