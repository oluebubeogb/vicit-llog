import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContractorsService } from './contractors.service';

const imageUpload = {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    if (!file.mimetype.startsWith('image/')) return cb(new BadRequestException('Only images allowed') as any, false);
    cb(null, true);
  },
};

@ApiTags('Contractors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ContractorsController {
  constructor(private contractors: ContractorsService) {}

  @Get('directory/agencies')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE, Role.ADMIN, Role.STAFF, Role.GATE)
  agencies(@CurrentUser() user: any) {
    return this.contractors.agencies(user);
  }

  @Get('directory/hosts')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE, Role.ADMIN, Role.STAFF, Role.GATE)
  hosts(
    @CurrentUser() user: any,
    @Query('organisationId') organisationId?: string,
    @Query('q') q?: string,
    @Query('contractorId') contractorId?: string,
  ) {
    return this.contractors.hosts(user, organisationId, q, contractorId);
  }

  @Get('contractors')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN, Role.GLOBAL_GATE, Role.GATE)
  list(
    @CurrentUser() user: any,
    @Query('q') q?: string,
    @Query('organisationId') organisationId?: string,
    @Query('status') status?: string,
  ) {
    return this.contractors.list(user, { search: q, organisationId, status });
  }

  @Post('contractors')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN)
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.contractors.create(user, body);
  }

  @Get('contractors/photo/:filename')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN, Role.GLOBAL_GATE, Role.GATE)
  photo(@Param('filename') filename: string, @Res() res: Response) {
    res.sendFile(this.contractors.getPhotoPath(filename));
  }

  @Get('contractors/by-token/:token')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN, Role.GLOBAL_GATE, Role.GATE)
  @Header('Cache-Control', 'no-store')
  byToken(@Param('token') token: string, @CurrentUser() user: any) {
    return this.contractors.getByToken(user, token);
  }

  @Get('contractors/:id/qr.png')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN, Role.GLOBAL_GATE, Role.GATE)
  async qr(@Param('id') id: string, @CurrentUser() user: any, @Res() res: Response) {
    const { png, filename } = await this.contractors.qrPng(user, id);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(png);
  }

  @Post('contractors/:id/photo')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('photo', imageUpload))
  uploadPhoto(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('A live camera photo is required');
    return this.contractors.uploadPhoto(user, id, file);
  }

  @Post('contractors/:id/reprint')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN)
  reprint(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.contractors.reprint(user, id, body?.email === true);
  }

  @Post('contractors/:id/renew')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN)
  renew(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.contractors.renew(user, id, body || {});
  }

  @Post('contractors/:id/terminate')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN)
  terminate(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.contractors.terminate(user, id, body || {});
  }

  @Patch('contractors/:id')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.ADMIN)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.contractors.update(user, id, body);
  }

  @Post('gate/contractor-entry')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_GATE, Role.GATE)
  @ApiOperation({ summary: 'Check a contractor in and record their destination' })
  checkIn(@Body() body: any, @CurrentUser() user: any) {
    return this.contractors.checkIn(user, body || {});
  }

  @Post('gate/contractor-exit')
  @Roles(Role.SUPER_ADMIN, Role.GLOBAL_GATE, Role.GATE)
  checkOut(@Body() body: any, @CurrentUser() user: any) {
    return this.contractors.checkOut(user, body || {});
  }
}
