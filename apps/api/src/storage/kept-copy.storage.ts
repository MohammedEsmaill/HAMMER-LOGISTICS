import { Injectable, Logger } from '@nestjs/common';
import { CloudinaryStorage } from './cloudinary.storage';
import { FileExt, FileStorage, isLocal, StoredFile } from './file-storage';
import { LocalDiskStorage } from './local-disk.storage';

/**
 * Every file is written to this server's disk first and kept there as a backup. With
 * Cloudinary configured it then goes up there; when that fails (no internet) the file
 * is served from disk meanwhile and DocumentSyncService uploads it later.
 */
@Injectable()
export class KeptCopyStorage implements FileStorage {
  private readonly logger = new Logger(KeptCopyStorage.name);

  constructor(
    private readonly disk: LocalDiskStorage,
    private readonly cloud: CloudinaryStorage,
  ) {}

  async upload(file: Buffer, options: { folder: string; fileName: string; ext?: FileExt }): Promise<StoredFile> {
    const local = await this.disk.upload(file, options);
    if (!this.cloud.configured) return local;
    try {
      const up = await this.cloud.upload(file, options);
      return { ...up, localKey: local.localKey };
    } catch {
      this.logger.warn(`Kept ${local.localKey} on disk until Cloudinary is reachable`);
      return local;
    }
  }

  async remove(publicId: string, localKey?: string | null): Promise<void> {
    if (!isLocal(publicId) && this.cloud.configured) await this.cloud.remove(publicId);
    if (localKey || isLocal(publicId)) await this.disk.remove(publicId, localKey);
  }
}
