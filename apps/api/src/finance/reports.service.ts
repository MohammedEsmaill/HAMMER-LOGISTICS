import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { canSeeRestricted } from './approvals/approval.service';
import { JournalQueryDto } from './dto/journal.dto';
import { JOURNAL_EXPORT_LIMIT, JournalService } from './journal.service';

export const REPORT_KINDS = ['journal', 'accounts', 'expenses'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

const fixed = (v: Prisma.Decimal | string | number | null) =>
  new Prisma.Decimal(v ?? 0).toFixed(2);

/**
 * The finance reports. Each one is a summary first, then the detail it adds up, for
 * a period (a day, a month, a year or any range) and the journal filters.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
  ) {}

  async report(actor: AuthUser, kind: ReportKind, q: JournalQueryDto) {
    if (!q.from || !q.to) {
      throw new BadRequestException('اختار فترة التقرير: من تاريخ لتاريخ');
    }
    if (q.from > q.to) {
      throw new BadRequestException(
        'تاريخ البداية لازم يكون قبل تاريخ النهاية',
      );
    }
    const head = { kind, from: q.from, to: q.to, generatedAt: new Date() };
    if (kind === 'accounts')
      return { ...head, ...(await this.accounts(actor, q)) };
    if (kind === 'expenses') {
      const expenses = { ...q, types: ['EXPENSE' as const] } as JournalQueryDto;
      return { ...head, ...(await this.expenses(actor, expenses)) };
    }
    return { ...head, ...(await this.journalReport(actor, q)) };
  }

  /** Totals per currency and per operation type, then every operation. */
  private async journalReport(actor: AuthUser, q: JournalQueryDto) {
    const { rows, totals, truncated } = await this.journal.all(actor, q);
    const byType = new Map<
      string,
      {
        type: string;
        currency: string;
        in: Prisma.Decimal;
        out: Prisma.Decimal;
        moved: Prisma.Decimal;
        count: number;
      }
    >();
    for (const r of rows) {
      const key = `${r.type}|${r.currency}`;
      const t = byType.get(key) ?? {
        type: r.type,
        currency: r.currency,
        in: new Prisma.Decimal(0),
        out: new Prisma.Decimal(0),
        moved: new Prisma.Decimal(0),
        count: 0,
      };
      const amount = new Prisma.Decimal(r.amount);
      if (r.flow === 'IN') t.in = t.in.plus(amount);
      else if (r.flow === 'OUT') t.out = t.out.plus(amount);
      else t.moved = t.moved.plus(amount);
      t.count += 1;
      byType.set(key, t);
    }
    return {
      summary: {
        totals,
        byType: [...byType.values()].map((t) => ({
          ...t,
          in: fixed(t.in),
          out: fixed(t.out),
          moved: fixed(t.moved),
        })),
      },
      rows,
      truncated,
    };
  }

  /** Expense totals per expense type, then every expense. */
  private async expenses(actor: AuthUser, q: JournalQueryDto) {
    const { rows, totals, truncated } = await this.journal.all(actor, q);
    const ids = rows.map((r) => r.id);
    const byItem = ids.length
      ? await this.prisma.$queryRaw<
          { name: string; currency: string; total: Prisma.Decimal; n: bigint }[]
        >`
          SELECT et."name", x."currency"::text AS currency, sum(x."amount") AS total, count(*) AS n
            FROM "general_expenses" x JOIN "expense_types" et ON et."id" = x."expense_type_id"
           WHERE x."id" IN (${Prisma.join(ids)})
           GROUP BY et."name", x."currency" ORDER BY x."currency", total DESC`
      : [];
    return {
      summary: {
        totals,
        byItem: byItem.map((b) => ({
          name: b.name,
          currency: b.currency,
          total: fixed(b.total),
          count: Number(b.n),
        })),
      },
      rows,
      truncated,
    };
  }

  /** Per account: balance at the start, money in, out, balance at the end; then its lines. */
  private async accounts(actor: AuthUser, q: JournalQueryDto) {
    const salaryData = canSeeRestricted(actor);
    const accounts = await this.prisma.moneyAccount.findMany({
      where: {
        ...(q.accountId ? { id: q.accountId } : {}),
        ...(q.currency ? { currency: q.currency } : {}),
      },
      orderBy: [{ currency: 'asc' }, { type: 'asc' }, { id: 'asc' }],
    });
    const result = [];
    let lineCount = 0;
    for (const a of accounts) {
      const [before] = await this.prisma.$queryRaw<
        { net: Prisma.Decimal | null }[]
      >`
        SELECT sum(CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE -m."amount" END) AS net
          FROM "money_movements" m
         WHERE m."account_id" = ${a.id} AND m."movement_date" < ${q.from}::date`;
      const opening = a.openingBalance.plus(before.net ?? 0);
      const lines = await this.prisma.$queryRaw<
        {
          id: bigint;
          movement_date: Date;
          direction: 'IN' | 'OUT';
          amount: Prisma.Decimal;
          source: string;
          reversal: boolean;
          ref: string | null;
          description: string | null;
          counterparty: string | null;
          file_no: string | null;
          restricted: boolean | null;
          running: Prisma.Decimal;
        }[]
      >`
        SELECT m."id", m."movement_date", m."direction", m."amount", m."source"::text AS source,
               (m."reversal_of_id" IS NOT NULL) AS reversal,
               j."ref", j."description", j."counterparty", j."file_no", j."restricted",
               sum(CASE WHEN m."direction" = 'IN' THEN m."amount" ELSE -m."amount" END)
                 OVER (ORDER BY m."movement_date", m."id") AS running
          FROM "money_movements" m
          LEFT JOIN "journal_v" j ON j."type" = m."source"::text AND j."id" = coalesce(
                 m."transfer_id", m."other_movement_id", m."salary_id", m."advance_id",
                 m."expense_id", m."custody_id", m."fee_payment_id", m."collection_id")
         WHERE m."account_id" = ${a.id}
           AND m."movement_date" BETWEEN ${q.from}::date AND ${q.to}::date
         ORDER BY m."movement_date", m."id"
         LIMIT ${JOURNAL_EXPORT_LIMIT}`;
      lineCount += lines.length;
      const sum = (d: 'IN' | 'OUT') =>
        lines
          .filter((l) => l.direction === d)
          .reduce((s, l) => s.plus(l.amount), new Prisma.Decimal(0));
      const totalIn = sum('IN');
      const totalOut = sum('OUT');
      result.push({
        account: {
          id: a.id,
          name: a.name,
          type: a.type,
          currency: a.currency,
          bankName: a.bankName,
          accountNumber: a.accountNumber,
        },
        opening: fixed(opening),
        in: fixed(totalIn),
        out: fixed(totalOut),
        closing: fixed(opening.plus(totalIn).minus(totalOut)),
        lines: lines.map((l) => {
          const hidden = l.restricted && !salaryData;
          return {
            id: l.id.toString(),
            date: l.movement_date,
            direction: l.direction,
            amount: fixed(l.amount),
            source: l.source,
            reversal: l.reversal,
            ref: l.ref,
            description: hidden ? 'مرتبات وسلف' : l.description,
            counterparty: hidden ? null : l.counterparty,
            fileNo: l.file_no,
            balance: fixed(opening.plus(l.running)),
          };
        }),
      });
    }
    return {
      summary: {
        accounts: result.map((a) => ({
          account: a.account,
          opening: a.opening,
          in: a.in,
          out: a.out,
          closing: a.closing,
        })),
      },
      accounts: result,
      truncated: lineCount >= JOURNAL_EXPORT_LIMIT,
    };
  }
}
