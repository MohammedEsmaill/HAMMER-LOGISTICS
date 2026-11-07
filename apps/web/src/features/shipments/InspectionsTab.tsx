import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Badge, IconButton } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { useLookup } from '../lookups/api';
import { shipmentsApi, type InspectionItem, type Shipment } from './api';
import { dayValue, useShipmentAction } from './use-shipment-action';

const RESULTS = {
  PENDING: { label: 'منتظر', tone: 'muted' },
  ACCEPTED: { label: 'مقبول', tone: 'success' },
  REJECTED: { label: 'مرفوض', tone: 'danger' },
} as const;
const RESULT_OPTIONS = Object.entries(RESULTS).map(([value, r]) => ({ value, label: r.label }));
const today = () => new Date().toISOString().slice(0, 10);

function InspectionRow({ shipment, item, authority, editable }: { shipment: Shipment; item: InspectionItem; authority: string; editable: boolean }) {
  const [result, setResult] = useState<InspectionItem['result']>(item.result);
  const [resultDate, setResultDate] = useState(dayValue(item.resultDate));
  const [notes, setNotes] = useState(item.notes ?? '');
  const [deleting, setDeleting] = useState(false);
  const update = useShipmentAction(
    shipment.id,
    () =>
      shipmentsApi.updateInspection(shipment.id, item.id, {
        version: shipment.version,
        result,
        resultDate: result === 'PENDING' ? null : resultDate || today(),
        notes: notes.trim() || null,
      }),
    'اتحفظ العرض الرقابي',
  );
  const remove = useShipmentAction(
    shipment.id,
    () => shipmentsApi.removeInspection(shipment.id, item.id, shipment.version),
    'اتمسح طلب العرض الرقابي',
  );
  const changed = result !== item.result || resultDate !== dayValue(item.resultDate) || notes !== (item.notes ?? '');

  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="size-5 text-gold" />
        <div className="flex-1">
          <div className="font-semibold">{authority}</div>
          <div className="text-xs text-muted">اتطلب {formatDate(item.requestedAt)}</div>
        </div>
        <Badge tone={RESULTS[item.result].tone}>
          {RESULTS[item.result].label}
          {item.resultDate && ` · ${formatDate(item.resultDate)}`}
        </Badge>
        {editable && (
          <IconButton label="حذف الطلب" tone="danger" onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>
      {editable ? (
        <div className="grid items-end gap-3 sm:grid-cols-[9rem_10rem_1fr_auto]">
          <SelectField label="النتيجة" options={RESULT_OPTIONS} value={result} onChange={(e) => setResult(e.target.value as InspectionItem['result'])} />
          <TextField label="تاريخ النتيجة" type="date" max={today()} disabled={result === 'PENDING'} value={resultDate} onChange={(e) => setResultDate(e.target.value)} />
          <TextField label="ملاحظات" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button variant="ghost" disabled={!changed} loading={update.isPending} onClick={() => update.mutate(undefined)}>
            حفظ
          </Button>
        </div>
      ) : (
        item.notes && <p className="text-sm text-muted">{item.notes}</p>
      )}
      {update.error ? <ErrorBox error={update.error} /> : null}
      <ConfirmDialog
        open={deleting}
        title="حذف طلب العرض الرقابي"
        message={`هتمسح طلب ${authority}.`}
        confirmLabel="حذف"
        onConfirm={() => remove.mutateAsync(undefined)}
        onClose={() => setDeleting(false)}
      />
    </div>
  );
}

/** العرض الرقابي: one request per authority, each with its result. */
export function InspectionsTab({ shipment }: { shipment: Shipment }) {
  const { can } = useAuth();
  const editable = can('shipments.customs.update');
  const { data: authorities = [] } = useLookup('inspection-authorities');
  const [authorityId, setAuthorityId] = useState('');
  const [requestedAt, setRequestedAt] = useState(today());
  const [problem, setProblem] = useState('');
  const add = useShipmentAction(
    shipment.id,
    () =>
      shipmentsApi.addInspection(shipment.id, {
        version: shipment.version,
        authorityId: Number(authorityId),
        requestedAt,
        result: 'PENDING',
        resultDate: null,
        notes: null,
      }),
    'اتضاف طلب العرض الرقابي',
  );
  const nameOf = (id: number) => authorities.find((a) => a.id === id)?.name ?? '...';

  const submit = () => {
    if (!authorityId) return setProblem('اختار الجهة');
    if (!requestedAt || requestedAt > today()) return setProblem('تاريخ الطلب مينفعش يبقى فاضي أو في المستقبل');
    setProblem('');
    add.mutateAsync(undefined).then(() => setAuthorityId(''), () => undefined);
  };

  return (
    <div className="space-y-4">
      {editable && (
        <div className="grid items-end gap-3 rounded-xl border border-dashed border-gold/40 p-4 sm:grid-cols-[1fr_11rem_auto]">
          <SelectField
            label="جهة الفحص"
            options={authorities.map((a) => ({ value: a.id, label: a.name }))}
            value={authorityId}
            onChange={(e) => setAuthorityId(e.target.value)}
          />
          <TextField label="تاريخ الطلب" type="date" max={today()} value={requestedAt} onChange={(e) => setRequestedAt(e.target.value)} />
          <Button icon={<Plus className="size-4" />} loading={add.isPending} onClick={submit}>
            إضافة
          </Button>
          {problem && (
            <p role="alert" className="text-sm text-danger sm:col-span-3">
              {problem}
            </p>
          )}
          {add.error ? (
            <div className="sm:col-span-3">
              <ErrorBox error={add.error} />
            </div>
          ) : null}
        </div>
      )}
      {shipment.inspections.length === 0 && <p className="py-6 text-center text-muted">مفيش طلبات عرض رقابي على الشحنة.</p>}
      {shipment.inspections.map((item) => (
        <InspectionRow key={`${item.id}-${shipment.version}`} shipment={shipment} item={item} authority={nameOf(item.authorityId)} editable={editable} />
      ))}
    </div>
  );
}
