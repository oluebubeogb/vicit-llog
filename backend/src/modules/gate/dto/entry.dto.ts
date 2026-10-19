import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntryMode } from '@prisma/client';

export class EntryDto {
  @ApiProperty()
  @IsString()
  visitorId: string;

  @ApiPropertyOptional({ enum: EntryMode, default: EntryMode.PEDESTRIAN })
  @IsOptional()
  @IsEnum(EntryMode)
  entryMode?: EntryMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
