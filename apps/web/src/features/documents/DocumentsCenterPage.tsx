import { useQueryClient } from '@tanstack/react-query';
import { Building2, FileImage, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Drawer } from '@/components/ui/Drawer';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton, PageHeader } from '@/components/ui/misc';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { useAction } from '@/lib/mutations';
import { openFile } from '@/lib/open-file';
import { docKeys, docsApi, OTHER_TYPE, STATUS, useCards, useDocTypes, usePartyDocs, type PartyCard, type PartyDoc } from './api';

const day = (v: string) => v.slice(0, 10);
const daysText = (d: PartyDoc) =>
  d.daysLeft < 0 ? `منتهي من ${-d.daysLeft} يوم` : d.daysLeft === 0 ? 'ينتهي النهارده' : `باقي ${d.daysLeft} يوم`;

/** Add or renew a paper: the dates are required, and renewing replaces the file. */
function DocForm({ card, doc, open, onClose }: { card: PartyCard; doc: PartyDoc | null; open: boolean; onClose: () => void }) {
  const { data: types = [] } = useDocTypes();
  const input = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ typeId: '', title: '', number: '', issueDate: '', expiryDate: '', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState('');
  const isOther = types.find((t) => String(t.id) === f.typeId)?.name === OTHER_TYPE;

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setProblem('');
    setF({
      typeId: doc ? String(doc.type.id) : '',
      title: doc?.title ?? '',
      number: doc?.number ?? '',
      issueDate: doc ? day(doc.issueDate) : '',
      expiryDate: doc ? day(doc.expiryDate) : '',
      notes: doc?.notes ?? '',
    });
  }, [open, doc]);

  const save = useAction(
    () => {
      const form = new FormData();
      if (!doc) form.append('clientId', String(card.client.id));
      if (card.factory) form.append('factoryId', String(card.factory.id));
      for (const [k, v] of Object.entries(f)) form.append(k, v.trim());
      if (file) form.append('file', file);
      return docsApi.save(doc?.id ?? null, form);
    },
    { success: doc ? (file ? 'اتجدد المستند' : 'اتحفظ المستند') : 'اترفع المستند', invalidate: [docKeys.all] },
  );

  const submit = () => {
    if (!f.typeId) return setProblem('اختار نوع المستند');
    if (isOther && !f.title.trim()) return setProblem('اكتب اسم المستند');
    if (!f.issueDate || !f.expiryDate) return setProblem('تاريخ الإصدار وتاريخ الانتهاء مطلوبين');
    if (f.expiryDate < f.issueDate) return setProblem('تاريخ الانتهاء لازم يكون بعد تاريخ الإصدار');
    if (!doc && !file) return setProblem('اختار ملف المستند');
    setProblem('');
    save.mutateAsync(undefined).then(onClose, () => undefined);
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={doc ? `تعديل / تجديد ${doc.title || doc.type.name}` : 'مستند جديد'}
      subtitle={card.factory ? `${card.factory.name} — ${card.client.name}` : card.client.name}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            حفظ
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <SelectField label="نوع المستند" value={f.typeId} onChange={set('typeId')} options={types.map((t) => ({ value: t.id, label: t.name }))} />
        {isOther && <TextField label="اسم المستند" value={f.title} onChange={set('title')} maxLength={150} />}
        <TextField label="رقم المستند (اختياري)" dir="ltr" value={f.number} onChange={set('number')} maxLength={60} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="تاريخ الإصدار" type="date" value={f.issueDate} onChange={set('issueDate')} />
          <TextField label="تاريخ الانتهاء" type="date" allowFuture value={f.expiryDate} onChange={set('expiryDate')} />
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-muted">{doc ? 'ملف جديد (للتجديد، اختياري)' : 'الملف'}</span>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button variant="ghost" onClick={() => input.current?.click()}>
            {file ? file.name : 'اختار ملف PDF أو صورة'}
          </Button>
          {doc && file && <p className="mt-1 text-xs text-muted">الملف القديم هيتمسح ويتحط الجديد مكانه.</p>}
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">ملاحظات</span>
          <textarea rows={3} maxLength={500} value={f.notes} onChange={set('notes')} className="w-full rounded-xl border border-line bg-surface-2 p-3 outline-none focus:border-gold" />
        </label>
        {problem && <p className="text-sm text-danger">{problem}</p>}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </div>
    </Drawer>
  );
}

/** One card's data and papers. */
function CardDrawer({ card, onClose }: { card: PartyCard | null; onClose: () => void }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const manage = can('documents.manage');
  const { data: docs, isLoading, error } = usePartyDocs(card?.client.id ?? null, card?.factory?.id ?? null);
  const [editing, setEditing] = useState<PartyDoc | 'new' | null>(null);
  const [removing, setRemoving] = useState<PartyDoc | null>(null);
  const info = card?.details;

  return (
    <>
      <Drawer
        open={!!card}
        onClose={onClose}
        width="max-w-4xl"
        title={card ? (card.factory ? card.factory.name : card.client.name) : ''}
        subtitle={card?.factory ? card.client.name : undefined}
      >
        {card && (
          <div className="space-y-5">
            {info && (
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['المصنع', info.name],
                  ['الرقم الضريبي', info.taxNumber],
                  ['السجل التجاري', info.commercialRegister],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-surface-2 px-3 py-2.5">
                    <div className="text-xs text-muted">{label}</div>
                    <div className="font-semibold" dir="auto">
                      {value}
                    </div>
                  </div>
                ))}
                <div className="rounded-xl bg-surface-2 px-3 py-2.5 sm:col-span-3">
                  <div className="text-xs text-muted">العنوان</div>
                  <div className="font-semibold">{info.address}</div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gold">المستندات</h3>
              {manage && (
                <Button className="h-9 px-3 text-sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
                  مستند جديد
                </Button>
              )}
            </div>
            {error ? <ErrorBox error={error} /> : null}
            {isLoading && <div className="h-32 rounded-2xl shimmer" />}
            {docs?.length === 0 && <EmptyState compact text="لا توجد مستندات بعد" />}
            <div className="space-y-3">
              {docs?.map((d) => (
                <div key={d.id} className={`rounded-xl border p-4 ${d.status === 'EXPIRED' ? 'border-danger/40' : d.status === 'EXPIRING' ? 'border-gold/40' : 'border-line'}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <button
                      onClick={() => void openFile(d.url)}
                      className="focus-ring grid size-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold hover:bg-gold/20"
                      title={`فتح ${d.fileName}`}
                      aria-label={`فتح ${d.title || d.type.name}`}
                    >
                      {d.mimeType.startsWith('image/') ? <FileImage className="size-5" /> : <FileText className="size-5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{d.title || d.type.name}</span>
                        {d.title && <span className="text-xs text-muted">({d.type.name})</span>}
                        <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                        <span className={`text-xs ${d.status === 'EXPIRED' ? 'text-danger' : d.status === 'EXPIRING' ? 'text-gold' : 'text-muted'}`}>{daysText(d)}</span>
                      </div>
                      <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                        <div>
                          <span className="text-muted">الرقم: </span>
                          <span dir="ltr">{d.number ?? '—'}</span>
                        </div>
                        <div>
                          <span className="text-muted">الإصدار: </span>
                          {formatDate(d.issueDate)}
                        </div>
                        <div>
                          <span className="text-muted">الانتهاء: </span>
                          <b>{formatDate(d.expiryDate)}</b>
                        </div>
                      </div>
                      {d.notes && <p className="mt-1 text-sm text-muted">{d.notes}</p>}
                      <p className="mt-1 text-xs text-muted">
                        {d.updatedBy ? 'آخر تعديل: ' : 'رفعه: '}
                        <span dir="ltr">{(d.updatedBy ?? d.createdBy).email.split('@')[0]}</span> · {formatDate(d.updatedBy ? d.updatedAt : d.createdAt)}
                      </p>
                    </div>
                    {manage && (
                      <div className="flex">
                        <IconButton label="تعديل / تجديد" onClick={() => setEditing(d)}>
                          <Pencil className="size-4" />
                        </IconButton>
                        <IconButton label="حذف" tone="danger" onClick={() => setRemoving(d)}>
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Drawer>
      {card && <DocForm card={card} doc={editing === 'new' ? null : editing} open={!!editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!removing}
        title="حذف المستند"
        message={`${removing?.title || removing?.type.name} هيتمسح هو وملفه نهائي.`}
        confirmLabel="حذف"
        onConfirm={() => docsApi.remove(removing!.id).then(() => queryClient.invalidateQueries({ queryKey: docKeys.all }))}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

/** The documents center: a card per client, or per factory of a client with several. */
export default function DocumentsCenterPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'' | 'EXPIRED' | 'EXPIRING'>('');
  const { data: cards, isLoading, error } = useCards(search);
  // the bell links here with ?client=…&factory=…
  const selected = useMemo(() => {
    const client = Number(params.get('client'));
    const factory = Number(params.get('factory')) || null;
    return cards?.find((c) => c.client.id === client && (c.factory?.id ?? null) === (c.factory ? factory : null)) ?? null;
  }, [cards, params]);
  const open = (c: PartyCard) => setParams(c.factory ? { client: String(c.client.id), factory: String(c.factory.id) } : { client: String(c.client.id) });
  const shown = cards?.filter((c) => !filter || c.counts[filter] > 0);
  const total = (k: 'EXPIRED' | 'EXPIRING' | 'VALID') => cards?.reduce((n, c) => n + c.counts[k], 0) ?? 0;

  return (
    <>
      <PageHeader title="مركز المستندات" />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {(
          [
            ['EXPIRED', 'منتهية', 'text-danger'],
            ['EXPIRING', 'تنتهي خلال 30 يوم', 'text-gold'],
            ['VALID', 'سارية', 'text-success'],
          ] as const
        ).map(([k, label, tone]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k === 'VALID' || filter === k ? '' : k)}
            className={`card p-4 text-start hover:border-gold/60 ${filter === k ? 'border-gold' : ''}`}
          >
            <div className="text-xs text-muted">{label}</div>
            <div className={`mt-1 text-2xl font-bold ${tone}`}>{total(k)}</div>
          </button>
        ))}
      </div>
      <div className="mb-4 max-w-xl">
        <SearchInput value={search} onChange={setSearch} placeholder="ابحث باسم العميل أو المصنع" />
      </div>
      {error ? <ErrorBox error={error} /> : null}
      {isLoading && <div className="h-40 rounded-2xl shimmer" />}
      {shown?.length === 0 && <EmptyState text={filter ? 'لا يوجد عملاء بمستندات بهذه الحالة' : 'لا يوجد عملاء'} />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown?.map((c) => (
          <button key={c.key} type="button" onClick={() => open(c)} className="card focus-ring space-y-3 p-4 text-start hover:border-gold/60">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold">
                <Building2 className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold">{c.factory ? c.factory.name : c.client.name}</span>
                <span className="block truncate text-xs text-muted">{c.factory ? c.client.name : (c.details?.name ?? 'بدون مصنع')}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {c.counts.EXPIRED > 0 && <Badge tone="danger">{c.counts.EXPIRED} منتهي</Badge>}
              {c.counts.EXPIRING > 0 && <Badge tone="gold">{c.counts.EXPIRING} ينتهي قريبًا</Badge>}
              {c.counts.VALID > 0 && <Badge tone="success">{c.counts.VALID} ساري</Badge>}
              {c.total === 0 && <Badge>لا توجد مستندات</Badge>}
            </div>
          </button>
        ))}
      </div>
      <CardDrawer card={selected} onClose={() => setParams({})} />
    </>
  );
}
