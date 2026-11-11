import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, PageHeader, Switch } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { TextField } from '@/components/ui/TextField';
import { formatMoney } from '@/lib/format';
import { toastError, useAction } from '@/lib/mutations';
import { money, nationalId, optionalText } from '@/lib/schemas';
import {
  clearerKeys,
  clearersApi,
  PRICE_FIELDS,
  useClearers,
  type Clearer,
  type Prices,
} from './api';

const pricesSchema = z.object(
  Object.fromEntries(PRICE_FIELDS.map((f) => [f.key, money])) as Record<keyof Prices, typeof money>,
);

const dataSchema = z.object({
  fullName: z.string().trim().min(3, 'الاسم 3 حروف على الأقل').max(120),
  phone: z.string().trim().min(1, 'اكتب التليفون').max(20),
  nationalId,
  /** typed comma-separated, sent as a list */
  offices: z.string().trim().max(1000),
  notes: optionalText(1000),
});

const createSchema = dataSchema.merge(pricesSchema);

type DataForm = z.input<typeof dataSchema>;
type PricesForm = z.input<typeof pricesSchema>;
type CreateForm = z.input<typeof createSchema>;

const toOffices = (text: string) =>
  text
    .split(/[،,]/)
    .map((s) => s.trim())
    .filter(Boolean);

function PriceFields({ register, errors }: { register: (k: keyof Prices) => object; errors: Partial<Record<string, { message?: string }>> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PRICE_FIELDS.map((f) => (
        <TextField
          key={f.key}
          label={`${f.label} (جنيه)`}
          type="number"
          step="0.01"
          min="0"
          dir="ltr"
          error={errors[f.key]?.message}
          {...register(f.key)}
        />
      ))}
      <p className="text-xs text-muted sm:col-span-2">
        الأتعاب = الأساس + الحاوية الإضافية × (عدد الحاويات − 1). LCL والجوي والمناطق الحرة بياخدوا الأساس بس. تغيير
        الأسعار ميأثرش على أتعاب اتحسبت قبل كده.
      </p>
    </div>
  );
}

function CreateClearerDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { register, handleSubmit, reset, formState } = useForm<CreateForm, unknown, z.output<typeof createSchema>>({
    resolver: zodResolver(createSchema),
  });
  const create = useAction(
    ({ offices, ...rest }: z.output<typeof createSchema>) => clearersApi.create({ ...rest, customsOffices: toOffices(offices) }),
    { success: 'اتضاف المستخلص', invalidate: [clearerKeys.all] },
  );
  useEffect(() => {
    if (open) {
      reset({ offices: '' });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the drawer opens
  }, [open]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="مستخلص جديد"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="create-clearer" type="submit" loading={create.isPending}>
            حفظ
          </Button>
        </div>
      }
    >
      <form
        id="create-clearer"
        noValidate
        className="space-y-6"
        onSubmit={handleSubmit((form) => create.mutateAsync(form).then(onClose).catch(() => undefined))}
      >
        <section className="grid gap-4 sm:grid-cols-2">
          <TextField label="الاسم بالكامل" className="sm:col-span-2" error={formState.errors.fullName?.message} {...register('fullName')} />
          <TextField label="التليفون" dir="ltr" inputMode="tel" error={formState.errors.phone?.message} {...register('phone')} />
          <TextField label="الرقم القومي" dir="ltr" inputMode="numeric" maxLength={14} error={formState.errors.nationalId?.message} {...register('nationalId')} />
          <TextField label="الجمارك اللي بيشتغل فيها" className="sm:col-span-2" error={formState.errors.offices?.message} {...register('offices')} />
          <TextField label="ملاحظات" className="sm:col-span-2" {...register('notes')} />
        </section>
        <section>
          <h3 className="mb-3 font-semibold text-gold">أسعار الأتعاب</h3>
          <PriceFields register={(k) => register(k)} errors={formState.errors} />
        </section>
        {create.error ? <ErrorBox error={create.error} /> : null}
      </form>
    </Drawer>
  );
}

function EditClearerDrawer({ clearer, onClose }: { clearer: Clearer | null; onClose: () => void }) {
  const [tab, setTab] = useState<'data' | 'prices'>('data');
  const dataForm = useForm<DataForm, unknown, z.output<typeof dataSchema>>({ resolver: zodResolver(dataSchema) });
  const pricesForm = useForm<PricesForm, unknown, z.output<typeof pricesSchema>>({ resolver: zodResolver(pricesSchema) });
  const saveData = useAction(
    ({ offices, ...rest }: z.output<typeof dataSchema>) => clearersApi.update(clearer!.id, { ...rest, customsOffices: toOffices(offices) }),
    { success: 'اتحفظت البيانات', invalidate: [clearerKeys.all] },
  );
  const savePrices = useAction((prices: Prices) => clearersApi.updatePrices(clearer!.id, prices), {
    success: 'اتحفظت الأسعار',
    invalidate: [clearerKeys.all],
  });

  useEffect(() => {
    if (!clearer) return;
    setTab('data');
    dataForm.reset({
      fullName: clearer.fullName,
      phone: clearer.phone,
      nationalId: clearer.nationalId,
      offices: clearer.customsOffices.join('، '),
      notes: clearer.notes ?? '',
    });
    pricesForm.reset(Object.fromEntries(PRICE_FIELDS.map((f) => [f.key, clearer[f.key]])));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when another clearer opens
  }, [clearer]);

  const active = tab === 'data' ? saveData : savePrices;

  return (
    <Drawer
      open={!!clearer}
      onClose={onClose}
      title={`تعديل ${clearer?.fullName ?? ''}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إغلاق
          </Button>
          <Button form={`clearer-${tab}`} type="submit" loading={active.isPending}>
            {tab === 'data' ? 'حفظ البيانات' : 'حفظ الأسعار'}
          </Button>
        </div>
      }
    >
      <div role="tablist" className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1">
        {(['data', 'prices'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`focus-ring h-10 rounded-lg text-sm font-semibold ${tab === t ? 'gold-fill' : 'text-muted hover:text-ink'}`}
          >
            {t === 'data' ? 'البيانات' : 'أسعار الأتعاب'}
          </button>
        ))}
      </div>
      {tab === 'data' ? (
        <form
          id="clearer-data"
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={dataForm.handleSubmit((f) => saveData.mutateAsync(f).catch(() => undefined))}
        >
          <TextField label="الاسم بالكامل" className="sm:col-span-2" error={dataForm.formState.errors.fullName?.message} {...dataForm.register('fullName')} />
          <TextField label="التليفون" dir="ltr" error={dataForm.formState.errors.phone?.message} {...dataForm.register('phone')} />
          <TextField label="الرقم القومي" dir="ltr" maxLength={14} error={dataForm.formState.errors.nationalId?.message} {...dataForm.register('nationalId')} />
          <TextField label="الجمارك اللي بيشتغل فيها" className="sm:col-span-2" {...dataForm.register('offices')} />
          <TextField label="ملاحظات" className="sm:col-span-2" {...dataForm.register('notes')} />
          {saveData.error ? (
            <div className="sm:col-span-2">
              <ErrorBox error={saveData.error} />
            </div>
          ) : null}
        </form>
      ) : (
        <form
          id="clearer-prices"
          noValidate
          className="space-y-4"
          onSubmit={pricesForm.handleSubmit((p) => savePrices.mutateAsync(p).catch(() => undefined))}
        >
          <PriceFields register={(k) => pricesForm.register(k)} errors={pricesForm.formState.errors} />
          {savePrices.error ? <ErrorBox error={savePrices.error} /> : null}
        </form>
      )}
    </Drawer>
  );
}

export default function ClearersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useClearers(search, page);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Clearer | null>(null);
  const [deleting, setDeleting] = useState<Clearer | null>(null);
  const setActive = useAction((c: { id: number; isActive: boolean }) => clearersApi.update(c.id, { isActive: c.isActive }), {
    invalidate: [clearerKeys.all],
  });
  const remove = useAction((id: number) => clearersApi.remove(id), { success: 'اتمسح المستخلص', invalidate: [clearerKeys.all] });

  const columns: Column<Clearer>[] = [
    {
      header: 'المستخلص',
      cell: (c) => (
        <div>
          <div className="font-semibold">{c.fullName}</div>
          <div className="text-xs text-muted" dir="ltr">
            {c.phone}
          </div>
        </div>
      ),
    },
    {
      header: 'الجمارك',
      cell: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.customsOffices.length ? c.customsOffices.map((o) => <Badge key={o}>{o}</Badge>) : <span className="text-muted">—</span>}
        </div>
      ),
    },
    { header: 'أساس النهائي', cell: (c) => formatMoney(c.importFinalBase) },
    { header: 'أساس السماح', cell: (c) => formatMoney(c.importTemporaryBase) },
    { header: 'الحاوية الإضافية', cell: (c) => formatMoney(c.importExtraContainer) },
    { header: 'أساس الصادر', cell: (c) => formatMoney(c.exportBase) },
    {
      header: 'الحالة',
      cell: (c) => (
        <Switch
          checked={c.isActive}
          label={c.isActive ? 'إيقاف المستخلص' : 'تفعيل المستخلص'}
          onChange={(isActive) => setActive.mutateAsync({ id: c.id, isActive }).catch(toastError)}
        />
      ),
    },
    {
      header: '',
      className: 'w-0 whitespace-nowrap',
      cell: (c) => (
        <div className="flex justify-end">
          <IconButton label="تعديل" onClick={() => setEditing(c)}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label="حذف" tone="danger" onClick={() => setDeleting(c)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="المستخلصين"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            مستخلص جديد
          </Button>
        }
      />
      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(s) => {
            setSearch(s);
            setPage(1);
          }}
          placeholder="بحث بالاسم أو الرقم القومي أو التليفون"
        />
      </div>
      <DataTable columns={columns} rows={data?.items} rowKey={(c) => c.id} loading={isLoading} error={error} empty="مفيش مستخلصين" onRowClick={setEditing} />
      <div className="mt-4">
        <Pagination page={page} pageSize={25} total={data?.total ?? 0} onChange={setPage} />
      </div>
      <CreateClearerDrawer open={creating} onClose={() => setCreating(false)} />
      <EditClearerDrawer clearer={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        title="حذف المستخلص"
        message={`هتمسح ${deleting?.fullName} وحساب الدخول بتاعه. الحذف مش مسموح لو عليه شحنات شغالة.`}
        confirmLabel="حذف"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
