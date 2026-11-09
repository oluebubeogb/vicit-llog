import { Body, Controller, Delete, Get, HttpCode, Patch, Param, Post, UseGuards } from '@nestjs/common';
import { RegisterPushTokenDto, RemovePushTokenDto } from './dto/push-token.dto';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications' })
  list(@CurrentUser() user: any) {
    return this.notificationsService.findForUser(user.id, user.orgId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAll(@CurrentUser() user: any) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Get('push-config')
  @ApiOperation({ summary: 'Web Push (VAPID) public key for this browser' })
  pushConfig() {
    return this.notificationsService.pushStatus();
  }

  @Get('push-status')
  @ApiOperation({ summary: 'Whether the server can send Web Push' })
  pushStatus() {
    return this.notificationsService.pushStatus();
  }

  @Post('push-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Register this device\'s FCM token for push notifications' })
  registerPush(@Body() dto: RegisterPushTokenDto, @CurrentUser() user: any) {
    return this.notificationsService.registerPushToken(user.id, dto);
  }

  @Delete('push-token')
  @ApiOperation({ summary: 'Remove one of my FCM tokens (logout / opt-out)' })
  removePush(@Body() dto: RemovePushTokenDto, @CurrentUser() user: any) {
    return this.notificationsService.removePushToken(user.id, dto.token);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@Param('id') id: string, @CurrentUser() user: any) {
    return this.notificationsService.markRead(id, user.id);
  }
}
