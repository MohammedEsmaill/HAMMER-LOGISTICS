import { useState } from 'react';
import { useNavigate } from 'react-router';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectField } from '@/components/ui/SelectField';
import { PAYMENT_STATUS, useShipmentAccounts, type AccountRow } from './account-api';
import { money } from './api';

export default function ShipmentAccountsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState({ search: '', status: '', paymentStatus: '', page: 1 });
  const { data, isLoading, error } = useShipmentAccounts(q);
  const set = (patch: Partial<typeof q>) => setQ((p) => ({ ...p, page: 1, ...patch }));

  const columns: Column<AccountRow>[] = [
    {
      header: 'الملف',
      cell: (r) => (
        <div>
          <div className="font-bold" dir="ltr" style={{ textAlign: 'right' }}>
            {r.fileNo}
          </div>
          <div className="text-xs text-muted">{r.client.name}</div>
        </div>
      ),
    },
    {
      header: 'الحساب',
      cell: (r) => (
        <div className="space-y-1">
          <Badge tone={r.status === 'OPEN' ? 'gold' : 'success'}>{r.status === 'OPEN' ? 'مفتوح' : 'منتهي'}</Badge>
          {r.openCustodies > 0 && <div className="text-xs text-warning">{r.openCustodies} عهدة مفتوحة</div>}
        </div>
      ),
    },
    {
      header: 'الفعلي',
      cell: (r) => (
        <div className="text-sm" dir="ltr">
          {r.totals.filter((t) => Number(t.actual) > 0).map((t) => (
            <div key={t.currency}>{money(t.actual, t.currency)}</div>
          ))}
        </div>
      ),
    },
    {
      header: 'الفواتير',
      cell: (r) => (
        <div className="text-sm" dir="ltr">
          {r.totals.filter((t) => Number(t.billed) > 0).map((t) => (
            <div key={t.currency}>{money(t.billed, t.currency)}</div>
          ))}
        </div>
      ),
    },
    { header: 'السداد', cell: (r) => (r.status === 'FINISHED' ? <Badge tone={PAYMENT_STATUS[r.paymentStatus].tone}>{PAYMENT_STATUS[r.paymentStatus].label}</Badge> : null) },
  ];

  return (
    <>
      <PageHeader title="حسابات الشحنات" description="مصروفات كل شحنة، وكشف العميل، والفواتير، والتحصيل." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <SearchInput value={q.search} onChange={(search) => set({ search })} placeholder="رقم الملف أو العميل أو رقم الشهادة" />
        </div>
        <div className="w-40">
          <SelectField
            label="الحساب"
            placeholder="الكل"
            options={[
              { value: 'OPEN', label: 'مفتوح' },
              { value: 'FINISHED', label: 'منتهي' },
            ]}
            value={q.status}
            onChange={(e) => set({ status: e.target.value })}
          />
        </div>
        <div className="w-44">
          <SelectField
            label="السداد"
            placeholder="الكل"
            options={Object.entries(PAYMENT_STATUS).map(([value, s]) => ({ value, label: s.label }))}
            value={q.paymentStatus}
            onChange={(e) => set({ paymentStatus: e.target.value })}
          />
        </div>
      </div>
      <DataTable columns={columns} rows={data?.items} rowKey={(r) => r.id} loading={isLoading} error={error} empty="مفيش شحنات" onRowClick={(r) => navigate(`/shipment-accounts/${r.id}`)} />
      <div className="mt-4">
        <Pagination page={q.page} pageSize={25} total={data?.total ?? 0} onChange={(page) => setQ((p) => ({ ...p, page }))} />
      </div>
    </>
  );
}
