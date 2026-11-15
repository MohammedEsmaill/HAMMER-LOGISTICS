import { closeTestContext, createTestContext, TestContext } from './helpers';

interface Report {
  accounts: number;
  problems: { kind: string; title: string }[];
}

describe('Books check (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(() => closeTestContext(ctx));

  const run = async () =>
    (await ctx.api(ctx.ceoToken).post('/api/integrity').expect(200))
      .body as Report;

  it('finds the books in order', async () => {
    const report = await run();
    expect(report.accounts).toBeGreaterThan(0);
    expect(report.problems.filter((p) => p.kind !== 'CLOSED_DAY')).toEqual([]);
  });

  it('flags a balance that does not match its ledger, and keeps the last report', async () => {
    const account = await ctx.prisma.moneyAccount.findFirstOrThrow({
      where: { type: 'CASH', currency: 'EGP' },
    });
    await ctx.prisma.moneyAccount.update({
      where: { id: account.id },
      data: { balance: { increment: 1 } },
    });
    try {
      const report = await run();
      const kinds = report.problems.map((p) => p.kind);
      expect(kinds).toContain('BALANCE');
      expect(report.problems[0].title).toContain(account.name);
      const last = await ctx
        .api(ctx.ceoToken)
        .get('/api/integrity')
        .expect(200);
      expect(last.body.problems.length).toBe(report.problems.length);
    } finally {
      await ctx.prisma.moneyAccount.update({
        where: { id: account.id },
        data: { balance: { decrement: 1 } },
      });
    }
    expect(
      (await run()).problems.filter((p) => p.kind !== 'CLOSED_DAY'),
    ).toEqual([]);
  });

  it('is for the CEO only', async () => {
    const auditor = (
      await ctx.userWithRole('982', 'GENERAL_AUDITOR', 'ACCOUNTS')
    ).token;
    await ctx.api(auditor).get('/api/integrity').expect(403);
  });
});
