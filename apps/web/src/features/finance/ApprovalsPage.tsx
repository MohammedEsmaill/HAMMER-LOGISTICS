import { useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
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
import { useWaitingCount } from '@/features/inbox/use-inbox';
import { api } from '@/lib/api-client';
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

type Next = Partial<Record<ApprovalStatus, { action: ApprovalAction; label: string }>>;

/** The step that moves a document on from each status, with its button, per flow. */
const NEXT: Record<Operation['flow'], Next> = {
  // the general auditor reviews, then the accounts manager approves
  TWO_LEVELS: {
    PENDING: { action: 'review', label: 'مراجعة' },
    REVIEWED: { action: 'approve', label: 'اعتماد' },
    MANAGER_APPROVED: { action: 'approve', label: 'اعتماد' },
  },
  THREE_LEVELS: {
    PENDING: { action: 'review', label: 'مراجعة' },
    REVIEWED: { action: 'manager-approve', label: 'موافقة' },
    MANAGER_APPROVED: { action: 'approve', label: 'اعتماد' },
  },
  FINAL_ONLY: { PENDING: { action: 'approve', label: 'اعتماد' } },
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
  { value: 'PARTY', label: 'الحسابات الداخلية' },
];

type Tab = 'waiting' | 'rejected' | 'approved' | 'all';

const tabOf = (q: ApprovalsQuery): Tab =>
  q.waiting ? 'waiting' : q.status === 'REJECTED' ? 'rejected' : q.status === 'APPROVED' ? 'approved' : 'all';

/** Where each status waits, in words. */
const WAITS: Partial<Record<ApprovalStatus, string>> = {
  PENDING: 'مستنية المراجعة',
  REVIEWED: 'مستنية الاعتماد النهائي',
  MANAGER_APPROVED: 'مستنية الاعتماد النهائي',
};

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
  // the bell links here with ?status=…&type=… (what waits for this user)
  const [params] = useSearchParams();
  const fromLink = (): ApprovalsQuery => {
    const status = params.get('status') as ApprovalStatus | null;
    const waiting = approver && (params.get('waiting') === '1' || (!status && !params.has('type')) || (!!status && status !== 'REJECTED' && status !== 'APPROVED'));
    return {
      page: 1,
      waiting,
      status: waiting ? '' : (status ?? ''),
      type: (params.get('type') as ApprovalsQuery['type'] | null) ?? '',
    };
  };
  const [q, setQ] = useState<ApprovalsQuery>(fromLink);
  useEffect(() => {
    if (params.has('status') || params.has('type') || params.has('waiting')) setQ(fromLink());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow a new link only
  }, [params]);
  const { data, isLoading, error } = useApprovals(q);
  const waitingCount = useWaitingCount();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Operation | null>(null);
  const [open, setOpen] = useState<{ type: DocType; id: number } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const set = (patch: Partial<ApprovalsQuery>) => {
    setPicked(new Set());
    setQ((p) => ({ ...p, page: 1, ...patch }));
  };
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: financeKeys.all }), queryClient.invalidateQueries({ queryKey: ['inbox'] })]);
  const tab = tabOf(q);
  const tabs: { key: Tab; label: string; patch: Partial<ApprovalsQuery> }[] = [
    ...(approver ? [{ key: 'waiting' as const, label: `Waiting${waitingCount ? ` · ${waitingCount}` : ''}`, patch: { waiting: true, status: '' as const, mine: false } }] : []),
    { key: 'rejected', label: 'مرفوضة', patch: { waiting: false, status: 'REJECTED' } },
    { key: 'approved', label: 'معتمدة', patch: { waiting: false, status: 'APPROVED' } },
    { key: 'all', label: 'الكل', patch: { waiting: false, status: '' } },
  ];

  const keyOf = (o: { type: string; id: number }) => `${o.type}-${o.id}`;
  const actable = useMemo(() => (data?.items ?? []).filter((o) => o.canAct && NEXT[o.flow][o.approvalStatus]), [data]);
  const allPicked = actable.length > 0 && actable.every((o) => picked.has(keyOf(o)));
  const toggle = (k: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const pickAll = () => setPicked(allPicked ? new Set() : new Set(actable.map(keyOf)));

  const bulk = async () => {
    const items = actable.filter((o) => picked.has(keyOf(o))).map(({ type, id, version }) => ({ type, id, version }));
    if (!items.length) return;
    setBulkBusy(true);
    try {
      const res = await api.post<{ done: number; failed: number; results: { ok: boolean; error?: string }[] }>('/finance/approvals/bulk', { items });
      if (res.failed) toast.warning(`اتنفذ ${res.done}، وفيه ${res.failed} معرفتش`, { description: res.results.find((r) => !r.ok)?.error });
      else toast.success(`اتنفذ ${res.done} معاملة`);
      setPicked(new Set());
    } catch (e) {
      toastError(e);
    } finally {
      setBulkBusy(false);
      await refresh();
    }
  };

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
    ...(actable.length
      ? [
          {
            header: 'اختيار',
            className: 'w-0',
            cell: (o: Operation) =>
              o.canAct && NEXT[o.flow][o.approvalStatus] ? (
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--gold-2)]"
                  aria-label={`اختيار ${o.typeLabel} ${o.id}`}
                  checked={picked.has(keyOf(o))}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggle(keyOf(o))}
                />
              ) : null,
          },
        ]
      : []),
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
      header: 'الخطوة',
      cell: (o) =>
        WAITS[o.approvalStatus] ? (
          <span className={`text-xs whitespace-nowrap ${o.canAct ? 'font-semibold text-gold' : 'text-muted'}`}>
            {o.canAct ? 'Waiting · ' : ''}
            {WAITS[o.approvalStatus]}
          </span>
        ) : null,
    },
    {
      header: '',
      className: 'w-0 whitespace-nowrap',
      cell: (o) => {
        const next = NEXT[o.flow][o.approvalStatus];
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="الحالة" className="flex overflow-hidden rounded-xl border border-line">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => set(t.patch)}
              className={`focus-ring h-10 px-4 text-sm transition-colors ${tab === t.key ? 'bg-gold/15 font-semibold text-gold' : 'text-muted hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {actable.length > 0 && (
          <div className="ms-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" className="size-4 accent-[var(--gold-2)]" checked={allPicked} onChange={pickAll} />
              اختار الكل ({actable.length})
            </label>
            <Button icon={<Check className="size-4" />} disabled={picked.size === 0} loading={bulkBusy} onClick={bulk}>
              نفّذ خطوتي على المختار{picked.size ? ` (${picked.size})` : ''}
            </Button>
          </div>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {tab === 'all' && (
          <div className="w-52">
            <SelectField
              label="الحالة"
              placeholder="كل الحالات"
              options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))}
              value={q.status}
              onChange={(e) => set({ status: e.target.value as ApprovalStatus | '' })}
            />
          </div>
        )}
        <div className="w-44">
          <SelectField label="النوع" placeholder="الكل" options={TYPE_OPTIONS.filter((t) => !t.restricted || salaryData)} value={q.type} onChange={(e) => set({ type: e.target.value as DocType | '' })} />
        </div>
        <TextField label="من" type="date" className="w-44" value={q.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
        <TextField label="إلى" type="date" className="w-44" value={q.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
        {approver && tab !== 'waiting' && (
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
        empty={tab === 'waiting' ? 'مفيش حاجة في Waiting' : 'مفيش حركات بالفلتر ده'}
        onRowClick={(o) => setOpen({ type: o.type, id: o.id })}
      />
      <div className="mt-4">
        <Pagination page={q.page} pageSize={25} total={data?.total ?? 0} onChange={(page) => {
            setPicked(new Set());
            setQ((p) => ({ ...p, page }));
          }} />
      </div>
      <RejectDrawer op={rejecting} onClose={() => setRejecting(null)} onDone={refresh} />
      <DocumentDrawers open={open} onClose={() => setOpen(null)} />
    </>
  );
}
