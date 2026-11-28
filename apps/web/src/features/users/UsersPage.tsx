import { zodResolver } from '@hookform/resolvers/zod';
import { Landmark, KeyRound, Lock, LockOpen, Mail, Pencil, Plus, Signature, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { HEAD_MANAGER_ROLE, useAuth, useIsCeo } from '@/auth/auth-context';
import { useListState } from '@/lib/use-list-state';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { usePageOf } from '@/lib/use-page-of';
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
import { SignatureDrawer } from './SignatureDrawer';
import { BankAccountsDrawer } from '../finance/BankAccountsDrawer';
import {
  ownerName,
  useCandidates,
  useUsers,
  userKeys,
  usersApi,
  type AccountType,
  type User,
  type UserChanges,
} from './api';

const createSchema = z.object({
  accountType: z.enum(['EMPLOYEE', 'CLEARER']),
  ownerId: requiredId,
  email: companyEmail,
  password: strongPassword,
  roleId: requiredId,
  extraRoleIds: z.array(z.number()),
});
type CreateForm = z.infer<typeof createSchema>;

const editSchema = z.object({ email: companyEmail, roleId: requiredId, extraRoleIds: z.array(z.number()) });
type EditForm = z.infer<typeof editSchema>;

type RoleOption = { id: number; name: string; isSystem: boolean };

/** Extra roles beside the main one: tap to add or remove; the main role is left out. */
function ExtraRoles({
  roles,
  mainRoleId,
  value,
  onChange,
  isCeo,
}: {
  roles: RoleOption[];
  mainRoleId: number | undefined;
  value: number[];
  onChange: (v: number[]) => void;
  isCeo: boolean;
}) {
  // the clearer role belongs to clearer accounts only
  const choices = roles.filter((r) => r.id !== Number(mainRoleId) && r.name !== 'CLEARER' && (!(r.isSystem || r.name === HEAD_MANAGER_ROLE) || isCeo));
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">أدوار إضافية</legend>
      <p className="text-xs text-muted">لو الموظف بيشتغل أكتر من شغلانة، صلاحيات الأدوار كلها بتتجمع.</p>
      <div className="flex flex-wrap gap-2">
        {choices.map((r) => {
          const on = value.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(r.id)}
              className={`focus-ring rounded-full border px-3 py-1.5 text-sm transition-colors ${
                on ? 'border-gold bg-gold/15 font-semibold text-gold' : 'border-line text-ink hover:border-gold/50'
              }`}
              dir="auto"
            >
              {r.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function CreateUserDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: roles = [] } = useRoleOptions();
  const { register, handleSubmit, control, reset, setValue, formState } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { accountType: 'EMPLOYEE', extraRoleIds: [] },
  });
  const accountType = useWatch({ control, name: 'accountType' }) as AccountType;
  const mainRoleId = useWatch({ control, name: 'roleId' });
  const { data: candidates = [], isLoading } = useCandidates(accountType, open);
  const create = useAction(usersApi.create, {
    success: 'اتعمل الحساب',
    invalidate: [userKeys.all, ['users', 'candidates']],
  });

  useEffect(() => {
    if (open) {
      reset({ accountType: 'EMPLOYEE', extraRoleIds: [] });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the drawer opens
  }, [open]);

  const isCeo = useIsCeo(); // only the CEO grants the CEO role

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="حساب دخول جديد"
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
          error={formState.errors.password?.message}
          {...register('password')}
        />
        <SelectField
          label="الدور"
          options={roles.filter((r) => !(r.isSystem || r.name === HEAD_MANAGER_ROLE) || isCeo).map((r) => ({ value: r.id, label: r.name }))}
          error={formState.errors.roleId?.message}
          {...register('roleId')}
        />
        <Controller
          control={control}
          name="extraRoleIds"
          render={({ field }) => (
            <ExtraRoles roles={roles} mainRoleId={mainRoleId} value={field.value} onChange={field.onChange} isCeo={isCeo} />
          )}
        />
        {create.error ? <ErrorBox error={create.error} /> : null}
      </form>
    </Drawer>
  );
}

function EditUserDrawer({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { user: me } = useAuth();
  const { data: roles = [] } = useRoleOptions();
  const { register, handleSubmit, control, formState } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: { extraRoleIds: [] },
    values: user
      ? { email: user.email, roleId: user.role.id, extraRoleIds: (user.extraRoles ?? []).map((r) => r.role.id) }
      : undefined,
  });
  const mainRoleId = useWatch({ control, name: 'roleId' });
  const isCeo = useIsCeo();
  // nobody changes their own roles
  const self = user?.id === me?.id;
  const update = useAction((form: UserChanges) => usersApi.update(user!.id, form), {
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
        onSubmit={handleSubmit((form) =>
          update
            .mutateAsync(self ? { email: form.email } : form)
            .then(onClose)
            .catch(() => undefined),
        )}
      >
        <TextField label="إيميل الدخول" type="email" dir="ltr" error={formState.errors.email?.message} {...register('email')} />
        <SelectField
          label="الدور"
          options={roles.filter((r) => !(r.isSystem || r.name === HEAD_MANAGER_ROLE) || isCeo).map((r) => ({ value: r.id, label: r.name }))}
          error={formState.errors.roleId?.message}
          {...register('roleId')}
        />
        {self ? (
          <p className="text-xs text-muted">مينفعش تغيّر أدوارك بنفسك، أي تغيير في الدور مش هيتحفظ.</p>
        ) : (
          <Controller
            control={control}
            name="extraRoleIds"
            render={({ field }) => (
              <ExtraRoles
                roles={roles}
                mainRoleId={mainRoleId}
                value={(field.value ?? []).filter((id) => id !== Number(mainRoleId))}
                onChange={field.onChange}
                isCeo={isCeo}
              />
            )}
          />
        )}
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
      subtitle={user ? `لحساب ${user.email}` : undefined}
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
          error={formState.errors.password?.message}
          {...register('password')}
        />
        {action.error ? <ErrorBox error={action.error} /> : null}
      </form>
    </Drawer>
  );
}

export default function UsersPage() {
  const { can, user: me } = useAuth();
  const { data: users, isLoading, error } = useUsers();
  const [{ search }, setFilters] = useListState({ search: '', page: 1 });
  const setSearch = (s: string) => setFilters({ search: s });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [signing, setSigning] = useState<User | null>(null);
  const [banking, setBanking] = useState<{ id: number; name: string } | null>(null);
  const setActive = useAction((u: { id: number; isActive: boolean }) => usersApi.update(u.id, { isActive: u.isActive }), {
    invalidate: [userKeys.all],
  });
  const remove = useAction((id: number) => usersApi.remove(id), {
    success: 'اتمسح الحساب',
    invalidate: [userKeys.all, ['users', 'candidates']],
  });

  const unlock = useAction((id: number) => usersApi.unlock(id), { success: 'اتفك قفل الحساب', invalidate: [userKeys.all] });
  // the CEO's and the head manager's accounts: the CEO's to change
  const isCeo = useIsCeo();
  const guarded = (u: User) =>
    !isCeo && (u.role.isSystem || u.role.name === HEAD_MANAGER_ROLE || u.extraRoles.some((r) => r.role.name === HEAD_MANAGER_ROLE));
  const q = search.toLowerCase();
  const rows = users?.filter(
    (u) => !q || u.email.includes(q) || ownerName(u).toLowerCase().includes(q) || u.role.name.toLowerCase().includes(q),
  );
  const paged = usePageOf(rows, q);

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
    {
      header: 'الدور',
      cell: (u) => (
        <div className="flex flex-wrap items-center gap-1.5" dir="auto">
          <span>{u.role.name}</span>
          {u.extraRoles.map((r) => (
            <Badge key={r.role.id} tone="muted">
              {r.role.name}
            </Badge>
          ))}
        </div>
      ),
    },
    { header: 'آخر دخول', cell: (u) => <span className="text-muted">{formatDate(u.lastLoginAt)}</span> },
    {
      header: 'الحالة',
      cell: (u) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={u.isActive}
            label={u.isActive ? 'إيقاف الحساب' : 'تفعيل الحساب'}
            disabled={u.id === me?.id || guarded(u) || setActive.isPending}
            onChange={(isActive) => setActive.mutateAsync({ id: u.id, isActive }).catch(toastError)}
          />
          <span className={`text-xs ${u.isActive ? 'text-success' : 'text-muted'}`}>{u.isActive ? 'شغال' : 'موقوف'}</span>
          {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
            <span title={`مقفول لحد ${new Date(u.lockedUntil).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}`}>
              <Badge tone="danger">مقفول (كلمة سر غلط)</Badge>
            </span>
          )}
        </div>
      ),
    },
    {
      header: '',
      className: 'w-0 whitespace-nowrap',
      cell: (u) => (
        <div className="flex justify-end">
          {/* the signature on the invoices: the CEO and the moderator, for anyone (themselves too) */}
          {/* a clearer's bank accounts: added here only (the accountant picks from them) */}
          {u.clearer && can('users.manage') && (
            <IconButton label="الحسابات البنكية" onClick={() => setBanking({ id: u.clearer!.id, name: u.clearer!.fullName })}>
              <Landmark className="size-4" />
            </IconButton>
          )}
          {can('users.signatures') && (
            <IconButton label="التوقيع" onClick={() => setSigning(u)}>
              <Signature className={`size-4 ${u.signatureName ? 'text-gold' : ''}`} />
            </IconButton>
          )}
          {u.id !== me?.id && !guarded(u) && (
            <>
            <IconButton label="تعديل" onClick={() => setEditing(u)}>
              <Pencil className="size-4" />
            </IconButton>
            {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
              <IconButton label="فك القفل" onClick={() => unlock.mutateAsync(u.id).catch(toastError)}>
                <LockOpen className="size-4" />
              </IconButton>
            )}
            <IconButton label="كلمة سر جديدة" onClick={() => setResetting(u)}>
              <KeyRound className="size-4" />
            </IconButton>
            <IconButton label="حذف" tone="danger" onClick={() => setDeleting(u)}>
              <Trash2 className="size-4" />
            </IconButton>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="المستخدمين"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            حساب جديد
          </Button>
        }
      />
      <div className="mb-4">
        <SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو الإيميل أو الدور" />
      </div>
      <DataTable columns={columns} rows={paged.items} rowKey={(u) => u.id} loading={isLoading} error={error} empty="مفيش حسابات" />
      <div className="mt-4">
        <Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onChange={paged.setPage} onPageSizeChange={paged.setPageSize} />
      </div>

      <CreateUserDrawer open={creating} onClose={() => setCreating(false)} />
      <EditUserDrawer user={editing} onClose={() => setEditing(null)} />
      <ResetPasswordDrawer user={resetting} onClose={() => setResetting(null)} />
      <SignatureDrawer user={signing} onClose={() => setSigning(null)} />
      <BankAccountsDrawer owner={banking ? { kind: 'CLEARER', ...banking } : null} onClose={() => setBanking(null)} />
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
