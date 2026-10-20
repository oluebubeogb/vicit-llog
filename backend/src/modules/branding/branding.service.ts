import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BrandingService {
  constructor(private prisma: PrismaService) {}

  private logoDir() {
    const dir = path.join(process.env.PHOTO_STORAGE_PATH || '/data/photos', 'logos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async get(orgId: string) {
    const org = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        code: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        customDomain: true,
        requireApproval: true,
        defaultWorkflow: true,
        photoRetentionDays: true,
      },
    });
    if (!org) throw new NotFoundException('Organisation not found');
    return org;
  }

  async update(
    orgId: string,
    data: {
      name?: string;
      logoUrl?: string;
      primaryColor?: string;
      secondaryColor?: string;
      customDomain?: string;
      requireApproval?: boolean;
      photoRetentionDays?: number;
    },
  ) {
    return this.prisma.organisation.update({
      where: { id: orgId },
      data,
      select: {
        id: true,
        name: true,
        code: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        customDomain: true,
        requireApproval: true,
        defaultWorkflow: true,
        photoRetentionDays: true,
      },
    });
  }

  async uploadLogo(orgId: string, file: Express.Multer.File) {
    const ext = path.extname(file.originalname) || '.png';
    const filename = `logo-${orgId.slice(0, 8)}-${uuidv4()}${ext}`;
    const filepath = path.join(this.logoDir(), filename);
    fs.writeFileSync(filepath, file.buffer);
    // Served via /branding/logo/:filename or relative path stored
    const logoUrl = `/branding/logo/${filename}`;
    return this.update(orgId, { logoUrl });
  }

  getLogoPath(filename: string) {
    const filepath = path.join(this.logoDir(), filename);
    if (!fs.existsSync(filepath)) throw new NotFoundException('Logo not found');
    return filepath;
  }
}
