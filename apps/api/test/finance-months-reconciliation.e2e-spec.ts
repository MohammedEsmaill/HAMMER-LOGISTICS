import { closeTestContext, createTestContext, TestContext } from './helpers';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('Closing the months and reconciling the banks (e2e)', () => {
  let ctx: TestContext;
  let manager: string;
  let treasury: string;
  let accountant: string;
  let bank: number;
  let current: string;
  let prev: string;
  let prevDay: (n: number) => string;

  beforeAll(async () => {
    ctx = await createTestContext();
    manager = (await ctx.userWithRole('7101', 'ACCOUNTS_MANAGER', 'ACCOUNTS')).token;
    treasury = (await ctx.userWithRole('7102', 'TREASURY_MANAGER', 'ACCOUNTS')).token;
    accountant = (await ctx.userWithRole('7103', 'ACCOUNTANT', 'ACCOUNTS')).token;
    bank = (
      await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/accounts', { name: 'بنك التسوية', bankName: 'CIB', accountNumber: 'EG7700', currency: 'EGP', openingBalance: 100000 })
        .expect(201)
    ).body.id;
    const now = new Date();
    current = iso(now).slice(0, 7);
    const p = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    prev = iso(p).slice(0, 7);
    prevDay = (n: number) => `${prev}-${String(n).padStart(2, '0')}`;
  });

  afterAll(() => closeTestContext(ctx));

  const charge = (token: string, amount: number, date: string) =>
    ctx.api(token).post('/api/finance/other-movements', { accountId: bank, kind: 'BANK_CHARGES', amount, reason: 'مصاريف بنكية', movementDate: date });
  /** The CEO records it today and moves it back into the past month (only the CEO edits a closed day). */
  const backdated = async (amount: number, date: string) => {
    const res = await ctx.api(ctx.ceoToken).post('/api/finance/other-movements', { accountId: bank, kind: 'BANK_CHARGES', amount, reason: 'مصاريف بنكية' }).expect(201);
    await ctx.api(ctx.ceoToken).patch(`/api/finance/other-movements/${res.body.id}`, { version: res.body.version, movementDate: date }).expect(200);
  };
  const approveAll = () => ctx.prisma.otherMovement.updateMany({ where: { accountId: bank }, data: { approvalStatus: 'APPROVED' } });

  describe('months', () => {
    it('will not close a month that has not ended', async () => {
      const res = await ctx.api(manager).get(`/api/finance/months/${current}/check`).expect(200);
      expect(res.body.blockers.map((b: { kind: string }) => b.kind)).toContain('NOT_ENDED');
      await ctx.api(manager).post(`/api/finance/months/${current}/close`).expect(400);
    });

    it('will not close while something in it waits for approval; open custodies only warn', async () => {
      await backdated(100, prevDay(15));
      const res = await ctx.api(manager).get(`/api/finance/months/${prev}/check`).expect(200);
      expect(res.body.blockers.map((b: { kind: string }) => b.kind)).toEqual(['PENDING']);
      await approveAll();
      const ok = await ctx.api(manager).get(`/api/finance/months/${prev}/check`).expect(200);
      expect(ok.body.blockers).toEqual([]);
      expect(ok.body.warnings.map((w: { kind: string }) => w.kind)).toContain('UNRECONCILED');
    });

    it('closes: the figures are kept and the profit becomes retained earnings', async () => {
      await ctx.api(treasury).post(`/api/finance/months/${prev}/close`).expect(403);
      await ctx.api(manager).post(`/api/finance/months/${prev}/close`).expect(201);
      await ctx.api(manager).post(`/api/finance/months/${prev}/close`).expect(400);
      const list = await ctx.api(manager).get('/api/finance/months').expect(200);
      const row = list.body.find((m: { month: string }) => m.month === prev);
      expect(row.status).toBe('CLOSED');
      expect(row.figures.EGP.net).toBe('-100.00');
      const bs = await ctx.api(ctx.ceoToken).get('/api/finance/gl/balance-sheet?currency=EGP').expect(200);
      expect(bs.body.balanced).toBe(true);
      const retained = bs.body.equity.lines.find((l: { key: string }) => l.key === 'RETAINED');
      expect(retained.amount).toBe('-100.00');
    });

    it('locks the month for everyone but the CEO, whose changes are flagged', async () => {
      const res = await charge(treasury, 10, prevDay(10)).expect(400);
      expect(res.body.message).toContain('اتقفل');
      await backdated(50, prevDay(16));
      await approveAll();
      const report = await ctx.api(ctx.ceoToken).post('/api/integrity').expect(200);
      expect(report.body.problems.map((p: { kind: string }) => p.kind)).toContain('CLOSED_MONTH');
    });

    it('the CEO alone reopens it, with a reason', async () => {
      await ctx.api(manager).post(`/api/finance/months/${prev}/reopen`, { reason: 'تصحيح مصاريف' }).expect(403);
      await ctx.api(ctx.ceoToken).post(`/api/finance/months/${prev}/reopen`, {}).expect(400);
      await ctx.api(ctx.ceoToken).post(`/api/finance/months/${prev}/reopen`, { reason: 'تصحيح مصاريف' }).expect(201);
      const report = await ctx.api(ctx.ceoToken).post('/api/integrity').expect(200);
      expect(report.body.problems.map((p: { kind: string }) => p.kind)).not.toContain('CLOSED_MONTH');
    });
  });

  describe('bank reconciliation', () => {
    let id: number;

    it('lists every line not yet shown in the bank, with our balance', async () => {
      const cash = (await ctx.prisma.moneyAccount.findFirstOrThrow({ where: { type: 'CASH', currency: 'EGP' } })).id;
      await ctx.api(ctx.ceoToken).post('/api/finance/other-movements', { accountId: cash, kind: 'FUNDING', amount: 5000, reason: 'تمويل' }).expect(201);
      await ctx.api(treasury).post('/api/finance/transfers', { fromAccountId: cash, toAccountId: bank, amount: 5000 }).expect(201);
      const res = await ctx.api(accountant).get(`/api/finance/reconciliations/draft?accountId=${bank}`).expect(200);
      expect(res.body.systemBalance).toBe(String((100000 + 5000 - 150).toFixed(2)));
      const amounts = res.body.lines.map((l: { amount: string }) => l.amount).sort();
      expect(amounts).toEqual(['-100.00', '-50.00', '5000.00'].sort());
      await ctx.api((await ctx.userWithRole('7104', 'CLIENT_ACCOUNTANT', 'ACCOUNTS')).token).get(`/api/finance/reconciliations/draft?accountId=${bank}`).expect(403);
    });

    it('needs a note to keep a difference; matches once the statement agrees', async () => {
      const draft = (await ctx.api(accountant).get(`/api/finance/reconciliations/draft?accountId=${bank}`).expect(200)).body;
      const charges = draft.lines.filter((l: { amount: string }) => l.amount.startsWith('-')).map((l: { key: string }) => l.key);
      const body = { accountId: bank, from: draft.from, to: draft.to, clearedKeys: charges };
      await ctx.api(accountant).post('/api/finance/reconciliations', { ...body, statementBalance: 99800 }).expect(400);
      const saved = await ctx.api(accountant).post('/api/finance/reconciliations', { ...body, statementBalance: 99800, note: 'بنراجع مع البنك' }).expect(201);
      expect(saved.body.status).toBe('DIFFERENCE');
      expect(saved.body.difference).toBe('-50.00');
      id = saved.body.id;
      // the deposit of 5000 is in transit: expected in the bank = 104,850 − 5,000
      const fixed = await ctx.api(accountant).put(`/api/finance/reconciliations/${id}`, { version: 0, statementBalance: 99850, clearedKeys: charges }).expect(200);
      expect(fixed.body.status).toBe('MATCHED');
      const row = await ctx.prisma.bankReconciliation.findUniqueOrThrow({ where: { id } });
      expect(row.outstandingIn.toFixed(2)).toBe('5000.00');
      await ctx.api(accountant).put(`/api/finance/reconciliations/${id}`, { version: 1, statementBalance: 99850, clearedKeys: charges }).expect(403);
      await ctx.api(accountant).post('/api/finance/reconciliations', { ...body, statementBalance: 1 , note: 'x'}).expect(400);
    });

    it('carries what the bank did not show yet to the next one', async () => {
      const res = await ctx.api(accountant).get(`/api/finance/reconciliations/draft?accountId=${bank}`).expect(200);
      expect(res.body.lines.map((l: { amount: string }) => l.amount)).toEqual(['5000.00']);
      expect(res.body.lines[0].prior).toBe(true);
      expect(res.body.last.status).toBe('MATCHED');
    });

    it('records from the screen what the bank shows and our books lack', async () => {
      const res = await ctx.api(accountant).post('/api/finance/reconciliations/record', { accountId: bank, kind: 'BANK_CHARGES', amount: 25, reason: 'مصاريف إمساك حساب' }).expect(201);
      const om = await ctx.prisma.otherMovement.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(om.kind).toBe('BANK_CHARGES');
      expect(om.reason).toContain('تسوية البنك');
    });

    it('the CEO alone removes the latest one', async () => {
      await ctx.api(accountant).delete(`/api/finance/reconciliations/${id}`).expect(403);
      await ctx.api(ctx.ceoToken).delete(`/api/finance/reconciliations/${id}`).expect(200);
      const list = await ctx.api(manager).get(`/api/finance/reconciliations?accountId=${bank}`).expect(200);
      expect(list.body).toEqual([]);
    });
  });
});
