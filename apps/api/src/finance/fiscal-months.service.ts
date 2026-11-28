import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, isTopManager } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialStatementsService } from './financial-statements.service';
import { GeneralLedgerService } from './general-ledger.service';
import { todayCairo } from './money';

const CURRENCIES: Currency[] = ['EGP', 'USD'];

/** "2026-11" → 2026-11-01 */
export function monthStart(text: string): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) throw new BadRequestException('الشهر لازم يكون YYYY-MM');
  const [y, m] = text.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}
/** The month's last day. */
export const monthEnd = (start: Date) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
const nextMonth = (start: Date) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
const text = (d: Date) => d.toISOString().slice(0, 7);
const day = (d: Date) => d.toISOString().slice(0, 10);

export interface Snapshot {
  revenues: string;
  expenses: string;
  net: string;
  /** each account's balance at the month's end */
  closing: Record<string, string>;
}

export interface Issue {
  kind: string;
  title: string;
  detail?: string;
  link?: string;
}

/**
 * Closing the months (phase 3). A month closes once it has ended, after the one before
 * it, with nothing left waiting for approval in it; its figures are kept as they stood.
 * Then only the CEO records or changes anything dated in it (see days.ts), and the CEO
 * alone reopens the last closed month, with a reason.
 */
@Injectable()
export class FiscalMonthsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gl: GeneralLedgerService,
    private readonly statements: FinancialStatementsService,
    private readonly audit: AuditService,
  ) {}

  /** From the first month with any entry to the current one, newest first. */
  async list() {
    const [[first], rows] = await Promise.all([
      this.prisma.$queryRaw<{ d: Date | null }[]>`SELECT MIN("entry_date") AS d FROM "gl_lines_v"`,
      this.prisma.fiscalMonth.findMany({
        include: {
          closedBy: { select: { id: true, email: true, employee: { select: { fullName: true } } } },
          reopenedBy: { select: { id: true, email: true, employee: { select: { fullName: true } } } },
        },
      }),
    ]);
    const today = todayCairo();
    const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const byMonth = new Map(rows.map((r) => [text(r.month), r]));
    const months: Date[] = [];
    for (let m = first.d ? new Date(Date.UTC(first.d.getUTCFullYear(), first.d.getUTCMonth(), 1)) : current; m <= current; m = nextMonth(m))
      months.push(m);
    const out = [];
    for (const m of months.reverse()) {
      const row = byMonth.get(text(m));
      const closed = row?.status === 'CLOSED';
      const figures: Record<string, { revenues: string; expenses: string; net: string }> = {};
      for (const c of CURRENCIES) {
        const snap = closed ? (row?.snapshot as Record<string, Snapshot> | null)?.[c] : null;
        if (snap) figures[c] = { revenues: snap.revenues, expenses: snap.expenses, net: snap.net };
        else {
          const s = await this.statements.incomeStatement(c, m, monthEnd(m));
          figures[c] = { revenues: s.revenues.total, expenses: s.expenses.total, net: s.net };
        }
      }
      const who = (u: { email: string; employee: { fullName: string } | null } | null | undefined) =>
        u ? (u.employee?.fullName ?? u.email) : null;
      out.push({
        month: text(m),
        status: closed ? 'CLOSED' : m >= current ? 'CURRENT' : 'OPEN',
        closedAt: closed ? row?.closedAt : null,
        closedBy: closed ? who(row?.closedBy) : null,
        reopenedAt: row?.reopenedAt ?? null,
        reopenedBy: who(row?.reopenedBy),
        reopenReason: row?.reopenReason ?? null,
        figures,
        changedSinceClose: closed ? await this.changes(m, row?.snapshot as Record<string, Snapshot> | null) : [],
      });
    }
    return out;
  }

  /** What stops the month from closing, and what to know before closing it. */
  async check(monthText: string) {
    const start = monthStart(monthText);
    const end = monthEnd(start);
    const blockers: Issue[] = [];
    const warnings: Issue[] = [];
    const today = todayCairo();
    if (end >= today) blockers.push({ kind: 'NOT_ENDED', title: `الشهر لسه ما خلصش (آخره ${day(end)})` });

    const row = await this.prisma.fiscalMonth.findUnique({ where: { month: start } });
    if (row?.status === 'CLOSED') blockers.push({ kind: 'CLOSED', title: 'الشهر مقفول أصلاً' });

    // the months before it close first
    const [[first]] = await Promise.all([
      this.prisma.$queryRaw<{ d: Date | null }[]>`SELECT MIN("entry_date") AS d FROM "gl_lines_v"`,
    ]);
    if (first.d) {
      const closed = new Set(
        (await this.prisma.fiscalMonth.findMany({ where: { status: 'CLOSED', month: { lt: start } }, select: { month: true } })).map((r) =>
          text(r.month),
        ),
      );
      for (let m = new Date(Date.UTC(first.d.getUTCFullYear(), first.d.getUTCMonth(), 1)); m < start; m = nextMonth(m)) {
        if (!closed.has(text(m))) {
          blockers.push({ kind: 'EARLIER_OPEN', title: `شهر ${text(m)} لسه مفتوح، واتقفل الأول` });
          break;
        }
      }
    }

    // nothing dated in it waits for approval
    const pending = await this.prisma.$queryRaw<{ ref: string; d: Date; kind: string }[]>`
      SELECT * FROM (
        SELECT 'TR-' || "id" AS ref, "transfer_date" AS d, 'تحويل' AS kind FROM "transfers" WHERE "approval_status" NOT IN ('APPROVED', 'REJECTED')
        UNION ALL SELECT 'OM-' || "id", "movement_date", 'حركة خزنة' FROM "other_movements" WHERE "approval_status" NOT IN ('APPROVED', 'REJECTED')
        UNION ALL SELECT 'SL-' || "id", "payment_date", 'مرتب' FROM "salary_payments" WHERE "approval_status" NOT IN ('APPROVED', 'REJECTED')
        UNION ALL SELECT 'AD-' || "id", "advance_date", 'سلفة' FROM "employee_advances" WHERE "approval_status" NOT IN ('APPROVED', 'REJECTED')
        UNION ALL SELECT 'EX-' || "id", "expense_date", 'مصروف' FROM "general_expenses" WHERE "approval_status" NOT IN ('APPROVED', 'REJECTED')
        UNION ALL SELECT "custody_no", "issue_date", 'عهدة' FROM "custodies" WHERE "approval_status" NOT IN ('APPROVED', 'REJECTED')
        UNION ALL SELECT 'FA-' || "id", "adjustment_date", 'تسوية أتعاب' FROM "clearer_fee_adjustments" WHERE "approval_status" NOT IN ('APPROVED', 'REJECTED')
        UNION ALL SELECT 'FP-' || "id", "payment_date", 'صرف أتعاب' FROM "clearer_fee_payments" WHERE "approval_status" NOT IN ('APPROVED', 'REJECTED')
        UNION ALL SELECT 'CL-' || "id", "collection_date", 'تحصيل' FROM "collections" WHERE "approval_status" NOT IN ('APPROVED', 'REJECTED')
        UNION ALL SELECT 'PM-' || "id", "movement_date", 'حساب داخلي' FROM "party_movements" WHERE "approval_status" NOT IN ('APPROVED', 'REJECTED')
        UNION ALL SELECT "invoice_no", "invoice_date", 'فاتورة' FROM "invoices" WHERE "voided_at" IS NULL AND "approval_status" NOT IN ('APPROVED', 'REJECTED')
        UNION ALL SELECT 'AT-' || "id", "tx_date", 'أصل ثابت' FROM "asset_transactions" WHERE "approval_status" NOT IN ('APPROVED', 'REJECTED')
      ) p
      WHERE p.d BETWEEN ${start}::date AND ${end}::date
      ORDER BY p.d`;
    if (pending.length)
      blockers.push({
        kind: 'PENDING',
        title: `${pending.length} معاملة في الشهر لسه مستنية اعتماد`,
        detail: pending
          .slice(0, 15)
          .map((p) => `${p.kind} ${p.ref} (${day(p.d)})`)
          .join(' · '),
        link: '/approvals',
      });

    for (const p of await this.gl.check()) blockers.push({ kind: 'GL', title: 'الدفاتر مش متزنة', detail: p });

    // warnings only: custodies still open, bank accounts not reconciled to the month's end
    const custodies = await this.prisma.custody.findMany({
      where: { status: { not: 'SETTLED' }, issueDate: { lte: end } },
      select: { custodyNo: true, amount: true, currency: true },
      orderBy: { issueDate: 'asc' },
    });
    if (custodies.length)
      warnings.push({
        kind: 'OPEN_CUSTODY',
        title: `${custodies.length} عهدة مفتوحة صُرفت لحد آخر الشهر`,
        detail: custodies
          .slice(0, 15)
          .map((c) => `${c.custodyNo} (${new Prisma.Decimal(c.amount).toFixed(2)} ${c.currency === 'USD' ? '$' : 'ج'})`)
          .join(' · '),
        link: '/custodies',
      });
    const banks = await this.prisma.moneyAccount.findMany({
      where: { type: 'BANK', ownership: 'COMPANY', isActive: true },
      select: { id: true, name: true, reconciliations: { where: { toDate: { gte: end } }, take: 1, select: { id: true } } },
    });
    const unreconciled = banks.filter((b) => !b.reconciliations.length);
    if (unreconciled.length)
      warnings.push({
        kind: 'UNRECONCILED',
        title: `${unreconciled.length} حساب بنكي مش متسوّي لحد آخر الشهر`,
        detail: unreconciled.map((b) => b.name).join(' · '),
        link: '/general-ledger?tab=reconcile',
      });

    const figures: Record<string, Snapshot> = {};
    for (const c of CURRENCIES) figures[c] = await this.snapshot(c, start, end);
    return { month: monthText, from: day(start), to: day(end), blockers, warnings, figures };
  }

  async close(actor: AuthUser, monthText: string) {
    const result = await this.check(monthText);
    if (result.blockers.length)
      throw new BadRequestException(`مينفعش يتقفل: ${result.blockers.map((b) => b.title).join('، ')}`);
    const start = monthStart(monthText);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.fiscalMonth.findUnique({ where: { month: start } });
      const data = {
        status: 'CLOSED' as const,
        closedById: actor.id,
        closedAt: new Date(),
        snapshot: result.figures as unknown as Prisma.InputJsonValue,
        warnings: result.warnings as unknown as Prisma.InputJsonValue,
      };
      const after = await tx.fiscalMonth.upsert({ where: { month: start }, create: { month: start, ...data }, update: data });
      await this.audit.log({ userId: actor.id, action: 'CLOSE', entity: 'fiscal_month', entityId: monthText, before, after }, tx);
    });
    return { month: monthText, status: 'CLOSED', warnings: result.warnings };
  }

  /** The CEO reopens the last closed month, with a reason. */
  async reopen(actor: AuthUser, monthText: string, reason: string) {
    if (!isTopManager(actor)) throw new ForbiddenException('فتح شهر مقفول للمدير التنفيذي أو المدير العام بس');
    const start = monthStart(monthText);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.fiscalMonth.findUnique({ where: { month: start } });
      if (before?.status !== 'CLOSED') throw new NotFoundException('الشهر ده مش مقفول');
      const later = await tx.fiscalMonth.findFirst({ where: { status: 'CLOSED', month: { gt: start } } });
      if (later) throw new BadRequestException(`افتح شهر ${text(later.month)} الأول: الشهور بتتفتح من الأحدث`);
      const after = await tx.fiscalMonth.update({
        where: { month: start },
        data: { status: 'OPEN', reopenedById: actor.id, reopenedAt: new Date(), reopenReason: reason },
      });
      await this.audit.log({ userId: actor.id, action: 'REOPEN', entity: 'fiscal_month', entityId: monthText, before, after }, tx);
    });
    return { month: monthText, status: 'OPEN' };
  }

  /** The closed months whose figures moved after closing (the CEO's edits). */
  async changedMonths(): Promise<{ month: string; changes: string[] }[]> {
    const rows = await this.prisma.fiscalMonth.findMany({ where: { status: 'CLOSED' }, orderBy: { month: 'asc' } });
    const out = [];
    for (const r of rows) {
      const changes = await this.changes(r.month, r.snapshot as Record<string, Snapshot> | null);
      if (changes.length) out.push({ month: text(r.month), changes });
    }
    return out;
  }

  private async snapshot(currency: Currency, start: Date, end: Date): Promise<Snapshot> {
    const [income, tb] = await Promise.all([
      this.statements.incomeStatement(currency, start, end),
      this.gl.trialBalance(currency, undefined, end),
    ]);
    return {
      revenues: income.revenues.total,
      expenses: income.expenses.total,
      net: income.net,
      closing: Object.fromEntries(tb.lines.filter((l) => !l.group).map((l) => [l.key, l.closing])),
    };
  }

  private async changes(start: Date, snap: Record<string, Snapshot> | null): Promise<string[]> {
    if (!snap) return [];
    const out: string[] = [];
    for (const c of CURRENCIES) {
      const was = snap[c];
      if (!was) continue;
      const now = await this.snapshot(c, start, monthEnd(start));
      const keys = new Set([...Object.keys(was.closing), ...Object.keys(now.closing)]);
      for (const k of keys) {
        const a = new Prisma.Decimal(was.closing[k] ?? 0);
        const b = new Prisma.Decimal(now.closing[k] ?? 0);
        if (!a.equals(b)) out.push(`${c} ${k}: ${a.toFixed(2)} ← ${b.toFixed(2)}`);
      }
    }
    return out;
  }
}
