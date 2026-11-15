import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface IntegrityProblem {
  kind: 'BALANCE' | 'LAST_LINE' | 'CHAIN' | 'CLOSED_DAY';
  severity: 'danger' | 'warning';
  title: string;
  detail: string;
  link: string;
}

export interface IntegrityReport {
  checkedAt: string;
  accounts: number;
  movements: number;
  problems: IntegrityProblem[];
}

const KEY = 'integrity.last';
const EVERY_MS = 6 * 3600_000;
const money = (v: Prisma.Decimal | string | number) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v));

/**
 * The books check, every 6 hours: each treasury and bank account's balance against its
 * opening balance and its ledger lines, each line's running balance against the one
 * before it, and each closed day's figures against the ledger as it is now.
 */
@Injectable()
export class IntegrityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IntegrityService.name);
  private timer?: NodeJS.Timeout;
  private running: Promise<IntegrityReport> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    setTimeout(() => void this.run().catch(() => undefined), 120_000).unref();
    this.timer = setInterval(
      () => void this.run().catch(() => undefined),
      EVERY_MS,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async last(): Promise<IntegrityReport | null> {
    const row = await this.prisma.setting.findUnique({ where: { key: KEY } });
    return (row?.value as unknown as IntegrityReport) ?? null;
  }

  run(): Promise<IntegrityReport> {
    this.running ??= this.check().finally(() => (this.running = null));
    return this.running;
  }

  private async check(): Promise<IntegrityReport> {
    const problems: IntegrityProblem[] = [];
    const db = this.prisma;

    // 1. the balance against opening + lines
    const balances = await db.$queryRaw<
      {
        id: number;
        name: string;
        currency: string;
        balance: Prisma.Decimal;
        computed: Prisma.Decimal;
        lines: bigint;
      }[]
    >`
      SELECT a."id", a."name", a."currency"::text AS currency, a."balance",
             a."opening_balance" + coalesce(sum(CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE -m."amount" END), 0) AS computed,
             count(m."id") AS lines
        FROM "money_accounts" a LEFT JOIN "money_movements" m ON m."account_id" = a."id"
       GROUP BY a."id" ORDER BY a."id"`;
    for (const a of balances) {
      if (!new Prisma.Decimal(a.balance).equals(a.computed)) {
        problems.push({
          kind: 'BALANCE',
          severity: 'danger',
          title: `رصيد ${a.name} مش مطابق لحركاته`,
          detail: `الرصيد المسجل ${money(a.balance)} ${a.currency}، ومجموع الحركات بيقول ${money(a.computed)} (الفرق ${money(new Prisma.Decimal(a.balance).minus(a.computed))})`,
          link: `/treasury/${a.id}`,
        });
      }
    }

    // 2. the last line's running balance against the account's balance
    const lastLines = await db.$queryRaw<
      {
        id: number;
        name: string;
        balance: Prisma.Decimal;
        after: Prisma.Decimal;
      }[]
    >`
      SELECT a."id", a."name", a."balance", l."balance_after" AS after
        FROM "money_accounts" a
        JOIN LATERAL (SELECT "balance_after" FROM "money_movements" WHERE "account_id" = a."id" ORDER BY "id" DESC LIMIT 1) l ON true
       WHERE a."balance" <> l."balance_after"`;
    for (const a of lastLines) {
      problems.push({
        kind: 'LAST_LINE',
        severity: 'danger',
        title: `رصيد ${a.name} مختلف عن آخر حركة عليه`,
        detail: `الرصيد ${money(a.balance)}، وآخر حركة بتقول ${money(a.after)}`,
        link: `/treasury/${a.id}`,
      });
    }

    // 3. every line's running balance against the line before it (first break per account)
    const breaks = await db.$queryRaw<
      {
        account_id: number;
        name: string;
        id: bigint;
        date: Date;
        expected: Prisma.Decimal;
        after: Prisma.Decimal;
      }[]
    >`
      SELECT DISTINCT ON (x."account_id") x."account_id", a."name", x."id", x."movement_date" AS date, x.expected, x."balance_after" AS after
        FROM (
          SELECT m.*, coalesce(lag(m."balance_after") OVER w, acc."opening_balance")
                 + CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE -m."amount" END AS expected
            FROM "money_movements" m JOIN "money_accounts" acc ON acc."id" = m."account_id"
          WINDOW w AS (PARTITION BY m."account_id" ORDER BY m."id")
        ) x JOIN "money_accounts" a ON a."id" = x."account_id"
       WHERE x.expected <> x."balance_after"
       ORDER BY x."account_id", x."id"`;
    for (const b of breaks) {
      problems.push({
        kind: 'CHAIN',
        severity: 'danger',
        title: `تسلسل حركات ${b.name} فيه كسر`,
        detail: `الحركة رقم ${b.id} (${b.date.toISOString().slice(0, 10)}): الرصيد بعدها ${money(b.after)} والمفروض ${money(b.expected)}`,
        link: `/treasury/${b.account_id}`,
      });
    }

    // 4. closed days against the ledger now
    const days = await db.$queryRaw<
      {
        date: Date;
        name: string;
        closing: Prisma.Decimal;
        now: Prisma.Decimal;
      }[]
    >`
      SELECT d."date", a."name", da."closing",
             a."opening_balance" + coalesce((SELECT sum(CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE -m."amount" END)
                                               FROM "money_movements" m
                                              WHERE m."account_id" = a."id" AND m."movement_date" <= d."date"), 0) AS now
        FROM "journal_day_accounts" da
        JOIN "journal_days" d ON d."date" = da."date" AND d."status" = 'CLOSED'
        JOIN "money_accounts" a ON a."id" = da."account_id"
       ORDER BY d."date" DESC`;
    for (const d of days
      .filter((x) => !new Prisma.Decimal(x.closing).equals(x.now))
      .slice(0, 20)) {
      const day = d.date.toISOString().slice(0, 10);
      problems.push({
        kind: 'CLOSED_DAY',
        severity: 'warning',
        title: `يومية ${day} اتغيرت بعد قفلها (${d.name})`,
        detail: `الرصيد وقت القفل ${money(d.closing)}، ودلوقتي ${money(d.now)}`,
        link: `/journal?tab=archive&day=${day}`,
      });
    }

    const report: IntegrityReport = {
      checkedAt: new Date().toISOString(),
      accounts: balances.length,
      movements: balances.reduce((n, a) => n + Number(a.lines), 0),
      problems,
    };
    const value = report as unknown as Prisma.InputJsonValue;
    await db.setting.upsert({
      where: { key: KEY },
      update: { value },
      create: { key: KEY, value },
    });
    if (problems.length)
      this.logger.warn(`Books check: ${problems.length} problem(s)`);
    return report;
  }
}
