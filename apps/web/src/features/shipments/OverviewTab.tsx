import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, UserCog } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { formatDate, formatMoney } from '@/lib/format';
import { useEmployeeOptions } from '../employees/api';
import { shipmentsApi, type Shipment } from './api';
import { FormTabs } from './FormTabs';
import { CONTAINER_TYPES, partyLabels, REGIMES, SHIPMENT_TYPES } from './rules';
import { FIELD_TABS, shipmentSchema, toFormValues, toShipmentInput, type ShipmentFormIn, type ShipmentFormOut } from './shipment-form';
import { BasicFields, ContainerFields, ShippingFields, type FormTab } from './ShipmentFields';
import { dayValue, useShipmentAction } from './use-shipment-action';

export function Info({ label, children, ltr }: { label: string; children: ReactNode; ltr?: boolean }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-0.5 font-semibold break-words ${ltr ? 'text-end' : ''}`} dir={ltr ? 'ltr' : undefined}>
        {children || '—'}
      </div>
    </div>
  );
}

function EditBasicDrawer({ shipment, open, onClose }: { shipment: Shipment; open: boolean; onClose: () => void }) {
  const rules = SHIPMENT_TYPES[shipment.kind];
  const schema = useMemo(() => shipmentSchema(rules), [rules]);
  const form = useForm<ShipmentFormIn, unknown, ShipmentFormOut>({ resolver: zodResolver(schema) });
  const tabs: { key: FormTab; label: string }[] = [
    { key: 'basic', label: 'البيانات الأساسية' },
    { key: 'shipping', label: rules.freeZone ? 'المنطقة الحرة' : 'بيانات الشحن' },
    ...(rules.containers ? [{ key: 'containers' as const, label: 'الحاويات' }] : []),
  ];
  const [tab, setTab] = useState<FormTab>('basic');
  const save = useShipmentAction(
    shipment.id,
    (values: ShipmentFormOut) => {
      // the type never changes; vessel and ETA are the operation tab's
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { direction, mode, vesselName, eta, ...body } = toShipmentInput(rules, values);
      return shipmentsApi.updateBasic(shipment.id, { ...body, version: shipment.version });
    },
    'اتحفظت بيانات الشحنة',
  );

  useEffect(() => {
    if (!open) return;
    save.reset();
    setTab('basic');
    form.reset(toFormValues(shipment));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when the drawer opens
  }, [open]);

  const onInvalid = (errors: FieldErrors<ShipmentFormIn>) => {
    const first = tabs.find((t) => Object.keys(errors).some((f) => FIELD_TABS[f] === t.key));
    if (first) setTab(first.key);
  };
  const errorTabs = new Set(Object.keys(form.formState.errors).map((f) => FIELD_TABS[f]));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={`تعديل بيانات ${shipment.fileNo}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button form="basic-form" type="submit" loading={save.isPending}>
            حفظ
          </Button>
        </div>
      }
    >
      <form
        id="basic-form"
        noValidate
        className="space-y-5"
        onSubmit={form.handleSubmit((v) => save.mutateAsync(v).then(onClose, () => undefined), onInvalid)}
      >
        <FormTabs tabs={tabs} active={tab} onChange={setTab} errorTabs={errorTabs} layoutId="edit-shipment-tab" />
        {tab === 'basic' && <BasicFields form={form} rules={rules} />}
        {tab === 'shipping' && <ShippingFields form={form} rules={rules} withOperation={false} />}
        {tab === 'containers' && <ContainerFields form={form} />}
        {save.error ? <ErrorBox error={save.error} /> : null}
      </form>
    </Drawer>
  );
}

function OperationCard({ shipment }: { shipment: Shipment }) {
  const { can } = useAuth();
  const air = shipment.mode === 'AIR';
  const [vesselName, setVessel] = useState(shipment.vesselName ?? '');
  const [eta, setEta] = useState(dayValue(shipment.eta));
  const [employee, setEmployee] = useState(String(shipment.operationEmployee.id));
  const { data: operations = [] } = useEmployeeOptions('OPERATION', can('shipments.reassign'));
  const save = useShipmentAction(
    shipment.id,
    () => shipmentsApi.updateOperation(shipment.id, { version: shipment.version, vesselName: vesselName.trim() || null, eta: eta || null }),
    'اتحفظت بيانات التشغيل',
  );
  const reassign = useShipmentAction(
    shipment.id,
    () => shipmentsApi.reassign(shipment.id, { version: shipment.version, operationEmployeeId: Number(employee) }),
    'اتغير موظف الأوبريشن',
  );

  useEffect(() => {
    setVessel(shipment.vesselName ?? '');
    setEta(dayValue(shipment.eta));
    setEmployee(String(shipment.operationEmployee.id));
  }, [shipment.vesselName, shipment.eta, shipment.operationEmployee.id]);

  const editable = can('shipments.operation.update');
  const changed = vesselName !== (shipment.vesselName ?? '') || eta !== dayValue(shipment.eta);

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-gold">التشغيل</h3>
      {editable && shipment.mode !== 'FREE_ZONE' ? (
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <TextField label={air ? 'رقم الطائرة / الرحلة' : 'اسم المركب'} maxLength={100} value={vesselName} onChange={(e) => setVessel(e.target.value)} />
          <TextField label="ETA" type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
          <Button disabled={!changed} loading={save.isPending} onClick={() => save.mutate(undefined)}>
            حفظ
          </Button>
        </div>
      ) : (
        shipment.mode !== 'FREE_ZONE' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label={air ? 'الطائرة / الرحلة' : 'المركب'}>{shipment.vesselName}</Info>
            <Info label="ETA">{formatDate(shipment.eta)}</Info>
          </div>
        )
      )}
      {save.error ? <ErrorBox error={save.error} /> : null}

      {can('shipments.reassign') ? (
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <SelectField
            label="موظف الأوبريشن المسؤول"
            options={operations.map((e) => ({ value: e.id, label: e.fullName }))}
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
          />
          <Button
            variant="ghost"
            icon={<UserCog className="size-4" />}
            disabled={employee === String(shipment.operationEmployee.id)}
            loading={reassign.isPending}
            onClick={() => reassign.mutate(undefined)}
          >
            نقل الشحنة
          </Button>
        </div>
      ) : (
        <Info label="موظف الأوبريشن">{shipment.operationEmployee.fullName}</Info>
      )}
      {reassign.error ? <ErrorBox error={reassign.error} /> : null}
    </section>
  );
}

export function OverviewTab({ shipment }: { shipment: Shipment }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const rules = SHIPMENT_TYPES[shipment.kind];
  const labels = partyLabels(shipment.direction);
  const air = shipment.mode === 'AIR';

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gold">البيانات الأساسية</h3>
          {can('shipments.basic.update') && (
            <Button variant="ghost" className="h-9 px-3 text-sm" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
              تعديل
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="العميل">{shipment.client.name}</Info>
          <Info label="المصنع">{shipment.factory.name}</Info>
          <Info label="المستخلص">{shipment.clearer.fullName}</Info>
          <Info label={labels.foreignParty}>{shipment.foreignPartyName}</Info>
          <Info label={labels.country}>{shipment.country.nameAr}</Info>
          <Info label={labels.consignee}>{shipment.consignee}</Info>
          <Info label="نوع البضاعة">{shipment.commodity}</Info>
          {rules.customsRegime && <Info label="النظام الجمركي">{shipment.customsRegime && REGIMES[shipment.customsRegime]}</Info>}
          <Info label="تاريخ الإخطار">{formatDate(shipment.notificationDate)}</Info>
          <Info label="عدد الطرود">{shipment.packagesCount}</Info>
          <Info label="الوزن الكلي">{formatMoney(shipment.totalWeight)} كجم</Info>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold text-gold">{rules.freeZone ? 'المنطقة الحرة' : 'بيانات الشحن'}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rules.carrierKind && <Info label={air ? 'شركة الطيران' : 'الخط الملاحي'}>{shipment.carrier?.name}</Info>}
          {rules.route && (
            <>
              <Info label={air ? 'مطار الشحن' : 'ميناء الشحن'}>{shipment.loadingPort?.name}</Info>
              <Info label={air ? 'مطار الوصول' : 'ميناء الوصول'}>{shipment.dischargePort?.name}</Info>
            </>
          )}
          {rules.freeZone && <Info label="المنطقة الحرة">{shipment.freeZone?.name}</Info>}
          {rules.reference && (
            <Info label={rules.reference} ltr>
              {shipment.referenceNumber}
            </Info>
          )}
          {rules.masterBill !== 'none' && (
            <>
              <Info label={air ? 'MAWB' : 'MB/L'} ltr>
                {shipment.mblNumber}
              </Info>
              <Info label={air ? 'HAWB' : 'HB/L'} ltr>
                {shipment.hblDisplay}
              </Info>
            </>
          )}
          {rules.voyageAndBooking && (
            <>
              <Info label="رقم الرحلة" ltr>
                {shipment.voyageNo}
              </Info>
              <Info label="رقم الحجز" ltr>
                {shipment.bookingNo}
              </Info>
            </>
          )}
        </div>
      </section>

      {rules.containers && (
        <section className="space-y-3">
          <h3 className="font-semibold text-gold">
            الحاويات · {shipment.loadType} · {shipment.containers.length}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {shipment.containers.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                <span className="grid size-7 place-items-center rounded-lg bg-gold/10 text-xs font-bold text-gold">{c.seq}</span>
                <span dir="ltr" className="flex-1 text-end font-semibold tracking-wider">
                  {c.containerNo ?? '—'}
                </span>
                <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs">{CONTAINER_TYPES[c.type]}</span>
                <span className="text-sm text-muted">{formatMoney(c.weight)} كجم</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <OperationCard shipment={shipment} />
      {can('shipments.basic.update') && <EditBasicDrawer shipment={shipment} open={editing} onClose={() => setEditing(false)} />}
    </div>
  );
}
