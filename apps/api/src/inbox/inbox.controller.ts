import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InboxService } from './inbox.service';

/** The bell: every signed-in user, their own alerts only. */
@Controller('inbox')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser) {
    return this.inbox.list(actor);
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentUser() actor: AuthUser) {
    return this.inbox.readAll(actor);
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.inbox.read(actor, id);
  }
}
