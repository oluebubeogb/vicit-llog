import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
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

  @Get('gates/all')
  @ApiOperation({ summary: 'List all gates' })
  gates(@CurrentUser() user: any) {
    return this.locations.listGates(user.orgId);
  }
}
