import { ArrowRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { CURRENCIES, money, STATUS, type Currency } from './api';
import { DocumentDrawers, type OpenDocument } from './DocumentDrawers';
import { PartyMovementDrawer } from './PartyDrawers';
import { balanceSide, PARTY_KINDS, PARTY_MOVEMENT_KINDS, usePartyStatement, type PartyBalance, type StatementLine } from './parties-api';

function BalanceTile({ title, balances }: { title: string; balances: PartyBalance[] }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-xs text-muted">{title}</div>
      {balances.length === 0 ? (
        <div className="mt-1 font-semibold">—</div>
      ) : (
        balances.map((b) => {
          const side = balanceSide(b.balance);
          return (
            <div key={b.currency} className="mt-1 flex items-center justify-between gap-2">
              <b dir="ltr">{money(Math.abs(Number(b.balance)), b.currency)}</b>
              <Badge tone={side.tone}>{side.label}</Badge>
            </div>
          );
        })
      )}
    </div>
  );
}

/** One party's statement: per currency, money from them (دائن) and to them (مدين), with the running balance. */
export default function PartyPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [recording, setRecording] = useState(false);
  const [open, setOpen] = useState<OpenDocument | null>(null);
  const { data, isLoading, error } = usePartyStatement(id, { from: from || undefined, to: to || undefined });

  if (error) return <ErrorBox error={error} />;
  if (isLoading || !data) return <div className="h-60 rounded-2xl shimmer" />;

  const currencies = [...new Set([...data.closing.map((b) => b.currency), ...data.lines.map((l) => l.currency)])];
  const lines = currency ? data.lines.filter((l) => l.currency === currency) : data.lines;

  const columns: Column<StatementLine>[] = [
    { header: 'التاريخ', cell: (l) => <span className="whitespace-nowrap">{formatDate(l.movementDate)}</span> },
    {
      header: 'البيان',
      cell: (l) => (
        <div>
          <div className="font-semibold">{PARTY_MOVEMENT_KINDS[l.kind].label}</div>
          <div className="text-xs text-muted">
            {[l.account.name, l.payee, l.reference && `مرجع ${l.reference}`, l.notes].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    {
      header: 'منه (دائن)',
      cell: (l) => (l.direction === 'IN' ? <span className="text-success" dir="ltr">{money(l.amount, l.currency)}</span> : null),
    },
    {
      header: 'ليه (مدين)',
      cell: (l) => (l.direction === 'OUT' ? <span className="text-danger" dir="ltr">{money(l.amount, l.currency)}</span> : null),
    },
    {
      header: 'الرصيد',
      cell: (l) => {
        const side = balanceSide(l.balance);
        return (
          <div className="whitespace-nowrap">
            <b dir="ltr">{money(Math.abs(Number(l.balance)), l.currency)}</b>
            <div className="text-xs text-muted">{side.label}</div>
          </div>
        );
      },
    },
    { header: 'الحالة', cell: (l) => <Badge tone={STATUS[l.approvalStatus].tone}>{STATUS[l.approvalStatus].label}</Badge> },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/internal-accounts" className="focus-ring grid size-10 place-items-center rounded-xl border border-line text-muted hover:text-gold" aria-label="رجوع للحسابات الداخلية">
            <ArrowRight className="size-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{data.party.name}</h1>
            <div className="text-sm text-muted">
              {PARTY_KINDS[data.party.kind]}
              {!data.party.isActive && ' · موقوفة'}
            </div>
          </div>
        </div>
        {can('finance.parties.record') && data.party.isActive && (
          <Button icon={<Plus className="size-4" />} onClick={() => setRecording(true)}>
            حركة جديدة
          </Button>
        )}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <BalanceTile title={from ? `الرصيد قبل ${formatDate(from)}` : 'رصيد أول المدة'} balances={data.opening} />
        <BalanceTile title={to ? `الرصيد في ${formatDate(to)}` : 'الرصيد دلوقتي'} balances={data.closing} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <TextField label="من" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="w-44">
          <TextField label="إلى" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {currencies.length > 1 && (
          <div className="flex gap-1 rounded-full bg-surface-2 p-1">
            {(['', ...currencies] as (Currency | '')[]).map((c) => (
              <button
                key={c || 'all'}
                type="button"
                onClick={() => setCurrency(c)}
                className={`focus-ring rounded-full px-4 py-2 text-sm ${currency === c ? 'gold-fill font-semibold' : 'text-muted'}`}
              >
                {c ? CURRENCIES[c].label : 'الكل'}
              </button>
            ))}
          </div>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={lines}
        rowKey={(l) => l.id}
        empty="مفيش حركات في الفترة دي"
        onRowClick={(l) => setOpen({ type: 'PARTY', id: l.id })}
      />

      <PartyMovementDrawer movement={null} partyId={data.party.id} open={recording} onClose={() => setRecording(false)} />
      <DocumentDrawers open={open} onClose={() => setOpen(null)} />
    </>
  );
}
