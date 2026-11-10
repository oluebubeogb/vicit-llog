import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards, UploadedFile, UseInterceptors, Res, BadRequestException, ForbiddenException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { GateService } from './gate.service';
import { EntryDto } from './dto/entry.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Gate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
@Controller('gate')
export class GateController {
  constructor(private gateService: GateService) {}

  @Get('checkpoints')
  checkpoints(@CurrentUser() user: any) { return this.gateService.listCheckpoints(user); }

  @Post('particular-image')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadParticularImage(@UploadedFile() file: Express.Multer.File) {
    if (!file || file.mimetype !== 'image/webp') throw new BadRequestException('Checkpoint evidence must be captured and converted to WebP (max 5MB)');
    const dir = path.join(process.env.PHOTO_STORAGE_PATH || '/data/photos', 'particulars');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${uuidv4()}.webp`;
    fs.writeFileSync(path.join(dir, filename), file.buffer);
    return { imagePath: `/visitors/particulars/${filename}` };
  }

  @Get('lookup')
  @ApiOperation({ summary: 'Lookup visitor by passphrase or QR payload' })
  lookup(@Query('code') code: string, @CurrentUser() user: any) {
    return this.gateService.lookup(code, user);
  }

  @Get('visits')
  @ApiOperation({ summary: 'List visits for gate dashboard' })
  visits(@CurrentUser() user: any, @Query('filter') filter?: string) {
    return this.gateService.listVisits(user, filter);
  }

  @Patch('host-response/:visitorId')
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
  @ApiOperation({ summary: 'Host confirms availability or asks a visitor to wait' })
  hostResponse(@Param('visitorId') visitorId: string, @Body() body: any, @CurrentUser() user: any) {
    return this.gateService.respondHostAvailability(visitorId, body, user);
  }

  @Post('host-prompt/:visitorId')
  @ApiOperation({ summary: 'Gate officer requests an updated host availability response' })
  promptHost(@Param('visitorId') visitorId: string, @CurrentUser() user: any) {
    return this.gateService.requestHostAvailability(visitorId, user);
  }

  @Post('checkpoint')
  @ApiOperation({ summary: 'Record a visitor checkpoint decision and inspection particulars' })
  checkpoint(@Body() body: any, @CurrentUser() user: any) {
    return this.gateService.recordCheckpoint(body, user);
  }

  @Post('particulars/:id/return')
  returnParticular(@Param('id') id: string, @CurrentUser() user: any) { return this.gateService.returnParticular(id, user); }

  @Get('history/:visitorId')
  history(@Param('visitorId') visitorId: string, @CurrentUser() user: any) {
    return this.gateService.checkpointHistory(visitorId, user);
  }

  @Post('entry')
  @ApiOperation({ summary: 'Record visitor entry' })
  entry(@Body() dto: EntryDto, @CurrentUser() user: any) {
    if (['GATE', 'GLOBAL_GATE', 'GLOBAL_ADMIN'].includes(user.role)) throw new ForbiddenException('Use the assigned checkpoint workflow to record visitor entry');
    return this.gateService.recordEntry(dto, user);
  }

  @Post('exit/:visitorId')
  @ApiOperation({ summary: 'Record visitor exit' })
  exit(
    @Param('visitorId') visitorId: string,
    @Body('notes') notes: string,
    @CurrentUser() user: any,
  ) {
    if (user.role === 'GLOBAL_ADMIN') throw new ForbiddenException('Super Admin II accounts provide oversight, not gate operations');
    return this.gateService.recordExit(visitorId, user, notes);
  }

  @Post('deny/:visitorId')
  @ApiOperation({ summary: 'Decline visitor entry (requires comment)' })
  deny(
    @Param('visitorId') visitorId: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    if (['GATE', 'GLOBAL_GATE', 'GLOBAL_ADMIN'].includes(user.role)) throw new ForbiddenException('Use the assigned checkpoint workflow to deny visitor entry');
    return this.gateService.denyEntry(visitorId, user, reason);
  }
}
