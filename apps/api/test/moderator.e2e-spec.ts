import { closeTestContext, createTestContext, TestContext } from './helpers';

describe('The moderator role (e2e)', () => {
  let ctx: TestContext;
  let moderator: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    moderator = (await ctx.userWithRole('861', 'MODERATOR', 'MANAGEMENT'))
      .token;
  });

  afterAll(() => closeTestContext(ctx));

  it('edits the data and the lists that may change', async () => {
    await ctx.api(moderator).get('/api/users').expect(200);
    await ctx.api(moderator).get('/api/clients').expect(200);
    await ctx.api(moderator).get('/api/finance/prices').expect(200);
    const item = await ctx
      .api(moderator)
      .post('/api/finance/prices/items', { name: 'بند الموديريتور', price: 90 })
      .expect(201);
    expect(item.body.price).toBe('90');
    await ctx
      .api(moderator)
      .post('/api/finance/parties', { name: 'جهة الموديريتور', kind: 'OWNER' })
      .expect(201);
    await ctx.api(moderator).get('/api/audit').expect(200);
  });

  it('sees the accounts and parties, without any balance', async () => {
    const accounts = await ctx
      .api(moderator)
      .get('/api/finance/accounts')
      .expect(200);
    expect(accounts.body.length).toBeGreaterThan(0);
    expect(
      accounts.body.every((a: { balance: unknown }) => a.balance === null),
    ).toBe(true);
    const parties = await ctx
      .api(moderator)
      .get('/api/finance/parties')
      .expect(200);
    expect(
      parties.body.every(
        (p: { balances: unknown[] }) => p.balances.length === 0,
      ),
    ).toBe(true);
  });

  it('never reaches the money: journal, operations, shipment accounts, approvals', async () => {
    for (const path of [
      '/api/finance/journal',
      '/api/finance/approvals',
      '/api/finance/shipment-accounts',
      '/api/finance/expenses',
      '/api/finance/custodies',
      '/api/finance/transfers',
      '/api/finance/clients/balances',
    ]) {
      await ctx.api(moderator).get(path).expect(403);
    }
    const cash = await ctx.prisma.moneyAccount.findFirstOrThrow({
      where: { type: 'CASH', currency: 'EGP' },
    });
    await ctx
      .api(moderator)
      .post('/api/finance/other-movements', {
        accountId: cash.id,
        kind: 'FUNDING',
        amount: 10,
        reason: 'تجربة',
      })
      .expect(403);
    await ctx
      .api(moderator)
      .get(`/api/finance/accounts/${cash.id}/movements`)
      .expect(403);
  });

  it('may not give the CEO role', async () => {
    const ceo = await ctx.prisma.role.findUniqueOrThrow({
      where: { name: 'CEO' },
    });
    const employee = await ctx.prisma.employee.create({
      data: {
        code: '862',
        fullName: 'موظف جديد',
        nationalId: '29001010008620',
        phone: '01000000862',
        department: 'SCAN',
        jobTitle: 'Test',
        hireDate: new Date('2024-01-01'),
      },
    });
    await ctx
      .api(moderator)
      .post('/api/users', {
        accountType: 'EMPLOYEE',
        ownerId: employee.id,
        email: 'u862@hammerline.com',
        password: 'Passw0rd1',
        roleId: ceo.id,
      })
      .expect(403);
  });

  it('its five reserved permissions go to no other role', async () => {
    await ctx
      .api(ctx.ceoToken)
      .post('/api/roles', {
        name: 'دور تجربة',
        permissions: ['clients.view', 'clearers.manage'],
      })
      .expect(400);
    const hr = await ctx.prisma.role.findUniqueOrThrow({
      where: { name: 'HR' },
    });
    const res = await ctx
      .api(ctx.ceoToken)
      .patch(`/api/roles/${hr.id}`, {
        permissions: [...hr.permissions, 'finance.prices.manage'],
      })
      .expect(400);
    expect(res.body.message).toContain('الموديريتور');
    const mod = await ctx.prisma.role.findUniqueOrThrow({
      where: { name: 'MODERATOR' },
    });
    await ctx
      .api(ctx.ceoToken)
      .patch(`/api/roles/${mod.id}`, { permissions: mod.permissions })
      .expect(200);
    await ctx
      .api(ctx.ceoToken)
      .patch(`/api/roles/${mod.id}`, { name: 'مشرف' })
      .expect(400);
  });
});
