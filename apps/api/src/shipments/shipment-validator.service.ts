import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Direction, Prisma, ShipmentMode } from '@prisma/client';
import { Tx } from '../prisma/prisma.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { shipmentKind } from './stages';
import { checkFields } from './types/check-fields';
import {
  PortRule,
  SHIPMENT_TYPES,
  ShipmentTypeRules,
} from './types/shipment-type';

/** The shipment fields a registration or a basic-data edit writes. */
export type BasicShipmentData = Pick<
  Prisma.ShipmentUncheckedCreateInput,
  | 'clientId'
  | 'factoryId'
  | 'clearerId'
  | 'foreignPartyName'
  | 'countryId'
  | 'consignee'
  | 'commodity'
  | 'customsRegime'
  | 'packagesCount'
  | 'totalWeight'
  | 'notificationDate'
  | 'carrierId'
  | 'hblNumber'
  | 'mblNumber'
  | 'referenceNumber'
  | 'voyageNo'
  | 'bookingNo'
  | 'loadingPortId'
  | 'dischargePortId'
  | 'freeZoneId'
  | 'loadType'
  | 'containersCount'
>;

/**
 * The rules a shipment's basic data must satisfy, shared by registration and editing
 * so both enforce exactly the same thing.
 */
@Injectable()
export class ShipmentValidator {
  rulesFor(direction: Direction, mode: ShipmentMode): ShipmentTypeRules {
    try {
      return SHIPMENT_TYPES[shipmentKind(direction, mode)];
    } catch {
      throw new BadRequestException('نوع الشحنة ده مش موجود (صادر مناطق حرة)');
    }
  }

  /** Request-only checks; throws 400 with every problem found. */
  assertFields(rules: ShipmentTypeRules, dto: CreateShipmentDto): void {
    const errors = checkFields(rules, dto);
    if (errors.length) throw new BadRequestException(errors);
  }

  /** Every referenced row must exist, be live and fit the shipment type. */
  async assertReferences(
    tx: Tx,
    rules: ShipmentTypeRules,
    dto: CreateShipmentDto,
  ): Promise<void> {
    const [client, factory, clearer, country, carrier, ports, freeZone] =
      await Promise.all([
        tx.client.findFirst({
          where: { id: dto.clientId, deletedAt: null },
          select: { id: true },
        }),
        tx.factory.findFirst({
          where: { id: dto.factoryId, clientId: dto.clientId, deletedAt: null },
          select: { id: true },
        }),
        tx.clearer.findFirst({
          where: { id: dto.clearerId, deletedAt: null, isActive: true },
          select: { id: true },
        }),
        tx.country.findUnique({ where: { id: dto.countryId } }),
        dto.carrierId
          ? tx.carrier.findUnique({ where: { id: dto.carrierId } })
          : null,
        tx.port.findMany({
          where: {
            id: {
              in: [dto.loadingPortId, dto.dischargePortId].filter(
                (p): p is number => !!p,
              ),
            },
          },
        }),
        dto.freeZoneId
          ? tx.freeZone.findUnique({ where: { id: dto.freeZoneId } })
          : null,
      ]);

    const errors: string[] = [];
    if (!client) errors.push('العميل غير موجود');
    if (client && !factory) errors.push('المصنع ده مش من مصانع العميل');
    if (!clearer) errors.push('المستخلص غير موجود أو موقوف');
    if (!country) errors.push('الدولة غير موجودة');
    if (rules.carrierKind && carrier?.kind !== rules.carrierKind) {
      errors.push(
        rules.carrierKind === 'SEA'
          ? 'لازم تختار خط ملاحي'
          : 'لازم تختار شركة طيران',
      );
    }
    if (rules.freeZone && !freeZone) {
      errors.push('المنفذ الجمركي للمنطقة الحرة غير موجود');
    }
    if (rules.route) {
      const check = (id: number | undefined, rule: PortRule, name: string) => {
        const port = ports.find((p) => p.id === id);
        if (
          !port ||
          port.kind !== rule.kind ||
          port.isEgyptian !== rule.egyptian
        ) {
          errors.push(`${name} لازم يكون ${rule.label}`);
        }
      };
      check(dto.loadingPortId, rules.route.loading, 'ميناء الشحن');
      check(dto.dischargePortId, rules.route.discharge, 'ميناء الوصول');
    }
    if (errors.length) throw new BadRequestException(errors);
  }

  /** The client's operation employee for this direction (export falls back to import). */
  async operationEmployeeFor(
    tx: Tx,
    rules: ShipmentTypeRules,
    clientId: number,
  ): Promise<number> {
    const client = await tx.client.findUniqueOrThrow({
      where: { id: clientId },
      select: {
        importOperationEmployeeId: true,
        exportOperationEmployeeId: true,
      },
    });
    const id =
      rules.direction === 'EXPORT'
        ? (client.exportOperationEmployeeId ?? client.importOperationEmployeeId)
        : client.importOperationEmployeeId;
    const employee = await tx.employee.findFirst({
      where: { id, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!employee) {
      throw new ConflictException(
        'موظف الأوبريشن المسؤول عن العميل مش شغال، حدّث بيانات العميل الأول',
      );
    }
    return id;
  }

  /**
   * Friendly 409s naming the file that already holds the number. The database
   * enforces the same rules (unique reference, bill_numbers primary key).
   */
  async assertNoDuplicates(
    tx: Tx,
    dto: CreateShipmentDto,
    exceptShipmentId?: number,
  ): Promise<void> {
    const others = exceptShipmentId
      ? { NOT: { id: exceptShipmentId } }
      : undefined;
    if (dto.referenceNumber) {
      const existing = await tx.shipment.findFirst({
        where: { referenceNumber: dto.referenceNumber, ...others },
        select: { fileNo: true },
      });
      if (existing) {
        throw new ConflictException(
          `الرقم التعريفي متسجل على الملف ${existing.fileNo}`,
        );
      }
    }
    const bills = billNumbers(dto);
    if (bills.length) {
      const existing = await tx.billNumber.findFirst({
        where: {
          number: { in: bills },
          ...(exceptShipmentId
            ? { NOT: { shipmentId: exceptShipmentId } }
            : {}),
        },
        select: { number: true, shipment: { select: { fileNo: true } } },
      });
      if (existing) {
        throw new ConflictException(
          `رقم البوليصة ${existing.number} متسجل على الملف ${existing.shipment.fileNo}`,
        );
      }
    }
  }

  /** The columns written from validated basic data; derived values computed here once. */
  basicData(
    rules: ShipmentTypeRules,
    dto: CreateShipmentDto,
  ): BasicShipmentData {
    const containers = rules.containers ? (dto.containers ?? []) : [];
    const totalWeight = rules.containers
      ? containers.reduce((sum, c) => sum + c.weight, 0)
      : dto.totalWeight!;
    return {
      clientId: dto.clientId,
      factoryId: dto.factoryId,
      clearerId: dto.clearerId,
      foreignPartyName: dto.foreignPartyName,
      countryId: dto.countryId,
      consignee: dto.consignee,
      commodity: dto.commodity,
      customsRegime: dto.customsRegime ?? null,
      packagesCount: dto.packagesCount,
      totalWeight: new Prisma.Decimal(totalWeight.toFixed(3)),
      notificationDate: dto.notificationDate ?? new Date(),
      carrierId: dto.carrierId ?? null,
      hblNumber: dto.hblNumber ?? null,
      mblNumber: dto.mblNumber ?? null,
      referenceNumber: dto.referenceNumber ?? null,
      voyageNo: dto.voyageNo ?? null,
      bookingNo: dto.bookingNo ?? null,
      loadingPortId: dto.loadingPortId ?? null,
      dischargePortId: dto.dischargePortId ?? null,
      freeZoneId: dto.freeZoneId ?? null,
      loadType: rules.containers ? dto.loadType : null,
      containersCount: rules.containers ? containers.length : null,
    };
  }
}

/** HB/L and MB/L, each once (the same number in both is stored once). */
export function billNumbers(dto: {
  hblNumber?: string | null;
  mblNumber?: string | null;
}): string[] {
  return [...new Set([dto.hblNumber, dto.mblNumber])].filter(
    (n): n is string => !!n,
  );
}
