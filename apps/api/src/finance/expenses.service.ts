import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExpenseCategory, ExpenseScope, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, can } from '../auth/auth-user';
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
import {
  assertMayRecordOn,
  bankPayment,
  postBankCharges,
} from './bank-payment';
import { egpCashBox, egpPayingAccount } from './paying-account';
import { assertDayEditable, openDate } from './days';
import { DOCUMENT_INCLUDE } from './transfers.service';

const TYPE = { select: { id: true, name: true, category: true } } as const;

/** The main items of the general expenses, in the order the office lists them. */
export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  GENERAL_EXPENSES: 'مصاريف عمومية',
  TRANSPORT: 'انتقالات',
  TIPS_DONATIONS: 'إكراميات وتبرعات',
  PETTY: 'نثريات',
  PURCHASES: 'مشتريات',
  COMMISSIONS: 'عمولات',
  BILLS_UTILITIES: 'فواتير ومرافق',
};

/**
 * General office expenses (petty cash included), paid in EGP from the cash box (the
 * treasury manager) or a bank account (the accountant, by transfer or cheque).
 */
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
      select: { id: true, name: true, category: true },
      orderBy: { name: 'asc' },
    });
  }

  /** A new item on the fixed list of general expenses (the fixed lists screen). */
  async createType(actor: AuthUser, name: string, category: ExpenseCategory) {
    return this.prisma.$transaction(async (tx) => {
      const clean = name.replace(/\s+/g, ' ').trim();
      const exists = await tx.expenseType.findUnique({ where: { scope_name: { scope: 'GENERAL', name: clean } } });
      if (exists) throw new BadRequestException(`«${clean}» موجود في القايمة`);
      const created = await tx.expenseType.create({ data: { scope: 'GENERAL', name: clean, category }, select: TYPE.select });
      await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'expense_type', entityId: created.id, after: created }, tx);
      return created;
    });
  }

  /** Moves a general expense type under another main item, or renames it. */
  async setCategory(actor: AuthUser, id: number, category?: ExpenseCategory, name?: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.expenseType.findUnique({ where: { id } });
      if (!before || before.scope !== 'GENERAL')
        throw new NotFoundException('نوع المصروف غير موجود');
      const clean = name?.replace(/\s+/g, ' ').trim();
      if (clean && clean !== before.name) {
        const taken = await tx.expenseType.findUnique({ where: { scope_name: { scope: 'GENERAL', name: clean } } });
        if (taken) throw new BadRequestException(`«${clean}» موجود في القايمة`);
      }
      const after = await tx.expenseType.update({
        where: { id },
        data: { category, name: clean || undefined },
        select: TYPE.select,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'expense_type',
          entityId: id,
          before,
          after,
        },
        tx,
      );
      return after;
    });
  }

  private where(q: ExpensesQueryDto): Prisma.GeneralExpenseWhereInput {
    return {
      expenseTypeId: q.expenseTypeId,
      expenseType: q.category ? { category: q.category } : undefined,
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

  /** The report: totals per main item, per type and per payee for the filter, and the grand total. */
  async report(q: ExpensesQueryDto) {
    const where = this.where(q);
    const [byType, byPayee, sum, types, charges] = await Promise.all([
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
      this.prisma.generalExpense.aggregate({
        where,
        _sum: { bankCharges: true },
      }),
    ]);
    const type = (id: number) => types.find((t) => t.id === id);
    const categories = new Map<
      ExpenseCategory,
      { total: Prisma.Decimal; count: number }
    >();
    for (const t of byType) {
      const category = type(t.expenseTypeId)?.category ?? 'GENERAL_EXPENSES';
      const c = categories.get(category) ?? {
        total: new Prisma.Decimal(0),
        count: 0,
      };
      c.total = c.total.plus(t._sum.amount ?? 0);
      c.count += t._count;
      categories.set(category, c);
    }
    return {
      total: sum._sum.amount ?? new Prisma.Decimal(0),
      count: sum._count,
      /** The bank charges paid with these expenses, apart from the items. */
      bankCharges: charges._sum.bankCharges ?? new Prisma.Decimal(0),
      byCategory: [...categories.entries()]
        .map(([category, c]) => ({
          category,
          label: EXPENSE_CATEGORIES[category],
          total: c.total,
          count: c.count,
        }))
        .sort((a, b) => b.total.comparedTo(a.total)),
      byType: byType.map((t) => ({
        expenseType: {
          id: t.expenseTypeId,
          name: type(t.expenseTypeId)?.name ?? '',
          category: type(t.expenseTypeId)?.category ?? null,
        },
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
        account: {
          select: { id: true, name: true, type: true, currency: true },
        },
        ...DOCUMENT_INCLUDE,
      },
    });
    if (!expense) throw new NotFoundException('المصروف غير موجود');
    return expense;
  }

  async create(actor: AuthUser, dto: CreateExpenseDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      const account = dto.accountId
        ? await egpPayingAccount(tx, dto.accountId)
        : await egpCashBox(tx);
      assertMayRecordOn(actor, account, 'finance.expenses.manage');
      const bank = bankPayment(account, dto);
      const type = await this.typeFor(tx, dto.expenseType, dto.category, can(actor, 'finance.expenses.manage'));
      const expense = await tx.generalExpense.create({
        data: {
          expenseTypeId: type.id,
          payee: dto.payee,
          amount: decimal(dto.amount),
          receiptNo: dto.receiptNo.toUpperCase(),
          expenseDate: await openDate(tx, dto.expenseDate, 'تاريخ المصروف'),
          accountId: account.id,
          notes: dto.notes,
          ...bank,
          createdById: actor.id,
        },
      });
      await this.post(tx, expense, actor.id);
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
      const account = await tx.moneyAccount.findUniqueOrThrow({
        where: { id: before.accountId },
      });
      const bank = bankPayment(account, {
        paymentMethod:
          dto.paymentMethod !== undefined
            ? dto.paymentMethod
            : before.paymentMethod,
        reference:
          dto.reference !== undefined ? dto.reference : before.reference,
        bankCharges:
          dto.bankCharges !== undefined ? dto.bankCharges : before.bankCharges,
      });
      const amount =
        dto.amount !== undefined ? decimal(dto.amount) : before.amount;
      const expenseDate =
        dto.expenseDate !== undefined
          ? await openDate(tx, dto.expenseDate, 'تاريخ المصروف', actor)
          : before.expenseDate;
      const moneyChanged =
        !amount.equals(before.amount) ||
        !bank.bankCharges.equals(before.bankCharges) ||
        expenseDate.getTime() !== before.expenseDate.getTime();
      if (moneyChanged)
        await this.ledger.reverseDocument(tx, 'EXPENSE', id, actor.id);
      const after = await tx.generalExpense.update({
        where: { id },
        data: {
          expenseTypeId: dto.expenseType
            ? (await this.typeFor(tx, dto.expenseType, dto.category, can(actor, 'finance.expenses.manage'))).id
            : undefined,
          payee: dto.payee,
          amount,
          receiptNo: dto.receiptNo?.toUpperCase(),
          expenseDate,
          notes: dto.notes === undefined ? undefined : dto.notes,
          ...bank,
          ...(resetApproval ? APPROVAL_RESET : {}),
        },
      });
      if (moneyChanged) await this.post(tx, after, actor.id);
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

  /**
   * The type by name (spacing ignored). A new name joins the list under the main item
   * given with it; an existing one keeps its own.
   */
  /** A type by its name; a new one is added only by who may write free text (not the accountant). */
  private async typeFor(tx: Tx, name: string, category?: ExpenseCategory, mayAdd = true) {
    const clean = name.replace(/\s+/g, ' ').trim();
    const found = await tx.expenseType.findUnique({
      where: { scope_name: { scope: 'GENERAL', name: clean } },
    });
    if (found) return found;
    if (!mayAdd)
      throw new BadRequestException(`«${clean}» مش في قايمة بنود المصروفات. البنود بتتضاف من «القوائم الثابتة»`);
    if (!category) {
      throw new BadRequestException(
        `«${clean}» نوع جديد: اختار البند الرئيسي بتاعه`,
      );
    }
    return tx.expenseType.create({
      data: { scope: 'GENERAL', name: clean, category },
    });
  }

  /** The expense's line, and the bank's charges as a second line on the same account. */
  private async post(
    tx: Tx,
    e: {
      id: number;
      accountId: number;
      amount: Prisma.Decimal;
      bankCharges: Prisma.Decimal;
      expenseDate: Date;
    },
    actorId: number,
  ) {
    const line = {
      accountId: e.accountId,
      date: e.expenseDate,
      source: 'EXPENSE' as const,
      documentId: e.id,
      actorId,
    };
    await this.ledger.post(tx, { ...line, direction: 'OUT', amount: e.amount });
    await postBankCharges(this.ledger, tx, {
      ...line,
      charges: e.bankCharges,
    });
  }
}
