import { closeTestContext, createTestContext, TestContext } from './helpers';

describe('Shipment registration (e2e)', () => {
  let ctx: TestContext;
  let scan: string;
  let opsA: { token: string; employeeId: number };
  let opsB: { token: string; employeeId: number };
  let clearerToken: string;
  const ids = {} as Record<
    | 'clientA'
    | 'factoryA'
    | 'clientB'
    | 'factoryB'
    | 'clearer'
    | 'otherClearer'
    | 'china'
    | 'alexandria'
    | 'shanghai'
    | 'cairo'
    | 'pudong'
    | 'msc'
    | 'egyptair'
    | 'freeZone',
    number
  >;

  let acid = 1000000000000000000n;
  const nextAcid = () => String(acid++);

  /** A valid sea import for client A; override any field. */
  const seaImport = (extra: object = {}) => ({
    direction: 'IMPORT',
    mode: 'SEA',
    clientId: ids.clientA,
    factoryId: ids.factoryA,
    clearerId: ids.clearer,
    foreignPartyName: 'Qingdao Textile Co.',
    countryId: ids.china,
    consignee: 'KNC',
    commodity: 'FABRIC',
    customsRegime: 'FINAL',
    packagesCount: 120,
    carrierId: ids.msc,
    loadingPortId: ids.shanghai,
    dischargePortId: ids.alexandria,
    referenceNumber: nextAcid(),
    mblNumber: `MBL${acid}`,
    voyageNo: 'V12',
    bookingNo: 'BK1',
    loadType: 'FCL',
    containers: [
      { containerNo: 'MKLU4022447', type: 'HQ40', weight: 15350.5 },
      { containerNo: 'TCLU5965621', type: 'HQ20', weight: 9000 },
    ],
    ...extra,
  });

  beforeAll(async () => {
    ctx = await createTestContext();
    const { prisma } = ctx;
    scan = (await ctx.userWithRole('501', 'SCAN')).token;
    opsA = await ctx.userWithRole('502', 'OPERATION', 'OPERATION');
    opsB = await ctx.userWithRole('503', 'OPERATION', 'OPERATION');
    const relations = (
      await ctx.userWithRole('504', 'FINANCIAL_RELATIONS', 'ACCOUNTS')
    ).token;

    const quote = {
      quoteFinalBase: 7000,
      quoteTemporaryBase: 6500,
      quoteImportExtraContainer: 1000,
      quoteExportBase: 5000,
      quoteExportExtraContainer: 800,
    };
    const client = async (name: string, opsId: number, tax: string) =>
      (
        await ctx
          .api(relations)
          .post('/api/clients', {
            name,
            mobile: '01012345678',
            email: 'c@c.com',
            importOperationEmployeeId: opsId,
            ...quote,
            factories: [
              {
                name: `${name} factory`,
                taxNumber: tax,
                commercialRegister: '1',
                address: 'Alex',
              },
            ],
          })
          .expect(201)
      ).body;
    const a = await client('Shipments client A', opsA.employeeId, '900000001');
    const b = await client('Shipments client B', opsB.employeeId, '900000002');
    ids.clientA = a.id;
    ids.factoryA = a.factories[0].id;
    ids.clientB = b.id;
    ids.factoryB = b.factories[0].id;

    const clearer = async (nationalId: string) =>
      (
        await ctx
          .api(ctx.ceoToken)
          .post('/api/clearers', {
            fullName: `Clearer ${nationalId}`,
            phone: '0',
            nationalId,
            importFinalBase: 3000,
            importTemporaryBase: 2600,
            importExtraContainer: 700,
            exportBase: 2000,
            exportExtraContainer: 500,
          })
          .expect(201)
      ).body.id as number;
    ids.clearer = await clearer('27001010000501');
    ids.otherClearer = await clearer('27001010000502');

    const clearerRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'CLEARER' },
    });
    await ctx
      .api(ctx.ceoToken)
      .post('/api/users', {
        accountType: 'CLEARER',
        ownerId: ids.clearer,
        email: 'clearer501@hammerline.com',
        password: 'Passw0rd1',
        roleId: clearerRole.id,
      })
      .expect(201);
    clearerToken = await ctx.login('clearer501@hammerline.com', 'Passw0rd1');
    const port = (code: string) =>
      prisma.port.findFirstOrThrow({ where: { code } }).then((p) => p.id);
    ids.alexandria = await port('EGALY');
    ids.shanghai = await port('CNSHA');
    ids.cairo = await port('CAI');
    ids.pudong = await port('PVG');
    ids.china = (
      await prisma.country.findUniqueOrThrow({ where: { code: 'CN' } })
    ).id;
    ids.msc = (
      await prisma.carrier.findFirstOrThrow({ where: { name: 'MSC' } })
    ).id;
    ids.egyptair = (
      await prisma.carrier.findFirstOrThrow({
        where: { name: 'EgyptAir Cargo' },
      })
    ).id;
    ids.freeZone = (await prisma.freeZone.findFirstOrThrow()).id;
  });

  afterAll(() => closeTestContext(ctx));

  describe('sea import', () => {
    let first: { id: number; fileNo: string; mblNumber: string };

    it('registers with a yearly file number, summed weight and the client’s operation employee', async () => {
      const res = await ctx
        .api(scan)
        .post('/api/shipments', seaImport())
        .expect(201);
      first = res.body;
      expect(res.body.fileNo).toMatch(/^HL\d{2}-\d{4}$/);
      expect(res.body.totalWeight).toBe('24350.5');
      expect(res.body.containersCount).toBe(2);
      expect(res.body.operationEmployee.id).toBe(opsA.employeeId);
      expect(res.body.currentStage).toBe('REGISTERED');
      expect(res.body.stageHistory).toHaveLength(1);
      expect(res.body.hblDisplay).toBe(res.body.mblNumber); // no HB/L sent
      expect(res.body.stages[0]).toMatchObject({
        label: 'تم التسجيل',
        done: true,
      });
    });

    it('numbers the next file one higher', async () => {
      const res = await ctx
        .api(scan)
        .post('/api/shipments', seaImport())
        .expect(201);
      const n = (fileNo: string) => Number(fileNo.slice(-4));
      expect(n(res.body.fileNo)).toBe(n(first.fileNo) + 1);
    });

    it('refuses a used ACID, naming the file that has it', async () => {
      const used = await ctx.prisma.shipment.findUniqueOrThrow({
        where: { id: first.id },
      });
      const res = await ctx
        .api(scan)
        .post(
          '/api/shipments',
          seaImport({ referenceNumber: used.referenceNumber }),
        )
        .expect(409);
      expect(res.body.message).toContain(first.fileNo);
    });

    it('refuses another shipment’s MB/L even in the HB/L field', async () => {
      const res = await ctx
        .api(scan)
        .post(
          '/api/shipments',
          seaImport({ hblNumber: first.mblNumber, mblNumber: 'NEWMBL1' }),
        )
        .expect(409);
      expect(res.body.message).toContain(first.fileNo);
    });

    it('allows the same number as HB/L and MB/L on one shipment', () =>
      ctx
        .api(scan)
        .post(
          '/api/shipments',
          seaImport({ hblNumber: 'SAMEBL1', mblNumber: 'SAMEBL1' }),
        )
        .expect(201));

    it('checks container numbers, LCL rules and port sides', async () => {
      const bad = await ctx
        .api(scan)
        .post(
          '/api/shipments',
          seaImport({
            containers: [
              { containerNo: 'MKLU4022448', type: 'HQ40', weight: 1 },
            ],
          }),
        )
        .expect(400);
      expect(bad.body.message.join()).toContain('MKLU4022448');

      await ctx
        .api(scan)
        .post(
          '/api/shipments',
          seaImport({
            loadType: 'LCL',
            containers: [
              { type: 'LCL', weight: 1 },
              { type: 'LCL', weight: 1 },
            ],
          }),
        )
        .expect(400);

      const lcl = await ctx
        .api(scan)
        .post(
          '/api/shipments',
          seaImport({
            loadType: 'LCL',
            containers: [{ type: 'LCL', weight: 800 }],
          }),
        )
        .expect(201);
      expect(lcl.body.containers[0].containerNo).toBeNull();

      const ports = await ctx
        .api(scan)
        .post('/api/shipments', seaImport({ loadingPortId: ids.alexandria }))
        .expect(400);
      expect(ports.body.message.join()).toContain(
        'ميناء الشحن لازم يكون ميناء عالمي',
      );
    });

    it('refuses a factory of another client and a missing regime', async () => {
      await ctx
        .api(scan)
        .post('/api/shipments', seaImport({ factoryId: ids.factoryB }))
        .expect(400);
      await ctx
        .api(scan)
        .post('/api/shipments', seaImport({ customsRegime: undefined }))
        .expect(400);
    });
  });

  describe('other types', () => {
    it('free zone: no carrier, ports or containers; weight sent directly', async () => {
      const base = {
        direction: 'IMPORT',
        mode: 'FREE_ZONE',
        clientId: ids.clientA,
        factoryId: ids.factoryA,
        clearerId: ids.clearer,
        foreignPartyName: 'Supplier',
        countryId: ids.china,
        consignee: 'KNC',
        commodity: 'YARN',
        customsRegime: 'TEMPORARY',
        packagesCount: 10,
        totalWeight: 500,
        freeZoneId: ids.freeZone,
      };
      const refused = await ctx
        .api(scan)
        .post('/api/shipments', { ...base, carrierId: ids.msc })
        .expect(400);
      expect(refused.body.message.join()).toContain('مش مستخدم');
      const res = await ctx.api(scan).post('/api/shipments', base).expect(201);
      expect(res.body.freeZone.id).toBe(ids.freeZone);
      expect(res.body.containers).toHaveLength(0);
      expect(res.body.stages.at(-1).label).toBe('تم تسليم الإفراج');
    });

    it('air import: airports and airline, no containers', async () => {
      const air = {
        direction: 'IMPORT',
        mode: 'AIR',
        clientId: ids.clientA,
        factoryId: ids.factoryA,
        clearerId: ids.clearer,
        foreignPartyName: 'Supplier',
        countryId: ids.china,
        consignee: 'KNC',
        commodity: 'SPARE PARTS',
        customsRegime: 'FINAL',
        packagesCount: 4,
        totalWeight: 120.25,
        carrierId: ids.egyptair,
        loadingPortId: ids.pudong,
        dischargePortId: ids.cairo,
        referenceNumber: nextAcid(),
        mblNumber: 'MAWB-077-1',
        voyageNo: 'MS956',
        bookingNo: 'B1',
      };
      await ctx
        .api(scan)
        .post('/api/shipments', { ...air, carrierId: ids.msc })
        .expect(400);
      const res = await ctx.api(scan).post('/api/shipments', air).expect(201);
      expect(res.body.mblNumber).toBe('MAWB-077-1');
      expect(res.body.stages.map((s: { stage: string }) => s.stage)).toContain(
        'RECEIVED_AT_WAREHOUSE',
      );
    });

    it('sea export: no regime, bills optional, export goes to the import operation employee when none is set', async () => {
      const res = await ctx
        .api(scan)
        .post('/api/shipments', {
          direction: 'EXPORT',
          mode: 'SEA',
          clientId: ids.clientA,
          factoryId: ids.factoryA,
          clearerId: ids.clearer,
          foreignPartyName: 'Importer GmbH',
          countryId: ids.china,
          consignee: 'Importer GmbH',
          commodity: 'GARMENTS',
          packagesCount: 300,
          carrierId: ids.msc,
          loadingPortId: ids.alexandria,
          dischargePortId: ids.shanghai,
          referenceNumber: nextAcid(),
          voyageNo: 'V9',
          bookingNo: 'BK9',
          loadType: 'FCL',
          containers: [
            { containerNo: 'CSQU3054383', type: 'HQ40', weight: 12000 },
          ],
        })
        .expect(201);
      expect(res.body.customsRegime).toBeNull();
      expect(res.body.operationEmployee.id).toBe(opsA.employeeId);
      expect(res.body.stages.at(-1).label).toBe('تم التسليم للمستورد');
    });

    it('refuses an export free-zone shipment', () =>
      ctx
        .api(scan)
        .post(
          '/api/shipments',
          seaImport({ direction: 'EXPORT', mode: 'FREE_ZONE' }),
        )
        .expect(400));
  });

  describe('who sees what', () => {
    let clientBShipment: number;

    beforeAll(async () => {
      clientBShipment = (
        await ctx
          .api(scan)
          .post(
            '/api/shipments',
            seaImport({
              clientId: ids.clientB,
              factoryId: ids.factoryB,
              clearerId: ids.otherClearer,
              containers: [
                { containerNo: 'CSQU3054383', type: 'HQ40', weight: 1 },
              ],
            }),
          )
          .expect(201)
      ).body.id;
    });

    it('an operation employee sees only their own shipments; others read as not found', async () => {
      const list = await ctx
        .api(opsA.token)
        .get('/api/shipments?pageSize=200')
        .expect(200);
      expect(list.body.total).toBeGreaterThan(0);
      expect(
        list.body.items.every(
          (s: { operationEmployee: { id: number } }) =>
            s.operationEmployee.id === opsA.employeeId,
        ),
      ).toBe(true);
      await ctx
        .api(opsA.token)
        .get(`/api/shipments/${clientBShipment}`)
        .expect(404);
      await ctx
        .api(opsB.token)
        .get(`/api/shipments/${clientBShipment}`)
        .expect(200);
    });

    it('a clearer sees only the shipments they clear', async () => {
      await ctx
        .api(clearerToken)
        .get(`/api/shipments/${clientBShipment}`)
        .expect(404);
      const list = await ctx
        .api(clearerToken)
        .get('/api/shipments')
        .expect(200);
      expect(list.body.total).toBeGreaterThan(0);
    });

    it('only SCAN registers; search finds a shipment by container number', async () => {
      await ctx.api(opsA.token).post('/api/shipments', seaImport()).expect(403);
      const res = await ctx
        .api(scan)
        .get('/api/shipments?search=tclu5965621')
        .expect(200);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it('records the registration in the audit log', async () => {
      const count = await ctx.prisma.auditLog.count({
        where: { entity: 'shipment', action: 'CREATE' },
      });
      expect(count).toBeGreaterThan(5);
    });
  });
});
