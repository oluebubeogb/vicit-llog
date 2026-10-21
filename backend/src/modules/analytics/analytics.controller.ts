import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Admin analytics dashboard' })
  dashboard(
    @CurrentUser() user: any,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const d = Math.min(366, Math.max(1, days ? parseInt(days, 10) || 30 : 30));
    return this.analytics.dashboard(user.orgId, d, from, to);
  }

  @Get('visitors')
  @ApiOperation({ summary: 'Drill-down: visitors matching a metric/filter' })
  visitors(
    @CurrentUser() user: any,
    @Query('days') days?: string,
    @Query('metric') metric?: string,
    @Query('purpose') purpose?: string,
    @Query('entryMode') entryMode?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const d = Math.min(366, Math.max(1, days ? parseInt(days, 10) || 30 : 30));
    return this.analytics.listVisitors(user.orgId, d, {
      metric,
      purpose,
      entryMode,
      status,
      from,
      to,
    });
  }
}
