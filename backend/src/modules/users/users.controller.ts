import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Response } from 'express';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: onboard staff (returns initialPassword once)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.usersService.create(dto, user.orgId);
  }

  @Post('bulk')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: bulk create staff from CSV rows; returns credentials CSV' })
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
  @ApiOperation({ summary: 'Admin: list users (no passwords)' })
  findAll(@CurrentUser() user: any) {
    return this.usersService.findAll(user.orgId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  me(@CurrentUser() user: any) {
    return this.usersService.findById(user.id);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: get user details (no password)' })
  one(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: update staff details' })
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.usersService.updateStaff(id, user.orgId, body);
  }

  @Post(':id/reset-password')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: reset password → new 5-letter Nigerian word (shown once)' })
  resetPassword(@Param('id') id: string, @CurrentUser() user: any) {
    return this.usersService.resetPassword(id, user.orgId);
  }
}
