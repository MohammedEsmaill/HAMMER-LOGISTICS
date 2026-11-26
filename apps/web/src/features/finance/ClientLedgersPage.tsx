import { useNavigate } from 'react-router';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { PageHeader } from '@/components/ui/misc';
import { SearchInput } from '@/components/ui/SearchInput';
import { formatDate } from '@/lib/format';
import { usePageOf } from '@/lib/use-page-of';
import { FormTabs } from '../shipments/FormTabs';
import { useClientBalances, type ClientBalance } from './account-api';
import { useListState } from '@/lib/use-list-state';
import { money, type Currency } from './api';

type Filter = 'all' | 'owes' | 'credit' | 'settled';

const owed = (b: ClientBalance, c: Currency) => Number(b.currencies[c]?.balance ?? 0);
const matches = (b: ClientBalance, f: Filter) => {
  const values = (['EGP', 'USD'] as const).map((c) => owed(b, c));
  if (f === 'owes') return values.some((v) => v > 0);
  if (f === 'credit') return values.some((v) => v < 0);
  if (f === 'settled') return values.every((v) => v === 0);
  return true;
};

/** The balance in one currency: what the client owes in gold, what we owe them in green. */
function Owed({ b, c }: { b: ClientBalance; c: Currency }) {
  const row = b.currencies[c];
  if (!row) return <span className="text-muted">—</span>;
  const v = Number(row.balance);
  return (
    <span dir="ltr" className={`font-semibold ${v > 0 ? 'text-debit' : v < 0 ? 'text-success' : 'text-muted'}`}>
      {v < 0 ? `(${money(-v, c)})` : money(v, c)}
    </span>
  );
}

/** Every client with an account: what they owe, what waits for approval, how old. */
export default function ClientLedgersPage() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useClientBalances();
  const [{ search, filter }, setFilters] = useListState({ search: '', filter: 'all' as Filter, page: 1 });
  const setSearch = (s: string) => setFilters({ search: s });
  const setFilter = (f: Filter) => setFilters({ filter: f });
  const rows = data
    ?.filter((b) => matches(b, filter) && (!search || b.client.name.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => owed(b, 'EGP') - owed(a, 'EGP') || owed(b, 'USD') - owed(a, 'USD'));
  const paged = usePageOf(rows, `${filter}|${search}`);
  const count = (f: Filter) => data?.filter((b) => matches(b, f)).length;

  const columns: Column<ClientBalance>[] = [
    { header: 'العميل', cell: (b) => <span className="font-semibold">{b.client.name}</span> },
    { header: 'الرصيد بالجنيه', cell: (b) => <Owed b={b} c="EGP" /> },
    { header: 'الرصيد بالدولار', cell: (b) => <Owed b={b} c="USD" /> },
    {
      header: 'قيد المراجعة',
      cell: (b) => {
        const n = (b.currencies.EGP?.pending ?? 0) + (b.currencies.USD?.pending ?? 0);
        return n ? <span className="text-gold">{n} مستند</span> : <span className="text-muted">—</span>;
      },
    },
    {
      header: 'آخر تحصيل',
      cell: (b) => {
        const dates = [b.currencies.EGP?.lastCollection, b.currencies.USD?.lastCollection].filter(Boolean) as string[];
        return dates.length ? formatDate(dates.sort().at(-1)) : <span className="text-muted">—</span>;
      },
    },
    {
      header: 'أقدم مستحق',
      cell: (b) => {
        const days = [b.currencies.EGP?.oldestDays, b.currencies.USD?.oldestDays].filter((d): d is number => d !== null && d !== undefined);
        if (!days.length) return <span className="text-muted">—</span>;
        const d = Math.max(...days);
        return <span className={d > 90 ? 'font-semibold text-danger' : d > 30 ? 'text-gold' : ''}>{d} يوم</span>;
      },
    },
  ];

  return (
    <>
      <PageHeader title="حسابات العملاء" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FormTabs
          tabs={[
            { key: 'all', label: 'الكل', count: count('all') },
            { key: 'owes', label: 'عليهم مستحقات', count: count('owes') },
            { key: 'credit', label: 'لهم رصيد', count: count('credit') },
            { key: 'settled', label: 'مسددين', count: count('settled') },
          ]}
          active={filter}
          onChange={setFilter}
          layoutId="client-ledger-filter"
        />
        <div className="min-w-60 flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="ابحث باسم العميل" />
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={paged.items}
        rowKey={(b) => b.client.id}
        loading={isLoading}
        error={error}
        empty="لا توجد حسابات عملاء"
        onRowClick={(b) => navigate(`/client-ledgers/${b.client.id}`)}
      />
      <div className="mt-3">
        <Pagination page={paged.page} pageSize={paged.pageSize} total={paged.total} onChange={paged.setPage} onPageSizeChange={paged.setPageSize} />
      </div>
    </>
  );
}
