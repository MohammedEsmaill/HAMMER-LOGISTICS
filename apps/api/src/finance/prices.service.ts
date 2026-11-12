import {
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
  UpdateFeeRateDto,
  UpdateSettlementItemDto,
} from './dto/prices.dto';
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
