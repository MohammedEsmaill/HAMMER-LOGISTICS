import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { Page, pageArgs } from '../common/dto/list-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { shipmentScope } from './access-scope';
import { ShipmentsQueryDto } from './dto/shipments-query.dto';
import { STAGE_FLOWS, shipmentKind, stageLabel } from './stages';

const NAME = { select: { id: true, name: true } } as const;
const FULL_NAME = { select: { id: true, fullName: true } } as const;
const PORT = {
  select: { id: true, name: true, code: true, kind: true },
} as const;

const LIST_SELECT = {
  id: true,
  fileNo: true,
  direction: true,
  mode: true,
  currentStage: true,
  hblNumber: true,
  mblNumber: true,
  referenceNumber: true,
  commodity: true,
  containersCount: true,
  eta: true,
  notificationDate: true,
  createdAt: true,
  client: NAME,
  operationEmployee: FULL_NAME,
  clearer: FULL_NAME,
} satisfies Prisma.ShipmentSelect;

const DETAIL_INCLUDE = {
  client: NAME,
  factory: NAME,
  clearer: FULL_NAME,
  operationEmployee: FULL_NAME,
  country: { select: { id: true, code: true, nameAr: true } },
  carrier: NAME,
  loadingPort: PORT,
  dischargePort: PORT,
  freeZone: NAME,
  storageYard: NAME,
  containers: { orderBy: { seq: 'asc' } },
  createdBy: { select: { id: true, email: true } },
} satisfies Prisma.ShipmentInclude;

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    actor: AuthUser,
    query: ShipmentsQueryDto,
  ): Promise<Page<unknown>> {
    const search = query.search?.toUpperCase();
    const where: Prisma.ShipmentWhereInput = {
      AND: [
        shipmentScope(actor),
        {
          direction: query.direction,
          mode: query.mode,
          currentStage: query.stage,
          clientId: query.clientId,
        },
        search
          ? {
              OR: [
                { fileNo: { contains: search } },
                { referenceNumber: { contains: search } },
                { hblNumber: { contains: search } },
                { mblNumber: { contains: search } },
                { containers: { some: { containerNo: { contains: search } } } },
                {
                  client: {
                    name: { contains: query.search, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shipment.findMany({
        where,
        select: LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.shipment.count({ where }),
    ]);
    const items = rows.map((s) => ({
      ...s,
      stageLabel: stageLabel(shipmentKind(s.direction, s.mode), s.currentStage),
      // an empty HB/L shows and prints as the MB/L (spec section 17)
      hblDisplay: s.hblNumber ?? s.mblNumber,
    }));
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async get(actor: AuthUser, id: number) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { AND: [{ id }, shipmentScope(actor)] },
      include: DETAIL_INCLUDE,
    });
    if (!shipment) throw new NotFoundException('الشحنة غير موجودة');

    const kind = shipmentKind(shipment.direction, shipment.mode);
    const flow = STAGE_FLOWS[kind];
    const position = flow.findIndex((s) => s.stage === shipment.currentStage);
    return {
      ...shipment,
      kind,
      hblDisplay: shipment.hblNumber ?? shipment.mblNumber,
      stageLabel: stageLabel(kind, shipment.currentStage),
      stages: flow.map((s, i) => ({
        stage: s.stage,
        label: stageLabel(kind, s.stage),
        group: s.group,
        done: i <= position,
      })),
    };
  }
}
