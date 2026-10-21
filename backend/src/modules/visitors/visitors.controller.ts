import {
  Controller,
  Post,
  Get,
  Param,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { VisitorsService } from './visitors.service';
import { Response } from 'express';
import * as fs from 'fs';

@ApiTags('Visitors')
@Controller('visitors')
export class VisitorsController {
  constructor(private visitorsService: VisitorsService) {}

  @Post(':token/:visitorId/photo')
  @ApiOperation({ summary: 'Visitor uploads live passport-style photo' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        photo: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only image files allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadPhoto(
    @Param('token') token: string,
    @Param('visitorId') visitorId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Photo file is required');
    return this.visitorsService.uploadPhoto(token, visitorId, file);
  }

  @Get('qr/:token/:visitorId')
  @ApiOperation({ summary: 'Public: gate QR code as PNG (append .png optional)' })
  async getQr(
    @Param('token') token: string,
    @Param('visitorId') visitorId: string,
    @Res() res: Response,
  ) {
    const id = visitorId.replace(/\.png$/i, '');
    const png = await this.visitorsService.getQrPng(token, id);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(png.length));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', 'inline; filename="gate-qr.png"');
    res.end(png);
  }

  @Get('photo/:filename')
  @ApiOperation({ summary: 'Serve stored visitor photo' })
  async getPhoto(@Param('filename') filename: string, @Res() res: Response) {
    const filepath = await this.visitorsService.getPhoto(filename);
    res.sendFile(filepath);
  }
}
