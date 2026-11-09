import { Controller, Get, Post, Patch, Body, Param, UseGuards, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiConsumes } from '@nestjs/swagger';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { PlatformService } from './platform.service';

@ApiTags('Platform administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.GLOBAL_ADMIN)
@Controller('platform')
export class PlatformController {
  constructor(private service: PlatformService) {}
  @Get('people') people(@CurrentUser() user: any) { return this.service.people(user); }
  @Get('audit') audit(@CurrentUser() user: any) { return this.service.platformAudit(user); }
  @Get('agencies') agencies(@CurrentUser() user: any) { return this.service.agencies(user); }
  @Post('agencies') createAgency(@Body() body: any, @CurrentUser() user: any) { return this.service.createAgency(user, body); }
  @Post('agencies/:agencyId/logo')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('logo', { storage: memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 }, fileFilter: (_req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new BadRequestException('Only image files are allowed') as any, false) }))
  uploadAgencyLogo(@Param('agencyId') agencyId: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) { return this.service.uploadAgencyLogo(user, agencyId, file); }
  @Post('agencies/:agencyId/users') createAgencyUser(@Param('agencyId') agencyId: string, @Body() body: any, @CurrentUser() user: any) { return this.service.createAgencyUser(user, agencyId, body); }
  @Get('gates') gates(@CurrentUser() user: any) { return this.service.gates(user); }
  @Post('gates/:gateId/global-officers/:userId') assignGlobalGate(@Param('gateId') gateId: string, @Param('userId') userId: string, @CurrentUser() user: any) { return this.service.assignGlobalGate(user, gateId, userId); }
  @Get('administrators') administrators(@CurrentUser() user: any) { return this.service.globalAdmins(user); }
  @Post('administrators') createAdministrator(@Body() body: any, @CurrentUser() user: any) { return this.service.createGlobalAdmin(user, body); }
  @Get('global-gate-officers') globalGateOfficers(@CurrentUser() user: any) { return this.service.globalGateOfficers(user); }
  @Post('global-gate-officers') createGlobalGate(@Body() body: any, @CurrentUser() user: any) { return this.service.createGlobalGate(user, body); }
  @Patch('administrators/:id/status') setStatus(@Param('id') id: string, @Body('isActive') active: boolean, @CurrentUser() user: any) { return this.service.setUserActive(user, id, !!active); }
}
