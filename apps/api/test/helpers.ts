import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Department, PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { TEST_CEO } from './global-setup';

export interface TestContext {
  app: INestApplication<App>;
  prisma: PrismaClient;
  ceoToken: string;
  api: (token: string) => {
    get: (path: string) => request.Test;
    post: (path: string, body?: object) => request.Test;
    patch: (path: string, body?: object) => request.Test;
    delete: (path: string) => request.Test;
  };
  /** An employee + account with the given role; returns the account's token. */
  userWithRole: (
    code: string,
    roleName: string,
    department?: Department,
  ) => Promise<{ token: string; userId: number; employeeId: number }>;
}

export async function createTestContext(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app, 'http://localhost:5173');
  await app.init();
  const prisma = new PrismaClient();
  const server = app.getHttpServer();

  const login = async (email: string, password: string) =>
    (
      await request(server)
        .post('/api/auth/login')
        .send({ email, password })
        .expect(200)
    ).body.accessToken as string;

  const ceoToken = await login(TEST_CEO.email, TEST_CEO.password);

  const api = (token: string) => {
    const auth = (t: request.Test) => t.set('Authorization', `Bearer ${token}`);
    return {
      get: (path: string) => auth(request(server).get(path)),
      post: (path: string, body?: object) =>
        auth(request(server).post(path)).send(body),
      patch: (path: string, body?: object) =>
        auth(request(server).patch(path)).send(body),
      delete: (path: string) => auth(request(server).delete(path)),
    };
  };

  const userWithRole: TestContext['userWithRole'] = async (
    code,
    roleName,
    department = 'SCAN',
  ) => {
    const employee = await prisma.employee.create({
      data: {
        code,
        fullName: `Employee ${code}`,
        nationalId: `2900101${code.padStart(7, '0')}`,
        phone: '01000000000',
        department,
        jobTitle: 'Test',
        hireDate: new Date(),
      },
    });
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    const email = `user${code}@hammerline.com`;
    const res = await api(ceoToken)
      .post('/api/users', {
        accountType: 'EMPLOYEE',
        ownerId: employee.id,
        email,
        password: 'Passw0rd1',
        roleId: role.id,
      })
      .expect(201);
    return {
      token: await login(email, 'Passw0rd1'),
      userId: res.body.id as number,
      employeeId: employee.id,
    };
  };

  return { app, prisma, ceoToken, api, userWithRole };
}

export async function closeTestContext(ctx: TestContext) {
  await ctx.prisma.$disconnect();
  await ctx.app.close();
}
