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

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE)
  @ApiOperation({ summary: 'Create visitor invite' })
  create(@Body() dto: CreateInviteDto, @CurrentUser() user: any) {
    return this.invitesService.create(dto, user.id, user.orgId);
  }

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE)
  @ApiOperation({ summary: 'List my invites' })
  mine(@CurrentUser() user: any) {
    return this.invitesService.findMyInvites(user.id);
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

  @Post(':id/revive')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE)
  @ApiOperation({ summary: 'Revive an expired invite (new 60-min window)' })
  revive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invitesService.revive(id, user.id, user.orgId);
  }

  @Post(':id/approve-offline')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: approve offline visitor request' })
  approveOffline(@Param('id') id: string, @CurrentUser() user: any) {
    return this.invitesService.approveOffline(id, user.id, user.orgId);
  }
}
