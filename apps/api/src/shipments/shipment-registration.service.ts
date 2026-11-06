import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { FileNumberService } from './file-number.service';
import { ShipmentsService } from './shipments.service';
import { STAGE_FLOWS, shipmentKind } from './stages';
import { checkFields } from './types/check-fields';
import {
  PortRule,
  SHIPMENT_TYPES,
  ShipmentTypeRules,
} from './types/shipment-type';

/** One entry of shipments.stage_history. */
export interface StageHistoryEntry {
  from: string | null;
  to: string;
  movement: 'FORWARD' | 'BACKWARD';
  at: string;
  by: number;
  reason?: string;
}

@Injectable()
export class ShipmentRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fileNumbers: FileNumberService,
    private readonly shipments: ShipmentsService,
    private readonly audit: AuditService,
  ) {}

  async register(actor: AuthUser, dto: CreateShipmentDto) {
    const rules = this.rulesFor(dto);
    const fieldErrors = checkFields(rules, dto);
    if (fieldErrors.length) throw new BadRequestException(fieldErrors);

    const id = await this.prisma.$transaction(async (tx) => {
      const operationEmployeeId = await this.checkReferences(tx, rules, dto);
      await this.checkDuplicates(tx, dto);

      const fileNo = await this.fileNumbers.next(tx);
      const containers = rules.containers ? (dto.containers ?? []) : [];
      const totalWeight = rules.containers
        ? containers.reduce((sum, c) => sum + c.weight, 0)
        : dto.totalWeight!;
      const bills = [...new Set([dto.hblNumber, dto.mblNumber])].filter(
        (n): n is string => !!n,
      );
      const firstStage = STAGE_FLOWS[rules.kind][0].stage;
      const history: StageHistoryEntry[] = [
        {
          from: null,
          to: firstStage,
          movement: 'FORWARD',
          at: new Date().toISOString(),
          by: actor.id,
        },
      ];

      const shipment = await tx.shipment.create({
        data: {
          fileNo,
          direction: rules.direction,
          mode: rules.mode,
          clientId: dto.clientId,
          factoryId: dto.factoryId,
          clearerId: dto.clearerId,
          operationEmployeeId,
          foreignPartyName: dto.foreignPartyName,
          countryId: dto.countryId,
          consignee: dto.consignee,
          commodity: dto.commodity,
          customsRegime: dto.customsRegime,
          packagesCount: dto.packagesCount,
          totalWeight: new Prisma.Decimal(totalWeight.toFixed(3)),
          notificationDate: dto.notificationDate ?? new Date(),
          carrierId: dto.carrierId,
          hblNumber: dto.hblNumber,
          mblNumber: dto.mblNumber,
          referenceNumber: dto.referenceNumber,
          voyageNo: dto.voyageNo,
          bookingNo: dto.bookingNo,
          loadingPortId: dto.loadingPortId,
          dischargePortId: dto.dischargePortId,
          freeZoneId: dto.freeZoneId,
          loadType: rules.containers ? dto.loadType : null,
          containersCount: rules.containers ? containers.length : null,
          vesselName: dto.vesselName,
          eta: dto.eta,
          currentStage: firstStage,
          stageHistory: history as unknown as Prisma.InputJsonArray,
          createdById: actor.id,
          containers: {
            create: containers.map((c, i) => ({
              seq: i + 1,
              containerNo: c.containerNo,
              type: c.type,
              weight: new Prisma.Decimal(c.weight.toFixed(3)),
            })),
          },
          billNumbers: { create: bills.map((number) => ({ number })) },
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'shipment',
          entityId: shipment.id,
          after: { ...shipment, containers },
        },
        tx,
      );
      return shipment.id;
    });
    return this.shipments.get(actor, id);
  }

  private rulesFor(dto: CreateShipmentDto): ShipmentTypeRules {
    try {
      return SHIPMENT_TYPES[shipmentKind(dto.direction, dto.mode)];
    } catch {
      throw new BadRequestException('نوع الشحنة ده مش موجود (صادر مناطق حرة)');
    }
  }

  /** Every referenced row must exist, be live and fit the shipment type. Returns the operation employee. */
  private async checkReferences(
    tx: Tx,
    rules: ShipmentTypeRules,
    dto: CreateShipmentDto,
  ): Promise<number> {
    const [client, factory, clearer, country, carrier, ports, freeZone] =
      await Promise.all([
        tx.client.findFirst({
          where: { id: dto.clientId, deletedAt: null },
          select: {
            importOperationEmployeeId: true,
            exportOperationEmployeeId: true,
          },
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

    const operationEmployeeId =
      rules.direction === 'EXPORT'
        ? (client!.exportOperationEmployeeId ??
          client!.importOperationEmployeeId)
        : client!.importOperationEmployeeId;
    const operation = await tx.employee.findFirst({
      where: { id: operationEmployeeId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!operation) {
      throw new ConflictException(
        'موظف الأوبريشن المسؤول عن العميل مش شغال، حدّث بيانات العميل الأول',
      );
    }
    return operationEmployeeId;
  }

  /** Friendly 409s naming the file that already holds the number; the DB enforces the same rules. */
  private async checkDuplicates(tx: Tx, dto: CreateShipmentDto) {
    if (dto.referenceNumber) {
      const existing = await tx.shipment.findUnique({
        where: { referenceNumber: dto.referenceNumber },
        select: { fileNo: true },
      });
      if (existing) {
        throw new ConflictException(
          `الرقم التعريفي متسجل على الملف ${existing.fileNo}`,
        );
      }
    }
    const bills = [dto.hblNumber, dto.mblNumber].filter(
      (n): n is string => !!n,
    );
    if (bills.length) {
      const existing = await tx.billNumber.findFirst({
        where: { number: { in: bills } },
        select: { number: true, shipment: { select: { fileNo: true } } },
      });
      if (existing) {
        throw new ConflictException(
          `رقم البوليصة ${existing.number} متسجل على الملف ${existing.shipment.fileNo}`,
        );
      }
    }
  }
}
