/**
 * The client-side mirror of the API's shipment type rules (shipments/types/shipment-type.ts),
 * used to show only the fields a type uses and to validate before sending. The API stays
 * the source of truth and re-checks everything.
 */
export type Direction = 'IMPORT' | 'EXPORT';
export type ShipmentMode = 'SEA' | 'AIR' | 'FREE_ZONE';
export type ShipmentKind = 'IMPORT_SEA' | 'IMPORT_AIR' | 'IMPORT_FREE_ZONE' | 'EXPORT_SEA' | 'EXPORT_AIR';
export type TransportKind = 'SEA' | 'AIR';
export type ContainerType = 'HQ20' | 'HQ40' | 'LCL';
export type LoadType = 'FCL' | 'LCL';
export type CustomsRegime = 'FINAL' | 'TEMPORARY';

export type CustomsField =
  | 'certificateNo'
  | 'certificateDate'
  | 'deliveryOrderDate'
  | 'form46Date'
  | 'storageYardId'
  | 'deliveredToPortDate'
  | 'examinationDate'
  | 'inspectionDate'
  | 'approvalDate'
  | 'paymentDate'
  | 'releaseDate'
  | 'releaseReceivedDate'
  | 'shippedDate';

export interface PortRule {
  kind: TransportKind;
  egyptian: boolean;
}

export interface TypeRules {
  kind: ShipmentKind;
  direction: Direction;
  mode: ShipmentMode;
  label: string;
  hint: string;
  route: { loading: PortRule; discharge: PortRule } | null;
  carrierKind: TransportKind | null;
  freeZone: boolean;
  reference: 'ACID' | 'UCR' | null;
  masterBill: 'required' | 'optional' | 'none';
  voyageAndBooking: boolean;
  containers: boolean;
  customsRegime: boolean;
  customsFields: readonly CustomsField[];
}

const IMPORT_CUSTOMS: CustomsField[] = [
  'certificateNo',
  'deliveryOrderDate',
  'form46Date',
  'storageYardId',
  'examinationDate',
  'inspectionDate',
  'approvalDate',
  'paymentDate',
  'releaseDate',
];
const FREE_ZONE_CUSTOMS: CustomsField[] = [
  'certificateNo',
  'certificateDate',
  'examinationDate',
  'inspectionDate',
  'approvalDate',
  'paymentDate',
  'releaseDate',
];
const EXPORT_CUSTOMS: CustomsField[] = [
  'certificateNo',
  'certificateDate',
  'storageYardId',
  'deliveredToPortDate',
  'examinationDate',
  'inspectionDate',
  'approvalDate',
  'paymentDate',
  'releaseReceivedDate',
  'shippedDate',
];

const WORLD_SEA: PortRule = { kind: 'SEA', egyptian: false };
const EGYPT_SEA: PortRule = { kind: 'SEA', egyptian: true };
const WORLD_AIR: PortRule = { kind: 'AIR', egyptian: false };
const EGYPT_AIR: PortRule = { kind: 'AIR', egyptian: true };

export const SHIPMENT_TYPES: Record<ShipmentKind, TypeRules> = {
  IMPORT_SEA: {
    kind: 'IMPORT_SEA',
    direction: 'IMPORT',
    mode: 'SEA',
    label: 'وارد بحري',
    hint: 'حاويات FCL / LCL من ميناء عالمي لميناء مصري',
    route: { loading: WORLD_SEA, discharge: EGYPT_SEA },
    carrierKind: 'SEA',
    freeZone: false,
    reference: 'ACID',
    masterBill: 'required',
    voyageAndBooking: true,
    containers: true,
    customsRegime: true,
    customsFields: IMPORT_CUSTOMS,
  },
  IMPORT_AIR: {
    kind: 'IMPORT_AIR',
    direction: 'IMPORT',
    mode: 'AIR',
    label: 'وارد جوي',
    hint: 'من مطار عالمي لمطار مصري',
    route: { loading: WORLD_AIR, discharge: EGYPT_AIR },
    carrierKind: 'AIR',
    freeZone: false,
    reference: 'ACID',
    masterBill: 'required',
    voyageAndBooking: true,
    containers: false,
    customsRegime: true,
    customsFields: IMPORT_CUSTOMS,
  },
  IMPORT_FREE_ZONE: {
    kind: 'IMPORT_FREE_ZONE',
    direction: 'IMPORT',
    mode: 'FREE_ZONE',
    label: 'وارد مناطق حرة',
    hint: 'بضائع خارجة من منطقة حرة',
    route: null,
    carrierKind: null,
    freeZone: true,
    reference: null,
    masterBill: 'none',
    voyageAndBooking: false,
    containers: false,
    customsRegime: true,
    customsFields: FREE_ZONE_CUSTOMS,
  },
  EXPORT_SEA: {
    kind: 'EXPORT_SEA',
    direction: 'EXPORT',
    mode: 'SEA',
    label: 'صادر بحري',
    hint: 'حاويات من ميناء مصري لميناء عالمي',
    route: { loading: EGYPT_SEA, discharge: WORLD_SEA },
    carrierKind: 'SEA',
    freeZone: false,
    reference: 'UCR',
    masterBill: 'optional',
    voyageAndBooking: true,
    containers: true,
    customsRegime: false,
    customsFields: EXPORT_CUSTOMS,
  },
  EXPORT_AIR: {
    kind: 'EXPORT_AIR',
    direction: 'EXPORT',
    mode: 'AIR',
    label: 'صادر جوي',
    hint: 'من مطار مصري لمطار عالمي',
    route: { loading: EGYPT_AIR, discharge: WORLD_AIR },
    carrierKind: 'AIR',
    freeZone: false,
    reference: 'UCR',
    masterBill: 'optional',
    voyageAndBooking: true,
    containers: false,
    customsRegime: false,
    customsFields: EXPORT_CUSTOMS,
  },
};

export const KIND_LIST = Object.values(SHIPMENT_TYPES);

export const kindOf = (direction: Direction, mode: ShipmentMode) => `${direction}_${mode}` as ShipmentKind;

export const CONTAINER_TYPES: Record<ContainerType, string> = { HQ20: '20HQ', HQ40: '40HQ', LCL: 'LCL' };
export const REGIMES: Record<CustomsRegime, string> = { FINAL: 'نهائي', TEMPORARY: 'سماح مؤقت' };

export const CUSTOMS_LABELS: Record<CustomsField, string> = {
  certificateNo: 'رقم الشهادة',
  certificateDate: 'تاريخ الشهادة',
  deliveryOrderDate: 'تاريخ سحب الإذن',
  form46Date: 'تاريخ نموذج 46',
  storageYardId: 'الساحة / المخزن',
  deliveredToPortDate: 'تاريخ التسليم للميناء',
  examinationDate: 'تاريخ الكشف',
  inspectionDate: 'تاريخ المعاينة',
  approvalDate: 'تاريخ الاعتماد',
  paymentDate: 'تاريخ السداد',
  releaseDate: 'تاريخ الصرف',
  releaseReceivedDate: 'تاريخ استلام الإفراج',
  shippedDate: 'تاريخ الشحن',
};

/** Labels that change with the direction (supplier vs importer, origin vs destination). */
export const partyLabels = (direction: Direction) =>
  direction === 'IMPORT'
    ? { foreignParty: 'المورد (الشاحن)', country: 'بلد المنشأ', consignee: 'المرسل إليه' }
    : { foreignParty: 'المستورد', country: 'بلد الوصول', consignee: 'المصدّر' };

// ── ISO 6346 container number check, same as the API ──
const LETTER_VALUES: Record<string, number> = (() => {
  const values: Record<string, number> = {};
  let n = 10;
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (n % 11 === 0) n++;
    values[letter] = n++;
  }
  return values;
})();

export const normaliseContainerNumber = (value: string) => value.toUpperCase().replace(/[\s-]/g, '');

export function isValidContainerNumber(value: string): boolean {
  if (!/^[A-Z]{3}[UJZ][0-9]{7}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (LETTER_VALUES[value[i]] ?? Number(value[i])) * 2 ** i;
  return (sum % 11) % 10 === Number(value[10]);
}

/** Stage labels for filters (the API sends labels with each shipment). */
export const STAGE_LABELS: Record<string, string> = {
  REGISTERED: 'تم التسجيل',
  IN_TRANSIT: 'في الطريق',
  ARRIVED: 'وصلت',
  UNLOADING: 'تحت التفريغ',
  UNLOADED: 'فرغت',
  RECEIVED_AT_WAREHOUSE: 'تم الاستلام بالمخازن',
  DO_COLLECTED: 'تم سحب الإذن',
  SUBMITTED: 'تم التقديم',
  EXAMINATION: 'جاري الكشف',
  INSPECTION: 'جاري المعاينة',
  VALUATION: 'جاري إنهاء التثمين',
  APPROVAL_PENDING: 'جاري الاعتماد',
  APPROVED: 'اعتمدت',
  DUTIES_PAID: 'سداد الرسوم',
  RELEASE_DELIVERED: 'تم تسليم الإفراج',
  CLEARED: 'تم الصرف',
  DELIVERED_TO_PORT: 'تم التسليم للميناء',
  RELEASE_RECEIVED: 'تم استلام الإفراج',
  SHIPPED: 'تم الشحن',
  ARRIVED_DESTINATION: 'تم الوصول',
  DELIVERED_TO_IMPORTER: 'تم التسليم للمستورد',
};
