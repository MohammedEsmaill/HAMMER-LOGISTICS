import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Shipment } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { shipmentScope } from './access-scope';
import {
  AddInspectionDto,
  InspectionItem,
  UpdateCustomsDto,
  UpdateInspectionDto,
} from './dto/customs.dto';
import { claimVersion } from './shipment-version';
import { ShipmentsService } from './shipments.service';
import { shipmentKind } from './stages';
import {
  CUSTOMS_FIELDS,
  CustomsField,
  SHIPMENT_TYPES,
} from './types/shipment-type';

const FIELD_LABELS: Record<CustomsField, string> = {
  certificateNo: 'رقم الشهادة',
  certificateDate: 'تاريخ الشهادة',
  deliveryOrderDate: 'تاريخ سحب الإذن',
  form46Date: 'تاريخ 46',
  storageYardId: 'ساحة التخزين',
  deliveredToPortDate: 'تاريخ تسليم الحاويات للميناء',
  examinationDate: 'تاريخ الكشف',
  inspectionDate: 'تاريخ المعاينة',
  approvalDate: 'تاريخ الاعتماد',
  paymentDate: 'تاريخ السداد',
  releaseDate: 'تاريخ الصرف',
  releaseReceivedDate: 'تاريخ استلام الإفراج',
  shippedDate: 'تاريخ الشحن',
};

/** The customs (Nafeza) tab and the regulatory inspections list. */
@Injectable()
export class ShipmentCustomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shipments: ShipmentsService,
    private readonly audit: AuditService,
  ) {}

  async update(actor: AuthUser, id: number, dto: UpdateCustomsDto) {
    const before = await this.load(actor, id);
    const rules = SHIPMENT_TYPES[shipmentKind(before.direction, before.mode)];
    const sent = CUSTOMS_FIELDS.filter((f) => dto[f] !== undefined);
    const foreign = sent.filter((f) => !rules.customsFields.includes(f));
    if (foreign.length) {
      throw new BadRequestException(
        foreign.map((f) => `${FIELD_LABELS[f]} مش موجود في ${rules.label}`),
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await claimVersion(tx, id, dto.version);
      if (dto.storageYardId)
        await this.assertYard(tx, before, dto.storageYardId);
      const data = Object.fromEntries(sent.map((f) => [f, dto[f]]));
      await tx.shipment.update({ where: { id }, data });
      await this.log(tx, actor, 'UPDATE_CUSTOMS', id, before);
    });
    return this.shipments.get(actor, id);
  }

  async addInspection(actor: AuthUser, id: number, dto: AddInspectionDto) {
    const before = await this.load(actor, id);
    const item: InspectionItem = {
      id: randomUUID(),
      authorityId: dto.authorityId,
      requestedAt: dto.requestedAt.toISOString(),
      result: dto.result ?? 'PENDING',
      resultDate: dto.resultDate?.toISOString() ?? null,
      notes: dto.notes ?? null,
    };
    this.assertInspection(item);
    await this.writeInspections(actor, id, dto.version, before, async (tx) => {
      await this.assertAuthority(tx, item.authorityId);
      return [...this.inspections(before), item];
    });
    return this.shipments.get(actor, id);
  }

  async updateInspection(
    actor: AuthUser,
    id: number,
    itemId: string,
    dto: UpdateInspectionDto,
  ) {
    const before = await this.load(actor, id);
    const items = this.inspections(before);
    const current = items.find((i) => i.id === itemId);
    if (!current) throw new NotFoundException('العرض الرقابي غير موجود');
    const updated: InspectionItem = {
      ...current,
      requestedAt: dto.requestedAt?.toISOString() ?? current.requestedAt,
      result: dto.result ?? current.result,
      resultDate:
        dto.resultDate === undefined
          ? current.resultDate
          : (dto.resultDate?.toISOString() ?? null),
      notes: dto.notes === undefined ? current.notes : dto.notes,
    };
    this.assertInspection(updated);
    await this.writeInspections(actor, id, dto.version, before, () =>
      Promise.resolve(items.map((i) => (i.id === itemId ? updated : i))),
    );
    return this.shipments.get(actor, id);
  }

  async removeInspection(
    actor: AuthUser,
    id: number,
    itemId: string,
    version: number,
  ) {
    const before = await this.load(actor, id);
    const items = this.inspections(before);
    if (!items.some((i) => i.id === itemId)) {
      throw new NotFoundException('العرض الرقابي غير موجود');
    }
    await this.writeInspections(actor, id, version, before, () =>
      Promise.resolve(items.filter((i) => i.id !== itemId)),
    );
    return this.shipments.get(actor, id);
  }

  private async writeInspections(
    actor: AuthUser,
    id: number,
    version: number,
    before: Shipment,
    next: (tx: Tx) => Promise<InspectionItem[]>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await claimVersion(tx, id, version);
      const inspections = await next(tx);
      await tx.shipment.update({
        where: { id },
        data: {
          inspections: inspections as unknown as Prisma.InputJsonArray,
        },
      });
      await this.log(tx, actor, 'UPDATE_INSPECTIONS', id, before);
    });
  }

  private inspections(shipment: Shipment): InspectionItem[] {
    return shipment.inspections as unknown as InspectionItem[];
  }

  private assertInspection(item: InspectionItem) {
    if (item.result === 'PENDING' && item.resultDate) {
      throw new BadRequestException('تاريخ النتيجة بيتسجل لما النتيجة تظهر');
    }
    if (item.resultDate && item.resultDate < item.requestedAt) {
      throw new BadRequestException('تاريخ النتيجة قبل تاريخ الطلب');
    }
  }

  private async assertAuthority(tx: Tx, authorityId: number) {
    const authority = await tx.inspectionAuthority.findUnique({
      where: { id: authorityId },
    });
    if (!authority) throw new BadRequestException('جهة العرض غير موجودة');
  }

  /** The yard must be of the shipment's transport and in its Egyptian port. */
  private async assertYard(tx: Tx, shipment: Shipment, yardId: number) {
    const yard = await tx.storageYard.findUnique({ where: { id: yardId } });
    const egyptianPortId =
      shipment.direction === 'IMPORT'
        ? shipment.dischargePortId
        : shipment.loadingPortId;
    if (
      !yard ||
      yard.kind !== shipment.mode ||
      (yard.portId !== null && yard.portId !== egyptianPortId)
    ) {
      throw new BadRequestException(
        'ساحة التخزين لازم تكون من ساحات الميناء المصري بتاع الشحنة',
      );
    }
  }

  private async load(actor: AuthUser, id: number): Promise<Shipment> {
    const shipment = await this.prisma.shipment.findFirst({
      where: { AND: [{ id }, shipmentScope(actor)] },
    });
    if (!shipment) throw new NotFoundException('الشحنة غير موجودة');
    return shipment;
  }

  private async log(
    tx: Tx,
    actor: AuthUser,
    action: string,
    id: number,
    before: Shipment,
  ) {
    const after = await tx.shipment.findUniqueOrThrow({ where: { id } });
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
