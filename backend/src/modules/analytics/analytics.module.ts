import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsDrillService } from './analytics-drill.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsDrillService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
