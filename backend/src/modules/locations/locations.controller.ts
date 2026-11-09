import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
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
@Roles(Role.ADMIN)
@Controller('locations')
export class LocationsController {
  constructor(private locations: LocationsService) {}

  @Get('settings') settings(@CurrentUser() user: any) { return this.locations.settings(user.orgId); }

  @Patch('settings') updateSettings(@Body('maxGates') maxGates: number, @CurrentUser() user: any) { return this.locations.updateSettings(user.orgId, Number(maxGates)); }

  @Patch('gates/:gateId') updateGate(@Param('gateId') gateId: string, @Body() body: any, @CurrentUser() user: any) { return this.locations.updateGate(gateId, user.orgId, body); }

  @Get()
  @ApiOperation({ summary: 'List locations with gates' })
  list(@CurrentUser() user: any) {
    return this.locations.listLocations(user.orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Create location' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.locations.createLocation(user.orgId, body);
  }

  @Post(':id/gates')
  @ApiOperation({ summary: 'Add gate to location' })
  addGate(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.locations.createGate(id, user.orgId, body);
  }

  @Post('gates/:gateId/officers/:userId')
  assignOfficer(@Param('gateId') gateId: string, @Param('userId') userId: string, @CurrentUser() user: any) {
    return this.locations.assignOfficer(gateId, user.orgId, userId);
  }

  @Delete('gates/:gateId/officers/:userId')
  @ApiOperation({ summary: 'Unassign gate officer from checkpoint' })
  unassignOfficer(@Param('gateId') gateId: string, @Param('userId') userId: string, @CurrentUser() user: any) {
    return this.locations.unassignOfficer(gateId, user.orgId, userId);
  }

  @Patch('gates/:gateId/order')
  reorderGate(@Param('gateId') gateId: string, @Body('sequence') sequence: number, @CurrentUser() user: any) {
    return this.locations.reorderGate(gateId, user.orgId, Number(sequence));
  }

  @Get('gates/all')
  @ApiOperation({ summary: 'List all gates' })
  gates(@CurrentUser() user: any) {
    return this.locations.listGates(user.orgId);
  }
}
