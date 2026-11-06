import { ShipmentFixtures, shipmentFixtures } from './fixtures';
import { closeTestContext, createTestContext, TestContext } from './helpers';

interface ShipmentBody {
  id: number;
  version: number;
  mblNumber: string;
  currentStage: string;
  stageHistory: { movement: string; reason?: string }[];
  inspections: { id: string; result: string }[];
}

describe('Shipment lifecycle (e2e)', () => {
  let ctx: TestContext;
  let fx: ShipmentFixtures;

  const register = async (extra: object = {}) =>
    (
      await ctx
        .api(fx.tokens.scan)
        .post('/api/shipments', fx.seaImport(extra))
        .expect(201)
    ).body as ShipmentBody;

  beforeAll(async () => {
    ctx = await createTestContext();
    fx = await shipmentFixtures(ctx, '6');
  });

  afterAll(() => closeTestContext(ctx));

  describe('editing basic data', () => {
    it('replaces the containers and recomputes weight and count', async () => {
      const s = await register();
      const res = await ctx
        .api(fx.tokens.scan)
        .patch(`/api/shipments/${s.id}/basic`, {
          version: s.version,
          commodity: 'YARN',
          containers: [
            { containerNo: 'MKLU4022447', type: 'HQ40', weight: 1000 },
            { containerNo: 'TCLU5965621', type: 'HQ20', weight: 500 },
            { containerNo: 'CSQU3054383', type: 'HQ40', weight: 250.25 },
          ],
        })
        .expect(200);
      expect(res.body.commodity).toBe('YARN');
      expect(res.body.containersCount).toBe(3);
      expect(res.body.totalWeight).toBe('1750.25');
      expect(res.body.version).toBe(s.version + 1);
    });

    it('refuses an edit made on a stale version', async () => {
      const s = await register();
      await ctx
        .api(fx.tokens.scan)
        .patch(`/api/shipments/${s.id}/basic`, {
          version: s.version,
          commodity: 'AA',
        })
        .expect(200);
      const res = await ctx
        .api(fx.tokens.scan)
        .patch(`/api/shipments/${s.id}/basic`, {
          version: s.version,
          commodity: 'BB',
        })
        .expect(409);
      expect(res.body.message).toContain('اتعدلت');
    });

    it('keeps bill numbers unique across shipments and frees the old number', async () => {
      const first = await register({ hblNumber: 'FX6-HBL-OLD' });
      const second = await register();
      await ctx
        .api(fx.tokens.scan)
        .patch(`/api/shipments/${second.id}/basic`, {
          version: second.version,
          mblNumber: first.mblNumber,
        })
        .expect(409);

      await ctx
        .api(fx.tokens.scan)
        .patch(`/api/shipments/${first.id}/basic`, {
          version: first.version,
          hblNumber: null,
        })
        .expect(200);
      await register({ hblNumber: 'FX6-HBL-OLD' }); // free again
    });

    it('applies the type rules to the merged shipment', async () => {
      const s = await register();
      await ctx
        .api(fx.tokens.scan)
        .patch(`/api/shipments/${s.id}/basic`, {
          version: s.version,
          loadingPortId: fx.ids.alexandria,
        })
        .expect(400);
    });

    it('moving the shipment to another client brings that client’s operation employee', async () => {
      const s = await register();
      const res = await ctx
        .api(fx.tokens.scan)
        .patch(`/api/shipments/${s.id}/basic`, {
          version: s.version,
          clientId: fx.ids.clientB,
          factoryId: fx.ids.factoryB,
        })
        .expect(200);
      expect(res.body.operationEmployee.id).toBe(fx.employees.opsB);
    });
  });

  describe('operation data and reassignment', () => {
    it('the operation employee edits vessel and ETA of their own shipments only', async () => {
      const own = await register();
      const res = await ctx
        .api(fx.tokens.opsA)
        .patch(`/api/shipments/${own.id}/operation`, {
          version: own.version,
          vesselName: 'MSC OLIVIA',
          eta: '2026-12-01',
        })
        .expect(200);
      expect(res.body.vesselName).toBe('MSC OLIVIA');

      await ctx
        .api(fx.tokens.opsB)
        .patch(`/api/shipments/${own.id}/operation`, {
          version: res.body.version,
          vesselName: 'X',
        })
        .expect(404);
      await ctx
        .api(fx.tokens.opsA)
        .patch(`/api/shipments/${own.id}/basic`, {
          version: res.body.version,
          commodity: 'XX',
        })
        .expect(403);
    });

    it('only the CEO hands a shipment to another operation employee', async () => {
      const s = await register();
      await ctx
        .api(fx.tokens.scan)
        .patch(`/api/shipments/${s.id}/operation-employee`, {
          version: s.version,
          operationEmployeeId: fx.employees.opsB,
        })
        .expect(403);
      await ctx
        .api(ctx.ceoToken)
        .patch(`/api/shipments/${s.id}/operation-employee`, {
          version: s.version,
          operationEmployeeId: fx.employees.scan,
        })
        .expect(400);
      const res = await ctx
        .api(ctx.ceoToken)
        .patch(`/api/shipments/${s.id}/operation-employee`, {
          version: s.version,
          operationEmployeeId: fx.employees.opsB,
        })
        .expect(200);
      expect(res.body.operationEmployee.id).toBe(fx.employees.opsB);
    });
  });

  describe('customs tab and inspections', () => {
    it('NAFEZA fills the import fields; export-only fields are refused', async () => {
      const s = await register();
      const res = await ctx
        .api(fx.tokens.nafeza)
        .patch(`/api/shipments/${s.id}/customs`, {
          version: s.version,
          certificateNo: '510338',
          deliveryOrderDate: '2026-11-02',
          releaseDate: '2026-11-10',
        })
        .expect(200);
      expect(res.body.certificateNo).toBe('510338');

      const refused = await ctx
        .api(fx.tokens.nafeza)
        .patch(`/api/shipments/${s.id}/customs`, {
          version: res.body.version,
          shippedDate: '2026-11-10',
        })
        .expect(400);
      expect(refused.body.message.join()).toContain('تاريخ الشحن');
    });

    it('the storage yard must be in the shipment’s Egyptian port', async () => {
      const s = await register(); // discharges at Alexandria
      await ctx
        .api(fx.tokens.nafeza)
        .patch(`/api/shipments/${s.id}/customs`, {
          version: s.version,
          storageYardId: fx.ids.sokhnaYard,
        })
        .expect(400);
      const res = await ctx
        .api(fx.tokens.nafeza)
        .patch(`/api/shipments/${s.id}/customs`, {
          version: s.version,
          storageYardId: fx.ids.alexYard,
        })
        .expect(200);
      expect(res.body.storageYard.id).toBe(fx.ids.alexYard);
    });

    it('adds, resolves and removes an inspection request', async () => {
      const s = await register();
      const added = await ctx
        .api(fx.tokens.nafeza)
        .post(`/api/shipments/${s.id}/inspections`, {
          version: s.version,
          authorityId: fx.ids.authority,
          requestedAt: '2026-11-03',
        })
        .expect(201);
      const item = (added.body as ShipmentBody).inspections[0];
      expect(item.result).toBe('PENDING');

      await ctx
        .api(fx.tokens.nafeza)
        .patch(`/api/shipments/${s.id}/inspections/${item.id}`, {
          version: added.body.version,
          resultDate: '2026-11-05',
        })
        .expect(400); // a result date needs a result

      const resolved = await ctx
        .api(fx.tokens.nafeza)
        .patch(`/api/shipments/${s.id}/inspections/${item.id}`, {
          version: added.body.version,
          result: 'ACCEPTED',
          resultDate: '2026-11-05',
        })
        .expect(200);
      expect(resolved.body.inspections[0].result).toBe('ACCEPTED');

      const removed = await ctx
        .api(fx.tokens.nafeza)
        .delete(
          `/api/shipments/${s.id}/inspections/${item.id}?version=${resolved.body.version}`,
        )
        .expect(200);
      expect(removed.body.inspections).toHaveLength(0);
    });

    it('refuses an unknown inspection authority', async () => {
      const s = await register();
      await ctx
        .api(fx.tokens.nafeza)
        .post(`/api/shipments/${s.id}/inspections`, {
          version: s.version,
          authorityId: 999999,
          requestedAt: '2026-11-03',
        })
        .expect(400);
    });
  });

  describe('stages', () => {
    let s: ShipmentBody;
    const move = (token: string, to: string, extra: object = {}) =>
      ctx.api(token).post(`/api/shipments/${s.id}/stage`, {
        version: s.version,
        to,
        ...extra,
      });

    beforeAll(async () => {
      s = await register();
    });

    const step = async (token: string, to: string, extra: object = {}) => {
      const res = await move(token, to, extra).expect(201);
      s = res.body;
      return res;
    };

    it('moves forward one stage at a time', async () => {
      await step(fx.tokens.opsA, 'IN_TRANSIT');
      const skip = await move(fx.tokens.opsA, 'UNLOADING').expect(400);
      expect(skip.body.message).toContain('وصلت');
    });

    it('NAFEZA cannot move operation stages but moves customs stages', async () => {
      await move(fx.tokens.nafeza, 'ARRIVED').expect(403);
      await step(fx.tokens.opsA, 'ARRIVED');
      await step(fx.tokens.opsA, 'UNLOADING');
      await step(fx.tokens.opsA, 'UNLOADED');
      await step(fx.tokens.nafeza, 'DO_COLLECTED');
      expect(s.currentStage).toBe('DO_COLLECTED');
    });

    it('goes back to any earlier stage with an optional reason', async () => {
      const res = await step(fx.tokens.opsA, 'ARRIVED', {
        reason: 'تصحيح',
      });
      const last = res.body.stageHistory.at(-1);
      expect(last.movement).toBe('BACKWARD');
      expect(last.reason).toBe('تصحيح');
      expect(res.body.stageHistory).toHaveLength(7);
    });

    it('refuses a future date, a stage of another flow and a stale version', async () => {
      await move(fx.tokens.opsA, 'UNLOADING', {
        occurredAt: '2999-01-01',
      }).expect(400);
      await move(fx.tokens.opsA, 'SHIPPED').expect(400);
      await ctx
        .api(fx.tokens.opsA)
        .post(`/api/shipments/${s.id}/stage`, {
          version: s.version - 1,
          to: 'UNLOADING',
        })
        .expect(409);
    });

    it('records a late stage with the date it happened', async () => {
      const res = await step(fx.tokens.opsA, 'UNLOADING', {
        occurredAt: '2026-11-01T08:00:00.000Z',
      });
      expect(res.body.stageHistory.at(-1).at).toBe('2026-11-01T08:00:00.000Z');
      const audits = await ctx.prisma.auditLog.count({
        where: {
          entity: 'shipment',
          entityId: String(s.id),
          action: 'STAGE_MOVE',
        },
      });
      expect(audits).toBe(7);
    });
  });
});
