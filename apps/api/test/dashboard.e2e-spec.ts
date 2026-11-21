import { closeTestContext, createTestContext, TestContext } from './helpers';

describe('Dashboard (e2e)', () => {
  let ctx: TestContext;
  let treasury: string;
  let auditor: string;
  let manager: string;
  let accountant: string;
  let scan: string;
  let hr: string;

  const keys = async (token: string) => {
    const res = await ctx.api(token).get('/api/dashboard').expect(200);
    return {
      body: res.body,
      kpis: (res.body.kpis as { key: string }[]).map((k) => k.key),
    };
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    treasury = (await ctx.userWithRole('841', 'TREASURY_MANAGER', 'ACCOUNTS'))
      .token;
    auditor = (await ctx.userWithRole('842', 'GENERAL_AUDITOR', 'ACCOUNTS'))
      .token;
    manager = (await ctx.userWithRole('843', 'ACCOUNTS_MANAGER', 'ACCOUNTS'))
      .token;
    accountant = (await ctx.userWithRole('844', 'ACCOUNTANT', 'ACCOUNTS'))
      .token;
    scan = (await ctx.userWithRole('845', 'SCAN')).token;
    hr = (await ctx.userWithRole('846', 'HR', 'MANAGEMENT')).token;
  });

  afterAll(() => closeTestContext(ctx));

  it('shows each user only the cards of their own work', async () => {
    const ceo = await keys(ctx.ceoToken);
    expect(ceo.kpis).toEqual(
      expect.arrayContaining([
        'shipments',
        'approvals',
        'custodies',
        'balances',
        'receivables',
        'fees',
        'documents',
      ]),
    );
    expect(ceo.body.treasury).toHaveLength(14);

    const s = await keys(scan);
    expect(s.kpis).toEqual(['shipments']);
    expect(s.body.approvals).toBeUndefined();
    expect(s.body.treasury).toBeUndefined();

    const a = await keys(accountant);
    expect(a.kpis).toContain('custodies');
    expect(a.kpis).not.toContain('balances');
    expect(a.body.custodiesToSettle).toBeDefined();

    const h = await keys(hr);
    expect(h.kpis).not.toContain('approvals');
    expect(h.body.treasury).toBeUndefined();
  });

  it('approves several documents at once from the queue', async () => {
    const cash = await ctx.prisma.moneyAccount.findFirstOrThrow({
      where: { type: 'CASH', currency: 'EGP' },
    });
    const ids: number[] = [];
    for (const amount of [11, 12]) {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/other-movements', {
          accountId: cash.id,
          kind: 'FUNDING',
          amount,
          reason: 'لوحة التحكم',
        })
        .expect(201);
      ids.push(res.body.id);
    }
    const queue = (await keys(auditor)).body.approvals as {
      action: string;
    }[];
    // the queue holds what waits for the auditor's step: reviews
    expect(queue.length).toBeGreaterThan(0);
    expect(queue.every((q) => q.action === 'review')).toBe(true);
    const fresh = await ctx.prisma.otherMovement.findMany({
      where: { id: { in: ids } },
    });
    const reviewed = await ctx
      .api(auditor)
      .post('/api/finance/approvals/bulk', {
        items: fresh.map((d) => ({
          type: 'OTHER',
          id: d.id,
          version: d.version,
        })),
      })
      .expect(201);
    expect(reviewed.body).toMatchObject({ done: 2, failed: 0 });

    // a stale version fails alone; the other one goes through
    const docs = await ctx.prisma.otherMovement.findMany({
      where: { id: { in: ids } },
      orderBy: { id: 'asc' },
    });
    const approved = await ctx
      .api(manager)
      .post('/api/finance/approvals/bulk', {
        items: [
          { type: 'OTHER', id: docs[0].id, version: docs[0].version },
          { type: 'OTHER', id: docs[1].id, version: docs[1].version - 1 },
        ],
      })
      .expect(201);
    expect(approved.body).toMatchObject({ done: 1, failed: 1 });
    const after = await ctx.prisma.otherMovement.findUniqueOrThrow({
      where: { id: docs[0].id },
    });
    expect(after.approvalStatus).toBe('APPROVED');
  });

  it('lists only what waits for my own step on the approvals screen', async () => {
    const cash = await ctx.prisma.moneyAccount.findFirstOrThrow({
      where: { type: 'CASH', currency: 'EGP' },
    });
    const { body: doc } = await ctx
      .api(treasury)
      .post('/api/finance/other-movements', {
        accountId: cash.id,
        kind: 'FUNDING',
        amount: 13,
        reason: 'دوري',
      })
      .expect(201);
    const waitingFor = async (token: string) =>
      (
        await ctx
          .api(token)
          .get('/api/finance/approvals')
          .query({ waiting: 'true', type: 'OTHER', pageSize: 100 })
          .expect(200)
      ).body as {
        total: number;
        items: { id: number; approvalStatus: string; canAct: boolean }[];
      };

    // a fresh document waits for the auditor's review, not the manager's approval
    const forAuditor = await waitingFor(auditor);
    expect(forAuditor.items.map((i) => i.id)).toContain(doc.id);
    expect(
      forAuditor.items.every((i) => i.approvalStatus === 'PENDING' && i.canAct),
    ).toBe(true);
    expect((await waitingFor(manager)).items.map((i) => i.id)).not.toContain(
      doc.id,
    );
    // who recorded it, with no approval step of their own, has nothing waiting
    expect((await waitingFor(treasury)).total).toBe(0);

    const fresh = await ctx.prisma.otherMovement.findUniqueOrThrow({
      where: { id: doc.id },
    });
    await ctx
      .api(auditor)
      .post(`/api/finance/approvals/OTHER/${doc.id}/review`, {
        version: fresh.version,
      })
      .expect(201);
    expect((await waitingFor(auditor)).items.map((i) => i.id)).not.toContain(
      doc.id,
    );
    expect((await waitingFor(manager)).items.map((i) => i.id)).toContain(
      doc.id,
    );
  });

  it('only approvers move documents in bulk', async () => {
    await ctx
      .api(scan)
      .post('/api/finance/approvals/bulk', {
        items: [{ type: 'OTHER', id: 1, version: 0 }],
      })
      .expect(403);
  });
});
