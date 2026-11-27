import { FileSpreadsheet, Monitor, Plus, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FilterBar } from '@/components/ui/FilterBar';
import { Badge, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectField } from '@/components/ui/SelectField';
import { formatDate } from '@/lib/format';
import { toastError } from '@/lib/mutations';
import { useListState, usePageSize } from '@/lib/use-list-state';
import { api } from '@/lib/api-client';
import { useCompany } from './account-api';
import { money } from './api';
import { AssetDrawer, NewAssetDrawer } from './AssetDrawers';
import { ASSET_CATEGORIES, ASSET_STATUS, useAssets, type AssetCategory, type AssetsPage, type AssetStatus, type FixedAsset } from './assets-api';
import { DocumentDrawers, type OpenDocument } from './DocumentDrawers';

function Stat({ label, value, hint, tone = '' }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl font-extrabold tabular-nums ${tone}`}>{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

/**
 * The fixed assets: every device (computers, laptops, printers, scanners …) with its
 * serial, who holds it, its cost and what is left of its value.
 */
export default function FixedAssetsPage() {
  const { can } = useAuth();
  const [pageSize, setPageSize] = usePageSize();
  const [q, set] = useListState({
    page: 1,
    search: '',
    category: '' as AssetCategory | '',
    status: 'ACTIVE' as AssetStatus | '',
  });
  const { data, isLoading, error } = useAssets({ ...q, search: q.search || undefined, pageSize });
  const { data: company } = useCompany();
  const [adding, setAdding] = useState<'purchase' | 'existing' | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [exporting, setExporting] = useState(false);

  const excel = async () => {
    if (!company) return;
    setExporting(true);
    try {
      const all = await api.get<AssetsPage>('/finance/assets', {
        page: 1,
        pageSize: 200,
        ...(q.search ? { search: q.search } : {}),
        ...(q.category ? { category: q.category } : {}),
        ...(q.status ? { status: q.status } : {}),
      });
      const { downloadAssetsExcel } = await import('./assets-excel');
      await downloadAssetsExcel(all, company);
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<FixedAsset>[] = [
    {
      header: 'الجهاز',
      cell: (a) => (
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg bg-gold/10 text-gold">
            <Monitor className="size-4" />
          </span>
          <div>
            <div className="font-bold">{a.name}</div>
            <div className="text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }}>
              {a.assetNo}
              {a.serialNo ? ` · S/N ${a.serialNo}` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'النوع',
      cell: (a) => (
        <div>
          {ASSET_CATEGORIES[a.category]}
          {a.model && <div className="text-xs text-muted">{a.model}</div>}
        </div>
      ),
    },
    {
      header: 'مع مين',
      cell: (a) => (
        <div>
          {a.custodian?.fullName ?? <span className="text-muted">—</span>}
          {a.location && <div className="text-xs text-muted">{a.location}</div>}
        </div>
      ),
    },
    { header: 'تاريخ الشراء', cell: (a) => <span className="whitespace-nowrap">{formatDate(a.acquiredOn)}</span> },
    { header: 'التكلفة', cell: (a) => <span className="tabular-nums">{money(a.cost)}</span> },
    { header: 'الإهلاك المتراكم', cell: (a) => <span className="tabular-nums text-warning">{money(a.depreciation.accumulated)}</span> },
    {
      header: 'صافي القيمة',
      // a device sold or scrapped left the books: nothing of it is left
      cell: (a) =>
        a.status === 'ACTIVE' ? (
          <b className="tabular-nums">{money(a.depreciation.netBookValue)}</b>
        ) : (
          <span className="text-xs text-muted">خرج {formatDate(a.disposedOn)}</span>
        ),
    },
    { header: 'الحالة', cell: (a) => <Badge tone={ASSET_STATUS[a.status].tone}>{ASSET_STATUS[a.status].label}</Badge> },
  ];

  const t = data?.totals;
  return (
    <>
      <PageHeader
        title="الأصول الثابتة"
        actions={
          <>
            <Button variant="ghost" icon={<FileSpreadsheet className="size-4" />} loading={exporting} onClick={excel}>
              Excel
            </Button>
            {can('assets.manage') && (
              <Button variant="ghost" icon={<Plus className="size-4" />} onClick={() => setAdding('existing')}>
                تسجيل جهاز موجود
              </Button>
            )}
            {can('assets.transact') && (
              <Button icon={<ShoppingCart className="size-4" />} onClick={() => setAdding('purchase')}>
                شراء جهاز
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="أجهزة شغّالة" value={String(t?.count ?? '—')} hint="بالفلاتر الحالية" />
        <Stat label="التكلفة" value={t ? money(t.cost, 'EGP') : '—'} />
        <Stat label="الإهلاك المتراكم" value={t ? money(t.accumulated, 'EGP') : '—'} tone="text-warning" />
        <Stat label="صافي القيمة" value={t ? money(t.netBookValue, 'EGP') : '—'} tone="text-gold" />
      </div>
      <FilterBar
        search={<SearchInput value={q.search ?? ''} onChange={(search) => set({ search: search || undefined })} placeholder="الاسم أو الـ Serial أو الموظف أو رقم الأصل" />}
        active={[q.category, q.status].filter(Boolean).length}
      >
        <div className="w-40">
          <SelectField
            label="النوع"
            placeholder="الكل"
            options={Object.entries(ASSET_CATEGORIES).map(([value, label]) => ({ value, label }))}
            value={q.category}
            onChange={(e) => set({ category: e.target.value as AssetCategory | '' })}
          />
        </div>
        <div className="w-40">
          <SelectField
            label="الحالة"
            placeholder="الكل"
            options={Object.entries(ASSET_STATUS).map(([value, s]) => ({ value, label: s.label }))}
            value={q.status}
            onChange={(e) => set({ status: e.target.value as AssetStatus | '' })}
          />
        </div>
      </FilterBar>
      <DataTable columns={columns} rows={data?.items} rowKey={(a) => a.id} loading={isLoading} error={error} empty="مفيش أجهزة" onRowClick={(a) => setOpenId(a.id)} />
      <div className="mt-4">
        <Pagination page={q.page} pageSize={pageSize} total={data?.total ?? 0} onChange={(page) => set({ page })} onPageSizeChange={(n) => (setPageSize(n), set({ page: 1 }))} />
      </div>
      <p className="mt-3 text-xs text-muted">
        الإهلاك بالقسط الثابت، بيتحسب لوحده كل آخر شهر وبيظهر في قائمة الدخل والميزانية. الأجهزة الأقل من 2,000 ج بتتسجل مصروف عادي.
      </p>
      <NewAssetDrawer
        mode={adding}
        onClose={() => setAdding(null)}
        onSaved={(id) => {
          setAdding(null);
          setOpenId(id);
        }}
      />
      <AssetDrawer assetId={openId} onClose={() => setOpenId(null)} onOpenTx={(id) => setDoc({ type: 'ASSET', id })} />
      <DocumentDrawers open={doc} onClose={() => setDoc(null)} />
    </>
  );
}
