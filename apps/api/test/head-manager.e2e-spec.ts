import { closeTestContext, createTestContext, TestContext } from './helpers';

describe('The head manager (e2e)', () => {
  let ctx: TestContext;
  let head: { token: string; userId: number };
  let moderator: string;
  let roleId: number;

  beforeAll(async () => {
    ctx = await createTestContext();
    head = await ctx.userWithRole('7501', 'HEAD_MANAGER', 'MANAGEMENT');
    moderator = (await ctx.userWithRole('7502', 'MODERATOR', 'MANAGEMENT')).token;
    roleId = (await ctx.prisma.role.findUniqueOrThrow({ where: { name: 'HEAD_MANAGER' } })).id;
  });

  afterAll(() => closeTestContext(ctx));

  it('holds everything but managing roles and approving', async () => {
    const me = await ctx.api(head.token).get('/api/auth/me').expect(200);
    const permissions: string[] = me.body.permissions;
    expect(permissions).toEqual(expect.arrayContaining(['backups.manage', 'clearers.manage', 'finance.months.close', 'users.manage']));
    for (const p of ['roles.manage', 'finance.review', 'finance.manager_approve', 'finance.approve', 'finance.approved.edit'])
      expect(permissions).not.toContain(p);
    await ctx.api(head.token).get('/api/roles').expect(403);
  });

  it('is given by the CEO only, and his account is the CEO\'s to change', async () => {
    const employee = await ctx.prisma.employee.create({
      data: { code: '7503', fullName: 'مرشح', nationalId: '29001010075030', phone: '01000007503', department: 'MANAGEMENT', jobTitle: 'x', hireDate: new Date() },
    });
    const body = { accountType: 'EMPLOYEE', ownerId: employee.id, email: 'user7503@hammerline.com', password: 'Passw0rd1', roleId };
    await ctx.api(moderator).post('/api/users', body).expect(403);
    await ctx.api(head.token).post('/api/users', body).expect(403);
    await ctx.api(moderator).post('/api/users', { ...body, roleId: (await ctx.prisma.role.findUniqueOrThrow({ where: { name: 'SCAN' } })).id, extraRoleIds: [roleId] }).expect(403);

    await ctx.api(moderator).post(`/api/users/${head.userId}/reset-password`, { password: 'Passw0rd2' }).expect(403);
    await ctx.api(moderator).patch(`/api/users/${head.userId}`, { isActive: false }).expect(403);
  });

  it("has a role only the CEO edits, never renamed or removed", async () => {
    await ctx.api(moderator).patch(`/api/roles/${roleId}`, { description: 'x' }).expect(403);
    await ctx.api(ctx.ceoToken).patch(`/api/roles/${roleId}`, { name: 'BOSS' }).expect(400);
    await ctx.api(ctx.ceoToken).patch(`/api/roles/${roleId}`, { permissions: ['roles.manage'] }).expect(400);
    await ctx.api(ctx.ceoToken).delete(`/api/roles/${roleId}`).expect(400);
  });
});
