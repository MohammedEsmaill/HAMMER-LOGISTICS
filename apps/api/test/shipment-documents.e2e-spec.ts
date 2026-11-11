import request from 'supertest';
import { ShipmentFixtures, shipmentFixtures } from './fixtures';
import { closeTestContext, createTestContext, TestContext } from './helpers';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');

describe('Shipment documents (e2e)', () => {
  let ctx: TestContext;
  let fx: ShipmentFixtures;
  let shipmentId: number;

  const upload = (
    token: string,
    file: Buffer,
    fileName: string,
    name?: string,
    id = shipmentId,
  ) => {
    const req = request(ctx.app.getHttpServer())
      .post(`/api/shipments/${id}/documents`)
      .set('Authorization', `Bearer ${token}`);
    if (name !== undefined) void req.field('name', name);
    return req.attach('file', file, {
      filename: fileName,
      contentType: 'application/pdf',
    });
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    fx = await shipmentFixtures(ctx, '7');
    shipmentId = (
      await ctx
        .api(fx.tokens.scan)
        .post('/api/shipments', fx.seaImport())
        .expect(201)
    ).body.id;
  });

  afterAll(() => closeTestContext(ctx));

  it('uploads a PDF with an Arabic file name and keeps it on the shipment', async () => {
    const res = await upload(
      fx.tokens.scan,
      PDF,
      'فاتورة تجارية.pdf',
      'فاتورة تجارية',
    ).expect(201);
    expect(res.body.name).toBe('فاتورة تجارية');
    expect(res.body.category).toBe('DOCUMENT');
    expect(res.body.fileName).toBe('فاتورة تجارية.pdf');
    expect(res.body.url).toMatch(/^https:\/\/files\.test\/shipments\/HL/);
    expect(ctx.storage.files.size).toBe(1);

    const detail = await ctx
      .api(fx.tokens.scan)
      .get(`/api/shipments/${shipmentId}`)
      .expect(200);
    expect(detail.body.documents).toHaveLength(1);
  });

  it('files a document as a document, a settlement or a receipt', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/shipments/${shipmentId}/documents`)
      .set('Authorization', `Bearer ${fx.tokens.scan}`)
      .field('name', 'إيصال سداد الرسوم')
      .field('category', 'RECEIPT')
      .attach('file', PDF, {
        filename: 'r.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(res.body.category).toBe('RECEIPT');
    await request(ctx.app.getHttpServer())
      .post(`/api/shipments/${shipmentId}/documents`)
      .set('Authorization', `Bearer ${fx.tokens.scan}`)
      .field('name', 'ملف')
      .field('category', 'PHOTO')
      .attach('file', PDF, {
        filename: 'r.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
  });

  it('checks the content, not the extension', async () => {
    const res = await upload(
      fx.tokens.scan,
      Buffer.from('MZ not a pdf'),
      'virus.pdf',
      'ملف',
    ).expect(400);
    expect(res.body.message).toBe('الملف لازم يكون PDF');
  });

  it('refuses files over 10 MB and a missing name', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    const res = await upload(fx.tokens.scan, big, 'big.pdf', 'كبير').expect(
      400,
    );
    expect(res.body.message).toContain('10 ميجا');
    await upload(fx.tokens.scan, PDF, 'x.pdf').expect(400);
  });

  it('operation staff upload to their own shipments only', async () => {
    await upload(fx.tokens.opsA, PDF, 'bl.pdf', 'بوليصة').expect(201);
    await upload(fx.tokens.opsB, PDF, 'bl.pdf', 'بوليصة').expect(404);
  });

  it('NAFEZA uploads but cannot delete; SCAN deletes (soft)', async () => {
    const doc = await upload(fx.tokens.nafeza, PDF, 'cert.pdf', 'شهادة').expect(
      201,
    );
    await ctx
      .api(fx.tokens.nafeza)
      .delete(`/api/shipments/${shipmentId}/documents/${doc.body.id}`)
      .expect(403);
    await ctx
      .api(fx.tokens.scan)
      .delete(`/api/shipments/${shipmentId}/documents/${doc.body.id}`)
      .expect(204);

    const list = await ctx
      .api(fx.tokens.scan)
      .get(`/api/shipments/${shipmentId}/documents`)
      .expect(200);
    expect(list.body.map((d: { id: number }) => d.id)).not.toContain(
      doc.body.id,
    );
    const row = await ctx.prisma.shipmentDocument.findUniqueOrThrow({
      where: { id: doc.body.id },
    });
    expect(row.deletedAt).not.toBeNull();
  });
});
