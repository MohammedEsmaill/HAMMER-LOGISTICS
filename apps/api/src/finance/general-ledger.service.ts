import { Injectable, NotFoundException } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EXPENSE_CATEGORIES } from './expenses.service';

export type GlType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface GlAccount {
  key: string;
  code: string;
  name: string;
  type: GlType;
  /** The group it sits under (its code), none for the five top groups. */
  parent: string | null;
  /** A group only adds up its children; no line is posted to it. */
  group: boolean;
}

/** Assets and expenses grow on the debit side; the others on the credit side. */
const DEBIT_NATURE: ReadonlySet<GlType> = new Set(['ASSET', 'EXPENSE']);

const g = (code: string, name: string, type: GlType, parent: string | null): GlAccount => ({
  key: `G:${code}`,
  code,
  name,
  type,
  parent,
  group: true,
});
const a = (key: string, code: string, name: string, type: GlType, parent: string): GlAccount => ({
  key,
  code,
  name,
  type,
  parent,
  group: false,
});

/** The fixed part of the chart: groups and the accounts the documents post to. */
const FIXED: GlAccount[] = [
  g('1', 'الأصول', 'ASSET', null),
  g('11', 'الخزن والبنوك', 'ASSET', '1'),
  a('CUSTODY', '12', 'العهد', 'ASSET', '1'),
  a('REIMBURSABLE', '13', 'مصروفات مدفوعة لحساب العملاء', 'ASSET', '1'),
  a('RECEIVABLE', '14', 'العملاء', 'ASSET', '1'),
  a('EMPLOYEE_ADVANCES', '15', 'سلف الموظفين', 'ASSET', '1'),
  a('WHT_RECEIVABLE', '16', 'ضرائب مخصومة من المنبع', 'ASSET', '1'),

  g('2', 'الالتزامات', 'LIABILITY', null),
  a('CLEARER_PAYABLE', '21', 'أتعاب مستخلصين مستحقة', 'LIABILITY', '2'),
  a('VAT_PAYABLE', '22', 'ضريبة القيمة المضافة المستحقة', 'LIABILITY', '2'),
  g('23', 'الحسابات الداخلية (الشركات الشقيقة والملاك)', 'LIABILITY', '2'),
  g('24', 'حسابات الملاك الشخصية', 'LIABILITY', '2'),

  g('3', 'حقوق الملكية', 'EQUITY', null),
  a('OPENING', '31', 'الأرصدة الافتتاحية', 'EQUITY', '3'),
  a('FUNDING', '32', 'تمويل الإدارة', 'EQUITY', '3'),

  g('4', 'الإيرادات', 'REVENUE', null),
  a('CLEARANCE_REVENUE', '41', 'إيراد التخليص', 'REVENUE', '4'),
  a('MARKUP', '42', 'فرق مصاريف الشحنات', 'REVENUE', '4'),

  g('5', 'المصروفات', 'EXPENSE', null),
  a('CLEARER_FEES', '51', 'أتعاب المستخلصين', 'EXPENSE', '5'),
  a('SALARIES', '52', 'المرتبات', 'EXPENSE', '5'),
  g('53', 'المصاريف العمومية', 'EXPENSE', '5'),
  a('BANK_CHARGES', '54', 'المصاريف البنكية', 'EXPENSE', '5'),
  a('ADJUSTMENT', '55', 'فروق وتسويات الخزن', 'EXPENSE', '5'),
];

const ZERO = new Prisma.Decimal(0);

interface Totals {
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
}

/**
 * The general ledger (phase 1): a chart of accounts built from the fixed accounts plus
 * every cash box, bank account, internal party and expense category, and the trial
 * balance and account ledger read from gl_lines_v. Each currency is its own set of
 * books: the dollar is never converted.
 */
@Injectable()
export class GeneralLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async chart(): Promise<GlAccount[]> {
    const [accounts, parties] = await Promise.all([
      this.prisma.moneyAccount.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.internalParty.findMany({ orderBy: { id: 'asc' } }),
    ]);
    const company = accounts.filter((m) => m.ownership === 'COMPANY');
    const personal = accounts.filter((m) => m.ownership === 'PERSONAL');
    return [
      ...FIXED,
      ...company.map((m, i) =>
        a(`MA:${m.id}`, `11${String(i + 1).padStart(2, '0')}`, m.name, 'ASSET', '11'),
      ),
      ...parties.map((p, i) =>
        a(`PARTY:${p.id}`, `23${String(i + 1).padStart(2, '0')}`, p.name, 'LIABILITY', '23'),
      ),
      ...personal.map((m, i) =>
        a(`MA:${m.id}`, `24${String(i + 1).padStart(2, '0')}`, m.name, 'LIABILITY', '24'),
      ),
      ...Object.entries(EXPENSE_CATEGORIES).map(([key, name], i) =>
        a(`EXP:${key}`, `53${String(i + 1).padStart(2, '0')}`, name, 'EXPENSE', '53'),
      ),
    ].sort((x, y) => x.code.localeCompare(y.code));
  }

  /**
   * The trial balance in one currency: each account's balance before the period, its
   * debits and credits within it, and its balance at the end, with the groups adding
   * up their accounts. The totals must match (debits = credits).
   */
  async trialBalance(currency: Currency, from?: Date, to?: Date) {
    const rows = await this.prisma.$queryRaw<
      { account_key: string; before_d: Prisma.Decimal; before_c: Prisma.Decimal; d: Prisma.Decimal; c: Prisma.Decimal }[]
    >`
      SELECT "account_key",
             COALESCE(SUM("debit") FILTER (WHERE ${from ?? null}::date IS NOT NULL AND "entry_date" < ${from ?? null}::date), 0) AS before_d,
             COALESCE(SUM("credit") FILTER (WHERE ${from ?? null}::date IS NOT NULL AND "entry_date" < ${from ?? null}::date), 0) AS before_c,
             COALESCE(SUM("debit") FILTER (WHERE (${from ?? null}::date IS NULL OR "entry_date" >= ${from ?? null}::date)), 0) AS d,
             COALESCE(SUM("credit") FILTER (WHERE (${from ?? null}::date IS NULL OR "entry_date" >= ${from ?? null}::date)), 0) AS c
        FROM "gl_lines_v"
       WHERE "currency" = ${currency}
         AND (${to ?? null}::date IS NULL OR "entry_date" <= ${to ?? null}::date)
       GROUP BY "account_key"`;
    const chart = await this.chart();
    const byKey = new Map(rows.map((r) => [r.account_key, r]));
    const totals = new Map<string, { opening: Totals; period: Totals }>();
    const add = (code: string, opening: Totals, period: Totals) => {
      const t = totals.get(code) ?? { opening: { debit: ZERO, credit: ZERO }, period: { debit: ZERO, credit: ZERO } };
      t.opening = { debit: t.opening.debit.plus(opening.debit), credit: t.opening.credit.plus(opening.credit) };
      t.period = { debit: t.period.debit.plus(period.debit), credit: t.period.credit.plus(period.credit) };
      totals.set(code, t);
    };
    const parentOf = new Map(chart.map((x) => [x.code, x.parent]));
    for (const acc of chart.filter((x) => !x.group)) {
      const r = byKey.get(acc.key);
      if (!r) continue;
      const opening = { debit: new Prisma.Decimal(r.before_d), credit: new Prisma.Decimal(r.before_c) };
      const period = { debit: new Prisma.Decimal(r.d), credit: new Prisma.Decimal(r.c) };
      // the account and every group above it
      for (let code: string | null = acc.code; code; code = parentOf.get(code) ?? null) add(code, opening, period);
    }
    // an account key no chart entry knows (a deleted party): shown on its own
    const unknown = rows.filter((r) => !chart.some((x) => x.key === r.account_key));

    const lines = chart
      .filter((x) => totals.has(x.code))
      .map((x) => {
        const t = totals.get(x.code)!;
        const closing = t.opening.debit.plus(t.period.debit).minus(t.opening.credit).minus(t.period.credit);
        const debitSide = DEBIT_NATURE.has(x.type);
        return {
          ...x,
          level: x.code.length - 1,
          opening: (debitSide ? t.opening.debit.minus(t.opening.credit) : t.opening.credit.minus(t.opening.debit)).toFixed(2),
          debit: t.period.debit.toFixed(2),
          credit: t.period.credit.toFixed(2),
          // in the account's own nature: an asset's debit balance, a liability's credit
          closing: (debitSide ? closing : closing.negated()).toFixed(2),
          closingDebit: (closing.isPositive() ? closing : ZERO).toFixed(2),
          closingCredit: (closing.isNegative() ? closing.negated() : ZERO).toFixed(2),
        };
      });
    const top = lines.filter((x) => x.parent === null);
    const sum = (f: (x: (typeof lines)[number]) => string) => top.reduce((s, x) => s.plus(f(x)), ZERO);
    return {
      currency,
      from: from ?? null,
      to: to ?? null,
      lines,
      unknown: unknown.map((r) => r.account_key),
      totals: {
        debit: sum((x) => x.debit).toFixed(2),
        credit: sum((x) => x.credit).toFixed(2),
        closingDebit: sum((x) => x.closingDebit).toFixed(2),
        closingCredit: sum((x) => x.closingCredit).toFixed(2),
      },
    };
  }

  /** One account's lines in one currency, oldest first, with the running balance. */
  async ledger(key: string, currency: Currency, from?: Date, to?: Date) {
    const chart = await this.chart();
    const account = chart.find((x) => x.key === key && !x.group);
    if (!account) throw new NotFoundException('الحساب غير موجود في الدليل');
    const debitSide = DEBIT_NATURE.has(account.type);
    const [[before], lines] = await Promise.all([
      this.prisma.$queryRaw<{ balance: Prisma.Decimal | null }[]>`
        SELECT SUM("debit" - "credit") AS balance FROM "gl_lines_v"
         WHERE "account_key" = ${key} AND "currency" = ${currency}
           AND ${from ?? null}::date IS NOT NULL AND "entry_date" < ${from ?? null}::date`,
      this.prisma.$queryRaw<
        {
          entry_date: Date;
          source_type: string;
          source_id: number;
          ref: string;
          description: string;
          debit: Prisma.Decimal;
          credit: Prisma.Decimal;
          client: string | null;
          clearer: string | null;
          employee: string | null;
          file_no: string | null;
        }[]
      >`
        SELECT g."entry_date", g."source_type", g."source_id", g."ref", g."description", g."debit", g."credit",
               cl."name" AS client, c."full_name" AS clearer, e."full_name" AS employee, s."file_no"
          FROM "gl_lines_v" g
          LEFT JOIN "clients" cl ON cl."id" = g."client_id"
          LEFT JOIN "clearers" c ON c."id" = g."clearer_id"
          LEFT JOIN "employees" e ON e."id" = g."employee_id"
          LEFT JOIN "shipments" s ON s."id" = g."shipment_id"
         WHERE g."account_key" = ${key} AND g."currency" = ${currency}
           AND (${from ?? null}::date IS NULL OR g."entry_date" >= ${from ?? null}::date)
           AND (${to ?? null}::date IS NULL OR g."entry_date" <= ${to ?? null}::date)
         ORDER BY g."entry_date", g."source_type", g."source_id"`,
    ]);
    const sign = (d: Prisma.Decimal) => (debitSide ? d : d.negated());
    let balance = sign(new Prisma.Decimal(before?.balance ?? 0));
    const opening = balance;
    return {
      account,
      currency,
      opening: opening.toFixed(2),
      lines: lines.map((l) => {
        balance = balance.plus(sign(new Prisma.Decimal(l.debit).minus(l.credit)));
        return {
          date: l.entry_date,
          sourceType: l.source_type,
          sourceId: l.source_id,
          ref: l.ref,
          description: l.description,
          party: l.client ?? l.clearer ?? l.employee ?? null,
          fileNo: l.file_no,
          debit: new Prisma.Decimal(l.debit).toFixed(2),
          credit: new Prisma.Decimal(l.credit).toFixed(2),
          balance: balance.toFixed(2),
        };
      }),
      closing: balance.toFixed(2),
    };
  }

  /**
   * The books hold together: in each currency debits equal credits, and every cash box
   * and bank account stands in the ledger at its own balance. Lists what does not.
   */
  async check(): Promise<string[]> {
    const problems: string[] = [];
    const sides = await this.prisma.$queryRaw<{ currency: string; d: Prisma.Decimal; c: Prisma.Decimal }[]>`
      SELECT "currency", SUM("debit") AS d, SUM("credit") AS c FROM "gl_lines_v" GROUP BY "currency"`;
    for (const s of sides) {
      if (!new Prisma.Decimal(s.d).equals(s.c)) problems.push(`${s.currency}: المدين ${s.d} والدائن ${s.c}`);
    }
    const cash = await this.prisma.$queryRaw<{ name: string; balance: Prisma.Decimal; gl: Prisma.Decimal }[]>`
      SELECT a."name", a."balance", COALESCE(SUM(g."debit" - g."credit"), 0) AS gl
        FROM "money_accounts" a
        LEFT JOIN "gl_lines_v" g ON g."account_key" = 'MA:' || a."id"
       GROUP BY a."id"`;
    for (const m of cash) {
      if (!new Prisma.Decimal(m.balance).equals(m.gl)) problems.push(`${m.name}: الرصيد ${m.balance} وفي الدفاتر ${m.gl}`);
    }
    return problems;
  }
}
