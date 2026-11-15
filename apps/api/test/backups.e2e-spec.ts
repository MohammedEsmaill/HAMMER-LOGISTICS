import { rmSync } from 'node:fs';
import request from 'supertest';
import { closeTestContext, createTestContext, TestContext } from './helpers';

interface Backup {
  name: string;
  kind: string;
  size: number;
}

describe('Backups (e2e)', () => {
  let ctx: TestContext;
  let first: Backup;

  beforeAll(async () => {
    rmSync(process.env.BACKUP_DIR!, { recursive: true, force: true });
    ctx = await createTestContext();
  });

  afterAll(() => closeTestContext(ctx));

  it('only the CEO handles backups', async () => {
    const scan = (await ctx.userWithRole('981', 'SCAN')).token;
    await ctx.api(scan).get('/api/backups').expect(403);
    await ctx.api(scan).post('/api/backups').expect(403);
  });

  it('takes a backup by hand and lists it', async () => {
    first = (await ctx.api(ctx.ceoToken).post('/api/backups').expect(201)).body;
    expect(first.name).toMatch(/^hammer_.*_manual\.dump$/);
    expect(first.size).toBeGreaterThan(1000);
    const res = await ctx.api(ctx.ceoToken).get('/api/backups').expect(200);
    expect(res.body.mode).toBe('local');
    expect(res.body.backups.map((b: Backup) => b.name)).toContain(first.name);
  });

  it('downloads a backup, and refuses names outside the folder', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/backups/${first.name}/download`)
      .set('Authorization', `Bearer ${ctx.ceoToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('PGDMP');
    await ctx
      .api(ctx.ceoToken)
      .get('/api/backups/..%2F..%2Fpackage.json/download')
      .expect(404);
  });

  it('refuses an uploaded file that is not a backup', async () => {
    await request(ctx.app.getHttpServer())
      .post('/api/backups/upload')
      .set('Authorization', `Bearer ${ctx.ceoToken}`)
      .attach('file', Buffer.from('not a dump'), { filename: 'x.dump' })
      .expect(400);
  });

  it('restores a backup: later changes are gone, and the data before is saved first', async () => {
    const later = await ctx.prisma.country.create({
      data: { code: 'ZZ', nameAr: 'بلد بعد النسخة', nameEn: 'After backup' },
    });
    const res = await ctx
      .api(ctx.ceoToken)
      .post(`/api/backups/${first.name}/restore`)
      .expect(200);
    expect(res.body.savedFirst).toMatch(/_pre_restore\.dump$/);
    expect(
      await ctx.prisma.country.findUnique({ where: { id: later.id } }),
    ).toBeNull();
    const list = await ctx.api(ctx.ceoToken).get('/api/backups').expect(200);
    expect(list.body.backups.map((b: Backup) => b.name)).toContain(
      res.body.savedFirst,
    );
  }, 120_000);
});
