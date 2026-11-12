import { closeTestContext, createTestContext, TestContext } from './helpers';

const employeeBody = (code: string, extra: object = {}) => ({
  code,
  fullName: `Person ${code}`,
  nationalId: `2850505${code.padStart(7, '0')}`,
  phone: '01111111111',
  department: 'OPERATION',
  jobTitle: 'Operation',
  hireDate: '2025-01-01',
  ...extra,
});

const quote = {
  quoteFinalBase: 7000,
  quoteTemporaryBase: 6500,
  quoteImportExtraContainer: 1000,
  quoteExportBase: 5000,
  quoteExportExtraContainer: 800,
};

describe('Employees, clearers, clients (e2e)', () => {
  let ctx: TestContext;
  let hr: string;
  let scan: string;
  let relations: string;
  let accountant: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    hr = (await ctx.userWithRole('201', 'HR', 'MANAGEMENT')).token;
    scan = (await ctx.userWithRole('202', 'SCAN')).token;
    relations = (
      await ctx.userWithRole('203', 'FINANCIAL_RELATIONS', 'ACCOUNTS')
    ).token;
    accountant = (await ctx.userWithRole('204', 'ACCOUNTANT', 'ACCOUNTS'))
      .token;
  });

  afterAll(() => closeTestContext(ctx));

  describe('employees', () => {
    it('HR creates an employee with a salary; SCAN cannot list employees', async () => {
      const res = await ctx
        .api(hr)
        .post('/api/employees', employeeBody('301', { basicSalary: 9500.5 }))
        .expect(201);
      expect(res.body.basicSalary).toBe('9500.5');
      await ctx.api(scan).get('/api/employees').expect(403);
    });

    it('hides and protects the salary from a role without salary access', async () => {
      await ctx
        .api(ctx.ceoToken)
        .post('/api/roles', {
          name: 'Records clerk',
          permissions: ['employees.manage'],
        })
        .expect(201);
      const clerk = await ctx.userWithRole(
        '205',
        'Records clerk',
        'MANAGEMENT',
      );
      const list = await ctx
        .api(clerk.token)
        .get('/api/employees?search=Person 301')
        .expect(200);
      expect(list.body.items[0]).not.toHaveProperty('basicSalary');
      await ctx
        .api(clerk.token)
        .post('/api/employees', employeeBody('302', { basicSalary: 100 }))
        .expect(403);
    });

    it('refuses a hire date after today', async () => {
      const res = await ctx
        .api(hr)
        .post('/api/employees', employeeBody('309', { hireDate: '2999-01-01' }))
        .expect(400);
      expect(res.body.message.join()).toContain('تاريخ التعيين');
    });

    it('rejects a duplicate fingerprint code and a malformed national id', async () => {
      const dup = await ctx
        .api(hr)
        .post('/api/employees', employeeBody('301'))
        .expect(409);
      expect(dup.body.message).toContain('البصمة');
      await ctx
        .api(hr)
        .post('/api/employees', employeeBody('303', { nationalId: '123' }))
        .expect(400);
    });

    it('marking an employee as LEFT logs their account out and reports the handover', async () => {
      const leaver = await ctx.userWithRole('206', 'OPERATION', 'OPERATION');
      await ctx
        .api(relations)
        .post('/api/clients', {
          name: 'Leaver client',
          mobile: '01012345678',
          email: 'a@b.com',
          importOperationEmployeeId: leaver.employeeId,
          ...quote,
        })
        .expect(201);

      const res = await ctx
        .api(hr)
        .patch(`/api/employees/${leaver.employeeId}`, { status: 'LEFT' })
        .expect(200);
      expect(res.body.handover).toEqual({ clients: 1, activeShipments: 0 });
      expect(res.body.employee.leaveDate).not.toBeNull();
      await ctx.api(leaver.token).get('/api/auth/me').expect(401);

      // still holds a client: cannot be deleted until handed over
      await ctx
        .api(hr)
        .delete(`/api/employees/${leaver.employeeId}`)
        .expect(409);
    });

    it('options list only active employees of the asked department', async () => {
      const res = await ctx
        .api(relations)
        .get('/api/employees/options?department=OPERATION')
        .expect(200);
      const departments = new Set(
        res.body.map((e: { department: string }) => e.department),
      );
      expect([...departments]).toEqual(['OPERATION']);
      expect(
        res.body.find((e: { code: string }) => e.code === '206'),
      ).toBeUndefined();
    });
  });

  describe('clearers', () => {
    const prices = {
      importFinalBase: 3000,
      importTemporaryBase: 2600,
      importExtraContainer: 700,
      exportBase: 2000,
      exportExtraContainer: 500,
    };
    const clearerBody = {
      fullName: 'Clearer One',
      phone: '01222222222',
      nationalId: '28001010000001',
      ...prices,
    };

    it('only the CEO adds clearers and changes their data and prices', async () => {
      await ctx.api(hr).post('/api/clearers', clearerBody).expect(403);
      await ctx.api(hr).get('/api/clearers').expect(403);

      const res = await ctx
        .api(ctx.ceoToken)
        .post('/api/clearers', clearerBody)
        .expect(201);
      expect(res.body.importExtraContainer).toBe('700');

      const updated = await ctx
        .api(ctx.ceoToken)
        .patch(`/api/clearers/${res.body.id}/prices`, {
          ...prices,
          importFinalBase: 3200,
        })
        .expect(200);
      expect(updated.body.importFinalBase).toBe('3200');
    });

    it('works in Egyptian ports and free zones (جهة التخليص), listed first in the shipment form', async () => {
      const ports = await ctx.prisma.port.findMany({
        where: { code: { in: ['EGALY', 'CNSHA'] } },
      });
      const alexandria = ports.find((p) => p.code === 'EGALY')!;
      const shanghai = ports.find((p) => p.code === 'CNSHA');
      const zone = await ctx.prisma.freeZone.findFirstOrThrow();
      const clearer = await ctx.prisma.clearer.findFirstOrThrow({
        where: { nationalId: '28001010000001' },
      });
      if (shanghai) {
        await ctx
          .api(ctx.ceoToken)
          .patch(`/api/clearers/${clearer.id}`, { portIds: [shanghai.id] })
          .expect(400);
      }
      const res = await ctx
        .api(ctx.ceoToken)
        .patch(`/api/clearers/${clearer.id}`, {
          portIds: [alexandria.id],
          freeZoneIds: [zone.id],
        })
        .expect(200);
      expect(res.body.ports.map((p: { id: number }) => p.id)).toEqual([
        alexandria.id,
      ]);
      expect(res.body.freeZones.map((z: { id: number }) => z.id)).toEqual([
        zone.id,
      ]);
      const filtered = await ctx
        .api(ctx.ceoToken)
        .get(`/api/clearers?portId=${alexandria.id}`)
        .expect(200);
      expect(filtered.body.items.map((c: { id: number }) => c.id)).toContain(
        clearer.id,
      );
      const options = await ctx
        .api(ctx.ceoToken)
        .get('/api/clearers/options')
        .expect(200);
      expect(
        options.body.find((c: { id: number }) => c.id === clearer.id),
      ).toMatchObject({
        portIds: [alexandria.id],
        freeZoneIds: [zone.id],
      });
    });

    it('a clearer cannot be created without prices', () =>
      ctx
        .api(ctx.ceoToken)
        .post('/api/clearers', {
          fullName: 'No prices',
          phone: '0',
          nationalId: '28001010000003',
        })
        .expect(400));

    it('HR can still open a login account for a clearer', async () => {
      const clearer = await ctx.prisma.clearer.findFirstOrThrow({
        where: { nationalId: '28001010000001' },
      });
      const role = await ctx.prisma.role.findUniqueOrThrow({
        where: { name: 'CLEARER' },
      });
      const candidates = await ctx
        .api(hr)
        .get('/api/users/candidates?type=CLEARER')
        .expect(200);
      expect(candidates.body.map((c: { id: number }) => c.id)).toContain(
        clearer.id,
      );
      await ctx
        .api(hr)
        .post('/api/users', {
          accountType: 'CLEARER',
          ownerId: clearer.id,
          email: 'clearer.one@hammerline.com',
          password: 'Passw0rd1',
          roleId: role.id,
        })
        .expect(201);
    });

    it('SCAN can list clearer options for the shipment form', async () => {
      const res = await ctx.api(scan).get('/api/clearers/options').expect(200);
      expect(res.body).toContainEqual({
        id: expect.any(Number),
        fullName: 'Clearer One',
        portIds: expect.any(Array),
        freeZoneIds: expect.any(Array),
      });
    });
  });

  describe('clients and factories', () => {
    let operationId: number;
    let clientId: number;

    beforeAll(async () => {
      operationId = (await ctx.userWithRole('207', 'OPERATION', 'OPERATION'))
        .employeeId;
    });

    it('financial relations creates a client with its factories', async () => {
      const res = await ctx
        .api(relations)
        .post('/api/clients', {
          name: 'EBM TEXTILE',
          mobile: '01098765432',
          email: 'info@ebm.com',
          importOperationEmployeeId: operationId,
          ...quote,
          factories: [
            {
              name: 'EBM Factory 1',
              taxNumber: '111222333',
              commercialRegister: '5544',
              address: 'Borg El Arab',
            },
          ],
        })
        .expect(201);
      clientId = res.body.id;
      expect(res.body.factories).toHaveLength(1);
      expect(res.body.quoteFinalBase).toBe('7000');
    });

    it('lists client options (id and name only) for pickers', async () => {
      const res = await ctx
        .api(relations)
        .get('/api/clients/options')
        .expect(200);
      expect(res.body).toContainEqual({ id: clientId, name: 'EBM TEXTILE' });
    });

    it("lists a client's factory options (id, name, tax number only)", async () => {
      const res = await ctx
        .api(relations)
        .get(`/api/clients/${clientId}/factories/options`)
        .expect(200);
      expect(res.body).toEqual([
        {
          id: expect.any(Number),
          name: 'EBM Factory 1',
          taxNumber: '111222333',
        },
      ]);
    });

    it('refuses an operation employee from another department', async () => {
      const notOps = await ctx.prisma.employee.findFirstOrThrow({
        where: { code: '202' },
      });
      await ctx
        .api(relations)
        .post('/api/clients', {
          name: 'Wrong ops',
          mobile: '01098765433',
          email: 'x@y.com',
          importOperationEmployeeId: notOps.id,
          ...quote,
        })
        .expect(400);
    });

    it('only financial relations and the CEO see the quote', async () => {
      // the clients screen is not theirs: they pick clients from the short list
      await ctx.api(scan).get(`/api/clients/${clientId}`).expect(403);
      await ctx.api(accountant).get(`/api/clients/${clientId}`).expect(403);
      const forRelations = await ctx
        .api(relations)
        .get(`/api/clients/${clientId}`)
        .expect(200);
      expect(forRelations.body.quoteFinalBase).toBe('7000');
      const forCeo = await ctx
        .api(ctx.ceoToken)
        .get(`/api/clients/${clientId}`)
        .expect(200);
      expect(forCeo.body.quoteFinalBase).toBe('7000');
      await ctx.api(scan).post('/api/clients', {}).expect(403);
    });

    it('lists a client’s factories and rejects a duplicate tax number', async () => {
      const factories = await ctx
        .api(relations)
        .get(`/api/clients/${clientId}/factories`)
        .expect(200);
      expect(factories.body).toHaveLength(1);
      await ctx
        .api(relations)
        .post(`/api/clients/${clientId}/factories`, {
          name: 'Copy',
          taxNumber: '111222333',
          commercialRegister: '1',
          address: 'x',
        })
        .expect(409);
    });

    it('rejects a malformed mobile number', () =>
      ctx
        .api(relations)
        .patch(`/api/clients/${clientId}`, { mobile: '12345' })
        .expect(400));

    it('deleting a client deletes its factories, and the name can be reused', async () => {
      await ctx.api(relations).delete(`/api/clients/${clientId}`).expect(204);
      const factories = await ctx.prisma.factory.findMany({
        where: { clientId },
      });
      expect(factories.every((f) => f.deletedAt !== null)).toBe(true);
      await ctx.api(relations).get(`/api/clients/${clientId}`).expect(404);

      await ctx
        .api(relations)
        .post('/api/clients', {
          name: 'EBM TEXTILE',
          mobile: '01098765432',
          email: 'info@ebm.com',
          importOperationEmployeeId: operationId,
          ...quote,
        })
        .expect(201);
    });

    it('every change lands in the audit log', async () => {
      const entries = await ctx.prisma.auditLog.groupBy({
        by: ['entity'],
        _count: true,
        where: { entity: { in: ['employee', 'clearer', 'client', 'factory'] } },
      });
      expect(entries.map((e) => e.entity).sort()).toEqual([
        'clearer',
        'client',
        'employee',
      ]);
    });
  });
});
