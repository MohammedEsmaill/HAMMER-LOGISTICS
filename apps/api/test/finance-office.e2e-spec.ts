import { closeTestContext, createTestContext, TestContext } from './helpers';

describe('Finance: salaries, advances, general expenses (e2e)', () => {
  let ctx: TestContext;
  let treasury: string;
  let accountant: string;
  let hr: string;
  let scan: string;
  let cashEgp: number;
  let cashUsd: number;
  let employeeId: number;

  const balance = async (id: number) =>
    Number(
      (await ctx.prisma.moneyAccount.findUniqueOrThrow({ where: { id } }))
        .balance,
    );
  const lastMonth = () => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  };
  const thisMonth = () => new Date().toISOString().slice(0, 7);

  beforeAll(async () => {
    ctx = await createTestContext();
    treasury = (await ctx.userWithRole('911', 'TREASURY_MANAGER', 'ACCOUNTS'))
      .token;
    accountant = (await ctx.userWithRole('912', 'ACCOUNTANT', 'ACCOUNTS'))
      .token;
    hr = (await ctx.userWithRole('913', 'HR', 'MANAGEMENT')).token;
    scan = (await ctx.userWithRole('914', 'SCAN')).token;
    const boxes = await ctx.prisma.moneyAccount.findMany({
      where: { type: 'CASH' },
    });
    cashEgp = boxes.find((b) => b.currency === 'EGP')!.id;
    cashUsd = boxes.find((b) => b.currency === 'USD')!.id;
    // money in the cash box to pay from
    await ctx
      .api(treasury)
      .post('/api/finance/other-movements', {
        accountId: cashEgp,
        kind: 'FUNDING',
        amount: 100000,
        reason: 'تمويل للمرتبات',
      })
      .expect(201);
    employeeId = (
      await ctx.prisma.employee.create({
        data: {
          code: '915',
          fullName: 'كريم المرتبات',
          nationalId: '29001010009150',
          phone: '01000000915',
          department: 'OPERATION',
          jobTitle: 'Operation',
          hireDate: new Date('2024-01-01'),
          basicSalary: 8000,
        },
      })
    ).id;
  });

  afterAll(() => closeTestContext(ctx));

  describe('advances', () => {
    it('pays an advance out of the cash box', async () => {
      const start = await balance(cashEgp);
      await ctx
        .api(treasury)
        .post('/api/finance/advances', {
          employeeId,
          amount: 3000,
          accountId: cashEgp,
        })
        .expect(201);
      await ctx
        .api(treasury)
        .post('/api/finance/advances', {
          employeeId,
          amount: 1000,
          accountId: cashEgp,
        })
        .expect(201);
      expect(await balance(cashEgp)).toBe(start - 4000);
    });

    it('pays in EGP only', async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/advances', {
          employeeId,
          amount: 10,
          accountId: cashUsd,
        })
        .expect(400);
      expect(res.body.message).toContain('بالجنيه بس');
    });
  });

  describe('salaries', () => {
    it('previews the basic salary and the advance balance', async () => {
      const res = await ctx
        .api(treasury)
        .get(
          `/api/finance/salaries/preview?employeeId=${employeeId}&month=${lastMonth()}`,
        )
        .expect(200);
      expect(res.body).toMatchObject({
        basic: '8000',
        advanceBalance: '4000',
        alreadyPaid: null,
      });
    });

    it('refuses an advance deduction above the balance', async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/salaries', {
          employeeId,
          salaryMonth: lastMonth(),
          advanceDeduction: 4500,
          accountId: cashEgp,
        })
        .expect(400);
      expect(res.body.message).toContain('رصيد السلف');
    });

    it('computes the net: basic + additions − deductions − advance deduction', async () => {
      const start = await balance(cashEgp);
      const res = await ctx
        .api(treasury)
        .post('/api/finance/salaries', {
          employeeId,
          salaryMonth: lastMonth(),
          adjustments: [
            { kind: 'BONUS', amount: 500, reason: 'مكافأة إنجاز' },
            { kind: 'OVERTIME', amount: 250.5, reason: 'أوفر تايم' },
            { kind: 'ABSENCE', amount: 300, reason: 'غياب يوم' },
          ],
          advanceDeduction: 1500,
          accountId: cashEgp,
        })
        .expect(201);
      expect(res.body).toMatchObject({
        basic: '8000',
        additions: '750.5',
        deductions: '300',
        advanceDeduction: '1500',
        net: '6950.5',
      });
      expect(await balance(cashEgp)).toBe(start - 6950.5);
    });

    it('pays a month once per employee', async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/salaries', {
          employeeId,
          salaryMonth: lastMonth(),
          accountId: cashEgp,
        })
        .expect(400);
      expect(res.body.message).toContain('اتصرف قبل كده');
    });

    it('refuses a month that has not come yet', async () => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + 1);
      await ctx
        .api(treasury)
        .post('/api/finance/salaries', {
          employeeId,
          salaryMonth: d.toISOString().slice(0, 7),
          accountId: cashEgp,
        })
        .expect(400);
    });

    it('refuses deductions larger than the salary', async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/salaries', {
          employeeId,
          salaryMonth: thisMonth(),
          adjustments: [{ kind: 'PENALTY', amount: 9000, reason: 'جزاء كبير' }],
          accountId: cashEgp,
        })
        .expect(400);
      expect(res.body.message).toContain('الخصومات أكبر من المرتب');
    });

    it('an edit recomputes the net and corrects the cash box', async () => {
      const salary = await ctx.prisma.salaryPayment.findFirstOrThrow({
        where: { employeeId },
      });
      const start = await balance(cashEgp);
      const res = await ctx
        .api(treasury)
        .patch(`/api/finance/salaries/${salary.id}`, {
          version: salary.version,
          advanceDeduction: 2000,
        })
        .expect(200);
      expect(res.body.net).toBe('6450.5');
      expect(await balance(cashEgp)).toBe(start + 500);
    });

    it('keeps the advance statement with its running balance', async () => {
      const res = await ctx
        .api(treasury)
        .get(`/api/finance/employees/${employeeId}/advances`)
        .expect(200);
      expect(res.body.totals).toEqual({
        advances: '4000',
        deducted: '2000',
        balance: '2000',
      });
      expect(res.body.lines.at(-1).balance).toBe('2000');
    });

    it('lets HR see salaries but not pay them; hides them from others', async () => {
      await ctx.api(hr).get('/api/finance/salaries').expect(200);
      await ctx
        .api(hr)
        .post('/api/finance/salaries', {
          employeeId,
          salaryMonth: thisMonth(),
          accountId: cashEgp,
        })
        .expect(403);
      await ctx.api(scan).get('/api/finance/salaries').expect(403);
    });

    it('cannot reduce an advance below what salaries already deducted', async () => {
      // advances 3000 + 1000, deducted 2000: the 3000 one down to 500 leaves −500
      const big = await ctx.prisma.employeeAdvance.findFirstOrThrow({
        where: { employeeId, amount: 3000 },
      });
      const res = await ctx
        .api(treasury)
        .patch(`/api/finance/advances/${big.id}`, {
          version: big.version,
          amount: 500,
        })
        .expect(400);
      expect(res.body.message).toContain('اتخصم من المرتبات');
    });
  });

  describe('general expenses', () => {
    it('adds a new expense type the first time it is typed', async () => {
      const start = await balance(cashEgp);
      const res = await ctx
        .api(treasury)
        .post('/api/finance/expenses', {
          expenseType: 'كهربا',
          payee: 'شركة الكهرباء',
          amount: 1200,
          receiptNo: 'e-5531',
        })
        .expect(201);
      expect(res.body.expenseType.name).toBe('كهربا');
      expect(res.body.receiptNo).toBe('E-5531');
      expect(res.body.account.id).toBe(cashEgp);
      await ctx
        .api(treasury)
        .post('/api/finance/expenses', {
          expenseType: '  كهربا ',
          payee: 'شركة الكهرباء',
          amount: 300,
          receiptNo: '5532',
        })
        .expect(201);
      await ctx
        .api(treasury)
        .post('/api/finance/expenses', {
          expenseType: 'بوفيه',
          payee: 'عم سعيد',
          amount: 150,
          receiptNo: '17',
        })
        .expect(201);
      const types = await ctx
        .api(treasury)
        .get('/api/finance/expenses/types')
        .expect(200);
      expect(types.body.map((t: { name: string }) => t.name)).toEqual(
        expect.arrayContaining(['كهربا', 'بوفيه']),
      );
      expect(
        types.body.filter((t: { name: string }) => t.name === 'كهربا'),
      ).toHaveLength(1);
      expect(await balance(cashEgp)).toBe(start - 1650);
    });

    it('needs a receipt number', async () => {
      await ctx
        .api(treasury)
        .post('/api/finance/expenses', {
          expenseType: 'بوفيه',
          payee: 'عم سعيد',
          amount: 10,
        })
        .expect(400);
    });

    it('reports totals by type and payee', async () => {
      const res = await ctx
        .api(treasury)
        .get('/api/finance/expenses/report')
        .expect(200);
      expect(res.body.total).toBe('1650');
      expect(res.body.byType[0]).toMatchObject({
        expenseType: { name: 'كهربا' },
        total: '1500',
        count: 2,
      });
      await ctx.api(accountant).get('/api/finance/expenses/report').expect(403);
    });

    it('shows up in the approval queue with salaries and advances', async () => {
      const res = await ctx
        .api(accountant)
        .get('/api/finance/approvals?status=PENDING&pageSize=200')
        .expect(200);
      const types = new Set(
        res.body.items.map((i: { type: string }) => i.type),
      );
      expect([...types]).toEqual(
        expect.arrayContaining(['SALARY', 'ADVANCE', 'EXPENSE']),
      );
      const expense = res.body.items.find(
        (i: { type: string }) => i.type === 'EXPENSE',
      );
      await ctx
        .api(accountant)
        .post(`/api/finance/approvals/EXPENSE/${expense.id}/review`, {
          version: expense.version,
        })
        .expect(201);
    });
  });
});
