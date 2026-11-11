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
  primaryTextColor: true,
  emailIconBg: true,
  customDomain: true,
  requireApproval: true,
  requireDispatchHostApproval: true,
  defaultWorkflow: true,
  photoRetentionDays: true,
  updatedAt: true,
} as const;

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const SIZE = /^\d+(\.\d+)?(px|%|vh|vw|em|rem)$/i;
export const APP_VERSION = '1.0.1';

function normHex(v: unknown, field: string): string {
  const s = String(v || '').trim();
  if (!HEX.test(s)) throw new BadRequestException(`${field} must be a hex colour like #2563eb`);
  if (s.length === 4) {
    return ('#' + s.slice(1).split('').map((c) => c + c).join('')).toLowerCase();
  }
  return s.toLowerCase();
}

function normSize(v: unknown, field: string, fallback?: string): string {
  const s = String(v ?? '').trim();
  if (!s) {
    if (fallback !== undefined) return fallback;
    throw new BadRequestException(`${field} is required`);
  }
  if (!SIZE.test(s)) throw new BadRequestException(`${field} must be a size like 180px, 40%, 70vw or 50vh`);
  return s;
}

@Injectable()
export class BrandingService {
  constructor(private prisma: PrismaService) {}

  private logoDir() {
    const dir = path.join(process.env.PHOTO_STORAGE_PATH || '/data/photos', 'logos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async platformOwnerOrgId(): Promise<string | null> {
    const platformAdmin = await this.prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { organisationId: true } });
    return platformAdmin?.organisationId || null;
  }

  async ensurePlatform() {
    return this.prisma.platformSettings.upsert({
      where: { id: 'platform' },
      create: { id: 'platform' },
      update: {},
    });
  }

  async getPlatform() {
    const settings = await this.ensurePlatform();
    const agencies = await this.loginAgencies(true);
    return { ...settings, loginTitle: (settings as any).loginTitle || 'Defence Headquarters', agencies };
  }

  async get(orgId: string) {
    const org = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      select: BRANDING_SELECT,
    });
    if (!org) throw new NotFoundException('Organisation not found');
    const platformOwnerId = await this.platformOwnerOrgId();
    const platform = platformOwnerId && platformOwnerId !== orgId
      ? await this.prisma.organisation.findUnique({ where: { id: platformOwnerId }, select: BRANDING_SELECT })
      : null;
    const settings = await this.ensurePlatform();
    return {
      ...org,
      name: org.name || platform?.name || process.env.ORGANIZATION || 'Vicit',
      logoUrl: org.logoUrl || platform?.logoUrl || null,
      primaryColor: org.primaryColor && org.primaryColor.toLowerCase() !== '#2563eb' ? org.primaryColor : platform?.primaryColor || org.primaryColor || '#2563eb',
      secondaryColor: org.secondaryColor && org.secondaryColor.toLowerCase() !== '#1e40af' ? org.secondaryColor : platform?.secondaryColor || org.secondaryColor || '#1e40af',
      primaryTextColor: org.primaryTextColor
        || (!(org.primaryColor && org.primaryColor.toLowerCase() !== '#2563eb') ? platform?.primaryTextColor || null : null),
      emailIconBg: org.emailIconBg && org.emailIconBg.toLowerCase() !== '#ffffff' ? org.emailIconBg : platform?.emailIconBg || org.emailIconBg || '#ffffff',
      footerCredit: settings.footerCredit,
      footerCreditEnabled: settings.footerCreditEnabled,
      footerCreditMobileMode: (settings as any).footerCreditMobileMode === 'STATIC' ? 'STATIC' : 'FLOATING',
      assetVersion: settings.assetVersion || APP_VERSION,
      contractorMinDurationDays: settings.contractorMinDurationDays,
    };
  }

  /**
   * Unauthenticated branding for the login screen, PWA manifest, splash and visitor pages.
   * Login cosmetics come only from platform sign-in settings — never the last-visited agency.
   */
  async getPublic() {
    const settings = await this.ensurePlatform();
    const platformOwnerId = await this.platformOwnerOrgId();
    const org = platformOwnerId
      ? await this.prisma.organisation.findUnique({ where: { id: platformOwnerId }, select: BRANDING_SELECT })
      : null;
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Vicit Llog';
    const title = (settings as any).loginTitle || 'Defence Headquarters';
    const agencies = await this.loginAgencies(false);
    return {
      name: title,
      appName,
      logoUrl: org?.logoUrl || null,
      primaryColor: settings.loginPrimaryColor || org?.primaryColor || '#2563eb',
      secondaryColor: settings.loginSecondaryColor || org?.secondaryColor || '#1e40af',
      primaryTextColor: org?.primaryTextColor || null,
      emailIconBg: org?.emailIconBg || '#ffffff',
      updatedAt: settings.updatedAt || org?.updatedAt || null,
      footerCredit: settings.footerCredit,
      footerCreditEnabled: settings.footerCreditEnabled,
      footerCreditMobileMode: (settings as any).footerCreditMobileMode === 'STATIC' ? 'STATIC' : 'FLOATING',
      assetVersion: settings.assetVersion || APP_VERSION,
      login: {
        logoUrl: settings.loginLogoUrl || null,
        logoWidth: settings.loginLogoWidth || '180px',
        watermarkUrl: settings.loginWatermarkUrl || null,
        watermarkWidth: settings.loginWatermarkWidth || '70vw',
        watermarkHeight: settings.loginWatermarkHeight || '70vh',
        watermarkOpacity: settings.loginWatermarkOpacity ?? 0.08,
        title,
        showLogo: (settings as any).loginLogoVisible !== false,
        headline: settings.loginHeadline || title,
        primaryColor: settings.loginPrimaryColor || org?.primaryColor || '#2563eb',
        secondaryColor: settings.loginSecondaryColor || org?.secondaryColor || '#1e40af',
      },
      agencies,
    };
  }

  /** Public (visible only) or admin (all) list of agencies for the login grid. */
  async loginAgencies(includeHidden = false) {
    const rows = await this.prisma.organisation.findMany({
      select: { id: true, name: true, code: true, shortName: true, logoUrl: true, primaryColor: true, secondaryColor: true, loginOrder: true, loginVisible: true, loginTileColor: true },
      orderBy: [{ loginOrder: 'asc' }, { name: 'asc' }],
    });
    return includeHidden ? rows : rows.filter((r) => r.loginVisible !== false);
  }

  async updateLoginAgencies(items: Array<{ id: string; loginOrder?: number; loginVisible?: boolean; shortName?: string | null; loginTileColor?: string | null }>) {
    if (!Array.isArray(items)) throw new BadRequestException('Agency list is required');
    for (const [i, item] of items.entries()) {
      if (!item?.id) continue;
      const data: Record<string, any> = {};
      if (item.loginOrder !== undefined) data.loginOrder = Number.isFinite(Number(item.loginOrder)) ? Number(item.loginOrder) : i;
      else data.loginOrder = i;
      if (item.loginVisible !== undefined) data.loginVisible = Boolean(item.loginVisible);
      if (item.shortName !== undefined) {
        const n = item.shortName == null ? null : String(item.shortName).trim().slice(0, 40);
        data.shortName = n || null;
      }
      if (item.loginTileColor !== undefined) {
        const raw = item.loginTileColor == null ? '' : String(item.loginTileColor).trim();
        if (!raw || raw.toLowerCase() === 'auto') data.loginTileColor = null;
        else data.loginTileColor = normHex(raw, 'Tile background');
      }
      if (Object.keys(data).length) {
        await this.prisma.organisation.update({ where: { id: item.id }, data }).catch(() => {
          throw new BadRequestException('One of the agencies could not be updated');
        });
      }
    }
    await this.ensurePlatform();
    await this.prisma.platformSettings.update({
      where: { id: 'platform' },
      data: { assetVersion: `${APP_VERSION}-${Date.now().toString(36)}` },
    });
    return this.loginAgencies(true);
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
    if (body.primaryTextColor !== undefined) {
      const raw = body.primaryTextColor;
      if (raw === null || raw === '' || String(raw).trim().toLowerCase() === 'auto') {
        data.primaryTextColor = null;
      } else {
        data.primaryTextColor = normHex(raw, 'Theme text colour');
      }
    }
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
    if (body.requireDispatchHostApproval !== undefined) data.requireDispatchHostApproval = Boolean(body.requireDispatchHostApproval);
    if (body.photoRetentionDays !== undefined) {
      const n = parseInt(String(body.photoRetentionDays), 10);
      if (!Number.isFinite(n) || n < 7 || n > 3650) {
        throw new BadRequestException('Photo retention must be between 7 and 3650 days');
      }
      data.photoRetentionDays = n;
    }
    return this.prisma.organisation.update({ where: { id: orgId }, data, select: BRANDING_SELECT });
  }

  async updatePlatform(body: Record<string, any>) {
    const data: Record<string, any> = {};
    if (body.loginLogoUrl !== undefined) {
      const v = body.loginLogoUrl ? String(body.loginLogoUrl).trim() : null;
      if (v && !/^(https:\/\/|\/branding\/logo\/)/i.test(v)) {
        throw new BadRequestException('Login logo must be uploaded or an https:// URL');
      }
      data.loginLogoUrl = v;
    }
    if (body.loginLogoWidth !== undefined) data.loginLogoWidth = body.loginLogoWidth ? normSize(body.loginLogoWidth, 'Login logo width') : '180px';
    if (body.loginWatermarkUrl !== undefined) {
      const v = body.loginWatermarkUrl ? String(body.loginWatermarkUrl).trim() : null;
      if (v && !/^(https:\/\/|\/branding\/logo\/)/i.test(v)) {
        throw new BadRequestException('Watermark must be uploaded or an https:// URL');
      }
      data.loginWatermarkUrl = v;
    }
    if (body.loginWatermarkWidth !== undefined) data.loginWatermarkWidth = body.loginWatermarkWidth ? normSize(body.loginWatermarkWidth, 'Watermark width') : '70vw';
    if (body.loginWatermarkHeight !== undefined) data.loginWatermarkHeight = body.loginWatermarkHeight ? normSize(body.loginWatermarkHeight, 'Watermark height') : '70vh';
    if (body.loginWatermarkOpacity !== undefined) {
      const n = Number(body.loginWatermarkOpacity);
      if (!Number.isFinite(n) || n < 0 || n > 1) throw new BadRequestException('Watermark opacity must be between 0 and 1');
      data.loginWatermarkOpacity = Math.round(n * 1000) / 1000;
    }
    if (body.loginHeadline !== undefined) {
      const h = String(body.loginHeadline || '').trim();
      if (h.length > 120) throw new BadRequestException('Headline must be 120 characters or fewer');
      data.loginHeadline = h || null;
    }
    if (body.loginTitle !== undefined) {
      const t = String(body.loginTitle || '').trim();
      if (t.length > 120) throw new BadRequestException('Sign-in title must be 120 characters or fewer');
      data.loginTitle = t || 'Defence Headquarters';
    }
    if (body.loginLogoVisible !== undefined) data.loginLogoVisible = body.loginLogoVisible !== false;
    if (body.loginPrimaryColor !== undefined) {
      const raw = body.loginPrimaryColor;
      data.loginPrimaryColor = raw === null || raw === '' ? null : normHex(raw, 'Sign-in primary colour');
    }
    if (body.loginSecondaryColor !== undefined) {
      const raw = body.loginSecondaryColor;
      data.loginSecondaryColor = raw === null || raw === '' ? null : normHex(raw, 'Sign-in secondary colour');
    }
    if (body.footerCredit !== undefined) {
      const c = String(body.footerCredit || '').trim();
      if (c.length > 160) throw new BadRequestException('Footer credit must be 160 characters or fewer');
      data.footerCredit = c || "Powered by CISTECH's Vicit 1.0.1";
    }
    if (body.footerCreditEnabled !== undefined) data.footerCreditEnabled = Boolean(body.footerCreditEnabled);
    if (body.footerCreditMobileMode !== undefined) {
      const mode = String(body.footerCreditMobileMode || '').trim().toUpperCase();
      if (mode !== 'FLOATING' && mode !== 'STATIC') {
        throw new BadRequestException('Mobile placement must be FLOATING or STATIC');
      }
      data.footerCreditMobileMode = mode;
    }
    if (body.contractorMinDurationDays !== undefined) {
      const n = parseInt(String(body.contractorMinDurationDays), 10);
      if (!Number.isFinite(n) || n < 1 || n > 365) throw new BadRequestException('Minimum contractor duration must be 1–365 days');
      data.contractorMinDurationDays = n;
    }
    data.assetVersion = `${APP_VERSION}-${Date.now().toString(36)}`;
    const settings = await this.prisma.platformSettings.update({ where: { id: 'platform' }, data });
    if (Array.isArray(body.agencies) || Array.isArray(body.loginAgencies)) {
      await this.updateLoginAgencies(body.agencies || body.loginAgencies);
    }
    return settings;
  }

  async uploadLogo(orgId: string, file: Express.Multer.File) {
    const ext = (path.extname(file.originalname) || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '');
    const filename = `logo-${orgId.slice(0, 8)}-${uuidv4()}${ext}`;
    const filepath = path.join(this.logoDir(), filename);
    fs.writeFileSync(filepath, file.buffer);
    const logoUrl = `/branding/logo/${filename}`;
    return this.update(orgId, { logoUrl });
  }

  async uploadPlatformImage(kind: 'login-logo' | 'watermark', file: Express.Multer.File) {
    await this.ensurePlatform();
    const ext = (path.extname(file.originalname) || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '');
    const filename = `${kind}-${uuidv4()}${ext}`;
    const filepath = path.join(this.logoDir(), filename);
    fs.writeFileSync(filepath, file.buffer);
    const url = `/branding/logo/${filename}`;
    if (kind === 'login-logo') return this.updatePlatform({ loginLogoUrl: url });
    return this.updatePlatform({ loginWatermarkUrl: url });
  }

  getLogoPath(filename: string) {
    const filepath = path.join(this.logoDir(), path.basename(filename));
    if (!fs.existsSync(filepath)) throw new NotFoundException('Logo not found');
    return filepath;
  }
}
