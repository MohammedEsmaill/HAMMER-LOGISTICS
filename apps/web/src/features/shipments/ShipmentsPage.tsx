import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectField } from '@/components/ui/SelectField';
import { formatDate } from '@/lib/format';
import { useShipments, type ShipmentListItem, type ShipmentsQuery } from './api';
import { MODE_ICONS } from './mode-icons';
import { EXPORT_STAGES, FREE_ZONE_STAGES, IMPORT_STAGES, KIND_LIST, kindOf, SHIPMENT_TYPES, STAGE_LABELS } from './rules';

const KIND_OPTIONS = KIND_LIST.map((t) => ({ value: t.kind, label: t.label }));
/** The agreed import stages; an export type brings its own. */
const stageOptions = (kind: string) => {
  const list: readonly string[] = kind.startsWith('EXPORT') ? EXPORT_STAGES : kind === 'IMPORT_FREE_ZONE' ? FREE_ZONE_STAGES : IMPORT_STAGES;
  return list.map((value) => ({ value, label: STAGE_LABELS[value] }));
};

export default function ShipmentsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState<ShipmentsQuery>({ search: '', kind: '', stage: '', page: 1 });
  const { data, isLoading, error } = useShipments(q);
  const set = (patch: Partial<ShipmentsQuery>) => setQ((prev) => ({ ...prev, page: 1, ...patch }));

  const columns: Column<ShipmentListItem>[] = [
    {
      header: 'الملف',
      cell: (s) => {
        const Icon = MODE_ICONS[s.mode];
        return (
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-gold/10 text-gold">
              <Icon className="size-4" />
            </span>
            <div>
              <div className="font-bold tracking-wide" dir="ltr">
                {s.fileNo}
              </div>
              <div className="text-xs text-muted">{SHIPMENT_TYPES[kindOf(s.direction, s.mode)].label}</div>
            </div>
          </div>
        );
      },
    },
    {
      header: 'العميل',
      cell: (s) => (
        <div className="max-w-56">
          <div className="truncate font-semibold">{s.client.name}</div>
          <div className="truncate text-xs text-muted">{s.commodity}</div>
        </div>
      ),
    },
    {
      header: 'البوليصة',
      cell: (s) => (
        <span dir="ltr" className="text-sm">
          {s.hblDisplay ?? '—'}
        </span>
      ),
    },
    { header: 'المرحلة', cell: (s) => <Badge tone={s.currentStage === 'REGISTERED' ? 'muted' : 'gold'}>{s.stageLabel}</Badge> },
    { header: 'الأوبريشن', cell: (s) => <span className="text-sm">{s.operationEmployee.fullName}</span> },
    { header: 'ETA', cell: (s) => <span className="text-sm whitespace-nowrap">{formatDate(s.eta)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="الشحنات"
        actions={
          can('shipments.create') && (
            <Button icon={<Plus className="size-4" />} onClick={() => navigate('/shipments/new')}>
              شحنة جديدة
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <SearchInput
            value={q.search}
            onChange={(search) => set({ search })}
            placeholder="رقم الملف، البوليصة، الرقم التعريفي، الحاوية أو العميل"
          />
        </div>
        <div className="w-44">
          <SelectField
            label="النوع"
            placeholder="كل الأنواع"
            options={KIND_OPTIONS}
            value={q.kind}
            onChange={(e) => {
              const kind = e.target.value as ShipmentsQuery['kind'];
              // a stage the new type does not go through is dropped from the filter
              set({ kind, ...(stageOptions(kind).some((o) => o.value === q.stage) ? {} : { stage: '' }) });
            }}
          />
        </div>
        <div className="w-48">
          <SelectField
            label="المرحلة"
            placeholder="كل المراحل"
            options={stageOptions(q.kind)}
            value={q.stage}
            onChange={(e) => set({ stage: e.target.value })}
          />
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(s) => s.id}
        loading={isLoading}
        error={error}
        empty="مفيش شحنات"
        onRowClick={(s) => navigate(`/shipments/${s.id}`)}
      />
      <div className="mt-4">
        <Pagination page={q.page} pageSize={25} total={data?.total ?? 0} onChange={(page) => setQ((p) => ({ ...p, page }))} />
      </div>
    </>
  );
}
