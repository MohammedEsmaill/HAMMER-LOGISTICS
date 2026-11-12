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

interface Item {
  id: number;
  name: string;
  price: string;
  perContainer: boolean;
}

describe('Finance: price lists and fixed settlement items (e2e)', () => {
  let ctx: TestContext;
  let fx: ShipmentFixtures;
  let treasury: string;
  let items: Item[];
  let shipmentId: number;

  const item = (name: string) => items.find((i) => i.name.includes(name))!;
  const version = async (id: number) =>
    (await ctx.prisma.custody.findUniqueOrThrow({ where: { id } })).version;
  const issue = async (holderType: 'CLEARER' | 'AGENT', extra = {}) =>
    (
      await ctx
        .api(treasury)
        .post('/api/finance/custodies', {
          shipmentId,
          holderType,
          purpose: holderType === 'CLEARER' ? 'CLEARANCE' : 'UNLOADING',
          amount: 10000,
          ...extra,
        })
        .expect(201)
    ).body.id as number;

  beforeAll(async () => {
    ctx = await createTestContext();
    fx = await shipmentFixtures(ctx, '3', '96');
    treasury = (await ctx.userWithRole('951', 'TREASURY_MANAGER', 'ACCOUNTS'))
      .token;
    const cash = await ctx.prisma.moneyAccount.findFirstOrThrow({
      where: { type: 'CASH', currency: 'EGP' },
    });
    await ctx
      .api(treasury)
      .post('/api/finance/other-movements', {
        accountId: cash.id,
        kind: 'FUNDING',
        amount: 200000,
        reason: 'تمويل الأسعار',
      })
      .expect(201);
    // a temporary-admission sea import through Alexandria with 2 containers
    shipmentId = (
      await ctx
        .api(fx.tokens.scan)
        .post(
          '/api/shipments',
          fx.seaImport({
            customsRegime: 'TEMPORARY',
            containers: [
              {
                containerNo: containerNo('TGHU183551'),
                type: 'HQ40',
                weight: 900,
              },
              {
                containerNo: containerNo('TGHU183552'),
                type: 'HQ20',
                weight: 900,
              },
            ],
          }),
        )
        .expect(201)
    ).body.id;
  });

  afterAll(() => closeTestContext(ctx));

  it('lists the agreed prices', async () => {
    const res = await ctx.api(treasury).get('/api/finance/prices').expect(200);
    expect(res.body.feeRates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          regime: 'TEMPORARY',
          firstContainer: '2600',
          extraContainer: '700',
        }),
        expect.objectContaining({
          regime: 'FINAL',
          firstContainer: '3000',
          extraContainer: '700',
        }),
      ]),
    );
    items = res.body.items;
    expect(items).toHaveLength(8);
    expect(item('الزراعة').price).toBe('200');
    expect(item('وزن الحاوية')).toMatchObject({
      price: '2500',
      perContainer: true,
    });
  });

  it('only the CEO changes them', async () => {
    await ctx
      .api(treasury)
      .patch('/api/finance/prices/fee-rates/TEMPORARY', {
        firstContainer: 1,
        extraContainer: 1,
      })
      .expect(403);
    await ctx
      .api(treasury)
      .patch(`/api/finance/prices/items/${item('الزراعة').id}`, { price: 1 })
      .expect(403);
    await ctx
      .api(ctx.ceoToken)
      .patch('/api/finance/prices/fee-rates/TEMPORARY', {
        firstContainer: 2650,
        extraContainer: 700,
      })
      .expect(200);
  });

  it('a renamed item renames its expense type too', async () => {
    const created = await ctx
      .api(ctx.ceoToken)
      .post('/api/finance/prices/items', { name: 'عرض تجربة', price: 150 })
      .expect(201);
    await ctx
      .api(ctx.ceoToken)
      .patch(`/api/finance/prices/items/${created.body.id}`, {
        name: 'عرض تجربة 2',
        isActive: false,
      })
      .expect(200);
    const type = await ctx.prisma.expenseType.findUniqueOrThrow({
      where: { id: created.body.expenseTypeId },
    });
    expect(type.name).toBe('عرض تجربة 2');
  });

  it('settles a clearer custody with fixed items at their price, per container where so', async () => {
    const id = await issue('CLEARER');
    const res = await ctx
      .api(treasury)
      .post(`/api/finance/custodies/${id}/settlement`, {
        version: await version(id),
        items: [
          // the amount sent is ignored: the price list decides
          { settlementItemId: item('الزراعة').id, amount: 1, receiptNo: '501' },
          {
            settlementItemId: item('وزن الحاوية').id,
            description: 'ميزان البوابة',
          },
          { expenseType: 'إذن إفراج', amount: 350, receiptNo: '502' },
        ],
      })
      .expect(201);
    expect(res.body.spentAmount).toBe('5550'); // 200 + 2500 × 2 + 350
    const lines = await ctx.prisma.custodyItem.findMany({
      where: { custodyId: id },
      orderBy: { lineNo: 'asc' },
    });
    expect(lines.map((l) => [Number(l.amount), l.quantity])).toEqual([
      [200, 1],
      [5000, 2],
      [350, 1],
    ]);
    // temporary admission through Alexandria: 2650 + 700 × 1
    const fee = await ctx.prisma.clearerFee.findUniqueOrThrow({
      where: { shipmentId },
    });
    expect(Number(fee.amount)).toBe(3350);
  });

  it('an item is used once per shipment, and on clearer custodies only', async () => {
    const second = await issue('CLEARER');
    const again = await ctx
      .api(treasury)
      .post(`/api/finance/custodies/${second}/settlement`, {
        version: await version(second),
        items: [{ settlementItemId: item('الزراعة').id, receiptNo: '503' }],
      })
      .expect(400);
    expect(again.body.message).toContain('اتسجل على الشحنة دي قبل كده');
    const twice = await ctx
      .api(treasury)
      .post(`/api/finance/custodies/${second}/settlement`, {
        version: await version(second),
        items: [
          { settlementItemId: item('واردات').id, receiptNo: '504' },
          { settlementItemId: item('واردات').id, receiptNo: '505' },
        ],
      })
      .expect(400);
    expect(twice.body.message).toContain('مينفعش يتكرر');

    const employee = await ctx.prisma.employee.create({
      data: {
        code: '952',
        fullName: 'مندوب الأسعار',
        nationalId: '29001010009520',
        phone: '01000000952',
        department: 'AGENTS',
        jobTitle: 'Agent',
        hireDate: new Date('2024-01-01'),
      },
    });
    const agent = await issue('AGENT', { agentEmployeeId: employee.id });
    const refused = await ctx
      .api(treasury)
      .post(`/api/finance/custodies/${agent}/settlement`, {
        version: await version(agent),
        items: [{ settlementItemId: item('أمن عام').id, receiptNo: '506' }],
      })
      .expect(400);
    expect(refused.body.message).toContain('لعهدة المستخلص بس');
  });

  it('the custody tells the screen what is already used and how many containers', async () => {
    const second = await issue('CLEARER');
    const res = await ctx
      .api(treasury)
      .get(`/api/finance/custodies/${second}`)
      .expect(200);
    expect(res.body.shipmentContainers).toBe(2);
    expect(res.body.usedSettlementItemIds).toEqual(
      expect.arrayContaining([item('الزراعة').id, item('وزن الحاوية').id]),
    );
  });
});
