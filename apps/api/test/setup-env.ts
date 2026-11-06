// Every e2e test runs against its own database, never the dev one.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://hammer:hammer@localhost:5432/hammer_logistics_test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef0123456789';
process.env.JWT_REFRESH_SECRET =
  'test-refresh-secret-0123456789abcdef012345678';
process.env.LOGIN_RATE_LIMIT = '1000';
