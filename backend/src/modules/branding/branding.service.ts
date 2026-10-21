import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const BRANDING_SELECT = {
  id: true,
  name: true,
  code: true,
  logoUrl: true,
  primaryColor: true,
  secondaryColor: true,
  emailIconBg: true,
  customDomain: true,
  requireApproval: true,
  defaultWorkflow: true,
  photoRetentionDays: true,
  updatedAt: true,
} as const;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function normHex(v: unknown, field: string): string {
  const s = String(v || '').trim();
  if (!HEX.test(s)) throw new BadRequestException(`${field} must be a hex colour like #2563eb`);
  if (s.length === 4) {
    return ('#' + s.slice(1).split('').map((c) => c + c).join('')).toLowerCase();
  }
  return s.toLowerCase();
}

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
      select: BRANDING_SELECT,
    });
    if (!org) throw new NotFoundException('Organisation not found');
    return org;
  }

  /**
   * Unauthenticated branding for the login screen, PWA manifest, splash and visitor pages.
   * Only cosmetic fields are exposed (no settings, no ids).
   */
  async getPublic() {
    const code = (process.env.ORGANIZATION_CODE || '').toUpperCase().trim();
    const org =
      (code
        ? await this.prisma.organisation.findUnique({ where: { code }, select: BRANDING_SELECT })
        : null) ||
      (await this.prisma.organisation.findFirst({
        orderBy: { createdAt: 'asc' },
        select: BRANDING_SELECT,
      }));
    return {
      name: org?.name || process.env.ORGANIZATION || 'Vicit Llog',
      appName: process.env.NEXT_PUBLIC_APP_NAME || 'Vicit Llog',
      logoUrl: org?.logoUrl || null,
      primaryColor: org?.primaryColor || '#2563eb',
      secondaryColor: org?.secondaryColor || '#1e40af',
      emailIconBg: org?.emailIconBg || '#ffffff',
      updatedAt: org?.updatedAt || null,
    };
  }

  /** Whitelisted, validated update — previously the raw body was passed to Prisma. */
  async update(orgId: string, body: Record<string, any>) {
    const data: Record<string, any> = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 120) {
        throw new BadRequestException('Organisation name must be 2–120 characters');
      }
      data.name = name;
    }
    if (body.logoUrl !== undefined) {
      const v = body.logoUrl ? String(body.logoUrl).trim() : null;
      if (v && !/^(https:\/\/|\/branding\/logo\/)/i.test(v)) {
        throw new BadRequestException('Logo must be uploaded or an https:// URL');
      }
      data.logoUrl = v;
    }
    if (body.primaryColor !== undefined) data.primaryColor = normHex(body.primaryColor, 'Primary colour');
    if (body.secondaryColor !== undefined)
      data.secondaryColor = normHex(body.secondaryColor, 'Secondary colour');
    if (body.emailIconBg !== undefined) data.emailIconBg = normHex(body.emailIconBg, 'Email icon background');
    if (body.customDomain !== undefined) {
      const d = String(body.customDomain || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '');
      if (d && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d+)?$/.test(d)) {
        throw new BadRequestException('Custom domain must look like visitors.yourorg.com');
      }
      data.customDomain = d || null;
    }
    if (body.requireApproval !== undefined) data.requireApproval = Boolean(body.requireApproval);
    if (body.photoRetentionDays !== undefined) {
      const n = parseInt(String(body.photoRetentionDays), 10);
      if (!Number.isFinite(n) || n < 7 || n > 3650) {
        throw new BadRequestException('Photo retention must be between 7 and 3650 days');
      }
      data.photoRetentionDays = n;
    }
    return this.prisma.organisation.update({ where: { id: orgId }, data, select: BRANDING_SELECT });
  }

  async uploadLogo(orgId: string, file: Express.Multer.File) {
    const ext = (path.extname(file.originalname) || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '');
    const filename = `logo-${orgId.slice(0, 8)}-${uuidv4()}${ext}`;
    const filepath = path.join(this.logoDir(), filename);
    fs.writeFileSync(filepath, file.buffer);
    const logoUrl = `/branding/logo/${filename}`;
    return this.update(orgId, { logoUrl });
  }

  getLogoPath(filename: string) {
    const filepath = path.join(this.logoDir(), path.basename(filename));
    if (!fs.existsSync(filepath)) throw new NotFoundException('Logo not found');
    return filepath;
  }
}
