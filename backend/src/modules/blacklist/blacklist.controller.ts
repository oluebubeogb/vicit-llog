import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { BlacklistService } from './blacklist.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Blacklist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('blacklist')
export class BlacklistController {
  constructor(private blacklist: BlacklistService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN)
  @ApiOperation({ summary: 'List blacklist entries' })
  list(@CurrentUser() user: any) {
    return this.blacklist.list(user.orgId, [Role.SUPER_ADMIN, Role.GLOBAL_ADMIN].includes(user.role));
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN)
  @ApiOperation({ summary: 'Add to blacklist' })
  add(@Body() body: any, @CurrentUser() user: any) {
    return this.blacklist.add(user.orgId, user.id, body, [Role.SUPER_ADMIN, Role.GLOBAL_ADMIN].includes(user.role));
  }

  @Patch(':id/deactivate')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN)
  @ApiOperation({ summary: 'Deactivate blacklist entry' })
  deactivate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.blacklist.deactivate(id, user.orgId, user.id, [Role.SUPER_ADMIN, Role.GLOBAL_ADMIN].includes(user.role));
  }

  @Get('check')
  @Roles(Role.ADMIN, Role.GATE, Role.STAFF)
  @ApiOperation({ summary: 'Check if person is blacklisted' })
  check(
    @CurrentUser() user: any,
    @Query('fullName') fullName?: string,
    @Query('idNumber') idNumber?: string,
    @Query('phone') phone?: string,
  ) {
    return this.blacklist.check(user.orgId, { fullName, idNumber, phone });
  }
}
