import { Direction, Prisma, ShipmentMode, ShipmentStage } from '@prisma/client';

/** Who may move a shipment into a stage: OPERATION = ops + SCAN, CUSTOMS = ops + SCAN + NAFEZA. */
export type StageGroup = 'AUTO' | 'OPERATION' | 'CUSTOMS';

export type ShipmentKind =
  | 'IMPORT_SEA'
  | 'IMPORT_AIR'
  | 'IMPORT_FREE_ZONE'
  | 'EXPORT_SEA'
  | 'EXPORT_AIR';

export interface StageStep {
  stage: ShipmentStage;
  group: StageGroup;
}

const CUSTOMS_STEPS: StageStep[] = [
  { stage: 'SUBMITTED', group: 'CUSTOMS' },
  { stage: 'EXAMINATION', group: 'CUSTOMS' },
  { stage: 'INSPECTION', group: 'CUSTOMS' },
  { stage: 'VALUATION', group: 'CUSTOMS' },
  { stage: 'APPROVAL_PENDING', group: 'CUSTOMS' },
  { stage: 'APPROVED', group: 'CUSTOMS' },
];

const EXPORT_STEPS: StageStep[] = [
  { stage: 'REGISTERED', group: 'AUTO' },
  { stage: 'SUBMITTED', group: 'CUSTOMS' },
  { stage: 'DELIVERED_TO_PORT', group: 'OPERATION' },
  { stage: 'RELEASE_RECEIVED', group: 'CUSTOMS' },
  { stage: 'SHIPPED', group: 'OPERATION' },
  { stage: 'ARRIVED_DESTINATION', group: 'OPERATION' },
  { stage: 'DELIVERED_TO_IMPORTER', group: 'OPERATION' },
];

/** The ordered stages of every shipment type, as agreed in the spec (section 6). */
export const STAGE_FLOWS: Record<ShipmentKind, readonly StageStep[]> = {
  IMPORT_SEA: [
    { stage: 'REGISTERED', group: 'AUTO' },
    { stage: 'IN_TRANSIT', group: 'OPERATION' },
    { stage: 'ARRIVED', group: 'OPERATION' },
    { stage: 'UNLOADING', group: 'OPERATION' },
    { stage: 'UNLOADED', group: 'OPERATION' },
    { stage: 'DO_COLLECTED', group: 'CUSTOMS' },
    ...CUSTOMS_STEPS,
    { stage: 'DUTIES_PAID', group: 'CUSTOMS' },
    { stage: 'RELEASE_DELIVERED', group: 'OPERATION' },
    { stage: 'CLEARED', group: 'OPERATION' },
  ],
  IMPORT_AIR: [
    { stage: 'REGISTERED', group: 'AUTO' },
    { stage: 'IN_TRANSIT', group: 'OPERATION' },
    { stage: 'ARRIVED', group: 'OPERATION' },
    { stage: 'RECEIVED_AT_WAREHOUSE', group: 'OPERATION' },
    { stage: 'DO_COLLECTED', group: 'CUSTOMS' },
    ...CUSTOMS_STEPS,
    { stage: 'DUTIES_PAID', group: 'CUSTOMS' },
    { stage: 'RELEASE_DELIVERED', group: 'OPERATION' },
    { stage: 'CLEARED', group: 'OPERATION' },
  ],
  IMPORT_FREE_ZONE: [
    { stage: 'REGISTERED', group: 'AUTO' },
    ...CUSTOMS_STEPS,
    { stage: 'RELEASE_DELIVERED', group: 'OPERATION' },
  ],
  EXPORT_SEA: EXPORT_STEPS,
  EXPORT_AIR: EXPORT_STEPS,
};

export const STAGE_LABELS: Record<ShipmentStage, string> = {
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
  DELIVERED_TO_PORT: 'تم تسليم الحاويات للميناء',
  RELEASE_RECEIVED: 'تم استلام الإفراج',
  SHIPPED: 'تم الشحن',
  ARRIVED_DESTINATION: 'تم الوصول',
  DELIVERED_TO_IMPORTER: 'تم التسليم للمستورد',
};

export function shipmentKind(
  direction: Direction,
  mode: ShipmentMode,
): ShipmentKind {
  const kind = `${direction}_${mode}`;
  if (!(kind in STAGE_FLOWS)) {
    throw new Error(`No stage flow for ${kind}`);
  }
  return kind as ShipmentKind;
}

export function stageLabel(kind: ShipmentKind, stage: ShipmentStage): string {
  if (kind === 'EXPORT_AIR' && stage === 'DELIVERED_TO_PORT') {
    return 'تم تسليم البضاعة للمطار';
  }
  return STAGE_LABELS[stage];
}

export function finalStage(kind: ShipmentKind): ShipmentStage {
  return STAGE_FLOWS[kind][STAGE_FLOWS[kind].length - 1].stage;
}

/** Shipments that have not reached the last stage of their own flow. */
export function activeShipmentWhere(): Prisma.ShipmentWhereInput {
  const finished = (Object.keys(STAGE_FLOWS) as ShipmentKind[]).map((kind) => {
    const [direction, ...mode] = kind.split('_');
    return {
      direction: direction as Direction,
      mode: mode.join('_') as ShipmentMode,
      currentStage: finalStage(kind),
    };
  });
  return { NOT: { OR: finished } };
}
