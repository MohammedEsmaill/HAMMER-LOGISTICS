import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { PageHeader } from '@/components/ui/misc';
import { FormTabs } from '../shipments/FormTabs';
import { money } from './api';
import { useHolders, useStatement } from './custody-api';
import { ClearerFeesPanel, StatementTable } from './LedgerDrawers';

type Tab = 'clearers' | 'agents' | 'way-out';

function HolderList({ rows, onOpen, currency }: { rows: { id: number; name: string; balance: string }[]; onOpen: (id: number) => void; currency: 'EGP' | 'USD' }) {
  if (!rows.length) return <p className="py-6 text-center text-muted">مفيش حركات لسه</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => {
        const b = Number(r.balance);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen(r.id)}
            className="card focus-ring space-y-1 p-4 text-start transition-colors hover:border-gold/60"
          >
            <div className="font-bold">{r.name}</div>
            <div className={`text-xl font-bold ${b > 0 ? 'text-warning' : b < 0 ? 'text-success' : 'text-muted'}`} dir="ltr" style={{ textAlign: 'right' }}>
              {money(Math.abs(b), currency)}
            </div>
            <div className="text-xs text-muted">{b > 0 ? 'معاه فلوس للمكتب' : b < 0 ? 'المكتب عليه فلوس له' : 'متسوي'}</div>
          </button>
        );
      })}
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
        <PageHeader title="كشف حسابي" description="العهد اللي استلمتها، وتصفيتها، وأتعابك واللي اتصرف منها." />
        <MyStatement />
      </>
    );
  }

  return (
    <>
      <PageHeader title="كشوف الحساب" description="كشوف المستخلصين والمندوبين وWAY OUT، متبنية من العهد والتصفيات والأتعاب نفسها." />
      <div className="mb-4">
        <FormTabs
          tabs={[
            { key: 'clearers', label: 'المستخلصين', count: data?.clearers.length },
            { key: 'agents', label: 'المندوبين', count: data?.agents.length },
            { key: 'way-out', label: 'WAY OUT' },
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
          <HolderList rows={[{ id: 0, name: 'WAY OUT', balance: data.wayOut.balance }]} currency="USD" onOpen={() => setOpen({ kind: 'way-out', id: null })} />
        ) : (
          <p className="py-6 text-center text-muted">مفيش عهد WAY OUT لسه</p>
        ))}
      <StatementDrawer kind={open?.kind ?? null} id={open?.id ?? null} onClose={() => setOpen(null)} />
    </>
  );
}
