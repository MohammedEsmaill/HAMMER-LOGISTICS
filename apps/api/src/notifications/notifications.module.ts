import { Module } from '@nestjs/common';
import { InboxModule } from '../inbox/inbox.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ShareLinkService } from './share-link.service';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [InboxModule],
  controllers: [NotificationsController],
  providers: [WhatsappService, NotificationsService, ShareLinkService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
