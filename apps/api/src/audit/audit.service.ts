import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../prisma/prisma.service';

/** Fields that never go into the audit trail. */
const SECRET_FIELDS = new Set(['passwordHash', 'sessionId']);

export interface AuditEntry {
  userId: number | null;
  action: string;
  entity: string;
  entityId: string | number;
  before?: object | null;
  after?: object | null;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass the transaction client so the audit row commits or rolls back with the change. */
  async log(entry: AuditEntry, tx: Tx = this.prisma): Promise<void> {
    await tx.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: String(entry.entityId),
        before: this.snapshot(entry.before),
        after: this.snapshot(entry.after),
        ip: entry.ip,
      },
    });
  }

  private snapshot(
    value: object | null | undefined,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (!value) return Prisma.JsonNull;
    const clean = Object.fromEntries(
      Object.entries(value).filter(([k]) => !SECRET_FIELDS.has(k)),
    );
    return JSON.parse(JSON.stringify(clean)) as Prisma.InputJsonValue;
  }
}
