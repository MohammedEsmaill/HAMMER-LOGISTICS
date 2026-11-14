import { JournalDaysService } from '../src/finance/journal-days.service';
import { closeTestContext, createTestContext, TestContext } from './helpers';

/** A Cairo business day, n days before today, as YYYY-MM-DD. */
function cairoDay(daysBack: number): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
  }).format(new Date());
  const d = new Date(`${today}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

describe('Finance: daily journals that close at midnight (e2e)', () => {
  let ctx: TestContext;
  let treasury: string;
  let cashEgp: number;
  let movementId: number;
  const yesterday = cairoDay(1);
  const days = () => ctx.app.get(JournalDaysService);

  beforeAll(async () => {
    ctx = await createTestContext();
    treasury = (await ctx.userWithRole('961', 'TREASURY_MANAGER', 'ACCOUNTS'))
      .token;
    cashEgp = (
      await ctx.prisma.moneyAccount.findFirstOrThrow({
        where: { type: 'CASH', currency: 'EGP' },
      })
    ).id;
    // yesterday was left open (as if reopened), and an operation was recorded on it
    await ctx.prisma.journalDay.create({
      data: {
        date: new Date(`${yesterday}T00:00:00.000Z`),
        status: 'OPEN',
        reopenedUntil: new Date(`${cairoDay(0)}T00:00:00.000Z`),
      },
    });
    movementId = (
      await ctx
        .api(treasury)
        .post('/api/finance/other-movements', {
          accountId: cashEgp,
          kind: 'FUNDING',
          amount: 7777,
          reason: 'تمويل يومية امبارح 961',
          movementDate: yesterday,
        })
        .expect(201)
    ).body.id;
    // then its time ran out
    await ctx.prisma.journalDay.update({
      where: { date: new Date(`${yesterday}T00:00:00.000Z`) },
      data: { reopenedUntil: new Date(`${cairoDay(2)}T00:00:00.000Z`) },
    });
  });

  afterAll(() => closeTestContext(ctx));

  it('a past day is closed: nothing new is recorded on it', async () => {
    const res = await ctx
      .api(treasury)
      .post('/api/finance/other-movements', {
        accountId: cashEgp,
        kind: 'FUNDING',
        amount: 10,
        reason: 'متأخر',
        movementDate: cairoDay(3),
      })
      .expect(400);
    expect(res.body.message).toContain('اتقفلت');
  });

  it('closes the days after midnight, with each account figures', async () => {
    expect(await days().closeDue()).toBeGreaterThanOrEqual(1);
    const res = await ctx
      .api(treasury)
      .get(`/api/finance/journal/days/${yesterday}`)
      .expect(200);
    expect(res.body.status).toBe('CLOSED');
    const cash = res.body.accounts.find(
      (a: { account: { id: number } }) => a.account.id === cashEgp,
    );
    expect(Number(cash.in)).toBeGreaterThanOrEqual(7777);
    expect(Number(cash.closing)).toBeCloseTo(
      Number(cash.opening) + Number(cash.in) - Number(cash.out),
      2,
    );
    // running it again closes nothing more
    expect(await days().closeDue()).toBe(0);
  });

  it('only the CEO edits an operation of a closed day', async () => {
    const doc = await ctx.prisma.otherMovement.findUniqueOrThrow({
      where: { id: movementId },
    });
    const refused = await ctx
      .api(treasury)
      .patch(`/api/finance/other-movements/${movementId}`, {
        version: doc.version,
        reason: 'تعديل',
      })
      .expect(400);
    expect(refused.body.message).toContain('للمدير التنفيذي');
    await ctx
      .api(ctx.ceoToken)
      .patch(`/api/finance/other-movements/${movementId}`, {
        version: doc.version,
        reason: 'تعديل من المدير',
      })
      .expect(200);
  });

  it('lists the days with their totals, and finds a day by a file or a party', async () => {
    const res = await ctx
      .api(treasury)
      .get('/api/finance/journal/days')
      .expect(200);
    const day = res.body.items.find(
      (d: { date: string }) => d.date === yesterday,
    );
    expect(day.status).toBe('CLOSED');
    expect(day.operations).toBeGreaterThanOrEqual(1);
    expect(Number(day.totals.EGP.in)).toBeGreaterThanOrEqual(7777);
    const none = await ctx
      .api(treasury)
      .get(
        `/api/finance/journal/days?search=${encodeURIComponent('لا يوجد طرف بالاسم ده')}`,
      )
      .expect(200);
    expect(none.body.items).toHaveLength(0);
  });

  it('the CEO reopens a day until the end of today; then it closes again', async () => {
    await ctx
      .api(treasury)
      .post(`/api/finance/journal/days/${yesterday}/reopen`)
      .expect(403);
    const res = await ctx
      .api(ctx.ceoToken)
      .post(`/api/finance/journal/days/${yesterday}/reopen`)
      .expect(201);
    expect(res.body.status).toBe('REOPENED');
    await ctx
      .api(treasury)
      .post('/api/finance/other-movements', {
        accountId: cashEgp,
        kind: 'FUNDING',
        amount: 10,
        reason: 'سجّلت على اليوم المفتوح',
        movementDate: yesterday,
      })
      .expect(201);
    // the day it was reopened on has passed
    await ctx.prisma.journalDay.update({
      where: { date: new Date(`${yesterday}T00:00:00.000Z`) },
      data: { reopenedUntil: new Date(`${cairoDay(2)}T00:00:00.000Z`) },
    });
    expect(await days().closeDue()).toBeGreaterThanOrEqual(1);
    const after = await ctx
      .api(treasury)
      .get(`/api/finance/journal/days/${yesterday}`)
      .expect(200);
    expect(after.body.status).toBe('CLOSED');
    expect(after.body.reopenCount).toBe(1);
  });
});
