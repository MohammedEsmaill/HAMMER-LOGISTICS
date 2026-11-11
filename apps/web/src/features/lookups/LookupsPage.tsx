import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'motion/react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { usePageOf } from '@/lib/use-page-of';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, PageHeader } from '@/components/ui/misc';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAction } from '@/lib/mutations';
import {
  KINDS,
  lookupKeys,
  lookupsApi,
  useCountries,
  useLookup,
  usePorts,
  type Country,
  type LookupRow,
  type Port,
  type SimpleLookup,
  type TransportKind,
} from './api';

type Tab = 'ports' | SimpleLookup | 'countries';

const TABS: { key: Tab; label: string; kinded?: boolean }[] = [
  { key: 'ports', label: 'الموانئ والمطارات', kinded: true },
  { key: 'carriers', label: 'الخطوط وشركات الطيران', kinded: true },
  { key: 'storage-yards', label: 'الساحات والمخازن', kinded: true },
  { key: 'free-zones', label: 'المناطق الحرة' },
  { key: 'inspection-authorities', label: 'جهات الفحص' },
  { key: 'countries', label: 'الدول' },
];

const SINGULAR: Record<Exclude<Tab, 'countries'>, string> = {
  ports: 'ميناء / مطار',
  carriers: 'خط / شركة طيران',
  'storage-yards': 'ساحة / مخزن',
  'free-zones': 'منطقة حرة',
  'inspection-authorities': 'جهة فحص',
};

const KIND_OPTIONS = Object.entries(KINDS).map(([value, label]) => ({ value, label }));

const optionalId = z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().int().positive().optional());

const formSchema = z.object({
  name: z.string().trim().min(2, 'الاسم حرفين على الأقل').max(150),
  kind: z.enum(['SEA', 'AIR']).optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^([A-Z]{2}[A-Z0-9]{3}|[A-Z]{3})$/, 'الكود UN/LOCODE (EGALY) أو IATA (CAI)')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  countryId: optionalId,
  sortOrder: optionalId,
  portId: optionalId,
});
type FormIn = z.input<typeof formSchema>;
type FormOut = z.output<typeof formSchema>;

type Row = Port | LookupRow;

function LookupFormDrawer({
  tab,
  row,
  open,
  onClose,
}: {
  tab: Exclude<Tab, 'countries'>;
  row: Row | null;
  open: boolean;
  onClose: () => void;
}) {
  const isNew = !row;
  const kinded = tab === 'ports' || tab === 'carriers' || tab === 'storage-yards';
  const { data: countries = [] } = useCountries();
  const { register, handleSubmit, control, reset, setError, formState } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(formSchema),
  });
  const kind = useWatch({ control, name: 'kind' }) as TransportKind | undefined;
  const { data: egyptPorts = [] } = usePorts({ egyptian: true, kind: kind ?? 'SEA' });

  const save = useAction(
    (f: FormOut): Promise<unknown> => {
      if (tab === 'ports') {
        return row
          ? lookupsApi.updatePort(row.id, { name: f.name, code: f.code })
          : lookupsApi.createPort({ name: f.name, kind: f.kind!, code: f.code, countryId: f.countryId! });
      }
      const extra = {
        ...(tab === 'carriers' && f.sortOrder ? { sortOrder: f.sortOrder } : {}),
        ...(tab === 'storage-yards' ? { portId: f.portId ?? (row ? null : undefined) } : {}),
      };
      return row
        ? lookupsApi.update(tab, row.id, { name: f.name, ...extra })
        : lookupsApi.create(tab, { name: f.name, ...(kinded ? { kind: f.kind } : {}), ...extra } as Parameters<
            typeof lookupsApi.create
          >[1]);
    },
    { success: isNew ? 'اتضافت للقائمة' : 'اتحفظ التعديل', invalidate: [lookupKeys.all] },
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    const r = row as Partial<Port & LookupRow> | null;
    reset({
      name: r?.name ?? '',
      kind: r?.kind ?? 'SEA',
      code: r?.code ?? '',
      countryId: r?.countryId ?? countries.find((c: Country) => c.code === 'EG')?.id ?? '',
      sortOrder: r?.sortOrder ?? '',
      portId: r?.portId ?? '',
    } as FormIn);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open, row]);

  const submit = (f: FormOut) => {
    // the per-list rules that the shared schema cannot express
    if (tab === 'ports' && isNew && !f.countryId) return setError('countryId', { message: 'اختار الدولة' });
    return save.mutateAsync(f).then(onClose).catch(() => undefined);
  };
  const errors = formState.errors;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={row ? `تعديل ${row.name}` : `إضافة ${SINGULAR[tab]}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="lookup-form" type="submit" loading={save.isPending}>
            حفظ
          </Button>
        </div>
      }
    >
      <form id="lookup-form" noValidate className="space-y-4" onSubmit={handleSubmit(submit)}>
        <TextField label="الاسم" error={errors.name?.message} {...register('name')} />
        {kinded && (
          <SelectField
            label="النوع"
            options={KIND_OPTIONS}
            disabled={!isNew}
            title={isNew ? undefined : 'النوع مبيتغيرش بعد الإضافة'}
            {...register('kind')}
          />
        )}
        {tab === 'ports' && (
          <>
            <TextField
              label="الكود (اختياري)"
              hint="UN/LOCODE للموانئ زي EGALY، و IATA للمطارات زي CAI"
              dir="ltr"
              maxLength={5}
              error={errors.code?.message}
              {...register('code')}
            />
            {isNew && (
              <SelectField
                label="الدولة"
                placeholder="اختار الدولة"
                options={countries.map((c) => ({ value: c.id, label: `${c.nameAr} (${c.code})` }))}
                error={errors.countryId?.message}
                {...register('countryId')}
              />
            )}
          </>
        )}
        {tab === 'carriers' && (
          <TextField
            label="الترتيب في القائمة (اختياري)"
            hint="الأصغر بيظهر الأول"
            type="number"
            min={1}
            dir="ltr"
            error={errors.sortOrder?.message}
            {...register('sortOrder')}
          />
        )}
        {tab === 'storage-yards' && (
          <SelectField
            label={kind === 'AIR' ? 'المطار' : 'الميناء'}
            placeholder="من غير تحديد"
            options={egyptPorts.map((p) => ({ value: p.id, label: p.name }))}
            error={errors.portId?.message}
            {...register('portId')}
          />
        )}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </form>
    </Drawer>
  );
}

function useTabRows(tab: Tab) {
  const ports = usePorts();
  const countries = useCountries();
  const simple = useLookup(tab === 'ports' || tab === 'countries' ? 'carriers' : tab);
  if (tab === 'ports') return ports;
  if (tab === 'countries') return countries;
  return simple;
}

export default function LookupsPage() {
  const { can } = useAuth();
  const manage = can('lookups.manage');
  const add = manage || can('lookups.add');
  const [tab, setTab] = useState<Tab>('ports');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<TransportKind | ''>('');
  const [egyptian, setEgyptian] = useState<'' | 'yes' | 'no'>('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const meta = TABS.find((t) => t.key === tab)!;
  const { data, isLoading, error } = useTabRows(tab);

  const remove = useAction(
    (row: Row) => (tab === 'ports' ? lookupsApi.removePort(row.id) : lookupsApi.remove(tab as SimpleLookup, row.id)),
    { success: 'اتمسحت من القائمة', invalidate: [lookupKeys.all] },
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data as (Row | Country)[] | undefined)?.filter((r) => {
      const text = 'nameAr' in r ? `${r.nameAr} ${r.nameEn} ${r.code}` : `${r.name} ${'code' in r ? (r.code ?? '') : ''}`;
      if (q && !text.toLowerCase().includes(q)) return false;
      if (meta.kinded && kind && 'kind' in r && r.kind !== kind) return false;
      if (tab === 'ports' && egyptian && (r as Port).isEgyptian !== (egyptian === 'yes')) return false;
      return true;
    });
  }, [data, search, kind, egyptian, tab, meta.kinded]);

  const paged = usePageOf(rows, 50, `${tab}|${search}|${kind}|${egyptian}`);

  const actions: Column<Row> = {
    header: '',
    className: 'w-0 whitespace-nowrap',
    cell: (r) =>
      manage ? (
        <div className="flex justify-end">
          <IconButton
            label="تعديل"
            onClick={() => {
              setEditing(r);
              setFormOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label="حذف" tone="danger" onClick={() => setDeleting(r)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ) : null,
  };
  const kindCol: Column<Row> = {
    header: 'النوع',
    cell: (r) => <Badge tone={r.kind === 'AIR' ? 'muted' : 'gold'}>{r.kind ? KINDS[r.kind] : '—'}</Badge>,
  };
  const name: Column<Row> = { header: 'الاسم', cell: (r) => <span className="font-semibold">{r.name}</span> };

  const columns: Record<Exclude<Tab, 'countries'>, Column<Row>[]> = {
    ports: [
      name,
      { header: 'الكود', cell: (r) => <span dir="ltr">{(r as Port).code ?? '—'}</span> },
      kindCol,
      {
        header: 'الدولة',
        cell: (r) => (
          <span className="flex items-center gap-2">
            {(r as Port).country.nameAr}
            {(r as Port).isEgyptian && <Badge tone="success">مصري</Badge>}
          </span>
        ),
      },
      actions,
    ],
    carriers: [{ header: '#', className: 'w-0', cell: (r) => (r as LookupRow).sortOrder ?? '—' }, name, kindCol, actions],
    'storage-yards': [name, kindCol, { header: 'الميناء / المطار', cell: (r) => (r as LookupRow).port?.name ?? '—' }, actions],
    'free-zones': [name, actions],
    'inspection-authorities': [name, actions],
  };
  const countryColumns: Column<Country>[] = [
    { header: 'الكود', className: 'w-0', cell: (c) => <span dir="ltr">{c.code}</span> },
    { header: 'الاسم', cell: (c) => <span className="font-semibold">{c.nameAr}</span> },
    { header: 'بالإنجليزي', cell: (c) => <span dir="ltr">{c.nameEn}</span> },
  ];

  return (
    <>
      <PageHeader
        title="القوائم الثابتة"
        description={
          manage
            ? 'القوائم اللي بتظهر في فورم الشحنة. الحذف مش مسموح لعنصر مستخدم في شحنة.'
            : 'تقدر تضيف عناصر جديدة، والتعديل والحذف للإدارة.'
        }
        actions={
          add &&
          tab !== 'countries' && (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              إضافة {SINGULAR[tab]}
            </Button>
          )
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setKind('');
              setEgyptian('');
            }}
            className="focus-ring relative shrink-0 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap"
          >
            {tab === t.key && (
              <motion.span layoutId="lookup-tab" className="absolute inset-0 rounded-lg bg-gold/12 ring-1 ring-gold/30" />
            )}
            <span className={`relative ${tab === t.key ? 'text-gold' : 'text-muted'}`}>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو الكود" />
        </div>
        {meta.kinded && (
          <div className="w-36">
            <SelectField
              label="النوع"
              placeholder="الكل"
              options={KIND_OPTIONS}
              value={kind}
              onChange={(e) => setKind(e.target.value as TransportKind | '')}
            />
          </div>
        )}
        {tab === 'ports' && (
          <div className="w-36">
            <SelectField
              label="الدولة"
              placeholder="الكل"
              options={[
                { value: 'yes', label: 'مصر' },
                { value: 'no', label: 'خارج مصر' },
              ]}
              value={egyptian}
              onChange={(e) => setEgyptian(e.target.value as '' | 'yes' | 'no')}
            />
          </div>
        )}
      </div>

      {tab === 'countries' ? (
        <DataTable columns={countryColumns} rows={paged.items as Country[] | undefined} rowKey={(c) => c.id} loading={isLoading} error={error} empty="مفيش نتايج" />
      ) : (
        <DataTable columns={columns[tab]} rows={paged.items as Row[] | undefined} rowKey={(r) => r.id} loading={isLoading} error={error} empty="مفيش نتايج" />
      )}
      <div className="mt-4">
        {paged.total > paged.pageSize ? (
          <Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onChange={paged.setPage} />
        ) : (
          rows && <p className="text-xs text-muted">{rows.length} عنصر</p>
        )}
      </div>

      {tab !== 'countries' && <LookupFormDrawer tab={tab} row={editing} open={formOpen} onClose={() => setFormOpen(false)} />}
      <ConfirmDialog
        open={!!deleting}
        title="حذف من القائمة"
        message={`هتمسح «${deleting?.name}». لو مستخدم في أي شحنة الحذف هيترفض.`}
        confirmLabel="حذف"
        onConfirm={() => remove.mutateAsync(deleting!)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
