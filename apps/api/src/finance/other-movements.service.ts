import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MoneyDirection, OtherMovementKind, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { APPROVAL_RESET, assertCanEdit } from './approvals/approval.service';
import {
  CreateOtherMovementDto,
  MovementsQueryDto,
  UpdateOtherMovementDto,
} from './dto/movement.dto';
import { LedgerService } from './ledger.service';
import { decimal } from './money';
import { assertDayEditable, openDate } from './days';
import { DOCUMENT_INCLUDE } from './transfers.service';

const ACCOUNT = {
  select: { id: true, name: true, type: true, currency: true },
} as const;

/** FUNDING always brings money in and BANK_CHARGES always takes it out. */
const FIXED_DIRECTION: Partial<Record<OtherMovementKind, MoneyDirection>> = {
  FUNDING: 'IN',
  BANK_CHARGES: 'OUT',
};

/** Funding from management, bank charges and corrections, each with its reason. */
@Injectable()
export class OtherMovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  list(q: MovementsQueryDto) {
    const where: Prisma.OtherMovementWhereInput = {
      approvalStatus: q.status,
      accountId: q.accountId,
      movementDate: { gte: q.from, lte: q.to },
    };
    return this.prisma
      .$transaction([
        this.prisma.otherMovement.findMany({
          where,
          include: {
            account: ACCOUNT,
            createdBy: { select: { id: true, email: true } },
          },
          orderBy: { id: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        this.prisma.otherMovement.count({ where }),
      ])
      .then(([items, total]) => ({
        items,
        total,
        page: q.page,
        pageSize: q.pageSize,
      }));
  }

  async get(id: number) {
    const movement = await this.prisma.otherMovement.findUnique({
      where: { id },
      include: { account: ACCOUNT, ...DOCUMENT_INCLUDE },
    });
    if (!movement) throw new NotFoundException('الحركة غير موجودة');
    return movement;
  }

  async create(actor: AuthUser, dto: CreateOtherMovementDto) {
    const fixed = FIXED_DIRECTION[dto.kind];
    if (fixed && dto.direction && dto.direction !== fixed) {
      throw new BadRequestException(
        'التمويل دايمًا دخول، والمصاريف البنكية دايمًا خروج',
      );
    }
    const direction = fixed ?? dto.direction;
    if (!direction) throw new BadRequestException('حدد التسوية دخول ولا خروج');

    const id = await this.prisma.$transaction(async (tx) => {
      const account = await tx.moneyAccount.findUnique({
        where: { id: dto.accountId },
      });
      if (!account) throw new BadRequestException('الخزنة أو الحساب غير موجود');
      if (dto.kind === 'BANK_CHARGES' && account.type !== 'BANK') {
        throw new BadRequestException('المصاريف البنكية على حساب بنكي بس');
      }
      const movement = await tx.otherMovement.create({
        data: {
          accountId: dto.accountId,
          kind: dto.kind,
          direction,
          amount: decimal(dto.amount),
          reason: dto.reason,
          movementDate: await openDate(tx, dto.movementDate, 'تاريخ الحركة'),
          createdById: actor.id,
        },
      });
      await this.ledger.post(tx, {
        accountId: movement.accountId,
        direction,
        amount: movement.amount,
        date: movement.movementDate,
        source: 'OTHER',
        documentId: movement.id,
        actorId: actor.id,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'other_movement',
          entityId: movement.id,
          after: movement,
        },
        tx,
      );
      return movement.id;
    });
    return this.get(id);
  }

  async update(actor: AuthUser, id: number, dto: UpdateOtherMovementDto) {
    await this.prisma.$transaction(async (tx) => {
      if (!(await tx.otherMovement.count({ where: { id } }))) {
        throw new NotFoundException('الحركة غير موجودة');
      }
      // the version claim locks the row first, so what is read below cannot change under us
      const { count } = await tx.otherMovement.updateMany({
        where: { id, version: dto.version },
        data: { version: { increment: 1 } },
      });
      if (count !== 1) {
        throw new ConflictException(
          'الحركة اتعدلت بعد ما فتحتها، حدّث الصفحة وعدّل تاني',
        );
      }
      const before = await tx.otherMovement.findUniqueOrThrow({
        where: { id },
      });
      const { resetApproval } = assertCanEdit(actor, before);
      await assertDayEditable(tx, actor, before.movementDate);
      const amount =
        dto.amount !== undefined ? decimal(dto.amount) : before.amount;
      const movementDate =
        dto.movementDate !== undefined
          ? await openDate(tx, dto.movementDate, 'تاريخ الحركة', actor)
          : before.movementDate;
      const moneyChanged =
        !amount.equals(before.amount) ||
        movementDate.getTime() !== before.movementDate.getTime();
      if (moneyChanged)
        await this.ledger.reverseDocument(tx, 'OTHER', id, actor.id);
      const after = await tx.otherMovement.update({
        where: { id },
        data: {
          amount,
          movementDate,
          reason: dto.reason,
          ...(resetApproval ? APPROVAL_RESET : {}),
        },
      });
      if (moneyChanged) {
        await this.ledger.post(tx, {
          accountId: after.accountId,
          direction: after.direction,
          amount,
          date: movementDate,
          source: 'OTHER',
          documentId: id,
          actorId: actor.id,
        });
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'other_movement',
          entityId: id,
          before,
          after,
        },
        tx,
      );
    });
    return this.get(id);
  }
}
