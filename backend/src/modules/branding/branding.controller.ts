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
  Header,
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

const imageUpload = {
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new BadRequestException('Only images allowed') as any, false);
    }
    cb(null, true);
  },
};

@ApiTags('Branding')
@Controller('branding')
export class BrandingController {
  constructor(private branding: BrandingService) {}

  @Get('public')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Public: cosmetic branding (name, logo, colours) for login / PWA / visitor pages' })
  publicBranding() {
    return this.branding.getPublic();
  }

  @Get('platform')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Super Admin: sign-in page, footer credit and contractor policy' })
  platform() {
    return this.branding.getPlatform();
  }

  @Patch('platform')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin: update sign-in page and footer settings' })
  updatePlatform(@Body() body: any) {
    return this.branding.updatePlatform(body);
  }

  @Get('platform/agencies')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Super Admin: login-grid agencies including hidden ones' })
  loginAgencies() {
    return this.branding.loginAgencies(true);
  }

  @Patch('platform/agencies')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Super Admin: reorder or show/hide login-grid agencies' })
  updateLoginAgencies(@Body() body: any) {
    const items = Array.isArray(body) ? body : body?.agencies || body?.loginAgencies || [];
    return this.branding.updateLoginAgencies(items);
  }

  @Post('login-logo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload dedicated sign-in logo' })
  @UseInterceptors(FileInterceptor('logo', imageUpload))
  uploadLoginLogo(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Logo file required');
    return this.branding.uploadPlatformImage('login-logo', file);
  }

  @Post('login-watermark')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload sign-in watermark image' })
  @UseInterceptors(FileInterceptor('watermark', imageUpload))
  uploadWatermark(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Watermark file required');
    return this.branding.uploadPlatformImage('watermark', file);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.GATE, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE)
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @ApiOperation({ summary: 'Get organisation branding & settings' })
  get(@CurrentUser() user: any) {
    return this.branding.get(user.orgId);
  }

  @Patch()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update branding settings' })
  update(@Body() body: any, @CurrentUser() user: any) {
    return this.branding.update(user.orgId, body);
  }

  @Post('logo')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload organisation logo (image file)' })
  @UseInterceptors(FileInterceptor('logo', imageUpload))
  uploadLogo(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: any) {
    if (!file) throw new BadRequestException('Logo file required');
    return this.branding.uploadLogo(user.orgId, file);
  }

  @Get('logo/:filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @ApiOperation({ summary: 'Serve logo image' })
  async logo(@Param('filename') filename: string, @Res() res: Response) {
    const fp = this.branding.getLogoPath(filename);
    res.sendFile(fp);
  }
}
