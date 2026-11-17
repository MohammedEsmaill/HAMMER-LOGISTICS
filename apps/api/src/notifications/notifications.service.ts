import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { NotificationKind, Prisma, ShipmentStage } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { ListQueryDto, Page, pageArgs } from '../common/dto/list-query.dto';
import { todayCairo } from '../finance/money';
import { PrismaService } from '../prisma/prisma.service';
import { StageHistoryEntry } from '../shipments/stage-history';
import {
  activeShipmentWhere,
  shipmentKind,
  stageLabel,
} from '../shipments/stages';
import { InboxService } from '../inbox/inbox.service';
import { WhatsappService } from './whatsapp.service';

type Tx = Prisma.TransactionClient;

export interface WhatsappGroup {
  jid: string;
  name: string;
}

const GROUP_KEY = 'whatsapp.group';
const STUCK_SCAN_KEY = 'notifications.stuck-scan';
/** The morning alerts go out from 9 AM, Cairo time. */
export const MORNING_HOUR = 9;
export const STUCK_HOURS = 48;
const MAX_ATTEMPTS = 5;
/** Messages still unsent after this long are dropped, not sent late. */
const STALE_MS = 36 * 3600_000;
const DAY_MS = 86_400_000;

const MODE: Record<string, string> = {
  IMPORT_SEA: 'وارد بحري',
  IMPORT_AIR: 'وارد جوي',
  IMPORT_FREE_ZONE: 'وارد منطقة حرة',
  EXPORT_SEA: 'صادر بحري',
  EXPORT_AIR: 'صادر جوي',
};

const SHIPMENT_INFO = {
  id: true,
  fileNo: true,
  direction: true,
  mode: true,
  vesselName: true,
  eta: true,
  currentStage: true,
  stageHistory: true,
  client: { select: { name: true } },
  operationEmployee: { select: { fullName: true } },
  loadingPort: { select: { name: true } },
  dischargePort: { select: { name: true } },
  freeZone: { select: { name: true } },
} satisfies Prisma.ShipmentSelect;

type ShipmentInfo = Prisma.ShipmentGetPayload<{ select: typeof SHIPMENT_INFO }>;

function cairoHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
}

const day = (d: Date) => d.toISOString().slice(0, 10);
/** 2026-11-15 → 15/11/2026 */
const dmy = (d: Date) => day(d).split('-').reverse().join('/');

function place(s: ShipmentInfo): string | undefined {
  if (s.mode === 'FREE_ZONE') return s.freeZone?.name;
  return (s.direction === 'IMPORT' ? s.dischargePort : s.loadingPort)?.name;
}

function header(s: ShipmentInfo): string[] {
  const kind = shipmentKind(s.direction, s.mode);
  return [
    `رقم الملف: *${s.fileNo}* (${MODE[kind]})`,
    `العميل: ${s.client.name}`,
    ...(place(s)
      ? [
          `${s.mode === 'FREE_ZONE' ? 'المنطقة الحرة' : s.direction === 'IMPORT' ? 'ميناء الوصول' : 'ميناء الشحن'}: ${place(s)}`,
        ]
      : []),
    ...(s.vesselName ? [`اسم السفينة: ${s.vesselName}`] : []),
    `مسؤول التشغيل: ${s.operationEmployee.fullName}`,
  ];
}

/** When the shipment entered its current stage. */
export function stageSince(
  s: Pick<ShipmentInfo, 'currentStage' | 'stageHistory'>,
): Date | null {
  const history = (s.stageHistory as unknown as StageHistoryEntry[]) ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].to === s.currentStage) return new Date(history[i].at);
  }
  return null;
}

/** Arabic counting: يوم، يومان، 3 أيام، 11 يومًا */
function count(
  n: number,
  one: string,
  two: string,
  few: string,
  many: string,
): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n % 100 >= 3 && n % 100 <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

function duration(ms: number): string {
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / 3600_000);
  const d = count(days, 'يوم', 'يومين', 'أيام', 'يومًا');
  const h = count(hours, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
  if (days === 0) return h;
  return hours ? `${d} و${h}` : d;
}

/**
 * The staff WhatsApp group alerts: a new shipment, a vessel arriving tomorrow, and
 * shipments stuck in one stage. Alerts are queued in the database (once per event, by
 * dedupe key) and sent in order while the number is linked, so none is lost on a restart.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timers: NodeJS.Timeout[] = [];
  private scanning = false;
  private sending = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly audit: AuditService,
    private readonly inbox: InboxService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return; // tests run the steps themselves
    this.timers.push(setInterval(() => void this.scan(), 60_000));
    this.timers.push(setInterval(() => void this.sendPending(), 20_000));
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval);
  }

  // ---- queue ----

  private async enqueue(
    tx: Tx | PrismaService,
    kind: NotificationKind,
    dedupeKey: string,
    text: string,
    shipmentId?: number,
  ): Promise<boolean> {
    const { count } = await tx.notification.createMany({
      data: [{ kind, dedupeKey, text, shipmentId }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  /** Called in the registration transaction: queued only if the shipment is saved. */
  async newShipment(tx: Tx, shipmentId: number, actorId?: number) {
    const s = await tx.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: SHIPMENT_INFO,
    });
    const text = [
      '🆕 *شحنة جديدة*',
      ...header(s),
      ...(s.eta ? [`تاريخ الوصول المتوقع: ${dmy(s.eta)}`] : []),
    ].join('\n');
    await this.enqueue(tx, 'NEW_SHIPMENT', `NEW:${s.id}`, text, s.id);
    await this.inbox.forShipment(tx, s.id, {
      kind: 'SHIPMENT_NEW',
      key: `NEW:${s.id}`,
      title: `شحنة جديدة ${s.fileNo}`,
      body: `${s.client.name}${s.eta ? ` · الوصول المتوقع ${dmy(s.eta)}` : ''}`,
      exceptUserId: actorId,
    });
  }

  // ---- the morning alerts ----

  /** Runs every minute; from 9 AM Cairo it queues what is due today. */
  async scan(now = new Date()) {
    if (this.scanning || cairoHour(now) < MORNING_HOUR) return;
    this.scanning = true;
    try {
      await this.etaTomorrow(now);
      await this.stuck(now);
    } catch (error) {
      this.logger.error(`Notification scan failed: ${String(error)}`);
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Registered shipments whose vessel is due tomorrow. Keyed by the ETA, so a vessel
   * put back to a new date is announced again the day before that date; an ETA set to
   * tomorrow later in the day is still announced.
   */
  async etaTomorrow(now = new Date()): Promise<number> {
    const tomorrow = new Date(todayCairo(now).getTime() + DAY_MS);
    const due = await this.prisma.shipment.findMany({
      where: { currentStage: 'REGISTERED', eta: tomorrow },
      select: SHIPMENT_INFO,
      orderBy: { id: 'asc' },
    });
    let queued = 0;
    for (const s of due) {
      await this.inbox.forShipment(this.prisma, s.id, {
        kind: 'SHIPMENT_ETA',
        key: `ETA:${s.id}:${day(tomorrow)}`,
        title: `وصول متوقع غدًا ${s.fileNo}`,
        body: `${s.client.name}${s.vesselName ? ` · ${s.vesselName}` : ''} · ${dmy(tomorrow)}`,
      });
      const text = [
        '🚢 *وصول متوقع غدًا*',
        ...header(s),
        `تاريخ الوصول المتوقع: ${dmy(tomorrow)}`,
      ].join('\n');
      if (
        await this.enqueue(
          this.prisma,
          'ETA_TOMORROW',
          `ETA:${s.id}:${day(tomorrow)}`,
          text,
          s.id,
        )
      )
        queued++;
    }
    return queued;
  }

  /**
   * Once a day: shipments in the same stage for over 48 hours, in one message. Not for
   * registered shipments (they wait for the vessel) or finished ones.
   */
  async stuck(now = new Date()): Promise<number> {
    const today = day(todayCairo(now));
    const done = await this.prisma.setting.findUnique({
      where: { key: STUCK_SCAN_KEY },
    });
    if (done?.value === today) return 0;

    const rows = await this.prisma.shipment.findMany({
      where: {
        AND: [
          activeShipmentWhere(),
          { currentStage: { not: ShipmentStage.REGISTERED } },
        ],
      },
      select: SHIPMENT_INFO,
      orderBy: { id: 'asc' },
    });
    const late = rows
      .map((s) => ({ s, since: stageSince(s) }))
      .filter(
        (x): x is { s: ShipmentInfo; since: Date } =>
          !!x.since &&
          now.getTime() - x.since.getTime() > STUCK_HOURS * 3600_000,
      )
      .sort((a, b) => a.since.getTime() - b.since.getTime());

    for (const { s, since } of late) {
      await this.inbox.forShipment(this.prisma, s.id, {
        kind: 'SHIPMENT_STUCK',
        key: `STUCK:${s.id}:${s.currentStage}:${today}`,
        title: `شحنة متأخرة ${s.fileNo}`,
        body: `${s.client.name} · ${stageLabel(shipmentKind(s.direction, s.mode), s.currentStage)} منذ ${duration(now.getTime() - since.getTime())}`,
      });
    }
    if (late.length) {
      const blocks = late.map(({ s, since }) =>
        [
          `• *${s.fileNo}* — ${s.client.name}`,
          `  المرحلة: ${stageLabel(shipmentKind(s.direction, s.mode), s.currentStage)} منذ ${duration(now.getTime() - since.getTime())}`,
          `  مسؤول التشغيل: ${s.operationEmployee.fullName}`,
        ].join('\n'),
      );
      const text = [
        `⏳ *شحنات متأخرة* (تجاوزت ${STUCK_HOURS} ساعة في المرحلة نفسها): ${late.length}`,
        '',
        ...blocks,
      ].join('\n');
      await this.enqueue(this.prisma, 'STUCK', `STUCK:${today}`, text);
    }
    await this.prisma.setting.upsert({
      where: { key: STUCK_SCAN_KEY },
      update: { value: today },
      create: { key: STUCK_SCAN_KEY, value: today },
    });
    return late.length;
  }

  // ---- sending ----

  async group(): Promise<WhatsappGroup | null> {
    const row = await this.prisma.setting.findUnique({
      where: { key: GROUP_KEY },
    });
    return (row?.value as unknown as WhatsappGroup) ?? null;
  }

  async setGroup(actor: AuthUser, group: WhatsappGroup) {
    const before = await this.group();
    await this.prisma.$transaction(async (tx) => {
      const value = group as unknown as Prisma.InputJsonValue;
      await tx.setting.upsert({
        where: { key: GROUP_KEY },
        update: { value },
        create: { key: GROUP_KEY, value },
      });
      await this.audit.log(
        {
          userId: actor.id,
          action: 'UPDATE',
          entity: 'setting',
          entityId: GROUP_KEY,
          before,
          after: group,
        },
        tx,
      );
    });
    return group;
  }

  /** Sends the queue oldest first while the number is linked and the group is chosen. */
  async sendPending(now = new Date()): Promise<number> {
    if (this.sending || !this.whatsapp.ready) return 0;
    const group = await this.group();
    if (!group) return 0;
    this.sending = true;
    let sent = 0;
    try {
      await this.prisma.notification.updateMany({
        where: {
          status: 'PENDING',
          createdAt: { lt: new Date(now.getTime() - STALE_MS) },
        },
        data: {
          status: 'FAILED',
          error: 'لم يُرسَل في موعده لانقطاع الاتصال بواتساب',
        },
      });
      const queue = await this.prisma.notification.findMany({
        where: { status: 'PENDING' },
        orderBy: { id: 'asc' },
        take: 10,
      });
      for (const n of queue) {
        try {
          await this.whatsapp.send(group.jid, n.text);
          await this.prisma.notification.update({
            where: { id: n.id },
            data: {
              status: 'SENT',
              sentAt: new Date(),
              attempts: { increment: 1 },
              error: null,
            },
          });
          sent++;
        } catch (error) {
          const attempts = n.attempts + 1;
          await this.prisma.notification.update({
            where: { id: n.id },
            data: {
              attempts,
              error: String(error).slice(0, 500),
              status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
            },
          });
          break; // try again on the next round
        }
        // a short gap between messages, as a person would send them
        if (process.env.NODE_ENV !== 'test') {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    } finally {
      this.sending = false;
    }
    return sent;
  }

  /** A test message to the chosen group. */
  async test(actor: AuthUser) {
    const group = await this.group();
    if (!group) return { queued: false };
    const at = new Date().toISOString();
    await this.enqueue(
      this.prisma,
      'TEST',
      `TEST:${at}`,
      `✅ رسالة تجريبية من نظام HAMMER LINE\nأرسلها: ${actor.email}`,
    );
    void this.sendPending();
    return { queued: true };
  }

  async list(q: ListQueryDto): Promise<
    Page<
      Prisma.NotificationGetPayload<{
        include: { shipment: { select: { id: true; fileNo: true } } };
      }>
    >
  > {
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        orderBy: { id: 'desc' },
        include: { shipment: { select: { id: true, fileNo: true } } },
        ...pageArgs(q),
      }),
      this.prisma.notification.count(),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  /** Puts failed messages back in the queue. */
  async retryFailed() {
    const { count } = await this.prisma.notification.updateMany({
      where: {
        status: 'FAILED',
        createdAt: { gte: new Date(Date.now() - STALE_MS) },
      },
      data: { status: 'PENDING', attempts: 0 },
    });
    void this.sendPending();
    return { count };
  }
}
