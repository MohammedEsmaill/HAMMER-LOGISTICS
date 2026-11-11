import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { Public } from '../auth/decorators/public.decorator';
import { LocalDiskStorage } from './local-disk.storage';

/**
 * Serves the files LocalDiskStorage keeps. Like a Cloudinary link, the random name is
 * the key: the PDF opens in a new tab, where no access token travels.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly disk: LocalDiskStorage) {}

  @Public()
  @Get(':key')
  file(@Param('key') key: string, @Res() res: Response) {
    const path = this.disk.path(key);
    if (!path || !existsSync(path))
      throw new NotFoundException('الملف غير موجود');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(path);
  }
}
