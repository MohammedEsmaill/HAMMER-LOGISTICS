import { closeTestContext, createTestContext, TestContext } from './helpers';

describe('Finance: treasury, transfers, approvals (e2e)', () => {
  let ctx: TestContext;
  let treasury: string;
  let treasuryUserId: number;
  let accountant: string;
  let manager: string;
  let auditor: string;
  let relations: string;
  let scan: string;
  let cashEgp: number;
  let cashUsd: number;
  let bankEgp: number;
  let bankUsd: number;

  const balance = async (id: number) =>
    Number(
      (await ctx.prisma.moneyAccount.findUniqueOrThrow({ where: { id } }))
        .balance,
    );

  beforeAll(async () => {
    ctx = await createTestContext();
    const t = await ctx.userWithRole('901', 'TREASURY_MANAGER', 'ACCOUNTS');
    treasury = t.token;
    treasuryUserId = t.userId;
    accountant = (await ctx.userWithRole('902', 'ACCOUNTANT', 'ACCOUNTS'))
      .token;
    manager = (await ctx.userWithRole('903', 'ACCOUNTS_MANAGER', 'ACCOUNTS'))
      .token;
    auditor = (await ctx.userWithRole('904', 'GENERAL_AUDITOR', 'ACCOUNTS'))
      .token;
    relations = (
      await ctx.userWithRole('905', 'FINANCIAL_RELATIONS', 'ACCOUNTS')
    ).token;
    scan = (await ctx.userWithRole('906', 'SCAN')).token;
    const boxes = await ctx.prisma.moneyAccount.findMany({
      where: { type: 'CASH' },
    });
    cashEgp = boxes.find((b) => b.currency === 'EGP')!.id;
    cashUsd = boxes.find((b) => b.currency === 'USD')!.id;
  });

  afterAll(() => closeTestContext(ctx));

  describe('accounts', () => {
    it('seeds one cash box per currency', async () => {
      const res = await ctx
        .api(treasury)
        .get('/api/finance/accounts')
        .expect(200);
      const cash = res.body.filter((a: { type: string }) => a.type === 'CASH');
      expect(cash.map((a: { currency: string }) => a.currency).sort()).toEqual([
        'EGP',
        'USD',
      ]);
    });

    it('only the CEO adds bank accounts', async () => {
      const body = {
        name: 'البنك الأهلي جنيه',
        bankName: 'البنك الأهلي المصري',
        accountNumber: '1234567890',
        currency: 'EGP',
        openingBalance: 100000,
      };
      await ctx.api(treasury).post('/api/finance/accounts', body).expect(403);
      const res = await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/accounts', body)
        .expect(201);
      bankEgp = res.body.id;
      expect(res.body.balance).toBe('100000');
      bankUsd = (
        await ctx
          .api(ctx.ceoToken)
          .post('/api/finance/accounts', {
            ...body,
            name: 'CIB دولار',
            bankName: 'CIB',
            accountNumber: 'EG380019000500000000263180002',
            currency: 'USD',
            openingBalance: 5000,
          })
          .expect(201)
      ).body.id;
    });

    it('refuses the same bank account twice', async () => {
      const res = await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/accounts', {
          name: 'مكرر',
          bankName: 'البنك الأهلي المصري',
          accountNumber: '1234567890',
          currency: 'EGP',
          openingBalance: 0,
        })
        .expect(409);
      expect(res.body.message).toBe('الحساب البنكي ده متسجل قبل كده');
    });

    it('hides balances from users without finance permissions', async () => {
      await ctx.api(scan).get('/api/finance/accounts').expect(403);
      await ctx.api(relations).get('/api/finance/accounts').expect(200);
    });
  });

  describe('transfers', () => {
    let withdrawalId: number;
    // the cash boxes are shared with the other test files: work from their balance now
    let cashStart: number;

    it('withdraws by cheque from the bank into the cash box', async () => {
      cashStart = await balance(cashEgp);
      const res = await ctx
        .api(treasury)
        .post('/api/finance/transfers', {
          fromAccountId: bankEgp,
          toAccountId: cashEgp,
          amount: 20000,
          chequeNo: 'chq-1001',
        })
        .expect(201);
      withdrawalId = res.body.id;
      expect(res.body.chequeNo).toBe('CHQ-1001');
      expect(res.body.approvalStatus).toBe('PENDING');
      expect(await balance(bankEgp)).toBe(80000);
      expect(await balance(cashEgp)).toBe(cashStart + 20000);
    });

    it('needs a cheque number when money leaves a bank', async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/transfers', {
          fromAccountId: bankEgp,
          toAccountId: cashEgp,
          amount: 10,
        })
        .expect(400);
      expect(res.body.message).toContain('رقم الشيك');
    });

    it('never changes currency', async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/transfers', {
          fromAccountId: cashEgp,
          toAccountId: bankUsd,
          amount: 10,
        })
        .expect(400);
      expect(res.body.message).toContain('مفيش تغيير عملة');
    });

    it('refuses a balance below zero and says what is available', async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/transfers', {
          fromAccountId: cashEgp,
          toAccountId: bankEgp,
          amount: cashStart + 25000,
        })
        .expect(400);
      const available = (cashStart + 20000).toLocaleString('en-US', {
        minimumFractionDigits: 2,
      });
      expect(res.body.message).toContain(`المتاح ${available}`);
      expect(await balance(cashEgp)).toBe(cashStart + 20000);
    });

    it('refuses a future date', async () => {
      const future = new Date(Date.now() + 3 * 86400000)
        .toISOString()
        .slice(0, 10);
      await ctx
        .api(treasury)
        .post('/api/finance/transfers', {
          fromAccountId: cashEgp,
          toAccountId: bankEgp,
          amount: 5,
          transferDate: future,
        })
        .expect(400);
    });

    it('an amount edit reverses the old lines and posts new ones', async () => {
      const t = await ctx.prisma.transfer.findUniqueOrThrow({
        where: { id: withdrawalId },
      });
      const res = await ctx
        .api(treasury)
        .patch(`/api/finance/transfers/${withdrawalId}`, {
          version: t.version,
          amount: 15000,
        })
        .expect(200);
      expect(res.body.amount).toBe('15000');
      expect(await balance(bankEgp)).toBe(85000);
      expect(await balance(cashEgp)).toBe(cashStart + 15000);
      const lines = await ctx.prisma.moneyMovement.findMany({
        where: { transferId: withdrawalId },
      });
      // 2 original + 2 reversals + 2 corrected
      expect(lines).toHaveLength(6);
      expect(lines.filter((l) => l.reversalOfId !== null)).toHaveLength(2);
    });

    it('refuses a stale version', async () => {
      await ctx
        .api(treasury)
        .patch(`/api/finance/transfers/${withdrawalId}`, {
          version: 0,
          amount: 100,
        })
        .expect(409);
    });

    it('only the author edits before approval', async () => {
      const t = await ctx.prisma.transfer.findUniqueOrThrow({
        where: { id: withdrawalId },
      });
      // the accountant may read but not record or edit
      await ctx
        .api(accountant)
        .patch(`/api/finance/transfers/${withdrawalId}`, {
          version: t.version,
          notes: 'x',
        })
        .expect(403);
    });

    it('keeps the ledger append-only in the database', async () => {
      await expect(
        ctx.prisma.moneyMovement.deleteMany({
          where: { transferId: withdrawalId },
        }),
      ).rejects.toThrow();
    });

    it('shows the account statement with running balances', async () => {
      const res = await ctx
        .api(treasury)
        .get(`/api/finance/accounts/${bankEgp}/movements`)
        .expect(200);
      // opening 100000: out 20000, reversal in 20000, out 15000
      expect(res.body.items[0].balanceAfter).toBe('85000');
      expect(res.body.totals).toEqual({ in: '20000', out: '35000' });
    });
  });

  describe('other movements', () => {
    it('records funding from management into the cash box', async () => {
      const start = await balance(cashUsd);
      await ctx
        .api(treasury)
        .post('/api/finance/other-movements', {
          accountId: cashUsd,
          kind: 'FUNDING',
          amount: 1200.5,
          reason: 'تمويل من الإدارة',
        })
        .expect(201);
      expect(await balance(cashUsd)).toBe(start + 1200.5);
    });

    it('bank charges go out of a bank account only', async () => {
      await ctx
        .api(treasury)
        .post('/api/finance/other-movements', {
          accountId: cashEgp,
          kind: 'BANK_CHARGES',
          amount: 50,
          reason: 'مصاريف بنكية',
        })
        .expect(400);
      await ctx
        .api(treasury)
        .post('/api/finance/other-movements', {
          accountId: bankEgp,
          kind: 'BANK_CHARGES',
          amount: 50,
          reason: 'مصاريف بنكية',
        })
        .expect(201);
      expect(await balance(bankEgp)).toBe(84950);
    });

    it('an adjustment needs a direction and a reason', async () => {
      await ctx
        .api(treasury)
        .post('/api/finance/other-movements', {
          accountId: cashEgp,
          kind: 'ADJUSTMENT',
          amount: 10,
          reason: 'فرق جرد',
        })
        .expect(400);
      await ctx
        .api(treasury)
        .post('/api/finance/other-movements', {
          accountId: cashEgp,
          kind: 'ADJUSTMENT',
          direction: 'OUT',
          amount: 10,
          reason: '',
        })
        .expect(400);
    });
  });

  describe('approval', () => {
    let id: number;
    const version = async () =>
      (await ctx.prisma.transfer.findUniqueOrThrow({ where: { id } })).version;

    beforeAll(async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/transfers', {
          fromAccountId: cashEgp,
          toAccountId: bankEgp,
          amount: 1000,
        })
        .expect(201);
      id = res.body.id;
    });

    it('goes level by level: no skipping', async () => {
      await ctx
        .api(auditor)
        .post(`/api/finance/approvals/TRANSFER/${id}/approve`, {
          version: await version(),
        })
        .expect(400);
      await ctx
        .api(manager)
        .post(`/api/finance/approvals/TRANSFER/${id}/review`, {
          version: await version(),
        })
        .expect(403);
    });

    it('the author cannot approve their own document', async () => {
      const own = await ctx.prisma.transfer.findFirstOrThrow({
        where: { createdById: treasuryUserId },
      });
      // the CEO records one and then tries to review it
      const ceoDoc = await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/other-movements', {
          accountId: cashEgp,
          kind: 'FUNDING',
          amount: 1,
          reason: 'تجربة',
        })
        .expect(201);
      const res = await ctx
        .api(ctx.ceoToken)
        .post(`/api/finance/approvals/OTHER/${ceoDoc.body.id}/review`, {
          version: ceoDoc.body.version,
        })
        .expect(403);
      expect(res.body.message).toContain('انت اللي سجلتها');
      expect(own).toBeTruthy();
    });

    it('rejection needs a reason and the author edit sends it back to review', async () => {
      await ctx
        .api(accountant)
        .post(`/api/finance/approvals/TRANSFER/${id}/reject`, {
          version: await version(),
        })
        .expect(400);
      await ctx
        .api(accountant)
        .post(`/api/finance/approvals/TRANSFER/${id}/reject`, {
          version: await version(),
          reason: 'المبلغ مش مطابق للإيصال',
        })
        .expect(201);
      const mine = await ctx
        .api(treasury)
        .get('/api/finance/approvals?status=REJECTED')
        .expect(200);
      expect(mine.body.items[0]).toMatchObject({
        type: 'TRANSFER',
        id,
        rejectionReason: 'المبلغ مش مطابق للإيصال',
      });
      const res = await ctx
        .api(treasury)
        .patch(`/api/finance/transfers/${id}`, {
          version: await version(),
          amount: 900,
        })
        .expect(200);
      expect(res.body.approvalStatus).toBe('PENDING');
      expect(res.body.rejectionReason).toBeNull();
    });

    it('review → manager → final approval', async () => {
      await ctx
        .api(accountant)
        .post(`/api/finance/approvals/TRANSFER/${id}/review`, {
          version: await version(),
        })
        .expect(201);
      await ctx
        .api(manager)
        .post(`/api/finance/approvals/TRANSFER/${id}/manager-approve`, {
          version: await version(),
        })
        .expect(201);
      const res = await ctx
        .api(auditor)
        .post(`/api/finance/approvals/TRANSFER/${id}/approve`, {
          version: await version(),
        })
        .expect(201);
      expect(res.body.approvalStatus).toBe('APPROVED');
    });

    it('after approval only the CEO edits, and it stays approved', async () => {
      await ctx
        .api(treasury)
        .patch(`/api/finance/transfers/${id}`, {
          version: await version(),
          amount: 800,
        })
        .expect(403);
      const res = await ctx
        .api(ctx.ceoToken)
        .patch(`/api/finance/transfers/${id}`, {
          version: await version(),
          amount: 800,
        })
        .expect(200);
      expect(res.body.approvalStatus).toBe('APPROVED');
      expect(res.body.amount).toBe('800');
    });

    it('lists every document for approvers, with what each may do', async () => {
      const res = await ctx
        .api(accountant)
        .get('/api/finance/approvals?status=PENDING')
        .expect(200);
      expect(res.body.total).toBeGreaterThan(0);
      expect(
        res.body.items.every(
          (i: { canAct: boolean; approvalStatus: string }) =>
            i.approvalStatus === 'PENDING',
        ),
      ).toBe(true);
    });
  });
});
