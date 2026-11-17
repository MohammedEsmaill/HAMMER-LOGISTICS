import { AuditLogService } from '../src/audit/audit-log.service';
import { closeTestContext, createTestContext, TestContext } from './helpers';

interface Row {
  id: number;
  action: string;
  entity: string;
  entityId: string;
  ref: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

describe('Audit log page (e2e)', () => {
  let ctx: TestContext;
  let auditor: string;

  const page = async (token: string, query = '') =>
    (await ctx.api(token).get(`/api/audit?pageSize=500${query}`).expect(200))
      .body as { items: Row[]; total: number };

  beforeAll(async () => {
    ctx = await createTestContext();
    auditor = (await ctx.userWithRole('991', 'GENERAL_AUDITOR', 'ACCOUNTS'))
      .token;
    await ctx.prisma.auditLog.createMany({
      data: [
        {
          userId: null,
          action: 'CREATE',
          entity: 'salary_payment',
          entityId: '9901',
          after: { amount: 5000 },
        },
        {
          userId: null,
          action: 'UPDATE',
          entity: 'employee',
          entityId: '9902',
          before: { fullName: 'Audit Person', basicSalary: '7000' },
          after: { fullName: 'Audit Person', basicSalary: '8000' },
        },
      ],
    });
  });

  afterAll(() => closeTestContext(ctx));

  it('is for the CEO and the general auditor', async () => {
    const scan = (await ctx.userWithRole('992', 'SCAN')).token;
    await ctx.api(scan).get('/api/audit').expect(403);
    await page(auditor);
  });

  it('keeps sign-ins in their own tab', async () => {
    const ops = await page(ctx.ceoToken);
    expect(ops.items.some((r) => r.action === 'LOGIN')).toBe(false);
    const logins = await page(ctx.ceoToken, '&tab=logins');
    expect(logins.items.length).toBeGreaterThan(0);
    expect(
      logins.items.every((r) =>
        ['LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'LOGIN_LOCKED', 'UNLOCK'].includes(
          r.action,
        ),
      ),
    ).toBe(true);
  });

  it('hides salaries and advances from the general auditor, not from the CEO', async () => {
    expect(
      (await page(ctx.ceoToken, '&section=finance')).items.some(
        (r) => r.entity === 'salary_payment',
      ),
    ).toBe(true);
    expect(
      (await page(auditor, '&section=finance')).items.some(
        (r) => r.entity === 'salary_payment',
      ),
    ).toBe(false);
    const forAuditor = (await page(auditor, '&entity=employee&entityId=9902'))
      .items[0];
    expect(forAuditor.after).toEqual({ fullName: 'Audit Person' });
    expect(forAuditor.ref).toBe('Audit Person');
    const forCeo = (await page(ctx.ceoToken, '&entity=employee&entityId=9902'))
      .items[0];
    expect(forCeo.after).toMatchObject({ basicSalary: '8000' });
  });

  it('finds records by what is in them', async () => {
    const found = await page(
      ctx.ceoToken,
      `&search=${encodeURIComponent('Audit Person')}`,
    );
    expect(found.items.map((r) => r.entityId)).toContain('9902');
  });

  it('keeps two years: older records go, newer ones cannot be removed', async () => {
    const old = await ctx.prisma.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'client',
        entityId: '9903',
        createdAt: new Date(Date.now() - 3 * 365 * 86_400_000),
      },
    });
    const recent = await ctx.prisma.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'client',
        entityId: '9904',
        createdAt: new Date(Date.now() - 365 * 86_400_000),
      },
    });
    expect(await ctx.app.get(AuditLogService).prune()).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      await ctx.prisma.auditLog.findUnique({ where: { id: old.id } }),
    ).toBeNull();
    expect(
      await ctx.prisma.auditLog.findUnique({ where: { id: recent.id } }),
    ).not.toBeNull();
    await expect(
      ctx.prisma.auditLog.delete({ where: { id: recent.id } }),
    ).rejects.toThrow();
  });
});
