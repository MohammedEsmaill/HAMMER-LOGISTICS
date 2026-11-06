import { closeTestContext, createTestContext, TestContext } from './helpers';

describe('Lookups (e2e)', () => {
  let ctx: TestContext;
  let scan: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    scan = (await ctx.userWithRole('401', 'SCAN')).token;
  });

  afterAll(() => closeTestContext(ctx));

  it('any logged-in user reads the lists; filters by kind and Egypt', async () => {
    const res = await ctx
      .api(scan)
      .get('/api/lookups/ports?kind=SEA&egyptian=true')
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(
      res.body.every(
        (p: { kind: string; isEgyptian: boolean }) =>
          p.kind === 'SEA' && p.isEgyptian,
      ),
    ).toBe(true);

    const world = await ctx
      .api(scan)
      .get('/api/lookups/ports?kind=AIR&egyptian=false&search=PVG')
      .expect(200);
    expect(world.body[0].country.code).toBe('CN');
  });

  it('searches countries in Arabic', async () => {
    const res = await ctx
      .api(scan)
      .get(`/api/lookups/countries?search=${encodeURIComponent('مصر')}`)
      .expect(200);
    expect(res.body[0].code).toBe('EG');
  });

  it('serves the 9 free zones and the inspection authorities', async () => {
    const zones = await ctx
      .api(scan)
      .get('/api/lookups/free-zones')
      .expect(200);
    expect(zones.body).toHaveLength(9);
    await ctx.api(scan).get('/api/lookups/inspection-authorities').expect(200);
  });

  it('refuses an unknown list name', () =>
    ctx.api(scan).get('/api/lookups/vessels').expect(400));

  it('only lookups.manage can change the lists', () =>
    ctx
      .api(scan)
      .post('/api/lookups/carriers', { name: 'New Line', kind: 'SEA' })
      .expect(403));

  it('carriers and yards need a kind; duplicates are refused', async () => {
    await ctx
      .api(ctx.ceoToken)
      .post('/api/lookups/storage-yards', { name: 'محطة حاويات الدخيلة' })
      .expect(400);
    await ctx
      .api(ctx.ceoToken)
      .post('/api/lookups/storage-yards', {
        name: 'محطة حاويات الدخيلة',
        kind: 'SEA',
      })
      .expect(201);
    await ctx
      .api(ctx.ceoToken)
      .post('/api/lookups/carriers', { name: 'MSC', kind: 'SEA' })
      .expect(409);
  });

  it('adds, edits and deletes an unused port', async () => {
    const egypt = await ctx.prisma.country.findUniqueOrThrow({
      where: { code: 'EG' },
    });
    const created = await ctx
      .api(ctx.ceoToken)
      .post('/api/lookups/ports', {
        name: 'Abu Qir',
        kind: 'SEA',
        countryId: egypt.id,
      })
      .expect(201);
    expect(created.body.isEgyptian).toBe(true);
    await ctx
      .api(ctx.ceoToken)
      .patch(`/api/lookups/ports/${created.body.id}`, { code: 'bad code' })
      .expect(400);
    await ctx
      .api(ctx.ceoToken)
      .delete(`/api/lookups/ports/${created.body.id}`)
      .expect(204);
  });
});
