import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { BackupsService } from './backups.service';

/** Backups: the CEO only. */
@Controller('backups')
@RequirePermissions('backups.manage')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  status() {
    return this.backups.status();
  }

  @Post()
  create(@CurrentUser() actor: AuthUser) {
    return this.backups.create('MANUAL', actor.email);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      dest: tmpdir(),
      limits: { fileSize: 4 * 1024 ** 3 },
    }),
  )
  upload(
    @CurrentUser() actor: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('اختار ملف النسخة');
    return this.backups.upload(actor, file.path);
  }

  @Get(':name/download')
  download(
    @Param('name') name: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = this.backups.path(name);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}"`,
    });
    return new StreamableFile(createReadStream(file));
  }

  @Post(':name/restore')
  @HttpCode(200)
  restore(@CurrentUser() actor: AuthUser, @Param('name') name: string) {
    return this.backups.restore(actor, name);
  }

  @Delete(':name')
  @HttpCode(204)
  async remove(@CurrentUser() actor: AuthUser, @Param('name') name: string) {
    await this.backups.remove(actor, name);
  }
}
