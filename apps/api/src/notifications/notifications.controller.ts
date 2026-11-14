import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Patch,
  Query,
} from '@nestjs/common';
import { IsString, Matches, MaxLength } from 'class-validator';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { NotificationsService } from './notifications.service';
import { WhatsappService } from './whatsapp.service';

export class GroupDto {
  @IsString()
  @Matches(/^[0-9-]+@g\.us$/, { message: 'جروب غير صحيح' })
  jid!: string;

  @IsString()
  @MaxLength(200)
  name!: string;
}

/** Linking the office WhatsApp number and choosing the staff group: CEO only. */
@Controller('notifications')
@RequirePermissions('notifications.manage')
export class NotificationsController {
  constructor(
    private readonly whatsapp: WhatsappService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('whatsapp')
  async status() {
    return {
      state: this.whatsapp.state,
      qr: this.whatsapp.qr,
      account: this.whatsapp.account,
      group: await this.notifications.group(),
    };
  }

  @Post('whatsapp/link')
  @HttpCode(200)
  async link() {
    await this.whatsapp.connect();
    return { state: this.whatsapp.state };
  }

  @Post('whatsapp/logout')
  @HttpCode(200)
  async logout() {
    await this.whatsapp.logout();
    return { state: this.whatsapp.state };
  }

  @Get('whatsapp/groups')
  groups() {
    return this.whatsapp.groups();
  }

  @Patch('whatsapp/group')
  setGroup(@CurrentUser() actor: AuthUser, @Body() dto: GroupDto) {
    return this.notifications.setGroup(actor, { jid: dto.jid, name: dto.name });
  }

  @Post('test')
  @HttpCode(200)
  test(@CurrentUser() actor: AuthUser) {
    return this.notifications.test(actor);
  }

  @Post('retry')
  @HttpCode(200)
  retry() {
    return this.notifications.retryFailed();
  }

  @Get()
  list(@Query() q: ListQueryDto) {
    return this.notifications.list(q);
  }
}
