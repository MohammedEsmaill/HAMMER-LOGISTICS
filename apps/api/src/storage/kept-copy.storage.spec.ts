import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfig } from '../config/env.validation';
import { CloudinaryStorage } from './cloudinary.storage';
import { KeptCopyStorage } from './kept-copy.storage';
import { LocalDiskStorage } from './local-disk.storage';

const PDF = Buffer.from('%PDF-1.7');

async function setup(cloud: Partial<CloudinaryStorage>) {
  const dir = await mkdtemp(join(tmpdir(), 'kept-'));
  const config = { get: () => dir } as unknown as ConfigService<AppConfig, true>;
  const disk = new LocalDiskStorage(config);
  return { dir, kept: new KeptCopyStorage(disk, cloud as CloudinaryStorage) };
}

describe('KeptCopyStorage', () => {
  it('keeps a copy on disk and serves the Cloudinary link', async () => {
    const { dir, kept } = await setup({
      configured: true,
      upload: () => Promise.resolve({ url: 'https://res.cloudinary.com/x', publicId: 'hammer/x' }),
    });
    const stored = await kept.upload(PDF, { folder: 'hammer/shipments/HL26-0001/جمارك', fileName: 'f' });
    expect(stored).toMatchObject({ url: 'https://res.cloudinary.com/x', publicId: 'hammer/x' });
    expect(await readdir(dir)).toEqual([stored.localKey]);
  });

  it('offline, serves the copy on disk until it goes up', async () => {
    const { kept } = await setup({ configured: true, upload: () => Promise.reject(new Error('offline')) });
    const stored = await kept.upload(PDF, { folder: 'x', fileName: 'f' });
    expect(stored.publicId).toBe(`local:${stored.localKey}`);
    expect(stored.url).toBe(`/api/files/${stored.localKey}`);
  });

  it('without Cloudinary, keeps the file on disk only', async () => {
    const upload = jest.fn();
    const { kept } = await setup({ configured: false, upload });
    const stored = await kept.upload(PDF, { folder: 'x', fileName: 'f' });
    expect(stored.publicId).toMatch(/^local:/);
    expect(upload).not.toHaveBeenCalled();
  });
});
