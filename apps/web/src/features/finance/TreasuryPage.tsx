import { ArrowLeftRight, Banknote, Landmark, Pencil, Plus, Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SelectField } from '@/components/ui/SelectField';
import { formatDate } from '@/lib/format';
import { FormTabs } from '../shipments/FormTabs';
import { AccountDrawer, LedgerDrawer } from './AccountDrawers';
import {
  CURRENCIES,
  money,
  OTHER_KINDS,
  STATUS,
  useAccounts,
  useDocument,
  useOtherMovements,
  useTransfers,
  type ApprovalStatus,
  type Currency,
  type MoneyAccount,
  type MovementsQuery,
  type OtherMovement,
  type Transfer,
} from './api';
import { OtherDrawer, TransferDrawer } from './MovementDrawers';

function AccountCard({ account, onOpen, onEdit, index }: { account: MoneyAccount; onOpen: () => void; onEdit?: () => void; index: number }) {
  const Icon = account.type === 'CASH' ? Wallet : Landmark;
  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ y: -3 }}
      className={`card focus-ring relative cursor-pointer space-y-3 overflow-hidden p-4 ${account.isActive ? '' : 'opacity-60'}`}
    >
      {account.type === 'CASH' && <div className="pointer-events-none absolute -top-10 -left-10 size-32 rounded-full bg-gold/10 blur-2xl" />}
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${account.type === 'CASH' ? 'gold-fill' : 'bg-gold/10 text-gold'}`}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{account.name}</div>
          <div className="truncate text-xs text-muted" dir={account.accountNumber ? 'ltr' : undefined} style={{ textAlign: 'right' }}>
            {account.type === 'CASH' ? 'خزنة' : `${account.bankName} · ${account.accountNumber}`}
          </div>
        </div>
        {!account.isActive && <Badge tone="muted">موقوف</Badge>}
        {onEdit && (
          <IconButton label={`تعديل ${account.name}`} onClick={onEdit}>
            <Pencil className="size-4" />
          </IconButton>
        )}
      </div>
      <div className="text-2xl font-bold tracking-tight" dir="ltr" style={{ textAlign: 'right' }}>
        {money(account.balance, account.currency)}
      </div>
    </motion.div>
  );
}

const STATUS_OPTIONS = Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }));

function TransfersList({ accounts, onOpen }: { accounts: MoneyAccount[]; onOpen: (t: Transfer) => void }) {
  const [q, setQ] = useState<MovementsQuery>({ page: 1, status: '', accountId: '' });
  const { data, isLoading, error } = useTransfers(q);
  const columns: Column<Transfer>[] = [
    { header: '#', className: 'w-0', cell: (t) => t.id },
    { header: 'التاريخ', cell: (t) => <span className="whitespace-nowrap">{formatDate(t.transferDate)}</span> },
    {
      header: 'من ← إلى',
      cell: (t) => (
        <span className="text-sm">
          {t.fromAccount.name} <span className="text-gold">←</span> {t.toAccount.name}
        </span>
      ),
    },
    { header: 'المبلغ', cell: (t) => <b dir="ltr">{money(t.amount, t.currency)}</b> },
    { header: 'الشيك', cell: (t) => <span dir="ltr">{t.chequeNo ?? '—'}</span> },
    { header: 'الحالة', cell: (t) => <Badge tone={STATUS[t.approvalStatus].tone}>{STATUS[t.approvalStatus].label}</Badge> },
  ];
  return (
    <div className="space-y-3">
      <Filters q={q} setQ={setQ} accounts={accounts} />
      <DataTable columns={columns} rows={data?.items} rowKey={(t) => t.id} loading={isLoading} error={error} empty="مفيش تحويلات" onRowClick={onOpen} />
      <Pagination page={q.page} pageSize={20} total={data?.total ?? 0} onChange={(page) => setQ({ ...q, page })} />
    </div>
  );
}

function OthersList({ accounts, onOpen }: { accounts: MoneyAccount[]; onOpen: (m: OtherMovement) => void }) {
  const [q, setQ] = useState<MovementsQuery>({ page: 1, status: '', accountId: '' });
  const { data, isLoading, error } = useOtherMovements(q);
  const columns: Column<OtherMovement>[] = [
    { header: '#', className: 'w-0', cell: (m) => m.id },
    { header: 'التاريخ', cell: (m) => <span className="whitespace-nowrap">{formatDate(m.movementDate)}</span> },
    { header: 'النوع', cell: (m) => OTHER_KINDS[m.kind] },
    { header: 'الحساب', cell: (m) => m.account.name },
    {
      header: 'المبلغ',
      cell: (m) => (
        <b dir="ltr" className={m.direction === 'IN' ? 'text-success' : 'text-danger'}>
          {m.direction === 'IN' ? '+' : '−'}
          {money(m.amount, m.account.currency)}
        </b>
      ),
    },
    { header: 'السبب', cell: (m) => <span className="line-clamp-1 max-w-64 text-sm">{m.reason}</span> },
    { header: 'الحالة', cell: (m) => <Badge tone={STATUS[m.approvalStatus].tone}>{STATUS[m.approvalStatus].label}</Badge> },
  ];
  return (
    <div className="space-y-3">
      <Filters q={q} setQ={setQ} accounts={accounts} />
      <DataTable columns={columns} rows={data?.items} rowKey={(m) => m.id} loading={isLoading} error={error} empty="مفيش حركات" onRowClick={onOpen} />
      <Pagination page={q.page} pageSize={20} total={data?.total ?? 0} onChange={(page) => setQ({ ...q, page })} />
    </div>
  );
}

function Filters({ q, setQ, accounts }: { q: MovementsQuery; setQ: (q: MovementsQuery) => void; accounts: MoneyAccount[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="w-52">
        <SelectField
          label="الحالة"
          placeholder="كل الحالات"
          options={STATUS_OPTIONS}
          value={q.status}
          onChange={(e) => setQ({ ...q, page: 1, status: e.target.value as ApprovalStatus | '' })}
        />
      </div>
      <div className="w-60">
        <SelectField
          label="الخزنة / الحساب"
          placeholder="الكل"
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          value={q.accountId}
          onChange={(e) => setQ({ ...q, page: 1, accountId: e.target.value ? Number(e.target.value) : '' })}
        />
      </div>
    </div>
  );
}

type Tab = 'transfers' | 'others';

export default function TreasuryPage() {
  const { can } = useAuth();
  const { data: accounts = [], isLoading, error } = useAccounts();
  const [ledger, setLedger] = useState<MoneyAccount | null>(null);
  const [editing, setEditing] = useState<MoneyAccount | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('transfers');
  const [transferId, setTransferId] = useState<number | null>(null);
  const [otherId, setOtherId] = useState<number | null>(null);
  const [newTransfer, setNewTransfer] = useState(false);
  const [newOther, setNewOther] = useState(false);
  // the drawers show the full document (with its approval trail), not the list row
  const transfer = useDocument('TRANSFER', transferId).data as Transfer | undefined;
  const other = useDocument('OTHER', otherId).data as OtherMovement | undefined;
  const manage = can('finance.accounts.manage');
  const record = can('finance.movements.create');
  const canSeeBalances = can('finance.balances.view');

  const byCurrency = (['EGP', 'USD'] as Currency[]).map((c) => {
    const list = accounts.filter((a) => a.currency === c);
    const total = list.reduce((s, a) => s + Number(a.balance), 0);
    return { currency: c, list, total };
  });

  return (
    <>
      <PageHeader
        title="الخزن والبنوك"
        description="اضغط على أي خزنة أو حساب علشان تشوف كشفه بالرصيد بعد كل حركة."
        actions={
          <div className="flex flex-wrap gap-2">
            {record && (
              <>
                <Button variant="ghost" icon={<Banknote className="size-4" />} onClick={() => setNewOther(true)}>
                  حركة تانية
                </Button>
                <Button icon={<ArrowLeftRight className="size-4" />} onClick={() => setNewTransfer(true)}>
                  تحويل
                </Button>
              </>
            )}
            {manage && (
              <Button
                variant="ghost"
                icon={<Plus className="size-4" />}
                onClick={() => {
                  setEditing(null);
                  setAccountOpen(true);
                }}
              >
                حساب بنكي
              </Button>
            )}
          </div>
        }
      />
      {error ? <ErrorBox error={error} /> : null}
      {isLoading && <div className="h-40 rounded-2xl shimmer" />}

      <div className="space-y-6">
        {byCurrency.map(({ currency, list, total }) => (
          <section key={currency} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-bold">{CURRENCIES[currency].label}</h2>
              <span className="text-sm text-muted">
                الإجمالي:{' '}
                <b className="text-gold" dir="ltr">
                  {money(total, currency)}
                </b>
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((a, i) => (
                <AccountCard
                  key={a.id}
                  account={a}
                  index={i}
                  onOpen={() => canSeeBalances && setLedger(a)}
                  onEdit={
                    manage
                      ? () => {
                          setEditing(a);
                          setAccountOpen(true);
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-8 space-y-4">
        <FormTabs
          tabs={[
            { key: 'transfers', label: 'التحويلات' },
            { key: 'others', label: 'الحركات التانية' },
          ]}
          active={tab}
          onChange={setTab}
          layoutId="treasury-tab"
        />
        {tab === 'transfers' ? (
          <TransfersList accounts={accounts} onOpen={(t) => setTransferId(t.id)} />
        ) : (
          <OthersList accounts={accounts} onOpen={(m) => setOtherId(m.id)} />
        )}
      </section>

      <LedgerDrawer account={ledger} onClose={() => setLedger(null)} />
      <AccountDrawer account={editing} open={accountOpen} onClose={() => setAccountOpen(false)} />
      <TransferDrawer transfer={null} open={newTransfer} onClose={() => setNewTransfer(false)} />
      <TransferDrawer transfer={transfer ?? null} open={!!transfer && transferId !== null} onClose={() => setTransferId(null)} />
      <OtherDrawer movement={null} open={newOther} onClose={() => setNewOther(false)} />
      <OtherDrawer movement={other ?? null} open={!!other && otherId !== null} onClose={() => setOtherId(null)} />
    </>
  );
}
