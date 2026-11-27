import { closeTestContext, createTestContext, TestContext } from './helpers';

interface Line {
  key: string;
  closing: string;
}

describe('Fixed assets (e2e)', () => {
  let ctx: TestContext;
  let hr: string;
  let treasury: string;
  let auditor: string;
  let cash: number;
  let computer: { id: number; cost: string; depreciation: { monthly: string; monthsDone: number; accumulated: string; netBookValue: string } };
  let laptop: { id: number; transactions: { id: number; version: number }[] };

  const balance = async (id: number) => Number((await ctx.prisma.moneyAccount.findUniqueOrThrow({ where: { id } })).balance);
  const tb = async () =>
    (await ctx.api(ctx.ceoToken).get('/api/finance/gl/trial-balance?currency=EGP').expect(200)).body as { lines: Line[]; totals: { debit: string; credit: string } };
  const closing = (lines: Line[], key: string) => Number(lines.find((l) => l.key === key)?.closing ?? 0);

  beforeAll(async () => {
    ctx = await createTestContext();
    hr = (await ctx.userWithRole('7201', 'HR', 'MANAGEMENT')).token;
    treasury = (await ctx.userWithRole('7202', 'TREASURY_MANAGER', 'ACCOUNTS')).token;
    auditor = (await ctx.userWithRole('7203', 'GENERAL_AUDITOR', 'ACCOUNTS')).token;
    cash = (await ctx.prisma.moneyAccount.findFirstOrThrow({ where: { type: 'CASH', currency: 'EGP' } })).id;
    await ctx.api(ctx.ceoToken).post('/api/finance/other-movements', { accountId: cash, kind: 'FUNDING', amount: 50000, reason: 'تمويل الأصول' }).expect(201);
  });

  afterAll(() => closeTestContext(ctx));

  it('registers a device the company had: in the books from today at its value, 5 years by default', async () => {
    await ctx
      .api(hr)
      .post('/api/finance/assets/existing', { category: 'PRINTER', name: 'طابعة صغيرة', acquiredOn: '2025-01-10', cost: 1500 })
      .expect(400);
    const res = await ctx
      .api(hr)
      .post('/api/finance/assets/existing', { category: 'COMPUTER', name: 'كمبيوتر الحسابات', serialNo: 'SN-1001', acquiredOn: '2024-01-15', cost: 24000 })
      .expect(201);
    computer = res.body;
    expect(res.body).toMatchObject({ acquisition: 'EXISTING', usefulLifeMonths: 60, status: 'ACTIVE' });
    expect(res.body.assetNo).toMatch(/^FA\d{2}-0001$/);
    expect(res.body.depreciation.monthly).toBe('400.00');
    expect(Number(res.body.depreciation.accumulated)).toBe(400 * res.body.depreciation.monthsDone);
    const lines = (await tb()).lines;
    expect(closing(lines, 'FIXED_ASSETS')).toBe(24000);
    expect(closing(lines, 'ACC_DEPRECIATION')).toBe(-Number(res.body.depreciation.accumulated));
    // it entered the books today: what it lost before is in its opening entry, not this year's expense
    expect(closing(lines, 'DEPRECIATION')).toBe(0);
  });

  it('buys a laptop from the cash box: money out, the approval cycle, HR may not', async () => {
    const body = { category: 'LAPTOP', name: 'لابتوب مدير الحسابات', cost: 30000, accountId: cash, supplier: 'شركة الأجهزة', invoiceNo: 'INV-77' };
    await ctx.api(hr).post('/api/finance/assets/purchase', body).expect(403);
    const before = await balance(cash);
    const res = await ctx.api(treasury).post('/api/finance/assets/purchase', body).expect(201);
    laptop = res.body;
    expect(res.body.acquisition).toBe('PURCHASED');
    expect(await balance(cash)).toBe(before - 30000);
    const t = res.body.transactions[0];
    expect(t).toMatchObject({ kind: 'PURCHASE', approvalStatus: 'PENDING', party: 'شركة الأجهزة' });
    await ctx.api(auditor).get(`/api/finance/asset-transactions/${t.id}`).expect(200);
    // its author corrects the price before approval: the asset's cost follows
    await ctx.api(treasury).patch(`/api/finance/asset-transactions/${t.id}`, { version: t.version, amount: 32000 }).expect(200);
    expect(await balance(cash)).toBe(before - 32000);
    const asset = await ctx.api(treasury).get(`/api/finance/assets/${laptop.id}`).expect(200);
    expect(asset.body.cost).toBe('32000');
    const check = await ctx.api(ctx.ceoToken).get('/api/finance/gl/check').expect(200);
    expect(check.body.problems).toEqual([]);
  });

  it('sells a device: the price in, the rest of its value a gain or a loss', async () => {
    await ctx.api(hr).post(`/api/finance/assets/${computer.id}/dispose`, { kind: 'SALE', amount: 5000, accountId: cash, notes: 'بيع' }).expect(403);
    const before = await balance(cash);
    const res = await ctx
      .api(treasury)
      .post(`/api/finance/assets/${computer.id}/dispose`, { kind: 'SALE', amount: 5000, accountId: cash, buyer: 'محل كمبيوتر', notes: 'اتباع مستعمل' })
      .expect(201);
    expect(res.body.status).toBe('SOLD');
    expect(await balance(cash)).toBe(before + 5000);
    const lines = (await tb()).lines;
    const loss = 24000 - Number(res.body.depreciation.accumulated) - 5000;
    expect(closing(lines, 'ASSET_DISPOSAL')).toBeCloseTo(loss, 2);
    await ctx.api(treasury).post(`/api/finance/assets/${computer.id}/dispose`, { kind: 'SCRAP', notes: 'تاني' }).expect(400);
    await ctx.api(hr).patch(`/api/finance/assets/${computer.id}`, { version: res.body.version, name: 'اسم جديد' }).expect(400);
  });

  it('scraps a device: no money, what was left of it a loss', async () => {
    await ctx.api(treasury).post(`/api/finance/assets/${laptop.id}/dispose`, { kind: 'SCRAP', amount: 10, accountId: cash, notes: 'عطلان' }).expect(400);
    const res = await ctx.api(treasury).post(`/api/finance/assets/${laptop.id}/dispose`, { kind: 'SCRAP', notes: 'عطلان' }).expect(201);
    expect(res.body.status).toBe('SCRAPPED');
    const sheet = await ctx.api(ctx.ceoToken).get('/api/finance/gl/balance-sheet?currency=EGP').expect(200);
    expect(sheet.body.balanced).toBe(true);
    const { totals } = await tb();
    expect(totals.debit).toBe(totals.credit);
  });

  it('keeps the register: who holds each device, HR and the moderator edit it', async () => {
    const emp = await ctx.prisma.employee.findFirstOrThrow({ where: { deletedAt: null } });
    const res = await ctx
      .api(hr)
      .post('/api/finance/assets/existing', { category: 'SCANNER', name: 'سكانر الأرشيف', acquiredOn: '2026-01-01', cost: 6000, usefulLifeMonths: 36, custodianEmployeeId: emp.id })
      .expect(201);
    const moderator = (await ctx.userWithRole('7204', 'MODERATOR', 'MANAGEMENT')).token;
    const edited = await ctx.api(moderator).patch(`/api/finance/assets/${res.body.id}`, { version: res.body.version, location: 'الأرشيف', custodianEmployeeId: null }).expect(200);
    expect(edited.body).toMatchObject({ location: 'الأرشيف', custodianEmployeeId: null });
    const list = await ctx.api(hr).get('/api/finance/assets?status=ACTIVE').expect(200);
    expect(list.body.items.map((a: { id: number }) => a.id)).toContain(res.body.id);
    expect(list.body.totals.count).toBe(list.body.items.length);
    // the books read it (the general auditor); others do not
    await ctx.api(auditor).get('/api/finance/assets').expect(200);
    const other = (await ctx.userWithRole('7205', 'CLIENT_ACCOUNTANT', 'ACCOUNTS')).token;
    await ctx.api(other).get('/api/finance/assets').expect(403);
  });
});
