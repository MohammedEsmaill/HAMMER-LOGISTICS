import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, can } from '../auth/auth-user';
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
  customsOffices: true,
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

@Injectable()
export class ClearersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ClearersQueryDto): Promise<Page<unknown>> {
    const where: Prisma.ClearerWhereInput = {
      deletedAt: null,
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
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Active clearers for the shipment form. */
  options() {
    return this.prisma.clearer.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async get(id: number) {
    const clearer = await this.prisma.clearer.findFirst({
      where: { id, deletedAt: null },
      select: CLEARER_SELECT,
    });
    if (!clearer) throw new NotFoundException('المستخلص غير موجود');
    return clearer;
  }

  async create(actor: AuthUser, dto: CreateClearerDto) {
    const sentPrices = PRICE_FIELDS.some((f) => dto[f] !== undefined);
    if (sentPrices && !can(actor, 'clearers.prices.manage')) {
      throw new ForbiddenException('أسعار المستخلصين يحطها الـ CEO بس');
    }
    const prices = Object.fromEntries(
      PRICE_FIELDS.map((f) => [f, toDecimal(dto[f] ?? 0)]),
    ) as Record<(typeof PRICE_FIELDS)[number], Prisma.Decimal>;

    return this.prisma.$transaction(async (tx) => {
      const clearer = await tx.clearer.create({
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          nationalId: dto.nationalId,
          customsOffices: dto.customsOffices ?? [],
          notes: dto.notes,
          ...prices,
        },
        select: CLEARER_SELECT,
      });
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
      const clearer = await tx.clearer.update({
        where: { id },
        data: dto,
        select: CLEARER_SELECT,
      });
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
      const clearer = await tx.clearer.update({
        where: { id },
        data: Object.fromEntries(
          PRICE_FIELDS.map((f) => [f, toDecimal(dto[f])]),
        ),
        select: CLEARER_SELECT,
      });
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
