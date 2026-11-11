import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { Page } from '../common/dto/list-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { canSeeRestricted } from './approvals/approval.service';
import { JournalQueryDto, JournalType } from './dto/journal.dto';

export interface JournalRow {
  type: JournalType;
  id: number;
  ref: string;
  operationDate: Date;
  currency: 'EGP' | 'USD';
  amount: string;
  flow: 'IN' | 'OUT' | 'MOVE';
  fromAccount: { id: number; name: string } | null;
  toAccount: { id: number; name: string } | null;
  counterparty: string | null;
  fileNo: string | null;
  description: string;
  approvalStatus: string;
  createdBy: { id: number; email: string };
  createdAt: Date;
}

/** Money in and out of the filtered operations, per currency (transfers move, they add nothing). */
export interface JournalTotals {
  currency: 'EGP' | 'USD';
  in: string;
  out: string;
  count: number;
}

interface RawRow {
  type: JournalType;
  id: number;
  ref: string;
  operation_date: Date;
  currency: 'EGP' | 'USD';
  amount: Prisma.Decimal;
  flow: 'IN' | 'OUT' | 'MOVE';
  from_account_id: number | null;
  from_name: string | null;
  to_account_id: number | null;
  to_name: string | null;
  counterparty: string | null;
  file_no: string | null;
  description: string;
  approval_status: string;
  created_by: number;
  created_email: string;
  created_at: Date;
}

/** At most this many rows go into one report or export. */
export const JOURNAL_EXPORT_LIMIT = 20_000;

/**
 * The journal: every money operation of the office in one list (the journal_v view),
 * filtered and paged in the database. Salaries and advances only reach who may see them.
 */
@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    actor: AuthUser,
    q: JournalQueryDto,
  ): Promise<Page<JournalRow> & { totals: JournalTotals[] }> {
    const where = this.where(actor, q);
    const [rows, count, totals] = await Promise.all([
      this.rows(where, q.pageSize, (q.page - 1) * q.pageSize),
      this.prisma.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM "journal_v" j ${where}`,
      this.totals(where),
    ]);
    return {
      items: rows,
      total: Number(count[0].n),
      page: q.page,
      pageSize: q.pageSize,
      totals,
    };
  }

  /** Every matching row, oldest first, for a report (capped). */
  async all(actor: AuthUser, q: JournalQueryDto) {
    const where = this.where(actor, q);
    const [rows, totals] = await Promise.all([
      this.rows(where, JOURNAL_EXPORT_LIMIT, 0, true),
      this.totals(where),
    ]);
    return { rows, totals, truncated: rows.length === JOURNAL_EXPORT_LIMIT };
  }

  private where(actor: AuthUser, q: JournalQueryDto): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (!canSeeRestricted(actor)) parts.push(Prisma.sql`NOT j."restricted"`);
    if (q.from) parts.push(Prisma.sql`j."operation_date" >= ${q.from}::date`);
    if (q.to) parts.push(Prisma.sql`j."operation_date" <= ${q.to}::date`);
    if (q.types?.length)
      parts.push(Prisma.sql`j."type" IN (${Prisma.join(q.types)})`);
    if (q.accountId) {
      parts.push(
        Prisma.sql`(j."from_account_id" = ${q.accountId} OR j."to_account_id" = ${q.accountId})`,
      );
    }
    if (q.currency) parts.push(Prisma.sql`j."currency" = ${q.currency}`);
    if (q.status) parts.push(Prisma.sql`j."approval_status" = ${q.status}`);
    if (q.flow) parts.push(Prisma.sql`j."flow" = ${q.flow}`);
    if (q.createdBy) parts.push(Prisma.sql`j."created_by" = ${q.createdBy}`);
    if (q.search) {
      const like = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const amount = Number(q.search.replace(/,/g, ''));
      parts.push(
        Number.isFinite(amount) && /\d/.test(q.search)
          ? Prisma.sql`(j."ref" ILIKE ${like} OR j."description" ILIKE ${like} OR j."counterparty" ILIKE ${like} OR j."file_no" ILIKE ${like} OR j."amount" = ${amount})`
          : Prisma.sql`(j."ref" ILIKE ${like} OR j."description" ILIKE ${like} OR j."counterparty" ILIKE ${like} OR j."file_no" ILIKE ${like})`,
      );
    }
    return parts.length
      ? Prisma.sql`WHERE ${Prisma.join(parts, ' AND ')}`
      : Prisma.empty;
  }

  private async rows(
    where: Prisma.Sql,
    take: number,
    skip: number,
    oldestFirst = false,
  ): Promise<JournalRow[]> {
    const order = oldestFirst
      ? Prisma.sql`j."operation_date" ASC, j."created_at" ASC`
      : Prisma.sql`j."operation_date" DESC, j."created_at" DESC`;
    const raw = await this.prisma.$queryRaw<RawRow[]>`
      SELECT j.*, fa."name" AS from_name, ta."name" AS to_name, u."email" AS created_email
        FROM "journal_v" j
        LEFT JOIN "money_accounts" fa ON fa."id" = j."from_account_id"
        LEFT JOIN "money_accounts" ta ON ta."id" = j."to_account_id"
        JOIN "users" u ON u."id" = j."created_by"
        ${where}
       ORDER BY ${order}, j."type", j."id"
       LIMIT ${take} OFFSET ${skip}`;
    return raw.map((r) => ({
      type: r.type,
      id: r.id,
      ref: r.ref,
      operationDate: r.operation_date,
      currency: r.currency,
      amount: new Prisma.Decimal(r.amount).toFixed(2),
      flow: r.flow,
      fromAccount: r.from_account_id
        ? { id: r.from_account_id, name: r.from_name ?? '' }
        : null,
      toAccount: r.to_account_id
        ? { id: r.to_account_id, name: r.to_name ?? '' }
        : null,
      counterparty: r.counterparty,
      fileNo: r.file_no,
      description: r.description,
      approvalStatus: r.approval_status,
      createdBy: { id: r.created_by, email: r.created_email },
      createdAt: r.created_at,
    }));
  }

  private async totals(where: Prisma.Sql): Promise<JournalTotals[]> {
    const raw = await this.prisma.$queryRaw<
      {
        currency: 'EGP' | 'USD';
        in: Prisma.Decimal | null;
        out: Prisma.Decimal | null;
        n: bigint;
      }[]
    >`
      SELECT j."currency",
             sum(j."amount") FILTER (WHERE j."flow" = 'IN') AS "in",
             sum(j."amount") FILTER (WHERE j."flow" = 'OUT') AS "out",
             count(*) AS n
        FROM "journal_v" j ${where}
       GROUP BY j."currency" ORDER BY j."currency"`;
    return raw.map((t) => ({
      currency: t.currency,
      in: new Prisma.Decimal(t.in ?? 0).toFixed(2),
      out: new Prisma.Decimal(t.out ?? 0).toFixed(2),
      count: Number(t.n),
    }));
  }
}
