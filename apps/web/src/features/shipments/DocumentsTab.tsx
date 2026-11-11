import { ExternalLink, FileText, Trash2, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { IconButton } from '@/components/ui/misc';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { shipmentsApi, type Shipment, type ShipmentDocument } from './api';
import { useShipmentAction } from './use-shipment-action';

const MAX_BYTES = 10 * 1024 * 1024;
const sizeLabel = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The shipment's PDF documents: upload, open, delete. */
export function DocumentsTab({ shipment }: { shipment: Shipment }) {
  const { can } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<ShipmentDocument | null>(null);
  const upload = useShipmentAction(shipment.id, () => shipmentsApi.uploadDocument(shipment.id, name.trim(), file!), 'اترفع المستند');
  const remove = useShipmentAction(shipment.id, (id: number) => shipmentsApi.removeDocument(shipment.id, id), 'اتمسح المستند');

  const choose = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return setProblem('المسموح ملفات PDF بس');
    if (f.size > MAX_BYTES) return setProblem(`حجم الملف ${sizeLabel(f.size)}، والحد الأقصى 10 MB`);
    setProblem('');
    setFile(f);
    if (!name) setName(f.name.replace(/\.pdf$/i, ''));
  };

  const submit = () => {
    if (!file) return setProblem('اختار الملف');
    if (name.trim().length < 2) return setProblem('اكتب اسم المستند (حرفين على الأقل)');
    setProblem('');
    upload.mutateAsync(undefined).then(() => {
      setFile(null);
      setName('');
      if (input.current) input.current.value = '';
    }, () => undefined);
  };

  return (
    <div className="space-y-4">
      {can('shipments.documents.upload') && (
        <div className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files[0]);
            }}
            className={`focus-ring flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
              dragging ? 'border-gold bg-gold/5' : 'border-line hover:border-gold/50'
            }`}
          >
            <UploadCloud className="size-8 text-gold" />
            {file ? (
              <span className="font-semibold">
                {file.name} <span className="text-muted">({sizeLabel(file.size)})</span>
              </span>
            ) : (
              <span className="text-muted">اسحب ملف PDF هنا أو اضغط للاختيار (10 MB بالكتير)</span>
            )}
            <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          </div>
          {file && (
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
              <TextField label="اسم المستند" placeholder="فاتورة تجارية، شهادة منشأ..." maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
              <Button loading={upload.isPending} onClick={submit}>
                رفع
              </Button>
            </div>
          )}
          {problem && (
            <p role="alert" className="text-sm text-danger">
              {problem}
            </p>
          )}
          {upload.error ? <ErrorBox error={upload.error} /> : null}
        </div>
      )}

      {shipment.documents.length === 0 && <EmptyState compact text="مفيش مستندات على الشحنة." />}
      <div className="grid gap-2 sm:grid-cols-2">
        {shipment.documents.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="grid size-10 place-items-center rounded-lg bg-danger/10 text-danger">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{d.name}</div>
              <div className="truncate text-xs text-muted">
                {sizeLabel(d.size)} · {formatDate(d.createdAt)} · {d.uploadedBy.email.split('@')[0]}
              </div>
            </div>
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring rounded-lg p-2 text-muted hover:bg-gold/10 hover:text-gold"
              title="فتح"
              aria-label={`فتح ${d.name}`}
            >
              <ExternalLink className="size-4" />
            </a>
            {can('shipments.documents.delete') && (
              <IconButton label={`حذف ${d.name}`} tone="danger" onClick={() => setDeleting(d)}>
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!deleting}
        title="حذف المستند"
        message={`هتمسح «${deleting?.name}» من الشحنة.`}
        confirmLabel="حذف"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
