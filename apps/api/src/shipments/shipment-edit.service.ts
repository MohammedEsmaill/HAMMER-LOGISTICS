import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Shipment, ShipmentContainer } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { shipmentScope } from './access-scope';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import {
  ReassignDto,
  UpdateBasicDto,
  UpdateOperationDto,
} from './dto/update-shipment.dto';
import { claimVersion } from './shipment-version';
import { ShipmentValidator, billNumbers } from './shipment-validator.service';
import { ShipmentsService } from './shipments.service';

type Stored = Shipment & { containers: ShipmentContainer[] };

@Injectable()
export class ShipmentEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: ShipmentValidator,
    private readonly shipments: ShipmentsService,
    private readonly audit: AuditService,
  ) {}

  /** SCAN: basic data, shipping data and containers, checked by the registration rules. */
  async updateBasic(actor: AuthUser, id: number, patch: UpdateBasicDto) {
    const before = await this.load(actor, id);
    const rules = this.validator.rulesFor(before.direction, before.mode);
    const merged = this.merge(before, patch);
    this.validator.assertFields(rules, merged);

    await this.prisma.$transaction(async (tx) => {
      await claimVersion(tx, id, patch.version);
      await this.validator.assertReferences(tx, rules, merged);
      await this.validator.assertNoDuplicates(tx, merged, id);
      const clientChanged = merged.clientId !== before.clientId;

      await tx.shipment.update({
        where: { id },
        data: {
          ...this.validator.basicData(rules, merged),
          // a corrected client brings its own operation employee
          ...(clientChanged
            ? {
                operationEmployeeId: await this.validator.operationEmployeeFor(
                  tx,
                  rules,
                  merged.clientId,
                ),
              }
            : {}),
        },
      });
      if (patch.containers !== undefined) {
        await this.replaceContainers(tx, id, merged);
      }
      await this.syncBillNumbers(tx, id, merged);
      await this.log(tx, actor, 'UPDATE_BASIC', before, id);
    });
    return this.shipments.get(actor, id);
  }

  /** OPERATION and SCAN: vessel name and ETA. */
  async updateOperation(actor: AuthUser, id: number, dto: UpdateOperationDto) {
    const before = await this.load(actor, id);
    await this.prisma.$transaction(async (tx) => {
      await claimVersion(tx, id, dto.version);
      await tx.shipment.update({
        where: { id },
        data: { vesselName: dto.vesselName, eta: dto.eta },
      });
      await this.log(tx, actor, 'UPDATE_OPERATION', before, id);
    });
    return this.shipments.get(actor, id);
  }

  /** CEO only: hand a shipment to another operation employee. */
  async reassign(actor: AuthUser, id: number, dto: ReassignDto) {
    const before = await this.load(actor, id);
    await this.prisma.$transaction(async (tx) => {
      await claimVersion(tx, id, dto.version);
      const employee = await tx.employee.findFirst({
        where: {
          id: dto.operationEmployeeId,
          deletedAt: null,
          status: 'ACTIVE',
          department: 'OPERATION',
        },
        select: { id: true },
      });
      if (!employee) {
        throw new BadRequestException(
          'الموظف لازم يكون موظف شغال في قسم OPERATION',
        );
      }
      await tx.shipment.update({
        where: { id },
        data: { operationEmployeeId: employee.id },
      });
      await this.log(tx, actor, 'REASSIGN', before, id);
    });
    return this.shipments.get(actor, id);
  }

  private async load(actor: AuthUser, id: number): Promise<Stored> {
    const shipment = await this.prisma.shipment.findFirst({
      where: { AND: [{ id }, shipmentScope(actor)] },
      include: { containers: { orderBy: { seq: 'asc' } } },
    });
    if (!shipment) throw new NotFoundException('الشحنة غير موجودة');
    return shipment;
  }

  /** The stored shipment with the patch applied, in the registration DTO's shape. */
  private merge(stored: Stored, patch: UpdateBasicDto): CreateShipmentDto {
    // undefined = not sent (keep), null = clear. DTO fields always exist on the
    // instance (class fields), so "sent" cannot be told by `key in patch`.
    const value = <K extends keyof UpdateBasicDto, T>(key: K, current: T) => {
      const sent = patch[key] as T | null | undefined;
      if (sent === undefined) return current ?? undefined;
      return sent ?? undefined;
    };
    return {
      direction: stored.direction,
      mode: stored.mode,
      clientId: value('clientId', stored.clientId)!,
      factoryId: value('factoryId', stored.factoryId)!,
      clearerId: value('clearerId', stored.clearerId)!,
      foreignPartyName: value('foreignPartyName', stored.foreignPartyName)!,
      countryId: value('countryId', stored.countryId)!,
      consignee: value('consignee', stored.consignee)!,
      commodity: value('commodity', stored.commodity)!,
      customsRegime: value('customsRegime', stored.customsRegime),
      notificationDate: value('notificationDate', stored.notificationDate),
      packagesCount: value('packagesCount', stored.packagesCount)!,
      totalWeight: value('totalWeight', stored.totalWeight.toNumber()),
      carrierId: value('carrierId', stored.carrierId),
      loadingPortId: value('loadingPortId', stored.loadingPortId),
      dischargePortId: value('dischargePortId', stored.dischargePortId),
      freeZoneId: value('freeZoneId', stored.freeZoneId),
      referenceNumber: value('referenceNumber', stored.referenceNumber),
      hblNumber: value('hblNumber', stored.hblNumber),
      mblNumber: value('mblNumber', stored.mblNumber),
      voyageNo: value('voyageNo', stored.voyageNo),
      bookingNo: value('bookingNo', stored.bookingNo),
      loadType: value('loadType', stored.loadType),
      containers:
        patch.containers ??
        stored.containers.map((c) => ({
          containerNo: c.containerNo ?? undefined,
          type: c.type,
          weight: c.weight.toNumber(),
        })),
    };
  }

  private async replaceContainers(tx: Tx, id: number, dto: CreateShipmentDto) {
    await tx.shipmentContainer.deleteMany({ where: { shipmentId: id } });
    await tx.shipmentContainer.createMany({
      data: (dto.containers ?? []).map((c, i) => ({
        shipmentId: id,
        seq: i + 1,
        containerNo: c.containerNo,
        type: c.type,
        weight: new Prisma.Decimal(c.weight.toFixed(3)),
      })),
    });
  }

  private async syncBillNumbers(tx: Tx, id: number, dto: CreateShipmentDto) {
    await tx.billNumber.deleteMany({ where: { shipmentId: id } });
    await tx.billNumber.createMany({
      data: billNumbers(dto).map((number) => ({ number, shipmentId: id })),
    });
  }

  private async log(
    tx: Tx,
    actor: AuthUser,
    action: string,
    before: Stored,
    id: number,
  ) {
    const after = await tx.shipment.findUniqueOrThrow({
      where: { id },
      include: { containers: { orderBy: { seq: 'asc' } } },
    });
    await this.audit.log(
      {
        userId: actor.id,
        action,
        entity: 'shipment',
        entityId: id,
        before,
        after,
      },
      tx,
    );
  }
}
