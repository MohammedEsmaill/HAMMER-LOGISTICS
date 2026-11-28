import { ExternalLink, FileText, FolderInput, Images, Landmark, Ship, Trash2, Truck, UploadCloud, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { toast } from 'sonner';
import { TUNNEL_HEADERS } from '@/lib/api-client';
import { useAuth } from '@/auth/auth-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Drawer } from '@/components/ui/Drawer';
import { IconButton } from '@/components/ui/misc';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { DOCUMENT_SECTIONS, shipmentsApi, type DocumentSection, type Shipment, type ShipmentDocument } from './api';
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

const SECTIONS: { key: DocumentSection; icon: LucideIcon }[] = [
  { key: 'SHIPPING_AGENCY', icon: Ship },
  { key: 'CUSTOMS', icon: Landmark },
  { key: 'TRANSPORT', icon: Truck },
  { key: 'SCANS', icon: Images },
];

const countLabel = (n: number) => (n === 0 ? 'فاضية' : n === 1 ? 'ملف' : n === 2 ? 'ملفين' : n <= 10 ? `${n} ملفات` : `${n} ملف`);

function SectionChips({ value, onChange }: { value: DocumentSection | ''; onChange: (s: DocumentSection) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {SECTIONS.map(({ key }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={`focus-ring rounded-full border px-4 py-2 text-sm transition-colors ${value === key ? 'border-gold bg-gold/15 font-semibold text-gold' : 'border-line text-muted hover:text-ink'}`}
        >
          {DOCUMENT_SECTIONS[key]}
        </button>
      ))}
    </div>
  );
}

/** A shipment's PDF files in four sections: pick a section, upload into it, open, move, delete. */
export function DocumentsTab({ shipment }: { shipment: Shipment }) {
  const { can } = useAuth();
  const [section, setSection] = useState<DocumentSection>('SHIPPING_AGENCY');
  const [uploading, setUploading] = useState(false);
  const [moving, setMoving] = useState<ShipmentDocument | null>(null);
  const [deleting, setDeleting] = useState<ShipmentDocument | null>(null);
  const remove = useShipmentAction(shipment.id, (id: number) => shipmentsApi.removeDocument(shipment.id, id), 'اتمسح المستند');
  const move = useShipmentAction(shipment.id, (to: DocumentSection) => shipmentsApi.moveDocument(shipment.id, moving!.id, to), 'اتنقل الملف');
  const shown = shipment.documents.filter((d) => d.section === section);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {SECTIONS.map(({ key, icon: Icon }) => {
          const n = shipment.documents.filter((d) => d.section === key).length;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={section === key}
              onClick={() => setSection(key)}
              className={`focus-ring flex items-center gap-3 rounded-2xl border p-3 text-start transition-colors ${section === key ? 'border-gold bg-gold/10' : 'border-line hover:border-gold/40'}`}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{DOCUMENT_SECTIONS[key]}</span>
                <span className="text-xs text-muted">{countLabel(n)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">{DOCUMENT_SECTIONS[section]}</h3>
        {can('shipments.documents.upload') && (
          <Button icon={<UploadCloud className="size-4" />} onClick={() => setUploading(true)}>
            رفع ملف
          </Button>
        )}
      </div>

      {shown.length === 0 && <EmptyState compact text="مفيش ملفات في الخانة دي." />}
      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="grid size-10 place-items-center rounded-lg bg-danger/10 text-danger">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{d.name}</div>
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
            {can('shipments.documents.upload') && (
              <IconButton label={`نقل ${d.name} لخانة تانية`} onClick={() => setMoving(d)}>
                <FolderInput className="size-4" />
              </IconButton>
            )}
            {can('shipments.documents.delete') && (
              <IconButton label={`حذف ${d.name}`} tone="danger" onClick={() => setDeleting(d)}>
                <Trash2 className="size-4" />
              </IconButton>
            )}
          </div>
        ))}
      </div>

      <UploadDrawer shipment={shipment} open={uploading} section={section} onClose={() => setUploading(false)} onUploaded={setSection} />
      <Drawer open={!!moving} onClose={() => setMoving(null)} title={`نقل «${moving?.name ?? ''}»`}>
        <SectionChips
          value={moving?.section ?? ''}
          onChange={(to) => {
            if (!moving || to === moving.section) return;
            move.mutateAsync(to).then(() => setMoving(null), () => undefined);
          }}
        />
      </Drawer>
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

function UploadDrawer({
  shipment,
  open,
  section: initial,
  onClose,
  onUploaded,
}: {
  shipment: Shipment;
  open: boolean;
  section: DocumentSection;
  onClose: () => void;
  onUploaded: (s: DocumentSection) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<DocumentSection>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const [dragging, setDragging] = useState(false);
  const upload = useShipmentAction(shipment.id, () => shipmentsApi.uploadDocument(shipment.id, name.trim(), section, file!), 'اترفع الملف');

  useEffect(() => {
    if (!open) return;
    setSection(initial);
    setFile(null);
    setName('');
    setProblem('');
    upload.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open]);

  const choose = (f: File | undefined) => {
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) return setProblem('المسموح ملفات PDF بس');
    if (f.size > MAX_BYTES) return setProblem(`حجم الملف ${sizeLabel(f.size)}، والحد الأقصى 10 MB`);
    setProblem('');
    setFile(f);
    if (!name) setName(f.name.replace(/\.pdf$/i, ''));
  };

  const submit = () => {
    if (name.trim().length < 2) return setProblem('اكتب اسم الملف');
    if (!file) return setProblem('اختار الملف');
    setProblem('');
    upload.mutateAsync(undefined).then(() => {
      onUploaded(section);
      onClose();
    }, () => undefined);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="رفع ملف"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button loading={upload.isPending} onClick={submit}>
            رفع
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-sm font-medium text-muted">الخانة</div>
          <SectionChips value={section} onChange={setSection} />
        </div>
        <TextField label="اسم الملف" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <div className="mb-1.5 text-sm font-medium text-muted">الملف</div>
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
              dragging || file ? 'border-gold bg-gold/5' : 'border-line hover:border-gold/50'
            }`}
          >
            <UploadCloud className="size-8 text-gold" />
            {file ? (
              <span className="font-semibold">
                {file.name} <span className="text-muted">({sizeLabel(file.size)})</span>
              </span>
            ) : (
              <span className="text-muted">PDF · 10 MB بالكتير</span>
            )}
            <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
          </div>
        </div>
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
        {upload.error ? <ErrorBox error={upload.error} /> : null}
      </div>
    </Drawer>
  );
}
