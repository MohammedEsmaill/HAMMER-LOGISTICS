import { closeTestContext, createTestContext, TestContext } from './helpers';

describe("The treasury manager's journal (e2e)", () => {
  let ctx: TestContext;
  let treasury: string;
  let bankEgp: number;
  let bankUsd: number;
  let cashEgp: number;
  let owner: number;
  let sister: number;
  let employeeId: number;

  beforeAll(async () => {
    ctx = await createTestContext();
    treasury = (await ctx.userWithRole('7401', 'TREASURY_MANAGER', 'ACCOUNTS')).token;
    const open = (name: string, currency: string, accountNumber: string) =>
      ctx.api(ctx.ceoToken).post('/api/finance/accounts', { name, bankName: 'QNB', accountNumber, currency, openingBalance: 100000 }).expect(201);
    bankEgp = (await open('بنك الخزنة جنيه', 'EGP', 'EG7401')).body.id;
    bankUsd = (await open('بنك الخزنة دولار', 'USD', 'EG7402')).body.id;
    cashEgp = (await ctx.prisma.moneyAccount.findFirstOrThrow({ where: { type: 'CASH', currency: 'EGP' } })).id;
    await ctx.api(treasury).post('/api/finance/other-movements', { accountId: cashEgp, kind: 'FUNDING', amount: 50000, reason: 'تمويل' }).expect(201);
    owner = (await ctx.api(ctx.ceoToken).post('/api/finance/parties', { name: 'مالك الخزنة', kind: 'OWNER' }).expect(201)).body.id;
    sister = (await ctx.api(ctx.ceoToken).post('/api/finance/parties', { name: 'شقيقة الخزنة', kind: 'SISTER_COMPANY' }).expect(201)).body.id;
    employeeId = (
      await ctx.prisma.employee.create({
        data: {
          code: '7402',
          fullName: 'موظف الخزنة',
          nationalId: '29001010074020',
          phone: '01000007402',
          department: 'OPERATION',
          jobTitle: 'Operation',
          hireDate: new Date('2024-01-01'),
          basicSalary: 6000,
        },
      })
    ).id;
  });

  afterAll(() => closeTestContext(ctx));

  it("keeps a party's bank account with its currency, and pays it from an account of the same", async () => {
    const body = { name: 'حساب الشقيقة', kind: 'PARTY', partyId: sister, bankName: 'CIB', accountNumber: 'EG740011' };
    await ctx.api(ctx.ceoToken).post('/api/finance/beneficiaries', body).expect(400);
    const usd = await ctx.api(ctx.ceoToken).post('/api/finance/beneficiaries', { ...body, currency: 'USD' }).expect(201);
    expect(usd.body.currency).toBe('USD');
    const pay = { partyId: sister, kind: 'PAYMENT', amount: 100, paymentMethod: 'TRANSFER', reference: 'FT740001', beneficiaryId: usd.body.id };
    await ctx.api(treasury).post('/api/finance/party-movements', { ...pay, accountId: bankEgp }).expect(400);
    await ctx.api(treasury).post('/api/finance/party-movements', { ...pay, accountId: bankUsd }).expect(201);
  });

  it("pays an owner into one of his personal accounts, never someone else's", async () => {
    const personal = await ctx
      .api(ctx.ceoToken)
      .post('/api/finance/accounts', { name: 'شخصي المالك', bankName: 'CIB', accountNumber: 'EG740022', currency: 'EGP', openingBalance: 0, ownership: 'PERSONAL', ownerPartyId: owner })
      .expect(201);
    const pay = { kind: 'PAYMENT', accountId: bankEgp, amount: 2500, paymentMethod: 'TRANSFER', reference: 'FT740002', personalAccountId: personal.body.id };
    await ctx.api(treasury).post('/api/finance/party-movements', { ...pay, partyId: sister }).expect(400);
    await ctx.api(treasury).post('/api/finance/party-movements', { ...pay, partyId: owner, accountId: bankUsd }).expect(400);
    await ctx.api(treasury).post('/api/finance/party-movements', { ...pay, partyId: owner, kind: 'FUNDING' }).expect(400);
    const res = await ctx.api(treasury).post('/api/finance/party-movements', { ...pay, partyId: owner }).expect(201);
    expect(res.body.personalAccount).toMatchObject({ id: personal.body.id, name: 'شخصي المالك' });
  });

  it('pays a salary in cash, or from a bank by transfer only with its reference', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const body = { employeeId, salaryMonth: month, accountId: bankEgp };
    await ctx.api(treasury).post('/api/finance/salaries', body).expect(400);
    await ctx.api(treasury).post('/api/finance/salaries', { ...body, paymentMethod: 'CHEQUE', reference: '123' }).expect(400);
    const res = await ctx.api(treasury).post('/api/finance/salaries', { ...body, reference: 'FT740003' }).expect(201);
    expect(res.body).toMatchObject({ paymentMethod: 'TRANSFER', reference: 'FT740003' });
    // moved to the cash box, the transfer goes with it
    const doc = await ctx.api(treasury).get(`/api/finance/salaries/${res.body.id}`).expect(200);
    const moved = await ctx.api(treasury).patch(`/api/finance/salaries/${res.body.id}`, { accountId: cashEgp, version: doc.body.version }).expect(200);
    expect(moved.body).toMatchObject({ paymentMethod: null, reference: null });
  });

  it('pays an advance the same way', async () => {
    await ctx.api(treasury).post('/api/finance/advances', { employeeId, amount: 500, accountId: cashEgp, reference: 'X1' }).expect(400);
    const res = await ctx.api(treasury).post('/api/finance/advances', { employeeId, amount: 500, accountId: bankEgp, reference: 'FT740004' }).expect(201);
    expect(res.body).toMatchObject({ paymentMethod: 'TRANSFER', reference: 'FT740004' });
  });
});
