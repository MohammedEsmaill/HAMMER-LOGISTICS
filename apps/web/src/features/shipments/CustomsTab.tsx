import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate } from '@/lib/format';
import { useLookup } from '../lookups/api';
import { shipmentsApi, type Shipment } from './api';
import { Info } from './OverviewTab';
import { CUSTOMS_LABELS, SHIPMENT_TYPES, type CustomsField } from './rules';
import { dayValue, useShipmentAction } from './use-shipment-action';

type Values = Partial<Record<CustomsField, string>>;

const valuesOf = (s: Shipment, fields: readonly CustomsField[]): Values =>
  Object.fromEntries(
    fields.map((f) => {
      if (f === 'certificateNo') return [f, s.certificateNo ?? ''];
      if (f === 'storageYardId') return [f, s.storageYardId ? String(s.storageYardId) : ''];
      return [f, dayValue(s[f])];
    }),
  );

/** The Nafeza tab: the customs fields of this shipment type, saved together. */
export function CustomsTab({ shipment }: { shipment: Shipment }) {
  const { can } = useAuth();
  const editable = can('shipments.customs.update');
  const fields = SHIPMENT_TYPES[shipment.kind].customsFields;
  const initial = useMemo(() => valuesOf(shipment, fields), [shipment, fields]);
  const [values, setValues] = useState<Values>(initial);
  const [problem, setProblem] = useState('');
  useEffect(() => setValues(initial), [initial]);

  // the yard sits in the Egyptian end of the route: discharge for import, loading for export
  const port = shipment.direction === 'IMPORT' ? shipment.dischargePort : shipment.loadingPort;
  const { data: yards = [] } = useLookup('storage-yards', {
    kind: shipment.mode === 'AIR' ? 'AIR' : 'SEA',
    portId: port?.id,
  });

  const changed = fields.filter((f) => (values[f] ?? '') !== (initial[f] ?? ''));
  const save = useShipmentAction(
    shipment.id,
    () => {
      const body: Record<string, unknown> = { version: shipment.version };
      for (const f of changed) {
        const v = values[f]?.trim() ?? '';
        body[f] = v === '' ? null : f === 'storageYardId' ? Number(v) : v;
      }
      return shipmentsApi.updateCustoms(shipment.id, body as { version: number });
    },
    'اتحفظت بيانات النافذة',
  );

  const submit = () => {
    const today = new Date().toISOString().slice(0, 10);
    const future = changed.find((f) => f !== 'certificateNo' && f !== 'storageYardId' && (values[f] ?? '') > today);
    if (future) return setProblem(`${CUSTOMS_LABELS[future]} مينفعش يبقى في المستقبل`);
    if ((values.certificateNo ?? '').length > 40) return setProblem('رقم الشهادة 40 حرف بالكتير');
    setProblem('');
    save.mutate(undefined);
  };

  if (!editable) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <Info key={f} label={CUSTOMS_LABELS[f]} ltr={f === 'certificateNo'}>
            {f === 'certificateNo' ? shipment.certificateNo : f === 'storageYardId' ? shipment.storageYard?.name : formatDate(shipment[f])}
          </Info>
        ))}
      </div>
    );
  }

  const set = (f: CustomsField) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) =>
          f === 'certificateNo' ? (
            <TextField key={f} label={CUSTOMS_LABELS[f]} dir="ltr" maxLength={40} value={values[f] ?? ''} onChange={set(f)} />
          ) : f === 'storageYardId' ? (
            <SelectField
              key={f}
              label={CUSTOMS_LABELS[f]}
              placeholder={port ? `ساحات ${port.name}` : 'اختار الساحة'}
              options={yards.map((y) => ({ value: y.id, label: y.name }))}
              value={values[f] ?? ''}
              onChange={set(f)}
            />
          ) : (
            <TextField key={f} label={CUSTOMS_LABELS[f]} type="date" value={values[f] ?? ''} onChange={set(f)} />
          ),
        )}
      </div>
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {save.error ? <ErrorBox error={save.error} /> : null}
      <div className="flex items-center justify-end gap-3">
        {changed.length > 0 && <span className="text-sm text-muted">{changed.length} تعديل مش محفوظ</span>}
        <Button variant="ghost" disabled={!changed.length} onClick={() => setValues(initial)}>
          تراجع
        </Button>
        <Button disabled={!changed.length} loading={save.isPending} onClick={submit}>
          حفظ
        </Button>
      </div>
    </div>
  );
}
