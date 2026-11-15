import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovalStatus,
  CollectionMethod,
  Currency,
  InvoiceType,
  Prisma,
  ShipmentAccountStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { todayCairo } from './money';

const ZERO = new Prisma.Decimal(0);
const CURRENCIES: Currency[] = ['EGP', 'USD'];
const DAY_MS = 86_400_000;
/** Aging buckets by invoice date: up to 30 days, 31–60, 61–90, over 90. */
const BUCKETS = [30, 60, 90] as const;

export type LineKind = InvoiceType | CollectionMethod;

const INVOICE_LABEL: Record<InvoiceType, string> = {
  CLEARANCE: 'فاتورة أتعاب تخليص',
  STATEMENT: 'فاتورة مصروفات (Statement)',
};
const COLLECTION_LABEL: Record<CollectionMethod, string> = {
  CASH: 'تحصيل نقدي',
  TRANSFER: 'تحويل بنكي',
};

interface Item {
  kind: LineKind;
  label: string;
  /** invoice number or the transfer reference */
  ref: string | null;
  date: Date;
  shipmentId: number;
  fileNo: string;
  invoiceId: number | null;
  collectionId: number | null;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  approvalStatus: ApprovalStatus;
  currency: Currency;
  clientId: number;
  accountStatus: ShipmentAccountStatus | null;
}

export interface ClientLedgerQuery {
  from?: Date;
  to?: Date;
}

const approved = (i: Item) => i.approvalStatus === 'APPROVED';
const pending = (i: Item) =>
  i.approvalStatus !== 'APPROVED' && i.approvalStatus !== 'REJECTED';
const sum = (items: Item[], k: 'debit' | 'credit') =>
  items.reduce((t, i) => t.plus(i[k]), ZERO);
const byDate = (a: Item, b: Item) =>
  a.date.getTime() - b.date.getTime() ||
  (a.credit.gt(0) ? 1 : 0) - (b.credit.gt(0) ? 1 : 0);

/**
 * Client accounts (spec section 14), per currency. The balance counts approved documents
 * only; those still under review are listed apart. Collections stay on the shipment they
 * were recorded on, so a shipment's collections pay its own invoices, oldest first, and
 * what is left unpaid is aged by its invoice date.
 */
@Injectable()
export class ClientLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  private async items(clientId?: number): Promise<Item[]> {
    const [invoices, collections] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          voidedAt: null,
          approvalStatus: { not: 'REJECTED' },
          ...(clientId ? { shipment: { clientId } } : {}),
        },
        select: {
          id: true,
          type: true,
          currency: true,
          invoiceNo: true,
          invoiceDate: true,
          total: true,
          approvalStatus: true,
          shipment: {
            select: {
              id: true,
              fileNo: true,
              clientId: true,
              account: { select: { status: true } },
            },
          },
        },
      }),
      this.prisma.collection.findMany({
        where: {
          approvalStatus: { not: 'REJECTED' },
          ...(clientId ? { clientId } : {}),
        },
        select: {
          id: true,
          clientId: true,
          currency: true,
          amount: true,
          method: true,
          collectionDate: true,
          reference: true,
          approvalStatus: true,
          shipment: {
            select: {
              id: true,
              fileNo: true,
              account: { select: { status: true } },
            },
          },
        },
      }),
    ]);
    return [
      ...invoices.map((i) => ({
        kind: i.type,
        label: INVOICE_LABEL[i.type],
        ref: i.invoiceNo,
        date: i.invoiceDate,
        shipmentId: i.shipment.id,
        fileNo: i.shipment.fileNo,
        invoiceId: i.id,
        collectionId: null,
        debit: i.total,
        credit: ZERO,
        approvalStatus: i.approvalStatus,
        currency: i.currency,
        clientId: i.shipment.clientId,
        accountStatus: i.shipment.account?.status ?? null,
      })),
      ...collections.map((c) => ({
        kind: c.method,
        label: COLLECTION_LABEL[c.method],
        ref: c.reference,
        date: c.collectionDate,
        shipmentId: c.shipment.id,
        fileNo: c.shipment.fileNo,
        invoiceId: null,
        collectionId: c.id,
        debit: ZERO,
        credit: c.amount,
        approvalStatus: c.approvalStatus,
        currency: c.currency,
        clientId: c.clientId,
        accountStatus: c.shipment.account?.status ?? null,
      })),
    ].sort(byDate);
  }

  /** Per shipment: billed, collected, what is left and its age (approved documents). */
  private shipments(items: Item[], today: Date) {
    const groups = new Map<number, Item[]>();
    for (const i of items.filter(approved))
      groups.set(i.shipmentId, [...(groups.get(i.shipmentId) ?? []), i]);
    return [...groups.values()].map((group) => {
      const billed = sum(group, 'debit');
      const collected = sum(group, 'credit');
      // the collections pay the oldest invoices first; what is left is aged
      let paid = collected;
      const unpaid: { date: Date; amount: Prisma.Decimal }[] = [];
      for (const inv of group.filter((g) => g.debit.gt(0))) {
        const covered = Prisma.Decimal.min(paid, inv.debit);
        paid = paid.minus(covered);
        const left = inv.debit.minus(covered);
        if (left.gt(0)) unpaid.push({ date: inv.date, amount: left });
      }
      const oldest = unpaid[0]?.date ?? null;
      return {
        shipmentId: group[0].shipmentId,
        fileNo: group[0].fileNo,
        accountStatus: group[0].accountStatus,
        billed,
        collected,
        remaining: billed.minus(collected),
        oldestUnpaidDate: oldest,
        ageDays: oldest
          ? Math.floor((today.getTime() - oldest.getTime()) / DAY_MS)
          : null,
        unpaid,
      };
    });
  }

  private aging(
    shipments: ReturnType<ClientLedgerService['shipments']>,
    today: Date,
  ) {
    const buckets = [ZERO, ZERO, ZERO, ZERO];
    for (const s of shipments) {
      for (const u of s.unpaid) {
        const age = (today.getTime() - u.date.getTime()) / DAY_MS;
        const i = BUCKETS.findIndex((limit) => age <= limit);
        const at = i === -1 ? 3 : i;
        buckets[at] = buckets[at].plus(u.amount);
      }
    }
    return {
      upTo30: buckets[0],
      from31To60: buckets[1],
      from61To90: buckets[2],
      over90: buckets[3],
    };
  }

  /** One currency's account: summary, aging, period statement, per shipment, pending. */
  private account(
    all: Item[],
    currency: Currency,
    q: ClientLedgerQuery,
    today: Date,
  ) {
    const items = all.filter((i) => i.currency === currency);
    const done = items.filter(approved);
    const waiting = items.filter(pending);
    const shipments = this.shipments(items, today);
    const balance = sum(done, 'debit').minus(sum(done, 'credit'));
    const ages = shipments
      .map((s) => s.ageDays)
      .filter((d): d is number => d !== null);

    const before = done.filter((i) => q.from && i.date < q.from);
    let running = sum(before, 'debit').minus(sum(before, 'credit'));
    const opening = running;
    const period = done.filter(
      (i) => (!q.from || i.date >= q.from) && (!q.to || i.date <= q.to),
    );
    const lines = period.map((i) => {
      running = running.plus(i.debit).minus(i.credit);
      return this.line(i, running);
    });

    return {
      currency,
      summary: {
        billed: sum(done, 'debit'),
        collected: sum(done, 'credit'),
        balance,
        oldestDays: ages.length ? Math.max(...ages) : null,
        lastCollection: done.filter((i) => i.credit.gt(0)).at(-1)?.date ?? null,
        pending: {
          count: waiting.length,
          billed: sum(waiting, 'debit'),
          collected: sum(waiting, 'credit'),
        },
      },
      aging: this.aging(shipments, today),
      statement: {
        opening,
        lines,
        debit: sum(period, 'debit'),
        credit: sum(period, 'credit'),
        closing: running,
      },
      shipments: shipments
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ unpaid, ...s }) => s)
        .sort((a, b) => b.remaining.comparedTo(a.remaining)),
      pending: waiting.map((i) => this.line(i, null)),
      active: items.length > 0,
    };
  }

  private line(i: Item, balance: Prisma.Decimal | null) {
    return {
      date: i.date,
      kind: i.kind,
      label: i.label,
      ref: i.ref,
      shipmentId: i.shipmentId,
      fileNo: i.fileNo,
      invoiceId: i.invoiceId,
      collectionId: i.collectionId,
      debit: i.debit,
      credit: i.credit,
      balance,
      approvalStatus: i.approvalStatus,
    };
  }

  async ledger(clientId: number, q: ClientLedgerQuery = {}) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, mobile: true, email: true },
    });
    if (!client) throw new NotFoundException('العميل غير موجود');
    const items = await this.items(clientId);
    const today = todayCairo();
    return {
      client,
      from: q.from ?? null,
      to: q.to ?? null,
      generatedAt: new Date(),
      currencies: CURRENCIES.map((c) => this.account(items, c, q, today)),
    };
  }

  /** Every client with an account: per currency balance, pending, last collection, age. */
  async balances() {
    const [items, clients] = await Promise.all([
      this.items(),
      this.prisma.client.findMany({ select: { id: true, name: true } }),
    ]);
    const today = todayCairo();
    const names = new Map(clients.map((c) => [c.id, c.name]));
    const byClient = new Map<number, Item[]>();
    for (const i of items)
      byClient.set(i.clientId, [...(byClient.get(i.clientId) ?? []), i]);
    return [...byClient.entries()]
      .map(([id, own]) => ({
        client: { id, name: names.get(id) ?? '—' },
        currencies: Object.fromEntries(
          CURRENCIES.filter((c) => own.some((i) => i.currency === c)).map(
            (c) => {
              const a = this.account(own, c, {}, today);
              return [
                c,
                {
                  billed: a.summary.billed,
                  collected: a.summary.collected,
                  balance: a.summary.balance,
                  pending: a.summary.pending.count,
                  oldestDays: a.summary.oldestDays,
                  lastCollection: a.summary.lastCollection,
                },
              ];
            },
          ),
        ),
      }))
      .sort((a, b) => a.client.name.localeCompare(b.client.name, 'ar'));
  }
}
