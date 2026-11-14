import { useQueryClient } from '@tanstack/react-query';
import { MessageCircle, RefreshCw, Send, Unlink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, PageHeader } from '@/components/ui/misc';
import { Pagination } from '@/components/ui/Pagination';
import { SelectField } from '@/components/ui/SelectField';
import { Spinner } from '@/components/ui/Spinner';
import { toastError, useAction } from '@/lib/mutations';
import {
  notificationKeys,
  notificationsApi,
  useNotificationLog,
  useWhatsappGroups,
  useWhatsappStatus,
  type NotificationRow,
  type WhatsappState,
} from './api';

const STATE: Record<WhatsappState, { label: string; tone: 'success' | 'gold' | 'muted' | 'danger' }> = {
  CONNECTED: { label: 'متصل', tone: 'success' },
  QR: { label: 'مستني المسح', tone: 'gold' },
  CONNECTING: { label: 'جاري الاتصال', tone: 'gold' },
  DISCONNECTED: { label: 'مش متصل', tone: 'danger' },
};

const KIND: Record<NotificationRow['kind'], string> = {
  NEW_SHIPMENT: 'شحنة جديدة',
  ETA_TOMORROW: 'وصول بكرة',
  STUCK: 'شحنات متأخرة',
  TEST: 'تجربة',
};

const STATUS: Record<NotificationRow['status'], { label: string; tone: 'success' | 'gold' | 'danger' }> = {
  SENT: { label: 'اتبعت', tone: 'success' },
  PENDING: { label: 'في الانتظار', tone: 'gold' },
  FAILED: { label: 'متبعتش', tone: 'danger' },
};

/** "15/11/2026 09:00", Cairo time */
const dateTime = (v: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Africa/Cairo',
  })
    .format(new Date(v))
    .replace(',', '');

/** "201001234567:12@s.whatsapp.net" → "+201001234567" */
const phone = (id: string) => `+${id.split(/[:@]/)[0]}`;

/** CEO: the office WhatsApp number, the staff group, and the alerts sent to it. */
export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const status = useWhatsappStatus();
  const s = status.data;
  const connected = s?.state === 'CONNECTED';
  const groups = useWhatsappGroups(connected);
  const [groupId, setGroupId] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [page, setPage] = useState(1);
  const log = useNotificationLog(page);

  useEffect(() => {
    if (s?.group) setGroupId(s.group.jid);
  }, [s?.group]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const link = useAction(notificationsApi.link, { invalidate: [notificationKeys.status] });
  const saveGroup = useAction(
    () => {
      const g = groups.data?.find((x) => x.id === groupId);
      return notificationsApi.setGroup({ jid: groupId, name: g?.name ?? '' });
    },
    { success: 'اتحفظ الجروب', invalidate: [notificationKeys.status] },
  );
  const test = useAction(notificationsApi.test, { success: 'اتبعتت رسالة تجربة للجروب' });
  const retry = useAction(notificationsApi.retry, { invalidate: [['notifications', 'log']] });

  const columns: Column<NotificationRow>[] = [
    { header: 'الوقت', cell: (n) => <span dir="ltr">{dateTime(n.createdAt)}</span> },
    { header: 'النوع', cell: (n) => KIND[n.kind] },
    { header: 'الشحنة', cell: (n) => (n.shipment ? <span dir="ltr">{n.shipment.fileNo}</span> : '—') },
    { header: 'الحالة', cell: (n) => <Badge tone={STATUS[n.status].tone}>{STATUS[n.status].label}</Badge> },
    {
      header: 'الرسالة',
      className: 'max-w-md',
      cell: (n) => (
        <div className="text-start">
          <p className="line-clamp-2 whitespace-pre-line text-muted">{n.text.replace(/\*/g, '')}</p>
          {n.status !== 'SENT' && n.error && <p className="mt-1 text-xs text-danger">{n.error}</p>}
        </div>
      ),
    },
  ];

  if (status.error) return <ErrorBox error={status.error} />;

  return (
    <>
      <PageHeader title="تنبيهات واتساب" />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <MessageCircle className="size-5 text-gold" /> رقم الشركة
            </h3>
            {s && <Badge tone={STATE[s.state].tone}>{STATE[s.state].label}</Badge>}
          </div>

          {!s && <Spinner />}

          {s?.state === 'DISCONNECTED' && (
            <Button onClick={() => link.mutateAsync(undefined).catch(toastError)} loading={link.isPending}>
              ربط رقم واتساب
            </Button>
          )}

          {s?.state === 'CONNECTING' && <p className="text-muted">جاري الاتصال بواتساب...</p>}

          {s?.state === 'QR' && (
            <div className="flex flex-col items-center gap-3">
              {s.qr ? (
                <img src={s.qr} alt="QR" className="size-64 rounded-xl bg-white p-2" />
              ) : (
                <Spinner />
              )}
              <p className="text-center text-sm text-muted">
                من موبايل الرقم: واتساب ← الأجهزة المرتبطة ← ربط جهاز، وامسح الكود
              </p>
            </div>
          )}

          {connected && s.account && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold" dir="ltr">
                  {phone(s.account.id)}
                </p>
                {s.account.name && <p className="text-sm text-muted">{s.account.name}</p>}
              </div>
              <Button variant="ghost" onClick={() => setConfirmLogout(true)}>
                <Unlink className="size-4" /> فك الربط
              </Button>
            </div>
          )}
        </section>

        <section className="card space-y-4 p-5">
          <h3 className="text-lg font-bold">جروب الموظفين</h3>
          {s?.group && (
            <p>
              التنبيهات بتتبعت لـ: <span className="font-semibold text-gold">{s.group.name}</span>
            </p>
          )}
          {connected ? (
            <>
              <SelectField
                label="الجروب"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                options={(groups.data ?? []).map((g) => ({ value: g.id, label: `${g.name} (${g.members})` }))}
                placeholder={groups.isLoading ? 'جاري التحميل...' : 'اختار الجروب'}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  disabled={!s.group}
                  loading={test.isPending}
                  onClick={() => test.mutateAsync(undefined).then(refresh, toastError)}
                >
                  <Send className="size-4" /> رسالة تجربة
                </Button>
                <Button
                  disabled={!groupId || groupId === s.group?.jid}
                  loading={saveGroup.isPending}
                  onClick={() => saveGroup.mutateAsync(undefined).catch(toastError)}
                >
                  حفظ
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">اربط الرقم الأول عشان تختار الجروب.</p>
          )}
        </section>
      </div>

      <div className="mt-6 mb-3 flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">سجل التنبيهات</h3>
        <Button variant="ghost" loading={retry.isPending} onClick={() => retry.mutateAsync(undefined).catch(toastError)}>
          <RefreshCw className="size-4" /> إعادة إرسال اللي متبعتش
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={log.data?.items}
        rowKey={(n) => n.id}
        loading={log.isLoading}
        error={log.error}
        empty="مفيش تنبيهات لسه"
      />
      {log.data && (
        <div className="mt-3">
          <Pagination page={page} pageSize={log.data.pageSize} total={log.data.total} onChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        open={confirmLogout}
        title="فك ربط الرقم"
        message="التنبيهات هتقف لحد ما تربط الرقم تاني."
        confirmLabel="فك الربط"
        onConfirm={() => notificationsApi.logout().then(refresh)}
        onClose={() => setConfirmLogout(false)}
      />
    </>
  );
}
