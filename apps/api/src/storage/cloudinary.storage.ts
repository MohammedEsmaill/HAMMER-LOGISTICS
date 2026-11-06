import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { AppConfig } from '../config/env.validation';
import { FileStorage, StoredFile } from './file-storage';

/**
 * Cloudinary, configured from CLOUDINARY_URL (cloudinary://key:secret@cloud_name).
 * PDFs go up as "raw" files so Cloudinary serves them as they are.
 */
@Injectable()
export class CloudinaryStorage implements FileStorage {
  private readonly logger = new Logger(CloudinaryStorage.name);
  private readonly configured: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    const url = config.get('CLOUDINARY_URL', { infer: true });
    this.configured = !!url;
    if (url) {
      const parsed = new URL(url);
      cloudinary.config({
        cloud_name: parsed.hostname,
        api_key: decodeURIComponent(parsed.username),
        api_secret: decodeURIComponent(parsed.password),
        secure: true,
      });
    }
  }

  async upload(
    file: Buffer,
    options: { folder: string; fileName: string },
  ): Promise<StoredFile> {
    this.assertConfigured();
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          resource_type: 'raw',
          public_id: options.fileName,
          use_filename: false,
          unique_filename: true,
        },
        (error, response) =>
          error || !response
            ? reject(new Error(error?.message ?? 'empty response'))
            : resolve(response),
      );
      stream.end(file);
    }).catch((error: unknown) => {
      this.logger.error(`Cloudinary upload failed: ${String(error)}`);
      throw new ServiceUnavailableException('رفع الملف فشل، حاول تاني');
    });
    return { url: result.secure_url, publicId: result.public_id };
  }

  async remove(publicId: string): Promise<void> {
    this.assertConfigured();
    await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
  }

  private assertConfigured() {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'رفع الملفات مش متظبط على السيرفر (CLOUDINARY_URL)',
      );
    }
  }
}
