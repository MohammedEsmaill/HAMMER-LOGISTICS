import { useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, PageHeader, Switch } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { toastError } from '@/lib/mutations';
import {
  financeApi,
  financeKeys,
  money,
  STATUS,
  useApprovals,
  type ApprovalAction,
  type ApprovalStatus,
  type ApprovalsQuery,
  type DocType,
  type Operation,
} from './api';
import { DocumentDrawers } from './DocumentDrawers';

/** The step that moves a document on from each status, with its button. */
const NEXT: Partial<Record<ApprovalStatus, { action: ApprovalAction; label: string }>> = {
  PENDING: { action: 'review', label: 'مراجعة' },
  REVIEWED: { action: 'manager-approve', label: 'موافقة' },
  MANAGER_APPROVED: { action: 'approve', label: 'اعتماد' },
};

/** Salaries and advances: the general auditor approves them in one step. */
const FINAL_ONLY_NEXT: Partial<Record<ApprovalStatus, { action: ApprovalAction; label: string }>> = {
  PENDING: { action: 'approve', label: 'اعتماد' },
};

const TYPE_OPTIONS = [
  { value: 'TRANSFER', label: 'التحويلات' },
  { value: 'OTHER', label: 'المعاملات الأخرى' },
  { value: 'SALARY', label: 'المرتبات', restricted: true },
  { value: 'ADVANCE', label: 'السلف', restricted: true },
  { value: 'EXPENSE', label: 'المصاريف العمومية' },
  { value: 'CUSTODY', label: 'العهد' },
  { value: 'FEE_PAYMENT', label: 'صرف الأتعاب' },
  { value: 'FEE_ADJUSTMENT', label: 'تسويات الأتعاب' },
  { value: 'INVOICE', label: 'الفواتير' },
  { value: 'COLLECTION', label: 'التحصيل' },
];

function RejectDrawer({ op, onClose, onDone }: { op: Operation | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [problem, setProblem] = useState('');
  const submit = async () => {
    if (!op) return;
    if (reason.trim().length < 3) return setProblem('اكتب سبب الرفض علشان صاحب الحركة يعرف يعدّل إيه');
    setProblem('');
    setBusy(true);
    try {
      await financeApi.act(op.type, op.id, 'reject', op.version, reason.trim());
      toast.success('اترفضت الحركة ورجعت لصاحبها');
      setReason('');
      onDone();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={!!op}
      onClose={onClose}
      title={op ? `رفض ${op.typeLabel} #${op.id}` : 'رفض'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="danger" loading={busy} onClick={submit}>
            رفض
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {op && (
          <p className="rounded-xl bg-surface-2 p-3 text-sm">
            {op.typeLabel} بمبلغ <b dir="ltr">{money(op.amount, op.currency)}</b> سجّلها {op.createdBy.email.split('@')[0]}
          </p>
        )}
        <TextField label="سبب الرفض" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} error={problem || undefined} />
        {error ? <ErrorBox error={error} /> : null}
      </div>
    </Drawer>
  );
}

export default function ApprovalsPage() {
  const { canAny } = useAuth();
  const approver = canAny('finance.review', 'finance.manager_approve', 'finance.approve', 'finance.approved.edit');
  const salaryData = canAny('finance.payroll.manage', 'finance.approve');
  const queryClient = useQueryClient();
  const [q, setQ] = useState<ApprovalsQuery>({ page: 1, status: approver ? 'PENDING' : '', type: '' });
  const { data, isLoading, error } = useApprovals(q);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Operation | null>(null);
  const [open, setOpen] = useState<{ type: DocType; id: number } | null>(null);
  const set = (patch: Partial<ApprovalsQuery>) => setQ((p) => ({ ...p, page: 1, ...patch }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: financeKeys.all });

  const act = async (op: Operation, action: ApprovalAction, label: string) => {
    setBusy(`${op.type}-${op.id}`);
    try {
      await financeApi.act(op.type, op.id, action, op.version);
      toast.success(`${label}: ${op.typeLabel} #${op.id}`);
      await refresh();
    } catch (e) {
      toastError(e);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<Operation>[] = [
    {
      header: 'الحركة',
      cell: (o) => (
        <div>
          <div className="font-semibold">
            {o.typeLabel} #{o.id}
          </div>
          <div className="text-xs text-muted">{o.createdBy.email.split('@')[0]}</div>
        </div>
      ),
    },
    { header: 'التاريخ', cell: (o) => <span className="whitespace-nowrap">{formatDate(o.date)}</span> },
    { header: 'المبلغ', cell: (o) => <b dir="ltr">{money(o.amount, o.currency)}</b> },
    {
      header: 'الحالة',
      cell: (o) => (
        <div className="space-y-1">
          <Badge tone={STATUS[o.approvalStatus].tone}>{STATUS[o.approvalStatus].label}</Badge>
          {o.rejectionReason && o.approvalStatus === 'REJECTED' && <div className="max-w-56 text-xs text-danger">{o.rejectionReason}</div>}
        </div>
      ),
    },
    {
      header: '',
      className: 'w-0 whitespace-nowrap',
      cell: (o) => {
        const next = o.flow === 'FINAL_ONLY' ? FINAL_ONLY_NEXT[o.approvalStatus] : NEXT[o.approvalStatus];
        if (!o.canAct || !next) return null;
        return (
          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" className="h-9 px-3 text-sm text-danger" icon={<X className="size-4" />} onClick={() => setRejecting(o)}>
              رفض
            </Button>
            <Button
              className="h-9 px-3 text-sm"
              icon={<Check className="size-4" />}
              loading={busy === `${o.type}-${o.id}`}
              onClick={() => act(o, next.action, next.label)}
            >
              {next.label}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="اعتماد المعاملات المالية"
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-52">
          <SelectField
            label="الحالة"
            placeholder="كل الحالات"
            options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))}
            value={q.status}
            onChange={(e) => set({ status: e.target.value as ApprovalStatus | '' })}
          />
        </div>
        <div className="w-44">
          <SelectField label="النوع" placeholder="الكل" options={TYPE_OPTIONS.filter((t) => !t.restricted || salaryData)} value={q.type} onChange={(e) => set({ type: e.target.value as DocType | '' })} />
        </div>
        <TextField label="من" type="date" className="w-44" value={q.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
        <TextField label="إلى" type="date" className="w-44" value={q.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
        {approver && (
          <label className="flex h-12 items-center gap-2 text-sm">
            <Switch checked={!!q.mine} onChange={(mine) => set({ mine })} label="اللي أنا سجلتها بس" />
            اللي أنا سجلتها بس
          </label>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(o) => `${o.type}-${o.id}`}
        loading={isLoading}
        error={error}
        empty="مفيش حركات بالفلتر ده"
        onRowClick={(o) => setOpen({ type: o.type, id: o.id })}
      />
      <div className="mt-4">
        <Pagination page={q.page} pageSize={25} total={data?.total ?? 0} onChange={(page) => setQ((p) => ({ ...p, page }))} />
      </div>
      <RejectDrawer op={rejecting} onClose={() => setRejecting(null)} onDone={refresh} />
      <DocumentDrawers open={open} onClose={() => setOpen(null)} />
    </>
  );
}
