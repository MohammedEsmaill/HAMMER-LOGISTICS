import { closeTestContext, createTestContext, TestContext } from './helpers';

describe('Lookups (e2e)', () => {
  let ctx: TestContext;
  let scan: string;
  let nafeza: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    scan = (await ctx.userWithRole('401', 'SCAN')).token;
    nafeza = (await ctx.userWithRole('402', 'NAFEZA', 'NAFEZA')).token;
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

  it('NAFEZA adds ports and lines but cannot edit or delete them', async () => {
    const line = await ctx
      .api(nafeza)
      .post('/api/lookups/carriers', { name: 'NEW LOCAL LINE', kind: 'SEA' })
      .expect(201);
    await ctx
      .api(nafeza)
      .patch(`/api/lookups/carriers/${line.body.id}`, { name: 'Renamed' })
      .expect(403);
    await ctx
      .api(nafeza)
      .delete(`/api/lookups/carriers/${line.body.id}`)
      .expect(403);
    const china = await ctx.prisma.country.findUniqueOrThrow({
      where: { code: 'CN' },
    });
    await ctx
      .api(nafeza)
      .post('/api/lookups/ports', {
        name: 'Lianyungang',
        kind: 'SEA',
        countryId: china.id,
      })
      .expect(201);
  });

  it('lists shipping lines busiest first, and the CEO reorders them', async () => {
    const res = await ctx
      .api(scan)
      .get('/api/lookups/carriers?kind=SEA')
      .expect(200);
    expect(res.body.slice(0, 3).map((c: { name: string }) => c.name)).toEqual([
      'MSC',
      'Maersk',
      'CMA CGM',
    ]);
    const nutic = res.body.find((c: { name: string }) => c.name === 'NUTIC');
    await ctx
      .api(ctx.ceoToken)
      .patch(`/api/lookups/carriers/${nutic.id}`, { sortOrder: 1 })
      .expect(200);
    const reordered = await ctx
      .api(scan)
      .get('/api/lookups/carriers?kind=SEA')
      .expect(200);
    expect(
      reordered.body.slice(0, 2).map((c: { name: string }) => c.name),
    ).toContain('NUTIC');
  });

  it('serves the yards of one port, and a yard must sit in an Egyptian port', async () => {
    const alexandria = await ctx.prisma.port.findFirstOrThrow({
      where: { code: 'EGALY' },
    });
    const yards = await ctx
      .api(scan)
      .get(`/api/lookups/storage-yards?portId=${alexandria.id}`)
      .expect(200);
    expect(yards.body.map((y: { name: string }) => y.name)).toContain(
      'تحيا مصر',
    );
    expect(
      yards.body.every(
        (y: { port: { id: number } }) => y.port.id === alexandria.id,
      ),
    ).toBe(true);

    const shanghai = await ctx.prisma.port.findFirstOrThrow({
      where: { code: 'CNSHA' },
    });
    await ctx
      .api(ctx.ceoToken)
      .post('/api/lookups/storage-yards', {
        name: 'Foreign yard',
        kind: 'SEA',
        portId: shanghai.id,
      })
      .expect(400);
  });

  it('sortOrder is only for carriers', () =>
    ctx
      .api(ctx.ceoToken)
      .post('/api/lookups/free-zones', { name: 'Zone X', sortOrder: 2 })
      .expect(400));
});
