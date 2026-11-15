import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, Download, History, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, PageHeader } from '@/components/ui/misc';
import { api } from '@/lib/api-client';
import { toastError, useAction } from '@/lib/mutations';
import { IntegrityCard } from './IntegrityCard';

type Kind = 'AUTO' | 'MANUAL' | 'PRE_RESTORE' | 'UPLOADED';

interface Backup {
  name: string;
  kind: Kind;
  createdAt: string;
  size: number;
  by: string | null;
}

interface Status {
  dir: string;
  copyDir: string | null;
  keep: number;
  mode: 'local' | 'docker' | null;
  busy: string | null;
  lastError: string | null;
  lastAuto: string | null;
  backups: Backup[];
}

const KINDS: Record<Kind, { label: string; tone: 'gold' | 'muted' | 'success' | 'danger' }> = {
  AUTO: { label: 'تلقائية', tone: 'success' },
  MANUAL: { label: 'يدوية', tone: 'gold' },
  PRE_RESTORE: { label: 'قبل الاسترجاع', tone: 'muted' },
  UPLOADED: { label: 'مرفوعة', tone: 'muted' },
};

const KEY = ['backups'] as const;

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
const size = (b: number) => (b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

async function download(name: string) {
  try {
    const blob = await api.download(`/backups/${encodeURIComponent(name)}/download`);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  } catch (e) {
    toastError(e);
  }
}

/** CEO: the database backups, taken daily by themselves, by hand, and restored. */
export default function BackupsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<Status>('/backups'),
    refetchInterval: (q) => (q.state.data?.busy ? 2000 : 30_000),
  });
  const input = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState<Backup | null>(null);
  const [removing, setRemoving] = useState<Backup | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

  const create = useAction(() => api.post<Backup>('/backups'), { success: 'اتعملت نسخة احتياطية', invalidate: [KEY] });
  const upload = useAction(
    (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<Backup>('/backups/upload', form);
    },
    { success: 'اترفعت النسخة، وتقدر تسترجعها من الجدول', invalidate: [KEY] },
  );

  const columns: Column<Backup>[] = [
    { header: 'التاريخ', cell: (b) => <span dir="ltr">{dateTime(b.createdAt)}</span> },
    { header: 'النوع', cell: (b) => <Badge tone={KINDS[b.kind].tone}>{KINDS[b.kind].label}</Badge> },
    { header: 'الحجم', cell: (b) => <span dir="ltr">{size(b.size)}</span> },
    { header: 'بواسطة', cell: (b) => b.by ?? 'السيستم' },
    {
      header: '',
      cell: (b) => (
        <div className="flex items-center gap-1">
          <IconButton label="تحميل" onClick={() => void download(b.name)}>
            <Download className="size-4" />
          </IconButton>
          <IconButton label="استرجاع" onClick={() => setRestoring(b)}>
            <History className="size-4" />
          </IconButton>
          <IconButton label="حذف" tone="danger" onClick={() => setRemoving(b)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  if (error) return <ErrorBox error={error} />;
  const stale = data && (!data.lastAuto || Date.now() - new Date(data.lastAuto).getTime() > 36 * 3600_000);

  return (
    <>
      <PageHeader
        title="النسخ الاحتياطي"
        actions={
          <>
            <input
              ref={input}
              type="file"
              accept=".dump"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) upload.mutateAsync(file).catch(toastError);
              }}
            />
            <Button variant="ghost" icon={<Upload className="size-4" />} loading={upload.isPending} onClick={() => input.current?.click()}>
              رفع نسخة من جهاز تاني
            </Button>
            <Button icon={<DatabaseBackup className="size-4" />} loading={create.isPending || !!data?.busy} onClick={() => create.mutateAsync(undefined).catch(toastError)}>
              نسخة الآن
            </Button>
          </>
        }
      />

      {data && (
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <div className="text-xs text-muted">آخر نسخة تلقائية</div>
            <div className={`mt-1 font-semibold ${stale ? 'text-danger' : ''}`} dir="ltr" style={{ textAlign: 'right' }}>
              {data.lastAuto ? dateTime(data.lastAuto) : 'لسه متعملتش'}
            </div>
            <div className="mt-1 text-xs text-muted">نسخة كل يوم، ويتحفظ آخر {data.keep} نسخة</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted">مكان النسخ</div>
            <div className="mt-1 truncate text-sm font-semibold" dir="ltr" style={{ textAlign: 'right' }} title={data.dir}>
              {data.dir}
            </div>
            <div className="mt-1 truncate text-xs text-muted" dir="ltr" style={{ textAlign: 'right' }} title={data.copyDir ?? ''}>
              {data.copyDir ? `+ ${data.copyDir}` : 'مفيش فولدر تاني (BACKUP_COPY_DIR)'}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-muted">الحالة</div>
            <div className="mt-1 font-semibold">
              {data.busy ? `جاري: ${data.busy}...` : data.lastError ? <span className="text-danger">فيه مشكلة</span> : <span className="text-success">تمام</span>}
            </div>
            {data.lastError && <div className="mt-1 text-xs text-danger">{data.lastError}</div>}
          </div>
        </div>
      )}

      <DataTable columns={columns} rows={data?.backups} rowKey={(b) => b.name} loading={isLoading} empty="لا توجد نسخ احتياطية بعد" />

      <IntegrityCard />

      <ConfirmDialog
        open={!!restoring}
        title="استرجاع نسخة احتياطية"
        message={
          restoring && (
            <>
              كل البيانات هترجع زي ما كانت يوم <b dir="ltr">{dateTime(restoring.createdAt)}</b>، وأي حاجة اتسجلت بعدها هتتشال.
              <br />
              قبل الاسترجاع هتتعمل نسخة من البيانات الحالية تلقائيًا.
            </>
          )
        }
        confirmLabel="استرجاع"
        onConfirm={async () => {
          const r = await api.post<{ savedFirst: string }>(`/backups/${encodeURIComponent(restoring!.name)}/restore`);
          toast.success('اتسترجعت النسخة', { description: `البيانات اللي كانت قبلها محفوظة في ${r.savedFirst}` });
          await queryClient.invalidateQueries();
        }}
        onClose={() => setRestoring(null)}
      />
      <ConfirmDialog
        open={!!removing}
        title="حذف نسخة احتياطية"
        message="النسخة هتتمسح نهائي من الجهاز."
        confirmLabel="حذف"
        onConfirm={() => api.delete(`/backups/${encodeURIComponent(removing!.name)}`).then(refresh)}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}
