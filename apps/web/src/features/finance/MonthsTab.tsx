import { useQueryClient } from '@tanstack/react-query';
import { CircleAlert, Lock, LockOpen, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useAuth, useIsTopManager } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge } from '@/components/ui/misc';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { toastError } from '@/lib/mutations';
import { money } from './api';
import { closeKeys, monthName, monthsApi, useMonthCheck, useMonths, type FiscalMonth, type MonthIssue } from './close-api';
import { glKeys } from './gl-api';

function Net({ v }: { v: string }) {
  const n = Number(v);
  return <span className={`tabular-nums ${n < 0 ? 'text-danger' : n > 0 ? 'text-success' : 'text-muted'}`}>{n === 0 ? '—' : money(v)}</span>;
}

function Issues({ items, tone }: { items: MonthIssue[]; tone: 'danger' | 'warning' }) {
  const Icon = tone === 'danger' ? CircleAlert : TriangleAlert;
  return (
    <ul className="space-y-2">
      {items.map((i, n) => (
        <li key={n} className={`rounded-xl border p-3 text-sm ${tone === 'danger' ? 'border-danger/40 bg-danger/5' : 'border-warning/40 bg-warning/5'}`}>
          <div className={`flex items-center gap-2 font-semibold ${tone === 'danger' ? 'text-danger' : 'text-warning'}`}>
            <Icon className="size-4 shrink-0" /> {i.title}
            {i.link && (
              <Link to={i.link} className="ms-auto text-xs font-normal text-gold hover:underline">
                افتح
              </Link>
            )}
          </div>
          {i.detail && <div className="mt-1 text-xs text-muted">{i.detail}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Before closing: what stops it, what to know, and the month's figures. */
function CloseDrawer({ month, onClose }: { month: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, error, isFetching } = useMonthCheck(month);
  const [busy, setBusy] = useState(false);
  const close = async () => {
    if (!month) return;
    setBusy(true);
    try {
      await monthsApi.close(month);
      toast.success(`اتقفل شهر ${monthName(month)}`);
      await queryClient.invalidateQueries({ queryKey: closeKeys.months });
      await queryClient.invalidateQueries({ queryKey: glKeys.all });
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={!!month}
      onClose={onClose}
      title={month ? `قفل شهر ${monthName(month)}` : ''}
      subtitle={data ? `من ${formatDate(data.from)} إلى ${formatDate(data.to)}` : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button icon={<Lock className="size-4" />} disabled={!data || data.blockers.length > 0 || isFetching} loading={busy} onClick={close}>
            اقفل الشهر
          </Button>
        </div>
      }
    >
      {error ? (
        <ErrorBox error={error} />
      ) : !data ? (
        <Spinner className="mx-auto my-10 size-7 text-gold" />
      ) : (
        <div className="space-y-5">
          {data.blockers.length > 0 ? (
            <section className="space-y-2">
              <h3 className="font-bold text-danger">لازم يتحلّوا الأول</h3>
              <Issues items={data.blockers} tone="danger" />
            </section>
          ) : (
            <div className="rounded-xl border border-success/40 bg-success/5 p-3 text-sm font-semibold text-success">الشهر جاهز للقفل</div>
          )}
          {data.warnings.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-bold text-warning">للعلم (مش بيمنع القفل)</h3>
              <Issues items={data.warnings} tone="warning" />
            </section>
          )}
          <section>
            <h3 className="mb-2 font-bold">أرقام الشهر اللي هتتحفظ</h3>
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-muted">
                <tr>
                  <th className="px-3 py-2">العملة</th>
                  <th className="px-3 py-2">الإيرادات</th>
                  <th className="px-3 py-2">المصروفات</th>
                  <th className="px-3 py-2">صافي الربح</th>
                </tr>
              </thead>
              <tbody>
                {(['EGP', 'USD'] as const).map((c) => (
                  <tr key={c} className="border-t border-line">
                    <td className="px-3 py-2 font-semibold">{c === 'EGP' ? 'جنيه' : 'دولار'}</td>
                    <td className="px-3 py-2 tabular-nums">{money(data.figures[c].revenues)}</td>
                    <td className="px-3 py-2 tabular-nums">{money(data.figures[c].expenses)}</td>
                    <td className="px-3 py-2">
                      <Net v={data.figures[c].net} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <p className="text-xs text-muted">
            بعد القفل محدش يقدر يسجّل أو يعدّل حاجة تاريخها في الشهر ده غير المدير التنفيذي، وأي تعديل منه بيظهر في فحص الدفاتر. ربح الشهر بيظهر في الميزانية «أرباح
            مرحّلة».
          </p>
        </div>
      )}
    </Drawer>
  );
}

function ReopenDrawer({ month, onClose }: { month: FiscalMonth | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const reopen = async () => {
    if (!month) return;
    setBusy(true);
    try {
      await monthsApi.reopen(month.month, reason.trim());
      toast.success(`اتفتح شهر ${monthName(month.month)}`);
      await queryClient.invalidateQueries({ queryKey: closeKeys.months });
      await queryClient.invalidateQueries({ queryKey: glKeys.all });
      setReason('');
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      open={!!month}
      onClose={onClose}
      title={month ? `فتح شهر ${monthName(month.month)}` : ''}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button icon={<LockOpen className="size-4" />} disabled={reason.trim().length < 5} loading={busy} onClick={reopen}>
            افتح الشهر
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <TextField label="سبب الفتح" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: تصحيح فاتورة اتسجلت غلط" />
        <p className="text-xs text-muted">الفتح بيتسجل في سجل العمليات باسمك والسبب. لما الشهر يتقفل تاني أرقامه بتتحفظ من جديد.</p>
      </div>
    </Drawer>
  );
}

/** The months: their figures, who closed them, and the next one to close. */
export function MonthsTab() {
  const { can } = useAuth();
  const isCeo = useIsTopManager();
  const mayClose = can('finance.months.close');
  const { data = [], error, isLoading } = useMonths();
  const [closing, setClosing] = useState<string | null>(null);
  const [reopening, setReopening] = useState<FiscalMonth | null>(null);
  if (error) return <ErrorBox error={error} />;
  if (isLoading) return <Spinner className="mx-auto my-10 size-7 text-gold" />;
  // months close oldest first: only the oldest open one is offered
  const nextToClose = [...data].reverse().find((m) => m.status === 'OPEN')?.month;
  const lastClosed = data.find((m) => m.status === 'CLOSED')?.month;

  return (
    <div className="space-y-3">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="px-3 py-2">الشهر</th>
              <th className="px-3 py-2">الحالة</th>
              <th className="px-3 py-2">صافي الربح (جنيه)</th>
              <th className="px-3 py-2">صافي الربح (دولار)</th>
              <th className="px-3 py-2">اتقفل بواسطة</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.month} className="border-t border-line">
                <td className="px-3 py-2.5 font-bold">{monthName(m.month)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap justify-center gap-1">
                    {m.status === 'CLOSED' ? <Badge tone="gold">مقفول</Badge> : m.status === 'CURRENT' ? <Badge tone="info">الشهر الحالي</Badge> : <Badge>مفتوح</Badge>}
                    {m.changedSinceClose.length > 0 && <Badge tone="warning">اتعدّل بعد القفل</Badge>}
                    {m.status === 'OPEN' && m.reopenedAt && <Badge tone="danger">اتفتح تاني</Badge>}
                  </div>
                  {m.status === 'OPEN' && m.reopenReason && <div className="mt-1 text-xs text-muted">السبب: {m.reopenReason}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <Net v={m.figures.EGP.net} />
                </td>
                <td className="px-3 py-2.5">
                  <Net v={m.figures.USD.net} />
                </td>
                <td className="px-3 py-2.5 text-muted">
                  {m.closedBy ? (
                    <>
                      {m.closedBy}
                      <div className="text-xs">{m.closedAt && formatDate(m.closedAt)}</div>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {mayClose && m.month === nextToClose && (
                    <Button icon={<Lock className="size-4" />} onClick={() => setClosing(m.month)}>
                      قفل الشهر
                    </Button>
                  )}
                  {isCeo && m.month === lastClosed && (
                    <Button variant="ghost" icon={<LockOpen className="size-4" />} onClick={() => setReopening(m)}>
                      فتح
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        الشهور بتتقفل بالترتيب من الأقدم، بعد ما الشهر يخلص، ومن غير معاملات مستنية اعتماد. العهد المفتوحة والبنوك اللي مش متسوّية تنبيه بس. الفتح للمدير التنفيذي بس،
        من آخر شهر مقفول.
      </p>
      <CloseDrawer month={closing} onClose={() => setClosing(null)} />
      <ReopenDrawer month={reopening} onClose={() => setReopening(null)} />
    </div>
  );
}
