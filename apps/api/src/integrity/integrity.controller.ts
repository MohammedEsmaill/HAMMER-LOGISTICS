import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { IntegrityService } from './integrity.service';

/** The books check: the CEO, with the backups. */
@Controller('integrity')
@RequirePermissions('backups.manage')
export class IntegrityController {
  constructor(private readonly integrity: IntegrityService) {}

  @Get()
  last() {
    return this.integrity.last();
  }

  @Post()
  @HttpCode(200)
  run() {
    return this.integrity.run();
  }
}
