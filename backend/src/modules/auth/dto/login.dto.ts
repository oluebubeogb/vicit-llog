import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@vicit.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin@12345' })
  @IsString()
  @MinLength(5)
  password: string;
}
