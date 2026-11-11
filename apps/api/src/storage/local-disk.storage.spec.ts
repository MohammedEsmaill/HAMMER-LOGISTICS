import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDiskStorage } from './local-disk.storage';

describe('LocalDiskStorage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hl-uploads-'));
  const storage = new LocalDiskStorage({
    get: () => dir,
  } as never);

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps the file under a random name and gives its API link', async () => {
    const stored = await storage.upload(Buffer.from('%PDF-1.7'));
    const key = stored.url.replace('/api/files/', '');
    expect(stored.url).toMatch(/^\/api\/files\/[0-9a-f-]{36}\.pdf$/);
    expect(readFileSync(storage.path(key)!).toString()).toBe('%PDF-1.7');
    await storage.remove(stored.publicId);
    expect(existsSync(join(dir, key))).toBe(false);
  });

  it('refuses any name that is not one of its keys', () => {
    expect(storage.path('../.env')).toBeNull();
    expect(storage.path('..%2F.env')).toBeNull();
    expect(storage.path('a.pdf')).toBeNull();
  });
});
