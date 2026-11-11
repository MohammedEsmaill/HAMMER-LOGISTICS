import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FileText, Lock, Plus, RotateCcw, Trash2, Unlock, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton } from '@/components/ui/misc';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { toastError } from '@/lib/mutations';
import { FormTabs } from '../shipments/FormTabs';
import { accountApi, accountKeys, PAYMENT_STATUS, useShipmentAccount, type Collection, type DraftLine, type ShipmentAccountView } from './account-api';
import { CollectionDrawer, FinishDrawer, ReopenDrawer } from './AccountActionDrawers';
import { CURRENCIES, financeKeys, money, STATUS, type Currency } from './api';
import { CustodyDrawer } from './CustodyDrawers';

type Tab = 'statement' | 'expenses' | 'invoices' | 'collections';

function useApply(shipmentId: number) {
  const queryClient = useQueryClient();
  return async (fn: () => Promise<ShipmentAccountView>) => {
    try {
      const v = await fn();
      queryClient.setQueryData(accountKeys.one(shipmentId), v);
      void queryClient.invalidateQueries({ queryKey: [...financeKeys.all, 'shipment-accounts'] });
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };
}

/** One client statement line: include / exclude, re-word, re-price; the actual amount stays beside it. */
function LineRow({ line, editable, shipmentId }: { line: DraftLine; editable: boolean; shipmentId: number }) {
  const apply = useApply(shipmentId);
  const [description, setDescription] = useState(line.description);
  const [amount, setAmount] = useState(line.amount);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDescription(line.description);
    setAmount(line.amount);
  }, [line.description, line.amount]);
  const changed = description !== line.description || Number(amount) !== Number(line.amount);
  const run = async (fn: () => Promise<ShipmentAccountView>) => {
    setBusy(true);
    await apply(fn);
    setBusy(false);
  };

  return (
    <tr className={`border-t border-line ${line.excluded ? 'opacity-45' : ''}`}>
      <td className="px-2 py-2">
        {line.source === 'ITEM' ? (
          <input
            type="checkbox"
            aria-label="يظهر للعميل"
            checked={!line.excluded}
            disabled={!editable || busy}
            onChange={(e) => run(() => accountApi.override(line.id, { excluded: !e.target.checked }))}
            className="size-4 accent-[var(--gold)]"
          />
        ) : (
          <Badge tone="gold">إضافي</Badge>
        )}
      </td>
      <td className="px-2 py-2">
        {editable && !line.excluded ? (
          <input
            dir="ltr"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-surface-2 px-2 text-sm outline-none focus:border-gold"
            disabled={line.source === 'EXTRA'}
          />
        ) : (
          <span dir="ltr" className={line.excluded ? 'line-through' : ''}>
            {line.description}
          </span>
        )}
        {line.source === 'ITEM' && (
          <div className="text-xs text-muted">
            {line.expenseType} · {line.custodyNo}
          </div>
        )}
      </td>
      <td className="w-32 px-2 py-2">
        {editable && !line.excluded && line.source === 'ITEM' ? (
          <input
            type="number"
            step="0.01"
            min="0.01"
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-surface-2 px-2 text-sm outline-none focus:border-gold"
          />
        ) : (
          <b dir="ltr">{money(line.amount)}</b>
        )}
      </td>
      <td className="px-2 py-2 text-sm text-muted" dir="ltr">
        {line.actualAmount !== undefined && Number(line.actualAmount) !== Number(line.amount) ? money(line.actualAmount) : ''}
      </td>
      <td className="w-0 px-2 py-2 whitespace-nowrap">
        {editable && changed && line.source === 'ITEM' && (
          <Button
            className="h-8 px-3 text-xs"
            loading={busy}
            onClick={() => {
              if (!(Number(amount) > 0)) return toastError(new Error('المبلغ لازم يكون أكبر من صفر'));
              void run(() => accountApi.override(line.id, { description: description.trim(), amount: Number(amount) }));
            }}
          >
            حفظ
          </Button>
        )}
        {editable && line.source === 'ITEM' && line.overridden && !line.excluded && !changed && (
          <IconButton label="رجّع زي المصروف" onClick={() => run(() => accountApi.override(line.id, { description: null, amount: null }))}>
            <RotateCcw className="size-4" />
          </IconButton>
        )}
        {editable && line.source === 'EXTRA' && (
          <IconButton label="شيل البند" tone="danger" onClick={() => run(() => accountApi.removeExtra(line.id))}>
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </td>
    </tr>
  );
}

function StatementTab({ view, editable }: { view: ShipmentAccountView; editable: boolean }) {
  const apply = useApply(view.shipment.id);
  const [adding, setAdding] = useState<Currency | null>(null);
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  return (
    <div className="space-y-6">
      {!editable && view.account.status === 'FINISHED' && (
        <p className="flex items-center gap-2 rounded-xl bg-surface-2 p-3 text-sm text-muted">
          <Lock className="size-4" /> الكشف مقفول. الفواتير اتطلعت منه، وأي تعديل محتاج إعادة فتح الحساب.
        </p>
      )}
      {(['EGP', 'USD'] as Currency[]).map((c) => {
        const d = view.draft[c];
        if (!d.lines.length && adding !== c && !editable) return null;
        return (
          <section key={c} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-gold">كشف العميل بال{CURRENCIES[c].label}</h3>
              <div className="text-sm">
                للعميل <b dir="ltr" className="text-gold">{money(d.total, c)}</b>
                <span className="text-muted"> · المصروف الفعلي {money(d.actualTotal, c)}</span>
              </div>
            </div>
            {d.lines.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      <th className="w-10 px-2 py-2" />
                      <th className="px-2 py-2 text-start font-medium">السطر في الكشف</th>
                      <th className="px-2 py-2 text-start font-medium">المبلغ للعميل</th>
                      <th className="px-2 py-2 text-start font-medium">الفعلي</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.lines.map((l) => (
                      <LineRow key={`${l.source}-${l.id}`} line={l} editable={editable} shipmentId={view.shipment.id} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {editable &&
              (adding === c ? (
                <div className="grid items-end gap-2 rounded-xl border border-dashed border-gold/40 p-3 sm:grid-cols-[1fr_9rem_auto_auto]">
                  <TextField label="الوصف" value={desc} onChange={(e) => setDesc(e.target.value)} />
                  <TextField label="المبلغ" type="number" step="0.01" min="0.01" dir="ltr" value={amt} onChange={(e) => setAmt(e.target.value)} />
                  <Button
                    onClick={async () => {
                      if (desc.trim().length < 2 || !(Number(amt) > 0)) return toastError(new Error('اكتب الوصف والمبلغ'));
                      if (await apply(() => accountApi.addExtra(view.shipment.id, { currency: c, description: desc.trim(), amount: Number(amt) }))) {
                        setAdding(null);
                        setDesc('');
                        setAmt('');
                      }
                    }}
                  >
                    إضافة
                  </Button>
                  <Button variant="ghost" onClick={() => setAdding(null)}>
                    إلغاء
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" className="h-9 px-3 text-sm" icon={<Plus className="size-4" />} onClick={() => setAdding(c)}>
                  بند مش من العهد ({CURRENCIES[c].label})
                </Button>
              ))}
          </section>
        );
      })}
    </div>
  );
}

function ExpensesTab({ view, onOpen }: { view: ShipmentAccountView; onOpen: (id: number) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {view.custodies.map((c) => (
          <button key={c.id} type="button" onClick={() => onOpen(c.id)} className="flex items-center gap-3 rounded-xl border border-line p-3 text-start hover:border-gold/50">
            <div className="flex-1">
              <div className="font-bold" dir="ltr" style={{ textAlign: 'right' }}>
                {c.custodyNo}
              </div>
              <div className="text-xs text-muted">{c.status === 'OPEN' ? 'مفتوحة' : `اتصرف ${money(c.spentAmount, c.currency)}`}</div>
            </div>
            {c.status === 'OPEN' ? <Badge tone="gold">مفتوحة</Badge> : <Badge tone={STATUS[c.approvalStatus].tone}>{STATUS[c.approvalStatus].label}</Badge>}
          </button>
        ))}
        {view.custodies.length === 0 && <EmptyState compact text="مفيش عهد على الشحنة." />}
      </div>
      {view.clearerFee && (
        <p className="rounded-xl bg-surface-2 p-3 text-sm">
          أتعاب المستخلص ({view.clearerFee.clearer.fullName}): <b dir="ltr">{money(view.clearerFee.amount, 'EGP')}</b>
          <span className="text-muted"> · مصروف على المكتب، مش بتظهر في كشف العميل</span>
        </p>
      )}
    </div>
  );
}

function InvoicesTab({ view }: { view: ShipmentAccountView }) {
  if (!view.invoices.length) return <p className="py-6 text-center text-muted">الفواتير بتطلع لما الحساب يتنهي.</p>;
  return (
    <div className="space-y-2">
      {view.invoices.map((i) => (
        <Link
          key={i.id}
          to={`/print/invoices/${i.id}`}
          className={`flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 hover:border-gold/50 ${i.voidedAt ? 'opacity-55' : ''}`}
        >
          <FileText className="size-5 text-gold" />
          <div className="min-w-40 flex-1">
            <div className="font-bold">
              {i.type} <span dir="ltr">{i.invoiceNo}</span>
            </div>
            <div className="text-xs text-muted">
              {formatDate(i.invoiceDate)}
              {i.voidedAt && ` · اتلغت ${formatDate(i.voidedAt)}`}
            </div>
          </div>
          <b dir="ltr">{money(i.total, i.currency)}</b>
          {i.voidedAt ? <Badge tone="danger">ملغية</Badge> : <Badge tone={STATUS[i.approvalStatus].tone}>{i.approvalStatus === 'APPROVED' ? 'APPROVED' : `DRAFT · ${STATUS[i.approvalStatus].label}`}</Badge>}
        </Link>
      ))}
    </div>
  );
}

function CollectionsTab({ view, onOpen }: { view: ShipmentAccountView; onOpen: (c: Collection) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {view.totals
          .filter((t) => Number(t.billed) > 0 || Number(t.collected) > 0)
          .map((t) => (
            <div key={t.currency} className="space-y-1 rounded-xl bg-surface-2 p-3 text-sm">
              <div className="font-semibold">{CURRENCIES[t.currency].label}</div>
              <div className="flex justify-between">
                <span className="text-muted">الفواتير</span>
                <span dir="ltr">{money(t.billed, t.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">اتحصّل</span>
                <span dir="ltr" className="text-success">
                  {money(t.collected, t.currency)}
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span>المتبقي</span>
                <span dir="ltr" className={Number(t.outstanding) > 0 ? 'text-warning' : ''}>
                  {money(t.outstanding, t.currency)}
                </span>
              </div>
            </div>
          ))}
      </div>
      {view.collections.map((c) => (
        <button key={c.id} type="button" onClick={() => onOpen(c)} className="flex w-full items-center gap-3 rounded-xl border border-line p-3 text-start hover:border-gold/50">
          <Wallet className="size-5 text-success" />
          <div className="flex-1">
            <div className="font-semibold">
              {c.method === 'CASH' ? 'كاش' : 'تحويل'} · {c.account.name}
            </div>
            <div className="text-xs text-muted">
              {formatDate(c.collectionDate)}
              {c.reference && ` · ${c.reference}`}
              {c.notes && ` · ${c.notes}`}
            </div>
          </div>
          <b dir="ltr">{money(c.amount, c.currency)}</b>
          <Badge tone={STATUS[c.approvalStatus].tone}>{STATUS[c.approvalStatus].label}</Badge>
        </button>
      ))}
      {view.collections.length === 0 && <EmptyState compact text="مفيش تحصيل لسه." />}
    </div>
  );
}

export default function ShipmentAccountPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const { data: view, error, isLoading } = useShipmentAccount(id);
  const [tab, setTab] = useState<Tab>('statement');
  const [finishing, setFinishing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [custodyId, setCustodyId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center text-gold">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (error || !view) return <ErrorBox error={error} />;

  const open = view.account.status === 'OPEN';
  const editable = open && can('finance.statement.manage');
  const pay = PAYMENT_STATUS[view.account.paymentStatus];
  const canReopen = !open && (view.account.paymentStatus === 'UNPAID' ? can('finance.statement.manage') : can('finance.collections.manage'));
  const owes = view.totals.some((t) => Number(t.outstanding) > 0);

  return (
    <div className="space-y-5">
      <Link to="/shipment-accounts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-gold">
        <ArrowRight className="size-4" /> حسابات الشحنات
      </Link>
      <header className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">
            حساب <span dir="ltr">{view.shipment.fileNo}</span>
          </h1>
          <div className="text-sm text-muted">
            {view.shipment.client.name} · {view.shipment.commodity}
            {view.shipment.certificateNo ? ` · شهادة ${view.shipment.certificateNo}` : ' · من غير رقم شهادة'}
          </div>
        </div>
        <Badge tone={open ? 'gold' : 'success'}>{open ? 'مفتوح' : `منتهي ${formatDate(view.account.finishedAt)}`}</Badge>
        <Badge tone={pay.tone}>{pay.label}</Badge>
        <Link to={`/shipments/${view.shipment.id}`} className="text-sm text-gold hover:underline">
          ملف الشحنة
        </Link>
        {open && can('finance.statement.manage') && (
          <Button icon={<Lock className="size-4" />} onClick={() => setFinishing(true)}>
            إنهاء
          </Button>
        )}
        {canReopen && (
          <Button variant="ghost" icon={<Unlock className="size-4" />} onClick={() => setReopening(true)}>
            إعادة فتح
          </Button>
        )}
        {!open && owes && can('finance.collections.manage') && (
          <Button icon={<Wallet className="size-4" />} onClick={() => setCollecting(true)}>
            تحصيل
          </Button>
        )}
      </header>

      {open && view.openCustodies.length > 0 && (
        <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">عهد لسه ما اتصفتش (الإنهاء مستنيها): {view.openCustodies.join('، ')}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {view.totals.map((t) => (
          <div key={t.currency} className="rounded-xl bg-surface-2 p-3 text-sm sm:col-span-2">
            <div className="mb-1 font-semibold">{CURRENCIES[t.currency].label}</div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-xs text-muted">الفعلي</div>
                <b dir="ltr">{money(t.actual)}</b>
              </div>
              <div>
                <div className="text-xs text-muted">كشف العميل</div>
                <b dir="ltr">{money(t.statement)}</b>
              </div>
              <div>
                <div className="text-xs text-muted">الفرق</div>
                <b dir="ltr" className={Number(t.statement) - Number(t.actual) < 0 ? 'text-danger' : 'text-success'}>
                  {money(Number(t.statement) - Number(t.actual))}
                </b>
              </div>
            </div>
          </div>
        ))}
      </div>

      <FormTabs
        tabs={[
          { key: 'statement', label: 'كشف العميل' },
          { key: 'expenses', label: 'مصروفات الشحنة', count: view.custodies.length },
          { key: 'invoices', label: 'الفواتير', count: view.invoices.filter((i) => !i.voidedAt).length },
          { key: 'collections', label: 'التحصيل', count: view.collections.length },
        ]}
        active={tab}
        onChange={setTab}
        layoutId="account-tab"
      />
      <div className="card p-5">
        {tab === 'statement' && <StatementTab view={view} editable={editable} />}
        {tab === 'expenses' && <ExpensesTab view={view} onOpen={setCustodyId} />}
        {tab === 'invoices' && <InvoicesTab view={view} />}
        {tab === 'collections' && <CollectionsTab view={view} onOpen={setCollection} />}
      </div>

      <FinishDrawer view={view} open={finishing} onClose={() => setFinishing(false)} />
      <ReopenDrawer view={view} open={reopening} onClose={() => setReopening(false)} />
      <CollectionDrawer view={view} collection={null} open={collecting} onClose={() => setCollecting(false)} />
      <CollectionDrawer view={view} collection={collection} open={!!collection} onClose={() => setCollection(null)} />
      <CustodyDrawer custodyId={custodyId} onClose={() => setCustodyId(null)} />
    </div>
  );
}
