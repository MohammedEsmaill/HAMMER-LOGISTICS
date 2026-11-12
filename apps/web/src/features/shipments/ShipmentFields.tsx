import { Plus, Trash2 } from 'lucide-react';
import { Controller, useFieldArray, useWatch, type FieldPath, type UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/Button';
import { ComboField } from '@/components/ui/ComboField';
import { IconButton } from '@/components/ui/misc';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatMoney } from '@/lib/format';
import { useCountries, useLookup, usePorts } from '../lookups/api';
import { useClearerOptions, useClientOptions, useFactories } from './api';
import { CONTAINER_TYPES, partyLabels, REGIMES, type TypeRules } from './rules';
import type { ShipmentFormIn, ShipmentFormOut } from './shipment-form';

export type ShipmentForm = UseFormReturn<ShipmentFormIn, unknown, ShipmentFormOut>;
export type FormTab = 'basic' | 'shipping' | 'containers';

const CONTAINER_OPTIONS = Object.entries(CONTAINER_TYPES).map(([value, label]) => ({ value, label }));
const REGIME_OPTIONS = Object.entries(REGIMES).map(([value, label]) => ({ value, label }));

function errorAt(form: ShipmentForm, path: string): string | undefined {
  const parts = path.split('.');
  let node: unknown = form.formState.errors;
  for (const p of parts) node = (node as Record<string, unknown> | undefined)?.[p];
  return (node as { message?: string } | undefined)?.message;
}

/** A searchable picker bound to one form field. */
function Combo({
  form,
  name,
  label,
  options,
  placeholder,
  disabled,
  onPicked,
}: {
  form: ShipmentForm;
  name: FieldPath<ShipmentFormIn>;
  label: string;
  options: { value: number | string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  onPicked?: () => void;
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <ComboField
          label={label}
          options={options}
          value={field.value as number | string | undefined}
          onChange={(v) => {
            field.onChange(v);
            onPicked?.();
          }}
          onBlur={field.onBlur}
          placeholder={placeholder}
          disabled={disabled}
          error={errorAt(form, name)}
        />
      )}
    />
  );
}

export function BasicFields({ form, rules }: { form: ShipmentForm; rules: TypeRules }) {
  const { register } = form;
  const labels = partyLabels(rules.direction);
  const clientId = useWatch({ control: form.control, name: 'clientId' });
  const { data: clients = [] } = useClientOptions();
  const { data: factories = [] } = useFactories(clientId ? Number(clientId) : undefined);
  const { data: clearers = [] } = useClearerOptions();
  const { data: countries = [] } = useCountries();
  // the shipment's Egyptian side: discharge port (import), loading port (export), or free zone
  const [dischargePortId, loadingPortId, freeZoneId] = useWatch({ control: form.control, name: ['dischargePortId', 'loadingPortId', 'freeZoneId'] });
  const place = rules.freeZone
    ? { zone: Number(freeZoneId) || 0 }
    : { port: Number(rules.direction === 'IMPORT' ? dischargePortId : loadingPortId) || 0 };
  const works = (c: (typeof clearers)[number]) =>
    'zone' in place ? !!place.zone && c.freeZoneIds.includes(place.zone) : !!place.port && c.portIds.includes(place.port);
  // everyone stays pickable; who works at the shipment's place comes first
  const clearerOptions = [...clearers]
    .sort((a, b) => Number(works(b)) - Number(works(a)))
    .map((c) => ({ value: c.id, label: works(c) ? `${c.fullName} ✓` : c.fullName }));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Combo
        form={form}
        name="clientId"
        label="العميل"
        options={clients.map((c) => ({ value: c.id, label: c.name }))}
        // a factory belongs to one client: picking another client clears it
        onPicked={() => form.setValue('factoryId', '')}
      />
      <Combo
        form={form}
        name="factoryId"
        label="المصنع"
        disabled={!clientId}
        placeholder={clientId ? 'اختار المصنع' : 'اختار العميل الأول'}
        options={factories.map((f) => ({ value: f.id, label: `${f.name} (${f.taxNumber})` }))}
      />
      <Combo form={form} name="clearerId" label="المستخلص" options={clearerOptions} />
      <Combo form={form} name="countryId" label={labels.country} options={countries.map((c) => ({ value: c.id, label: `${c.nameAr} · ${c.nameEn}` }))} />
      <TextField label={labels.foreignParty} error={errorAt(form, 'foreignPartyName')} {...register('foreignPartyName')} />
      <TextField label={labels.consignee} error={errorAt(form, 'consignee')} {...register('consignee')} />
      <TextField label="نوع البضاعة" className="sm:col-span-2" error={errorAt(form, 'commodity')} {...register('commodity')} />
      {rules.customsRegime && (
        <SelectField label="النظام الجمركي" options={REGIME_OPTIONS} error={errorAt(form, 'customsRegime')} {...register('customsRegime')} />
      )}
      <TextField label="تاريخ الإخطار" type="date" error={errorAt(form, 'notificationDate')} {...register('notificationDate')} />
      <TextField label="عدد الطرود" type="number" min={1} dir="ltr" error={errorAt(form, 'packagesCount')} {...register('packagesCount')} />
      {!rules.containers && (
        <TextField
          label="الوزن الكلي (كجم)"
          type="number"
          step="0.001"
          min={0}
          dir="ltr"
          error={errorAt(form, 'totalWeight')}
          {...register('totalWeight')}
        />
      )}
    </div>
  );
}

export function ShippingFields({ form, rules, withOperation }: { form: ShipmentForm; rules: TypeRules; withOperation: boolean }) {
  const { register } = form;
  const { data: loading = [] } = usePorts(rules.route?.loading ?? {});
  const { data: discharge = [] } = usePorts(rules.route?.discharge ?? {});
  const { data: carriers = [] } = useLookup('carriers', { kind: rules.carrierKind ?? undefined });
  const { data: freeZones = [] } = useLookup('free-zones');
  const portLabel = (p: { name: string; code: string | null }) => (p.code ? `${p.name} (${p.code})` : p.name);
  const air = rules.mode === 'AIR';

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {rules.carrierKind && (
        <Combo
          form={form}
          name="carrierId"
          label={air ? 'شركة الطيران' : 'الخط الملاحي'}
          options={carriers.map((c) => ({ value: c.id, label: c.name }))}
        />
      )}
      {rules.route && (
        <>
          <Combo form={form} name="loadingPortId" label={air ? 'مطار الشحن' : 'ميناء الشحن'} options={loading.map((p) => ({ value: p.id, label: portLabel(p) }))} />
          <Combo form={form} name="dischargePortId" label={air ? 'مطار الوصول' : 'ميناء الوصول'} options={discharge.map((p) => ({ value: p.id, label: portLabel(p) }))} />
        </>
      )}
      {rules.freeZone && (
        <Combo form={form} name="freeZoneId" label="المنطقة الحرة (المنفذ الجمركي)" options={freeZones.map((z) => ({ value: z.id, label: z.name }))} />
      )}
      {rules.reference && (
        <TextField
          label={`${rules.reference} (الرقم التعريفي)`}
          dir="ltr"
          inputMode="numeric"
          maxLength={19}
          error={errorAt(form, 'referenceNumber')}
          {...register('referenceNumber')}
        />
      )}
      {rules.masterBill !== 'none' && (
        <>
          <TextField
            label={`${air ? 'MAWB' : 'MB/L'}${rules.masterBill === 'optional' ? ' (اختياري)' : ''}`}
            dir="ltr"
            error={errorAt(form, 'mblNumber')}
            {...register('mblNumber')}
          />
          <TextField
            label={`${air ? 'HAWB' : 'HB/L'} (اختياري)`}
            dir="ltr"
            error={errorAt(form, 'hblNumber')}
            {...register('hblNumber')}
          />
        </>
      )}
      {rules.voyageAndBooking && (
        <>
          <TextField label={air ? 'رقم الرحلة' : 'رقم الرحلة (Voyage)'} dir="ltr" error={errorAt(form, 'voyageNo')} {...register('voyageNo')} />
          <TextField label="رقم الحجز (Booking)" dir="ltr" error={errorAt(form, 'bookingNo')} {...register('bookingNo')} />
        </>
      )}
      {withOperation && rules.route && (
        <>
          <TextField label={air ? 'رقم الطائرة / الرحلة (اختياري)' : 'اسم المركب (اختياري)'} error={errorAt(form, 'vesselName')} {...register('vesselName')} />
          <TextField label="تاريخ الوصول المتوقع ETA (اختياري)" type="date" allowFuture error={errorAt(form, 'eta')} {...register('eta')} />
        </>
      )}
    </div>
  );
}

export function ContainerFields({ form }: { form: ShipmentForm }) {
  const { register, control } = form;
  const containers = useFieldArray({ control, name: 'containers' });
  const loadType = useWatch({ control, name: 'loadType' });
  const rows = useWatch({ control, name: 'containers' }) ?? [];
  const total = rows.reduce((sum, c) => sum + (Number(c?.weight) || 0), 0);
  const lcl = loadType === 'LCL';
  const canAdd = containers.fields.length < (lcl ? 1 : 10);
  // an error on the list itself (not one container) sits on .root inside a field array
  const listError = errorAt(form, 'containers.root') ?? errorAt(form, 'containers');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-48">
          <SelectField
            label="نوع الشحن"
            options={[
              { value: 'FCL', label: 'FCL (حاويات كاملة)' },
              { value: 'LCL', label: 'LCL (مجمّع)' },
            ]}
            error={errorAt(form, 'loadType')}
            {...register('loadType', {
              onChange: (e: { target: { value: string } }) => {
                // LCL is one LCL container; FCL starts with one 40HQ
                if (e.target.value === 'LCL') containers.replace([{ containerNo: '', type: 'LCL', weight: '' }]);
                else if (e.target.value === 'FCL' && (rows.length === 0 || rows.some((c) => c?.type === 'LCL'))) {
                  containers.replace([{ containerNo: '', type: 'HQ40', weight: '' }]);
                }
              },
            })}
          />
        </div>
        <div className="rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm">
          <span className="text-muted">الوزن الكلي: </span>
          <span className="font-bold text-gold">{formatMoney(total)} كجم</span>
          <span className="text-muted"> · {containers.fields.length} حاوية</span>
        </div>
      </div>

      {containers.fields.map((field, i) => (
        <div key={field.id} className="grid items-start gap-3 rounded-xl border border-line p-3 sm:grid-cols-[2rem_1fr_9rem_9rem_auto]">
          <span className="grid size-8 place-items-center rounded-lg bg-gold/10 text-sm font-bold text-gold sm:mt-8">{i + 1}</span>
          <TextField
            label={lcl ? 'رقم الحاوية (اختياري)' : 'رقم الحاوية'}
            dir="ltr"
            placeholder="MSKU1234565"
            maxLength={13}
            error={errorAt(form, `containers.${i}.containerNo`)}
            {...register(`containers.${i}.containerNo`)}
          />
          <SelectField
            label="النوع"
            options={CONTAINER_OPTIONS.map((o) => ({ ...o, disabled: lcl ? o.value !== 'LCL' : o.value === 'LCL' }))}
            error={errorAt(form, `containers.${i}.type`)}
            {...register(`containers.${i}.type`)}
          />
          <TextField
            label="الوزن (كجم)"
            type="number"
            step="0.001"
            min={0}
            dir="ltr"
            error={errorAt(form, `containers.${i}.weight`)}
            {...register(`containers.${i}.weight`)}
          />
          <div className="sm:mt-8">
            <IconButton label={`شيل الحاوية ${i + 1}`} tone="danger" onClick={() => containers.remove(i)}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        </div>
      ))}
      {listError && (
        <p role="alert" className="text-sm text-danger">
          {listError}
        </p>
      )}
      {!!loadType && canAdd && (
        <Button
          type="button"
          variant="ghost"
          icon={<Plus className="size-4" />}
          onClick={() => containers.append({ containerNo: '', type: lcl ? 'LCL' : 'HQ40', weight: '' })}
        >
          إضافة حاوية
        </Button>
      )}
    </div>
  );
}
