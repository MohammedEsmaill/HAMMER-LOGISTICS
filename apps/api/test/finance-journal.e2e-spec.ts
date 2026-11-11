import { closeTestContext, createTestContext, TestContext } from './helpers';

interface Row {
  type: string;
  id: number;
  ref: string;
  flow: string;
  amount: string;
  counterparty: string | null;
  description: string;
}

describe('Finance: journal and reports (e2e)', () => {
  let ctx: TestContext;
  let treasury: string;
  let auditor: string;
  let manager: string;
  let relations: string;
  let accountant: string;
  let scan: string;
  let hr: string;
  let cashEgp: number;
  let advanceId: number;
  let fundingId: number;
  // a range around every date the operations may carry (they are dated in Cairo)
  const period = 'from=2000-01-01&to=2099-12-31';

  beforeAll(async () => {
    ctx = await createTestContext();
    treasury = (await ctx.userWithRole('941', 'TREASURY_MANAGER', 'ACCOUNTS'))
      .token;
    auditor = (await ctx.userWithRole('942', 'GENERAL_AUDITOR', 'ACCOUNTS'))
      .token;
    manager = (await ctx.userWithRole('943', 'ACCOUNTS_MANAGER', 'ACCOUNTS'))
      .token;
    relations = (
      await ctx.userWithRole('944', 'FINANCIAL_RELATIONS', 'ACCOUNTS')
    ).token;
    accountant = (await ctx.userWithRole('945', 'ACCOUNTANT', 'ACCOUNTS'))
      .token;
    scan = (await ctx.userWithRole('946', 'SCAN')).token;
    hr = (await ctx.userWithRole('947', 'HR', 'MANAGEMENT')).token;
    cashEgp = (await ctx.prisma.moneyAccount.findFirstOrThrow({
      where: { type: 'CASH', currency: 'EGP' },
    }))!.id;

    fundingId = (
      await ctx
        .api(treasury)
        .post('/api/finance/other-movements', {
          accountId: cashEgp,
          kind: 'FUNDING',
          amount: 50000,
          reason: 'تمويل اليوميات 941',
        })
        .expect(201)
    ).body.id;
    const employee = await ctx.prisma.employee.findFirstOrThrow({
      where: { code: '942' },
    });
    advanceId = (
      await ctx
        .api(treasury)
        .post('/api/finance/advances', {
          employeeId: employee.id,
          amount: 750,
          accountId: cashEgp,
        })
        .expect(201)
    ).body.id;
  });

  afterAll(() => closeTestContext(ctx));

  const journal = (token: string, query = '') =>
    ctx.api(token).get(`/api/finance/journal?pageSize=200${query}`);

  it('the treasury manager, auditor, accounts manager and financial relations see it', async () => {
    for (const token of [treasury, auditor, manager, relations, ctx.ceoToken]) {
      await journal(token).expect(200);
    }
  });

  it('the accountant, scan and HR do not', async () => {
    for (const token of [accountant, scan, hr]) {
      await journal(token).expect(403);
    }
  });

  it('lists every operation once, with where the money went', async () => {
    const res = await journal(treasury, '&types=OTHER').expect(200);
    const row = (res.body.items as Row[]).find((r) => r.id === fundingId)!;
    expect(row).toMatchObject({
      ref: `OM-${fundingId}`,
      flow: 'IN',
      amount: '50000.00',
    });
    expect(row.description).toContain('تمويل');
    expect(
      res.body.totals.find((t: { currency: string }) => t.currency === 'EGP')
        .in,
    ).toBeDefined();
  });

  it('pages in the database', async () => {
    const res = await ctx
      .api(treasury)
      .get('/api/finance/journal?pageSize=1&page=1')
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });

  it('filters by search text and by amount', async () => {
    const byText = await journal(
      treasury,
      `&search=${encodeURIComponent('اليوميات 941')}`,
    ).expect(200);
    expect((byText.body.items as Row[]).map((r) => r.id)).toEqual([fundingId]);
    const byAmount = await journal(
      treasury,
      '&search=50000&types=OTHER',
    ).expect(200);
    expect((byAmount.body.items as Row[]).some((r) => r.id === fundingId)).toBe(
      true,
    );
  });

  it('shows advances to who may see salaries only', async () => {
    const seen = await journal(treasury, '&types=ADVANCE').expect(200);
    expect((seen.body.items as Row[]).some((r) => r.id === advanceId)).toBe(
      true,
    );
    const hidden = await journal(relations, '&types=ADVANCE').expect(200);
    expect(hidden.body.items).toHaveLength(0);
  });

  it('refuses a report without a period', async () => {
    await ctx
      .api(auditor)
      .get('/api/finance/journal/reports/journal')
      .expect(400);
    await ctx
      .api(auditor)
      .get(`/api/finance/journal/reports/nothing?${period}`)
      .expect(404);
  });

  it('journal report: totals by type, then the operations', async () => {
    const res = await ctx
      .api(auditor)
      .get(`/api/finance/journal/reports/journal?${period}`)
      .expect(200);
    const other = res.body.summary.byType.find(
      (t: { type: string; currency: string }) =>
        t.type === 'OTHER' && t.currency === 'EGP',
    );
    expect(Number(other.in)).toBeGreaterThanOrEqual(50000);
    expect((res.body.rows as Row[]).some((r) => r.id === fundingId)).toBe(true);
  });

  it('accounts report: opening + in − out = closing, and a running balance', async () => {
    const res = await ctx
      .api(relations)
      .get(
        `/api/finance/journal/reports/accounts?${period}&accountId=${cashEgp}`,
      )
      .expect(200);
    const [a] = res.body.accounts;
    expect(Number(a.closing)).toBeCloseTo(
      Number(a.opening) + Number(a.in) - Number(a.out),
      2,
    );
    const last = a.lines[a.lines.length - 1];
    expect(last.balance).toBe(a.closing);
    const box = await ctx.prisma.moneyAccount.findUniqueOrThrow({
      where: { id: cashEgp },
    });
    expect(Number(a.closing)).toBe(Number(box.balance));
    // relations may not see whose advance it was
    const advance = a.lines.find(
      (l: { source: string }) => l.source === 'ADVANCE',
    );
    expect(advance.description).toBe('مرتبات وسلف');
    expect(advance.counterparty).toBeNull();
  });
});

describe('Clients screen (e2e)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(() => closeTestContext(ctx));

  it('SCAN picks clients from the short list but cannot open the clients screen', async () => {
    const scan = (await ctx.userWithRole('948', 'SCAN')).token;
    await ctx.api(scan).get('/api/clients/options').expect(200);
    await ctx.api(scan).get('/api/clients').expect(403);
  });

  it('HR manages clients', async () => {
    const hr = (await ctx.userWithRole('949', 'HR', 'MANAGEMENT')).token;
    await ctx.api(hr).get('/api/clients').expect(200);
  });
});
