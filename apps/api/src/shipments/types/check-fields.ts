import { isValidContainerNumber } from '../container-number';
import { CreateShipmentDto } from '../dto/create-shipment.dto';
import { ShipmentTypeRules } from './shipment-type';

const FIELD_LABELS: Partial<Record<keyof CreateShipmentDto, string>> = {
  customsRegime: 'نوع الشحنة (نهائي / سماح مؤقت)',
  carrierId: 'الخط الملاحي / شركة الطيران',
  loadingPortId: 'ميناء الشحن',
  dischargePortId: 'ميناء الوصول',
  freeZoneId: 'المنفذ الجمركي للمنطقة الحرة',
  referenceNumber: 'الرقم التعريفي',
  hblNumber: 'HB/L',
  mblNumber: 'MB/L',
  voyageNo: 'رقم الرحلة',
  bookingNo: 'رقم الحجز',
  loadType: 'FCL / LCL',
  containers: 'الحاويات',
  totalWeight: 'الوزن الكلي',
};

/**
 * Checks which fields the shipment type needs and which it does not use.
 * Pure: only looks at the request. Returns Arabic messages, empty when valid.
 */
export function checkFields(
  rules: ShipmentTypeRules,
  dto: CreateShipmentDto,
): string[] {
  const errors: string[] = [];
  const need = (field: keyof CreateShipmentDto, needed: boolean) => {
    const present = dto[field] !== undefined;
    if (needed && !present) {
      errors.push(`${FIELD_LABELS[field]} مطلوب في ${rules.label}`);
    }
    if (!needed && present) {
      errors.push(`${FIELD_LABELS[field]} مش مستخدم في ${rules.label}`);
    }
  };

  need('customsRegime', rules.customsRegime);
  need('carrierId', rules.carrierKind !== null);
  need('loadingPortId', rules.route !== null);
  need('dischargePortId', rules.route !== null);
  need('freeZoneId', rules.freeZone);
  need('referenceNumber', rules.reference !== null);
  need('voyageNo', rules.voyageAndBooking);
  need('bookingNo', rules.voyageAndBooking);
  if (rules.masterBill === 'required') need('mblNumber', true);
  if (rules.masterBill === 'none') {
    need('mblNumber', false);
    need('hblNumber', false);
  }
  if (dto.hblNumber && !dto.mblNumber && rules.masterBill !== 'none') {
    errors.push('لو فيه HB/L لازم يبقى فيه MB/L');
  }

  if (rules.containers) {
    need('loadType', true);
    errors.push(...checkContainers(dto));
  } else {
    need('loadType', false);
    need('containers', false);
    need('totalWeight', true);
  }
  return errors;
}

function checkContainers(dto: CreateShipmentDto): string[] {
  const containers = dto.containers ?? [];
  if (containers.length === 0) return ['لازم تضيف حاوية واحدة على الأقل'];
  const errors: string[] = [];

  if (dto.loadType === 'LCL') {
    if (containers.length !== 1) errors.push('شحنة LCL ليها حاوية واحدة بس');
    if (containers.some((c) => c.type !== 'LCL')) {
      errors.push('نوع الحاوية في LCL لازم يبقى LCL');
    }
  }
  if (dto.loadType === 'FCL') {
    if (containers.some((c) => c.type === 'LCL')) {
      errors.push('نوع الحاوية في FCL لازم يبقى 20HQ أو 40HQ');
    }
    if (containers.some((c) => !c.containerNo)) {
      errors.push('رقم الحاوية مطلوب في FCL');
    }
  }
  containers.forEach((c, i) => {
    if (c.containerNo && !isValidContainerNumber(c.containerNo)) {
      errors.push(`رقم الحاوية ${i + 1} (${c.containerNo}) غير صحيح`);
    }
  });
  const numbers = containers.map((c) => c.containerNo).filter(Boolean);
  if (new Set(numbers).size !== numbers.length) {
    errors.push('فيه رقم حاوية متكرر في نفس الشحنة');
  }
  return errors;
}
