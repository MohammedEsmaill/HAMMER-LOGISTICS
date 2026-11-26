import { closeTestContext, createTestContext, TestContext } from './helpers';

interface Line {
  key: string;
  code: string;
  parent: string | null;
  group: boolean;
  opening: string;
  debit: string;
  credit: string;
  closing: string;
}

describe('General ledger (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(() => closeTestContext(ctx));

  it('builds the chart with every cash box, party and expense category', async () => {
    const res = await ctx.api(ctx.ceoToken).get('/api/finance/gl/accounts').expect(200);
    const keys = (res.body as { key: string }[]).map((a) => a.key);
    expect(keys).toEqual(expect.arrayContaining(['CUSTODY', 'RECEIVABLE', 'CLEARANCE_REVENUE', 'EXP:PETTY']));
    const accounts = await ctx.prisma.moneyAccount.findMany();
    for (const a of accounts) expect(keys).toContain(`MA:${a.id}`);
  });

  it('balances in each currency, and each cash account stands at its balance', async () => {
    for (const currency of ['EGP', 'USD'] as const) {
      const res = await ctx.api(ctx.ceoToken).get(`/api/finance/gl/trial-balance?currency=${currency}`).expect(200);
      const { totals, lines } = res.body as { totals: Record<string, string>; lines: Line[] };
      expect(totals.debit).toBe(totals.credit);
      expect(totals.closingDebit).toBe(totals.closingCredit);
      const accounts = await ctx.prisma.moneyAccount.findMany({ where: { currency, ownership: 'COMPANY' } });
      for (const a of accounts) {
        const line = lines.find((l) => l.key === `MA:${a.id}`);
        expect(Number(line?.closing ?? 0)).toBeCloseTo(Number(a.balance), 2);
      }
    }
    const check = await ctx.api(ctx.ceoToken).get('/api/finance/gl/check').expect(200);
    expect(check.body.problems).toEqual([]);
  });

  it('splits a period into opening, movement and closing', async () => {
    const all = (await ctx.api(ctx.ceoToken).get('/api/finance/gl/trial-balance?currency=EGP').expect(200)).body as {
      lines: Line[];
    };
    const from = new Date().toISOString().slice(0, 10);
    const part = (await ctx.api(ctx.ceoToken).get(`/api/finance/gl/trial-balance?currency=EGP&from=${from}`).expect(200))
      .body as { lines: Line[] };
    for (const l of part.lines) {
      const whole = all.lines.find((x) => x.key === l.key);
      expect(Number(l.closing)).toBeCloseTo(Number(whole?.closing ?? 0), 2);
    }
  });

  it("shows an account's lines with a running balance ending at its closing", async () => {
    const account = await ctx.prisma.moneyAccount.findFirstOrThrow({ where: { currency: 'EGP', ownership: 'COMPANY' } });
    const res = await ctx
      .api(ctx.ceoToken)
      .get(`/api/finance/gl/ledger?account=MA:${account.id}&currency=EGP`)
      .expect(200);
    expect(Number(res.body.closing)).toBeCloseTo(Number(account.balance), 2);
    if (res.body.lines.length) expect(res.body.lines.at(-1).balance).toBe(res.body.closing);
    await ctx.api(ctx.ceoToken).get('/api/finance/gl/ledger?account=NOPE&currency=EGP').expect(404);
  });

  it('makes the income statement: revenues less expenses, as the trial balance says', async () => {
    const res = await ctx.api(ctx.ceoToken).get('/api/finance/gl/income-statement?currency=EGP').expect(200);
    const tb = (await ctx.api(ctx.ceoToken).get('/api/finance/gl/trial-balance?currency=EGP').expect(200)).body as { lines: Line[] };
    const top = (code: string) => Number(tb.lines.find((l) => l.code === code)?.closing ?? 0);
    expect(Number(res.body.revenues.total)).toBeCloseTo(top('4'), 2);
    expect(Number(res.body.expenses.total)).toBeCloseTo(top('5'), 2);
    expect(Number(res.body.net)).toBeCloseTo(top('4') - top('5'), 2);
  });

  it('balances the balance sheet in each currency: assets = liabilities + equity + profit', async () => {
    for (const currency of ['EGP', 'USD'] as const) {
      const res = await ctx.api(ctx.ceoToken).get(`/api/finance/gl/balance-sheet?currency=${currency}`).expect(200);
      expect(res.body.balanced).toBe(true);
      expect(res.body.assets.total).toBe(res.body.totalLiabilitiesAndEquity);
    }
    const past = await ctx.api(ctx.ceoToken).get('/api/finance/gl/balance-sheet?currency=EGP&asOf=2000-01-01').expect(200);
    expect(past.body.assets.total).toBe('0.00');
  });

  it('reports the VAT of the live invoices by rate, matching the VAT account', async () => {
    const res = await ctx.api(ctx.ceoToken).get('/api/finance/gl/vat?currency=EGP').expect(200);
    const live = await ctx.prisma.invoice.findMany({ where: { voidedAt: null, currency: 'EGP', type: { not: 'STATEMENT' } } });
    expect(res.body.totals.count).toBe(live.length);
    const vat = live.reduce((s, i) => s + Number(i.vatAmount), 0);
    expect(Number(res.body.totals.vat)).toBeCloseTo(vat, 2);
    const tb = (await ctx.api(ctx.ceoToken).get('/api/finance/gl/trial-balance?currency=EGP').expect(200)).body as { lines: Line[] };
    expect(Number(tb.lines.find((l) => l.key === 'VAT_PAYABLE')?.closing ?? 0)).toBeCloseTo(vat, 2);
    for (const r of res.body.rates) expect(r.count).toBeGreaterThan(0);
  });

  it('is for the accounts manager and the general auditor', async () => {
    const auditor = (await ctx.userWithRole('983', 'GENERAL_AUDITOR', 'ACCOUNTS')).token;
    await ctx.api(auditor).get('/api/finance/gl/trial-balance?currency=EGP').expect(200);
    const accountant = (await ctx.userWithRole('984', 'CLIENT_ACCOUNTANT', 'ACCOUNTS')).token;
    await ctx.api(accountant).get('/api/finance/gl/trial-balance?currency=EGP').expect(403);
  });
});
