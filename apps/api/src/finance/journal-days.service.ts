import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { canSeeRestricted } from './approvals/approval.service';
import { JournalDaysQueryDto } from './dto/journal.dto';
import { todayCairo } from './money';

const fixed = (v: Prisma.Decimal | number | null) =>
  new Prisma.Decimal(v ?? 0).toFixed(2);
const dayOf = (text: string) => new Date(`${text}T00:00:00.000Z`);

/**
 * اليوميات: every business day (Cairo) closes by itself once midnight passes. Closing
 * keeps each account's figures for the day. When the API was off at midnight, the
 * days missed close as soon as it starts. The CEO may reopen a past day until the end
 * of the current day; then it closes again.
 */
@Injectable()
export class JournalDaysService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JournalDaysService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return; // tests close days themselves
    void this.closeDue();
    this.timer = setInterval(() => void this.closeDue(), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Closes every past day still open: the days not closed yet, and reopened days whose time is up. */
  async closeDue(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const today = todayCairo();
      // from the first money movement, every day before today
      const due = await this.prisma.$queryRaw<{ date: Date }[]>`
        WITH bounds AS (SELECT min("movement_date") AS first FROM "money_movements")
        SELECT d::date AS date
          FROM bounds, generate_series(bounds.first, ${today}::date - 1, interval '1 day') AS d
         WHERE bounds.first IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM "journal_days" j WHERE j."date" = d::date)
        UNION
        SELECT "date" FROM "journal_days"
         WHERE "status" = 'OPEN' AND "reopened_until" < ${today}::date
        ORDER BY 1`;
      for (const { date } of due) await this.close(date);
      if (due.length) this.logger.log(`Closed ${due.length} day(s)`);
      return due.length;
    } catch (error) {
      this.logger.error(`Closing days failed: ${String(error)}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  /** Closes one day and keeps every account's opening, in, out and closing for it. */
  private async close(date: Date) {
    await this.prisma.$transaction(async (tx) => {
      const figures = await tx.$queryRaw<
        {
          id: number;
          opening: Prisma.Decimal;
          in: Prisma.Decimal;
          out: Prisma.Decimal;
        }[]
      >`
        SELECT a."id",
               a."opening_balance" + coalesce(sum(CASE WHEN m."movement_date" < ${date}::date
                   THEN CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE -m."amount" END END), 0) AS opening,
               coalesce(sum(m."amount") FILTER (WHERE m."movement_date" = ${date}::date AND m."direction" = 'IN'), 0) AS "in",
               coalesce(sum(m."amount") FILTER (WHERE m."movement_date" = ${date}::date AND m."direction" = 'OUT'), 0) AS "out"
          FROM "money_accounts" a
          LEFT JOIN "money_movements" m ON m."account_id" = a."id" AND m."movement_date" <= ${date}::date
         GROUP BY a."id"`;
      await tx.journalDay.upsert({
        where: { date },
        update: { status: 'CLOSED', closedAt: new Date(), reopenedUntil: null },
        create: { date, status: 'CLOSED', closedAt: new Date() },
      });
      await tx.journalDayAccount.deleteMany({ where: { date } });
      if (figures.length) {
        await tx.journalDayAccount.createMany({
          data: figures.map((f) => ({
            date,
            accountId: f.id,
            opening: f.opening,
            in: f.in,
            out: f.out,
            closing: new Prisma.Decimal(f.opening).plus(f.in).minus(f.out),
          })),
        });
      }
    });
  }

  /** The days list (newest first): operations count and totals per currency, filtered like the journal. */
  async list(actor: AuthUser, q: JournalDaysQueryDto) {
    const parts: Prisma.Sql[] = [];
    if (!canSeeRestricted(actor)) parts.push(Prisma.sql`NOT j."restricted"`);
    if (q.from) parts.push(Prisma.sql`j."operation_date" >= ${q.from}::date`);
    if (q.to) parts.push(Prisma.sql`j."operation_date" <= ${q.to}::date`);
    if (q.search) {
      const like = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      // a file number or a party (employee, clearer, agent, client)
      parts.push(
        Prisma.sql`(j."file_no" ILIKE ${like} OR j."counterparty" ILIKE ${like} OR j."ref" ILIKE ${like})`,
      );
    }
    const where = parts.length
      ? Prisma.sql`WHERE ${Prisma.join(parts, ' AND ')}`
      : Prisma.empty;
    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<
        {
          date: Date;
          n: bigint;
          egp_in: Prisma.Decimal | null;
          egp_out: Prisma.Decimal | null;
          usd_in: Prisma.Decimal | null;
          usd_out: Prisma.Decimal | null;
          status: string | null;
          closed_at: Date | null;
          reopened_until: Date | null;
        }[]
      >`
        SELECT j."operation_date" AS date, count(*) AS n,
               sum(j."amount") FILTER (WHERE j."currency" = 'EGP' AND j."flow" = 'IN') AS egp_in,
               sum(j."amount") FILTER (WHERE j."currency" = 'EGP' AND j."flow" = 'OUT') AS egp_out,
               sum(j."amount") FILTER (WHERE j."currency" = 'USD' AND j."flow" = 'IN') AS usd_in,
               sum(j."amount") FILTER (WHERE j."currency" = 'USD' AND j."flow" = 'OUT') AS usd_out,
               d."status"::text AS status, d."closed_at", d."reopened_until"
          FROM "journal_v" j
          LEFT JOIN "journal_days" d ON d."date" = j."operation_date"
          ${where}
         GROUP BY j."operation_date", d."status", d."closed_at", d."reopened_until"
         ORDER BY j."operation_date" DESC
         LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(DISTINCT j."operation_date") AS n FROM "journal_v" j ${where}`,
    ]);
    const today = todayCairo();
    return {
      items: rows.map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        status: this.status(r.date, today, r.status, r.reopened_until),
        closedAt: r.closed_at,
        reopenedUntil: r.reopened_until?.toISOString().slice(0, 10) ?? null,
        operations: Number(r.n),
        totals: {
          EGP: { in: fixed(r.egp_in), out: fixed(r.egp_out) },
          USD: { in: fixed(r.usd_in), out: fixed(r.usd_out) },
        },
      })),
      total: Number(count[0].n),
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /** One day: its state and, once closed, each account's figures at closing. */
  async get(text: string) {
    const date = dayOf(text);
    const today = todayCairo();
    if (date > today) throw new NotFoundException('اليوم ده لسه ماجاش');
    const row = await this.prisma.journalDay.findUnique({
      where: { date },
      include: {
        reopenedBy: { select: { id: true, email: true } },
        accounts: {
          include: {
            account: {
              select: { id: true, name: true, type: true, currency: true },
            },
          },
          orderBy: { accountId: 'asc' },
        },
      },
    });
    return {
      date: text,
      status: this.status(
        date,
        today,
        row?.status ?? null,
        row?.reopenedUntil ?? null,
      ),
      closedAt: row?.closedAt ?? null,
      reopenedUntil: row?.reopenedUntil?.toISOString().slice(0, 10) ?? null,
      reopenedBy: row?.reopenedBy ?? null,
      reopenCount: row?.reopenCount ?? 0,
      accounts: (row?.accounts ?? []).map((a) => ({
        account: a.account,
        opening: fixed(a.opening),
        in: fixed(a.in),
        out: fixed(a.out),
        closing: fixed(a.closing),
      })),
    };
  }

  /** The CEO reopens a past day; it closes again when the current day ends. */
  async reopen(actor: AuthUser, text: string) {
    const date = dayOf(text);
    const today = todayCairo();
    if (date >= today)
      throw new BadRequestException('يومية النهاردة مفتوحة أصلاً');
    await this.closeDue(); // a day not closed yet gets its figures first
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.journalDay.findUnique({ where: { date } });
      if (!before) throw new NotFoundException('مفيش يومية بالتاريخ ده');
      const after = await tx.journalDay.update({
        where: { date },
        data: {
          status: 'OPEN',
          reopenedUntil: today,
          reopenedById: actor.id,
          reopenCount: { increment: 1 },
        },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'REOPEN',
          entity: 'journal_day',
          entityId: text,
          before,
          after,
        },
        tx,
      );
    });
    return this.get(text);
  }

  private status(
    date: Date,
    today: Date,
    status: string | null,
    until: Date | null,
  ): 'OPEN' | 'CLOSED' | 'REOPENED' {
    if (date >= today) return 'OPEN';
    return status === 'OPEN' && until && until >= today ? 'REOPENED' : 'CLOSED';
  }
}
