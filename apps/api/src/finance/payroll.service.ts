import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { APPROVAL_RESET, assertCanEdit } from './approvals/approval.service';
import { claimDocument } from './document-version';
import {
  ADDITION_KINDS,
  AdvancesQueryDto,
  CreateAdvanceDto,
  CreateSalaryDto,
  SalariesQueryDto,
  SalaryAdjustmentDto,
  UpdateAdvanceDto,
  UpdateSalaryDto,
} from './dto/payroll.dto';
import { LedgerService } from './ledger.service';
import { decimal, formatAmount, todayCairo } from './money';
import { egpPayingAccount } from './paying-account';
import { assertDayEditable, openDate } from './days';
import { DOCUMENT_INCLUDE } from './transfers.service';

const EMPLOYEE = {
  select: { id: true, code: true, fullName: true, department: true },
} as const;
const ACCOUNT = {
  select: { id: true, name: true, type: true, currency: true },
} as const;
const ZERO = new Prisma.Decimal(0);

/** "2026-11" → 2026-11-01 (date only). */
const monthStart = (month: string) => new Date(`${month}-01T00:00:00.000Z`);

interface SalaryFigures {
  basic: Prisma.Decimal;
  additions: Prisma.Decimal;
  deductions: Prisma.Decimal;
  advanceDeduction: Prisma.Decimal;
  net: Prisma.Decimal;
}

/** Salaries (once per employee per month) and advances (repaid from salaries only). */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  // ───── salaries ─────

  /** What the salary form needs before paying: basic, advance balance, already paid. */
  async preview(employeeId: number, month: string) {
    const employee = await this.findEmployee(this.prisma, employeeId);
    const paid = await this.prisma.salaryPayment.findUnique({
      where: {
        employeeId_salaryMonth: { employeeId, salaryMonth: monthStart(month) },
      },
      select: { id: true, net: true, paymentDate: true },
    });
    return {
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        status: employee.status,
      },
      basic: employee.basicSalary,
      advanceBalance: await this.advanceBalance(this.prisma, employeeId),
      alreadyPaid: paid,
    };
  }

  listSalaries(q: SalariesQueryDto) {
    const where: Prisma.SalaryPaymentWhereInput = {
      employeeId: q.employeeId,
      approvalStatus: q.status,
      salaryMonth: q.month ? monthStart(q.month) : undefined,
    };
    return this.prisma
      .$transaction([
        this.prisma.salaryPayment.findMany({
          where,
          include: {
            employee: EMPLOYEE,
            account: ACCOUNT,
            createdBy: { select: { id: true, email: true } },
          },
          orderBy: [{ salaryMonth: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        this.prisma.salaryPayment.count({ where }),
        this.prisma.salaryPayment.aggregate({ where, _sum: { net: true } }),
      ])
      .then(([items, total, sum]) => ({
        items,
        total,
        totalNet: sum._sum.net ?? ZERO,
        page: q.page,
        pageSize: q.pageSize,
      }));
  }

  async getSalary(id: number) {
    const salary = await this.prisma.salaryPayment.findUnique({
      where: { id },
      include: { employee: EMPLOYEE, account: ACCOUNT, ...DOCUMENT_INCLUDE },
    });
    if (!salary) throw new NotFoundException('المرتب غير موجود');
    return salary;
  }

  async createSalary(actor: AuthUser, dto: CreateSalaryDto) {
    const month = monthStart(dto.salaryMonth);
    if (month > todayCairo()) {
      throw new BadRequestException('مينفعش تصرف مرتب شهر لسه مجاش');
    }
    const id = await this.prisma.$transaction(async (tx) => {
      // the employee row lock serialises everything that touches their advance balance
      const employee = await this.lockEmployee(tx, dto.employeeId);
      const exists = await tx.salaryPayment.findUnique({
        where: {
          employeeId_salaryMonth: {
            employeeId: employee.id,
            salaryMonth: month,
          },
        },
      });
      if (exists) {
        throw new BadRequestException(
          `مرتب ${dto.salaryMonth} لـ ${employee.fullName} اتصرف قبل كده (رقم ${exists.id})`,
        );
      }
      const account = await egpPayingAccount(tx, dto.accountId);
      const adjustments = dto.adjustments ?? [];
      const figures = this.figures(
        employee.basicSalary,
        adjustments,
        decimal(dto.advanceDeduction ?? 0),
        await this.advanceBalance(tx, employee.id),
      );
      const salary = await tx.salaryPayment.create({
        data: {
          employeeId: employee.id,
          salaryMonth: month,
          adjustments: adjustments as unknown as Prisma.InputJsonValue,
          ...figures,
          accountId: account.id,
          paymentDate: await openDate(tx, dto.paymentDate, 'تاريخ الصرف'),
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      await this.postSalary(
        tx,
        salary.id,
        salary.accountId,
        figures.net,
        salary.paymentDate,
        actor.id,
      );
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'salary_payment',
          entityId: salary.id,
          after: salary,
        },
        tx,
      );
      return salary.id;
    });
    return this.getSalary(id);
  }

  async updateSalary(actor: AuthUser, id: number, dto: UpdateSalaryDto) {
    await this.prisma.$transaction(async (tx) => {
      await claimDocument(tx, 'SALARY', id, dto.version);
      const before = await tx.salaryPayment.findUniqueOrThrow({
        where: { id },
      });
      const { resetApproval } = assertCanEdit(actor, before);
      await assertDayEditable(tx, actor, before.paymentDate);
      await this.lockEmployee(tx, before.employeeId);

      const adjustments =
        dto.adjustments ??
        (before.adjustments as unknown as SalaryAdjustmentDto[]);
      const advanceDeduction =
        dto.advanceDeduction !== undefined
          ? decimal(dto.advanceDeduction)
          : before.advanceDeduction;
      // this salary's own deduction is available again while it is being edited
      const balance = (await this.advanceBalance(tx, before.employeeId)).plus(
        before.advanceDeduction,
      );
      // the basic stays as it was when the salary was paid
      const figures = this.figures(
        before.basic,
        adjustments,
        advanceDeduction,
        balance,
      );
      const accountId = dto.accountId ?? before.accountId;
      if (dto.accountId !== undefined) await egpPayingAccount(tx, accountId);
      const paymentDate =
        dto.paymentDate !== undefined
          ? await openDate(tx, dto.paymentDate, 'تاريخ الصرف', actor)
          : before.paymentDate;

      const moneyChanged =
        !figures.net.equals(before.net) ||
        accountId !== before.accountId ||
        paymentDate.getTime() !== before.paymentDate.getTime();
      if (moneyChanged)
        await this.ledger.reverseDocument(tx, 'SALARY', id, actor.id);
      const after = await tx.salaryPayment.update({
        where: { id },
        data: {
          adjustments: adjustments as unknown as Prisma.InputJsonValue,
          ...figures,
          accountId,
          paymentDate,
          notes: dto.notes === undefined ? undefined : dto.notes,
          ...(resetApproval ? APPROVAL_RESET : {}),
        },
      });
      if (moneyChanged)
        await this.postSalary(
          tx,
          id,
          accountId,
          figures.net,
          paymentDate,
          actor.id,
        );
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'salary_payment',
          entityId: id,
          before,
          after,
        },
        tx,
      );
    });
    return this.getSalary(id);
  }

  /** net = basic + additions − deductions − advance deduction; never below zero. */
  private figures(
    basic: Prisma.Decimal,
    adjustments: SalaryAdjustmentDto[],
    advanceDeduction: Prisma.Decimal,
    advanceBalance: Prisma.Decimal,
  ): SalaryFigures {
    const isAddition = (kind: string) =>
      (ADDITION_KINDS as readonly string[]).includes(kind);
    const sum = (list: SalaryAdjustmentDto[]) =>
      list.reduce((s, a) => s.plus(decimal(a.amount)), ZERO);
    const additions = sum(adjustments.filter((a) => isAddition(a.kind)));
    const deductions = sum(adjustments.filter((a) => !isAddition(a.kind)));
    if (advanceDeduction.greaterThan(advanceBalance)) {
      throw new BadRequestException(
        `خصم السلف أكبر من رصيد السلف (${formatAmount(advanceBalance)} ج)`,
      );
    }
    const net = new Prisma.Decimal(basic)
      .plus(additions)
      .minus(deductions)
      .minus(advanceDeduction);
    if (net.isNegative()) {
      throw new BadRequestException(
        `الخصومات أكبر من المرتب: الصافي هيبقى ${formatAmount(net)} ج`,
      );
    }
    return {
      basic: new Prisma.Decimal(basic),
      additions,
      deductions,
      advanceDeduction,
      net,
    };
  }

  /** A salary wholly taken by deductions moves no money. */
  private async postSalary(
    tx: Tx,
    id: number,
    accountId: number,
    net: Prisma.Decimal,
    date: Date,
    actorId: number,
  ) {
    if (net.isZero()) return;
    await this.ledger.post(tx, {
      accountId,
      direction: 'OUT',
      amount: net,
      date,
      source: 'SALARY',
      documentId: id,
      actorId,
    });
  }

  // ───── advances ─────

  listAdvances(q: AdvancesQueryDto) {
    const where: Prisma.EmployeeAdvanceWhereInput = {
      employeeId: q.employeeId,
      approvalStatus: q.status,
    };
    return this.prisma
      .$transaction([
        this.prisma.employeeAdvance.findMany({
          where,
          include: {
            employee: EMPLOYEE,
            account: ACCOUNT,
            createdBy: { select: { id: true, email: true } },
          },
          orderBy: { id: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        this.prisma.employeeAdvance.count({ where }),
      ])
      .then(([items, total]) => ({
        items,
        total,
        page: q.page,
        pageSize: q.pageSize,
      }));
  }

  async getAdvance(id: number) {
    const advance = await this.prisma.employeeAdvance.findUnique({
      where: { id },
      include: { employee: EMPLOYEE, account: ACCOUNT, ...DOCUMENT_INCLUDE },
    });
    if (!advance) throw new NotFoundException('السلفة غير موجودة');
    return advance;
  }

  async createAdvance(actor: AuthUser, dto: CreateAdvanceDto) {
    const id = await this.prisma.$transaction(async (tx) => {
      const employee = await this.lockEmployee(tx, dto.employeeId);
      if (employee.status !== 'ACTIVE') {
        throw new BadRequestException(
          `${employee.fullName} ساب الشغل، مينفعش ياخد سلفة`,
        );
      }
      const account = await egpPayingAccount(tx, dto.accountId);
      const advance = await tx.employeeAdvance.create({
        data: {
          employeeId: employee.id,
          amount: decimal(dto.amount),
          accountId: account.id,
          advanceDate: await openDate(tx, dto.advanceDate, 'تاريخ السلفة'),
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      await this.ledger.post(tx, {
        accountId: account.id,
        direction: 'OUT',
        amount: advance.amount,
        date: advance.advanceDate,
        source: 'ADVANCE',
        documentId: advance.id,
        actorId: actor.id,
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'CREATE',
          entity: 'employee_advance',
          entityId: advance.id,
          after: advance,
        },
        tx,
      );
      return advance.id;
    });
    return this.getAdvance(id);
  }

  async updateAdvance(actor: AuthUser, id: number, dto: UpdateAdvanceDto) {
    await this.prisma.$transaction(async (tx) => {
      await claimDocument(tx, 'ADVANCE', id, dto.version);
      const before = await tx.employeeAdvance.findUniqueOrThrow({
        where: { id },
      });
      const { resetApproval } = assertCanEdit(actor, before);
      await assertDayEditable(tx, actor, before.advanceDate);
      await this.lockEmployee(tx, before.employeeId);

      const amount =
        dto.amount !== undefined ? decimal(dto.amount) : before.amount;
      // what was already deducted from salaries cannot be un-lent
      const balanceAfter = (await this.advanceBalance(tx, before.employeeId))
        .minus(before.amount)
        .plus(amount);
      if (balanceAfter.isNegative()) {
        throw new BadRequestException(
          'المبلغ الجديد أقل من اللي اتخصم من المرتبات بالفعل على السلف',
        );
      }
      const accountId = dto.accountId ?? before.accountId;
      if (dto.accountId !== undefined) await egpPayingAccount(tx, accountId);
      const advanceDate =
        dto.advanceDate !== undefined
          ? await openDate(tx, dto.advanceDate, 'تاريخ السلفة', actor)
          : before.advanceDate;
      const moneyChanged =
        !amount.equals(before.amount) ||
        accountId !== before.accountId ||
        advanceDate.getTime() !== before.advanceDate.getTime();
      if (moneyChanged)
        await this.ledger.reverseDocument(tx, 'ADVANCE', id, actor.id);
      const after = await tx.employeeAdvance.update({
        where: { id },
        data: {
          amount,
          accountId,
          advanceDate,
          notes: dto.notes === undefined ? undefined : dto.notes,
          ...(resetApproval ? APPROVAL_RESET : {}),
        },
      });
      if (moneyChanged) {
        await this.ledger.post(tx, {
          accountId,
          direction: 'OUT',
          amount,
          date: advanceDate,
          source: 'ADVANCE',
          documentId: id,
          actorId: actor.id,
        });
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'employee_advance',
          entityId: id,
          before,
          after,
        },
        tx,
      );
    });
    return this.getAdvance(id);
  }

  /** One employee's advances and the salary deductions that repay them, with the running balance. */
  async advanceStatement(employeeId: number) {
    const employee = await this.findEmployee(this.prisma, employeeId);
    const [advances, salaries] = await Promise.all([
      this.prisma.employeeAdvance.findMany({
        where: { employeeId },
        select: {
          id: true,
          amount: true,
          advanceDate: true,
          notes: true,
          approvalStatus: true,
        },
      }),
      this.prisma.salaryPayment.findMany({
        where: { employeeId, advanceDeduction: { gt: 0 } },
        select: {
          id: true,
          advanceDeduction: true,
          paymentDate: true,
          salaryMonth: true,
          approvalStatus: true,
        },
      }),
    ]);
    const lines = [
      ...advances.map((a) => ({
        kind: 'ADVANCE' as const,
        id: a.id,
        date: a.advanceDate,
        debit: a.amount,
        credit: ZERO,
        description: a.notes ?? 'سلفة',
        approvalStatus: a.approvalStatus,
      })),
      ...salaries.map((s) => ({
        kind: 'DEDUCTION' as const,
        id: s.id,
        date: s.paymentDate,
        debit: ZERO,
        credit: s.advanceDeduction,
        description: `خصم من مرتب ${s.salaryMonth.toISOString().slice(0, 7)}`,
        approvalStatus: s.approvalStatus,
      })),
    ].sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() || (a.kind === 'ADVANCE' ? -1 : 1),
    );
    let balance = ZERO;
    const withBalance = lines.map((l) => {
      balance = balance.plus(l.debit).minus(l.credit);
      return { ...l, balance };
    });
    return {
      employee: {
        id: employee.id,
        code: employee.code,
        fullName: employee.fullName,
      },
      lines: withBalance,
      totals: {
        advances: lines.reduce((s, l) => s.plus(l.debit), ZERO),
        deducted: lines.reduce((s, l) => s.plus(l.credit), ZERO),
        balance,
      },
    };
  }

  /** Employees who still owe advances, for the advances screen. */
  async balances() {
    const rows = await this.prisma.$queryRaw<
      {
        employee_id: number;
        full_name: string;
        code: string;
        advances: Prisma.Decimal;
        deducted: Prisma.Decimal;
      }[]
    >`
      SELECT e."id" AS "employee_id", e."full_name", e."code",
             coalesce(a."total", 0) AS "advances", coalesce(s."total", 0) AS "deducted"
        FROM "employees" e
        JOIN (SELECT "employee_id", sum("amount") AS "total" FROM "employee_advances" GROUP BY 1) a
          ON a."employee_id" = e."id"
        LEFT JOIN (SELECT "employee_id", sum("advance_deduction") AS "total" FROM "salary_payments" GROUP BY 1) s
          ON s."employee_id" = e."id"
       ORDER BY e."full_name"`;
    return rows.map((r) => ({
      employee: { id: r.employee_id, fullName: r.full_name, code: r.code },
      advances: r.advances,
      deducted: r.deducted,
      balance: new Prisma.Decimal(r.advances).minus(r.deducted),
    }));
  }

  // ───── shared ─────

  /** Advances paid minus what salaries have deducted. */
  private async advanceBalance(
    tx: Tx | PrismaService,
    employeeId: number,
  ): Promise<Prisma.Decimal> {
    const [advances, deducted] = await Promise.all([
      tx.employeeAdvance.aggregate({
        where: { employeeId },
        _sum: { amount: true },
      }),
      tx.salaryPayment.aggregate({
        where: { employeeId },
        _sum: { advanceDeduction: true },
      }),
    ]);
    return (advances._sum.amount ?? ZERO).minus(
      deducted._sum.advanceDeduction ?? ZERO,
    );
  }

  private async lockEmployee(tx: Tx, id: number): Promise<Employee> {
    const [row] = await tx.$queryRaw<{ id: number }[]>`
      SELECT "id" FROM "employees" WHERE "id" = ${id} AND "deleted_at" IS NULL FOR UPDATE`;
    if (!row) throw new NotFoundException('الموظف غير موجود');
    return tx.employee.findUniqueOrThrow({ where: { id } });
  }

  private async findEmployee(
    db: Tx | PrismaService,
    id: number,
  ): Promise<Employee> {
    const employee = await db.employee.findFirst({
      where: { id, deletedAt: null },
    });
    if (!employee) throw new NotFoundException('الموظف غير موجود');
    return employee;
  }
}
