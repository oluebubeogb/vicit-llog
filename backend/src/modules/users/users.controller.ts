import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminOrGateSilentGuard } from '../../common/guards/admin-or-gate-silent.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  /** Staff profile page — ADMIN / GATE only; others get 404 (silent) */
  @Get('public/:id')
  @ApiBearerAuth()
  @UseGuards(AdminOrGateSilentGuard)
  @ApiOperation({ summary: 'Staff profile (admin/gate only; others get 404)' })
  publicProfile(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.getPublicProfile(id, {
      id: user.id,
      role: user.role,
      orgId: user.orgId,
    });
  }

  @Get('avatar/:filename')
  @ApiOperation({ summary: 'Serve profile avatar' })
  getAvatar(@Param('filename') filename: string, @Res() res: Response) {
    const filepath = this.usersService.getAvatarPath(filename);
    res.sendFile(filepath);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: onboard staff' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.usersService.create(dto, user.orgId, user.id);
  }

  @Post('bulk')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: bulk create staff' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              fullName: { type: 'string' },
              email: { type: 'string' },
              role: { type: 'string' },
              portfolio: { type: 'string' },
              phone: { type: 'string' },
            },
          },
        },
      },
    },
  })
  bulk(@Body('rows') rows: any[], @CurrentUser() user: any) {
    return this.usersService.bulkCreate(user.orgId, rows || []);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAll(@CurrentUser() user: any) {
    return this.usersService.findAll(user.orgId);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: any) {
    return this.usersService.findById(user.id);
  }

  @Post('me/profile-edit')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Request profile change (pending admin approval)' })
  requestEdit(@Body() body: any, @CurrentUser() user: any) {
    return this.usersService.requestProfileEdit(user.id, user.orgId, body, user.role);
  }

  @Post('me/avatar')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Upload own profile photo' })
  uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.usersService.uploadAvatar(user.id, file);
  }

  @Get('profile-edits')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN)
  listEdits(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.usersService.listProfileEdits(user, status);
  }

  @Get('approvals/summary')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN)
  @ApiOperation({ summary: 'Pending approvals count + recent approve/reject timeline' })
  approvalsSummary(@CurrentUser() user: any) {
    return this.usersService.approvalsSummary(user);
  }

  @Get('custom-fields')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Active custom user fields for your agency' })
  myCustomFields(@CurrentUser() user: any) {
    return this.usersService.customFieldsFor(user.orgId);
  }

  @Post('profile-edits/bulk-review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN)
  @ApiOperation({ summary: 'Bulk approve/decline profile edits' })
  bulkReview(
    @Body() body: { ids: string[]; approve: boolean; note?: string },
    @CurrentUser() user: any,
  ) {
    return this.usersService.bulkReviewProfileEdits(
      user,
      user.id,
      body.ids || [],
      !!body.approve,
      body.note,
    );
  }

  @Post('profile-edits/:id/review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN)
  reviewEdit(
    @Param('id') id: string,
    @Body() body: { approve: boolean; note?: string },
    @CurrentUser() user: any,
  ) {
    return this.usersService.reviewProfileEdit(
      id,
      user,
      user.id,
      !!body.approve,
      body.note,
    );
  }


  @Get('me/staff-qr/status')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Staff QR / PIN status for the signed-in user' })
  staffQrStatus(@CurrentUser() user: any) {
    return this.usersService.staffQrStatus(user.id);
  }

  @Post('me/staff-qr/pin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Set 4-digit staff QR PIN (first time)' })
  setStaffPin(@Body() body: { pin: string; confirmPin: string }, @CurrentUser() user: any) {
    return this.usersService.setStaffPin(user.id, body.pin, body.confirmPin);
  }

  @Post('me/staff-qr/unlock')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify PIN and return staff QR payload (required every access)' })
  unlockStaffQr(@Body() body: { pin: string }, @CurrentUser() user: any) {
    return this.usersService.verifyStaffPin(user.id, body.pin);
  }

  @Post('me/staff-qr/reset-pin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Reset staff PIN with account password (optionally set a new PIN)' })
  resetStaffPin(
    @Body() body: { password: string; newPin?: string; confirmPin?: string },
    @CurrentUser() user: any,
  ) {
    return this.usersService.resetStaffPinWithPassword(user.id, body.password, body.newPin, body.confirmPin);
  }

  @Post('me/staff-qr/badge-photo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 4 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Upload live camera snap for the printable staff badge' })
  uploadBadgePhoto(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    return this.usersService.uploadStaffBadgePhoto(user.id, file);
  }

  @Get('staff-badge/:filename')
  @ApiOperation({ summary: 'Serve staff badge camera photo' })
  getBadgePhoto(@Param('filename') filename: string, @Res() res: Response) {
    const filepath = this.usersService.getStaffBadgePath(filename);
    res.sendFile(filepath);
  }

  @Post(':id/clear-staff-pin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: clear a user staff QR PIN so they can set a new one' })
  clearStaffPin(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.adminClearStaffPin(id, user.orgId, user.role);
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  one(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.findById(id, user.orgId);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: edit staff (name, email, phone, portfolio, role, active)' })
  update(@Param('id') id: string, @Body() body: UpdateUserDto, @CurrentUser() user: any) {
    return this.usersService.updateStaff(id, user.orgId, body, user.id);
  }

  @Post(':id/reset-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  resetPassword(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.resetPassword(id, user.orgId);
  }
}
