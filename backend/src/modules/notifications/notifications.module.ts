import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationHub } from './notification.hub';
import { HostNotifierService } from './host-notifier.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationHub, HostNotifierService],
  exports: [NotificationsService, NotificationHub, HostNotifierService],
})
export class NotificationsModule {}
