import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Response } from 'express';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('visits.csv')
  @ApiOperation({ summary: 'Export visits as CSV' })
  async exportCsv(
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('columns') columns: string,
    @Res() res: Response,
  ) {
    const cols = columns
      ? columns.split(',').map((c) => c.trim()).filter(Boolean)
      : undefined;
    const result = await this.reports.exportVisitsCsv(
      user.orgId,
      from,
      to,
      cols,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.send(result.csv);
  }

  @Get('history')
  @ApiOperation({ summary: 'Search visitor history' })
  history(@CurrentUser() user: any, @Query('q') q: string) {
    return this.reports.visitorHistory(user.orgId, q || '');
  }
}
