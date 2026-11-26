import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { todayCairo } from './money';
import { OtherMovementsService } from './other-movements.service';

const ZERO = new Prisma.Decimal(0);
const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export interface ReconcileInput {
  accountId: number;
  from: Date;
  to: Date;
  statementBalance: number;
  clearedKeys: string[];
  note?: string;
  bankLines?: unknown[];
}

export interface QuickRecordInput {
  accountId: number;
  kind: 'BANK_CHARGES' | 'INTEREST' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';
  amount: number;
  date?: Date;
  reason: string;
}

export interface Line {
  key: string;
  date: Date;
  sourceType: string;
  sourceId: number;
  ref: string;
  description: string;
  party: string | null;
  fileNo: string | null;
  /** + in, − out */
  amount: Prisma.Decimal;
}

/**
 * Bank reconciliation (phase 3): an account's balance in our books against the bank's
 * statement at the end of a period. The lines the bank showed are ticked and kept; the
 * rest stay outstanding (cheques not cashed yet, deposits in transit) and come first in
 * the next one. Expected in the bank = our balance − deposits not shown + payments not
 * shown; the difference with the statement must be zero, or explained in a note.
 */
@Injectable()
export class BankReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly others: OtherMovementsService,
    private readonly audit: AuditService,
  ) {}

  /** The company's bank accounts, each with its last reconciliation. */
  async accounts() {
    const rows = await this.prisma.moneyAccount.findMany({
      where: { type: 'BANK', ownership: 'COMPANY' },
      orderBy: [{ isActive: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        currency: true,
        bankName: true,
        isActive: true,
        reconciliations: { orderBy: { toDate: 'desc' }, take: 1, select: { id: true, toDate: true, status: true } },
      },
    });
    return rows.map(({ reconciliations: [last], ...a }) => ({
      ...a,
      last: last ? { id: last.id, to: day(last.toDate), status: last.status } : null,
    }));
  }

  async list(accountId?: number, status?: 'MATCHED' | 'DIFFERENCE') {
    const rows = await this.prisma.bankReconciliation.findMany({
      where: { accountId, status },
      orderBy: [{ toDate: 'desc' }, { id: 'desc' }],
      take: 200,
      include: {
        account: { select: { id: true, name: true, currency: true } },
        createdBy: { select: { email: true, employee: { select: { fullName: true } } } },
        _count: { select: { items: true } },
      },
    });
    const latest = new Map<number, number>();
    for (const r of rows) if (!latest.has(r.accountId)) latest.set(r.accountId, r.id);
    return rows.map(({ createdBy, _count, ...r }) => ({
      ...r,
      createdBy: createdBy.employee?.fullName ?? createdBy.email,
      clearedCount: _count.items,
      latest: latest.get(r.accountId) === r.id,
    }));
  }

  /**
   * The screen for a new reconciliation (or the latest one, to edit): the account's lines
   * up to the date that no other reconciliation has ticked, and our balance then.
   */
  async draft(accountId: number, from?: Date, to?: Date, editingId?: number) {
    const account = await this.bankAccount(accountId);
    const last = await this.prisma.bankReconciliation.findFirst({
      where: { accountId, ...(editingId ? { id: { not: editingId } } : {}) },
      orderBy: { toDate: 'desc' },
      select: { id: true, toDate: true, status: true, statementBalance: true },
    });
    const end = to ?? todayCairo();
    const start = from ?? (last ? addDays(last.toDate, 1) : await this.firstDate(accountId, end));
    const lines = await this.outstanding(this.prisma, accountId, end, editingId);
    const system = await this.balanceAt(this.prisma, accountId, end);
    const ticked = editingId
      ? new Set((await this.prisma.bankReconciliationItem.findMany({ where: { reconciliationId: editingId }, select: { lineKey: true } })).map((i) => i.lineKey))
      : new Set<string>();
    return {
      account: { id: account.id, name: account.name, currency: account.currency },
      from: day(start),
      to: day(end),
      last: last ? { id: last.id, to: day(last.toDate), status: last.status, statementBalance: last.statementBalance.toFixed(2) } : null,
      systemBalance: system.toFixed(2),
      lines: lines.map((l) => ({
        key: l.key,
        date: day(l.date),
        sourceType: l.sourceType,
        sourceId: l.sourceId,
        ref: l.ref,
        description: l.description,
        party: l.party,
        fileNo: l.fileNo,
        amount: l.amount.toFixed(2),
        prior: l.date < start,
        cleared: ticked.has(l.key),
      })),
    };
  }

  async get(id: number) {
    const r = await this.prisma.bankReconciliation.findUnique({
      where: { id },
      include: {
        account: { select: { id: true, name: true, currency: true } },
        createdBy: { select: { email: true, employee: { select: { fullName: true } } } },
        updatedBy: { select: { email: true, employee: { select: { fullName: true } } } },
      },
    });
    if (!r) throw new NotFoundException('التسوية غير موجودة');
    const latest = await this.prisma.bankReconciliation.findFirst({ where: { accountId: r.accountId }, orderBy: { toDate: 'desc' }, select: { id: true } });
    const draft = await this.draft(r.accountId, r.fromDate, r.toDate, r.id);
    return {
      ...r,
      createdBy: r.createdBy.employee?.fullName ?? r.createdBy.email,
      updatedBy: r.updatedBy ? (r.updatedBy.employee?.fullName ?? r.updatedBy.email) : null,
      latest: latest?.id === r.id,
      // the lines as the screen shows them: those it ticked, and those still outstanding then
      lines: draft.lines,
      systemBalanceNow: draft.systemBalance,
    };
  }

  async create(actor: AuthUser, input: ReconcileInput) {
    return this.prisma.$transaction(async (tx) => {
      await this.bankAccount(input.accountId, tx);
      const last = await tx.bankReconciliation.findFirst({ where: { accountId: input.accountId }, orderBy: { toDate: 'desc' } });
      if (last && input.from <= last.toDate)
        throw new BadRequestException(`آخر تسوية للحساب ده لحد ${day(last.toDate)}، فالتسوية الجديدة تبدأ من بعده`);
      const figures = await this.compute(tx, input);
      const row = await tx.bankReconciliation.create({
        data: {
          accountId: input.accountId,
          fromDate: input.from,
          toDate: input.to,
          ...figures.data,
          note: input.note?.trim() || null,
          bankLines: (input.bankLines ?? undefined) as Prisma.InputJsonValue | undefined,
          createdById: actor.id,
        },
      });
      await this.saveItems(tx, row.id, input.accountId, figures.cleared);
      await this.audit.log({ userId: actor.id, action: 'CREATE', entity: 'bank_reconciliation', entityId: String(row.id), after: row }, tx);
      return { id: row.id, status: row.status, difference: row.difference.toFixed(2) };
    });
  }

  /** The latest reconciliation of its account, while it has a difference (the CEO: any latest). */
  async update(actor: AuthUser, id: number, version: number, input: Omit<ReconcileInput, 'accountId' | 'from' | 'to'>) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.bankReconciliation.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('التسوية غير موجودة');
      await this.assertLatest(tx, before.accountId, id);
      if (before.status === 'MATCHED' && !actor.role.isSystem)
        throw new ForbiddenException('التسوية المتطابقة متقفلة، وتعديلها للمدير التنفيذي بس');
      if (before.version !== version) throw new BadRequestException('التسوية اتعدلت من حد تاني، حدّث الصفحة');
      await tx.bankReconciliationItem.deleteMany({ where: { reconciliationId: id } });
      const full = { ...input, accountId: before.accountId, from: before.fromDate, to: before.toDate };
      const figures = await this.compute(tx, full);
      const after = await tx.bankReconciliation.update({
        where: { id },
        data: {
          ...figures.data,
          note: input.note?.trim() || null,
          bankLines: (input.bankLines ?? before.bankLines ?? undefined) as Prisma.InputJsonValue | undefined,
          updatedById: actor.id,
          version: { increment: 1 },
        },
      });
      await this.saveItems(tx, id, before.accountId, figures.cleared);
      await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'bank_reconciliation', entityId: String(id), before, after }, tx);
      return { id, status: after.status, difference: after.difference.toFixed(2) };
    });
  }

  /** The CEO removes the latest reconciliation of an account, to do it again. */
  async remove(actor: AuthUser, id: number) {
    if (!actor.role.isSystem) throw new ForbiddenException('حذف تسوية للمدير التنفيذي بس');
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.bankReconciliation.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('التسوية غير موجودة');
      await this.assertLatest(tx, before.accountId, id);
      await tx.bankReconciliation.delete({ where: { id } });
      await this.audit.log({ userId: actor.id, action: 'DELETE', entity: 'bank_reconciliation', entityId: String(id), before }, tx);
    });
    return { id };
  }

  /** Something the bank shows that our books lack: recorded on the account from the screen. */
  async record(actor: AuthUser, input: QuickRecordInput) {
    await this.bankAccount(input.accountId);
    const map = {
      BANK_CHARGES: { kind: 'BANK_CHARGES', direction: 'OUT' },
      INTEREST: { kind: 'ADJUSTMENT', direction: 'IN' },
      ADJUSTMENT_IN: { kind: 'ADJUSTMENT', direction: 'IN' },
      ADJUSTMENT_OUT: { kind: 'ADJUSTMENT', direction: 'OUT' },
    } as const;
    const m = map[input.kind];
    const reason = input.kind === 'INTEREST' ? `فوايد دائنة · ${input.reason}` : input.reason;
    return this.others.create(actor, {
      accountId: input.accountId,
      kind: m.kind,
      direction: m.direction,
      amount: input.amount,
      reason: `${reason} (من تسوية البنك)`,
      movementDate: input.date,
    });
  }

  // ---------------------------------------------------------------------------------

  private async compute(tx: Tx, input: ReconcileInput) {
    const today = todayCairo();
    if (input.from > input.to) throw new BadRequestException('بداية الفترة بعد نهايتها');
    if (input.to > today) throw new BadRequestException('مينفعش تسوية لتاريخ لسه ما جاش');
    const lines = await this.outstanding(tx, input.accountId, input.to);
    const byKey = new Map(lines.map((l) => [l.key, l]));
    const unknown = input.clearedKeys.filter((k) => !byKey.has(k));
    if (unknown.length) throw new BadRequestException('فيه حركات اتعلّمت ومبقتش موجودة أو اتسوّت قبل كده، حدّث الصفحة');
    const keys = new Set(input.clearedKeys);
    const cleared = lines.filter((l) => keys.has(l.key));
    const pending = lines.filter((l) => !keys.has(l.key));
    const outIn = pending.filter((l) => l.amount.isPositive()).reduce((s, l) => s.plus(l.amount), ZERO);
    const outOut = pending.filter((l) => l.amount.isNegative()).reduce((s, l) => s.minus(l.amount), ZERO);
    const system = await this.balanceAt(tx, input.accountId, input.to);
    const statement = new Prisma.Decimal(input.statementBalance);
    const difference = statement.minus(system.minus(outIn).plus(outOut));
    const status = difference.isZero() ? ('MATCHED' as const) : ('DIFFERENCE' as const);
    if (status === 'DIFFERENCE' && !input.note?.trim())
      throw new BadRequestException(`فيه فرق ${difference.toFixed(2)}: اكتب ملاحظة بسببه عشان تحفظ`);
    return {
      cleared,
      data: { statementBalance: statement, systemBalance: system, outstandingIn: outIn, outstandingOut: outOut, difference, status },
    };
  }

  private async saveItems(tx: Tx, reconciliationId: number, accountId: number, lines: Line[]) {
    if (!lines.length) return;
    await tx.bankReconciliationItem.createMany({
      data: lines.map((l) => ({ reconciliationId, accountId, lineKey: l.key, entryDate: l.date, amount: l.amount })),
    });
  }

  private async assertLatest(tx: Tx, accountId: number, id: number) {
    const latest = await tx.bankReconciliation.findFirst({ where: { accountId }, orderBy: { toDate: 'desc' }, select: { id: true } });
    if (latest?.id !== id) throw new BadRequestException('دي مش آخر تسوية للحساب، والتعديل على آخر تسوية بس');
  }

  private async bankAccount(id: number, tx: Tx = this.prisma) {
    const account = await tx.moneyAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('الحساب غير موجود');
    if (account.type !== 'BANK' || account.ownership !== 'COMPANY') throw new BadRequestException('التسوية للحسابات البنكية بتاعة الشركة بس');
    return account;
  }

  private async firstDate(accountId: number, fallback: Date): Promise<Date> {
    const [r] = await this.prisma.$queryRaw<{ d: Date | null }[]>`
      SELECT MIN("entry_date") AS d FROM "gl_lines_v" WHERE "account_key" = ${`MA:${accountId}`}`;
    return r.d ?? fallback;
  }

  /** Our balance of the account at the end of the day. */
  private async balanceAt(tx: Tx, accountId: number, to: Date): Promise<Prisma.Decimal> {
    const [r] = await tx.$queryRaw<{ b: Prisma.Decimal | null }[]>`
      SELECT SUM("debit" - "credit") AS b FROM "gl_lines_v"
       WHERE "account_key" = ${`MA:${accountId}`} AND "entry_date" <= ${to}::date`;
    return new Prisma.Decimal(r.b ?? 0);
  }

  /**
   * The account's lines up to the date that no reconciliation ticked (but the one being
   * edited), oldest first. The opening balance stands agreed.
   */
  private async outstanding(tx: Tx, accountId: number, to: Date, editingId?: number): Promise<Line[]> {
    const rows = await tx.$queryRaw<
      {
        entry_date: Date;
        source_type: string;
        source_id: number;
        ref: string;
        description: string;
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
        party: string | null;
        file_no: string | null;
      }[]
    >`
      SELECT g."entry_date", g."source_type", g."source_id", g."ref", g."description", g."debit", g."credit",
             COALESCE(cl."name", c."full_name", e."full_name", p."name") AS party, s."file_no"
        FROM "gl_lines_v" g
        LEFT JOIN "clients" cl ON cl."id" = g."client_id"
        LEFT JOIN "clearers" c ON c."id" = g."clearer_id"
        LEFT JOIN "employees" e ON e."id" = g."employee_id"
        LEFT JOIN "internal_parties" p ON p."id" = g."party_id"
        LEFT JOIN "shipments" s ON s."id" = g."shipment_id"
       WHERE g."account_key" = ${`MA:${accountId}`} AND g."source_type" <> 'OPENING'
         AND g."entry_date" <= ${to}::date
       ORDER BY g."entry_date", g."source_type", g."source_id", g."debit", g."credit"`;
    const seen = new Map<string, number>();
    const lines: Line[] = rows.map((r) => {
      const amount = new Prisma.Decimal(r.debit).minus(r.credit);
      const base = `${r.source_type}:${r.source_id}:${amount.isPositive() ? 'D' : 'C'}:${amount.abs().toFixed(2)}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return {
        key: `${base}#${n}`,
        date: r.entry_date,
        sourceType: r.source_type,
        sourceId: r.source_id,
        ref: r.ref,
        description: r.description,
        party: r.party,
        fileNo: r.file_no,
        amount,
      };
    });
    const done = new Set(
      (
        await tx.bankReconciliationItem.findMany({
          where: { accountId, ...(editingId ? { reconciliationId: { not: editingId } } : {}) },
          select: { lineKey: true },
        })
      ).map((i) => i.lineKey),
    );
    return lines.filter((l) => !done.has(l.key));
  }
}
