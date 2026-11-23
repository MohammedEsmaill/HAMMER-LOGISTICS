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
/** A custody open this many days is a reminder in the bell, then again every week. */
export const OPEN_CUSTODY_DAYS = 5;
const CUSTODY_REPEAT_DAYS = 7;
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
  mblNumber: true,
  hblNumber: true,
  packagesCount: true,
  certificateNo: true,
  operationEmployeeId: true,
  currentStage: true,
  stageHistory: true,
  client: { select: { name: true } },
  operationEmployee: { select: { fullName: true, phone: true } },
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

/**
 * An Egyptian mobile as WhatsApp knows it: 01012345678 → 201012345678. Anything else
 * (a landline, a typo) gives null, and the message names the person without a mention.
 */
export function whatsappNumber(
  phone: string | null | undefined,
): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  const local = digits.startsWith('20')
    ? digits.slice(2)
    : digits.replace(/^0/, '');
  return /^1[0125]\d{8}$/.test(local) ? `20${local}` : null;
}

/** "@201012345678" in the text with its id beside it, or the plain name when there is no number. */
function mention(person: { fullName: string; phone: string | null }) {
  const number = whatsappNumber(person.phone);
  return number
    ? { text: `@${number}`, jid: `${number}@s.whatsapp.net` }
    : { text: person.fullName, jid: null };
}

/** The bill of lading the team knows the shipment by (the master, or the house one). */
const billOf = (s: Pick<ShipmentInfo, 'mblNumber' | 'hblNumber'>) =>
  s.mblNumber ?? s.hblNumber;

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
 * The staff WhatsApp group alerts: a vessel arriving tomorrow, shipments stuck in one
 * stage (one message per operation employee, who is mentioned), and expiring papers. Alerts are queued in the database (once per event, by
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
    mentions: string[] = [],
  ): Promise<boolean> {
    const { count } = await tx.notification.createMany({
      data: [{ kind, dedupeKey, text, shipmentId, mentions }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  /** Called in the registration transaction: the team's bell, only if the shipment is saved. */
  async newShipment(tx: Tx, shipmentId: number, actorId?: number) {
    const s = await tx.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      select: SHIPMENT_INFO,
    });
    // the bell only: the group does not get a message for a new shipment
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
      await this.etaPassed(now);
      await this.stuck(now);
      await this.openCustodies(now);
      await this.documentsDue(now);
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
      const who = mention(s.operationEmployee);
      const text = [
        '🚢 *وصول متوقع بكرة*',
        ...header(s).filter((l) => !l.startsWith('مسؤول التشغيل')),
        ...(billOf(s) ? [`البوليصة: ${billOf(s)}`] : []),
        `عدد الطرود: ${s.packagesCount}`,
        `تاريخ الوصول المتوقع: ${dmy(tomorrow)}`,
        '',
        `مسؤول التشغيل: ${who.text}`,
      ].join('\n');
      if (
        await this.enqueue(
          this.prisma,
          'ETA_TOMORROW',
          `ETA:${s.id}:${day(tomorrow)}`,
          text,
          s.id,
          who.jid ? [who.jid] : [],
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
    // one message per operation employee, with all their late shipments and a
    // mention of them at the end
    const byEmployee = new Map<number, { s: ShipmentInfo; since: Date }[]>();
    for (const x of late) {
      const list = byEmployee.get(x.s.operationEmployeeId) ?? [];
      list.push(x);
      byEmployee.set(x.s.operationEmployeeId, list);
    }
    for (const [employeeId, list] of byEmployee) {
      const who = mention(list[0].s.operationEmployee);
      const blocks = list.map(({ s, since }) =>
        [
          // the certificate number first: the team finds the file by it at customs
          `• رقم الشهادة: *${s.certificateNo ?? 'لسه ما اتسجلش'}*`,
          `  *${s.fileNo}* — ${s.client.name}`,
          ...(billOf(s) ? [`  البوليصة: ${billOf(s)}`] : []),
          `  عدد الطرود: ${s.packagesCount}`,
          `  تجاوزت ${STUCK_HOURS} ساعة في مرحلة ${stageLabel(shipmentKind(s.direction, s.mode), s.currentStage)} (منذ ${duration(now.getTime() - since.getTime())})`,
        ].join('\n'),
      );
      const text = [
        `⏳ *شحنات متأخرة*: ${list.length}`,
        '',
        ...blocks,
        '',
        `مسؤول التشغيل: ${who.text}`,
      ].join('\n');
      await this.enqueue(
        this.prisma,
        'STUCK',
        `STUCK:${today}:${employeeId}`,
        text,
        undefined,
        who.jid ? [who.jid] : [],
      );
    }
    await this.prisma.setting.upsert({
      where: { key: STUCK_SCAN_KEY },
      update: { value: today },
      create: { key: STUCK_SCAN_KEY, value: today },
    });
    return late.length;
  }

  /**
   * Once a day: registered shipments whose ETA has passed, so no one has marked them
   * arrived. One group message per operation employee (mentioned at the end), and the
   * shipment team's bell.
   */
  async etaPassed(now = new Date()): Promise<number> {
    const today = todayCairo(now);
    const rows = await this.prisma.shipment.findMany({
      where: { currentStage: 'REGISTERED', eta: { lt: today } },
      select: SHIPMENT_INFO,
      orderBy: { eta: 'asc' },
    });
    const byEmployee = new Map<number, ShipmentInfo[]>();
    for (const s of rows) {
      const late = Math.round((today.getTime() - s.eta!.getTime()) / DAY_MS);
      await this.inbox.forShipment(this.prisma, s.id, {
        kind: 'SHIPMENT_ETA_PASSED',
        key: `ETA_PASSED:${s.id}:${day(today)}`,
        title: `${s.fileNo} عدّى ميعاد وصولها`,
        body: `${s.client.name} · كان متوقع ${dmy(s.eta!)} (من ${count(late, 'يوم', 'يومين', 'أيام', 'يومًا')}) ولسه في التسجيل`,
      });
      const list = byEmployee.get(s.operationEmployeeId) ?? [];
      list.push(s);
      byEmployee.set(s.operationEmployeeId, list);
    }
    for (const [employeeId, list] of byEmployee) {
      const who = mention(list[0].operationEmployee);
      const blocks = list.map((s) =>
        [
          `• *${s.fileNo}* — ${s.client.name}`,
          ...(billOf(s) ? [`  البوليصة: ${billOf(s)}`] : []),
          ...(s.vesselName ? [`  اسم السفينة: ${s.vesselName}`] : []),
          `  الوصول المتوقع كان: ${dmy(s.eta!)}`,
        ].join('\n'),
      );
      const text = [
        `🕓 *عدّى ميعاد وصولها ولسه في التسجيل*: ${list.length}`,
        'لو وصلت حدّث المرحلة، ولو اتأخرت حدّث تاريخ الوصول المتوقع.',
        '',
        ...blocks,
        '',
        `مسؤول التشغيل: ${who.text}`,
      ].join('\n');
      await this.enqueue(
        this.prisma,
        'ETA_PASSED',
        `ETA_PASSED:${day(today)}:${employeeId}`,
        text,
        undefined,
        who.jid ? [who.jid] : [],
      );
    }
    return rows.length;
  }

  /**
   * Custodies open over OPEN_CUSTODY_DAYS: the bell only (no WhatsApp), to who settles
   * custodies and to who issued it; again every week while it stays open.
   */
  async openCustodies(now = new Date()): Promise<number> {
    const today = todayCairo(now);
    const custodies = await this.prisma.custody.findMany({
      where: {
        status: 'OPEN',
        approvalStatus: { not: 'REJECTED' },
        issueDate: {
          lte: new Date(today.getTime() - OPEN_CUSTODY_DAYS * DAY_MS),
        },
      },
      select: {
        id: true,
        custodyNo: true,
        issueDate: true,
        amount: true,
        currency: true,
        createdById: true,
        agent: { select: { fullName: true } },
        clearer: { select: { fullName: true } },
        beneficiary: { select: { name: true } },
        shipment: { select: { id: true, fileNo: true } },
      },
    });
    if (!custodies.length) return 0;
    const settlers = await this.inbox.usersWith(
      this.prisma,
      'finance.custody.settle',
    );
    for (const c of custodies) {
      const age = Math.round(
        (today.getTime() - c.issueDate.getTime()) / DAY_MS,
      );
      const round = Math.floor((age - OPEN_CUSTODY_DAYS) / CUSTODY_REPEAT_DAYS);
      const holder =
        c.clearer?.fullName ?? c.agent?.fullName ?? c.beneficiary?.name ?? '';
      await this.inbox.forUsers(this.prisma, [...settlers, c.createdById], {
        kind: 'CUSTODY_OPEN',
        key: `CUSTODY_OPEN:${c.id}:${round}`,
        title: `عهدة ${c.custodyNo} مفتوحة من ${count(age, 'يوم', 'يومين', 'أيام', 'يومًا')}`,
        body: `${holder ? `${holder} · ` : ''}ملف ${c.shipment.fileNo} · ${c.amount.toFixed(2)} ${c.currency === 'EGP' ? 'ج' : '$'} · محتاجة تصفية`,
        link: `/custodies?search=${encodeURIComponent(c.custodyNo)}`,
        shipmentId: c.shipment.id,
      });
    }
    return custodies.length;
  }

  /**
   * Client and factory papers: 30 days, 7 days and one day before they expire, and on
   * the day. Each step once per expiry date (a renewal starts over), to the client's
   * operation team and to Nafeza, in the bell and in the group.
   */
  async documentsDue(now = new Date()): Promise<number> {
    const today = todayCairo(now);
    const docs = await this.prisma.partyDocument.findMany({
      where: {
        expiryDate: {
          lte: new Date(today.getTime() + 30 * DAY_MS),
          gte: today,
        },
      },
      select: {
        id: true,
        title: true,
        number: true,
        expiryDate: true,
        clientId: true,
        factoryId: true,
        type: { select: { name: true } },
        factory: { select: { name: true } },
        client: {
          select: {
            name: true,
            importOperationEmployeeId: true,
            exportOperationEmployeeId: true,
            importReviewerEmployeeId: true,
            exportReviewerEmployeeId: true,
          },
        },
      },
    });
    if (!docs.length) return 0;
    const nafeza = await this.inbox.usersWith(
      this.prisma,
      'documents.view.all',
    );
    let sent = 0;
    for (const d of docs) {
      const left = Math.round(
        (d.expiryDate.getTime() - today.getTime()) / DAY_MS,
      );
      const step = left <= 0 ? 0 : left <= 1 ? 1 : left <= 7 ? 7 : 30;
      const when =
        step === 0
          ? 'ينتهي النهارده'
          : step === 1
            ? 'ينتهي بكرة'
            : `ينتهي خلال ${left} يوم`;
      const name = d.title || d.type.name;
      const owner = d.factory
        ? `${d.factory.name} — ${d.client.name}`
        : d.client.name;
      const key = `DOC:${d.id}:${day(d.expiryDate)}:${step}`;
      const c = d.client;
      const team = await this.prisma.user.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          employeeId: {
            in: [
              c.importOperationEmployeeId,
              c.exportOperationEmployeeId,
              c.importReviewerEmployeeId,
              c.exportReviewerEmployeeId,
            ].filter((x): x is number => x !== null),
          },
        },
        select: { id: true },
      });
      await this.inbox.forUsers(
        this.prisma,
        [...team.map((u) => u.id), ...nafeza],
        {
          kind: 'DOCUMENT_EXPIRY',
          key,
          title: `${name} ${when}`,
          body: `${owner} · ينتهي ${dmy(d.expiryDate)}`,
          link: `/documents?client=${d.clientId}${d.factoryId ? `&factory=${d.factoryId}` : ''}`,
        },
      );
      const text = [
        `📄 *${name} ${when}*`,
        `العميل: ${owner}`,
        ...(d.number ? [`الرقم: ${d.number}`] : []),
        `تاريخ الانتهاء: ${dmy(d.expiryDate)}`,
      ].join('\n');
      if (await this.enqueue(this.prisma, 'DOCUMENT_EXPIRY', key, text)) sent++;
    }
    return sent;
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
          await this.whatsapp.send(group.jid, n.text, n.mentions);
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
