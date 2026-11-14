import { FileBarChart, LockOpen, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/ui/SearchInput';
import { TextField } from '@/components/ui/TextField';
import { toastError, useAction } from '@/lib/mutations';
import { financeKeys, money } from './api';
import type { OpenDocument } from './DocumentDrawers';
import {
  DAY_STATUS,
  dayTitle,
  JOURNAL_PAGE_SIZE,
  journalDaysApi,
  openJournalReport,
  useJournal,
  useJournalDay,
  useJournalDays,
  type JournalDayRow,
  type JournalDaysQuery,
} from './journal-api';
import { JournalTable } from './JournalPage';

/** One past day: its state, the accounts as they closed, its operations, its report. */
function DayDrawer({ date, search, onClose, onOpen }: { date: string | null; search: string; onClose: () => void; onOpen: (d: OpenDocument) => void }) {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const { data: day, error } = useJournalDay(date);
  const ops = useJournal({ page, from: date ?? undefined, to: date ?? undefined, search: search || undefined });
  const reopen = useAction(() => journalDaysApi.reopen(date!), { success: 'اليومية اتفتحت لحد آخر النهاردة', invalidate: [financeKeys.all] });

  return (
    <Drawer open={!!date} onClose={onClose} width="max-w-5xl" title={date ? `يومية ${dayTitle(date)}` : ''}>
      {error ? <ErrorBox error={error} /> : null}
      {day && date && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={DAY_STATUS[day.status].tone}>{DAY_STATUS[day.status].label}</Badge>
            {day.status === 'REOPENED' && day.reopenedUntil && <span className="text-sm text-muted">لحد آخر يوم {day.reopenedUntil}</span>}
            <div className="flex-1" />
            <Button variant="ghost" icon={<FileBarChart className="size-4" />} onClick={() => openJournalReport(date, date)}>
              تقرير اليوم
            </Button>
            {day.status === 'CLOSED' && can('finance.approved.edit') && (
              <Button variant="ghost" icon={<LockOpen className="size-4" />} loading={reopen.isPending} onClick={() => reopen.mutateAsync(undefined).catch(toastError)}>
                فتح اليومية
              </Button>
            )}
          </div>

          {day.accounts.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-bold">الخزن والحسابات وقت القفل</h3>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-muted">
                    <tr>
                      {['الخزنة / الحساب', 'رصيد أول اليوم', 'وارد', 'منصرف', 'رصيد آخر اليوم'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {day.accounts.map((a) => (
                      <tr key={a.account.id} className="border-t border-line">
                        <td className="px-3 py-2 font-semibold">{a.account.name}</td>
                        <td className="px-3 py-2" dir="ltr">
                          {money(a.opening, a.account.currency)}
                        </td>
                        <td className="px-3 py-2 text-success" dir="ltr">
                          {money(a.in, a.account.currency)}
                        </td>
                        <td className="px-3 py-2 text-danger" dir="ltr">
                          {money(a.out, a.account.currency)}
                        </td>
                        <td className="px-3 py-2 font-bold" dir="ltr">
                          {money(a.closing, a.account.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="font-bold">المعاملات{search ? ` · ${search}` : ''}</h3>
            <JournalTable rows={ops.data?.items} loading={ops.isLoading} error={ops.error} empty="مفيش معاملات" onOpen={(r) => onOpen({ type: r.type, id: r.id })} />
            <Pagination page={page} pageSize={JOURNAL_PAGE_SIZE} total={ops.data?.total ?? 0} onChange={setPage} />
          </section>
        </div>
      )}
    </Drawer>
  );
}

/** سجل اليوميات: every day with operations, newest first; a file number or a party narrows them. */
export function JournalArchive({ onOpen }: { onOpen: (d: OpenDocument) => void }) {
  const [q, setQ] = useState<JournalDaysQuery>({ page: 1, search: '' });
  const { data, isLoading, error } = useJournalDays(q);
  const [open, setOpen] = useState<string | null>(null);
  const set = (patch: Partial<JournalDaysQuery>) => setQ((p) => ({ ...p, page: 1, ...patch }));
  const filtered = !!(q.from || q.to || q.search);

  const columns: Column<JournalDayRow>[] = [
    { header: 'اليوم', cell: (d) => <span className="font-semibold whitespace-nowrap">{dayTitle(d.date)}</span> },
    { header: 'الحالة', cell: (d) => <Badge tone={DAY_STATUS[d.status].tone}>{DAY_STATUS[d.status].label}</Badge> },
    { header: 'عدد المعاملات', cell: (d) => d.operations },
    { header: 'وارد (جنيه)', cell: (d) => <span className="text-success" dir="ltr">{money(d.totals.EGP.in)}</span> },
    { header: 'منصرف (جنيه)', cell: (d) => <span className="text-danger" dir="ltr">{money(d.totals.EGP.out)}</span> },
    { header: 'وارد (دولار)', cell: (d) => <span className="text-success" dir="ltr">{money(d.totals.USD.in)}</span> },
    { header: 'منصرف (دولار)', cell: (d) => <span className="text-danger" dir="ltr">{money(d.totals.USD.out)}</span> },
  ];

  return (
    <>
      <section className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-60 flex-1">
          <SearchInput value={q.search ?? ''} onChange={(search) => set({ search })} placeholder="رقم الملف أو اسم الطرف (موظف، مستخلص، مندوب، عميل)" />
        </div>
        <TextField label="من" type="date" className="w-40" value={q.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} />
        <TextField label="إلى" type="date" className="w-40" value={q.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} />
        {q.from && q.to && (
          <Button variant="ghost" icon={<FileBarChart className="size-4" />} onClick={() => openJournalReport(q.from!, q.to!)}>
            تقرير الفترة
          </Button>
        )}
        {filtered && (
          <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setQ({ page: 1, search: '' })}>
            مسح الفلاتر
          </Button>
        )}
      </section>
      <DataTable
        columns={columns}
        rows={data?.items}
        rowKey={(d) => d.date}
        loading={isLoading}
        error={error}
        empty={filtered ? 'مفيش يوميات بالفلتر ده' : 'لسه مفيش يوميات'}
        onRowClick={(d) => setOpen(d.date)}
      />
      <div className="mt-4">
        <Pagination page={q.page} pageSize={31} total={data?.total ?? 0} onChange={(page) => setQ((p) => ({ ...p, page }))} />
      </div>
      <DayDrawer date={open} search={q.search ?? ''} onClose={() => setOpen(null)} onOpen={onOpen} />
    </>
  );
}
