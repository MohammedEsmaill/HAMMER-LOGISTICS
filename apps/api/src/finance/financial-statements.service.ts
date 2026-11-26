import { Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeneralLedgerService } from './general-ledger.service';

const ZERO = new Prisma.Decimal(0);

type TrialLine = Awaited<ReturnType<GeneralLedgerService['trialBalance']>>['lines'][number];

export interface StatementLine {
  key: string;
  code: string;
  name: string;
  level: number;
  group: boolean;
  amount: string;
}

/** The lines under a top group (1 … 5), the top group itself left out, each with its amount. */
const section = (lines: TrialLine[], top: string, amount: (l: TrialLine) => Prisma.Decimal): StatementLine[] =>
  lines
    .filter((l) => l.code !== top && l.code.startsWith(top))
    .map((l) => ({ key: l.key, code: l.code, name: l.name, level: l.level - 1, group: l.group, amount: amount(l).toFixed(2) }))
    .filter((l) => !new Prisma.Decimal(l.amount).isZero());

const topTotal = (lines: TrialLine[], top: string, amount: (l: TrialLine) => Prisma.Decimal) => {
  const t = lines.find((l) => l.code === top);
  return t ? amount(t) : ZERO;
};

/**
 * The financial statements (phase 2), each currency on its own, read from the trial
 * balance: the income statement for a period, the balance sheet at a date, and the
 * VAT report on the invoices issued in a period, by rate.
 */
@Injectable()
export class FinancialStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gl: GeneralLedgerService,
  ) {}

  /** Revenues less expenses within the period. */
  async incomeStatement(currency: Currency, from?: Date, to?: Date) {
    const { lines } = await this.gl.trialBalance(currency, from, to);
    const revenue = (l: TrialLine) => new Prisma.Decimal(l.credit).minus(l.debit);
    const expense = (l: TrialLine) => new Prisma.Decimal(l.debit).minus(l.credit);
    const revenues = topTotal(lines, '4', revenue);
    const expenses = topTotal(lines, '5', expense);
    const net = revenues.minus(expenses);
    return {
      currency,
      from: from ?? null,
      to: to ?? null,
      revenues: { lines: section(lines, '4', revenue), total: revenues.toFixed(2) },
      expenses: { lines: section(lines, '5', expense), total: expenses.toFixed(2) },
      net: net.toFixed(2),
      /** net profit as a share of revenue, in percent */
      margin: revenues.isZero() ? null : net.div(revenues).times(100).toFixed(1),
    };
  }

  /**
   * What the company holds and owes at a date. Until the months are closed (phase 3),
   * the profit of every period so far stands in the equity as one line.
   */
  async balanceSheet(currency: Currency, asOf?: Date) {
    const { lines } = await this.gl.trialBalance(currency, undefined, asOf);
    // each account in its own nature: the trial balance's closing already is
    const closing = (l: TrialLine) => new Prisma.Decimal(l.closing);
    const assets = topTotal(lines, '1', closing);
    const liabilities = topTotal(lines, '2', closing);
    const equity = topTotal(lines, '3', closing);
    const profit = topTotal(lines, '4', closing).minus(topTotal(lines, '5', closing));
    const equityLines = section(lines, '3', closing);
    if (!profit.isZero())
      equityLines.push({ key: 'PROFIT', code: '39', name: 'صافي الأرباح المتراكمة', level: 0, group: false, amount: profit.toFixed(2) });
    const right = liabilities.plus(equity).plus(profit);
    return {
      currency,
      asOf: asOf ?? null,
      assets: { lines: section(lines, '1', closing), total: assets.toFixed(2) },
      liabilities: { lines: section(lines, '2', closing), total: liabilities.toFixed(2) },
      equity: { lines: equityLines, total: equity.plus(profit).toFixed(2) },
      totalLiabilitiesAndEquity: right.toFixed(2),
      balanced: assets.equals(right),
    };
  }

  /** The VAT on the invoices issued in the period, by rate, with each invoice. */
  async vatReport(currency: Currency, from?: Date, to?: Date) {
    const invoices = await this.prisma.$queryRaw<
      {
        id: number;
        invoice_no: string;
        invoice_date: Date;
        type: string;
        vat_rate: Prisma.Decimal;
        subtotal: Prisma.Decimal;
        vat_amount: Prisma.Decimal;
        wht: Prisma.Decimal;
        total: Prisma.Decimal;
        client: string;
        file_no: string;
        shipment_id: number;
      }[]
    >`
      SELECT i."id", i."invoice_no", i."invoice_date", i."type"::text AS type, i."vat_rate", i."subtotal",
             i."vat_amount", i."wht", i."total", c."name" AS client, s."file_no", s."id" AS shipment_id
        FROM "invoices" i
        JOIN "shipments" s ON s."id" = i."shipment_id"
        JOIN "clients" c ON c."id" = s."client_id"
       WHERE i."voided_at" IS NULL AND i."type"::text <> 'STATEMENT' AND i."currency"::text = ${currency}
         AND (${from ?? null}::date IS NULL OR i."invoice_date" >= ${from ?? null}::date)
         AND (${to ?? null}::date IS NULL OR i."invoice_date" <= ${to ?? null}::date)
       ORDER BY i."invoice_date", i."invoice_no"`;
    const byRate = new Map<string, { rate: string; count: number; subtotal: Prisma.Decimal; vat: Prisma.Decimal; total: Prisma.Decimal }>();
    for (const i of invoices) {
      const rate = new Prisma.Decimal(i.vat_rate).toFixed(2);
      const r = byRate.get(rate) ?? { rate, count: 0, subtotal: ZERO, vat: ZERO, total: ZERO };
      r.count += 1;
      r.subtotal = r.subtotal.plus(i.subtotal);
      r.vat = r.vat.plus(i.vat_amount);
      r.total = r.total.plus(i.total);
      byRate.set(rate, r);
    }
    const rates = [...byRate.values()].sort((a, b) => Number(b.rate) - Number(a.rate));
    const sum = (f: (r: (typeof rates)[number]) => Prisma.Decimal) => rates.reduce((s, r) => s.plus(f(r)), ZERO).toFixed(2);
    return {
      currency,
      from: from ?? null,
      to: to ?? null,
      rates: rates.map((r) => ({ rate: r.rate, count: r.count, subtotal: r.subtotal.toFixed(2), vat: r.vat.toFixed(2), total: r.total.toFixed(2) })),
      totals: { count: invoices.length, subtotal: sum((r) => r.subtotal), vat: sum((r) => r.vat), total: sum((r) => r.total) },
      invoices: invoices.map((i) => ({
        id: i.id,
        invoiceNo: i.invoice_no,
        date: i.invoice_date,
        client: i.client,
        fileNo: i.file_no,
        shipmentId: i.shipment_id,
        rate: new Prisma.Decimal(i.vat_rate).toFixed(2),
        subtotal: new Prisma.Decimal(i.subtotal).toFixed(2),
        vat: new Prisma.Decimal(i.vat_amount).toFixed(2),
        total: new Prisma.Decimal(i.total).toFixed(2),
      })),
    };
  }
}
