import { CLEARER_PRICES } from './fixtures';
import { closeTestContext, createTestContext, TestContext } from './helpers';

describe('National IDs and phones (e2e)', () => {
  let ctx: TestContext;
  let employeeId: number;
  const body = (code: string, nationalId: string, phone: string) => ({
    code,
    fullName: `Person ${code}`,
    nationalId,
    phone,
    department: 'OPERATION',
    jobTitle: 'Operation',
    hireDate: '2025-01-01',
  });

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(() => closeTestContext(ctx));

  it('keeps them encrypted, and shows them as they are', async () => {
    const res = await ctx.api(ctx.ceoToken).post('/api/employees', body('7601', '29501017601001', '01076010001')).expect(201);
    employeeId = res.body.id;
    expect(res.body).toMatchObject({ nationalId: '29501017601001', phone: '01076010001' });
    const row = await ctx.prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    expect(row.nationalId).toMatch(/^enc:v1:/);
    expect(row.phone).toMatch(/^enc:v1:/);
    expect(JSON.stringify(row)).not.toContain('29501017601001');
    const got = await ctx.api(ctx.ceoToken).get(`/api/employees/${employeeId}`).expect(200);
    expect(got.body).toMatchObject({ nationalId: '29501017601001', phone: '01076010001' });
    // the audit trail does not keep them
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity: 'employee', entityId: String(employeeId) } });
    expect(JSON.stringify(audit.after)).not.toContain('29501017601001');
    expect(JSON.stringify(audit.after)).not.toContain('enc:v1:');
  });

  it('finds a person by the whole number', async () => {
    const byId = await ctx.api(ctx.ceoToken).get('/api/employees?search=29501017601001').expect(200);
    expect(byId.body.items.map((e: { id: number }) => e.id)).toEqual([employeeId]);
    const byPhone = await ctx.api(ctx.ceoToken).get('/api/employees?search=01076010001').expect(200);
    expect(byPhone.body.items.map((e: { id: number }) => e.id)).toEqual([employeeId]);
  });

  it('gives one national ID and one phone to one person, employees and clearers alike', async () => {
    const samePhone = await ctx.api(ctx.ceoToken).post('/api/employees', body('7602', '29501017602001', '01076010001')).expect(409);
    expect(samePhone.body.message).toContain('رقم الموبايل');
    const sameId = await ctx.api(ctx.ceoToken).post('/api/employees', body('7603', '29501017601001', '01076030001')).expect(409);
    expect(sameId.body.message).toContain('الرقم القومي');
    await ctx
      .api(ctx.ceoToken)
      .post('/api/clearers', { fullName: 'مستخلص', phone: '01076010001', nationalId: '29501017604001', ...CLEARER_PRICES })
      .expect(409);
    await ctx
      .api(ctx.ceoToken)
      .post('/api/clearers', { fullName: 'مستخلص', phone: '01076040001', nationalId: '29501017601001', ...CLEARER_PRICES })
      .expect(409);
    // editing keeps your own numbers
    await ctx.api(ctx.ceoToken).patch(`/api/employees/${employeeId}`, { phone: '01076010001', jobTitle: 'x' }).expect(200);
  });
});
