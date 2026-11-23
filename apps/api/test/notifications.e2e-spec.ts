import { NotificationsService } from '../src/notifications/notifications.service';
import { WhatsappService } from '../src/notifications/whatsapp.service';
import { ShipmentFixtures, shipmentFixtures } from './fixtures';
import { closeTestContext, createTestContext, TestContext } from './helpers';

const DAY = 86_400_000;

/** A Cairo date n days from today, as YYYY-MM-DD. */
function cairoDay(offset: number): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
  }).format(new Date());
  return new Date(new Date(`${today}T00:00:00.000Z`).getTime() + offset * DAY)
    .toISOString()
    .slice(0, 10);
}

describe('WhatsApp group alerts (e2e)', () => {
  let ctx: TestContext;
  let fx: ShipmentFixtures;
  const sent: { jid: string; text: string; mentions: string[] }[] = [];
  const service = () => ctx.app.get(NotificationsService);

  const register = async (extra: object = {}) =>
    (
      await ctx
        .api(fx.tokens.scan)
        .post('/api/shipments', fx.seaImport(extra))
        .expect(201)
    ).body as { id: number; fileNo: string; version: number };

  /** Puts the shipment in a stage it entered `hours` ago. */
  const parkIn = async (id: number, stage: string, hours: number) => {
    await ctx.prisma.shipment.update({
      where: { id },
      data: {
        currentStage: stage as never,
        stageHistory: [
          {
            from: null,
            to: 'REGISTERED',
            movement: 'FORWARD',
            at: new Date(Date.now() - (hours + 24) * 3600_000).toISOString(),
            by: 1,
          },
          {
            from: 'REGISTERED',
            to: stage,
            movement: 'FORWARD',
            at: new Date(Date.now() - hours * 3600_000).toISOString(),
            by: 1,
          },
        ],
      },
    });
  };

  const queued = (kind: string) =>
    ctx.prisma.notification.findMany({
      where: { kind: kind as never },
      orderBy: { id: 'asc' },
    });

  beforeAll(async () => {
    ctx = await createTestContext();
    fx = await shipmentFixtures(ctx, '4', '97');
    // a fake linked number: records what would be sent
    const wa = ctx.app.get(WhatsappService);
    Object.defineProperty(wa, 'ready', { get: () => true });
    wa.send = (jid: string, text: string, mentions: string[] = []) => {
      sent.push({ jid, text, mentions });
      return Promise.resolve();
    };
  });

  afterAll(() => closeTestContext(ctx));

  it('only the CEO links WhatsApp and picks the group', async () => {
    await ctx
      .api(fx.tokens.scan)
      .get('/api/notifications/whatsapp')
      .expect(403);
    const res = await ctx
      .api(ctx.ceoToken)
      .get('/api/notifications/whatsapp')
      .expect(200);
    expect(res.body.group).toBeNull();
    await ctx
      .api(ctx.ceoToken)
      .patch('/api/notifications/whatsapp/group', {
        jid: 'not-a-group',
        name: 'x',
      })
      .expect(400);
    await ctx
      .api(ctx.ceoToken)
      .patch('/api/notifications/whatsapp/group', {
        jid: '120363000000000001@g.us',
        name: 'موظفين HAMMER',
      })
      .expect(200);
  });

  it('a new shipment goes to the bell only, not to the group', async () => {
    const s = await register();
    const rows = (await queued('NEW_SHIPMENT')).filter(
      (n) => n.shipmentId === s.id,
    );
    expect(rows).toHaveLength(0);
  });

  it('a vessel due tomorrow is announced the day before, and again after its ETA moves', async () => {
    const s = await register({ eta: cairoDay(1) });
    const far = await register({ eta: cairoDay(5) });
    await service().etaTomorrow();
    await service().etaTomorrow(); // once per date
    let mine = (await queued('ETA_TOMORROW')).filter(
      (n) => n.shipmentId === s.id,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toContain('البوليصة: FX');
    expect(mine[0].text).toContain('عدد الطرود: 10');
    expect(
      (await queued('ETA_TOMORROW')).some((n) => n.shipmentId === far.id),
    ).toBe(false);

    // the vessel is put back three days: announced again the day before the new date
    await ctx.prisma.shipment.update({
      where: { id: s.id },
      data: { eta: new Date(`${cairoDay(3)}T00:00:00.000Z`) },
    });
    await service().etaTomorrow(new Date(Date.now() + 2 * DAY));
    mine = (await queued('ETA_TOMORROW')).filter((n) => n.shipmentId === s.id);
    expect(mine).toHaveLength(2);
    expect(mine[1].dedupeKey).toBe(`ETA:${s.id}:${cairoDay(3)}`);
  });

  it('sends the queue to the group in order', async () => {
    sent.length = 0;
    // older test files' shipments may be queued too: send until empty
    while ((await service().sendPending()) > 0);
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((m) => m.jid === '120363000000000001@g.us')).toBe(true);
    // the operation employee is mentioned by their mobile
    const eta = sent.find((m) => m.text.includes('وصول متوقع بكرة'))!;
    expect(eta.mentions).toEqual(['201000000000@s.whatsapp.net']);
    expect(eta.text).toContain('@201000000000');
    expect(
      await ctx.prisma.notification.count({ where: { status: 'PENDING' } }),
    ).toBe(0);
  }, 120_000);

  it('a shipment past its registration is not announced for its ETA', async () => {
    const s = await register({ eta: cairoDay(1) });
    await parkIn(s.id, 'ARRIVED', 1);
    await service().etaTomorrow();
    expect(
      (await queued('ETA_TOMORROW')).some((n) => n.shipmentId === s.id),
    ).toBe(false);
  });

  it('a registered shipment past its ETA: one message per operation employee, and the bell', async () => {
    const late = await register({ eta: cairoDay(1) });
    await ctx.prisma.shipment.update({
      where: { id: late.id },
      data: { eta: new Date(`${cairoDay(-2)}T00:00:00.000Z`) },
    });
    const onTime = await register({ eta: cairoDay(2) });
    await service().etaPassed();
    await service().etaPassed(); // once a day
    const rows = (await queued('ETA_PASSED')).filter((n) =>
      n.text.includes(late.fileNo),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toContain('عدّى ميعاد وصولها');
    expect(rows[0].text).not.toContain(onTime.fileNo);
    expect(rows[0].mentions).toEqual(['201000000000@s.whatsapp.net']);
    const bell = await ctx.prisma.inboxItem.findMany({
      where: { shipmentId: late.id, kind: 'SHIPMENT_ETA_PASSED' },
    });
    expect(bell.length).toBeGreaterThan(0);
    // once it arrives it is no longer listed
    await parkIn(late.id, 'ARRIVED', 1);
    await service().etaPassed(new Date(Date.now() + DAY));
    expect(
      (await queued('ETA_PASSED')).filter((n) => n.text.includes(late.fileNo)),
    ).toHaveLength(1);
  });

  it('lists shipments stuck over 48 hours once a day, not registered or cleared ones', async () => {
    const stuck = await register();
    const fresh = await register();
    const registered = await register();
    const cleared = await register();
    await parkIn(stuck.id, 'EXAMINATION', 50);
    await parkIn(fresh.id, 'VALUATION', 30);
    await parkIn(registered.id, 'REGISTERED', 80);
    await parkIn(cleared.id, 'CLEARED', 80);

    expect(await service().stuck()).toBeGreaterThanOrEqual(1);
    expect(await service().stuck()).toBe(0); // already done today
    // one message per operation employee: find the one holding this shipment
    const mineToday = async (day: string) =>
      (await queued('STUCK')).find(
        (n) =>
          n.dedupeKey.startsWith(`STUCK:${day}:`) &&
          n.text.includes(stuck.fileNo),
      )!;
    const today = await mineToday(cairoDay(0));
    expect(today.text).toContain(stuck.fileNo);
    expect(today.text).toContain('تجاوزت 48 ساعة في مرحلة جاري الكشف');
    expect(today.text).toContain('عدد الطرود: 10');
    // the certificate number opens each shipment's lines
    expect(today.text).toContain('• رقم الشهادة: *لسه ما اتسجلش*');
    expect(today.mentions).toEqual(['201000000000@s.whatsapp.net']);
    expect(today.text.trim().endsWith('@201000000000')).toBe(true);
    for (const s of [fresh, registered, cleared])
      expect(today.text).not.toContain(s.fileNo);

    // still stuck the next morning: listed again
    await service().stuck(new Date(Date.now() + DAY));
    const next = await mineToday(cairoDay(1));
    expect(next.text).toContain(stuck.fileNo);
    // the same operation employee: both shipments in the one message, 30 hours in and a day later over 48 too
    expect(next.text).toContain(fresh.fileNo);
  });

  it('the CEO sees the log of alerts', async () => {
    const res = await ctx
      .api(ctx.ceoToken)
      .get('/api/notifications?pageSize=5')
      .expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThan(0);
  });

  describe('the bell', () => {
    const inbox = (token: string) =>
      ctx
        .api(token)
        .get('/api/inbox')
        .expect(200)
        .then(
          (r) =>
            r.body as {
              unread: number;
              items: {
                id: number;
                kind: string;
                title: string;
                link: string;
                readAt: string | null;
              }[];
              waiting: { type: string; status: string; count: number }[];
            },
        );

    it('tells the operation team of a new shipment, not who registered it', async () => {
      const s = await register();
      const mine = await inbox(fx.tokens.opsA);
      const item = mine.items.find((i) => i.link === `/shipments/${s.id}`);
      expect(item).toMatchObject({ kind: 'SHIPMENT_NEW' });
      expect(item!.title).toContain(s.fileNo);
      expect(
        (await inbox(fx.tokens.scan)).items.some(
          (i) => i.link === `/shipments/${s.id}`,
        ),
      ).toBe(false);
      expect(
        (await inbox(fx.tokens.opsB)).items.some(
          (i) => i.link === `/shipments/${s.id}`,
        ),
      ).toBe(false);
    });

    it('marks one or all as read', async () => {
      const before = await inbox(fx.tokens.opsA);
      expect(before.unread).toBeGreaterThan(0);
      await ctx
        .api(fx.tokens.opsA)
        .post(`/api/inbox/${before.items[0].id}/read`)
        .expect(204);
      expect((await inbox(fx.tokens.opsA)).unread).toBe(before.unread - 1);
      // someone else's alert is not theirs to read
      await ctx
        .api(fx.tokens.opsB)
        .post(`/api/inbox/${before.items[1].id}/read`)
        .expect(404);
      await ctx.api(fx.tokens.opsA).post('/api/inbox/read-all').expect(204);
      expect((await inbox(fx.tokens.opsA)).unread).toBe(0);
    });

    it('counts what waits for the user approval step, not their own documents', async () => {
      const treasury = (
        await ctx.userWithRole('971', 'TREASURY_MANAGER', 'ACCOUNTS')
      ).token;
      const accountant = (
        await ctx.userWithRole('972', 'GENERAL_AUDITOR', 'ACCOUNTS')
      ).token;
      const cash = await ctx.prisma.moneyAccount.findFirstOrThrow({
        where: { type: 'CASH', currency: 'EGP' },
      });
      const before =
        (await inbox(accountant)).waiting.find((w) => w.type === 'OTHER')
          ?.count ?? 0;
      await ctx
        .api(treasury)
        .post('/api/finance/other-movements', {
          accountId: cash.id,
          kind: 'FUNDING',
          amount: 100,
          reason: 'تمويل للجرس',
        })
        .expect(201);
      const after = (await inbox(accountant)).waiting.find(
        (w) => w.type === 'OTHER',
      );
      expect(after).toMatchObject({ status: 'PENDING', count: before + 1 });
      // the operation employee has no approval step
      expect((await inbox(fx.tokens.opsA)).waiting).toEqual([]);
    });
  });
});
