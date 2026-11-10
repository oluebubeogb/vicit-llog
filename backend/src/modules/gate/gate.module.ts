import { Module } from '@nestjs/common';
import { GateService } from './gate.service';
import { GateController } from './gate.controller';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContractorsModule } from '../contractors/contractors.module';

@Module({
  imports: [AuditModule, NotificationsModule, ContractorsModule],
  controllers: [GateController],
  providers: [GateService],
})
export class GateModule {}
