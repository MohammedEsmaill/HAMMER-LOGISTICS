import { Global, Module } from '@nestjs/common';
import { CloudinaryStorage } from './cloudinary.storage';
import { FILE_STORAGE } from './file-storage';

@Global()
@Module({
  providers: [{ provide: FILE_STORAGE, useClass: CloudinaryStorage }],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
