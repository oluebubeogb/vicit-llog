import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { InvitesService } from './invites.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Invites')
@Controller('invites')
export class InvitesController {
  constructor(private invitesService: InvitesService) {}

  @Post('visitors/:visitorId/transfer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN)
  @ApiOperation({ summary: 'Transfer a visit to another agency or host' })
  transfer(@Param('visitorId') visitorId: string, @Body() body: any, @CurrentUser() user: any) {
    return this.invitesService.transferVisit(user, visitorId, body || {});
  }


  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
  @ApiOperation({ summary: 'Create visitor invite' })
  create(@Body() dto: CreateInviteDto, @CurrentUser() user: any) {
    return this.invitesService.create(dto, user.id, user.orgId, user.role);
  }

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
  @ApiOperation({ summary: 'List my invites' })
  mine(@CurrentUser() user: any) {
    return this.invitesService.findMyInvites(user.id);
  }

  @Get('search')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
  @ApiOperation({ summary: 'Ranked multi-word search across invites and their visitors' })
  search(
    @CurrentUser() user: any,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.invitesService.search(
      { id: user.id, role: user.role, orgId: user.orgId },
      typeof q === 'string' ? q.slice(0, 200) : '',
      parseInt(page || '1', 10) || 1,
      parseInt(pageSize || '30', 10) || 30,
    );
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: list all organisation invites' })
  all(@CurrentUser() user: any) {
    return this.invitesService.findAll(user.orgId);
  }

  @Get('public/:token')
  @ApiOperation({ summary: 'Public: get invite by token (for visitor page)' })
  publicInfo(@Param('token') token: string) {
    return this.invitesService.getPublicInviteInfo(token);
  }

  @Get('identity/pending')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
  @ApiOperation({ summary: 'Gate photos of no-contact guests waiting for this host to confirm' })
  pendingIdentity(@CurrentUser() user: any) {
    return this.invitesService.pendingIdentity(user);
  }

  @Post('visitors/:visitorId/identity')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
  @ApiOperation({ summary: 'Host confirms (tick) or declines (X) a no-contact guest photo from the gate' })
  reviewIdentity(@Param('visitorId') visitorId: string, @Body() body: { confirm: boolean }, @CurrentUser() user: any) {
    return this.invitesService.reviewIdentity(visitorId, user, !!body?.confirm);
  }

  @Post(':id/cancel')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
  @ApiOperation({ summary: 'Host cancels an invite; guests are notified' })
  cancel(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() user: any) {
    return this.invitesService.cancel(id, user, body?.reason);
  }

  @Post(':id/postpone')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
  @ApiOperation({ summary: 'Postpone an active or expired invite to a future date/time' })
  postpone(@Param('id') id: string, @Body() body: { expectedAt?: string; note?: string }, @CurrentUser() user: any) {
    return this.invitesService.postpone(id, user, body || {});
  }

  @Post(':id/confirm-availability')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
  @ApiOperation({ summary: 'Host confirms they will be available for the visit (reminder action)' })
  confirmAvailability(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invitesService.confirmAvailability(id, user);
  }

  @Post(':id/revive')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
  @ApiOperation({ summary: 'Revive an expired invite (new 60-min window)' })
  revive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invitesService.revive(id, user.id, user.orgId);
  }

  @Post(':id/approve-offline')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: approve an offline request or an invite awaiting approval' })
  approveOffline(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invitesService.approveOffline(id, user.id, user.orgId);
  }
}
