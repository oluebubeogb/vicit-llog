import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { AnalyticsDrillService, DrillFilter, EXPORT_CAP } from './analytics-drill.service';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard';

const ENUM = /^[A-Z_]{2,32}$/;
const ID = /^[0-9a-f-]{36}$|^none$/i;

/** Whitelist + coerce drill-down query params (unknown keys are ignored). */
function parseDrill(q: Record<string, any>): DrillFilter {
  const int = (v: any, lo: number, hi: number) => {
    if (v === undefined || v === '') return undefined;
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
  };
  const str = (v: any, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : undefined);
  return {
    days: int(q.days, 1, 366) ?? 30,
    from: str(q.from, /^\d{4}-\d{2}-\d{2}/),
    to: str(q.to, /^\d{4}-\d{2}-\d{2}/),
    metric: str(q.metric, /^[a-zA-Z]{2,20}$/) || 'total',
    category: str(q.category, ENUM),
    purpose: typeof q.purpose === 'string' ? q.purpose.slice(0, 200) : undefined,
    entryMode: str(q.entryMode, ENUM),
    status: str(q.status, ENUM),
    inviteStatus: str(q.inviteStatus, ENUM),
    locationId: str(q.locationId, ID),
    gateId: str(q.gateId, ID),
    hostId: str(q.hostId, ID),
    day: str(q.day, /^\d{4}-\d{2}-\d{2}$/),
    hour: int(q.hour, 0, 23),
    weekday: int(q.weekday, 0, 6),
    duration: int(q.duration, 0, 4),
    visitorKey: typeof q.visitorKey === 'string' ? q.visitorKey.slice(0, 120) : undefined,
  };
}

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
@Roles(Role.ADMIN)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private analytics: AnalyticsService,
    private drill: AnalyticsDrillService,
  ) {}

  @Get('drill')
  @RateLimit(60, 60)
  @ApiOperation({ summary: 'Drill-down: newest 100 records behind any analytics number (+ total)' })
  drillList(@CurrentUser() user: any, @Query() q: Record<string, any>) {
    return this.drill.list(user.orgId, parseDrill(q));
  }

  @Get('drill/export')
  @RateLimit(6, 60)
  @ApiOperation({ summary: `CSV export of a drill-down (newest first, capped at ${EXPORT_CAP} rows)` })
  async drillExport(@CurrentUser() user: any, @Query() q: Record<string, any>, @Res() res: Response) {
    const name = typeof q.name === 'string' ? `vicit-${q.name}`.slice(0, 60) : 'vicit-export';
    await this.drill.exportCsv(user.orgId, parseDrill(q), res, name);
  }

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

  /** Legacy drill-down (kept for older clients): same records as /drill, rows only. */
  @Get('visitors')
  @RateLimit(60, 60)
  @ApiOperation({ summary: 'Drill-down (legacy): visitors matching a metric/filter' })
  async visitors(@CurrentUser() user: any, @Query() q: Record<string, any>) {
    const f = parseDrill(q);
    if (f.metric && !['total', 'arrived', 'exited', 'denied', 'activeNow'].includes(f.metric)) f.metric = 'total';
    return (await this.drill.list(user.orgId, f)).rows;
  }
}
