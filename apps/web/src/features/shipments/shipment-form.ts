import { z } from 'zod';
import type { Shipment, ShipmentInput } from './api';
import { isValidContainerNumber, normaliseContainerNumber, type TypeRules } from './rules';

const blank = (v: unknown) => (v === '' || v === null ? undefined : v);
const id = z.preprocess(blank, z.coerce.number().int().positive().optional());
const text = (max: number) => z.string().trim().max(max, `${max} حرف بالكتير`).optional().default('');
/** Bill / booking numbers: upper case, no spaces (as the API stores them). */
const reference = z
  .string()
  .optional()
  .default('')
  .transform((v) => v.toUpperCase().replace(/\s+/g, ''))
  .pipe(z.string().max(40, '40 حرف بالكتير'));
const weight = z.preprocess(
  blank,
  z.coerce
    .number({ invalid_type_error: 'اكتب رقم' })
    .min(0, 'مينفعش يبقى بالسالب')
    .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, '3 أرقام عشرية بالكتير')
    .optional(),
);

const containerSchema = z.object({
  containerNo: z
    .string()
    .optional()
    .default('')
    .transform((v) => normaliseContainerNumber(v)),
  type: z.enum(['HQ20', 'HQ40', 'LCL'], { errorMap: () => ({ message: 'اختار النوع' }) }),
  weight,
});

const baseSchema = z.object({
  clientId: id,
  factoryId: id,
  clearerId: id,
  foreignPartyName: text(200),
  countryId: id,
  consignee: text(200),
  commodity: text(500),
  customsRegime: z.preprocess(blank, z.enum(['FINAL', 'TEMPORARY']).optional()),
  notificationDate: z.string().optional().default(''),
  packagesCount: z.preprocess(blank, z.coerce.number({ invalid_type_error: 'اكتب رقم' }).int('رقم صحيح').min(1, '1 على الأقل').optional()),
  totalWeight: weight,
  carrierId: id,
  loadingPortId: id,
  dischargePortId: id,
  freeZoneId: id,
  referenceNumber: z.string().trim().optional().default(''),
  hblNumber: reference,
  mblNumber: reference,
  voyageNo: reference,
  bookingNo: reference,
  loadType: z.preprocess(blank, z.enum(['FCL', 'LCL']).optional()),
  containers: z.array(containerSchema).max(10, 'الحد الأقصى 10 حاويات').default([]),
  vesselName: text(100),
  eta: z.string().optional().default(''),
});

export type ShipmentFormIn = z.input<typeof baseSchema>;
export type ShipmentFormOut = z.output<typeof baseSchema>;

/**
 * The form schema of one shipment type: the shared fields plus the type's own rules,
 * the same checks the API makes (types/check-fields.ts), with each error on its field.
 */
export function shipmentSchema(rules: TypeRules) {
  return baseSchema.superRefine((v, ctx) => {
    const fail = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    const required = (field: keyof ShipmentFormOut, message: string) => {
      const value = v[field];
      if (value === undefined || value === '') fail([field], message);
    };

    required('clientId', 'اختار العميل');
    required('factoryId', 'اختار المصنع');
    required('clearerId', 'اختار المستخلص');
    required('countryId', 'اختار الدولة');
    if (v.foreignPartyName.length < 2) fail(['foreignPartyName'], 'حرفين على الأقل');
    if (v.consignee.length < 2) fail(['consignee'], 'حرفين على الأقل');
    if (v.commodity.length < 2) fail(['commodity'], 'اكتب نوع البضاعة');
    required('packagesCount', 'اكتب عدد الطرود');
    if (v.notificationDate && new Date(v.notificationDate) > new Date()) fail(['notificationDate'], 'مينفعش يبقى في المستقبل');

    if (rules.customsRegime) required('customsRegime', 'اختار نهائي أو سماح مؤقت');
    if (rules.carrierKind) required('carrierId', rules.carrierKind === 'SEA' ? 'اختار الخط الملاحي' : 'اختار شركة الطيران');
    if (rules.route) {
      required('loadingPortId', 'اختار ميناء الشحن');
      required('dischargePortId', 'اختار ميناء الوصول');
    }
    if (rules.freeZone) required('freeZoneId', 'اختار المنطقة الحرة');
    if (rules.reference && !/^[0-9]{19}$/.test(v.referenceNumber)) {
      fail(['referenceNumber'], `${rules.reference} لازم يكون 19 رقم`);
    }
    if (rules.voyageAndBooking) {
      if (!v.voyageNo) fail(['voyageNo'], 'اكتب رقم الرحلة');
      if (!v.bookingNo) fail(['bookingNo'], 'اكتب رقم الحجز');
    }
    if (rules.masterBill === 'required' && !v.mblNumber) fail(['mblNumber'], 'اكتب رقم الـ MB/L');
    if (rules.masterBill !== 'none' && v.hblNumber && !v.mblNumber) fail(['mblNumber'], 'لو فيه HB/L لازم يبقى فيه MB/L');

    if (!rules.containers) {
      required('totalWeight', 'اكتب الوزن الكلي');
      return;
    }
    required('loadType', 'اختار FCL أو LCL');
    if (v.containers.length === 0) fail(['containers'], 'ضيف حاوية واحدة على الأقل');
    if (v.loadType === 'LCL' && v.containers.length > 1) fail(['containers'], 'شحنة LCL ليها حاوية واحدة بس');
    const seen = new Set<string>();
    v.containers.forEach((c, i) => {
      if (c.weight === undefined) fail(['containers', i, 'weight'], 'اكتب الوزن');
      if (v.loadType === 'LCL' && c.type !== 'LCL') fail(['containers', i, 'type'], 'النوع في LCL لازم يبقى LCL');
      if (v.loadType === 'FCL' && c.type === 'LCL') fail(['containers', i, 'type'], 'في FCL اختار 20HQ أو 40HQ');
      if (v.loadType === 'FCL' && !c.containerNo) fail(['containers', i, 'containerNo'], 'رقم الحاوية مطلوب في FCL');
      if (c.containerNo && !isValidContainerNumber(c.containerNo)) {
        fail(['containers', i, 'containerNo'], 'رقم غير صحيح (4 حروف + 7 أرقام، ورقم التحقق مش مظبوط)');
      }
      if (c.containerNo && seen.has(c.containerNo)) fail(['containers', i, 'containerNo'], 'الرقم متكرر');
      seen.add(c.containerNo);
    });
  });
}

/** Form values → the API body, leaving out every field the type does not use. */
export function toShipmentInput(rules: TypeRules, v: ShipmentFormOut): ShipmentInput {
  const opt = <T>(value: T | '' | undefined) => (value === '' || value === undefined ? undefined : value);
  return {
    direction: rules.direction,
    mode: rules.mode,
    clientId: v.clientId!,
    factoryId: v.factoryId!,
    clearerId: v.clearerId!,
    foreignPartyName: v.foreignPartyName,
    countryId: v.countryId!,
    consignee: v.consignee,
    commodity: v.commodity,
    customsRegime: rules.customsRegime ? v.customsRegime : undefined,
    notificationDate: opt(v.notificationDate),
    packagesCount: v.packagesCount!,
    totalWeight: rules.containers ? undefined : v.totalWeight,
    carrierId: rules.carrierKind ? v.carrierId : undefined,
    loadingPortId: rules.route ? v.loadingPortId : undefined,
    dischargePortId: rules.route ? v.dischargePortId : undefined,
    freeZoneId: rules.freeZone ? v.freeZoneId : undefined,
    referenceNumber: rules.reference ? v.referenceNumber : undefined,
    hblNumber: rules.masterBill === 'none' ? undefined : opt(v.hblNumber),
    mblNumber: rules.masterBill === 'none' ? undefined : opt(v.mblNumber),
    voyageNo: rules.voyageAndBooking ? v.voyageNo : undefined,
    bookingNo: rules.voyageAndBooking ? v.bookingNo : undefined,
    loadType: rules.containers ? v.loadType : undefined,
    containers: rules.containers
      ? v.containers.map((c) => ({ type: c.type, weight: c.weight!, containerNo: opt(c.containerNo) }))
      : undefined,
    vesselName: opt(v.vesselName),
    eta: opt(v.eta),
  };
}

const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

/** A shipment → form values, for the basic-data edit. */
export function toFormValues(s: Shipment): ShipmentFormIn {
  return {
    clientId: s.clientId,
    factoryId: s.factoryId,
    clearerId: s.clearerId,
    foreignPartyName: s.foreignPartyName,
    countryId: s.countryId,
    consignee: s.consignee,
    commodity: s.commodity,
    customsRegime: s.customsRegime ?? '',
    notificationDate: day(s.notificationDate),
    packagesCount: s.packagesCount,
    totalWeight: s.totalWeight,
    carrierId: s.carrierId ?? '',
    loadingPortId: s.loadingPortId ?? '',
    dischargePortId: s.dischargePortId ?? '',
    freeZoneId: s.freeZoneId ?? '',
    referenceNumber: s.referenceNumber ?? '',
    hblNumber: s.hblNumber ?? '',
    mblNumber: s.mblNumber ?? '',
    voyageNo: s.voyageNo ?? '',
    bookingNo: s.bookingNo ?? '',
    loadType: s.loadType ?? '',
    containers: s.containers.map((c) => ({ containerNo: c.containerNo ?? '', type: c.type, weight: c.weight })),
    vesselName: s.vesselName ?? '',
    eta: day(s.eta),
  };
}

export const EMPTY_FORM: ShipmentFormIn = {
  clientId: '',
  factoryId: '',
  clearerId: '',
  foreignPartyName: '',
  countryId: '',
  consignee: '',
  commodity: '',
  customsRegime: '',
  notificationDate: new Date().toISOString().slice(0, 10),
  packagesCount: '',
  totalWeight: '',
  carrierId: '',
  loadingPortId: '',
  dischargePortId: '',
  freeZoneId: '',
  referenceNumber: '',
  hblNumber: '',
  mblNumber: '',
  voyageNo: '',
  bookingNo: '',
  loadType: '',
  containers: [],
  vesselName: '',
  eta: '',
};

/** Which tab each field lives in, to badge tabs that hold errors. */
export const FIELD_TABS: Record<string, 'basic' | 'shipping' | 'containers'> = {
  clientId: 'basic',
  factoryId: 'basic',
  clearerId: 'basic',
  foreignPartyName: 'basic',
  countryId: 'basic',
  consignee: 'basic',
  commodity: 'basic',
  customsRegime: 'basic',
  notificationDate: 'basic',
  packagesCount: 'basic',
  totalWeight: 'basic',
  carrierId: 'shipping',
  loadingPortId: 'shipping',
  dischargePortId: 'shipping',
  freeZoneId: 'shipping',
  referenceNumber: 'shipping',
  hblNumber: 'shipping',
  mblNumber: 'shipping',
  voyageNo: 'shipping',
  bookingNo: 'shipping',
  vesselName: 'shipping',
  eta: 'shipping',
  loadType: 'containers',
  containers: 'containers',
};

/** Every field path that holds an error, in form order: "clientId", "containers.0.containerNo". */
function errorPaths(errors: object, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(errors)) {
    if (!value || typeof value !== 'object') continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if ('message' in value && typeof (value as { message?: unknown }).message === 'string') out.push(path);
    else out.push(...errorPaths(value, path));
  }
  return out;
}

/** How many errors each tab holds. */
export function errorsByTab(errors: object): { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  for (const path of errorPaths(errors)) {
    const tab = FIELD_TABS[path.split('.')[0]];
    if (tab) counts.set(tab, (counts.get(tab) ?? 0) + 1);
  }
  return { counts };
}

/** After the tab with the error opens: focus its first wrong field and bring it into view. */
export function focusFirstInvalid() {
  setTimeout(() => {
    const field = document.querySelector<HTMLElement>('form [aria-invalid="true"]');
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 260);
}
