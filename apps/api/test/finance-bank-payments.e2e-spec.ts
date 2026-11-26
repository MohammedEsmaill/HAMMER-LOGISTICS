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

  /** Another shipment of the same client and clearer (one clearer custody per shipment). */
  const anotherShipment = async (prefix: string) =>
    (
      await ctx
        .api(fx.tokens.scan)
        .post('/api/shipments', fx.seaImport({ containers: [{ containerNo: containerNo(prefix), type: 'HQ40', weight: 1000 }] }))
        .expect(201)
    ).body.id as number;

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

    it('is settled like any clearer custody; the rest is kept, never returned', async () => {
      const start = await balance(bankEgp);
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
        returnedAmount: '0',
        keptAmount: '500',
      });
      expect(await balance(bankEgp)).toBe(start);
    });

    it('takes what was kept off the clearer’s fee', async () => {
      const fee = await ctx.prisma.clearerFee.findUniqueOrThrow({
        where: { shipmentId },
      });
      const res = await ctx
        .api(treasury)
        .get(`/api/finance/clearer-fees/${fee.id}`)
        .expect(200);
      expect(res.body.offset).toBe('500');
      expect(Number(res.body.remaining)).toBe(Number(res.body.total) - 500);
    });

    it('pays an overspend from any account chosen at settlement', async () => {
      const custody = await ctx
        .api(accountant)
        .post('/api/finance/custodies', {
          shipmentId: await anotherShipment('MSKU200002'),
          holderType: 'CLEARER',
          purpose: 'RELEASE',
          amount: 1000,
          bankAccountId: bankEgp,
          beneficiaryId: clearerAccount,
          paymentMethod: 'TRANSFER',
          transferRef: 'tr-5050',
        })
        .expect(201);
      const cashStart = await balance(cashEgp);
      const res = await ctx
        .api(accountant)
        .post(`/api/finance/custodies/${custody.body.id}/settlement`, {
          version: custody.body.version,
          items: [{ expenseType: 'رسوم صرف', amount: 1300, receiptNo: '9101' }],
          extraAccountId: cashEgp,
        })
        .expect(201);
      expect(res.body).toMatchObject({
        extraAmount: '300',
        extraAccountId: cashEgp,
      });
      expect(await balance(cashEgp)).toBe(cashStart - 300);
    });

    it('a kept rest with no fee left waits for the next fee', async () => {
      // pay what is left of the fee, then keep more than any fee can take
      const fee = await ctx.prisma.clearerFee.findUniqueOrThrow({
        where: { shipmentId },
      });
      const now = await ctx
        .api(treasury)
        .get(`/api/finance/clearer-fees/${fee.id}`)
        .expect(200);
      if (Number(now.body.remaining) > 0) {
        await ctx
          .api(treasury)
          .post('/api/finance/clearer-fees/payments', {
            feeId: fee.id,
            amount: Number(now.body.remaining),
          })
          .expect(201);
      }
      // another shipment: he keeps far more than its own fee can take
      const other = await anotherShipment('MSKU200003');
      const custody = await ctx
        .api(treasury)
        .post('/api/finance/custodies', {
          shipmentId: other,
          holderType: 'CLEARER',
          amount: 8000,
        })
        .expect(201);
      await ctx
        .api(accountant)
        .post(`/api/finance/custodies/${custody.body.id}/settlement`, {
          version: custody.body.version,
          items: [{ expenseType: 'رسوم صرف', amount: 500, receiptNo: '9201' }],
        })
        .expect(201);
      const offsets = await ctx.prisma.clearerFeeOffset.findMany({
        where: { custodyId: custody.body.id },
      });
      // it covers his unpaid fees; the rest of the 7,500 waits for the next fee
      const taken = offsets.reduce((n, o) => n + Number(o.amount), 0);
      expect(taken).toBeGreaterThan(0);
      expect(taken).toBeLessThan(7500);
      // the clearer's statement shows the 300 on him
      const ledger = await ctx
        .api(treasury)
        .get(`/api/finance/ledgers/clearers/${fx.ids.clearer}`)
        .expect(200);
      expect(Number(ledger.body.totals.balance)).toBeGreaterThan(0);
    });
  });
});
