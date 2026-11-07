import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MoneyAccount, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { APPROVAL_RESET, assertCanEdit } from './approvals/approval.service';
import {
  CreateTransferDto,
  MovementsQueryDto,
  UpdateTransferDto,
} from './dto/movement.dto';
import { LedgerService } from './ledger.service';
import { businessDate, decimal } from './money';

const ACCOUNT = {
  select: { id: true, name: true, type: true, currency: true },
} as const;
const USER = { select: { id: true, email: true } } as const;

export const DOCUMENT_INCLUDE = {
  createdBy: USER,
  reviewedBy: USER,
  managerBy: USER,
  approvedBy: USER,
  rejectedBy: USER,
} as const;

interface TransferFields {
  fromAccountId: number;
  toAccountId: number;
  amount: Prisma.Decimal;
  chequeNo: string | null;
  transferDate: Date;
}

/** Deposits (cash → bank), cheque withdrawals (bank → cash) and bank → bank. */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  list(q: MovementsQueryDto) {
    const where: Prisma.TransferWhereInput = {
      approvalStatus: q.status,
      transferDate: { gte: q.from, lte: q.to },
      ...(q.accountId
        ? { OR: [{ fromAccountId: q.accountId }, { toAccountId: q.accountId }] }
        : {}),
    };
    return this.prisma
      .$transaction([
        this.prisma.transfer.findMany({
          where,
          include: {
            fromAccount: ACCOUNT,
            toAccount: ACCOUNT,
            createdBy: USER,
          },
          orderBy: { id: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        this.prisma.transfer.count({ where }),
      ])
      .then(([items, total]) => ({
        items,
        total,
        page: q.page,
        pageSize: q.pageSize,
      }));
  }

  async get(id: number) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        fromAccount: ACCOUNT,
        toAccount: ACCOUNT,
        ...DOCUMENT_INCLUDE,
      },
    });
    if (!transfer) throw new NotFoundException('التحويل غير موجود');
    return transfer;
  }

  async create(actor: AuthUser, dto: CreateTransferDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      const fields: TransferFields = {
        fromAccountId: dto.fromAccountId,
        toAccountId: dto.toAccountId,
        amount: decimal(dto.amount),
        chequeNo: dto.chequeNo?.toUpperCase() ?? null,
        transferDate: businessDate(dto.transferDate, 'تاريخ التحويل'),
      };
      const { currency } = await this.check(tx, fields);
      const transfer = await tx.transfer.create({
        data: { ...fields, currency, notes: dto.notes, createdById: actor.id },
      });
      await this.post(tx, transfer.id, fields, actor.id);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'transfer',
          entityId: transfer.id,
          after: transfer,
        },
        tx,
      );
      return transfer.id;
    });
    return this.get(id);
  }

  async update(actor: AuthUser, id: number, dto: UpdateTransferDto) {
    await this.prisma.$transaction(async (tx) => {
      // the version claim locks the row first, so what is read below cannot change under us
      if (!(await tx.transfer.count({ where: { id } }))) {
        throw new NotFoundException('التحويل غير موجود');
      }
      await this.claim(tx, id, dto.version);
      const before = await tx.transfer.findUniqueOrThrow({ where: { id } });
      const { resetApproval } = assertCanEdit(actor, before);

      const fields: TransferFields = {
        fromAccountId: dto.fromAccountId ?? before.fromAccountId,
        toAccountId: dto.toAccountId ?? before.toAccountId,
        amount: dto.amount !== undefined ? decimal(dto.amount) : before.amount,
        chequeNo:
          dto.chequeNo === undefined
            ? before.chequeNo
            : (dto.chequeNo?.toUpperCase() ?? null),
        transferDate:
          dto.transferDate !== undefined
            ? businessDate(dto.transferDate, 'تاريخ التحويل')
            : before.transferDate,
      };
      const moneyChanged =
        fields.fromAccountId !== before.fromAccountId ||
        fields.toAccountId !== before.toAccountId ||
        !fields.amount.equals(before.amount) ||
        fields.transferDate.getTime() !== before.transferDate.getTime();

      const { currency } = await this.check(tx, fields);
      if (moneyChanged) {
        // the old lines are reversed and the corrected ones posted, both in this transaction
        await this.ledger.reverseDocument(tx, 'TRANSFER', id, actor.id);
      }
      const after = await tx.transfer.update({
        where: { id },
        data: {
          ...fields,
          currency,
          notes: dto.notes === undefined ? undefined : dto.notes,
          ...(resetApproval ? APPROVAL_RESET : {}),
        },
      });
      if (moneyChanged) await this.post(tx, id, fields, actor.id);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'transfer',
          entityId: id,
          before,
          after,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Both accounts exist, are active, differ and share one currency; a bank pays by cheque. */
  private async check(
    tx: Tx,
    f: TransferFields,
  ): Promise<{ currency: MoneyAccount['currency'] }> {
    if (f.fromAccountId === f.toAccountId) {
      throw new BadRequestException('التحويل لازم يكون بين حسابين مختلفين');
    }
    const accounts = await tx.moneyAccount.findMany({
      where: { id: { in: [f.fromAccountId, f.toAccountId] } },
    });
    const from = accounts.find((a) => a.id === f.fromAccountId);
    const to = accounts.find((a) => a.id === f.toAccountId);
    if (!from || !to)
      throw new BadRequestException('الخزنة أو الحساب غير موجود');
    const stopped = [from, to].find((a) => !a.isActive);
    if (stopped) throw new BadRequestException(`${stopped.name} موقوف`);
    if (from.currency !== to.currency) {
      throw new BadRequestException(
        'مفيش تغيير عملة: التحويل لازم يكون بين حسابين بنفس العملة',
      );
    }
    if (from.type === 'BANK' && !f.chequeNo) {
      throw new BadRequestException(
        'اكتب رقم الشيك أو التحويل لما الفلوس تطلع من البنك',
      );
    }
    return { currency: from.currency };
  }

  private async post(tx: Tx, id: number, f: TransferFields, actorId: number) {
    await this.ledger.lock(tx, [f.fromAccountId, f.toAccountId]);
    const line = {
      amount: f.amount,
      date: f.transferDate,
      source: 'TRANSFER' as const,
      documentId: id,
      actorId,
    };
    await this.ledger.post(tx, {
      ...line,
      accountId: f.fromAccountId,
      direction: 'OUT',
    });
    await this.ledger.post(tx, {
      ...line,
      accountId: f.toAccountId,
      direction: 'IN',
    });
  }

  private async claim(tx: Tx, id: number, version: number) {
    const { count } = await tx.transfer.updateMany({
      where: { id, version },
      data: { version: { increment: 1 } },
    });
    if (count !== 1) {
      throw new ConflictException(
        'التحويل اتعدل بعد ما فتحته، حدّث الصفحة وعدّل تاني',
      );
    }
  }
}
