import { Briefcase, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectField } from '@/components/ui/SelectField';
import { formatDate } from '@/lib/format';
import { money, STATUS } from './api';
import { HOLDERS, PURPOSES, useCustodies, type Custody, type CustodiesQuery, type HolderType } from './custody-api';
import { CustodyDrawer, IssueCustodyDrawer } from './CustodyDrawers';

export default function CustodiesPage() {
  const { can } = useAuth();
  const [q, setQ] = useState<CustodiesQuery>({ page: 1, status: '', holderType: '' });
  const { data, isLoading, error } = useCustodies(q);
  const [openId, setOpenId] = useState<number | null>(null);
  const [issuing, setIssuing] = useState(false);
  const set = (patch: Partial<CustodiesQuery>) => setQ((p) => ({ ...p, page: 1, ...patch }));

  const columns: Column<Custody>[] = [
    {
      header: 'العهدة',
      cell: (c) => (
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-gold/10 text-gold">
            <Briefcase className="size-4" />
          </span>
          <div>
            <div className="font-bold" dir="ltr" style={{ textAlign: 'right' }}>
              {c.custodyNo}
            </div>
            <div className="text-xs text-muted">ملف {c.shipment.fileNo}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'المستلم',
      cell: (c) => (
        <div>
          <div className="font-semibold">{c.agent?.fullName ?? c.clearer?.fullName ?? HOLDERS[c.holderType].label}</div>
          <div className="text-xs text-muted">
            {HOLDERS[c.holderType].label}
            {c.purpose && ` · ${PURPOSES[c.purpose]}`}
          </div>
        </div>
      ),
    },
    { header: 'التاريخ', cell: (c) => <span className="whitespace-nowrap">{formatDate(c.issueDate)}</span> },
    { header: 'المبلغ', cell: (c) => <b dir="ltr">{money(c.amount, c.currency)}</b> },
    {
      header: 'التصفية',
      cell: (c) =>
        c.status === 'OPEN' ? (
          <Badge tone="gold">مفتوحة</Badge>
        ) : (
          <div className="text-sm">
            <span dir="ltr">{money(c.spentAmount)}</span>
            {Number(c.returnedAmount) > 0 && <div className="text-xs text-success">رجع {money(c.returnedAmount)}</div>}
            {Number(c.extraAmount) > 0 && <div className="text-xs text-warning">زيادة {money(c.extraAmount)}</div>}
          </div>
        ),
    },
    {
      header: 'الاعتماد',
      cell: (c) => (c.status === 'SETTLED' ? <Badge tone={STATUS[c.approvalStatus].tone}>{STATUS[c.approvalStatus].label}</Badge> : <span className="text-xs text-muted">بعد التصفية</span>),
    },
  ];

  return (
    <>
      <PageHeader
        title="العهد"
        actions={
          can('finance.custody.manage') && (
            <Button icon={<Plus className="size-4" />} onClick={() => setIssuing(true)}>
              صرف عهدة
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <SearchInput value={q.search ?? ''} onChange={(search) => set({ search: search || undefined })} placeholder="رقم العهدة أو رقم الملف" />
        </div>
        <div className="w-44">
          <SelectField
            label="الحالة"
            placeholder="الكل"
            options={[
              { value: 'OPEN', label: 'مفتوحة' },
              { value: 'SETTLED', label: 'متصفية' },
            ]}
            value={q.status}
            onChange={(e) => set({ status: e.target.value as CustodiesQuery['status'] })}
          />
        </div>
        <div className="w-48">
          <SelectField
            label="المستلم"
            placeholder="الكل"
            options={(Object.keys(HOLDERS) as HolderType[]).map((h) => ({ value: h, label: HOLDERS[h].label }))}
            value={q.holderType}
            onChange={(e) => set({ holderType: e.target.value as HolderType | '' })}
          />
        </div>
      </div>
      <DataTable columns={columns} rows={data?.items} rowKey={(c) => c.id} loading={isLoading} error={error} empty="مفيش عهد" onRowClick={(c) => setOpenId(c.id)} />
      <div className="mt-4">
        <Pagination page={q.page} pageSize={25} total={data?.total ?? 0} onChange={(page) => setQ((p) => ({ ...p, page }))} />
      </div>
      <IssueCustodyDrawer open={issuing} onClose={() => setIssuing(false)} onIssued={(c) => setOpenId(c.id)} />
      <CustodyDrawer custodyId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
