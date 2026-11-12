import { ExternalLink, FileText, Trash2, UploadCloud } from 'lucide-react';
import { useRef, useState, type MouseEvent } from 'react';
import { toast } from 'sonner';
import { TUNNEL_HEADERS } from '@/lib/api-client';
import { useAuth } from '@/auth/auth-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { DOCUMENT_CATEGORIES, shipmentsApi, type DocumentCategory, type Shipment, type ShipmentDocument } from './api';
import { useShipmentAction } from './use-shipment-action';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Files kept on the office computer (/api/files/…) open through fetch, so the request
 * carries the header that skips a tunnel's warning page; Cloudinary links open directly.
 */
async function openDocument(e: MouseEvent<HTMLAnchorElement>, url: string) {
  if (!url.startsWith('/api/')) return;
  e.preventDefault();
  const tab = window.open('', '_blank');
  try {
    const res = await fetch(url, { headers: TUNNEL_HEADERS });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const link = URL.createObjectURL(blob);
    if (tab) tab.location.href = link;
    else window.open(link, '_blank');
    setTimeout(() => URL.revokeObjectURL(link), 60_000);
  } catch {
    tab?.close();
    toast.error('الملف مش متاح دلوقتي، جرّب تاني');
  }
}
const sizeLabel = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The shipment's PDF files, filed as documents, settlements or receipts: upload, filter, open, delete. */
export function DocumentsTab({ shipment }: { shipment: Shipment }) {
  const { can } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentCategory | ''>('');
  const [filter, setFilter] = useState<DocumentCategory | ''>('');
  const [problem, setProblem] = useState('');
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<ShipmentDocument | null>(null);
  const upload = useShipmentAction(shipment.id, () => shipmentsApi.uploadDocument(shipment.id, name.trim(), category as DocumentCategory, file!), 'اترفع المستند');
  const remove = useShipmentAction(shipment.id, (id: number) => shipmentsApi.removeDocument(shipment.id, id), 'اتمسح المستند');

  const shown = filter ? shipment.documents.filter((d) => d.category === filter) : shipment.documents;

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
    if (!category) return setProblem('اختار نوع الملف: مستند أو تسوية أو إيصال');
    if (name.trim().length < 2) return setProblem('اكتب اسم المستند (حرفين على الأقل)');
    setProblem('');
    upload.mutateAsync(undefined).then(() => {
      setFile(null);
      setName('');
      setCategory('');
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
            <div className="grid items-end gap-3 sm:grid-cols-[12rem_1fr_auto]">
              <SelectField
                label="النوع"
                placeholder="اختار النوع"
                options={Object.entries(DOCUMENT_CATEGORIES).map(([value, c]) => ({ value, label: c.label }))}
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory | '')}
              />
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

      {shipment.documents.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="فلتر النوع">
          {([['', 'الكل', shipment.documents.length], ...Object.entries(DOCUMENT_CATEGORIES).map(([k, c]) => [k, c.plural, shipment.documents.filter((d) => d.category === k).length])] as [DocumentCategory | '', string, number][]).map(
            ([key, label, count]) => (
              <button
                key={key || 'all'}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={`focus-ring flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  filter === key ? 'border-gold bg-gold/15 font-semibold text-gold' : 'border-line text-muted hover:text-ink'
                }`}
              >
                {label}
                <span className="rounded-full bg-surface-2 px-1.5 text-xs">{count}</span>
              </button>
            ),
          )}
        </div>
      )}
      {shown.length === 0 && (
        <EmptyState compact text={shipment.documents.length ? `مفيش ${DOCUMENT_CATEGORIES[filter as DocumentCategory]?.plural ?? 'ملفات'} على الشحنة.` : 'مفيش مستندات على الشحنة.'} />
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="grid size-10 place-items-center rounded-lg bg-danger/10 text-danger">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{d.name}</span>
                <Badge tone="gold">{DOCUMENT_CATEGORIES[d.category]?.label ?? 'مستند'}</Badge>
              </div>
              <div className="truncate text-xs text-muted">
                <bdi>{sizeLabel(d.size)}</bdi> · <bdi>{formatDate(d.createdAt)}</bdi> · <bdi>{d.uploadedBy.email.split('@')[0]}</bdi>
              </div>
            </div>
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => openDocument(e, d.url)}
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
