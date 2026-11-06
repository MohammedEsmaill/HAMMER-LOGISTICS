import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/env.validation';
import { CloudinaryStorage } from './cloudinary.storage';

describe('CloudinaryStorage', () => {
  it('explains that uploads are not configured when CLOUDINARY_URL is missing', async () => {
    const config = { get: () => undefined } as unknown as ConfigService<
      AppConfig,
      true
    >;
    const storage = new CloudinaryStorage(config);
    await expect(
      storage.upload(Buffer.from('%PDF-'), { folder: 'x', fileName: 'y' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
