import request from 'supertest';
import { NotificationsService } from '../src/notifications/notifications.service';
import { ShipmentFixtures, shipmentFixtures } from './fixtures';
import { closeTestContext, createTestContext, TestContext } from './helpers';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
const JPG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46,
]);
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

interface Doc {
  id: number;
  factoryId: number | null;
  url: string;
  status: string;
  daysLeft: number;
}

describe('Documents center (e2e)', () => {
  let ctx: TestContext;
  let fx: ShipmentFixtures;
  let types: { id: number; name: string }[];
  let secondFactory: number;
  const typeId = (name: string) => types.find((t) => t.name === name)!.id;

  const upload = (
    token: string,
    fields: Record<string, string | number>,
    file: Buffer = PDF,
    name = 'doc.pdf',
  ) => {
    const req = request(ctx.app.getHttpServer())
      .post('/api/party-documents')
      .set('Authorization', `Bearer ${token}`);
    for (const [k, v] of Object.entries(fields)) void req.field(k, String(v));
    return req.attach('file', file, { filename: name });
  };
  const base = () => ({
    clientId: fx.ids.clientA,
    typeId: typeId('السجل التجاري'),
    issueDate: cairoDay(-300),
    expiryDate: cairoDay(200),
  });

  beforeAll(async () => {
    ctx = await createTestContext();
    fx = await shipmentFixtures(ctx, '5', '98');
    types = (
      await ctx
        .api(fx.tokens.nafeza)
        .get('/api/party-documents/types')
        .expect(200)
    ).body;
    // client B gets a second factory
    secondFactory = (
      await ctx
        .api(ctx.ceoToken)
        .post(`/api/clients/${fx.ids.clientB}/factories`, {
          name: 'Factory 5-B2',
          taxNumber: '850000099',
          commercialRegister: '9',
          address: 'Alex',
        })
        .expect(201)
    ).body.id;
  });

  afterAll(() => closeTestContext(ctx));

  it('shows operation its own clients, Nafeza all, and nobody else', async () => {
    const mine = (
      await ctx
        .api(fx.tokens.opsA)
        .get('/api/party-documents/cards')
        .expect(200)
    ).body as { client: { id: number } }[];
    expect(mine.some((c) => c.client.id === fx.ids.clientA)).toBe(true);
    expect(mine.some((c) => c.client.id === fx.ids.clientB)).toBe(false);
    const all = (
      await ctx
        .api(fx.tokens.nafeza)
        .get('/api/party-documents/cards')
        .expect(200)
    ).body as {
      client: { id: number };
      factory: { id: number } | null;
    }[];
    // a client with two factories is two cards
    expect(
      all
        .filter((c) => c.client.id === fx.ids.clientB)
        .map((c) => c.factory?.id),
    ).toEqual(expect.arrayContaining([fx.ids.factoryB, secondFactory]));
    await ctx.api(fx.tokens.scan).get('/api/party-documents/cards').expect(403);
  });

  it('uploads a paper of a one-factory client to the client', async () => {
    const res = await upload(fx.tokens.opsA, {
      ...base(),
      number: '12345',
    }).expect(201);
    expect(res.body).toMatchObject({
      factoryId: null,
      number: '12345',
      mimeType: 'application/pdf',
    });
    const list = (
      await ctx
        .api(fx.tokens.opsA)
        .get(`/api/party-documents?clientId=${fx.ids.clientA}`)
        .expect(200)
    ).body as Doc[];
    expect(list[0]).toMatchObject({ status: 'VALID', daysLeft: 200 });
  });

  it('checks the fields, the file and who owns the client', async () => {
    await upload(fx.tokens.opsA, { ...base(), typeId: typeId('أخرى') }).expect(
      400,
    );
    await upload(fx.tokens.opsA, {
      ...base(),
      typeId: typeId('أخرى'),
      title: 'إقرار',
    }).expect(201);
    await upload(fx.tokens.opsA, {
      ...base(),
      expiryDate: cairoDay(-400),
    }).expect(400);
    await upload(fx.tokens.opsA, base(), Buffer.from('hello'), 'x.pdf').expect(
      400,
    );
    await upload(fx.tokens.opsA, base(), JPG, 'card.jpg').expect(201);
    // client B is not opsA's
    await upload(fx.tokens.opsA, {
      ...base(),
      clientId: fx.ids.clientB,
    }).expect(404);
    // two factories: the factory is required
    await upload(fx.tokens.nafeza, {
      ...base(),
      clientId: fx.ids.clientB,
    }).expect(400);
    const res = await upload(fx.tokens.nafeza, {
      ...base(),
      clientId: fx.ids.clientB,
      factoryId: secondFactory,
    }).expect(201);
    expect(res.body.factoryId).toBe(secondFactory);
  });

  it('renews a paper: the new file and dates replace the old ones', async () => {
    const doc = (
      await upload(fx.tokens.opsA, {
        ...base(),
        expiryDate: cairoDay(10),
      }).expect(201)
    ).body as Doc;
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/party-documents/${doc.id}`)
      .set('Authorization', `Bearer ${fx.tokens.nafeza}`)
      .field('typeId', String(typeId('السجل التجاري')))
      .field('issueDate', cairoDay(0))
      .field('expiryDate', cairoDay(365))
      .attach('file', PDF, { filename: 'new.pdf' })
      .expect(200);
    expect(res.body.url).not.toBe(doc.url);
    expect(res.body.expiryDate.slice(0, 10)).toBe(cairoDay(365));
    await ctx
      .api(fx.tokens.opsA)
      .delete(`/api/party-documents/${doc.id}`)
      .expect(204);
    await ctx
      .api(fx.tokens.opsA)
      .delete(`/api/party-documents/${doc.id}`)
      .expect(404);
  });

  it('warns the registration of papers that need renewing', async () => {
    await upload(fx.tokens.opsA, {
      ...base(),
      typeId: typeId('بطاقة قيد مستوردين'),
      expiryDate: cairoDay(5),
    }).expect(201);
    const res = await ctx
      .api(fx.tokens.scan)
      .get(`/api/party-documents/warnings?clientId=${fx.ids.clientA}`)
      .expect(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        name: 'بطاقة قيد مستوردين',
        status: 'EXPIRING',
        daysLeft: 5,
      }),
    ]);
  });

  it('alerts the operation team and Nafeza before expiry, once per step', async () => {
    const service = ctx.app.get(NotificationsService);
    await service.documentsDue();
    await service.documentsDue();
    const forOps = await ctx.prisma.inboxItem.findMany({
      where: {
        kind: 'DOCUMENT_EXPIRY',
        user: { employeeId: fx.employees.opsA },
      },
    });
    expect(forOps).toHaveLength(1);
    expect(forOps[0].title).toContain('بطاقة قيد مستوردين');
    const nafezaUser = await ctx.prisma.user.findMany({
      where: { role: { name: 'NAFEZA' } },
      select: { id: true },
    });
    expect(
      await ctx.prisma.inboxItem.count({
        where: {
          kind: 'DOCUMENT_EXPIRY',
          userId: { in: nafezaUser.map((u) => u.id) },
        },
      }),
    ).toBeGreaterThan(0);
    // opsB is not on client A's team
    expect(
      await ctx.prisma.inboxItem.count({
        where: {
          kind: 'DOCUMENT_EXPIRY',
          user: { employeeId: fx.employees.opsB },
        },
      }),
    ).toBe(0);
    expect(
      await ctx.prisma.notification.count({
        where: { kind: 'DOCUMENT_EXPIRY' },
      }),
    ).toBe(1);
  });
});
