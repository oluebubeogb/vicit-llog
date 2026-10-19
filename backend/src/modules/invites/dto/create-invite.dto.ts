import {
  IsString,
  IsInt,
  Min,
  Max,
  IsArray,
  IsOptional,
  IsEnum,
  IsBoolean,
  ArrayMinSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntryMode } from '@prisma/client';

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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  guestNames?: string[];

  @ApiPropertyOptional({ enum: EntryMode })
  @IsOptional()
  @IsEnum(EntryMode)
  expectedMode?: EntryMode;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isOffline?: boolean;
}
