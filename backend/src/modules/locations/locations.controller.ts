import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('locations')
export class LocationsController {
  constructor(private locations: LocationsService) {}

  /** Agency admin: own agency only. Super Admin: any agency, chosen with ?orgId=. */
  private org(user: any, orgId?: string) {
    return this.locations.scopeOrg(user, orgId);
  }

  @Get('settings') async settings(@CurrentUser() user: any, @Query('orgId') q?: string) { return this.locations.settings(await this.org(user, q)); }

  @Patch('settings') async updateSettings(@Body('maxGates') maxGates: number, @CurrentUser() user: any, @Query('orgId') q?: string) { return this.locations.updateSettings(await this.org(user, q), Number(maxGates)); }

  @Get('officers') async officers(@CurrentUser() user: any, @Query('orgId') q?: string) { return this.locations.officers(await this.org(user, q)); }

  @Patch('gates/:gateId')
  @ApiOperation({ summary: 'Edit a gate / checkpoint (name, code, settings)' })
  async updateGate(@Param('gateId') gateId: string, @Body() body: any, @CurrentUser() user: any, @Query('orgId') q?: string) { return this.locations.updateGate(gateId, await this.org(user, q), body, user); }

  @Get()
  @ApiOperation({ summary: 'List locations with gates' })
  async list(@CurrentUser() user: any, @Query('orgId') q?: string) {
    return this.locations.listLocations(await this.org(user, q));
  }

  @Post()
  @ApiOperation({ summary: 'Create location' })
  async create(@Body() body: any, @CurrentUser() user: any, @Query('orgId') q?: string) {
    return this.locations.createLocation(await this.org(user, q), body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a location (name, code, address)' })
  async updateLocation(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any, @Query('orgId') q?: string) {
    return this.locations.updateLocation(id, await this.org(user, q), body || {}, user);
  }

  @Post(':id/gates')
  @ApiOperation({ summary: 'Add gate to location' })
  async addGate(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any, @Query('orgId') q?: string) {
    return this.locations.createGate(id, await this.org(user, q), body);
  }

  @Post('gates/:gateId/officers/:userId')
  async assignOfficer(@Param('gateId') gateId: string, @Param('userId') userId: string, @CurrentUser() user: any, @Query('orgId') q?: string) {
    return this.locations.assignOfficer(gateId, await this.org(user, q), userId, user);
  }

  @Delete('gates/:gateId/officers/:userId')
  @ApiOperation({ summary: 'Unassign gate officer from checkpoint' })
  async unassignOfficer(@Param('gateId') gateId: string, @Param('userId') userId: string, @CurrentUser() user: any, @Query('orgId') q?: string) {
    return this.locations.unassignOfficer(gateId, await this.org(user, q), userId, user);
  }

  @Patch('gates/:gateId/order')
  async reorderGate(@Param('gateId') gateId: string, @Body('sequence') sequence: number, @CurrentUser() user: any, @Query('orgId') q?: string) {
    return this.locations.reorderGate(gateId, await this.org(user, q), Number(sequence));
  }

  @Get('gates/all')
  @ApiOperation({ summary: 'List all gates' })
  async gates(@CurrentUser() user: any, @Query('orgId') q?: string) {
    return this.locations.listGates(await this.org(user, q));
  }
}
