import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/env.validation';
import { CloudinaryStorage } from './cloudinary.storage';
import { DocumentSyncService } from './document-sync.service';
import { KeptCopyStorage } from './kept-copy.storage';
import { FILE_STORAGE } from './file-storage';
import { FilesController } from './files.controller';
import { LocalDiskStorage } from './local-disk.storage';

/** Every file on this server's disk, and on Cloudinary too when CLOUDINARY_URL is set. */
@Global()
@Module({
  controllers: [FilesController],
  providers: [
    CloudinaryStorage,
    LocalDiskStorage,
    KeptCopyStorage,
    DocumentSyncService,
    {
      provide: FILE_STORAGE,
      inject: [ConfigService, KeptCopyStorage, LocalDiskStorage],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        kept: KeptCopyStorage,
        disk: LocalDiskStorage,
      ) => {
        const cloud = !!config.get('CLOUDINARY_URL', { infer: true });
        new Logger('Storage').log(`Uploads kept on disk in ${disk.root}${cloud ? ', and on Cloudinary' : ''}`);
        return kept;
      },
    },
  ],
  exports: [FILE_STORAGE, DocumentSyncService],
})
export class StorageModule {}
