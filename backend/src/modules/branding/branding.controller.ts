import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { BrandingService } from './branding.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Branding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('branding')
export class BrandingController {
  constructor(private branding: BrandingService) {}

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE)
  @ApiOperation({ summary: 'Get organisation branding & settings' })
  get(@CurrentUser() user: any) {
    return this.branding.get(user.orgId);
  }

  @Patch()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update white-label branding & settings' })
  update(@Body() body: any, @CurrentUser() user: any) {
    return this.branding.update(user.orgId, body);
  }
}
