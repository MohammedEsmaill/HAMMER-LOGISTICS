import { HandCoins, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { FormTabs } from '../shipments/FormTabs';
import { money, STATUS, useDocument, type ApprovalStatus } from './api';
import {
  currentMonth,
  useAdvanceBalances,
  useAdvances,
  useSalaries,
  type Advance,
  type AdvanceBalance,
  type Salary,
} from './office-api';
import { AdvanceDrawer, SalaryDrawer, StatementDrawer } from './PayrollDrawers';

const statusBadge = (s: ApprovalStatus) => <Badge tone={STATUS[s].tone}>{STATUS[s].label}</Badge>;

function SalariesTab({ onOpen }: { onOpen: (id: number) => void }) {
  const [month, setMonth] = useState(currentMonth());
  const [status, setStatus] = useState<ApprovalStatus | ''>('');
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useSalaries({ month: month || undefined, status, page });
  const columns: Column<Salary>[] = [
    {
      header: 'الموظف',
      cell: (s) => (
        <div>
          <div className="font-semibold">{s.employee.fullName}</div>
          <div className="text-xs text-muted">كود {s.employee.code}</div>
        </div>
      ),
    },
    { header: 'الأساسي', cell: (s) => <span dir="ltr">{money(s.basic)}</span> },
    { header: 'زيادات', cell: (s) => <span dir="ltr" className="text-success">{Number(s.additions) ? `+${money(s.additions)}` : ''}</span> },
    { header: 'خصومات', cell: (s) => <span dir="ltr" className="text-danger">{Number(s.deductions) ? `−${money(s.deductions)}` : ''}</span> },
    { header: 'خصم سلف', cell: (s) => <span dir="ltr" className="text-warning">{Number(s.advanceDeduction) ? `−${money(s.advanceDeduction)}` : ''}</span> },
    { header: 'الصافي', cell: (s) => <b dir="ltr">{money(s.net, 'EGP')}</b> },
    { header: 'من', cell: (s) => <span className="text-sm">{s.account.name}</span> },
    { header: 'الحالة', cell: (s) => statusBadge(s.approvalStatus) },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <TextField label="الشهر" type="month" className="w-48" value={month} onChange={(e) => (setMonth(e.target.value), setPage(1))} />
        <div className="w-52">
          <SelectField
            label="الحالة"
            placeholder="كل الحالات"
            options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))}
            value={status}
            onChange={(e) => (setStatus(e.target.value as ApprovalStatus | ''), setPage(1))}
          />
        </div>
        {data && (
          <div className="mr-auto rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm">
            إجمالي الصافي: <b className="text-gold" dir="ltr">{money(data.totalNet, 'EGP')}</b> · {data.total} مرتب
          </div>
        )}
      </div>
      <DataTable columns={columns} rows={data?.items} rowKey={(s) => s.id} loading={isLoading} error={error} empty="مفيش مرتبات اتصرفت للشهر ده" onRowClick={(s) => onOpen(s.id)} />
      <Pagination page={page} pageSize={50} total={data?.total ?? 0} onChange={setPage} />
    </div>
  );
}

function AdvancesTab({ onStatement, onOpen }: { onStatement: (employeeId: number) => void; onOpen: (id: number) => void }) {
  const { data: balances, isLoading, error } = useAdvanceBalances();
  const [page, setPage] = useState(1);
  const advances = useAdvances({ page });
  const balanceColumns: Column<AdvanceBalance>[] = [
    { header: 'الموظف', cell: (b) => <span className="font-semibold">{b.employee.fullName}</span> },
    { header: 'إجمالي السلف', cell: (b) => <span dir="ltr">{money(b.advances)}</span> },
    { header: 'اتخصم', cell: (b) => <span dir="ltr" className="text-success">{money(b.deducted)}</span> },
    { header: 'الرصيد عليه', cell: (b) => <b dir="ltr" className={Number(b.balance) > 0 ? 'text-warning' : 'text-muted'}>{money(b.balance, 'EGP')}</b> },
  ];
  const advanceColumns: Column<Advance>[] = [
    { header: '#', className: 'w-0', cell: (a) => a.id },
    { header: 'التاريخ', cell: (a) => <span className="whitespace-nowrap">{formatDate(a.advanceDate)}</span> },
    { header: 'الموظف', cell: (a) => a.employee.fullName },
    { header: 'المبلغ', cell: (a) => <b dir="ltr">{money(a.amount, 'EGP')}</b> },
    { header: 'من', cell: (a) => <span className="text-sm">{a.account.name}</span> },
    { header: 'الحالة', cell: (a) => statusBadge(a.approvalStatus) },
  ];
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="font-semibold text-gold">أرصدة السلف</h3>
        <p className="text-sm text-muted">اضغط على الموظف علشان تشوف كشف سلفه.</p>
        <DataTable
          columns={balanceColumns}
          rows={balances}
          rowKey={(b) => b.employee.id}
          loading={isLoading}
          error={error}
          empty="مفيش سلف"
          onRowClick={(b) => onStatement(b.employee.id)}
        />
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold text-gold">آخر السلف</h3>
        <DataTable columns={advanceColumns} rows={advances.data?.items} rowKey={(a) => a.id} loading={advances.isLoading} error={advances.error} empty="مفيش سلف" onRowClick={(a) => onOpen(a.id)} />
        <Pagination page={page} pageSize={20} total={advances.data?.total ?? 0} onChange={setPage} />
      </section>
    </div>
  );
}

type Tab = 'salaries' | 'advances';

export default function PayrollPage() {
  const { can } = useAuth();
  const pay = can('finance.payroll.manage');
  const [tab, setTab] = useState<Tab>('salaries');
  const [salaryId, setSalaryId] = useState<number | null>(null);
  const [advanceId, setAdvanceId] = useState<number | null>(null);
  const [newSalary, setNewSalary] = useState(false);
  const [newAdvance, setNewAdvance] = useState<{ employeeId?: number } | null>(null);
  const [statementOf, setStatementOf] = useState<number | null>(null);
  const salary = useDocument<Salary>('SALARY', salaryId).data;
  const advance = useDocument<Advance>('ADVANCE', advanceId).data;

  return (
    <>
      <PageHeader
        title="الرواتب والسُّلف"
        description="مرتب كل شهر بيتصرف مرة واحدة للموظف. السلف بتتسدد بالخصم من المرتب بس."
        actions={
          pay && (
            <div className="flex gap-2">
              <Button variant="ghost" icon={<HandCoins className="size-4" />} onClick={() => setNewAdvance({})}>
                سلفة
              </Button>
              <Button icon={<Wallet className="size-4" />} onClick={() => setNewSalary(true)}>
                صرف مرتب
              </Button>
            </div>
          )
        }
      />
      <div className="mb-4">
        <FormTabs
          tabs={[
            { key: 'salaries', label: 'المرتبات' },
            { key: 'advances', label: 'السلف' },
          ]}
          active={tab}
          onChange={setTab}
          layoutId="payroll-tab"
        />
      </div>
      {tab === 'salaries' ? <SalariesTab onOpen={setSalaryId} /> : <AdvancesTab onStatement={setStatementOf} onOpen={setAdvanceId} />}

      <SalaryDrawer salary={null} open={newSalary} onClose={() => setNewSalary(false)} />
      <SalaryDrawer salary={salary ?? null} open={!!salary && salaryId !== null} onClose={() => setSalaryId(null)} />
      <AdvanceDrawer advance={null} open={!!newAdvance} employeeId={newAdvance?.employeeId} onClose={() => setNewAdvance(null)} />
      <AdvanceDrawer advance={advance ?? null} open={!!advance && advanceId !== null} onClose={() => setAdvanceId(null)} />
      <StatementDrawer
        employeeId={statementOf}
        onClose={() => setStatementOf(null)}
        onNewAdvance={
          pay
            ? () => {
                setNewAdvance({ employeeId: statementOf ?? undefined });
                setStatementOf(null);
              }
            : undefined
        }
      />
    </>
  );
}
