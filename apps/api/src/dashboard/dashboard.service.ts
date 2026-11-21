import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, can } from '../auth/auth-user';
import { Permission } from '../auth/permissions';
import { ApprovalService } from '../finance/approvals/approval.service';
import { ClientLedgerService } from '../finance/client-ledger.service';
import { HolderLedgerService } from '../finance/holder-ledger.service';
import { todayCairo } from '../finance/money';
import { PartiesService } from '../finance/parties.service';
import { stageSince } from '../notifications/notifications.service';
import { PartyDocumentsService } from '../party-documents/party-documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { shipmentScope } from '../shipments/access-scope';
import {
  activeShipmentWhere,
  shipmentKind,
  stageLabel,
} from '../shipments/stages';

const DAY = 86_400_000;
/** A shipment this long in one stage needs a look. */
export const STUCK_DAYS = 5;
/** A custody open this long is late. */
export const LATE_CUSTODY_DAYS = 5;
/** A client paper this close to its expiry is flagged. */
export const EXPIRY_DAYS = 30;

export type Tone = 'gold' | 'info' | 'warning' | 'danger' | 'success' | 'muted';

export interface Kpi {
  key: string;
  label: string;
  value: string | number;
  currency?: 'EGP' | 'USD';
  hint?: { text: string; tone: Tone };
  link: string;
}

const any = (actor: AuthUser, ...p: Permission[]) =>
  p.some((x) => can(actor, x));

const fixed = (v: Prisma.Decimal | string | number | null | undefined) =>
  new Prisma.Decimal(v ?? 0).toFixed(2);

/**
 * Each user's home: the figures and lists of their own work, each one only for who
 * holds its permission. Built in one call, read again every few minutes.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
    private readonly clientLedger: ClientLedgerService,
    private readonly holders: HolderLedgerService,
    private readonly parties: PartiesService,
    private readonly documents: PartyDocumentsService,
  ) {}

  async build(actor: AuthUser) {
    const kpis: Kpi[] = [];
    const out: Record<string, unknown> = {};
    const today = todayCairo();

    // shipments: the ones this user may see
    const scope = this.scope(actor);
    if (scope) {
      const active: Prisma.ShipmentWhereInput = {
        AND: [scope, activeShipmentWhere()],
      };
      const [count, followUp] = await Promise.all([
        this.prisma.shipment.count({ where: active }),
        this.followUp(active, today),
      ]);
      kpis.push({
        key: 'shipments',
        label: can(actor, 'shipments.view.all')
          ? 'شحنات شغالة'
          : 'شحناتي الشغالة',
        value: count,
        hint: followUp.length
          ? { text: `${followUp.length} محتاجة متابعة`, tone: 'warning' }
          : undefined,
        link: '/shipments',
      });
      out.followUp = followUp;
    }

    // approvals: what waits for this user's step
    if (
      any(actor, 'finance.review', 'finance.approve', 'finance.manager_approve')
    ) {
      const queue = await this.approvals.queue(actor, 8);
      kpis.push({
        key: 'approvals',
        label: 'Waiting',
        value: queue.total,
        hint: queue.today
          ? { text: `+${queue.today} النهارده`, tone: 'gold' }
          : undefined,
        link: '/approvals',
      });
      out.approvals = queue.items;
    }

    // custodies
    if (any(actor, 'finance.custody.manage', 'finance.custody.settle')) {
      const late = new Date(today.getTime() - LATE_CUSTODY_DAYS * DAY);
      const open = await this.prisma.custody.findMany({
        where: { status: 'OPEN' },
        orderBy: [{ issueDate: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          custodyNo: true,
          holderType: true,
          amount: true,
          currency: true,
          issueDate: true,
          shipment: { select: { id: true, fileNo: true } },
          agent: { select: { fullName: true } },
          clearer: { select: { fullName: true } },
          beneficiary: { select: { name: true } },
        },
      });
      const lateCount = open.filter((c) => c.issueDate < late).length;
      kpis.push({
        key: 'custodies',
        label: 'عهد مفتوحة',
        value: open.length,
        hint: lateCount
          ? { text: `${lateCount} متأخرة`, tone: 'danger' }
          : undefined,
        link: '/custodies',
      });
      if (can(actor, 'finance.custody.settle')) {
        out.custodiesToSettle = open.slice(0, 6).map((c) => ({
          id: c.id,
          custodyNo: c.custodyNo,
          holder:
            c.agent?.fullName ??
            c.clearer?.fullName ??
            c.beneficiary?.name ??
            (c.holderType === 'WAY_OUT' ? 'إيداع دولاري' : 'تحويل بنكي'),
          fileNo: c.shipment.fileNo,
          amount: fixed(c.amount),
          currency: c.currency,
          days: Math.floor((today.getTime() - c.issueDate.getTime()) / DAY),
        }));
      }
    }

    // the cash boxes and company banks
    if (can(actor, 'finance.balances.view')) {
      const sums = await this.prisma.moneyAccount.groupBy({
        by: ['currency'],
        where: { ownership: 'COMPANY' },
        _sum: { balance: true },
      });
      const egp = sums.find((s) => s.currency === 'EGP')?._sum.balance;
      const usd = sums.find((s) => s.currency === 'USD')?._sum.balance;
      kpis.push({
        key: 'balances',
        label: 'الخزن والبنوك',
        value: fixed(egp),
        currency: 'EGP',
        hint: usd ? { text: `${fixed(usd)} $`, tone: 'muted' } : undefined,
        link: '/treasury',
      });
      out.treasury = await this.treasury(today);
    }

    // what the clients owe
    if (can(actor, 'finance.client-ledger.view')) {
      const balances = await this.clientLedger.balances();
      const owing = balances
        .map((b) => ({ client: b.client, egp: b.currencies.EGP }))
        .filter((b) => b.egp && Number(b.egp.balance) > 0)
        .sort((a, b) => Number(b.egp.balance) - Number(a.egp.balance));
      const total = owing.reduce((s, b) => s + Number(b.egp.balance), 0);
      kpis.push({
        key: 'receivables',
        label: 'مستحق على العملاء',
        value: total.toFixed(2),
        currency: 'EGP',
        hint: owing.length
          ? { text: `${owing.length} عميل`, tone: 'muted' }
          : undefined,
        link: '/client-ledgers',
      });
      // the list of the biggest debts is the client accountant's card only
      if (actor.roles.includes('CLIENT_ACCOUNTANT'))
        out.receivables = owing.slice(0, 6).map((b) => ({
          client: b.client,
          balance: b.egp.balance,
          oldestDays: b.egp.oldestDays,
        }));
    }

    // what is still owed to the clearers
    if (can(actor, 'finance.fees.pay')) {
      const [due] = await this.prisma.$queryRaw<
        { remaining: Prisma.Decimal | null; n: bigint }[]
      >`
        SELECT sum(r."remaining") AS "remaining", count(*) FILTER (WHERE r."remaining" > 0) AS "n"
          FROM (
            SELECT f."amount"
                   + coalesce((SELECT sum(a."amount") FROM "clearer_fee_adjustments" a
                                WHERE a."fee_id" = f."id" AND a."reason" <> 'CONTAINERS_CHANGED'), 0)
                   - coalesce((SELECT sum(p."amount") FROM "clearer_fee_payments" p WHERE p."fee_id" = f."id"), 0)
                   - coalesce((SELECT sum(o."amount") FROM "clearer_fee_offsets" o WHERE o."fee_id" = f."id"), 0)
                   AS "remaining"
              FROM "clearer_fees" f
          ) r`;
      kpis.push({
        key: 'fees',
        label: 'أتعاب مستخلصين مستحقة',
        value: fixed(due.remaining),
        currency: 'EGP',
        hint: Number(due.n)
          ? { text: `${Number(due.n)} شحنة`, tone: 'muted' }
          : undefined,
        link: '/ledgers',
      });
    }

    // accounts ready to be finished: delivered, every custody settled
    if (can(actor, 'finance.statement.manage')) {
      out.readyToFinish = await this.readyToFinish(actor);
    }

    // the internal accounts
    if (any(actor, 'finance.parties.view', 'finance.parties.record')) {
      const parties = await this.parties.list(actor);
      out.parties = parties
        .filter((p) => p.isActive && p.balances.length)
        .map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.kind,
          balances: p.balances,
        }));
    }

    // client papers close to their expiry
    if (any(actor, 'documents.view.all', 'documents.view.own')) {
      const until = new Date(today.getTime() + EXPIRY_DAYS * DAY);
      const docs = await this.prisma.partyDocument.findMany({
        where: {
          expiryDate: { lte: until },
          client: this.documents.clientScope(actor),
        },
        orderBy: { expiryDate: 'asc' },
        take: 8,
        select: {
          id: true,
          expiryDate: true,
          type: { select: { name: true } },
          client: { select: { id: true, name: true } },
          factory: { select: { name: true } },
        },
      });
      const expired = docs.filter((d) => d.expiryDate < today).length;
      kpis.push({
        key: 'documents',
        label: 'مستندات قربت تنتهي',
        value: docs.length,
        hint: expired
          ? { text: `${expired} منتهية`, tone: 'danger' }
          : undefined,
        link: '/documents',
      });
      out.expiringDocuments = docs.map((d) => ({
        id: d.id,
        type: d.type.name,
        client: d.client,
        factory: d.factory?.name ?? null,
        expiryDate: d.expiryDate,
        days: Math.round((d.expiryDate.getTime() - today.getTime()) / DAY),
      }));
    }

    // a clearer's own statement
    if (
      can(actor, 'finance.ledger.own') &&
      actor.accountType === 'CLEARER' &&
      actor.clearerId
    ) {
      const own = await this.holders.clearer(actor.clearerId);
      out.ownLedger = {
        totals: own.totals,
        lines: own.lines.slice(-6).reverse(),
      };
    }

    return { generatedAt: new Date(), kpis, ...out };
  }

  /** The shipments scope, or null for who sees no shipments. */
  private scope(actor: AuthUser): Prisma.ShipmentWhereInput | null {
    if (!any(actor, 'shipments.view.all', 'shipments.view.own')) return null;
    try {
      return shipmentScope(actor);
    } catch {
      return null;
    }
  }

  /** Arriving within two days, or in the same stage for too long. */
  private async followUp(where: Prisma.ShipmentWhereInput, today: Date) {
    const soon = new Date(today.getTime() + 2 * DAY);
    const rows = await this.prisma.shipment.findMany({
      where,
      select: {
        id: true,
        fileNo: true,
        direction: true,
        mode: true,
        eta: true,
        currentStage: true,
        stageHistory: true,
        containersCount: true,
        client: { select: { name: true } },
        operationEmployee: { select: { fullName: true } },
      },
    });
    const now = Date.now();
    const items = rows.flatMap((s) => {
      const kind = shipmentKind(s.direction, s.mode);
      const since = stageSince(s);
      const stuckDays = since ? Math.floor((now - since.getTime()) / DAY) : 0;
      const arriving =
        s.eta &&
        s.eta >= today &&
        s.eta <= soon &&
        s.currentStage !== 'REGISTERED'
          ? Math.round((s.eta.getTime() - today.getTime()) / DAY)
          : null;
      const flag =
        arriving !== null
          ? {
              text:
                arriving === 0
                  ? 'ETA النهارده'
                  : arriving === 1
                    ? 'ETA بكرة'
                    : 'ETA بعد بكرة',
              tone: 'info' as Tone,
              rank: arriving,
            }
          : stuckDays >= STUCK_DAYS
            ? {
                text: `واقفة ${stuckDays} أيام`,
                tone: 'warning' as Tone,
                rank: 10 - stuckDays,
              }
            : null;
      if (!flag) return [];
      return [
        {
          id: s.id,
          fileNo: s.fileNo,
          client: s.client.name,
          stage: stageLabel(kind, s.currentStage),
          direction: s.direction,
          operation: s.operationEmployee.fullName,
          flag: { text: flag.text, tone: flag.tone },
          rank: flag.rank,
        },
      ];
    });
    return items
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 8)
      .map(({ rank, ...i }) => {
        void rank;
        return i;
      });
  }

  /** Net money in and out per day, the last 14 days, EGP, company accounts. */
  private async treasury(today: Date) {
    const from = new Date(today.getTime() - 13 * DAY);
    const rows = await this.prisma.$queryRaw<
      { day: Date; inflow: Prisma.Decimal; outflow: Prisma.Decimal }[]
    >`
      SELECT m."movement_date" AS "day",
             coalesce(sum(m."amount") FILTER (WHERE m."direction" = 'IN'), 0) AS "inflow",
             coalesce(sum(m."amount") FILTER (WHERE m."direction" = 'OUT'), 0) AS "outflow"
        FROM "money_movements" m JOIN "money_accounts" a ON a."id" = m."account_id"
       WHERE a."currency" = 'EGP' AND a."ownership" = 'COMPANY'
         AND m."movement_date" >= ${from}::date
         -- transfers between our own accounts move money, they add nothing
         AND m."source"::text <> 'TRANSFER'
       GROUP BY m."movement_date" ORDER BY m."movement_date"`;
    const byDay = new Map(
      rows.map((r) => [r.day.toISOString().slice(0, 10), r]),
    );
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(from.getTime() + i * DAY).toISOString().slice(0, 10);
      const r = byDay.get(d);
      return {
        date: d,
        in: fixed(r?.inflow),
        out: fixed(r?.outflow),
      };
    });
  }

  /** Delivered shipments with every custody settled and the account still open. */
  private async readyToFinish(actor: AuthUser) {
    const rows = await this.prisma.shipment.findMany({
      where: {
        NOT: activeShipmentWhere(),
        custodies: { some: {}, none: { status: 'OPEN' } },
        OR: [{ account: null }, { account: { status: 'OPEN' } }],
      },
      select: {
        id: true,
        fileNo: true,
        client: {
          select: { name: true, accountantEmployeeId: true },
        },
      },
      orderBy: { id: 'asc' },
      take: 30,
    });
    // the accountant's own clients first
    const mine = (r: (typeof rows)[number]) =>
      !!actor.employeeId && r.client.accountantEmployeeId === actor.employeeId;
    return rows
      .sort((a, b) => Number(mine(b)) - Number(mine(a)))
      .slice(0, 6)
      .map((r) => ({
        id: r.id,
        fileNo: r.fileNo,
        client: r.client.name,
        mine: mine(r),
      }));
  }
}
