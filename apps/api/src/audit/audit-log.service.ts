import {
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser, can } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

/** The sign-in records, shown in their own tab. */
export const LOGIN_ACTIONS = [
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'LOGIN_LOCKED',
  'UNLOCK',
];

/** The part of the system each record belongs to. */
export const SECTIONS: Record<string, string[]> = {
  shipments: ['shipment', 'shipment_document'],
  finance: [
    'transfer',
    'other_movement',
    'salary_payment',
    'employee_advance',
    'general_expense',
    'custody',
    'clearer_fee',
    'clearer_fee_payment',
    'clearer_fee_adjustment',
    'collection',
    'money_account',
    'journal_day',
    'shipment_account',
    'statement_extra_line',
    'statement_override',
    'beneficiary',
    'settlement_item',
    'clearer_fee_rate',
  ],
  people: ['client', 'factory', 'party_document', 'employee', 'clearer'],
  system: ['user', 'role', 'setting', 'backup'],
};

/** Salaries and advances: only the CEO, HR, the treasury manager and the accounts manager. */
const PAY_ENTITIES = ['salary_payment', 'employee_advance'];
const PAY_ROLES = new Set(['HR', 'TREASURY_MANAGER', 'ACCOUNTS_MANAGER', 'HEAD_MANAGER']);
const PAY_FIELDS = new Set(['basicSalary', 'salary', 'netSalary']);
const KEEP_YEARS = 2;
const USER = {
  user: {
    select: { id: true, email: true, employee: { select: { fullName: true } } },
  },
} satisfies Prisma.AuditLogInclude;

export interface AuditQuery {
  tab: 'operations' | 'logins';
  userId?: number;
  action?: string;
  section?: string;
  entity?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  page: number;
  pageSize: number;
}

const canSeePay = (actor: AuthUser) =>
  actor.role.isSystem || actor.roles.some((r) => PAY_ROLES.has(r));

/** A short name for what a record is about, from its own data. */
function refOf(row: {
  before: Prisma.JsonValue;
  after: Prisma.JsonValue;
}): string | null {
  for (const data of [row.after, row.before]) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    const d = data as Record<string, unknown>;
    for (const k of [
      'fileNo',
      'invoiceNo',
      'custodyNo',
      'number',
      'fullName',
      'name',
      'email',
      'reference',
      'title',
    ]) {
      if (typeof d[k] === 'string' && d[k]) return d[k];
    }
    // a client paper names its type
    const type = d.type as { name?: unknown } | undefined;
    if (type && typeof type.name === 'string') return type.name;
  }
  return null;
}

/**
 * The audit log as a page: every change, who made it and when, with the data before and
 * after. Kept two years. Salary data reaches only who may see salaries.
 */
@Injectable()
export class AuditLogService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    setTimeout(
      () => void this.prune().catch(() => undefined),
      5 * 60_000,
    ).unref();
    this.timer = setInterval(
      () => void this.prune().catch(() => undefined),
      24 * 3600_000,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Records over two years old go (the database refuses anything newer). */
  async prune(now = new Date()) {
    const limit = new Date(now);
    limit.setFullYear(limit.getFullYear() - KEEP_YEARS);
    const { count } = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: limit } },
    });
    return count;
  }

  private where(actor: AuthUser, q: AuditQuery): Prisma.AuditLogWhereInput {
    const and: Prisma.AuditLogWhereInput[] = [
      q.tab === 'logins'
        ? { action: { in: LOGIN_ACTIONS } }
        : { action: { notIn: LOGIN_ACTIONS } },
    ];
    if (!canSeePay(actor)) and.push({ entity: { notIn: PAY_ENTITIES } });
    if (q.userId) and.push({ userId: q.userId });
    if (q.action) and.push({ action: q.action });
    if (q.section && SECTIONS[q.section])
      and.push({ entity: { in: SECTIONS[q.section] } });
    if (q.entity) and.push({ entity: q.entity });
    if (q.entityId) and.push({ entityId: q.entityId });
    if (q.from) and.push({ createdAt: { gte: q.from } });
    if (q.to)
      and.push({ createdAt: { lt: new Date(q.to.getTime() + 86_400_000) } });
    return { AND: and };
  }

  async list(actor: AuthUser, q: AuditQuery) {
    if (!can(actor, 'audit.view')) throw new ForbiddenException();
    let where = this.where(actor, q);
    if (q.search) {
      // a number, a name or a file number anywhere in the record
      const ids = await this.prisma.$queryRaw<{ id: bigint }[]>`
        SELECT "id" FROM "audit_logs"
         WHERE "entity_id" = ${q.search}
            OR "after"::text ILIKE ${`%${q.search}%`} OR "before"::text ILIKE ${`%${q.search}%`}
         ORDER BY "id" DESC LIMIT 5000`;
      where = { AND: [where, { id: { in: ids.map((r) => r.id) } }] };
    }
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: USER,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const pay = canSeePay(actor);
    return {
      items: await this.withShipmentRefs(rows.map((r) => this.row(r, pay))),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /** Everything done to one shipment: the shipment and its documents. */
  async ofShipment(actor: AuthUser, shipmentId: number) {
    if (!can(actor, 'audit.view')) throw new ForbiddenException();
    const id = String(shipmentId);
    const ids = await this.prisma.$queryRaw<{ id: bigint }[]>`
      SELECT "id" FROM "audit_logs"
       WHERE ("entity" = 'shipment' AND "entity_id" = ${id})
          OR ("entity" = 'shipment_document'
              AND (("after"->>'shipmentId') = ${id} OR ("before"->>'shipmentId') = ${id}))`;
    const rows = await this.prisma.auditLog.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      orderBy: { id: 'desc' },
      include: USER,
    });
    return this.withShipmentRefs(
      rows.map((r) => this.row(r, canSeePay(actor))),
    );
  }

  /** The users who appear in the log, for the filter. */
  async users() {
    return this.prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      select: {
        id: true,
        email: true,
        employee: { select: { fullName: true } },
      },
      orderBy: { email: 'asc' },
    });
  }

  private row(
    r: Prisma.AuditLogGetPayload<{ include: typeof USER }>,
    pay: boolean,
  ) {
    return {
      id: Number(r.id),
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      ref: refOf(r),
      ip: r.ip,
      createdAt: r.createdAt,
      user: r.user
        ? {
            id: r.user.id,
            email: r.user.email,
            name: r.user.employee?.fullName ?? null,
          }
        : null,
      before: pay ? r.before : this.hidePay(r.before),
      after: pay ? r.after : this.hidePay(r.after),
    };
  }

  /** Shipment records that do not carry the file number (a stage move) get it. */
  private async withShipmentRefs<
    T extends { entity: string; entityId: string; ref: string | null },
  >(rows: T[]) {
    const ids = [
      ...new Set(
        rows
          .filter((r) => r.entity === 'shipment' && !r.ref)
          .map((r) => Number(r.entityId)),
      ),
    ].filter(Number.isInteger);
    if (!ids.length) return rows;
    const found = await this.prisma.shipment.findMany({
      where: { id: { in: ids } },
      select: { id: true, fileNo: true },
    });
    const files = new Map(found.map((x) => [String(x.id), x.fileNo]));
    return rows.map((r) =>
      r.entity === 'shipment' && !r.ref
        ? { ...r, ref: files.get(r.entityId) ?? null }
        : r,
    );
  }

  private hidePay(value: Prisma.JsonValue): Prisma.JsonValue {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return value;
    return Object.fromEntries(
      Object.entries(value).filter(([k]) => !PAY_FIELDS.has(k)),
    );
  }
}
