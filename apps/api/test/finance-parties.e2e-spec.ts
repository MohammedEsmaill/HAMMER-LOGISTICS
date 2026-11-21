import { closeTestContext, createTestContext, TestContext } from './helpers';

describe('Finance: internal accounts and personal accounts (e2e)', () => {
  let ctx: TestContext;
  let treasury: string;
  let accountant: string;
  let auditor: string;
  let manager: string;
  let relations: string;
  let cashEgp: number;
  let cashUsd: number;
  let transport: number;
  let owner: number;

  const balance = async (id: number) =>
    Number(
      (await ctx.prisma.moneyAccount.findUniqueOrThrow({ where: { id } }))
        .balance,
    );
  const balancesOf = async (id: number) =>
    (
      (await ctx.api(treasury).get('/api/finance/parties').expect(200))
        .body as {
        id: number;
        balances: { currency: string; balance: string }[];
      }[]
    ).find((p) => p.id === id)!.balances;

  beforeAll(async () => {
    ctx = await createTestContext();
    treasury = (await ctx.userWithRole('881', 'TREASURY_MANAGER', 'ACCOUNTS'))
      .token;
    accountant = (await ctx.userWithRole('882', 'ACCOUNTANT', 'ACCOUNTS'))
      .token;
    auditor = (await ctx.userWithRole('883', 'GENERAL_AUDITOR', 'ACCOUNTS'))
      .token;
    manager = (await ctx.userWithRole('884', 'ACCOUNTS_MANAGER', 'ACCOUNTS'))
      .token;
    relations = (
      await ctx.userWithRole('885', 'FINANCIAL_RELATIONS', 'ACCOUNTS')
    ).token;
    const boxes = await ctx.prisma.moneyAccount.findMany({
      where: { type: 'CASH' },
    });
    cashEgp = boxes.find((b) => b.currency === 'EGP')!.id;
    cashUsd = boxes.find((b) => b.currency === 'USD')!.id;
    await ctx
      .api(treasury)
      .post('/api/finance/other-movements', {
        accountId: cashEgp,
        kind: 'FUNDING',
        amount: 50000,
        reason: 'رصيد للحسابات الداخلية',
      })
      .expect(201);
  });

  afterAll(() => closeTestContext(ctx));

  describe('parties', () => {
    it('only the CEO adds a party', async () => {
      await ctx
        .api(treasury)
        .post('/api/finance/parties', {
          name: 'هامر للنقل',
          kind: 'SISTER_COMPANY',
        })
        .expect(403);
      transport = (
        await ctx
          .api(ctx.ceoToken)
          .post('/api/finance/parties', {
            name: 'هامر للنقل',
            kind: 'SISTER_COMPANY',
          })
          .expect(201)
      ).body.id;
      owner = (
        await ctx
          .api(ctx.ceoToken)
          .post('/api/finance/parties', { name: 'المالك الأول', kind: 'OWNER' })
          .expect(201)
      ).body.id;
      await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/parties', { name: 'هامر للنقل', kind: 'OWNER' })
        .expect(409);
    });

    it('is hidden from who has no access to it', async () => {
      await ctx.api(relations).get('/api/finance/parties').expect(403);
      await ctx.api(auditor).get('/api/finance/parties').expect(200);
    });
  });

  describe('movements', () => {
    let fundingId: number;

    it('funding comes into the cash box and reduces what the party owes', async () => {
      const start = await balance(cashEgp);
      const res = await ctx
        .api(treasury)
        .post('/api/finance/party-movements', {
          partyId: transport,
          accountId: cashEgp,
          kind: 'FUNDING',
          amount: 10000,
          reference: 'إيصال 15',
        })
        .expect(201);
      fundingId = res.body.id;
      expect(res.body).toMatchObject({
        direction: 'IN',
        currency: 'EGP',
        approvalStatus: 'PENDING',
      });
      expect(await balance(cashEgp)).toBe(start + 10000);
      expect(await balancesOf(transport)).toEqual([
        expect.objectContaining({ currency: 'EGP', balance: '-10000.00' }),
      ]);
    });

    it('a payment goes out to the party; past the funding it owes us', async () => {
      const start = await balance(cashEgp);
      const body = {
        partyId: transport,
        accountId: cashEgp,
        kind: 'PAYMENT',
        amount: 12500,
      };
      // cash is the treasury manager's, not the accountant's
      await ctx
        .api(accountant)
        .post('/api/finance/party-movements', body)
        .expect(403);
      await ctx
        .api(treasury)
        .post('/api/finance/party-movements', body)
        .expect(201);
      expect(await balance(cashEgp)).toBe(start - 12500);
      expect(await balancesOf(transport)).toEqual([
        expect.objectContaining({ currency: 'EGP', balance: '2500.00' }),
      ]);
    });

    it('a shared debt needs who was paid, and keeps each currency apart', async () => {
      await ctx
        .api(treasury)
        .post('/api/finance/party-movements', {
          partyId: owner,
          accountId: cashUsd,
          kind: 'FUNDING',
          amount: 300,
        })
        .expect(201);
      await ctx
        .api(treasury)
        .post('/api/finance/party-movements', {
          partyId: owner,
          accountId: cashUsd,
          kind: 'SHARED_DEBT',
          amount: 200,
        })
        .expect(400);
      await ctx
        .api(treasury)
        .post('/api/finance/party-movements', {
          partyId: owner,
          accountId: cashUsd,
          kind: 'SHARED_DEBT',
          amount: 200,
          payee: 'مدرسة الأولاد',
        })
        .expect(201);
      expect(await balancesOf(owner)).toEqual([
        expect.objectContaining({ currency: 'USD', balance: '-100.00' }),
      ]);
    });

    it('a shared debt is not a company expense', async () => {
      const res = await ctx
        .api(treasury)
        .get('/api/finance/expenses/report')
        .expect(200);
      expect(JSON.stringify(res.body)).not.toContain('مدرسة الأولاد');
    });

    it('a company cash box never goes below zero', async () => {
      const res = await ctx
        .api(treasury)
        .post('/api/finance/party-movements', {
          partyId: owner,
          accountId: cashUsd,
          kind: 'PAYMENT',
          amount: 1_000_000,
        })
        .expect(400);
      expect(res.body.message).toContain('مش كفاية');
    });

    it('builds the statement with a running balance per currency', async () => {
      const res = await ctx
        .api(manager)
        .get(`/api/finance/parties/${transport}/statement`)
        .expect(200);
      expect(
        res.body.lines.map((l: { kind: string; balance: string }) => [
          l.kind,
          l.balance,
        ]),
      ).toEqual([
        ['FUNDING', '-10000.00'],
        ['PAYMENT', '2500.00'],
      ]);
      expect(res.body.closing).toEqual([
        expect.objectContaining({ currency: 'EGP', balance: '2500.00' }),
      ]);
    });

    it('the author edits until approval; the cash box follows', async () => {
      const start = await balance(cashEgp);
      const doc = await ctx.prisma.partyMovement.findUniqueOrThrow({
        where: { id: fundingId },
      });
      await ctx
        .api(accountant)
        .patch(`/api/finance/party-movements/${fundingId}`, {
          version: doc.version,
          amount: 9000,
        })
        .expect(403);
      await ctx
        .api(treasury)
        .patch(`/api/finance/party-movements/${fundingId}`, {
          version: doc.version,
          amount: 9000,
        })
        .expect(200);
      expect(await balance(cashEgp)).toBe(start - 1000);
    });

    it('the general auditor reviews, then the accounts manager approves', async () => {
      const version = async () =>
        (
          await ctx.prisma.partyMovement.findUniqueOrThrow({
            where: { id: fundingId },
          })
        ).version;
      await ctx
        .api(manager)
        .post(`/api/finance/approvals/PARTY/${fundingId}/approve`, {
          version: await version(),
        })
        .expect(400);
      await ctx
        .api(auditor)
        .post(`/api/finance/approvals/PARTY/${fundingId}/review`, {
          version: await version(),
        })
        .expect(201);
      const res = await ctx
        .api(manager)
        .post(`/api/finance/approvals/PARTY/${fundingId}/approve`, {
          version: await version(),
        })
        .expect(201);
      expect(res.body.approvalStatus).toBe('APPROVED');
    });

    it('shows in the journal with the party name', async () => {
      const res = await ctx
        .api(treasury)
        .get('/api/finance/journal?types=PARTY&pageSize=50')
        .expect(200);
      expect(res.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'PARTY',
            counterparty: 'هامر للنقل',
            flow: 'IN',
          }),
        ]),
      );
    });
  });

  describe("an owner's personal account", () => {
    let personal: number;

    it('belongs to an owner, starts at zero, and only the CEO adds it', async () => {
      const body = {
        name: 'حساب المالك الشخصي',
        bankName: 'CIB',
        accountNumber: 'EG1234567890',
        currency: 'EGP',
        openingBalance: 0,
        ownership: 'PERSONAL',
        ownerPartyId: owner,
      };
      await ctx.api(treasury).post('/api/finance/accounts', body).expect(403);
      await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/accounts', { ...body, ownerPartyId: transport })
        .expect(400);
      await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/accounts', { ...body, openingBalance: 500 })
        .expect(400);
      const res = await ctx
        .api(ctx.ceoToken)
        .post('/api/finance/accounts', body)
        .expect(201);
      personal = res.body.id;
      expect(res.body).toMatchObject({
        ownership: 'PERSONAL',
        ownerParty: { id: owner, name: 'المالك الأول' },
      });
    });

    it('is a payment channel: money goes out of it with no balance check', async () => {
      await ctx
        .api(accountant)
        .post('/api/finance/party-movements', {
          partyId: owner,
          accountId: personal,
          kind: 'SHARED_DEBT',
          amount: 4000,
          payee: 'شركة الكهربا',
          paymentMethod: 'TRANSFER',
          reference: 'ib-7781',
        })
        .expect(201);
      expect(await balance(personal)).toBe(-4000);
      const list = await ctx
        .api(treasury)
        .get('/api/finance/parties')
        .expect(200);
      const ownerRow = list.body.find((p: { id: number }) => p.id === owner);
      expect(ownerRow.personalAccounts).toEqual([
        expect.objectContaining({ id: personal }),
      ]);
    });

    it('stays out of the accounts report', async () => {
      const day = new Date().toISOString().slice(0, 10);
      const res = await ctx
        .api(treasury)
        .get(`/api/finance/journal/reports/accounts?from=2020-01-01&to=${day}`)
        .expect(200);
      const ids = res.body.accounts.map(
        (a: { account: { id: number } }) => a.account.id,
      );
      expect(ids).not.toContain(personal);
      expect(ids).toContain(cashEgp);
    });

    it('keeps the books check clean', async () => {
      const res = await ctx
        .api(ctx.ceoToken)
        .post('/api/integrity')
        .expect(200);
      expect(
        res.body.problems.filter(
          (p: { kind: string }) => p.kind !== 'CLOSED_DAY',
        ),
      ).toEqual([]);
    });
  });
});
