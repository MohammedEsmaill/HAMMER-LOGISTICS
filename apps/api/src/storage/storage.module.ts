import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/env.validation';
import { CloudinaryStorage } from './cloudinary.storage';
import { FILE_STORAGE } from './file-storage';
import { FilesController } from './files.controller';
import { LocalDiskStorage } from './local-disk.storage';

/** Cloudinary when CLOUDINARY_URL is set (online), otherwise this server's disk. */
@Global()
@Module({
  controllers: [FilesController],
  providers: [
    CloudinaryStorage,
    LocalDiskStorage,
    {
      provide: FILE_STORAGE,
      inject: [ConfigService, CloudinaryStorage, LocalDiskStorage],
      useFactory: (
        config: ConfigService<AppConfig, true>,
        cloud: CloudinaryStorage,
        disk: LocalDiskStorage,
      ) => {
        if (config.get('CLOUDINARY_URL', { infer: true })) return cloud;
        new Logger('Storage').log(`Uploads kept on disk in ${disk.root}`);
        return disk;
      },
    },
  ],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
