import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { TEST_CEO } from './global-setup';

describe('Auth & permissions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let ceoToken: string;

  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password });

  const get = (path: string, token: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);

  const refreshCookie = (res: request.Response): string => {
    const raw = res.headers['set-cookie'] as unknown as string[];
    return raw.find((c) => c.startsWith('hl_refresh='))!.split(';')[0];
  };

  /** Creates an employee directly in the DB and an account for them through the API. */
  async function createUser(
    code: string,
    email: string,
    roleName: string,
    password = 'Passw0rd1',
  ) {
    const employee = await prisma.employee.create({
      data: {
        code,
        fullName: `Employee ${code}`,
        nationalId: `2900101${code.padStart(7, '0')}`,
        phone: '01000000000',
        department: 'SCAN',
        jobTitle: 'Test',
        hireDate: new Date(),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    const res = await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${ceoToken}`)
      .send({
        accountType: 'EMPLOYEE',
        ownerId: employee.id,
        email,
        password,
        roleId: role.id,
      })
      .expect(201);
    return { userId: res.body.id as number, employeeId: employee.id, password };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, 'http://localhost:5173');
    await app.init();
    prisma = new PrismaClient();

    const res = await login(TEST_CEO.email, TEST_CEO.password).expect(200);
    ceoToken = res.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('login', () => {
    it('rejects a wrong password with the same message as an unknown email', async () => {
      const wrongPassword = await login(TEST_CEO.email, 'nope').expect(401);
      const unknownEmail = await login('ghost@hammerline.com', 'nope').expect(
        401,
      );
      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });

    it('returns a profile with every permission for the CEO and sets an httpOnly refresh cookie', async () => {
      const res = await login(TEST_CEO.email, TEST_CEO.password).expect(200);
      ceoToken = res.body.accessToken;
      expect(res.body.user.role.name).toBe('CEO');
      expect(res.body.user.permissions).toContain('roles.manage');
      const cookie = (res.headers['set-cookie'] as unknown as string[]).find(
        (c) => c.startsWith('hl_refresh='),
      );
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
    });

    it('rejects requests without a token', () =>
      get('/api/auth/me', '').expect(401));

    it('records the login in the audit log', async () => {
      const entries = await prisma.auditLog.count({
        where: { action: 'LOGIN' },
      });
      expect(entries).toBeGreaterThan(0);
    });
  });

  describe('single session', () => {
    it('logging in again ends the previous session', async () => {
      const user = await createUser('101', 'single@hammerline.com', 'SCAN');
      const first = await login('single@hammerline.com', user.password).expect(
        200,
      );
      await get('/api/auth/me', first.body.accessToken).expect(200);

      const second = await login('single@hammerline.com', user.password).expect(
        200,
      );
      await get('/api/auth/me', first.body.accessToken).expect(401);
      await get('/api/auth/me', second.body.accessToken).expect(200);
    });

    it('a refresh token works once, then the rotated one takes over', async () => {
      const user = await createUser('102', 'refresh@hammerline.com', 'SCAN');
      const res = await login('refresh@hammerline.com', user.password).expect(
        200,
      );
      const cookie = refreshCookie(res);

      const refreshed = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
      await get('/api/auth/me', refreshed.body.accessToken).expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('logout ends the session', async () => {
      const user = await createUser('103', 'logout@hammerline.com', 'SCAN');
      const { body } = await login(
        'logout@hammerline.com',
        user.password,
      ).expect(200);
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(204);
      await get('/api/auth/me', body.accessToken).expect(401);
    });
  });

  describe('lockout', () => {
    it('locks the account for 15 minutes after 5 wrong passwords', async () => {
      const user = await createUser('104', 'locked@hammerline.com', 'SCAN');
      for (let i = 0; i < 5; i++)
        await login('locked@hammerline.com', 'wrong').expect(401);
      const res = await login('locked@hammerline.com', user.password).expect(
        401,
      );
      expect(res.body.message).toContain('مقفول');
    });
  });

  describe('permissions', () => {
    it('a SCAN user cannot reach roles or users', async () => {
      const user = await createUser('105', 'scan@hammerline.com', 'SCAN');
      const { body } = await login('scan@hammerline.com', user.password).expect(
        200,
      );
      await get('/api/roles', body.accessToken).expect(403);
      await get('/api/users', body.accessToken).expect(403);
      expect(body.user.permissions).toContain('shipments.create');
    });

    it('HR manages users but cannot hand out the CEO role or touch a CEO account', async () => {
      const hr = await createUser('106', 'hr@hammerline.com', 'HR');
      const { body } = await login('hr@hammerline.com', hr.password).expect(
        200,
      );
      await get('/api/users', body.accessToken).expect(200);

      const ceoRole = await prisma.role.findUniqueOrThrow({
        where: { name: 'CEO' },
      });
      const target = await createUser('107', 'target@hammerline.com', 'SCAN');
      await request(app.getHttpServer())
        .patch(`/api/users/${target.userId}`)
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ roleId: ceoRole.id })
        .expect(403);

      const ceo = await prisma.user.findFirstOrThrow({
        where: { roleId: ceoRole.id },
      });
      await request(app.getHttpServer())
        .post(`/api/users/${ceo.id}/reset-password`)
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ password: 'Hijack123' })
        .expect(403);
    });

    it('a role change applies on the next request, without logging in again', async () => {
      const user = await createUser('108', 'promote@hammerline.com', 'SCAN');
      const { body } = await login(
        'promote@hammerline.com',
        user.password,
      ).expect(200);
      await get('/api/users', body.accessToken).expect(403);

      const hrRole = await prisma.role.findUniqueOrThrow({
        where: { name: 'HR' },
      });
      await request(app.getHttpServer())
        .patch(`/api/users/${user.userId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ roleId: hrRole.id })
        .expect(200);
      await get('/api/users', body.accessToken).expect(200);
    });

    it('deactivating an account logs it out immediately', async () => {
      const user = await createUser('109', 'deactivate@hammerline.com', 'SCAN');
      const { body } = await login(
        'deactivate@hammerline.com',
        user.password,
      ).expect(200);
      await request(app.getHttpServer())
        .patch(`/api/users/${user.userId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ isActive: false })
        .expect(200);
      await get('/api/auth/me', body.accessToken).expect(401);
      await login('deactivate@hammerline.com', user.password).expect(401);
    });
  });

  describe('roles', () => {
    it('refuses CEO-only permissions on another role', async () => {
      await request(app.getHttpServer())
        .post('/api/roles')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ name: 'Sneaky', permissions: ['roles.manage'] })
        .expect(400);
    });

    it('refuses to edit the CEO role', async () => {
      const ceoRole = await prisma.role.findUniqueOrThrow({
        where: { name: 'CEO' },
      });
      await request(app.getHttpServer())
        .patch(`/api/roles/${ceoRole.id}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ permissions: [] })
        .expect(403);
    });

    it('creates a role from the catalog', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/roles')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({ name: 'Port agent', permissions: ['shipments.view.all'] })
        .expect(201);
      expect(res.body.permissions).toEqual(['shipments.view.all']);
    });
  });

  describe('users', () => {
    it('refuses an email outside @hammerline.com', async () => {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: 'SCAN' },
      });
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          accountType: 'EMPLOYEE',
          ownerId: 1,
          email: 'x@gmail.com',
          password: 'Passw0rd1',
          roleId: role.id,
        })
        .expect(400);
    });

    it('refuses a second live account for the same employee, and allows one after deletion', async () => {
      const first = await createUser('110', 'first@hammerline.com', 'SCAN');
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: 'SCAN' },
      });
      const second = {
        accountType: 'EMPLOYEE',
        ownerId: first.employeeId,
        email: 'second@hammerline.com',
        password: 'Passw0rd1',
        roleId: role.id,
      };
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send(second)
        .expect(409);

      await request(app.getHttpServer())
        .delete(`/api/users/${first.userId}`)
        .set('Authorization', `Bearer ${ceoToken}`)
        .expect(204);
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send(second)
        .expect(201);
    });

    it('refuses a weak password', async () => {
      const employee = await prisma.employee.create({
        data: {
          code: '111',
          fullName: 'Weak',
          nationalId: '29001010000111',
          phone: '01000000000',
          department: 'SCAN',
          jobTitle: 'Test',
          hireDate: new Date(),
        },
      });
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: 'SCAN' },
      });
      await request(app.getHttpServer())
        .post('/api/users')
        .set('Authorization', `Bearer ${ceoToken}`)
        .send({
          accountType: 'EMPLOYEE',
          ownerId: employee.id,
          email: 'weak@hammerline.com',
          password: '1234',
          roleId: role.id,
        })
        .expect(400);
    });
  });
});
