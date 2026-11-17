import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, can } from '../auth/auth-user';
import { Permission } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { shipmentScope } from '../shipments/access-scope';
import { shipmentKind, stageLabel } from '../shipments/stages';

const TAKE = 6;

export interface SearchHit {
  group: 'shipments' | 'invoices' | 'custodies' | 'clients';
  title: string;
  subtitle: string;
  link: string;
}

const any = (actor: AuthUser, permissions: Permission[]) =>
  permissions.some((p) => can(actor, p));

/** Who opens a shipment's account (the same as the shipment accounts screen). */
const ACCOUNT_VIEW: Permission[] = [
  'finance.shipment-account.view',
  'finance.statement.manage',
  'finance.collections.manage',
  'finance.review',
  'finance.manager_approve',
  'finance.approve',
  'finance.client-ledger.view',
];
const CUSTODY_VIEW: Permission[] = [
  'finance.custody.manage',
  'finance.ledgers.view',
  'finance.review',
  'finance.manager_approve',
  'finance.approve',
];

/**
 * The quick search (Ctrl+K): shipments by any of their numbers or their client, invoices
 * and custodies by number, clients' accounts by name. Each user finds what their
 * permissions show them, and nothing else.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(actor: AuthUser, raw: string): Promise<SearchHit[]> {
    const q = raw.trim();
    if (q.length < 2) return [];
    const upper = q.toUpperCase().replace(/[\s-]/g, '');
    const hits = await Promise.all([
      this.shipments(actor, q, upper),
      any(actor, ACCOUNT_VIEW) ? this.invoices(q) : [],
      any(actor, CUSTODY_VIEW) ? this.custodies(q) : [],
      can(actor, 'finance.client-ledger.view') ? this.clients(q) : [],
    ]);
    return hits.flat();
  }

  private async shipments(
    actor: AuthUser,
    q: string,
    upper: string,
  ): Promise<SearchHit[]> {
    if (!any(actor, ['shipments.view.all', 'shipments.view.own'])) return [];
    const up = q.toUpperCase();
    const rows = await this.prisma.shipment.findMany({
      where: {
        AND: [
          shipmentScope(actor),
          {
            OR: [
              { fileNo: { contains: up } },
              { referenceNumber: { contains: q } },
              { mblNumber: { contains: up, mode: 'insensitive' } },
              { hblNumber: { contains: up, mode: 'insensitive' } },
              {
                billNumbers: {
                  some: { number: { contains: up, mode: 'insensitive' } },
                },
              },
              { containers: { some: { containerNo: { contains: upper } } } },
              { vesselName: { contains: q, mode: 'insensitive' } },
              { client: { name: { contains: q, mode: 'insensitive' } } },
            ],
          },
        ],
      },
      select: {
        id: true,
        fileNo: true,
        direction: true,
        mode: true,
        currentStage: true,
        commodity: true,
        client: { select: { name: true } },
      },
      orderBy: { id: 'desc' },
      take: TAKE,
    });
    return rows.map((s) => ({
      group: 'shipments',
      title: s.fileNo,
      subtitle: `${s.client.name} · ${s.commodity} · ${stageLabel(shipmentKind(s.direction, s.mode), s.currentStage)}`,
      link: `/shipments/${s.id}`,
    }));
  }

  private async invoices(q: string): Promise<SearchHit[]> {
    const rows = await this.prisma.invoice.findMany({
      where: { invoiceNo: { contains: q, mode: 'insensitive' } },
      select: {
        invoiceNo: true,
        total: true,
        currency: true,
        voidedAt: true,
        shipment: {
          select: {
            id: true,
            fileNo: true,
            client: { select: { name: true } },
          },
        },
      },
      orderBy: { id: 'desc' },
      take: TAKE,
    });
    return rows.map((i) => ({
      group: 'invoices',
      title: `فاتورة ${i.invoiceNo}${i.voidedAt ? ' (ملغاة)' : ''}`,
      subtitle: `${i.shipment.fileNo} · ${i.shipment.client.name} · ${new Prisma.Decimal(i.total).toFixed(2)} ${i.currency}`,
      link: `/shipment-accounts/${i.shipment.id}`,
    }));
  }

  private async custodies(q: string): Promise<SearchHit[]> {
    const rows = await this.prisma.custody.findMany({
      where: { custodyNo: { contains: q.toUpperCase() } },
      select: {
        custodyNo: true,
        amount: true,
        currency: true,
        shipment: { select: { fileNo: true } },
      },
      orderBy: { id: 'desc' },
      take: TAKE,
    });
    return rows.map((c) => ({
      group: 'custodies',
      title: `عهدة ${c.custodyNo}`,
      subtitle: `${c.shipment?.fileNo ?? ''} · ${new Prisma.Decimal(c.amount).toFixed(2)} ${c.currency}`,
      link: `/custodies?search=${encodeURIComponent(c.custodyNo)}`,
    }));
  }

  private async clients(q: string): Promise<SearchHit[]> {
    const rows = await this.prisma.client.findMany({
      where: { deletedAt: null, name: { contains: q, mode: 'insensitive' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: TAKE,
    });
    return rows.map((c) => ({
      group: 'clients',
      title: c.name,
      subtitle: 'حساب العميل',
      link: `/client-ledgers/${c.id}`,
    }));
  }
}
