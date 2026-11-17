import { FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { Badge, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { toastError } from '@/lib/mutations';
import { useCompany } from '../finance/account-api';
import { FormTabs } from '../shipments/FormTabs';
import { fetchAuditAll, useAudit, useAuditUsers, type AuditQuery, type AuditRow } from './api';
import { downloadAuditExcel } from './audit-excel';
import { Changes } from './Changes';
import { subject, when, who } from './format';
import { ACTION_TONE, ACTIONS, ENTITIES, linkOf, SECTIONS } from './labels';

const LOGIN_ACTIONS = ['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'LOGIN_LOCKED', 'UNLOCK'];

/** One record: who, when, what, and the fields it changed. */
export function AuditDrawer({ row, onClose }: { row: AuditRow | null; onClose: () => void }) {
  const link = row && linkOf(row.entity, row.entityId);
  return (
    <Drawer open={!!row} onClose={onClose} width="max-w-2xl" title={row ? `${ACTIONS[row.action] ?? row.action}: ${subject(row)}` : ''}>
      {row && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['بواسطة', who(row)],
              ['الوقت', when(row.createdAt)],
              ['الجهاز (IP)', row.ip ?? '—'],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-surface-2 px-3 py-2.5">
                <div className="text-xs text-muted">{l}</div>
                <div className="font-semibold" dir="auto">
                  {v}
                </div>
              </div>
            ))}
          </div>
          {link && (
            <Link to={link} className="inline-block text-sm text-gold hover:underline">
              فتح {ENTITIES[row.entity]}
            </Link>
          )}
          <Changes before={row.before} after={row.after} />
        </div>
      )}
    </Drawer>
  );
}

/** The audit log: every change and every sign-in, filtered, with what changed. */
export default function AuditLogPage() {
  const [q, setQ] = useState<AuditQuery>({ tab: 'operations', page: 1 });
  const { data, isLoading, error } = useAudit(q);
  const { data: users = [] } = useAuditUsers();
  const { data: company } = useCompany();
  const [open, setOpen] = useState<AuditRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const set = (patch: Partial<AuditQuery>) => setQ((x) => ({ ...x, ...patch, page: 1 }));
  const logins = q.tab === 'logins';

  const actions = Object.entries(ACTIONS).filter(([k]) => LOGIN_ACTIONS.includes(k) === logins);
  const columns: Column<AuditRow>[] = [
    { header: 'الوقت', cell: (r) => <span dir="ltr">{when(r.createdAt)}</span> },
    { header: 'المستخدم', cell: (r) => <span className="font-semibold">{who(r)}</span> },
    { header: 'العملية', cell: (r) => <Badge tone={ACTION_TONE[r.action] ?? 'gold'}>{ACTIONS[r.action] ?? r.action}</Badge> },
    ...(logins
      ? [{ header: 'الجهاز (IP)', cell: (r: AuditRow) => <span dir="ltr">{r.ip ?? '—'}</span> }]
      : [{ header: 'على', cell: (r: AuditRow) => <span dir="auto">{subject(r)}</span> }]),
  ];

  const excel = async () => {
    if (!company) return;
    setExporting(true);
    try {
      const all = await fetchAuditAll(q);
      await downloadAuditExcel(all.items, company, logins);
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="سجل العمليات"
        actions={
          <Button variant="ghost" icon={<FileSpreadsheet className="size-4" />} loading={exporting} onClick={excel}>
            Excel
          </Button>
        }
      />
      <div className="mb-4">
        <FormTabs
          tabs={[
            { key: 'operations', label: 'العمليات' },
            { key: 'logins', label: 'الدخول' },
          ]}
          active={q.tab}
          onChange={(tab) => setQ({ tab, page: 1 })}
          layoutId="audit-tab"
        />
      </div>
      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <SelectField
          label="المستخدم"
          placeholder="الكل"
          value={q.userId ?? ''}
          onChange={(e) => set({ userId: Number(e.target.value) || undefined })}
          options={users.map((u) => ({ value: u.id, label: u.employee?.fullName ?? u.email }))}
        />
        {!logins && (
          <SelectField
            label="القسم"
            placeholder="الكل"
            value={q.section ?? ''}
            onChange={(e) => set({ section: e.target.value || undefined })}
            options={Object.entries(SECTIONS).map(([value, label]) => ({ value, label }))}
          />
        )}
        <SelectField
          label="العملية"
          placeholder="الكل"
          value={q.action ?? ''}
          onChange={(e) => set({ action: e.target.value || undefined })}
          options={actions.map(([value, label]) => ({ value, label }))}
        />
        <TextField label="من" type="date" value={q.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
        <TextField label="إلى" type="date" value={q.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
        {!logins && (
          <div className="sm:col-span-2 lg:col-span-5">
            <SearchInput value={q.search ?? ''} onChange={(search) => set({ search: search || undefined })} placeholder="ابحث برقم ملف أو اسم أو رقم مستند" />
          </div>
        )}
      </div>
      <DataTable columns={columns} rows={data?.items} rowKey={(r) => r.id} loading={isLoading} error={error} empty="لا توجد عمليات" onRowClick={setOpen} />
      {data && (
        <div className="mt-3">
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => setQ((x) => ({ ...x, page }))} />
        </div>
      )}
      <AuditDrawer row={open} onClose={() => setOpen(null)} />
    </>
  );
}
