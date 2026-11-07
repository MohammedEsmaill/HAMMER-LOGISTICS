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

describe('Finance: custodies, clearer fees, statements (e2e)', () => {
  let ctx: TestContext;
  let fx: ShipmentFixtures;
  let treasury: string;
  let accountant: string;
  let relations: string;
  let clearerToken: string;
  let agentId: number;
  let cashEgp: number;
  let cashUsd: number;
  let bankEgp: number;
  let shipmentId: number;
  let shipmentVersion: number;
  let agencyId: number;

  const balance = async (id: number) =>
    Number(
      (await ctx.prisma.moneyAccount.findUniqueOrThrow({ where: { id } }))
        .balance,
    );
  const version = async (id: number) =>
    (await ctx.prisma.custody.findUniqueOrThrow({ where: { id } })).version;

  beforeAll(async () => {
    ctx = await createTestContext();
    fx = await shipmentFixtures(ctx, '8');
    treasury = (await ctx.userWithRole('921', 'TREASURY_MANAGER', 'ACCOUNTS'))
      .token;
    accountant = (await ctx.userWithRole('922', 'ACCOUNTANT', 'ACCOUNTS'))
      .token;
    relations = (
      await ctx.userWithRole('923', 'FINANCIAL_RELATIONS', 'ACCOUNTS')
    ).token;
    agentId = (
      await ctx.prisma.employee.create({
        data: {
          code: '924',
          fullName: 'مندوب التوكيلات',
          nationalId: '29001010009240',
          phone: '01000000924',
          department: 'AGENTS',
          jobTitle: 'Agent',
          hireDate: new Date('2024-01-01'),
        },
      })
    ).id;
    const clearerRole = await ctx.prisma.role.findUniqueOrThrow({
      where: { name: 'CLEARER' },
    });
    await ctx
      .api(ctx.ceoToken)
      .post('/api/users', {
        accountType: 'CLEARER',
        ownerId: fx.ids.clearer,
        email: 'clearer8@hammerline.com',
        password: 'Passw0rd1',
        roleId: clearerRole.id,
      })
      .expect(201);
    clearerToken = await ctx.login('clearer8@hammerline.com', 'Passw0rd1');

    const boxes = await ctx.prisma.moneyAccount.findMany({
      where: { type: 'CASH' },
    });
    cashEgp = boxes.find((b) => b.currency === 'EGP')!.id;
    cashUsd = boxes.find((b) => b.currency === 'USD')!.id;
    bankEgp = (
      await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/accounts', {
          name: 'بنك العهد',
          bankName: 'بنك مصر',
          accountNumber: '8800112233',
          currency: 'EGP',
          openingBalance: 50000,
        })
        .expect(201)
    ).body.id;
    for (const [accountId, amount] of [
      [cashEgp, 100000],
      [cashUsd, 5000],
    ]) {
      await ctx
        .api(treasury)
        .post('/api/finance/other-movements', {
          accountId,
          kind: 'FUNDING',
          amount,
          reason: 'تمويل العهد',
        })
        .expect(201);
    }
    const shipment = await ctx
      .api(fx.tokens.scan)
      .post(
        '/api/shipments',
        fx.seaImport({
          containers: [
            {
              containerNo: containerNo('MSKU800001'),
              type: 'HQ40',
              weight: 1000,
            },
            {
              containerNo: containerNo('MSKU800002'),
              type: 'HQ40',
              weight: 1000,
            },
            {
              containerNo: containerNo('MSKU800003'),
              type: 'HQ20',
              weight: 1000,
            },
          ],
        }),
      )
      .expect(201);
    shipmentId = shipment.body.id;
    shipmentVersion = shipment.body.version;
  });

  afterAll(() => closeTestContext(ctx));

  describe('agent custody', () => {
    let id: number;

    it('pays the agent out of the EGP cash box and numbers the custody', async () => {
      const start = await balance(cashEgp);
      const res = await ctx
        .api(treasury)
        .post('/api/finance/custodies', {
          shipmentId,
          holderType: 'AGENT',
          agentEmployeeId: agentId,
          purpose: 'UNLOADING',
          amount: 5000,
        })
        .expect(201);
      id = res.body.id;
      expect(res.body.custodyNo).toMatch(/^CU\d{2}-\d{4}$/);
      expect(res.body.currency).toBe('EGP');
      expect(await balance(cashEgp)).toBe(start - 5000);
    });

    it('refuses an employee outside the agents department, and a clearer purpose', async () => {
      await ctx
        .api(treasury)
        .post('/api/finance/custodies', {
          shipmentId,
          holderType: 'AGENT',
          agentEmployeeId: fx.employees.opsA,
          purpose: 'UNLOADING',
          amount: 10,
        })
        .expect(400);
      await ctx
        .api(treasury)
        .post('/api/finance/custodies', {
          shipmentId,
          holderType: 'AGENT',
          agentEmployeeId: agentId,
          purpose: 'CLEARANCE',
          amount: 10,
        })
        .expect(400);
    });

    it('cannot be approved before it is settled', async () => {
      await ctx
        .api(accountant)
        .post(`/api/finance/approvals/CUSTODY/${id}/review`, {
          version: await version(id),
        })
        .expect(400);
    });

    it('may not overspend', async () => {
      const res = await ctx
        .api(treasury)
        .post(`/api/finance/custodies/${id}/settlement`, {
          version: await version(id),
          items: [{ expenseType: 'تفريغ', amount: 5200, receiptNo: '1001' }],
        })
        .expect(400);
      expect(res.body.message).toContain('للمستخلص بس');
    });

    it('needs a receipt number or a description on each item', async () => {
      await ctx
        .api(treasury)
        .post(`/api/finance/custodies/${id}/settlement`, {
          version: await version(id),
          items: [{ expenseType: 'تفريغ', amount: 100 }],
        })
        .expect(400);
    });

    it('settles: the rest comes back to the cash box', async () => {
      const start = await balance(cashEgp);
      const res = await ctx
        .api(treasury)
        .post(`/api/finance/custodies/${id}/settlement`, {
          version: await version(id),
          items: [
            { expenseType: 'تفريغ', amount: 3200, receiptNo: '1001' },
            {
              expenseType: 'أرضيات',
              amount: 1000,
              description: 'أرضيات 3 أيام',
            },
          ],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        status: 'SETTLED',
        spentAmount: '4200',
        returnedAmount: '800',
        extraAmount: '0',
      });
      expect(res.body.items).toHaveLength(2);
      expect(await balance(cashEgp)).toBe(start + 800);
    });

    it('then joins the approval list', async () => {
      await ctx
        .api(accountant)
        .post(`/api/finance/approvals/CUSTODY/${id}/review`, {
          version: await version(id),
        })
        .expect(201);
    });
  });

  describe('WAY OUT and bank transfer', () => {
    it('pays WAY OUT in dollars from the USD cash box', async () => {
      const start = await balance(cashUsd);
      const res = await ctx
        .api(treasury)
        .post('/api/finance/custodies', {
          shipmentId,
          holderType: 'WAY_OUT',
          purpose: 'RELEASE',
          amount: 700,
        })
        .expect(201);
      expect(res.body.currency).toBe('USD');
      expect(await balance(cashUsd)).toBe(start - 700);
    });

    it('keeps the external accounts paid into (beneficiaries)', async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/beneficiaries', {
          name: 'توكيل ميرسك',
          kind: 'SHIPPING_AGENCY',
          bankName: 'CIB',
          accountNumber: 'eg12 0001 0002 0003',
        })
        .expect(201);
      agencyId = res.body.id;
      expect(res.body.accountNumber).toBe('EG12000100020003');
      await ctx
        .api(treasury)
        .post('/api/finance/beneficiaries', {
          name: 'مكرر',
          kind: 'OTHER',
          bankName: 'CIB',
          accountNumber: 'EG12000100020003',
        })
        .expect(409);
      await ctx
        .api(treasury)
        .post('/api/finance/beneficiaries', {
          name: 'مستخلص من غير ربط',
          kind: 'CLEARER',
          bankName: 'NBE',
          accountNumber: '55667788',
        })
        .expect(400);
    });

    it('a bank transfer names the account that received it', async () => {
      await ctx
        .api(treasury)
        .post('/api/finance/custodies', {
          shipmentId,
          holderType: 'BANK_TRANSFER',
          bankAccountId: bankEgp,
          amount: 2500,
        })
        .expect(400);
    });

    it('a bank transfer is spent exactly', async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/custodies', {
          shipmentId,
          holderType: 'BANK_TRANSFER',
          bankAccountId: bankEgp,
          beneficiaryId: agencyId,
          transferRef: 'trf-9921',
          amount: 2500,
        })
        .expect(201);
      expect(res.body.beneficiary.name).toBe('توكيل ميرسك');
      expect(res.body.transferRef).toBe('TRF-9921');
      await ctx
        .api(treasury)
        .post(`/api/finance/custodies/${res.body.id}/settlement`, {
          version: res.body.version,
          items: [
            { expenseType: 'رسوم جمركية', amount: 2400, receiptNo: '7001' },
          ],
        })
        .expect(400);
      await ctx
        .api(treasury)
        .post(`/api/finance/custodies/${res.body.id}/settlement`, {
          version: res.body.version,
          items: [
            { expenseType: 'رسوم جمركية', amount: 2500, receiptNo: '7001' },
          ],
        })
        .expect(201);
      expect(await balance(bankEgp)).toBe(47500);
    });
  });

  describe('clearer custody and fee', () => {
    let id: number;
    let feeId: number;

    it('goes to the shipment clearer only', async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/custodies', {
          shipmentId,
          holderType: 'CLEARER',
          purpose: 'CLEARANCE',
          amount: 4000,
        })
        .expect(201);
      id = res.body.id;
      expect(res.body.clearer.id).toBe(fx.ids.clearer);
    });

    it('may overspend: the difference is paid out, and the fee is computed', async () => {
      const start = await balance(cashEgp);
      const res = await ctx
        .api(treasury)
        .post(`/api/finance/custodies/${id}/settlement`, {
          version: await version(id),
          items: [
            { expenseType: 'تخليص', amount: 3000, receiptNo: '1001' },
            { expenseType: 'صرف', amount: 1500, receiptNo: '2002' },
          ],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        spentAmount: '4500',
        extraAmount: '500',
        returnedAmount: '0',
      });
      expect(await balance(cashEgp)).toBe(start - 500);
      // receipt 1001 is also on the agent custody: a warning, not an error
      expect(res.body.duplicateReceipts).toEqual([
        expect.objectContaining({ receiptNo: '1001' }),
      ]);
      // final, 3 containers: 3000 + 700 × 2
      const fee = await ctx.prisma.clearerFee.findUniqueOrThrow({
        where: { shipmentId },
      });
      feeId = fee.id;
      expect(Number(fee.amount)).toBe(4400);
    });

    it('a re-settlement replaces the items and keeps one fee', async () => {
      const start = await balance(cashEgp);
      await ctx
        .api(treasury)
        .post(`/api/finance/custodies/${id}/settlement`, {
          version: await version(id),
          items: [{ expenseType: 'تخليص', amount: 3800, receiptNo: '1003' }],
        })
        .expect(201);
      // was 500 over; now 200 back
      expect(await balance(cashEgp)).toBe(start + 700);
      expect(await ctx.prisma.clearerFee.count({ where: { shipmentId } })).toBe(
        1,
      );
    });

    it('fixes the clearer and adjusts the fee when containers change', async () => {
      const other = await ctx
        .api(ctx.ceoToken)
        .post('/api/clearers', {
          fullName: 'مستخلص تاني',
          phone: '0',
          nationalId: '26010100080002',
          importFinalBase: 1,
          importTemporaryBase: 1,
          importExtraContainer: 1,
          exportBase: 1,
          exportExtraContainer: 1,
        })
        .expect(201);
      await ctx
        .api(fx.tokens.scan)
        .patch(`/api/shipments/${shipmentId}/basic`, {
          version: shipmentVersion,
          clearerId: other.body.id,
        })
        .expect(400);
      const res = await ctx
        .api(fx.tokens.scan)
        .patch(`/api/shipments/${shipmentId}/basic`, {
          version: shipmentVersion,
          containers: [
            {
              containerNo: containerNo('MSKU800001'),
              type: 'HQ40',
              weight: 1000,
            },
            {
              containerNo: containerNo('MSKU800002'),
              type: 'HQ40',
              weight: 1000,
            },
          ],
        })
        .expect(200);
      shipmentVersion = res.body.version;
      const fee = await ctx
        .api(treasury)
        .get(`/api/finance/clearer-fees/${feeId}`)
        .expect(200);
      expect(fee.body).toMatchObject({
        total: '3700',
        paid: '0',
        remaining: '3700',
      });
      expect(fee.body.adjustments[0]).toMatchObject({
        reason: 'CONTAINERS_CHANGED',
        amount: '-700',
      });
    });

    it('pays a fee by bank transfer into the clearer own account only', async () => {
      const own = await ctx
        .api(treasury)
        .post('/api/finance/beneficiaries', {
          name: 'حساب المستخلص',
          kind: 'CLEARER',
          clearerId: fx.ids.clearer,
          bankName: 'NBE',
          accountNumber: '8800990011',
        })
        .expect(201);
      await ctx
        .api(treasury)
        .post('/api/finance/clearer-fees/payments', {
          feeId,
          amount: 500,
          accountId: bankEgp,
        })
        .expect(400);
      await ctx
        .api(treasury)
        .post('/api/finance/clearer-fees/payments', {
          feeId,
          amount: 500,
          accountId: bankEgp,
          beneficiaryId: agencyId,
        })
        .expect(400);
      const bankBefore = await balance(bankEgp);
      const res = await ctx
        .api(treasury)
        .post('/api/finance/clearer-fees/payments', {
          feeId,
          amount: 500,
          accountId: bankEgp,
          beneficiaryId: own.body.id,
          transferRef: 'TR-1',
        })
        .expect(201);
      expect(res.body.beneficiary.name).toBe('حساب المستخلص');
      expect(await balance(bankEgp)).toBe(bankBefore - 500);
    });

    it('pays the fee in installments, never above what is left', async () => {
      await ctx
        .api(treasury)
        .post('/api/finance/clearer-fees/payments', { feeId, amount: 1500 })
        .expect(201);
      const res = await ctx
        .api(treasury)
        .post('/api/finance/clearer-fees/payments', { feeId, amount: 2000 })
        .expect(400);
      expect(res.body.message).toContain('1,700.00');
      await ctx
        .api(treasury)
        .post('/api/finance/clearer-fees/payments', { feeId, amount: 1700 })
        .expect(201);
    });

    it('only the CEO adjusts a fee, with a reason', async () => {
      await ctx
        .api(treasury)
        .post('/api/finance/clearer-fees/adjustments', {
          feeId,
          amount: 300,
          notes: 'شغل زيادة',
        })
        .expect(403);
      await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/clearer-fees/adjustments', {
          feeId,
          amount: 300,
          notes: '',
        })
        .expect(400);
      const res = await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/clearer-fees/adjustments', {
          feeId,
          amount: 300,
          notes: 'معاينة إضافية',
        })
        .expect(201);
      expect(res.body).toMatchObject({ total: '4000', remaining: '300' });
    });

    it('builds the clearer statement from the documents', async () => {
      const res = await ctx
        .api(treasury)
        .get(`/api/finance/ledgers/clearers/${fx.ids.clearer}`)
        .expect(200);
      // debit: issue 4000 + payments 3700 + the −700 containers adjustment;
      // credit: items 3800 + rest back 200 + fee 4400 + the CEO's 300
      expect(res.body.totals).toEqual({
        debit: '8400',
        credit: '8700',
        balance: '-300',
      });
      expect(res.body.lines.at(-1).balance).toBe('-300');
    });

    it('lets the clearer see their own statement only', async () => {
      const own = await ctx
        .api(clearerToken)
        .get('/api/finance/ledgers/me')
        .expect(200);
      expect(own.body.totals.balance).toBe('-300');
      await ctx
        .api(clearerToken)
        .get(`/api/finance/ledgers/clearers/${fx.ids.clearer}`)
        .expect(403);
      await ctx
        .api(relations)
        .get(`/api/finance/ledgers/clearers/${fx.ids.clearer}`)
        .expect(200);
    });

    it('lists the agent statement: issued, accounted for, returned', async () => {
      const res = await ctx
        .api(relations)
        .get(`/api/finance/ledgers/agents/${agentId}`)
        .expect(200);
      expect(res.body.totals).toEqual({
        debit: '5000',
        credit: '5000',
        balance: '0',
      });
    });
  });
});
