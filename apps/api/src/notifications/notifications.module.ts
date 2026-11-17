import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [InboxModule],
  controllers: [NotificationsController],
  providers: [WhatsappService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
