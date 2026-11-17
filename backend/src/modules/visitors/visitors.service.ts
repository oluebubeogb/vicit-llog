import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { InviteStatus, VisitStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { publicFrontendBase } from '../../common/utils/urls';
import { buildGateQrPayload } from '../../common/utils/qr';
import { linkSameDayVisits } from '../../common/utils/visitor-pass';
import { gatePassCaption, qrFileName, renderCaptionedQrPng } from '../../common/utils/qr-caption';

function isLocalUrl(u: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(u);
}

@Injectable()
export class VisitorsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private mail: MailService,
  ) {}

  private getPhotoDir() {
    const dir = process.env.PHOTO_STORAGE_PATH || '/data/photos';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /** v24 lock: the photo can only be (re)taken before the guest arrives or passes any checkpoint. */
  static readonly PHOTO_LOCKED = 'Your photo can no longer be changed - please see the gate officer.';

  private async loadForPhoto(token: string, visitorId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        visitors: true,
        host: { select: { id: true, fullName: true, email: true, phone: true } },
        organisation: { select: { id: true, name: true, customDomain: true } },
      },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    const visitor = invite.visitors.find((v) => v.id === visitorId);
    if (!visitor) throw new NotFoundException('Visitor not found on this invite');
    const lock = await this.photoLockReason(invite, visitor);
    if (lock) throw new BadRequestException(lock);
    return { invite, visitor };
  }

  /**
   * null when the guest may take / retake their photo, else the friendly lock message.
   * Locked once arrived / checked in / passed any checkpoint, or the visit is cancelled,
   * denied, exited or expired. First capture keeps the original link-expiry rule.
   */
  async photoLockReason(invite: any, visitor: any): Promise<string | null> {
    const LOCKED = VisitorsService.PHOTO_LOCKED;
    if (invite.cancelledAt || invite.status === InviteStatus.REVOKED) return LOCKED;
    if (visitor.status !== VisitStatus.INVITED || visitor.enteredAt || visitor.exitedAt || visitor.deniedAt) return LOCKED;
    const passed = await this.prisma.gateVisit.count({ where: { visitorId: visitor.id, decision: 'PASSED' } });
    if (passed > 0) return LOCKED;
    if (!visitor.photoPath) {
      if (invite.status !== InviteStatus.ACTIVE && invite.status !== InviteStatus.USED) return 'Invite is not active';
      if (new Date() > invite.expiresAt && invite.status === InviteStatus.ACTIVE) return 'Invite has expired';
      return null;
    }
    // Retake: allowed until the end of the visit day (the link TTL only governs first registration).
    if (invite.status === InviteStatus.EXPIRED) return LOCKED;
    const visitEnd = new Date((invite.expectedAt || invite.createdAt).getTime() + 24 * 3600 * 1000);
    if (new Date() > new Date(Math.max(visitEnd.getTime(), invite.expiresAt.getTime()))) return LOCKED;
    return null;
  }

  private static extFor(file: Express.Multer.File) {
    const ext = (path.extname(file.originalname || '') || '').toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return ext;
    if (file.mimetype === 'image/png') return '.png';
    if (file.mimetype === 'image/webp') return '.webp';
    return '.jpg';
  }

  /**
   * Step 1 — stage a photo for review. Nothing changes on the visit and no QR is generated
   * until the guest taps "Proceed to QR code" (confirmPhoto).
   */
  async stagePhoto(token: string, visitorId: string, file: Express.Multer.File) {
    const { visitor } = await this.loadForPhoto(token, visitorId);
    const dir = this.getPhotoDir();
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(`pending-${visitorId}-`)) fs.rmSync(path.join(dir, f), { force: true });
    }
    const pendingId = `pending-${visitorId}-${uuidv4()}${VisitorsService.extFor(file)}`;
    fs.writeFileSync(path.join(dir, pendingId), file.buffer);
    return {
      pendingId,
      retake: Boolean(visitor.photoPath),
      message: 'Review your photo, then tap "Proceed to QR code".',
    };
  }

  /** Step 2 — the guest approved the preview: make it their photo and issue / re-send the QR. */
  async confirmPhoto(token: string, visitorId: string, pendingId: string) {
    const safe = path.basename(String(pendingId || ''));
    const esc = visitorId.replace(/[^a-zA-Z0-9-]/g, '');
    if (!new RegExp(`^pending-${esc}-[0-9a-f-]{36}\\.(jpg|jpeg|png|webp)$`, 'i').test(safe)) {
      throw new BadRequestException('Photo preview not found. Please take your photo again.');
    }
    const dir = this.getPhotoDir();
    const pendingPath = path.join(dir, safe);
    if (!fs.existsSync(pendingPath)) throw new BadRequestException('Photo preview not found. Please take your photo again.');
    const { invite, visitor } = await this.loadForPhoto(token, visitorId);
    const filename = `${visitorId}-${uuidv4()}${path.extname(safe)}`;
    fs.renameSync(pendingPath, path.join(dir, filename));
    if (visitor.photoPath) return this.commitRetake(invite, visitor, filename);
    return this.commitFirstPhoto(invite, visitor, filename);
  }

  /** Legacy single-step upload (older cached pages): same as capture + Proceed. */
  async uploadPhoto(token: string, visitorId: string, file: Express.Multer.File) {
    const staged = await this.stagePhoto(token, visitorId, file);
    return this.confirmPhoto(token, visitorId, staged.pendingId);
  }

  /** Retake after a QR was issued: only the photo changes; the SAME QR is e-mailed again. */
  private async commitRetake(invite: any, visitor: any, filename: string) {
    const visitorId = visitor.id;
    const updated = await this.prisma.visitor.update({
      where: { id: visitorId },
      data: { photoPath: filename, photoTakenAt: new Date(), photoRetakes: { increment: 1 } },
    });
    await this.audit.log({
      action: 'PHOTO_RETAKEN',
      entity: 'Visitor',
      entityId: visitorId,
      details: { inviteId: invite.id, fullName: visitor.fullName, previousPhoto: visitor.photoPath, retakes: updated.photoRetakes },
    });
    await this.notifications.create({
      userId: invite.hostId,
      title: 'Guest photo retaken',
      body: `${visitor.fullName} retook their registration photo for "${invite.purpose}". Their QR code is unchanged.`,
      meta: { visitorId, inviteId: invite.id, type: 'PHOTO_RETAKEN' },
      channels: ['in_app'],
    });
    let qrPng: Buffer | null = null;
    const stored = String(visitor.qrCodeData || '');
    if (stored.startsWith('data:image/png;base64,')) qrPng = Buffer.from(stored.split(',')[1], 'base64');
    if (!qrPng) {
      const { png } = await this.getQrPng(invite.token, visitorId);
      qrPng = png;
    }
    let emailed = false;
    if (visitor.email) {
      const frontend = publicFrontendBase(invite.organisation?.customDomain);
      const apiPublic = (process.env.API_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
      const r: any = await this.mail.sendVisitorQrEmail({
        to: visitor.email,
        guestName: visitor.fullName,
        hostName: invite.host.fullName,
        purpose: invite.purpose,
        passphrase: invite.passphrase,
        qrPng,
        qrFileName: qrFileName(visitor.fullName, invite.expectedAt || new Date()),
        qrImageUrl: apiPublic && !isLocalUrl(apiPublic) ? `${apiPublic}/visitors/qr/${invite.token}/${visitorId}.png` : undefined,
        registrationLink: frontend ? `${frontend}/visitor/${invite.token}` : undefined,
        orgName: invite.organisation?.name,
        organisationId: invite.organisation?.id,
      });
      emailed = r?.ok !== false;
    }
    return {
      visitor: updated,
      passphrase: invite.passphrase,
      qrCodeData: visitor.qrCodeData,
      retake: true,
      emailedTo: emailed ? visitor.email : null,
      message: 'New photo saved. Your QR code is unchanged.',
    };
  }

  private async commitFirstPhoto(invite: any, visitor: any, filename: string) {
    const visitorId = visitor.id;
    const linked = await linkSameDayVisits(this.prisma, visitorId);
    const canonicalId = linked.visitorIds[0] || visitorId;
    const qrPayload = buildGateQrPayload(canonicalId, invite.passphrase, invite.token, linked.passToken);
    const locationName = invite.locationId
      ? (await this.prisma.location.findUnique({ where: { id: invite.locationId }, select: { name: true } }))?.name
      : undefined;
    const caption = gatePassCaption({
      fullName: visitor.fullName,
      visitorId,
      date: invite.expectedAt || new Date(),
      orgName: invite.organisation?.name,
      locationName,
    });
    const qrPng = renderCaptionedQrPng(qrPayload, caption);
    const qrDataUrl = `data:image/png;base64,${qrPng.toString('base64')}`;

    const updated = await this.prisma.visitor.update({
      where: { id: visitorId },
      data: {
        photoPath: filename,
        qrCodeData: qrDataUrl,
        status: VisitStatus.INVITED,
        passToken: linked.passToken,
        photoTakenAt: new Date(),
      },
    });
    if (linked.visitorIds.length > 1) {
      await this.prisma.visitor.updateMany({
        where: { id: { in: linked.visitorIds.filter((id) => id !== visitorId) } },
        data: { passToken: linked.passToken, qrCodeData: qrDataUrl },
      });
    }

    const allHavePhotos = (
      await this.prisma.visitor.findMany({ where: { inviteId: invite.id } })
    ).every((v) => v.photoPath);

    if (allHavePhotos) {
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.USED },
      });
    }

    await this.audit.log({
      action: 'PHOTO_CAPTURED',
      entity: 'Visitor',
      entityId: visitorId,
      details: { inviteId: invite.id },
    });

    const channels: Array<'in_app' | 'sms' | 'whatsapp'> = ['in_app'];
    if (
      process.env.SMS_PROVIDER &&
      process.env.SMS_PROVIDER !== 'log' &&
      invite.host?.phone
    ) {
      channels.push('sms');
    }
    await this.notifications.create({
      userId: invite.hostId,
      title: 'Guest photo captured',
      body: `${visitor.fullName} completed photo registration for "${invite.purpose}".`,
      meta: { visitorId, inviteId: invite.id, type: 'PHOTO_CAPTURED' },
      channels,
      phone: invite.host?.phone || undefined,
    });

    if (invite.host?.email) {
      await this.mail.sendHostVisitorUpdate({
        to: invite.host.email,
        hostName: invite.host.fullName,
        guestName: visitor.fullName,
        purpose: invite.purpose,
        event: 'photo',
        orgName: invite.organisation?.name,
        organisationId: invite.organisation?.id,
      });
    }

    if (visitor.email) {
      const frontend = publicFrontendBase((invite as any).organisation?.customDomain);
      const apiPublic = (process.env.API_PUBLIC_URL || process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
      await this.mail.sendVisitorQrEmail({
        to: visitor.email,
        guestName: visitor.fullName,
        hostName: invite.host.fullName,
        purpose: invite.purpose,
        passphrase: invite.passphrase,
        qrPng,
        qrFileName: qrFileName(visitor.fullName, invite.expectedAt || new Date()),
        // Links in emails must be reachable from the visitor's phone — skip localhost URLs.
        qrImageUrl:
          apiPublic && !isLocalUrl(apiPublic)
            ? `${apiPublic}/visitors/qr/${invite.token}/${visitorId}.png`
            : undefined,
        registrationLink: frontend ? `${frontend}/visitor/${invite.token}` : undefined,
        orgName: invite.organisation?.name,
        organisationId: invite.organisation?.id,
      });
    }

    return {
      visitor: updated,
      passphrase: invite.passphrase,
      qrCodeData: qrDataUrl,
      message: 'Photo captured successfully. Show QR or passphrase at the gate.',
      retake: false,
      emailedTo: visitor.email || null,
    };
  }

  /**
   * Fresh, scan-optimised QR PNG for a registered visitor. Public but gated by the
   * unguessable invite token (same access level as the visitor page itself).
   * Used for the email "open image" link and the "Download QR" button.
   */
  async getQrPng(token: string, visitorId: string): Promise<{ png: Buffer; filename: string }> {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        visitors: { where: { id: visitorId } },
        organisation: { select: { name: true } },
      },
    });
    const visitor = invite?.visitors?.[0];
    if (!invite || !visitor) throw new NotFoundException('QR code not found');
    if (!visitor.photoPath) {
      throw new BadRequestException('Photo not captured yet — QR is issued after registration');
    }
    const locationName = invite.locationId
      ? (await this.prisma.location.findUnique({ where: { id: invite.locationId }, select: { name: true } }))?.name
      : undefined;
    const date = invite.expectedAt || visitor.createdAt;
    return {
      png: renderCaptionedQrPng(
        buildGateQrPayload(visitor.id, invite.passphrase, invite.token, (visitor as any).passToken),
        gatePassCaption({
          fullName: visitor.fullName,
          visitorId: visitor.id,
          date,
          orgName: invite.organisation?.name,
          locationName,
        }),
      ),
      filename: qrFileName(visitor.fullName, date),
    };
  }

  async getPhoto(filename: string) {
    // basename() blocks encoded path traversal (e.g. ..%2F..%2Fetc) — only files in the photo dir.
    const safe = path.basename(String(filename || ''));
    if (!safe || safe.startsWith('.')) throw new NotFoundException('Photo not found');
    const filepath = path.join(this.getPhotoDir(), safe);
    if (!fs.existsSync(filepath) || !fs.statSync(filepath).isFile()) {
      throw new NotFoundException('Photo not found');
    }
    return filepath;
  }
}
