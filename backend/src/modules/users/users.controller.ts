import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: onboard staff' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.usersService.create(dto, user.orgId);
  }

  @Post('bulk')
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
  @Roles(Role.ADMIN)
  findAll(@CurrentUser() user: any) {
    return this.usersService.findAll(user.orgId);
  }

  @Get('me')
  me(@CurrentUser() user: any) {
    return this.usersService.findById(user.id);
  }

  @Post('me/profile-edit')
  @ApiOperation({ summary: 'Request profile change (pending admin approval)' })
  requestEdit(@Body() body: any, @CurrentUser() user: any) {
    return this.usersService.requestProfileEdit(user.id, user.orgId, body);
  }

  @Get('profile-edits')
  @Roles(Role.ADMIN)
  listEdits(@CurrentUser() user: any) {
    return this.usersService.listProfileEdits(user.orgId);
  }

  @Post('profile-edits/:id/review')
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
  @Roles(Role.ADMIN)
  one(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.usersService.updateStaff(id, user.orgId, body);
  }

  @Post(':id/reset-password')
  @Roles(Role.ADMIN)
  resetPassword(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.resetPassword(id, user.orgId);
  }
}
