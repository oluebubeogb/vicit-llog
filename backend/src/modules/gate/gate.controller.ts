import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { GateService } from './gate.service';
import { EntryDto } from './dto/entry.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Gate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.GATE)
@Controller('gate')
export class GateController {
  constructor(private gateService: GateService) {}

  @Get('lookup')
  @ApiOperation({ summary: 'Lookup visitor by passphrase or QR payload' })
  lookup(@Query('code') code: string) {
    return this.gateService.lookup(code);
  }

  @Get('visits')
  @ApiOperation({ summary: 'List visits for gate dashboard' })
  visits(@CurrentUser() user: any, @Query('filter') filter?: string) {
    return this.gateService.listVisits(user.orgId, filter);
  }

  @Post('entry')
  @ApiOperation({ summary: 'Record visitor entry' })
  entry(@Body() dto: EntryDto, @CurrentUser() user: any) {
    return this.gateService.recordEntry(dto, user.id);
  }

  @Post('exit/:visitorId')
  @ApiOperation({ summary: 'Record visitor exit' })
  exit(
    @Param('visitorId') visitorId: string,
    @Body('notes') notes: string,
    @CurrentUser() user: any,
  ) {
    return this.gateService.recordExit(visitorId, user.id, notes);
  }

  @Post('deny/:visitorId')
  @ApiOperation({ summary: 'Decline visitor entry (requires comment)' })
  deny(
    @Param('visitorId') visitorId: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    return this.gateService.denyEntry(visitorId, user.id, reason);
  }
}
