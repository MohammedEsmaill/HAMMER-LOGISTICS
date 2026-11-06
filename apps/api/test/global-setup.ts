import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';

export const TEST_CEO = {
  email: 'ceo@hammerline.com',
  password: 'TestCeo2026',
};

/** Brings the test database to the latest migration, empties it and seeds it once per run. */
export default async function globalSetup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://hammer:hammer@localhost:5432/hammer_logistics_test?schema=public';
  if (!/_test\b/.test(new URL(url).pathname)) {
    throw new Error(
      `Refusing to empty a database whose name does not end in _test: ${url}`,
    );
  }
  const env = { ...process.env, DATABASE_URL: url };

  execSync('npx prisma migrate deploy', { stdio: 'inherit', env });

  const prisma = new PrismaClient({ datasourceUrl: url });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  await prisma.$disconnect();

  execSync('npx tsx prisma/seed.ts', {
    stdio: 'inherit',
    env: {
      ...env,
      SEED_CEO_EMAIL: TEST_CEO.email,
      SEED_CEO_PASSWORD: TEST_CEO.password,
    },
  });
}
