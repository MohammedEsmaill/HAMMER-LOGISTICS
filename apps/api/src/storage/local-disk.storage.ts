import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { AppConfig } from '../config/env.validation';
import { FileStorage, StoredFile } from './file-storage';

/** A stored file's key: a random UUID and its extension, nothing a path can escape with. */
export const LOCAL_FILE_KEY = /^[0-9a-f-]{36}\.pdf$/;

/**
 * Files on this server's disk, used when Cloudinary is not configured (running on the
 * office computer). Each file gets a random name and is served by FilesController at
 * /api/files/<name>, as unguessable as a Cloudinary link.
 */
@Injectable()
export class LocalDiskStorage implements FileStorage {
  private readonly logger = new Logger(LocalDiskStorage.name);
  readonly root: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const dir = config.get('UPLOAD_DIR', { infer: true }) || 'uploads';
    this.root = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  async upload(file: Buffer): Promise<StoredFile> {
    await mkdir(this.root, { recursive: true });
    const key = `${randomUUID()}.pdf`;
    await writeFile(join(this.root, key), file);
    return { url: `/api/files/${key}`, publicId: `local:${key}` };
  }

  async remove(publicId: string): Promise<void> {
    const key = publicId.replace(/^local:/, '');
    if (!LOCAL_FILE_KEY.test(key)) return;
    await rm(join(this.root, key), { force: true }).catch((e: unknown) =>
      this.logger.error(`Could not remove ${key}: ${String(e)}`),
    );
  }

  path(key: string): string | null {
    return LOCAL_FILE_KEY.test(key) ? join(this.root, key) : null;
  }
}
