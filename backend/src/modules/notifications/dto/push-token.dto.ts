import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}

export class RemovePushTokenDto {
  @IsString()
  @MaxLength(4096)
  token!: string;
}
