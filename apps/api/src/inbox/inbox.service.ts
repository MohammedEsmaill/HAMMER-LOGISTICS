import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InboxKind } from '@prisma/client';
import { AuthUser } from '../auth/auth-user';
import { teamFor } from '../clients/operation-team';
import { ApprovalService } from '../finance/approvals/approval.service';
import { PrismaService, Tx } from '../prisma/prisma.service';

/** Alerts older than this are dropped. */
const KEEP_DAYS = 60;

export interface ShipmentAlert {
  kind: InboxKind;
  /** once per event and user */
  key: string;
  title: string;
  body: string;
  /** who caused it does not get it */
  exceptUserId?: number;
}

/**
 * The bell. Shipment alerts go to the shipment's operation team (its operation
 * employee and the client's reviewer for its direction). What waits for the user's
 * approval step is counted live, so it shows until it is dealt with.
 */
@Injectable()
export class InboxService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly approvals: ApprovalService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.prune(), 24 * 3600_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async prune() {
    await this.prisma.inboxItem.deleteMany({
      where: {
        createdAt: { lt: new Date(Date.now() - KEEP_DAYS * 86_400_000) },
      },
    });
  }

  /** The users of the shipment's operation employee and of the client's reviewer. */
  private async teamUsers(
    db: Tx | PrismaService,
    shipmentId: number,
  ): Promise<number[]> {
    const s = await db.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: {
        direction: true,
        operationEmployeeId: true,
        client: {
          select: {
            importOperationEmployeeId: true,
            exportOperationEmployeeId: true,
            importReviewerEmployeeId: true,
            exportReviewerEmployeeId: true,
          },
        },
      },
    });
    const reviewer = teamFor(s.client, s.direction).reviewer;
    const employees = [s.operationEmployeeId, ...(reviewer ? [reviewer] : [])];
    const users = await db.user.findMany({
      where: { employeeId: { in: employees }, deletedAt: null, isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  async forShipment(
    db: Tx | PrismaService,
    shipmentId: number,
    alert: ShipmentAlert,
  ) {
    const users = (await this.teamUsers(db, shipmentId)).filter(
      (u) => u !== alert.exceptUserId,
    );
    if (!users.length) return;
    await db.inboxItem.createMany({
      data: users.map((userId) => ({
        userId,
        kind: alert.kind,
        title: alert.title,
        body: alert.body,
        link: `/shipments/${shipmentId}`,
        dedupeKey: alert.key,
        shipmentId,
      })),
      skipDuplicates: true,
    });
  }

  async list(actor: AuthUser) {
    const [items, unread, waiting] = await Promise.all([
      this.prisma.inboxItem.findMany({
        where: { userId: actor.id },
        orderBy: { id: 'desc' },
        take: 30,
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          link: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.inboxItem.count({
        where: { userId: actor.id, readAt: null },
      }),
      this.approvals.waiting(actor),
    ]);
    return { waiting, items, unread };
  }

  async read(actor: AuthUser, id: number) {
    const { count } = await this.prisma.inboxItem.updateMany({
      where: { id, userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (
      !count &&
      !(await this.prisma.inboxItem.findFirst({
        where: { id, userId: actor.id },
      }))
    ) {
      throw new NotFoundException('التنبيه غير موجود');
    }
  }

  async readAll(actor: AuthUser) {
    await this.prisma.inboxItem.updateMany({
      where: { userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
