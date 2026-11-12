import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { Page, pageArgs } from '../common/dto/list-query.dto';
import { toDecimal } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { activeShipmentWhere } from '../shipments/stages';
import {
  ClearerPricesDto,
  ClearersQueryDto,
  CreateClearerDto,
  UpdateClearerDto,
} from './dto/clearer.dto';

const PRICE_FIELDS = [
  'importFinalBase',
  'importTemporaryBase',
  'importExtraContainer',
  'exportBase',
  'exportExtraContainer',
] as const;

const CLEARER_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  nationalId: true,
  ports: { select: { port: { select: { id: true, name: true, kind: true } } } },
  freeZones: { select: { freeZone: { select: { id: true, name: true } } } },
  importFinalBase: true,
  importTemporaryBase: true,
  importExtraContainer: true,
  exportBase: true,
  exportExtraContainer: true,
  isActive: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClearerSelect;

type ClearerRow = Prisma.ClearerGetPayload<{ select: typeof CLEARER_SELECT }>;

/** جهة التخليص as plain lists: ports and free zones. */
const flat = ({ ports, freeZones, ...c }: ClearerRow) => ({
  ...c,
  ports: ports.map((p) => p.port),
  freeZones: freeZones.map((z) => z.freeZone),
});

@Injectable()
export class ClearersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ClearersQueryDto): Promise<Page<unknown>> {
    const where: Prisma.ClearerWhereInput = {
      deletedAt: null,
      ...(query.portId ? { ports: { some: { portId: query.portId } } } : {}),
      ...(query.freeZoneId
        ? { freeZones: { some: { freeZoneId: query.freeZoneId } } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { nationalId: { contains: query.search } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.clearer.findMany({
        where,
        select: CLEARER_SELECT,
        orderBy: { fullName: 'asc' },
        ...pageArgs(query),
      }),
      this.prisma.clearer.count({ where }),
    ]);
    return {
      items: items.map(flat),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Active clearers for the shipment form, with where they work (to list the matching first). */
  async options() {
    const rows = await this.prisma.clearer.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        fullName: true,
        ports: { select: { portId: true } },
        freeZones: { select: { freeZoneId: true } },
      },
      orderBy: { fullName: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      portIds: c.ports.map((p) => p.portId),
      freeZoneIds: c.freeZones.map((z) => z.freeZoneId),
    }));
  }

  async get(id: number) {
    const clearer = await this.prisma.clearer.findFirst({
      where: { id, deletedAt: null },
      select: CLEARER_SELECT,
    });
    if (!clearer) throw new NotFoundException('المستخلص غير موجود');
    return flat(clearer);
  }

  /** The workplaces must be Egyptian ports / airports and existing free zones. */
  private async workplaces(
    tx: Prisma.TransactionClient,
    id: number,
    dto: { portIds?: number[]; freeZoneIds?: number[] },
  ) {
    if (dto.portIds) {
      const ids = [...new Set(dto.portIds)];
      const found = await tx.port.count({
        where: { id: { in: ids }, isEgyptian: true },
      });
      if (found !== ids.length) {
        throw new BadRequestException(
          'جهة التخليص لازم تكون ميناء أو مطار مصري',
        );
      }
      await tx.clearerPort.deleteMany({ where: { clearerId: id } });
      await tx.clearerPort.createMany({
        data: ids.map((portId) => ({ clearerId: id, portId })),
      });
    }
    if (dto.freeZoneIds) {
      const ids = [...new Set(dto.freeZoneIds)];
      const found = await tx.freeZone.count({ where: { id: { in: ids } } });
      if (found !== ids.length) {
        throw new BadRequestException('المنطقة الحرة غير موجودة');
      }
      await tx.clearerFreeZone.deleteMany({ where: { clearerId: id } });
      await tx.clearerFreeZone.createMany({
        data: ids.map((freeZoneId) => ({ clearerId: id, freeZoneId })),
      });
    }
  }

  async create(actor: AuthUser, dto: CreateClearerDto) {
    const prices = Object.fromEntries(
      PRICE_FIELDS.map((f) => [f, toDecimal(dto[f])]),
    ) as Record<(typeof PRICE_FIELDS)[number], Prisma.Decimal>;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.clearer.create({
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          nationalId: dto.nationalId,
          notes: dto.notes,
          ...prices,
        },
        select: { id: true },
      });
      await this.workplaces(tx, created.id, dto);
      const clearer = flat(
        await tx.clearer.findUniqueOrThrow({
          where: { id: created.id },
          select: CLEARER_SELECT,
        }),
      );
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'clearer',
          entityId: clearer.id,
          after: clearer,
        },
        tx,
      );
      return clearer;
    });
  }

  async update(actor: AuthUser, id: number, dto: UpdateClearerDto) {
    const before = await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const { portIds, freeZoneIds, ...data } = dto;
      await tx.clearer.update({ where: { id }, data });
      await this.workplaces(tx, id, { portIds, freeZoneIds });
      const clearer = flat(
        await tx.clearer.findUniqueOrThrow({
          where: { id },
          select: CLEARER_SELECT,
        }),
      );
      if (dto.isActive === false) {
        await tx.user.updateMany({
          where: { clearerId: id, deletedAt: null },
          data: { isActive: false, sessionId: null },
        });
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'clearer',
          entityId: id,
          before,
          after: clearer,
        },
        tx,
      );
      return clearer;
    });
  }

  /** New prices apply to fees calculated from now on; fees already calculated keep theirs. */
  async updatePrices(actor: AuthUser, id: number, dto: ClearerPricesDto) {
    const before = await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const clearer = flat(
        await tx.clearer.update({
          where: { id },
          data: Object.fromEntries(
            PRICE_FIELDS.map((f) => [f, toDecimal(dto[f])]),
          ),
          select: CLEARER_SELECT,
        }),
      );
      await this.audit.log(
        {
          userId: actor.id,
          action: 'PRICES_UPDATE',
          entity: 'clearer',
          entityId: id,
          before,
          after: clearer,
        },
        tx,
      );
      return clearer;
    });
  }

  async remove(actor: AuthUser, id: number) {
    const before = await this.get(id);
    await this.prisma.$transaction(async (tx) => {
      const active = await tx.shipment.count({
        where: { clearerId: id, ...activeShipmentWhere() },
      });
      if (active > 0) {
        throw new ConflictException(
          `المستخلص عليه ${active} شحنة شغالة، انقلها لمستخلص تاني الأول`,
        );
      }
      const now = new Date();
      await tx.clearer.update({
        where: { id },
        data: { deletedAt: now, deletedById: actor.id, isActive: false },
      });
      await tx.user.updateMany({
        where: { clearerId: id, deletedAt: null },
        data: {
          deletedAt: now,
          deletedById: actor.id,
          isActive: false,
          sessionId: null,
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'DELETE',
          entity: 'clearer',
          entityId: id,
          before,
        },
        tx,
      );
    });
  }
}
