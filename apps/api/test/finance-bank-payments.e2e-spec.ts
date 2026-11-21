import { shipmentFixtures, ShipmentFixtures } from './fixtures';
import { closeTestContext, createTestContext, TestContext } from './helpers';

/** A valid ISO 6346 number for an owner code + 6 digits. */
function containerNo(prefix: string): string {
  const values: Record<string, number> = {};
  let n = 10;
  for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (n % 11 === 0) n++;
    values[l] = n++;
  }
  let sum = 0;
  for (let i = 0; i < 10; i++)
    sum += (values[prefix[i]] ?? Number(prefix[i])) * 2 ** i;
  return `${prefix}${(sum % 11) % 10}`;
}

describe('Finance: bank payments, bank charges, cash vs bank (e2e)', () => {
  let ctx: TestContext;
  let fx: ShipmentFixtures;
  let treasury: string;
  let accountant: string;
  let cashEgp: number;
  let bankEgp: number;
  let shipmentId: number;
  let clearerAccount: number;

  const balance = async (id: number) =>
    Number(
      (await ctx.prisma.moneyAccount.findUniqueOrThrow({ where: { id } }))
        .balance,
    );

  beforeAll(async () => {
    ctx = await createTestContext();
    fx = await shipmentFixtures(ctx, '2', '94');
    treasury = (await ctx.userWithRole('871', 'TREASURY_MANAGER', 'ACCOUNTS'))
      .token;
    accountant = (await ctx.userWithRole('872', 'ACCOUNTANT', 'ACCOUNTS'))
      .token;
    cashEgp = (
      await ctx.prisma.moneyAccount.findFirstOrThrow({
        where: { type: 'CASH', currency: 'EGP' },
      })
    ).id;
    bankEgp = (
      await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/accounts', {
          name: 'بنك التحويلات',
          bankName: 'QNB',
          accountNumber: 'EG9900112233',
          currency: 'EGP',
          openingBalance: 100000,
        })
        .expect(201)
    ).body.id;
    await ctx
      .api(treasury)
      .post('/api/finance/other-movements', {
        accountId: cashEgp,
        kind: 'FUNDING',
        amount: 20000,
        reason: 'تمويل',
      })
      .expect(201);
    shipmentId = (
      await ctx
        .api(fx.tokens.scan)
        .post(
          '/api/shipments',
          fx.seaImport({
            containers: [
              {
                containerNo: containerNo('MSKU200001'),
                type: 'HQ40',
                weight: 1000,
              },
            ],
          }),
        )
        .expect(201)
    ).body.id;
    clearerAccount = (
      await ctx
        .api(treasury)
        .post('/api/finance/beneficiaries', {
          name: 'حساب مستخلص البنك',
          kind: 'CLEARER',
          clearerId: fx.ids.clearer,
          bankName: 'NBE',
          accountNumber: 'EG5500112233',
        })
        .expect(201)
    ).body.id;
  });

  afterAll(() => closeTestContext(ctx));

  describe('cash is the treasury manager’s, the bank the accountant’s', () => {
    const expense = (extra: object) => ({
      expenseType: 'إنترنت المكتب',
      category: 'BILLS_UTILITIES',
      payee: 'WE',
      amount: 900,
      receiptNo: 'w-1',
      ...extra,
    });

    it('the accountant may not pay from the cash box', async () => {
      const res = await ctx
        .api(accountant)
        .post('/api/finance/expenses', expense({}))
        .expect(403);
      expect(res.body.message).toContain('مدير الخزنة');
    });

    it('a bank payment names its method and reference', async () => {
      await ctx
        .api(accountant)
        .post('/api/finance/expenses', expense({ accountId: bankEgp }))
        .expect(400);
      const res = await ctx
        .api(accountant)
        .post(
          '/api/finance/expenses',
          expense({ accountId: bankEgp, paymentMethod: 'TRANSFER' }),
        )
        .expect(400);
      expect(res.body.message).toContain('الرقم المرجعي');
    });

    it('takes the bank charges from the same account, on their own line', async () => {
      const start = await balance(bankEgp);
      const res = await ctx
        .api(accountant)
        .post(
          '/api/finance/expenses',
          expense({
            accountId: bankEgp,
            paymentMethod: 'TRANSFER',
            reference: 'ib-5501',
            bankCharges: 15,
          }),
        )
        .expect(201);
      expect(res.body).toMatchObject({
        paymentMethod: 'TRANSFER',
        reference: 'IB-5501',
        bankCharges: '15',
      });
      expect(await balance(bankEgp)).toBe(start - 915);
      const lines = await ctx.prisma.moneyMovement.findMany({
        where: { expenseId: res.body.id },
      });
      expect(lines.map((l) => Number(l.amount)).sort()).toEqual([15, 900]);
      // the journal counts what left the bank
      const journal = await ctx
        .api(treasury)
        .get(`/api/finance/journal?types=EXPENSE&pageSize=50`)
        .expect(200);
      const row = journal.body.items.find(
        (r: { id: number }) => r.id === res.body.id,
      );
      expect(Number(row.amount)).toBe(915);
      expect(row.description).toContain('تحويل IB-5501');
      expect(row.description).toContain('مصاريف بنكية 15');
    });

    it('editing the charges reposts the lines', async () => {
      const doc = await ctx.prisma.generalExpense.findFirstOrThrow({
        where: { reference: 'IB-5501' },
      });
      const start = await balance(bankEgp);
      await ctx
        .api(accountant)
        .patch(`/api/finance/expenses/${doc.id}`, {
          version: doc.version,
          bankCharges: 5,
        })
        .expect(200);
      expect(await balance(bankEgp)).toBe(start + 10);
    });

    it('a cash payment has no method or charges', async () => {
      await ctx
        .api(treasury)
        .post('/api/finance/expenses', expense({ bankCharges: 10 }))
        .expect(400);
    });

    it('the treasury manager may pay from the bank too', async () => {
      await ctx
        .api(treasury)
        .post('/api/finance/transfers', {
          fromAccountId: bankEgp,
          toAccountId: cashEgp,
          amount: 1000,
          paymentMethod: 'CHEQUE',
          chequeNo: '7781',
          bankCharges: 3,
        })
        .expect(201);
      await ctx
        .api(accountant)
        .post('/api/finance/transfers', {
          fromAccountId: cashEgp,
          toAccountId: bankEgp,
          amount: 100,
        })
        .expect(403);
    });

    it('groups the expense report by main item', async () => {
      const res = await ctx
        .api(treasury)
        .get('/api/finance/expenses/report')
        .expect(200);
      expect(res.body.byCategory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: 'BILLS_UTILITIES',
            label: 'فواتير ومرافق',
          }),
        ]),
      );
    });
  });

  describe('a clearer custody by bank transfer', () => {
    let id: number;

    it('goes into the clearer’s own account only', async () => {
      const body = {
        shipmentId,
        holderType: 'CLEARER',
        purpose: 'CLEARANCE',
        amount: 4000,
        bankAccountId: bankEgp,
        paymentMethod: 'TRANSFER',
        transferRef: 'tr-4040',
        bankCharges: 10,
      };
      await ctx
        .api(accountant)
        .post('/api/finance/custodies', body)
        .expect(400);
      const start = await balance(bankEgp);
      const res = await ctx
        .api(accountant)
        .post('/api/finance/custodies', {
          ...body,
          beneficiaryId: clearerAccount,
        })
        .expect(201);
      id = res.body.id;
      expect(res.body).toMatchObject({
        holderType: 'CLEARER',
        transferRef: 'TR-4040',
        beneficiary: { id: clearerAccount },
      });
      expect(await balance(bankEgp)).toBe(start - 4010);
    });

    it('is settled like any clearer custody', async () => {
      const custody = await ctx.prisma.custody.findUniqueOrThrow({
        where: { id },
      });
      const res = await ctx
        .api(accountant)
        .post(`/api/finance/custodies/${id}/settlement`, {
          version: custody.version,
          items: [{ expenseType: 'تخليص', amount: 3500, receiptNo: '9001' }],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        status: 'SETTLED',
        returnedAmount: '500',
      });
    });
  });
});
