import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CustomsRegime } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSettlementItemDto,
  UpdateFactoryPricesDto,
  UpdateFeeRateDto,
  UpdateSettlementItemDto,
} from './dto/prices.dto';
import { seedFactoryPrices } from './factory-prices';
import { decimal } from './money';

/** Ports whose sea imports take the fee rates (UN/LOCODE): Alexandria, El Dekheila. */
export const FEE_RATE_PORTS = ['EGALY', 'EGEDK'];

/**
 * The office price lists, set by the CEO: the clearer fee for sea imports through
 * Alexandria and El Dekheila, and the fixed-price items a clearer's custody is
 * settled with. A price change reaches new fees and settlements only.
 */
@Injectable()
export class PricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const [feeRates, items] = await Promise.all([
      this.prisma.clearerFeeRate.findMany({ orderBy: { regime: 'asc' } }),
      this.prisma.settlementItem.findMany({
        orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          price: true,
          perContainer: true,
          isActive: true,
          sortOrder: true,
        },
      }),
    ]);
    return { feeRates, items };
  }

  async updateFeeRate(
    actor: AuthUser,
    regime: CustomsRegime,
    dto: UpdateFeeRateDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.clearerFeeRate.findUnique({ where: { regime } });
      if (!before) throw new NotFoundException('السعر غير موجود');
      const after = await tx.clearerFeeRate.update({
        where: { regime },
        data: {
          firstContainer: decimal(dto.firstContainer),
          extraContainer: decimal(dto.extraContainer),
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'clearer_fee_rate',
          entityId: regime,
          before,
          after,
        },
        tx,
      );
      return after;
    });
  }

  /** A new item and its shipment expense type (same name), together. */
  /** A factory's price for each item, beside the item's default price. */
  async factoryPrices(factoryId: number) {
    const factory = await this.prisma.factory.findFirst({
      where: { id: factoryId, deletedAt: null },
      select: {
        id: true,
        name: true,
        client: { select: { id: true, name: true } },
      },
    });
    if (!factory) throw new NotFoundException('المصنع غير موجود');
    const items = await this.prisma.settlementItem.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      include: { factoryPrices: { where: { factoryId } } },
    });
    return {
      factory,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        perContainer: i.perContainer,
        isActive: i.isActive,
        defaultPrice: i.price,
        price: i.factoryPrices[0]?.price ?? i.price,
      })),
    };
  }

  /** The CEO sets a factory's own prices; new settlements take them. */
  async updateFactoryPrices(
    actor: AuthUser,
    factoryId: number,
    dto: UpdateFactoryPricesDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const factory = await tx.factory.findFirst({
        where: { id: factoryId, deletedAt: null },
      });
      if (!factory) throw new NotFoundException('المصنع غير موجود');
      const ids = dto.prices.map((p) => p.settlementItemId);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException('البند متكرر');
      }
      const found = await tx.settlementItem.count({
        where: { id: { in: ids } },
      });
      if (found !== ids.length) {
        throw new BadRequestException('فيه بند مش موجود في بنود التصفية');
      }
      const before = await tx.factoryItemPrice.findMany({
        where: { factoryId, settlementItemId: { in: ids } },
      });
      for (const p of dto.prices) {
        await tx.factoryItemPrice.upsert({
          where: {
            factoryId_settlementItemId: {
              factoryId,
              settlementItemId: p.settlementItemId,
            },
          },
          update: { price: decimal(p.price) },
          create: {
            factoryId,
            settlementItemId: p.settlementItemId,
            price: decimal(p.price),
          },
        });
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'factory_item_prices',
          entityId: factoryId,
          before,
          after: dto.prices,
        },
        tx,
      );
    });
    return this.factoryPrices(factoryId);
  }

  async createItem(actor: AuthUser, dto: CreateSettlementItemDto) {
    const name = dto.name.replace(/\s+/g, ' ').trim();
    return this.prisma.$transaction(async (tx) => {
      if (await tx.settlementItem.findUnique({ where: { name } })) {
        throw new ConflictException(`البند «${name}» موجود بالفعل`);
      }
      const type = await tx.expenseType.upsert({
        where: { scope_name: { scope: 'SHIPMENT', name } },
        update: {},
        create: { scope: 'SHIPMENT', name },
      });
      if (
        await tx.settlementItem.findUnique({
          where: { expenseTypeId: type.id },
        })
      ) {
        throw new ConflictException(`البند «${name}» موجود بالفعل`);
      }
      const last = await tx.settlementItem.aggregate({
        _max: { sortOrder: true },
      });
      const item = await tx.settlementItem.create({
        data: {
          name,
          price: decimal(dto.price),
          perContainer: dto.perContainer ?? false,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
          expenseTypeId: type.id,
        },
      });
      // every factory gets the new item at its default price
      await seedFactoryPrices(tx, { itemId: item.id });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'settlement_item',
          entityId: item.id,
          after: item,
        },
        tx,
      );
      return item;
    });
  }

  /** A rename renames its expense type too, so statements and reports read the new name. */
  async updateItem(actor: AuthUser, id: number, dto: UpdateSettlementItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.settlementItem.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('البند غير موجود');
      const name = dto.name?.replace(/\s+/g, ' ').trim();
      if (name && name !== before.name) {
        const clash = await tx.expenseType.findFirst({
          where: { scope: 'SHIPMENT', name, id: { not: before.expenseTypeId } },
        });
        if (
          clash ||
          (await tx.settlementItem.findUnique({ where: { name } }))
        ) {
          throw new ConflictException(
            `فيه بند أو نوع مصروف اسمه «${name}» بالفعل`,
          );
        }
        await tx.expenseType.update({
          where: { id: before.expenseTypeId },
          data: { name },
        });
      }
      const after = await tx.settlementItem.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(dto.price !== undefined ? { price: decimal(dto.price) } : {}),
          ...(dto.perContainer !== undefined
            ? { perContainer: dto.perContainer }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'settlement_item',
          entityId: id,
          before,
          after,
        },
        tx,
      );
      return after;
    });
  }
}
