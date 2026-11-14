import { Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseScope, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { APPROVAL_RESET, assertCanEdit } from './approvals/approval.service';
import { claimDocument } from './document-version';
import {
  CreateExpenseDto,
  ExpensesQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import { LedgerService } from './ledger.service';
import { decimal } from './money';
import { egpCashBox } from './paying-account';
import { assertDayEditable, openDate } from './days';
import { DOCUMENT_INCLUDE } from './transfers.service';

const TYPE = { select: { id: true, name: true } } as const;

/** General office expenses (petty cash included), paid from the EGP cash box. */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  types(scope: ExpenseScope = 'GENERAL') {
    return this.prisma.expenseType.findMany({
      where: { scope },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  private where(q: ExpensesQueryDto): Prisma.GeneralExpenseWhereInput {
    return {
      expenseTypeId: q.expenseTypeId,
      approvalStatus: q.status,
      expenseDate: { gte: q.from, lte: q.to },
      payee: q.payee ? { contains: q.payee, mode: 'insensitive' } : undefined,
    };
  }

  list(q: ExpensesQueryDto) {
    const where = this.where(q);
    return this.prisma
      .$transaction([
        this.prisma.generalExpense.findMany({
          where,
          include: {
            expenseType: TYPE,
            createdBy: { select: { id: true, email: true } },
          },
          orderBy: [{ expenseDate: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        this.prisma.generalExpense.count({ where }),
      ])
      .then(([items, total]) => ({
        items,
        total,
        page: q.page,
        pageSize: q.pageSize,
      }));
  }

  /** The report: totals per type and per payee for the filter, and the grand total. */
  async report(q: ExpensesQueryDto) {
    const where = this.where(q);
    const [byType, byPayee, sum, types] = await Promise.all([
      this.prisma.generalExpense.groupBy({
        by: ['expenseTypeId'],
        where,
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: 'desc' } },
      }),
      this.prisma.generalExpense.groupBy({
        by: ['payee'],
        where,
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: 'desc' } },
        take: 20,
      }),
      this.prisma.generalExpense.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.expenseType.findMany({
        where: { scope: 'GENERAL' },
        select: TYPE.select,
      }),
    ]);
    const name = (id: number) => types.find((t) => t.id === id)?.name ?? '';
    return {
      total: sum._sum.amount ?? new Prisma.Decimal(0),
      count: sum._count,
      byType: byType.map((t) => ({
        expenseType: { id: t.expenseTypeId, name: name(t.expenseTypeId) },
        total: t._sum.amount,
        count: t._count,
      })),
      byPayee: byPayee.map((p) => ({
        payee: p.payee,
        total: p._sum.amount,
        count: p._count,
      })),
    };
  }

  async get(id: number) {
    const expense = await this.prisma.generalExpense.findUnique({
      where: { id },
      include: {
        expenseType: TYPE,
        account: { select: { id: true, name: true, currency: true } },
        ...DOCUMENT_INCLUDE,
      },
    });
    if (!expense) throw new NotFoundException('المصروف غير موجود');
    return expense;
  }

  async create(actor: AuthUser, dto: CreateExpenseDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      const box = await egpCashBox(tx);
      const type = await this.typeFor(tx, dto.expenseType);
      const expense = await tx.generalExpense.create({
        data: {
          expenseTypeId: type.id,
          payee: dto.payee,
          amount: decimal(dto.amount),
          receiptNo: dto.receiptNo.toUpperCase(),
          expenseDate: await openDate(tx, dto.expenseDate, 'تاريخ المصروف'),
          accountId: box.id,
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      await this.post(
        tx,
        expense.id,
        box.id,
        expense.amount,
        expense.expenseDate,
        actor.id,
      );
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'general_expense',
          entityId: expense.id,
          after: expense,
        },
        tx,
      );
      return expense.id;
    });
    return this.get(id);
  }

  async update(actor: AuthUser, id: number, dto: UpdateExpenseDto) {
    await this.prisma.$transaction(async (tx) => {
      await claimDocument(tx, 'EXPENSE', id, dto.version);
      const before = await tx.generalExpense.findUniqueOrThrow({
        where: { id },
      });
      const { resetApproval } = assertCanEdit(actor, before);
      await assertDayEditable(tx, actor, before.expenseDate);
      const amount =
        dto.amount !== undefined ? decimal(dto.amount) : before.amount;
      const expenseDate =
        dto.expenseDate !== undefined
          ? await openDate(tx, dto.expenseDate, 'تاريخ المصروف', actor)
          : before.expenseDate;
      const moneyChanged =
        !amount.equals(before.amount) ||
        expenseDate.getTime() !== before.expenseDate.getTime();
      if (moneyChanged)
        await this.ledger.reverseDocument(tx, 'EXPENSE', id, actor.id);
      const after = await tx.generalExpense.update({
        where: { id },
        data: {
          expenseTypeId: dto.expenseType
            ? (await this.typeFor(tx, dto.expenseType)).id
            : undefined,
          payee: dto.payee,
          amount,
          receiptNo: dto.receiptNo?.toUpperCase(),
          expenseDate,
          notes: dto.notes === undefined ? undefined : dto.notes,
          ...(resetApproval ? APPROVAL_RESET : {}),
        },
      });
      if (moneyChanged)
        await this.post(tx, id, after.accountId, amount, expenseDate, actor.id);
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'general_expense',
          entityId: id,
          before,
          after,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** The type by name, created the first time it is typed (spacing ignored). */
  private async typeFor(tx: Tx, name: string) {
    const clean = name.replace(/\s+/g, ' ').trim();
    return tx.expenseType.upsert({
      where: { scope_name: { scope: 'GENERAL', name: clean } },
      update: {},
      create: { scope: 'GENERAL', name: clean },
    });
  }

  private post(
    tx: Tx,
    id: number,
    accountId: number,
    amount: Prisma.Decimal,
    date: Date,
    actorId: number,
  ) {
    return this.ledger.post(tx, {
      accountId,
      direction: 'OUT',
      amount,
      date,
      source: 'EXPENSE',
      documentId: id,
      actorId,
    });
  }
}
