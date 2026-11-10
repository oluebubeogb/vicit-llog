import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsDrillService } from './analytics-drill.service';
import { AttendanceRegisterService } from './attendance-register.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsDrillService, AttendanceRegisterService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
