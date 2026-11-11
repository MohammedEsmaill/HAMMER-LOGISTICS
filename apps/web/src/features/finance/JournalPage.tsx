import { ArrowLeftRight, Banknote, Briefcase, FileBarChart, HandCoins, Plus, Receipt, RotateCcw, Wallet, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import type { Permission } from '@/auth/permissions';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { Badge, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { CURRENCIES, money, STATUS, useAccounts, type ApprovalStatus, type Currency } from './api';
import { IssueCustodyDrawer } from './CustodyDrawers';
import { DocumentDrawers, type OpenDocument } from './DocumentDrawers';
import { ExpenseDrawer } from './ExpensesPage';
import {
  FLOWS,
  JOURNAL_PAGE_SIZE,
  JOURNAL_TYPES,
  useJournal,
  useJournalAuthors,
  type Flow,
  type JournalQuery,
  type JournalRow,
  type JournalType,
} from './journal-api';
import { OtherDrawer, TransferDrawer } from './MovementDrawers';
import { AdvanceDrawer, SalaryDrawer } from './PayrollDrawers';

type NewKind = 'TRANSFER' | 'OTHER' | 'EXPENSE' | 'CUSTODY' | 'SALARY' | 'ADVANCE';

/** What can be recorded from the journal, each by who may record it. */
const NEW_KINDS: { kind: NewKind; label: string; hint: string; icon: LucideIcon; permission: Permission }[] = [
  { kind: 'TRANSFER', label: 'تحويل', hint: 'بين خزنة وحساب بنكي أو بين حسابين', icon: ArrowLeftRight, permission: 'finance.movements.create' },
  { kind: 'OTHER', label: 'حركة تانية', hint: 'تمويل، مصاريف بنكية، تسوية', icon: Banknote, permission: 'finance.movements.create' },
  { kind: 'EXPENSE', label: 'مصروف عمومي', hint: 'مصاريف المكتب بإيصال', icon: Receipt, permission: 'finance.expenses.manage' },
  { kind: 'CUSTODY', label: 'عهدة', hint: 'صرف عهدة على شحنة', icon: Briefcase, permission: 'finance.custody.manage' },
  { kind: 'SALARY', label: 'مرتب', hint: 'صرف مرتب شهر لموظف', icon: Wallet, permission: 'finance.payroll.manage' },
  { kind: 'ADVANCE', label: 'سلفة', hint: 'سلفة لموظف', icon: HandCoins, permission: 'finance.payroll.manage' },
];

const EMPTY: JournalQuery = { page: 1, types: [], accountId: '', currency: '', status: '', flow: '', createdBy: '', search: '' };

function TypeChips({ value, onChange, salaryData }: { value: JournalType[]; onChange: (v: JournalType[]) => void; salaryData: boolean }) {
  const types = (Object.keys(JOURNAL_TYPES) as JournalType[]).filter((t) => salaryData || !JOURNAL_TYPES[t].restricted);
  return (
    <div className="flex flex-wrap gap-2">
      {types.map((t) => {
        const on = value.includes(t);
        return (
          <button
            key={t}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== t) : [...value, t])}
            className={`focus-ring rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? 'border-gold bg-gold/15 font-semibold text-gold' : 'border-line text-muted hover:text-ink'}`}
          >
            {JOURNAL_TYPES[t].label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The journal: every money operation of the office, newest first, filtered and paged by
 * the server. The treasury manager records from here; the others read and report.
 */
export default function JournalPage() {
  const { can, canAny } = useAuth();
  const salaryData = canAny('finance.payroll.manage', 'finance.approve');
  const [q, setQ] = useState<JournalQuery>(EMPTY);
  const { data, isLoading, error } = useJournal(q);
  const { data: accounts = [] } = useAccounts();
  const { data: authors = [] } = useJournalAuthors();
  const [open, setOpen] = useState<OpenDocument | null>(null);
  const [picker, setPicker] = useState(false);
  const [creating, setCreating] = useState<NewKind | null>(null);
  const set = (patch: Partial<JournalQuery>) => setQ((p) => ({ ...p, page: 1, ...patch }));
  const newKinds = NEW_KINDS.filter((k) => can(k.permission));
  const filtered = JSON.stringify({ ...q, page: 1 }) !== JSON.stringify(EMPTY);

  const columns: Column<JournalRow>[] = [
    { header: 'التاريخ', cell: (r) => <span className="whitespace-nowrap">{formatDate(r.operationDate)}</span> },
    {
      header: 'المعاملة',
      cell: (r) => (
        <div className="whitespace-nowrap">
          <div className="font-semibold">{JOURNAL_TYPES[r.type].label}</div>
          <div className="text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }}>
            {r.ref}
          </div>
        </div>
      ),
    },
    {
      header: 'البيان',
      cell: (r) => (
        <div className="max-w-80 min-w-48">
          {r.counterparty && <div className="font-medium">{r.counterparty}</div>}
          <div className="line-clamp-2 text-sm text-muted">{r.description || '—'}</div>
          {r.fileNo && <div className="text-xs text-gold">ملف {r.fileNo}</div>}
        </div>
      ),
    },
    {
      header: 'من ← إلى',
      cell: (r) => (
        <span className="text-sm whitespace-nowrap">
          {r.fromAccount?.name ?? '—'} <span className="text-gold">←</span> {r.toAccount?.name ?? '—'}
        </span>
      ),
    },
    {
      header: 'المبلغ',
      cell: (r) => (
        <b dir="ltr" className={`whitespace-nowrap ${r.flow === 'IN' ? 'text-success' : r.flow === 'OUT' ? 'text-danger' : ''}`}>
          {r.flow === 'IN' ? '+' : r.flow === 'OUT' ? '−' : ''}
          {money(r.amount, r.currency)}
        </b>
      ),
    },
    { header: 'الحالة', cell: (r) => <Badge tone={STATUS[r.approvalStatus].tone}>{STATUS[r.approvalStatus].label}</Badge> },
    { header: 'سجّلها', cell: (r) => <span className="text-sm text-muted">{r.createdBy.email.split('@')[0]}</span> },
  ];

  return (
    <>
      <PageHeader
        title="اليوميات"
        description="كل المعاملات المالية اللي حصلت، بحالتها وتفاصيلها. اضغط على أي معاملة علشان تفتحها."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/reports">
              <Button variant="ghost" icon={<FileBarChart className="size-4" />}>
                التقارير
              </Button>
            </Link>
            {newKinds.length > 0 && (
              <Button icon={<Plus className="size-4" />} onClick={() => setPicker(true)}>
                معاملة جديدة
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {(data?.totals.length ? data.totals : []).map((t) => (
          <div key={t.currency} className="card grid grid-cols-3 gap-2 p-4">
            <div>
              <div className="text-xs text-muted">وارد ({CURRENCIES[t.currency].label})</div>
              <div className="font-bold text-success" dir="ltr" style={{ textAlign: 'right' }}>
                {money(t.in, t.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">منصرف</div>
              <div className="font-bold text-danger" dir="ltr" style={{ textAlign: 'right' }}>
                {money(t.out, t.currency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">عدد المعاملات</div>
              <div className="font-bold">{t.count}</div>
            </div>
          </div>
        ))}
      </div>

      <section className="card mb-4 space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <SearchInput value={q.search ?? ''} onChange={(search) => set({ search })} placeholder="بحث بالبيان أو المرجع أو رقم الملف أو المبلغ..." />
          </div>
          <TextField label="من" type="date" className="w-40" value={q.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
          <TextField label="إلى" type="date" className="w-40" value={q.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
          {filtered && (
            <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setQ(EMPTY)}>
              مسح الفلاتر
            </Button>
          )}
        </div>
        <TypeChips value={q.types ?? []} onChange={(types) => set({ types })} salaryData={salaryData} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SelectField
            label="الخزنة / الحساب"
            placeholder="الكل"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            value={q.accountId}
            onChange={(e) => set({ accountId: e.target.value ? Number(e.target.value) : '' })}
          />
          <SelectField
            label="العملة"
            placeholder="الكل"
            options={Object.entries(CURRENCIES).map(([value, c]) => ({ value, label: c.label }))}
            value={q.currency}
            onChange={(e) => set({ currency: e.target.value as Currency | '' })}
          />
          <SelectField
            label="وارد / منصرف"
            placeholder="الكل"
            options={Object.entries(FLOWS).map(([value, f]) => ({ value, label: f.label }))}
            value={q.flow}
            onChange={(e) => set({ flow: e.target.value as Flow | '' })}
          />
          <SelectField
            label="الحالة"
            placeholder="كل الحالات"
            options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))}
            value={q.status}
            onChange={(e) => set({ status: e.target.value as ApprovalStatus | '' })}
          />
          <SelectField
            label="سجّلها"
            placeholder="الكل"
            options={authors.map((a) => ({ value: a.id, label: a.email.split('@')[0] }))}
            value={q.createdBy}
            onChange={(e) => set({ createdBy: e.target.value ? Number(e.target.value) : '' })}
          />
        </div>
      </section>

      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(r) => `${r.type}-${r.id}`}
        loading={isLoading}
        error={error}
        empty={filtered ? 'مفيش معاملات بالفلتر ده' : 'لسه مفيش معاملات'}
        onRowClick={(r) => setOpen({ type: r.type, id: r.id })}
      />
      <div className="mt-4">
        <Pagination page={q.page} pageSize={JOURNAL_PAGE_SIZE} total={data?.total ?? 0} onChange={(page) => setQ((p) => ({ ...p, page }))} />
      </div>

      <Drawer open={picker} onClose={() => setPicker(false)} title="معاملة جديدة">
        <div className="grid gap-3">
          {newKinds.map(({ kind, label, hint, icon: Icon }) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setPicker(false);
                setCreating(kind);
              }}
              className="card focus-ring flex items-center gap-3 p-4 text-start transition-colors hover:border-gold/50"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-gold/10 text-gold">
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block font-bold">{label}</span>
                <span className="block text-sm text-muted">{hint}</span>
              </span>
            </button>
          ))}
          <p className="text-xs text-muted">التحصيل من العملاء بيتسجل من حساب الشحنة، وأتعاب المستخلصين من كشوف الحساب، وبيظهروا هنا.</p>
        </div>
      </Drawer>

      <TransferDrawer transfer={null} open={creating === 'TRANSFER'} onClose={() => setCreating(null)} />
      <OtherDrawer movement={null} open={creating === 'OTHER'} onClose={() => setCreating(null)} />
      <ExpenseDrawer expense={null} open={creating === 'EXPENSE'} onClose={() => setCreating(null)} />
      <IssueCustodyDrawer open={creating === 'CUSTODY'} onClose={() => setCreating(null)} />
      <SalaryDrawer salary={null} open={creating === 'SALARY'} onClose={() => setCreating(null)} />
      <AdvanceDrawer advance={null} open={creating === 'ADVANCE'} onClose={() => setCreating(null)} />
      <DocumentDrawers open={open} onClose={() => setOpen(null)} />
    </>
  );
}
