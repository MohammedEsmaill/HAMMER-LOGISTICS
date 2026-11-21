import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { api } from '@/lib/api-client';
import { useAction } from '@/lib/mutations';
import { NAV } from '@/layout/nav';
import { financeKeys, money, type Currency, type DocType } from '@/features/finance/api';
import { DocumentDrawers, type OpenDocument } from '@/features/finance/DocumentDrawers';
import { balanceSide, PARTY_KINDS, type PartyBalance, type PartyKind } from '@/features/finance/parties-api';

type Tone = 'gold' | 'info' | 'warning' | 'danger' | 'success' | 'muted';

interface Kpi {
  key: string;
  label: string;
  value: string | number;
  currency?: Currency;
  hint?: { text: string; tone: Tone };
  link: string;
}

interface Dashboard {
  generatedAt: string;
  kpis: Kpi[];
  followUp?: { id: number; fileNo: string; client: string; stage: string; operation: string; flag: { text: string; tone: Tone } }[];
  approvals?: {
    type: DocType;
    typeLabel: string;
    id: number;
    version: number;
    amount: string;
    currency: Currency;
    createdBy: { email: string };
    action: string | null;
  }[];
  custodiesToSettle?: { id: number; custodyNo: string; holder: string; fileNo: string; amount: string; currency: Currency; days: number }[];
  readyToFinish?: { id: number; fileNo: string; client: string; mine: boolean }[];
  receivables?: { client: { id: number; name: string }; balance: string; oldestDays: number | null }[];
  treasury?: { date: string; in: string; out: string }[];
  parties?: { id: number; name: string; kind: PartyKind; balances: PartyBalance[] }[];
  expiringDocuments?: { id: number; type: string; client: { id: number; name: string }; factory: string | null; days: number }[];
  ownLedger?: { totals: { balance: string }; lines: { date: string; description: string; fileNo: string | null; debit: string; credit: string }[] };
}

const dashboardKey = ['dashboard'] as const;
/** Read again every five minutes, and on every reload. */
const REFRESH = 5 * 60_000;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 18) return 'مساء الخير';
  return 'مساء النور';
}

const today = () =>
  new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 1 ? 'دلوقتي' : min === 1 ? 'من دقيقة' : `من ${min} دقايق`;
};

function Panel({ title, action, children, className = '' }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card overflow-hidden p-0 ${className}`}>
      <div className="flex items-center gap-2 px-4 py-3">
        <h2 className="flex-1 text-[15px] font-bold">{title}</h2>
        {action}
      </div>
      <div className="border-t border-line">{children}</div>
    </section>
  );
}

const Row = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
  <div
    className={`flex items-center gap-3 border-b border-line px-4 py-2.5 text-sm last:border-b-0 ${onClick ? 'cursor-pointer hover:bg-gold/5' : ''}`}
    onClick={onClick}
    onKeyDown={(e) => onClick && e.key === 'Enter' && onClick()}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
  >
    {children}
  </div>
);

const Empty = ({ text }: { text: string }) => <p className="px-4 py-6 text-center text-sm text-muted">{text}</p>;

function Kpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {kpis.map((k, i) => (
        <motion.div key={k.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
          <Link to={k.link} className="card focus-ring flex h-full flex-col gap-1 p-4 transition-colors hover:border-gold/50">
            <span className="text-xs text-muted">{k.label}</span>
            <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
              <b className={`whitespace-nowrap tracking-tight ${k.currency ? 'text-xl' : 'text-2xl'}`} dir="ltr">
                {k.currency ? money(k.value, k.currency) : k.value}
              </b>
              {k.hint && (
                <span dir={k.currency ? 'ltr' : undefined}>
                  <Badge tone={k.hint.tone}>{k.hint.text}</Badge>
                </span>
              )}
            </div>
          </Link>
        </motion.div>
      ))}
    </section>
  );
}

function ApprovalQueue({ items, onOpen }: { items: NonNullable<Dashboard['approvals']>; onOpen: (d: OpenDocument) => void }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const keyOf = (i: { type: string; id: number }) => `${i.type}-${i.id}`;
  const bulk = useAction(
    () =>
      api.post<{ done: number; failed: number; results: { ok: boolean; error?: string }[] }>('/finance/approvals/bulk', {
        items: items.filter((i) => picked.has(keyOf(i))).map(({ type, id, version }) => ({ type, id, version })),
      }),
    { invalidate: [dashboardKey, financeKeys.all] },
  );
  const toggle = (k: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <Panel
      title="طابور الاعتماد"
      action={
        <Button
          className="h-8 px-3 text-xs"
          disabled={picked.size === 0}
          loading={bulk.isPending}
          onClick={() => bulk.mutateAsync(undefined).then(() => setPicked(new Set()), () => undefined)}
        >
          اعتمد المختار{picked.size ? ` (${picked.size})` : ''}
        </Button>
      }
    >
      {items.length === 0 && <Empty text="مفيش حاجة مستنية دورك" />}
      {items.map((i) => (
        <Row key={keyOf(i)}>
          <input
            type="checkbox"
            className="size-4 accent-[var(--gold-2)]"
            aria-label={`اختيار ${i.typeLabel} ${i.id}`}
            checked={picked.has(keyOf(i))}
            onChange={() => toggle(keyOf(i))}
          />
          <button type="button" className="focus-ring min-w-0 flex-1 truncate text-start hover:text-gold" onClick={() => onOpen({ type: i.type, id: i.id })}>
            {i.typeLabel} #{i.id} <span className="text-xs text-muted">· {i.createdBy.email.split('@')[0]}</span>
          </button>
          <Badge tone={i.action === 'review' ? 'muted' : 'gold'}>{i.action === 'review' ? 'مراجعة' : 'اعتماد'}</Badge>
          <b dir="ltr">{money(i.amount, i.currency)}</b>
        </Row>
      ))}
      {bulk.data && bulk.data.failed > 0 && (
        <p className="px-4 py-2 text-xs text-danger">
          اتعتمد {bulk.data.done}، وفيه {bulk.data.failed} معرفتش: {bulk.data.results.find((r) => !r.ok)?.error}
        </p>
      )}
    </Panel>
  );
}

function Treasury({ days }: { days: NonNullable<Dashboard['treasury']> }) {
  const net = days.map((d) => Number(d.in) - Number(d.out));
  const max = Math.max(1, ...net.map(Math.abs));
  return (
    <Panel title="حركة الخزنة آخر 14 يوم (جنيه)" className="lg:col-span-2">
      <div className="grid h-40 grid-cols-14 items-center gap-1.5 px-4 py-3" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
        {days.map((d, i) => {
          const h = (Math.abs(net[i]) / max) * 50;
          const last = i === days.length - 1;
          return (
            <div key={d.date} className="relative h-full" title={`${d.date}: وارد ${money(d.in)} · منصرف ${money(d.out)}`}>
              <div
                className={`absolute inset-x-0 rounded-sm ${last ? 'bg-gold' : net[i] >= 0 ? 'bg-success/50' : 'bg-danger/50'}`}
                style={net[i] >= 0 ? { bottom: '50%', height: `${Math.max(h, 1)}%` } : { top: '50%', height: `${Math.max(h, 1)}%` }}
              />
            </div>
          );
        })}
      </div>
      <p className="px-4 pb-3 text-xs text-muted">الصافي لكل يوم (وارد ناقص منصرف)، من غير التحويلات بين حساباتنا. آخر عمود النهارده.</p>
    </Panel>
  );
}

/**
 * Each user's home: the figures and lists of their own work only, built from their
 * permissions on the server, read again every five minutes.
 */
export default function HomePage() {
  const { user, canAny } = useAuth();
  const [open, setOpen] = useState<OpenDocument | null>(null);
  const { data, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: dashboardKey,
    queryFn: () => api.get<Dashboard>('/dashboard'),
    refetchInterval: REFRESH,
  });
  const shortcuts = NAV.filter((n) => n.to !== '/' && canAny(...n.any));
  const hasLists = !!data && ['followUp', 'approvals', 'custodiesToSettle', 'readyToFinish', 'receivables', 'treasury', 'parties', 'expiringDocuments', 'ownLedger'].some((k) => k in data);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <p className="text-sm text-muted">
            {greeting()}، {user?.name}
          </p>
          <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        </div>
        <span className="text-sm text-muted">
          {today()}
          {data && ` · آخر تحديث ${ago(data.generatedAt)}`}
        </span>
        <Button variant="ghost" className="h-9 px-3 text-sm" icon={<RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />} onClick={() => refetch()}>
          تحديث
        </Button>
      </div>

      {error ? <ErrorBox error={error} /> : null}
      {isLoading && <div className="h-32 rounded-2xl shimmer" />}
      {data && data.kpis.length > 0 && <Kpis kpis={data.kpis} />}

      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          {data.followUp && (
            <Panel title="محتاجة متابعة" className="lg:col-span-2" action={<Link to="/shipments" className="text-xs text-gold">كل الشحنات</Link>}>
              {data.followUp.length === 0 && <Empty text="مفيش شحنات محتاجة متابعة دلوقتي" />}
              {data.followUp.map((s) => (
                <Row key={s.id}>
                  <Link to={`/shipments/${s.id}`} className="w-28 font-bold hover:text-gold" dir="ltr" style={{ textAlign: 'right' }}>
                    {s.fileNo}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">
                    {s.client} · <span className="text-muted">{s.stage}</span>
                  </span>
                  <Badge tone={s.flag.tone}>{s.flag.text}</Badge>
                  <span className="hidden text-xs text-muted sm:inline">{s.operation}</span>
                </Row>
              ))}
            </Panel>
          )}

          {data.approvals && <ApprovalQueue items={data.approvals} onOpen={setOpen} />}

          {data.custodiesToSettle && (
            <Panel title="عهد محتاجة تصفية" action={<Link to="/custodies" className="text-xs text-gold">العهد</Link>}>
              {data.custodiesToSettle.length === 0 && <Empty text="كل العهد اتصفّت" />}
              {data.custodiesToSettle.map((c) => (
                <Row key={c.id} onClick={() => setOpen({ type: 'CUSTODY', id: c.id })}>
                  <b dir="ltr" className="w-24" style={{ textAlign: 'right' }}>
                    {c.custodyNo}
                  </b>
                  <span className="min-w-0 flex-1 truncate">
                    {c.holder} · <span className="text-muted" dir="ltr">{c.fileNo}</span>
                  </span>
                  <Badge tone={c.days >= 5 ? 'danger' : 'muted'}>{c.days === 0 ? 'النهارده' : `${c.days} يوم`}</Badge>
                  <b dir="ltr">{money(c.amount, c.currency)}</b>
                </Row>
              ))}
            </Panel>
          )}

          {data.readyToFinish && (
            <Panel title="حسابات جاهزة للإنهاء" action={<Link to="/shipment-accounts" className="text-xs text-gold">حسابات الشحنات</Link>}>
              {data.readyToFinish.length === 0 && <Empty text="مفيش حسابات جاهزة" />}
              {data.readyToFinish.map((s) => (
                <Row key={s.id}>
                  <Link to={`/shipment-accounts/${s.id}`} className="w-28 font-bold hover:text-gold" dir="ltr" style={{ textAlign: 'right' }}>
                    {s.fileNo}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">{s.client}</span>
                  {s.mine && <Badge tone="gold">عميلك</Badge>}
                </Row>
              ))}
            </Panel>
          )}

          {data.receivables && (
            <Panel title="أكبر مديونيات العملاء" action={<Link to="/client-ledgers" className="text-xs text-gold">حسابات العملاء</Link>}>
              {data.receivables.length === 0 && <Empty text="مفيش مديونيات" />}
              {data.receivables.map((r) => (
                <Row key={r.client.id}>
                  <Link to={`/client-ledgers/${r.client.id}`} className="min-w-0 flex-1 truncate hover:text-gold">
                    {r.client.name}
                  </Link>
                  {r.oldestDays !== null && <Badge tone={r.oldestDays > 60 ? 'danger' : r.oldestDays > 30 ? 'warning' : 'muted'}>{r.oldestDays} يوم</Badge>}
                  <b dir="ltr">{money(r.balance, 'EGP')}</b>
                </Row>
              ))}
            </Panel>
          )}

          {data.treasury && <Treasury days={data.treasury} />}

          {data.parties && data.parties.length > 0 && (
            <Panel title="الحسابات الداخلية" action={<Link to="/internal-accounts" className="text-xs text-gold">التفاصيل</Link>}>
              {data.parties.map((p) => (
                <Row key={p.id}>
                  <Link to={`/internal-accounts/${p.id}`} className="min-w-0 flex-1 truncate hover:text-gold">
                    {p.name} <span className="text-xs text-muted">· {PARTY_KINDS[p.kind]}</span>
                  </Link>
                  {p.balances.map((b) => (
                    <span key={b.currency} className="flex items-center gap-1.5">
                      <b dir="ltr">{money(Math.abs(Number(b.balance)), b.currency)}</b>
                      <Badge tone={balanceSide(b.balance).tone}>{balanceSide(b.balance).label}</Badge>
                    </span>
                  ))}
                </Row>
              ))}
            </Panel>
          )}

          {data.expiringDocuments && (
            <Panel title="مستندات قربت تنتهي" action={<Link to="/documents" className="text-xs text-gold">مركز المستندات</Link>}>
              {data.expiringDocuments.length === 0 && <Empty text="كل المستندات سارية" />}
              {data.expiringDocuments.map((d) => (
                <Row key={d.id}>
                  <span className="min-w-0 flex-1 truncate">
                    {d.type} · <span className="text-muted">{d.factory ?? d.client.name}</span>
                  </span>
                  <Badge tone={d.days < 0 ? 'danger' : d.days <= 7 ? 'warning' : 'muted'}>{d.days < 0 ? `منتهي من ${-d.days} يوم` : d.days === 0 ? 'بينتهي النهارده' : `باقي ${d.days} يوم`}</Badge>
                </Row>
              ))}
            </Panel>
          )}

          {data.ownLedger && (
            <Panel title="كشف حسابي" className="lg:col-span-2" action={<Link to="/ledgers" className="text-xs text-gold">الكشف كله</Link>}>
              <Row>
                <span className="flex-1 text-muted">الرصيد</span>
                <b dir="ltr">{money(Math.abs(Number(data.ownLedger.totals.balance)), 'EGP')}</b>
                <Badge tone={Number(data.ownLedger.totals.balance) > 0 ? 'danger' : 'success'}>{Number(data.ownLedger.totals.balance) > 0 ? 'عليك' : 'ليك'}</Badge>
              </Row>
              {data.ownLedger.lines.map((l, i) => (
                <Row key={i}>
                  <span className="min-w-0 flex-1 truncate">
                    {l.description}
                    {l.fileNo && <span className="text-muted"> · {l.fileNo}</span>}
                  </span>
                  <b dir="ltr" className={Number(l.debit) > 0 ? 'text-danger' : 'text-success'}>
                    {money(Number(l.debit) > 0 ? l.debit : l.credit, 'EGP')}
                  </b>
                </Row>
              ))}
            </Panel>
          )}
        </div>
      )}

      {data && !hasLists && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="card focus-ring group flex items-center gap-4 p-5 transition-colors hover:border-gold/50">
              <span className="grid size-12 place-items-center rounded-xl bg-gold/10 text-gold">
                <Icon className="size-6" />
              </span>
              <span className="flex-1 font-semibold">{label}</span>
              <ArrowLeft className="size-5 text-muted transition-transform group-hover:-translate-x-1 group-hover:text-gold" />
            </Link>
          ))}
        </div>
      )}

      <DocumentDrawers open={open} onClose={() => setOpen(null)} />
    </div>
  );
}
