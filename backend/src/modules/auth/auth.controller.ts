import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  newPassword: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login with email & password' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change own password (required on first login)' })
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changeOwnPassword(user.id, dto.currentPassword, dto.newPassword);
  }
}
