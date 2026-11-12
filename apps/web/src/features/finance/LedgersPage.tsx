import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, PageHeader } from '@/components/ui/misc';
import { formatDate } from '@/lib/format';
import { FormTabs } from '../shipments/FormTabs';
import { money } from './api';
import { useHolders, useStatement, type HolderTotals } from './custody-api';
import { ClearerFeesPanel, StatementTable } from './LedgerDrawers';

type Tab = 'clearers' | 'agents' | 'way-out';

type HolderRow = { id: number; name: string } & HolderTotals;

/** One row per holder: مدين, دائن, then what is left: a debit balance or dues (مستحقات). */
function HolderList({ rows, onOpen, currency }: { rows: HolderRow[]; onOpen: (id: number) => void; currency: 'EGP' | 'USD' }) {
  const columns: Column<HolderRow>[] = [
    { header: 'الاسم', cell: (r) => <span className="font-semibold">{r.name}</span> },
    { header: 'عهد مفتوحة', cell: (r) => (r.openCustodies ? <Badge tone="gold">{r.openCustodies}</Badge> : <span className="text-muted">—</span>) },
    { header: 'عدد الحركات', cell: (r) => r.movements },
    { header: 'مدين', cell: (r) => <span dir="ltr">{money(r.debit, currency)}</span> },
    { header: 'دائن', cell: (r) => <span dir="ltr">{money(r.credit, currency)}</span> },
    {
      header: 'رصيد مدين',
      cell: (r) => (Number(r.balance) > 0 ? <b className="text-warning" dir="ltr">{money(r.balance, currency)}</b> : <span className="text-muted">—</span>),
    },
    {
      header: 'مستحقات',
      cell: (r) => (Number(r.balance) < 0 ? <b className="text-success" dir="ltr">{money(Math.abs(Number(r.balance)), currency)}</b> : <span className="text-muted">—</span>),
    },
    { header: 'آخر حركة', cell: (r) => <span className="whitespace-nowrap">{formatDate(r.lastDate)}</span> },
  ];
  const sum = (k: 'debit' | 'credit') => rows.reduce((s, r) => s + Number(r[k]), 0);
  const owed = rows.reduce((s, r) => s + Math.max(0, Number(r.balance)), 0);
  const dues = rows.reduce((s, r) => s + Math.max(0, -Number(r.balance)), 0);
  return (
    <div className="space-y-3">
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="مفيش حركات لسه" onRowClick={(r) => onOpen(r.id)} />
      {rows.length > 1 && (
        <div className="card grid gap-3 p-4 text-sm sm:grid-cols-4">
          <div>
            مدين: <b dir="ltr">{money(sum('debit'), currency)}</b>
          </div>
          <div>
            دائن: <b dir="ltr">{money(sum('credit'), currency)}</b>
          </div>
          <div>
            رصيد مدين: <b className="text-warning" dir="ltr">{money(owed, currency)}</b>
          </div>
          <div>
            مستحقات: <b className="text-success" dir="ltr">{money(dues, currency)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

function StatementDrawer({ kind, id, onClose }: { kind: Tab | null; id: number | null; onClose: () => void }) {
  const { data, error } = useStatement(kind, id);
  return (
    <Drawer open={!!kind} onClose={onClose} width="max-w-4xl" title={data ? `كشف حساب ${data.holder.name}` : 'كشف الحساب'}>
      {error ? <ErrorBox error={error} /> : null}
      {!data && !error && <div className="h-40 rounded-2xl shimmer" />}
      {data && (
        <div className="space-y-6">
          <StatementTable statement={data} />
          {kind === 'clearers' && id && <ClearerFeesPanel clearerId={id} />}
        </div>
      )}
    </Drawer>
  );
}

/** A clearer's own statement (their account sees nothing else). */
function MyStatement() {
  const { data, error } = useStatement('me', null);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <div className="h-40 rounded-2xl shimmer" />;
  return <StatementTable statement={data} />;
}

export default function LedgersPage() {
  const { can } = useAuth();
  const all = can('finance.ledgers.view');
  const { data, error } = useHolders(all);
  const [tab, setTab] = useState<Tab>('clearers');
  const [open, setOpen] = useState<{ kind: Tab; id: number | null } | null>(null);

  if (!all) {
    return (
      <>
        <PageHeader title="كشف حسابي" />
        <MyStatement />
      </>
    );
  }

  return (
    <>
      <PageHeader title="كشوف الحساب" />
      <div className="mb-4">
        <FormTabs
          tabs={[
            { key: 'clearers', label: 'المستخلصين', count: data?.clearers.length },
            { key: 'agents', label: 'المندوبين', count: data?.agents.length },
            { key: 'way-out', label: 'إيداع دولاري' },
          ]}
          active={tab}
          onChange={setTab}
          layoutId="ledgers-tab"
        />
      </div>
      {error ? <ErrorBox error={error} /> : null}
      {!data && !error && <div className="h-40 rounded-2xl shimmer" />}
      {data && tab === 'clearers' && <HolderList rows={data.clearers} currency="EGP" onOpen={(id) => setOpen({ kind: 'clearers', id })} />}
      {data && tab === 'agents' && <HolderList rows={data.agents} currency="EGP" onOpen={(id) => setOpen({ kind: 'agents', id })} />}
      {data && tab === 'way-out' &&
        (data.wayOut ? (
          <HolderList rows={[{ id: 0, name: 'إيداع دولاري', ...data.wayOut }]} currency="USD" onOpen={() => setOpen({ kind: 'way-out', id: null })} />
        ) : (
          <EmptyState compact text="مفيش عهد إيداع دولاري لسه" />
        ))}
      <StatementDrawer kind={open?.kind ?? null} id={open?.id ?? null} onClose={() => setOpen(null)} />
    </>
  );
}
