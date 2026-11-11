import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DispatchesService } from './dispatches.service';

@ApiTags('Dispatches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dispatches')
export class DispatchesController {
  constructor(private dispatches: DispatchesService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN, Role.GLOBAL_GATE, Role.GATE)
  list(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.dispatches.list(user, status);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_GATE, Role.GATE)
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.dispatches.create(user, body);
  }

  @Post('photo')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_GATE, Role.GATE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('Photo required');
    return this.dispatches.uploadPhoto(user, file);
  }

  @Get('inbox')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN, Role.GLOBAL_GATE, Role.GATE, Role.STAFF)
  inbox(@CurrentUser() user: any) {
    return this.dispatches.inbox(user);
  }

  @Get('photo/:filename')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN, Role.GLOBAL_GATE, Role.GATE, Role.STAFF)
  photo(@Param('filename') filename: string, @Res() res: Response) {
    res.sendFile(this.dispatches.getPhotoPath(filename));
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN, Role.GLOBAL_GATE, Role.GATE, Role.STAFF)
  one(@Param('id') id: string, @CurrentUser() user: any) {
    return this.dispatches.one(user, id);
  }

  @Post(':id/acknowledge')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN, Role.GLOBAL_GATE, Role.GATE, Role.STAFF)
  acknowledge(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.dispatches.acknowledge(user, id, body || {});
  }

  @Post(':id/decide')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  decide(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.dispatches.decide(user, id, String(body.organisationId || user.orgId), body.approve === true, body.note);
  }

  @Post(':id/mark')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_GATE, Role.GATE)
  mark(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    const status = String(body.status || '').toUpperCase();
    if (!['DELIVERED', 'EXITED'].includes(status)) throw new BadRequestException('Mark as delivered or exited');
    return this.dispatches.mark(user, id, status as any);
  }
}
