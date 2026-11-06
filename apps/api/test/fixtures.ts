import { TestContext } from './helpers';

const QUOTE = {
  quoteFinalBase: 7000,
  quoteTemporaryBase: 6500,
  quoteImportExtraContainer: 1000,
  quoteExportBase: 5000,
  quoteExportExtraContainer: 800,
};

const CLEARER_PRICES = {
  importFinalBase: 3000,
  importTemporaryBase: 2600,
  importExtraContainer: 700,
  exportBase: 2000,
  exportExtraContainer: 500,
};

export interface ShipmentFixtures {
  tokens: { scan: string; opsA: string; opsB: string; nafeza: string };
  employees: { opsA: number; opsB: number; scan: number };
  ids: Record<
    | 'clientA'
    | 'factoryA'
    | 'clientB'
    | 'factoryB'
    | 'clearer'
    | 'china'
    | 'alexandria'
    | 'sokhna'
    | 'shanghai'
    | 'msc'
    | 'alexYard'
    | 'sokhnaYard'
    | 'authority',
    number
  >;
  /** A valid sea import for client A with a fresh ACID and MB/L; override any field. */
  seaImport: (extra?: object) => Record<string, unknown>;
}

/**
 * Users, clients, a clearer and lookup ids for shipment tests. `prefix` (one digit)
 * keeps employee codes, national ids, tax numbers and ACIDs apart between test files.
 */
export async function shipmentFixtures(
  ctx: TestContext,
  prefix: string,
): Promise<ShipmentFixtures> {
  const { prisma } = ctx;
  const scan = await ctx.userWithRole(`${prefix}01`, 'SCAN');
  const opsA = await ctx.userWithRole(`${prefix}02`, 'OPERATION', 'OPERATION');
  const opsB = await ctx.userWithRole(`${prefix}03`, 'OPERATION', 'OPERATION');
  const nafeza = await ctx.userWithRole(`${prefix}04`, 'NAFEZA', 'NAFEZA');

  const client = async (suffix: string, opsId: number) => {
    const res = await ctx
      .api(ctx.ceoToken)
      .post('/api/clients', {
        name: `Fixture client ${prefix}${suffix}`,
        mobile: '01012345678',
        email: 'c@c.com',
        importOperationEmployeeId: opsId,
        ...QUOTE,
        factories: [
          {
            name: `Factory ${prefix}${suffix}`,
            taxNumber: `8${prefix}000000${suffix}`.slice(0, 9),
            commercialRegister: '1',
            address: 'Alex',
          },
        ],
      })
      .expect(201);
    return res.body as { id: number; factories: { id: number }[] };
  };
  const a = await client('1', opsA.employeeId);
  const b = await client('2', opsB.employeeId);

  const clearer = await ctx
    .api(ctx.ceoToken)
    .post('/api/clearers', {
      fullName: `Fixture clearer ${prefix}`,
      phone: '0',
      nationalId: `260101000${prefix}0001`.slice(0, 14),
      ...CLEARER_PRICES,
    })
    .expect(201);

  const portByCode = (code: string) =>
    prisma.port.findFirstOrThrow({ where: { code } }).then((p) => p.id);
  const alexandria = await portByCode('EGALY');
  const sokhna = await portByCode('EGSOK');
  const yardIn = (portId: number) =>
    prisma.storageYard
      .findFirstOrThrow({ where: { portId } })
      .then((y) => y.id);

  const ids: ShipmentFixtures['ids'] = {
    clientA: a.id,
    factoryA: a.factories[0].id,
    clientB: b.id,
    factoryB: b.factories[0].id,
    clearer: clearer.body.id,
    china: (await prisma.country.findUniqueOrThrow({ where: { code: 'CN' } }))
      .id,
    alexandria,
    sokhna,
    shanghai: await portByCode('CNSHA'),
    msc: (await prisma.carrier.findFirstOrThrow({ where: { name: 'MSC' } })).id,
    alexYard: await yardIn(alexandria),
    sokhnaYard: await yardIn(sokhna),
    authority: (await prisma.inspectionAuthority.findFirstOrThrow()).id,
  };

  let serial = 0;
  const seaImport = (extra: object = {}) => {
    serial++;
    return {
      direction: 'IMPORT',
      mode: 'SEA',
      clientId: ids.clientA,
      factoryId: ids.factoryA,
      clearerId: ids.clearer,
      foreignPartyName: 'Supplier',
      countryId: ids.china,
      consignee: 'KNC',
      commodity: 'FABRIC',
      customsRegime: 'FINAL',
      packagesCount: 10,
      carrierId: ids.msc,
      loadingPortId: ids.shanghai,
      dischargePortId: ids.alexandria,
      referenceNumber: `${prefix}${String(serial).padStart(18, '0')}`,
      mblNumber: `FX${prefix}MBL${serial}`,
      voyageNo: 'V1',
      bookingNo: 'B1',
      loadType: 'FCL',
      containers: [{ containerNo: 'MKLU4022447', type: 'HQ40', weight: 1000 }],
      ...extra,
    };
  };

  return {
    tokens: {
      scan: scan.token,
      opsA: opsA.token,
      opsB: opsB.token,
      nafeza: nafeza.token,
    },
    employees: {
      opsA: opsA.employeeId,
      opsB: opsB.employeeId,
      scan: scan.employeeId,
    },
    ids,
    seaImport,
  };
}
