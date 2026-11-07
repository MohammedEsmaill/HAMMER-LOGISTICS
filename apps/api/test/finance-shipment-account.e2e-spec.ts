import { shipmentFixtures, ShipmentFixtures } from './fixtures';
import { closeTestContext, createTestContext, TestContext } from './helpers';

describe('Finance: shipment account, invoices, collections (e2e)', () => {
  let ctx: TestContext;
  let fx: ShipmentFixtures;
  let treasury: string;
  let accountant: string;
  let relations: string;
  let shipmentId: number;
  let fileNo: string;
  let cashEgp: number;
  let bankEgp: number;
  let agentId: number;

  const account = (token = accountant) =>
    ctx
      .api(token)
      .get(`/api/finance/shipment-accounts/${shipmentId}`)
      .expect(200);
  const custodyVersion = async (id: number) =>
    (await ctx.prisma.custody.findUniqueOrThrow({ where: { id } })).version;

  beforeAll(async () => {
    ctx = await createTestContext();
    fx = await shipmentFixtures(ctx, '0');
    treasury = (await ctx.userWithRole('931', 'TREASURY_MANAGER', 'ACCOUNTS'))
      .token;
    accountant = (await ctx.userWithRole('932', 'ACCOUNTANT', 'ACCOUNTS'))
      .token;
    relations = (
      await ctx.userWithRole('933', 'FINANCIAL_RELATIONS', 'ACCOUNTS')
    ).token;
    agentId = (
      await ctx.prisma.employee.create({
        data: {
          code: '934',
          fullName: 'مندوب الحساب',
          nationalId: '29001010009340',
          phone: '01000000934',
          department: 'AGENTS',
          jobTitle: 'Agent',
          hireDate: new Date('2024-01-01'),
        },
      })
    ).id;
    const boxes = await ctx.prisma.moneyAccount.findMany({
      where: { type: 'CASH' },
    });
    cashEgp = boxes.find((b) => b.currency === 'EGP')!.id;
    const cashUsd = boxes.find((b) => b.currency === 'USD')!.id;
    for (const [accountId, amount] of [
      [cashEgp, 50000],
      [cashUsd, 3000],
    ]) {
      await ctx
        .api(treasury)
        .post('/api/finance/other-movements', {
          accountId,
          kind: 'FUNDING',
          amount,
          reason: 'تمويل',
        })
        .expect(201);
    }
    bankEgp = (
      await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/accounts', {
          name: 'بنك التحصيل',
          bankName: 'QNB',
          accountNumber: '4400112233',
          currency: 'EGP',
          openingBalance: 0,
        })
        .expect(201)
    ).body.id;
    const shipment = await ctx
      .api(fx.tokens.scan)
      .post('/api/shipments', fx.seaImport())
      .expect(201);
    shipmentId = shipment.body.id;
    fileNo = shipment.body.fileNo;
  });

  afterAll(() => closeTestContext(ctx));

  it('builds the client statement from the settled custody items', async () => {
    const agent = await ctx
      .api(treasury)
      .post('/api/finance/custodies', {
        shipmentId,
        holderType: 'AGENT',
        agentEmployeeId: agentId,
        purpose: 'RELEASE',
        amount: 5000,
      })
      .expect(201);
    await ctx
      .api(treasury)
      .post(`/api/finance/custodies/${agent.body.id}/settlement`, {
        version: agent.body.version,
        items: [
          { expenseType: 'صرف', amount: 3000, receiptNo: '861-26' },
          {
            expenseType: 'ضريبة',
            amount: 500,
            receiptNo: '670-26',
            receiptKind: 'VAT',
          },
          { expenseType: 'استمارة', amount: 200, description: 'استمارة 9 ك.م' },
        ],
      })
      .expect(201);
    const wayOut = await ctx
      .api(treasury)
      .post('/api/finance/custodies', {
        shipmentId,
        holderType: 'WAY_OUT',
        purpose: 'RELEASE',
        amount: 1000,
      })
      .expect(201);
    await ctx
      .api(treasury)
      .post(`/api/finance/custodies/${wayOut.body.id}/settlement`, {
        version: wayOut.body.version,
        items: [{ expenseType: 'صرف', amount: 800, receiptNo: '00663-26' }],
      })
      .expect(201);

    const res = await account();
    expect(
      res.body.draft.EGP.lines.map(
        (l: { description: string }) => l.description,
      ),
    ).toEqual(['PAYMENT RECEIPT NO-861-26', 'VAT NO-670-26', 'استمارة 9 ك.م']);
    expect(res.body.draft.EGP.total).toBe('3700');
    expect(res.body.draft.USD.total).toBe('800');
  });

  it('refuses a receipt that is not digits and dashes', async () => {
    const c = await ctx
      .api(treasury)
      .post('/api/finance/custodies', {
        shipmentId,
        holderType: 'AGENT',
        agentEmployeeId: agentId,
        purpose: 'STORAGE',
        amount: 100,
      })
      .expect(201);
    await ctx
      .api(treasury)
      .post(`/api/finance/custodies/${c.body.id}/settlement`, {
        version: c.body.version,
        items: [{ expenseType: 'أرضيات', amount: 100, receiptNo: 'A-12' }],
      })
      .expect(400);
  });

  it('lets the accountant drop, re-price and add lines without touching the actual expense', async () => {
    const res = await account();
    const [, vat, form] = res.body.draft.EGP.lines;
    await ctx
      .api(accountant)
      .patch(`/api/finance/shipment-accounts/items/${form.id}`, {
        excluded: true,
      })
      .expect(200);
    await ctx
      .api(accountant)
      .patch(`/api/finance/shipment-accounts/items/${vat.id}`, {
        amount: 550,
        description: 'VAT NO-670-26 (معدّل)',
      })
      .expect(200);
    const after = await ctx
      .api(accountant)
      .post(`/api/finance/shipment-accounts/${shipmentId}/extra-lines`, {
        currency: 'EGP',
        description: 'فرق وزن باب الجمرك',
        amount: 150,
      })
      .expect(201);
    expect(after.body.draft.EGP.total).toBe('3700'); // 3000 + 550 + 150
    expect(after.body.draft.EGP.actualTotal).toBe('3700'); // 3000 + 500 + 200, unchanged
    await ctx
      .api(treasury)
      .patch(`/api/finance/shipment-accounts/items/${vat.id}`, { amount: 1 })
      .expect(403);
  });

  it('will not finish while a custody is open', async () => {
    const res = await ctx
      .api(accountant)
      .post(`/api/finance/shipment-accounts/${shipmentId}/finish`, {
        version: 0,
        confirmNoCertificate: true,
      })
      .expect(400);
    expect(res.body.message).toContain('ما اتصفتش');
    const open = await ctx.prisma.custody.findFirstOrThrow({
      where: { shipmentId, status: 'OPEN' },
    });
    await ctx
      .api(treasury)
      .post(`/api/finance/custodies/${open.id}/settlement`, {
        version: await custodyVersion(open.id),
        items: [{ expenseType: 'أرضيات', amount: 100, receiptNo: '9407' }],
      })
      .expect(201);
  });

  it('warns about a missing certificate number before finishing', async () => {
    const res = await ctx
      .api(accountant)
      .post(`/api/finance/shipment-accounts/${shipmentId}/finish`, {
        version: 0,
      })
      .expect(409);
    expect(res.body.message).toContain('رقم الشهادة');
  });

  it('finishes: STATEMENT per currency and CLEARANCE from the quote with VAT', async () => {
    const res = await ctx
      .api(accountant)
      .post(`/api/finance/shipment-accounts/${shipmentId}/finish`, {
        version: 0,
        confirmNoCertificate: true,
        clearanceLines: [
          { description: 'مصاريف عرض مخدرات', quantity: 1, unitPrice: 500 },
        ],
      })
      .expect(201);
    expect(res.body.account).toMatchObject({
      status: 'FINISHED',
      paymentStatus: 'UNPAID',
    });
    const live = res.body.invoices.filter(
      (i: { voidedAt: string | null }) => !i.voidedAt,
    );
    const egp = live.find(
      (i: { type: string; currency: string }) =>
        i.type === 'STATEMENT' && i.currency === 'EGP',
    );
    const usd = live.find(
      (i: { type: string; currency: string }) =>
        i.type === 'STATEMENT' && i.currency === 'USD',
    );
    const clearance = live.find(
      (i: { type: string }) => i.type === 'CLEARANCE',
    );
    // no certificate: the file number
    expect(egp).toMatchObject({ invoiceNo: fileNo, total: '3800' }); // + the 100 storage line
    expect(usd).toMatchObject({ invoiceNo: `${fileNo}-USD`, total: '800' });
    // the office's own invoice HL0447: 7000 + 500, VAT 10% = 8250
    expect(clearance).toMatchObject({
      subtotal: '7500',
      vatAmount: '750',
      total: '8250',
      cycle: 1,
    });
    expect(clearance.invoiceNo).toMatch(/^HL\d{4}$/);
    expect(
      clearance.lines.map((l: { description: string }) => l.description),
    ).toEqual(['CLEARANCE', 'مصاريف عرض مخدرات']);
  });

  it('freezes the statement and the custodies once finished', async () => {
    const res = await account();
    const item = res.body.draft.EGP.lines[0];
    await ctx
      .api(accountant)
      .patch(`/api/finance/shipment-accounts/items/${item.id}`, { amount: 1 })
      .expect(400);
    await ctx
      .api(treasury)
      .post('/api/finance/custodies', {
        shipmentId,
        holderType: 'WAY_OUT',
        purpose: 'RELEASE',
        amount: 10,
      })
      .expect(400);
  });

  it('collects in the invoice currency, never more than is owed', async () => {
    await ctx
      .api(relations)
      .post('/api/finance/collections', {
        shipmentId,
        currency: 'EGP',
        amount: 5000,
        method: 'CASH',
      })
      .expect(201);
    expect((await account()).body.account.paymentStatus).toBe('PARTIAL');
    const over = await ctx
      .api(relations)
      .post('/api/finance/collections', {
        shipmentId,
        currency: 'EGP',
        amount: 7100,
        method: 'TRANSFER',
        bankAccountId: bankEgp,
      })
      .expect(400);
    expect(over.body.message).toContain('7,050.00'); // 3800 + 8250 − 5000
    await ctx
      .api(relations)
      .post('/api/finance/collections', {
        shipmentId,
        currency: 'EGP',
        amount: 7050,
        method: 'TRANSFER',
        bankAccountId: bankEgp,
        reference: 'TRX-1',
      })
      .expect(201);
    expect((await account()).body.account.paymentStatus).toBe('PARTIAL'); // the dollars are still owed
    await ctx
      .api(relations)
      .post('/api/finance/collections', {
        shipmentId,
        currency: 'USD',
        amount: 800,
        method: 'CASH',
      })
      .expect(201);
    expect((await account()).body.account.paymentStatus).toBe('PAID');
    const bank = await ctx.prisma.moneyAccount.findUniqueOrThrow({
      where: { id: bankEgp },
    });
    expect(Number(bank.balance)).toBe(7050);
  });

  it('a paid account is reopened by financial relations only, and reissued with the same numbers', async () => {
    const before = (await account()).body;
    const clearanceNo = before.invoices.find(
      (i: { type: string }) => i.type === 'CLEARANCE',
    ).invoiceNo;
    await ctx
      .api(accountant)
      .post(`/api/finance/shipment-accounts/${shipmentId}/reopen`, {
        version: before.account.version,
        reason: 'تعديل بند',
      })
      .expect(403);
    const reopened = await ctx
      .api(relations)
      .post(`/api/finance/shipment-accounts/${shipmentId}/reopen`, {
        version: before.account.version,
        reason: 'تعديل بند',
      })
      .expect(201);
    expect(reopened.body.account.status).toBe('OPEN');
    expect(
      reopened.body.invoices.every(
        (i: { voidedAt: string | null }) => i.voidedAt,
      ),
    ).toBe(true);
    const again = await ctx
      .api(accountant)
      .post(`/api/finance/shipment-accounts/${shipmentId}/finish`, {
        version: reopened.body.account.version,
        confirmNoCertificate: true,
      })
      .expect(201);
    const live = again.body.invoices.filter(
      (i: { voidedAt: string | null }) => !i.voidedAt,
    );
    expect(
      live.find((i: { type: string }) => i.type === 'CLEARANCE'),
    ).toMatchObject({ invoiceNo: clearanceNo, total: '7700' });
    // without the extra line the clearance is 7000 + VAT; EGP collected 12050 ≥ 3800 + 7700
    expect(again.body.account.paymentStatus).toBe('PAID');
  });

  it('keeps the client statement per currency: invoices in, collections out', async () => {
    const res = await ctx
      .api(relations)
      .get(`/api/finance/clients/${fx.ids.clientA}/ledger`)
      .expect(200);
    const egp = res.body.currencies.find(
      (c: { currency: string }) => c.currency === 'EGP',
    );
    expect(egp.totals).toEqual({
      debit: '11500',
      credit: '12050',
      balance: '-550',
    });
    const balances = await ctx
      .api(relations)
      .get('/api/finance/clients/balances')
      .expect(200);
    expect(
      balances.body.find(
        (b: { client: { id: number } }) => b.client.id === fx.ids.clientA,
      ).currencies.USD.balance,
    ).toBe('0');
    await ctx
      .api(fx.tokens.scan)
      .get(`/api/finance/clients/${fx.ids.clientA}/ledger`)
      .expect(403);
  });

  it('lets the CEO set the company data printed on invoices', async () => {
    await ctx
      .api(accountant)
      .patch('/api/settings/company', { emails: ['acc@hammerline.com'] })
      .expect(403);
    const res = await ctx
      .api(ctx.ceoToken)
      .patch('/api/settings/company', {
        emails: ['ACC@hammerline.com', 'ops@hammerline.com'],
      })
      .expect(200);
    expect(res.body).toMatchObject({
      taxNumber: '655-517-626',
      emails: ['acc@hammerline.com', 'ops@hammerline.com'],
    });
    const read = await ctx
      .api(accountant)
      .get('/api/settings/company')
      .expect(200);
    expect(read.body.crNumber).toBe('11731');
  });
});
