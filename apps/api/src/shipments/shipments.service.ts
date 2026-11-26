import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { Page, pageArgs } from '../common/dto/list-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { shipmentScope } from './access-scope';
import { DOCUMENT_SELECT } from './shipment-documents.service';
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

/** The most rows one shipments report holds. */
const REPORT_MAX = 5000;

const REPORT_SELECT = {
  ...LIST_SELECT,
  packagesCount: true,
  totalWeight: true,
  vesselName: true,
  certificateNo: true,
  factory: NAME,
  carrier: NAME,
  declarant: NAME,
  dischargePort: NAME,
  loadingPort: NAME,
  freeZone: NAME,
  containers: { select: { type: true }, orderBy: { seq: 'asc' } },
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
  declarant: NAME,
  containers: { orderBy: { seq: 'asc' } },
  documents: {
    where: { deletedAt: null },
    select: DOCUMENT_SELECT,
    orderBy: { createdAt: 'desc' },
  },
  createdBy: { select: { id: true, email: true } },
} satisfies Prisma.ShipmentInclude;

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    actor: AuthUser,
    query: ShipmentsQueryDto,
  ): Promise<Page<unknown>> {
    const where = this.listWhere(actor, query);
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

  /** The list's filters and the user's scope, shared by the list and its report. */
  private listWhere(
    actor: AuthUser,
    query: ShipmentsQueryDto,
  ): Prisma.ShipmentWhereInput {
    const search = query.search?.toUpperCase();
    return {
      AND: [
        shipmentScope(actor),
        {
          direction: query.direction,
          mode: query.mode,
          currentStage: query.stage,
          clientId: query.clientId,
          declarantId: query.declarantId,
        },
        search
          ? {
              OR: [
                { fileNo: { contains: search } },
                { referenceNumber: { contains: search } },
                { certificateNo: { contains: search, mode: 'insensitive' } },
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
  }

  /**
   * Every shipment the filters match (not one page), with a summary: the shipments
   * report, printed or as Excel. Refused past REPORT_MAX rows: narrow the filters.
   */
  async report(actor: AuthUser, query: ShipmentsQueryDto) {
    const where = this.listWhere(actor, query);
    const total = await this.prisma.shipment.count({ where });
    if (total > REPORT_MAX) {
      throw new BadRequestException(
        `الفلتر جايب ${total} شحنة، والتقرير بيطلع لحد ${REPORT_MAX}: ضيّق الفلتر`,
      );
    }
    const rows = await this.prisma.shipment.findMany({
      where,
      select: REPORT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    const containers: Record<string, number> = {};
    let packages = 0;
    let weight = new Prisma.Decimal(0);
    const items = rows.map((s) => {
      for (const c of s.containers)
        containers[c.type] = (containers[c.type] ?? 0) + 1;
      packages += s.packagesCount;
      weight = weight.plus(s.totalWeight);
      const { containers: boxes, ...rest } = s;
      return {
        ...rest,
        containers: boxes.map((c) => c.type),
        stageLabel: stageLabel(
          shipmentKind(s.direction, s.mode),
          s.currentStage,
        ),
        hblDisplay: s.hblNumber ?? s.mblNumber,
        place: s.dischargePort ?? s.loadingPort ?? s.freeZone,
      };
    });
    return {
      items,
      summary: {
        count: items.length,
        containers,
        packages,
        weight: weight.toFixed(3),
      },
    };
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
