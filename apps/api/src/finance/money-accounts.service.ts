import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { canSeeRestricted } from './approvals/approval.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBankAccountDto,
  LedgerQueryDto,
  UpdateAccountDto,
} from './dto/account.dto';
import { decimal } from './money';

const SOURCE_LABELS = {
  TRANSFER: 'تحويل',
  OTHER: 'حركة تانية',
  SALARY: 'مرتب',
  ADVANCE: 'سلفة',
  EXPENSE: 'مصروف عمومي',
  CUSTODY: 'عهدة',
  FEE_PAYMENT: 'صرف أتعاب',
} as const;

@Injectable()
export class MoneyAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Cash boxes first, then banks; each with its balance. */
  list() {
    return this.prisma.moneyAccount.findMany({
      orderBy: [{ type: 'asc' }, { currency: 'asc' }, { name: 'asc' }],
    });
  }

  async createBank(actor: AuthUser, dto: CreateBankAccountDto) {
    return this.prisma.$transaction(async (tx) => {
      const opening = decimal(dto.openingBalance);
      const account = await tx.moneyAccount.create({
        data: {
          ...dto,
          accountNumber: dto.accountNumber.toUpperCase(),
          type: 'BANK',
          openingBalance: opening,
          balance: opening,
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'money_account',
          entityId: account.id,
          after: account,
        },
        tx,
      );
      return account;
    });
  }

  async update(actor: AuthUser, id: number, dto: UpdateAccountDto) {
    return this.prisma.$transaction(async (tx) => {
      const [before] = await tx.$queryRaw<{ id: number }[]>`
        SELECT "id" FROM "money_accounts" WHERE "id" = ${id} FOR UPDATE`;
      if (!before) throw new NotFoundException('الحساب غير موجود');
      const account = await tx.moneyAccount.findUniqueOrThrow({
        where: { id },
      });
      if (
        account.type === 'CASH' &&
        (dto.bankName !== undefined || dto.accountNumber !== undefined)
      ) {
        throw new BadRequestException('الخزنة مالهاش بنك ولا رقم حساب');
      }
      if (account.type === 'CASH' && dto.isActive === false) {
        throw new BadRequestException('الخزنة مينفعش تتوقف');
      }
      const data: Prisma.MoneyAccountUpdateInput = {
        name: dto.name,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber?.toUpperCase(),
        isActive: dto.isActive,
      };
      if (dto.openingBalance !== undefined) {
        const used = await tx.moneyMovement.count({ where: { accountId: id } });
        if (used) {
          throw new BadRequestException(
            'الرصيد الافتتاحي بيتعدل قبل أول حركة بس. أي فرق بعد كده يتسجل كحركة تسوية',
          );
        }
        data.openingBalance = decimal(dto.openingBalance);
        data.balance = decimal(dto.openingBalance);
      }
      const after = await tx.moneyAccount.update({ where: { id }, data });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'money_account',
          entityId: id,
          before: account,
          after,
        },
        tx,
      );
      return after;
    });
  }

  /** The account statement: its ledger lines with the document each came from. */
  async ledger(actor: AuthUser, id: number, q: LedgerQueryDto) {
    const salaryData = canSeeRestricted(actor);
    const account = await this.prisma.moneyAccount.findUnique({
      where: { id },
    });
    if (!account) throw new NotFoundException('الحساب غير موجود');
    const where: Prisma.MoneyMovementWhereInput = {
      accountId: id,
      movementDate: { gte: q.from, lte: q.to },
    };
    const [rows, total, totals] = await this.prisma.$transaction([
      this.prisma.moneyMovement.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          createdBy: { select: { id: true, email: true } },
          transfer: {
            select: {
              id: true,
              chequeNo: true,
              notes: true,
              fromAccount: { select: { id: true, name: true } },
              toAccount: { select: { id: true, name: true } },
            },
          },
          otherMovement: { select: { id: true, kind: true, reason: true } },
          salary: {
            select: {
              id: true,
              salaryMonth: true,
              employee: { select: { id: true, fullName: true } },
            },
          },
          advance: {
            select: {
              id: true,
              employee: { select: { id: true, fullName: true } },
            },
          },
          custody: {
            select: {
              id: true,
              custodyNo: true,
              holderType: true,
              shipment: { select: { fileNo: true } },
            },
          },
          feePayment: {
            select: {
              id: true,
              fee: {
                select: {
                  clearer: { select: { fullName: true } },
                  shipment: { select: { fileNo: true } },
                },
              },
            },
          },
          expense: {
            select: {
              id: true,
              payee: true,
              receiptNo: true,
              expenseType: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.moneyMovement.count({ where }),
      this.prisma.moneyMovement.groupBy({
        by: ['direction'],
        where,
        orderBy: { direction: 'asc' },
        _sum: { amount: true },
      }),
    ]);
    const sum = (d: 'IN' | 'OUT') =>
      totals.find((t) => t.direction === d)?._sum?.amount ??
      new Prisma.Decimal(0);
    return {
      account,
      totals: { in: sum('IN'), out: sum('OUT') },
      items: rows.map((m) => ({
        ...m,
        id: m.id.toString(),
        reversalOfId: m.reversalOfId?.toString() ?? null,
        sourceLabel: SOURCE_LABELS[m.source],
        // the cash box shows the amount; whose salary it was stays with payroll
        ...(salaryData ? {} : { salary: null, advance: null }),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
