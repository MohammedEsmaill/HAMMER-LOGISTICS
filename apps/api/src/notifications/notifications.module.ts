import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  controllers: [NotificationsController],
  providers: [WhatsappService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
