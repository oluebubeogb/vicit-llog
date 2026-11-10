import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res, UseGuards, ForbiddenException } from '@nestjs/common';
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
import { AttendanceRegisterService, RegisterQuery } from './attendance-register.service';

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
    officerId: str(q.officerId, ID),
    organisationId: str(q.organisationId, /^[0-9a-f-]{36}$/i),
    item: typeof q.item === 'string' ? q.item.slice(0, 200) : undefined,
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
@Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private analytics: AnalyticsService,
    private drill: AnalyticsDrillService,
    private register: AttendanceRegisterService,
  ) {}

  @Get('platform')
  @ApiOperation({ summary: 'Cross-agency analytics grouped by agency for platform oversight' })
  async platformDashboard(@CurrentUser() user: any, @Query('days') days?: string, @Query('from') from?: string, @Query('to') to?: string) {
    if (user.role === Role.GLOBAL_ADMIN && !(user.permissions || []).includes('visits.view')) throw new ForbiddenException('Cross-agency visitor access is not enabled for your account');
    if (user.role !== Role.SUPER_ADMIN && user.role !== Role.GLOBAL_ADMIN) throw new ForbiddenException();
    const d = Math.min(366, Math.max(1, days ? parseInt(days, 10) || 30 : 30));
    return this.analytics.platformDashboard(d, from, to);
  }

  private canPlatform(user: any) {
    return user.role === Role.SUPER_ADMIN || (user.role === Role.GLOBAL_ADMIN && (user.permissions || []).includes('visits.view'));
  }

  /** Agency admins are scoped to their org; platform roles may pass organisationId or omit it for all agencies. */
  private orgForDrill(user: any, f: DrillFilter): string | null {
    if (user.role === Role.ADMIN) return user.orgId;
    if (!this.canPlatform(user)) throw new ForbiddenException();
    return f.organisationId || null;
  }

  @Get('drill')
  @RateLimit(60, 60)
  @ApiOperation({ summary: 'Drill-down: newest 100 records behind any analytics number (+ total and breakdowns)' })
  drillList(@CurrentUser() user: any, @Query() q: Record<string, any>) {
    const f = parseDrill(q);
    return this.drill.list(this.orgForDrill(user, f), f);
  }

  @Get('drill/export')
  @RateLimit(6, 60)
  @ApiOperation({ summary: `CSV export of a drill-down (newest first, capped at ${EXPORT_CAP} rows)` })
  async drillExport(@CurrentUser() user: any, @Query() q: Record<string, any>, @Res() res: Response) {
    const f = parseDrill(q);
    const name = typeof q.name === 'string' ? `vicit-${q.name}`.slice(0, 60) : 'vicit-export';
    await this.drill.exportCsv(this.orgForDrill(user, f), f, res, name);
  }

  
  /** Agency admins: own org. Super Admin: all or one agency. Super Admin II: read-only oversight (needs visits.view). */
  private registerOrg(user: any, organisationId?: string): string | null {
    if (user.role === Role.ADMIN) return user.orgId;
    if (user.role === Role.SUPER_ADMIN || user.role === Role.GLOBAL_ADMIN) {
      return organisationId && /^[0-9a-f-]{36}$/i.test(organisationId) ? organisationId : null;
    }
    throw new ForbiddenException();
  }

  private parseRegister(q: Record<string, any>): RegisterQuery {
    const id = (v: any) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
    const date = (v: any) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    const int = (v: any, lo: number, hi: number) => {
      const n = parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
    };
    const status = typeof q.status === 'string' && /^(all|present|late|absent|no_exit)$/.test(q.status) ? q.status : 'all';
    const role = typeof q.role === 'string' && /^(STAFF|ADMIN|GATE)$/.test(q.role) ? q.role : undefined;
    return {
      q: typeof q.q === 'string' ? q.q.slice(0, 120) : undefined,
      from: date(q.from),
      to: date(q.to),
      days: int(q.days, 1, 366),
      organisationId: id(q.organisationId),
      locationId: id(q.locationId),
      gateId: id(q.gateId),
      role,
      status,
      page: int(q.page, 1, 10000),
      pageSize: int(q.pageSize, 10, 100),
    };
  }

  @Get('attendance/register')
  @RateLimit(60, 60)
  @ApiOperation({ summary: 'Searchable attendance register with presence/late/absent/no-exit status and insights' })
  attendanceRegister(@CurrentUser() user: any, @Query() q: Record<string, any>) {
    const f = this.parseRegister(q);
    return this.register.register(this.registerOrg(user, f.organisationId || undefined), f);
  }

  @Get('attendance/register/export')
  @RateLimit(6, 60)
  @ApiOperation({ summary: 'CSV export of the attendance register (capped)' })
  async attendanceRegisterExport(@CurrentUser() user: any, @Query() q: Record<string, any>, @Res() res: Response) {
    const f = this.parseRegister(q);
    await this.register.exportCsv(this.registerOrg(user, f.organisationId || undefined), f, res);
  }

  @Get('attendance/register/staff/:id')
  @RateLimit(60, 60)
  @ApiOperation({ summary: 'One staff member attendance history (scoped)' })
  async attendanceStaff(@CurrentUser() user: any, @Param('id') id: string, @Query() q: Record<string, any>) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new BadRequestException('Invalid staff id');
    const f = this.parseRegister(q);
    const out = await this.register.staffHistory(this.registerOrg(user, f.organisationId || undefined), id, f);
    if (!out) throw new NotFoundException('Staff not found');
    return out;
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Staff attendance insights (agency-scoped for ADMIN; platform for Super Admin / Super Admin II)' })
  attendance(@CurrentUser() user: any, @Query('days') days?: string, @Query('from') from?: string, @Query('to') to?: string, @Query('organisationId') organisationId?: string) {
    const d = Math.min(366, Math.max(1, days ? parseInt(days, 10) || 30 : 30));
    if (user.role === Role.ADMIN) return this.analytics.attendanceInsights(user.orgId, d, from, to);
    if (user.role === Role.SUPER_ADMIN || (user.role === Role.GLOBAL_ADMIN && (user.permissions || []).includes('visits.view'))) {
      return this.analytics.attendanceInsights(organisationId || null, d, from, to);
    }
    throw new ForbiddenException();
  }

  @Get('attendance/drill')
  @RateLimit(60, 60)
  @ApiOperation({ summary: 'Staff attendance drill-down rows' })
  attendanceDrill(
    @CurrentUser() user: any,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('organisationId') organisationId?: string,
    @Query('staffId') staffId?: string,
    @Query('day') day?: string,
  ) {
    const d = Math.min(366, Math.max(1, days ? parseInt(days, 10) || 30 : 30));
    const opts = { days: d, from, to, staffId, day };
    if (user.role === Role.ADMIN) return this.analytics.attendanceDrill(user.orgId, opts);
    if (user.role === Role.SUPER_ADMIN || (user.role === Role.GLOBAL_ADMIN && (user.permissions || []).includes('visits.view'))) {
      return this.analytics.attendanceDrill(organisationId || null, opts);
    }
    throw new ForbiddenException();
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Analytics dashboard (agency-scoped for ADMIN; all agencies or one for Super Admin / Super Admin II)' })
  dashboard(
    @CurrentUser() user: any,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('organisationId') organisationId?: string,
  ) {
    const d = Math.min(366, Math.max(1, days ? parseInt(days, 10) || 30 : 30));
    if (user.role === Role.ADMIN) return this.analytics.dashboard(user.orgId, d, from, to);
    if (!this.canPlatform(user)) throw new ForbiddenException();
    const org = organisationId && /^[0-9a-f-]{36}$/i.test(organisationId) ? organisationId : null;
    return this.analytics.dashboard(org, d, from, to);
  }

  /** Legacy drill-down (kept for older clients): same records as /drill, rows only. */
  @Get('visitors')
  @RateLimit(60, 60)
  @ApiOperation({ summary: 'Drill-down (legacy): visitors matching a metric/filter' })
  async visitors(@CurrentUser() user: any, @Query() q: Record<string, any>) {
    if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) throw new ForbiddenException();
    const f = parseDrill(q);
    if (f.metric && !['total', 'arrived', 'exited', 'denied', 'activeNow'].includes(f.metric)) f.metric = 'total';
    return (await this.drill.list(this.orgForDrill(user, f), f)).rows;
  }
}
