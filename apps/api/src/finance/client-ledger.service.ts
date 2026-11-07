import { Injectable, NotFoundException } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const ZERO = new Prisma.Decimal(0);
const CURRENCIES: Currency[] = ['EGP', 'USD'];
const INVOICE_LABEL = {
  STATEMENT: 'STATEMENT',
  CLEARANCE: 'CLEARANCE',
} as const;

/**
 * Client statements (spec section 14): two balances, EGP and USD. Debit = the live
 * invoices (voided ones drop out), credit = the collections.
 */
@Injectable()
export class ClientLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async ledger(clientId: number) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true },
    });
    if (!client) throw new NotFoundException('العميل غير موجود');
    const [invoices, collections] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { voidedAt: null, shipment: { clientId } },
        select: {
          id: true,
          type: true,
          currency: true,
          invoiceNo: true,
          invoiceDate: true,
          total: true,
          approvalStatus: true,
          shipment: { select: { fileNo: true } },
        },
      }),
      this.prisma.collection.findMany({
        where: { clientId },
        select: {
          id: true,
          currency: true,
          amount: true,
          method: true,
          collectionDate: true,
          reference: true,
          approvalStatus: true,
          shipment: { select: { fileNo: true } },
        },
      }),
    ]);
    const currencies = CURRENCIES.map((currency) => {
      const lines = [
        ...invoices
          .filter((i) => i.currency === currency)
          .map((i) => ({
            date: i.invoiceDate,
            kind: i.type,
            description: `${INVOICE_LABEL[i.type]} ${i.invoiceNo}`,
            fileNo: i.shipment.fileNo,
            debit: i.total,
            credit: ZERO,
            approvalStatus: i.approvalStatus,
          })),
        ...collections
          .filter((c) => c.currency === currency)
          .map((c) => ({
            date: c.collectionDate,
            kind: 'COLLECTION',
            description: `تحصيل ${c.method === 'CASH' ? 'كاش' : 'تحويل'}${c.reference ? ` ${c.reference}` : ''}`,
            fileNo: c.shipment.fileNo,
            debit: ZERO,
            credit: c.amount,
            approvalStatus: c.approvalStatus,
          })),
      ].sort(
        (a, b) =>
          a.date.getTime() - b.date.getTime() ||
          (a.kind === 'COLLECTION' ? 1 : -1),
      );
      let balance = ZERO;
      const withBalance = lines.map((l) => {
        balance = balance.plus(l.debit).minus(l.credit);
        return { ...l, balance };
      });
      return {
        currency,
        lines: withBalance,
        totals: {
          debit: lines.reduce((t, l) => t.plus(l.debit), ZERO),
          credit: lines.reduce((t, l) => t.plus(l.credit), ZERO),
          balance,
        },
      };
    });
    return { client, currencies };
  }

  /** Every client with what they owe in each currency. */
  async balances() {
    const rows = await this.prisma.$queryRaw<
      {
        client_id: number;
        name: string;
        currency: Currency;
        billed: Prisma.Decimal;
        collected: Prisma.Decimal;
      }[]
    >`
      SELECT c."id" AS "client_id", c."name", x."currency"::text AS "currency",
             sum(x."billed") AS "billed", sum(x."collected") AS "collected"
        FROM (
          SELECT s."client_id", i."currency", i."total" AS "billed", 0 AS "collected"
            FROM "invoices" i JOIN "shipments" s ON s."id" = i."shipment_id" WHERE i."voided_at" IS NULL
          UNION ALL
          SELECT "client_id", "currency", 0, "amount" FROM "collections"
        ) x JOIN "clients" c ON c."id" = x."client_id"
       GROUP BY c."id", c."name", x."currency"
       ORDER BY c."name"`;
    const byClient = new Map<
      number,
      {
        client: { id: number; name: string };
        currencies: Record<
          string,
          {
            billed: Prisma.Decimal;
            collected: Prisma.Decimal;
            balance: Prisma.Decimal;
          }
        >;
      }
    >();
    for (const r of rows) {
      const entry = byClient.get(r.client_id) ?? {
        client: { id: r.client_id, name: r.name },
        currencies: {},
      };
      const billed = new Prisma.Decimal(r.billed);
      const collected = new Prisma.Decimal(r.collected);
      entry.currencies[r.currency] = {
        billed,
        collected,
        balance: billed.minus(collected),
      };
      byClient.set(r.client_id, entry);
    }
    return [...byClient.values()];
  }
}
