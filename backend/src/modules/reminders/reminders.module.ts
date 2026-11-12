import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [NotificationsModule, AuditModule],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
