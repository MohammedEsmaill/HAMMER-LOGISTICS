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
  for (let i = 0; i < 10; i++) sum += (values[prefix[i]] ?? Number(prefix[i])) * 2 ** i;
  return `${prefix}${(sum % 11) % 10}`;
}

describe("The accountant's journal (e2e)", () => {
  let ctx: TestContext;
  let fx: ShipmentFixtures;
  let accountant: string;
  let bank: number;
  let shipmentId: number;
  let partyA: number;
  let partyB: number;
  let transferId: number;

  beforeAll(async () => {
    ctx = await createTestContext();
    fx = await shipmentFixtures(ctx, '9', '73');
    accountant = (await ctx.userWithRole('7310', 'ACCOUNTANT', 'ACCOUNTS')).token;
    bank = (
      await ctx.api(ctx.ceoToken).post('/api/finance/accounts', { name: 'بنك المحاسب', bankName: 'QNB', accountNumber: 'EG7300', currency: 'EGP', openingBalance: 100000 }).expect(201)
    ).body.id;
    shipmentId = (
      await ctx
        .api(fx.tokens.scan)
        .post('/api/shipments', fx.seaImport({ containers: [{ containerNo: containerNo('MSKU730001'), type: 'HQ40', weight: 1000 }] }))
        .expect(201)
    ).body.id;
    partyA = (await ctx.api(ctx.ceoToken).post('/api/finance/parties', { name: 'شركة شقيقة للمحاسب', kind: 'SISTER_COMPANY' }).expect(201)).body.id;
    partyB = (await ctx.api(ctx.ceoToken).post('/api/finance/parties', { name: 'مالك للمحاسب', kind: 'OWNER' }).expect(201)).body.id;
  });

  afterAll(() => closeTestContext(ctx));

  it('transfers to a shipping line: a custody with its purpose, the agency added on the spot', async () => {
    const agency = await ctx
      .api(accountant)
      .post('/api/finance/beneficiaries', { name: 'MSC Egypt', kind: 'SHIPPING_AGENCY', bankName: 'NBE', accountNumber: 'EG380003' })
      .expect(201);
    const body = {
      shipmentId,
      holderType: 'BANK_TRANSFER',
      bankAccountId: bank,
      beneficiaryId: agency.body.id,
      paymentMethod: 'TRANSFER',
      transferRef: 'FT2633100045',
      amount: 18500,
    };
    await ctx.api(accountant).post('/api/finance/custodies', { ...body, purpose: 'CLEARANCE' }).expect(400);
    const res = await ctx.api(accountant).post('/api/finance/custodies', { ...body, purpose: 'STORAGE' }).expect(201);
    expect(res.body).toMatchObject({ holderType: 'BANK_TRANSFER', purpose: 'STORAGE', status: 'OPEN' });
    transferId = res.body.id;
  });

  it('the treasury manager settles a bank transfer, not an agent\'s custody', async () => {
    const treasury = (await ctx.userWithRole('7312', 'TREASURY_MANAGER', 'ACCOUNTS')).token;
    const version = async (id: number) => (await ctx.api(treasury).get(`/api/finance/custodies/${id}`).expect(200)).body.version;
    const settled = await ctx
      .api(treasury)
      .post(`/api/finance/custodies/${transferId}/settlement`, {
        version: await version(transferId),
        items: [{ expenseType: 'رسوم صرف', amount: 18500, receiptNo: '9201' }],
      })
      .expect(201);
    expect(settled.body.status).toBe('SETTLED');
    // an agent's custody stays the accountant's to settle
    const agent = await ctx.userWithRole('7313', 'AGENT', 'AGENTS');
    const cash = await ctx.prisma.moneyAccount.findFirstOrThrow({ where: { type: 'CASH', currency: 'EGP' } });
    await ctx.api(treasury).post('/api/finance/other-movements', { accountId: cash.id, kind: 'FUNDING', amount: 1000, reason: 'تمويل' }).expect(201);
    const custody = await ctx
      .api(treasury)
      .post('/api/finance/custodies', { shipmentId, holderType: 'AGENT', agentEmployeeId: agent.employeeId, purpose: 'STORAGE', amount: 500 })
      .expect(201);
    await ctx
      .api(treasury)
      .post(`/api/finance/custodies/${custody.body.id}/settlement`, {
        version: await version(custody.body.id),
        items: [{ expenseType: 'رسوم صرف', amount: 500, receiptNo: '9202' }],
      })
      .expect(403);
  });

  it("adds a clearer's account from the users screen only, and a party's from the internal accounts", async () => {
    const clearer = await ctx
      .api(accountant)
      .post('/api/finance/beneficiaries', { name: 'حساب المستخلص', kind: 'CLEARER', clearerId: fx.ids.clearer, bankName: 'NBE', accountNumber: 'EG110022' })
      .expect(403);
    expect(clearer.body.message).toContain('المستخدمين');
    await ctx
      .api(ctx.ceoToken)
      .post('/api/finance/beneficiaries', { name: 'حساب المستخلص', kind: 'CLEARER', clearerId: fx.ids.clearer, bankName: 'NBE', accountNumber: 'EG110022' })
      .expect(201);
    await ctx
      .api(accountant)
      .post('/api/finance/beneficiaries', { name: 'حساب الشركة', kind: 'PARTY', partyId: partyA, currency: 'EGP', bankName: 'CIB', accountNumber: 'EG220033' })
      .expect(403);
    const own = await ctx
      .api(ctx.ceoToken)
      .post('/api/finance/beneficiaries', { name: 'حساب الشركة', kind: 'PARTY', partyId: partyA, currency: 'EGP', bankName: 'CIB', accountNumber: 'EG220033' })
      .expect(201);
    const list = await ctx.api(accountant).get(`/api/finance/beneficiaries?partyId=${partyA}`).expect(200);
    expect(list.body.map((b: { id: number }) => b.id)).toEqual([own.body.id]);
  });

  it("pays a party into its own account, never another party's", async () => {
    const [account] = (await ctx.api(accountant).get(`/api/finance/beneficiaries?partyId=${partyA}`).expect(200)).body;
    const body = { kind: 'PAYMENT', accountId: bank, amount: 5000, paymentMethod: 'TRANSFER', reference: 'FT2633200018', beneficiaryId: account.id };
    await ctx.api(accountant).post('/api/finance/party-movements', { ...body, partyId: partyB }).expect(400);
    const res = await ctx.api(accountant).post('/api/finance/party-movements', { ...body, partyId: partyA }).expect(201);
    const doc = await ctx.api(accountant).get(`/api/finance/party-movements/${res.body.id}`).expect(200);
    expect(doc.body.beneficiary).toMatchObject({ id: account.id, bankName: 'CIB' });
    // funding has no party account
    await ctx.api(accountant).post('/api/finance/party-movements', { ...body, kind: 'FUNDING', partyId: partyA }).expect(400);
  });
});
