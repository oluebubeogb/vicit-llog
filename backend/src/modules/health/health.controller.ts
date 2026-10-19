import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'System health check (public)' })
  check() {
    return this.health.check();
  }

  @Post('cleanup-photos')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Run photo retention cleanup' })
  cleanup(@CurrentUser() user: any) {
    return this.health.cleanupOldPhotos(user.orgId);
  }
}
