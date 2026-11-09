import { Module } from '@nestjs/common';
import { RingController } from './ring.controller';
import { RingService } from './ring.service';
import { RingHub } from './ring.hub';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [NotificationsModule, AuthModule],
  controllers: [RingController],
  providers: [RingService, RingHub],
  exports: [RingService],
})
export class RingModule {}
