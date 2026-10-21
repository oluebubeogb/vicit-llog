import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
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
    return this.usersService.create(dto, user.orgId);
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
    return this.usersService.requestProfileEdit(user.id, user.orgId, body);
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
  @Roles(Role.ADMIN)
  listEdits(@CurrentUser() user: any) {
    return this.usersService.listProfileEdits(user.orgId);
  }

  @Post('profile-edits/bulk-review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Bulk approve/decline profile edits' })
  bulkReview(
    @Body() body: { ids: string[]; approve: boolean; note?: string },
    @CurrentUser() user: any,
  ) {
    return this.usersService.bulkReviewProfileEdits(
      user.orgId,
      user.id,
      body.ids || [],
      !!body.approve,
      body.note,
    );
  }

  @Post('profile-edits/:id/review')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  reviewEdit(
    @Param('id') id: string,
    @Body() body: { approve: boolean; note?: string },
    @CurrentUser() user: any,
  ) {
    return this.usersService.reviewProfileEdit(
      id,
      user.orgId,
      user.id,
      !!body.approve,
      body.note,
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  one(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.usersService.updateStaff(id, user.orgId, body);
  }

  @Post(':id/reset-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  resetPassword(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.resetPassword(id, user.orgId);
  }
}
