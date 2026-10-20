import {
  IsString,
  IsInt,
  Min,
  Max,
  IsArray,
  IsOptional,
  IsEnum,
  IsBoolean,
  ValidateNested,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntryMode } from '@prisma/client';

export class GuestInputDto {
  @ApiProperty()
  @IsString()
  fullName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}

export class CreateInviteDto {
  @ApiProperty({ example: 'Meeting with procurement team' })
  @IsString()
  purpose: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  guestCount?: number;

  /** @deprecated use guests[] */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  guestNames?: string[];

  @ApiPropertyOptional({ type: [GuestInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuestInputDto)
  guests?: GuestInputDto[];

  @ApiPropertyOptional({ enum: EntryMode })
  @IsOptional()
  @IsEnum(EntryMode)
  expectedMode?: EntryMode;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isOffline?: boolean;

  @ApiPropertyOptional({ description: 'ISO date-time when visit is expected' })
  @IsOptional()
  @IsString()
  expectedAt?: string;
}
