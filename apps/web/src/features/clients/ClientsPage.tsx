import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Factory as FactoryIcon, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/auth/auth-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectField } from '@/components/ui/SelectField';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { formatMoney } from '@/lib/format';
import { useAction } from '@/lib/mutations';
import { egyptMobile, money, requiredId, taxNumber } from '@/lib/schemas';
import { useEmployeeOptions } from '../employees/api';
import {
  clientKeys,
  clientsApi,
  QUOTE_FIELDS,
  useClient,
  useClients,
  type Client,
  type ClientInput,
  type Factory,
} from './api';

const factorySchema = z.object({
  name: z.string().trim().min(2, 'اسم المصنع حرفين على الأقل').max(150),
  taxNumber,
  commercialRegister: z.string().trim().min(1, 'اكتب السجل التجاري').max(50),
  address: z.string().trim().min(1, 'اكتب العنوان').max(255),
});

const clientSchema = z.object({
  name: z.string().trim().min(2, 'اسم العميل حرفين على الأقل').max(150),
  mobile: egyptMobile,
  email: z.string().trim().email('الإيميل غير صحيح'),
  importOperationEmployeeId: requiredId,
  exportOperationEmployeeId: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().nullable()),
  quoteFinalBase: money,
  quoteTemporaryBase: money,
  quoteImportExtraContainer: money,
  quoteExportBase: money,
  quoteExportExtraContainer: money,
  factories: z.array(factorySchema),
});

type ClientForm = z.input<typeof clientSchema>;
type ClientOut = z.output<typeof clientSchema>;

function ClientFormDrawer({
  client,
  open,
  onClose,
}: {
  client: Client | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: operations = [] } = useEmployeeOptions('OPERATION');
  const opsOptions = operations.map((e) => ({ value: e.id, label: e.fullName }));
  const { register, handleSubmit, control, reset, formState } = useForm<ClientForm, unknown, ClientOut>({
    resolver: zodResolver(clientSchema),
  });
  const factories = useFieldArray({ control, name: 'factories' });
  const errors = formState.errors;
  const save = useAction(
    ({ factories: newFactories, ...form }: ClientOut) => {
      const body = form as Omit<ClientInput, 'factories'>;
      // factories are edited one by one on an existing client
      return client ? clientsApi.update(client.id, body) : clientsApi.create({ ...body, factories: newFactories });
    },
    { success: client ? 'اتحفظت بيانات العميل' : 'اتضاف العميل', invalidate: [clientKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    reset({
      name: client?.name ?? '',
      mobile: client?.mobile ?? '',
      email: client?.email ?? '',
      importOperationEmployeeId: client?.importOperationEmployee.id ?? '',
      exportOperationEmployeeId: client?.exportOperationEmployee?.id ?? '',
      ...Object.fromEntries(QUOTE_FIELDS.map((f) => [f.key, client?.[f.key] ?? ''])),
      factories: [],
    } as ClientForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, client]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title={client ? `تعديل ${client.name}` : 'عميل جديد'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="client-form" type="submit" loading={save.isPending}>
            حفظ
          </Button>
        </div>
      }
    >
      <form
        id="client-form"
        noValidate
        className="space-y-6"
        onSubmit={handleSubmit((form) => save.mutateAsync(form).then(onClose).catch(() => undefined))}
      >
        <section className="grid gap-4 sm:grid-cols-2">
          <TextField label="اسم العميل" className="sm:col-span-2" error={errors.name?.message} {...register('name')} />
          <TextField label="الموبايل" dir="ltr" inputMode="tel" maxLength={11} error={errors.mobile?.message} {...register('mobile')} />
          <TextField label="الإيميل" type="email" dir="ltr" error={errors.email?.message} {...register('email')} />
          <SelectField label="موظف أوبريشن الوارد" options={opsOptions} error={errors.importOperationEmployeeId?.message} {...register('importOperationEmployeeId')} />
          <SelectField
            label="موظف أوبريشن الصادر (اختياري)"
            placeholder="نفس موظف الوارد"
            options={opsOptions}
            {...register('exportOperationEmployeeId')}
          />
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-gold">كوتيشن CLEARANCE (جنيه)</h3>
          <p className="mb-3 text-xs text-muted">
            الأتعاب = الأساس + الحاوية الإضافية × (عدد الحاويات − 1). الفواتير بتاخد السعر وقت إصدارها.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {QUOTE_FIELDS.map((f) => (
              <TextField key={f.key} label={f.label} type="number" step="0.01" min="0" dir="ltr" error={errors[f.key]?.message} {...register(f.key)} />
            ))}
          </div>
        </section>

        {!client && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gold">المصانع</h3>
              <Button
                type="button"
                variant="ghost"
                className="h-9 px-3 text-sm"
                icon={<Plus className="size-4" />}
                onClick={() => factories.append({ name: '', taxNumber: '', commercialRegister: '', address: '' })}
              >
                مصنع
              </Button>
            </div>
            {factories.fields.length === 0 && <p className="text-sm text-muted">ممكن تضيف المصانع دلوقتي أو بعدين من صفحة العميل.</p>}
            {factories.fields.map((field, i) => (
              <div key={field.id} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
                <TextField label="اسم المصنع" error={errors.factories?.[i]?.name?.message} {...register(`factories.${i}.name`)} />
                <TextField label="الرقم الضريبي" dir="ltr" maxLength={9} error={errors.factories?.[i]?.taxNumber?.message} {...register(`factories.${i}.taxNumber`)} />
                <TextField label="السجل التجاري" dir="ltr" error={errors.factories?.[i]?.commercialRegister?.message} {...register(`factories.${i}.commercialRegister`)} />
                <TextField label="العنوان" error={errors.factories?.[i]?.address?.message} {...register(`factories.${i}.address`)} />
                <button type="button" className="text-start text-sm text-danger hover:underline" onClick={() => factories.remove(i)}>
                  شيل المصنع ده
                </button>
              </div>
            ))}
          </section>
        )}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </form>
    </Drawer>
  );
}

function FactoryDrawer({
  clientId,
  factory,
  open,
  onClose,
}: {
  clientId: number;
  factory: Factory | null;
  open: boolean;
  onClose: () => void;
}) {
  const { register, handleSubmit, reset, formState } = useForm<z.input<typeof factorySchema>>({ resolver: zodResolver(factorySchema) });
  const save = useAction(
    (form: z.output<typeof factorySchema>) => (factory ? clientsApi.updateFactory(factory.id, form) : clientsApi.addFactory(clientId, form)),
    { success: factory ? 'اتحفظ المصنع' : 'اتضاف المصنع', invalidate: [clientKeys.all] },
  );
  useEffect(() => {
    if (!open) return;
    save.reset();
    reset(factory ?? { name: '', taxNumber: '', commercialRegister: '', address: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, factory]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={factory ? `تعديل ${factory.name}` : 'مصنع جديد'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="factory-form" type="submit" loading={save.isPending}>
            حفظ
          </Button>
        </div>
      }
    >
      <form id="factory-form" noValidate className="space-y-4" onSubmit={handleSubmit((f) => save.mutateAsync(f).then(onClose).catch(() => undefined))}>
        <TextField label="اسم المصنع" error={formState.errors.name?.message} {...register('name')} />
        <TextField label="الرقم الضريبي" dir="ltr" maxLength={9} error={formState.errors.taxNumber?.message} {...register('taxNumber')} />
        <TextField label="السجل التجاري" dir="ltr" error={formState.errors.commercialRegister?.message} {...register('commercialRegister')} />
        <TextField label="العنوان" error={formState.errors.address?.message} {...register('address')} />
        {save.error ? <ErrorBox error={save.error} /> : null}
      </form>
    </Drawer>
  );
}

function ClientDetailsDrawer({
  clientId,
  onClose,
  onEdit,
}: {
  clientId: number | null;
  onClose: () => void;
  onEdit: (client: Client) => void;
}) {
  const { can } = useAuth();
  const manage = can('clients.manage');
  const { data: client, isLoading, error } = useClient(clientId);
  const [factory, setFactory] = useState<Factory | null>(null);
  const [factoryOpen, setFactoryOpen] = useState(false);
  const [deleting, setDeleting] = useState<Factory | null>(null);
  const removeFactory = useAction((id: number) => clientsApi.removeFactory(id), {
    success: 'اتمسح المصنع',
    invalidate: [clientKeys.all],
  });

  return (
    <>
      <Drawer open={!!clientId} onClose={onClose} width="max-w-2xl" title={client?.name ?? 'العميل'}>
        {isLoading && (
          <div className="grid h-40 place-items-center text-gold">
            <Spinner className="size-7" />
          </div>
        )}
        {error ? <ErrorBox error={error} /> : null}
        {client && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">الموبايل</div>
                <div dir="ltr" className="text-end font-semibold">
                  {client.mobile}
                </div>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">الإيميل</div>
                <div dir="ltr" className="truncate text-end font-semibold">
                  {client.email}
                </div>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">أوبريشن الوارد</div>
                <div className="font-semibold">{client.importOperationEmployee.fullName}</div>
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">أوبريشن الصادر</div>
                <div className="font-semibold">{client.exportOperationEmployee?.fullName ?? 'نفس موظف الوارد'}</div>
              </div>
            </div>

            {client.quoteFinalBase !== undefined && (
              <section>
                <h3 className="mb-2 font-semibold text-gold">الكوتيشن</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {QUOTE_FIELDS.map((f) => (
                    <div key={f.key} className="flex justify-between rounded-lg border border-line px-3 py-2 text-sm">
                      <span className="text-muted">{f.label}</span>
                      <span className="font-semibold">{formatMoney(client[f.key])} ج</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-gold">المصانع ({client.factories?.length ?? 0})</h3>
                {manage && (
                  <Button
                    variant="ghost"
                    className="h-9 px-3 text-sm"
                    icon={<Plus className="size-4" />}
                    onClick={() => {
                      setFactory(null);
                      setFactoryOpen(true);
                    }}
                  >
                    مصنع
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {client.factories?.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <FactoryIcon className="size-5 text-gold" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{f.name}</div>
                      <div className="text-xs text-muted">
                        ض: <span dir="ltr">{f.taxNumber}</span> · س.ت: <span dir="ltr">{f.commercialRegister}</span> · {f.address}
                      </div>
                    </div>
                    {manage && (
                      <>
                        <IconButton
                          label="تعديل المصنع"
                          onClick={() => {
                            setFactory(f);
                            setFactoryOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                        </IconButton>
                        <IconButton label="حذف المصنع" tone="danger" onClick={() => setDeleting(f)}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      </>
                    )}
                  </div>
                ))}
                {client.factories?.length === 0 && <EmptyState compact text="مفيش مصانع لسه." />}
              </div>
            </section>

            {manage && (
              <Button variant="ghost" icon={<Pencil className="size-4" />} onClick={() => onEdit(client)}>
                تعديل بيانات العميل
              </Button>
            )}
          </div>
        )}
      </Drawer>
      {clientId && (
        <FactoryDrawer clientId={clientId} factory={factory} open={factoryOpen} onClose={() => setFactoryOpen(false)} />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="حذف المصنع"
        message={`هتمسح ${deleting?.name}. الحذف مش مسموح لو عليه شحنات شغالة.`}
        confirmLabel="حذف"
        onConfirm={() => removeFactory.mutateAsync(deleting!.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

export default function ClientsPage() {
  const { can } = useAuth();
  const manage = can('clients.manage');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useClients(search, page);
  const [viewing, setViewing] = useState<number | null>(null);
  const [editing, setEditing] = useState<Client | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Client | null>(null);
  const remove = useAction((id: number) => clientsApi.remove(id), { success: 'اتمسح العميل ومصانعه', invalidate: [clientKeys.all] });

  const openForm = (client: Client | null) => {
    setEditing(client);
    setFormOpen(true);
  };

  const columns: Column<Client>[] = [
    {
      header: 'العميل',
      cell: (c) => (
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-gold/10 text-gold">
            <Building2 className="size-4" />
          </span>
          <div>
            <div className="font-semibold">{c.name}</div>
            <div className="text-xs text-muted" dir="ltr">
              {c.mobile}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'الأوبريشن',
      cell: (c) => (
        <span className="flex items-center gap-1.5">
          <UserRound className="size-4 text-muted" />
          {c.importOperationEmployee.fullName}
        </span>
      ),
    },
    { header: 'المصانع', cell: (c) => <Badge tone="gold">{c._count?.factories ?? 0}</Badge> },
    ...(manage ? [{ header: 'أساس النهائي', cell: (c: Client) => formatMoney(c.quoteFinalBase) }] : []),
    {
      header: '',
      className: 'w-0 whitespace-nowrap',
      cell: (c) =>
        manage ? (
          <div className="flex justify-end">
            <IconButton label="تعديل" onClick={() => openForm(c)}>
              <Pencil className="size-4" />
            </IconButton>
            <IconButton label="حذف" tone="danger" onClick={() => setDeleting(c)}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title="العملاء والمصانع"
        description="اضغط على العميل علشان تشوف مصانعه وبياناته."
        actions={
          manage && (
            <Button icon={<Plus className="size-4" />} onClick={() => openForm(null)}>
              عميل جديد
            </Button>
          )
        }
      />
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(s) => {
            setSearch(s);
            setPage(1);
          }}
          placeholder="بحث بالاسم أو الموبايل أو الإيميل"
        />
      </div>
      <DataTable columns={columns} rows={data?.items} rowKey={(c) => c.id} loading={isLoading} error={error} empty="مفيش عملاء" onRowClick={(c) => setViewing(c.id)} />
      <div className="mt-4">
        <Pagination page={page} pageSize={25} total={data?.total ?? 0} onChange={setPage} />
      </div>
      <ClientDetailsDrawer
        clientId={viewing}
        onClose={() => setViewing(null)}
        onEdit={(c) => {
          setViewing(null);
          openForm(c);
        }}
      />
      <ClientFormDrawer client={editing} open={formOpen} onClose={() => setFormOpen(false)} />
      <ConfirmDialog
        open={!!deleting}
        title="حذف العميل"
        message={`هتمسح ${deleting?.name} وكل مصانعه. الحذف مش مسموح لو عليه شحنات شغالة.`}
        confirmLabel="حذف"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
