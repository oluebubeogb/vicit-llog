import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { BrandingService } from './branding.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Response } from 'express';

@ApiTags('Branding')
@Controller('branding')
export class BrandingController {
  constructor(private branding: BrandingService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE)
  @ApiOperation({ summary: 'Get organisation branding & settings' })
  get(@CurrentUser() user: any) {
    return this.branding.get(user.orgId);
  }

  @Patch()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update branding settings' })
  update(@Body() body: any, @CurrentUser() user: any) {
    // logoUrl from file upload only preferred; allow clear
    return this.branding.update(user.orgId, body);
  }

  @Post('logo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload organisation logo (image file)' })
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: { fileSize: 3 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          return cb(new BadRequestException('Only images allowed') as any, false);
        }
        cb(null, true);
      },
    }),
  )
  uploadLogo(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('Logo file required');
    return this.branding.uploadLogo(user.orgId, file);
  }

  @Get('logo/:filename')
  @ApiOperation({ summary: 'Serve logo image' })
  async logo(@Param('filename') filename: string, @Res() res: Response) {
    const fp = this.branding.getLogoPath(filename);
    res.sendFile(fp);
  }
}
