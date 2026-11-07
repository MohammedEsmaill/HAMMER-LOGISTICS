import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, PageHeader } from '@/components/ui/misc';
import { TextField } from '@/components/ui/TextField';
import { useAction } from '@/lib/mutations';
import {
  PERMISSION_GROUPS,
  roleKeys,
  rolesApi,
  usePermissionCatalog,
  useRoles,
  type CatalogEntry,
  type Role,
} from './api';

const schema = z.object({
  name: z.string().trim().min(2, 'اسم الدور حرفين على الأقل').max(60, 'الاسم طويل'),
  description: z.string().trim().max(255, 'الوصف طويل').optional(),
  permissions: z.array(z.string()),
});
type Form = z.infer<typeof schema>;

/** The two shipment-view permissions are alternatives: ticking one clears the other. */
const EXCLUSIVE: Record<string, string> = {
  'shipments.view.all': 'shipments.view.own',
  'shipments.view.own': 'shipments.view.all',
};

function PermissionChecklist({
  catalog,
  value,
  onChange,
}: {
  catalog: CatalogEntry[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    for (const entry of catalog) {
      const group = entry.key.split('.')[0];
      map.set(group, [...(map.get(group) ?? []), entry]);
    }
    return [...map.entries()];
  }, [catalog]);
  const selected = new Set(value);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else {
      next.add(key);
      if (EXCLUSIVE[key]) next.delete(EXCLUSIVE[key]);
    }
    onChange([...next]);
  };

  return (
    <div className="space-y-4">
      {groups.map(([group, entries]) => (
        <fieldset key={group} className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold text-gold">
            {PERMISSION_GROUPS[group] ?? group}
          </legend>
          <div className="space-y-1">
            {entries.map((entry) => (
              <label
                key={entry.key}
                className={`flex items-center gap-3 rounded-lg px-2 py-2 ${entry.ceoOnly ? 'opacity-55' : 'cursor-pointer hover:bg-gold/5'}`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--gold-2)]"
                  checked={selected.has(entry.key)}
                  disabled={entry.ceoOnly}
                  onChange={() => toggle(entry.key)}
                />
                <span className="flex-1 text-sm">{entry.label}</span>
                {entry.ceoOnly && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Lock className="size-3" /> للـ CEO بس
                  </span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function RoleDrawer({ role, open, onClose }: { role: Role | null; open: boolean; onClose: () => void }) {
  const { data: catalog = [] } = usePermissionCatalog();
  const { register, handleSubmit, control, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    values: {
      name: role?.name ?? '',
      description: role?.description ?? '',
      permissions: role?.permissions ?? [],
    },
  });
  const save = useAction(
    (form: Form) => (role ? rolesApi.update(role.id, form) : rolesApi.create(form)),
    { success: role ? 'اتحفظت صلاحيات الدور' : 'اتضاف الدور', invalidate: [roleKeys.all] },
  );
  const { reset } = save;
  useEffect(() => {
    if (open) reset(); // no error left over from the last time the drawer was open
  }, [open, reset]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={role ? `تعديل دور ${role.name}` : 'دور جديد'}
      description="التغيير بيوصل للمستخدمين اللي على الدور ده من أول طلب بعده، من غير ما يسجلوا دخول تاني."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="role-form" type="submit" loading={save.isPending}>
            حفظ
          </Button>
        </div>
      }
    >
      <form
        id="role-form"
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit((form) => save.mutateAsync(form).then(onClose).catch(() => undefined))}
      >
        <TextField label="اسم الدور" error={formState.errors.name?.message} {...register('name')} />
        <TextField label="الوصف" error={formState.errors.description?.message} {...register('description')} />
        <Controller
          control={control}
          name="permissions"
          render={({ field }) => (
            <PermissionChecklist catalog={catalog} value={field.value} onChange={field.onChange} />
          )}
        />
        {save.error ? <ErrorBox error={save.error} /> : null}
      </form>
    </Drawer>
  );
}

export default function RolesPage() {
  const { data: roles, isLoading, error } = useRoles();
  const [editing, setEditing] = useState<Role | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const remove = useAction((id: number) => rolesApi.remove(id), {
    success: 'اتمسح الدور',
    invalidate: [roleKeys.all],
  });

  const open = (role: Role | null) => {
    setEditing(role);
    setDrawerOpen(true);
  };

  return (
    <>
      <PageHeader
        title="الأدوار والصلاحيات"
        description="كل مستخدم ليه دور واحد، والدور بيحدد هو يقدر يعمل إيه."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => open(null)}>
            دور جديد
          </Button>
        }
      />
      {error ? <ErrorBox error={error} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card h-36 overflow-hidden">
              <div className="shimmer h-full" />
            </div>
          ))}
        {roles?.map((role, i) => (
          <motion.div
            key={role.id}
            className="card flex flex-col gap-3 p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-gold/10 text-gold">
                <ShieldCheck className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-bold" dir="auto">
                    {role.name}
                  </h3>
                  {role.isSystem && <Badge tone="gold">النظام</Badge>}
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm text-muted">{role.description ?? '—'}</p>
              </div>
              {!role.isSystem && (
                <div className="flex">
                  <IconButton label="تعديل" onClick={() => open(role)}>
                    <Pencil className="size-4" />
                  </IconButton>
                  <IconButton label="حذف" tone="danger" onClick={() => setDeleting(role)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              )}
            </div>
            <div className="mt-auto flex gap-2 text-xs">
              <Badge>
                <Users className="me-1 size-3" /> {role._count.users} مستخدم
              </Badge>
              <Badge>{role.isSystem ? 'كل الصلاحيات' : `${role.permissions.length} صلاحية`}</Badge>
            </div>
          </motion.div>
        ))}
      </div>

      <RoleDrawer role={editing} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        title="حذف الدور"
        message={`هتمسح دور "${deleting?.name}". الحذف مش مسموح لو فيه مستخدمين على الدور.`}
        confirmLabel="حذف"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
