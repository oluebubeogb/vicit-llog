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
import { buildGateQrPayload, renderQrDataUrl, renderQrPng } from '../../common/utils/qr';

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

  async uploadPhoto(token: string, visitorId: string, file: Express.Multer.File) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        visitors: true,
        host: { select: { id: true, fullName: true, email: true, phone: true } },
        organisation: { select: { name: true, customDomain: true } },
      },
    });

    if (!invite) throw new NotFoundException('Invite not found');
    if (
      invite.status !== InviteStatus.ACTIVE &&
      invite.status !== InviteStatus.USED
    ) {
      throw new BadRequestException('Invite is not active');
    }
    if (new Date() > invite.expiresAt && invite.status === InviteStatus.ACTIVE) {
      throw new BadRequestException('Invite has expired');
    }

    const visitor = invite.visitors.find((v) => v.id === visitorId);
    if (!visitor) throw new NotFoundException('Visitor not found on this invite');

    if (visitor.photoPath) {
      throw new BadRequestException(
        'Photo already captured for this visitor. Show your QR or passphrase at the gate.',
      );
    }

    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${visitorId}-${uuidv4()}${ext}`;
    const filepath = path.join(this.getPhotoDir(), filename);

    fs.writeFileSync(filepath, file.buffer);

    const qrPayload = buildGateQrPayload(visitorId, invite.passphrase, invite.token);
    const qrDataUrl = await renderQrDataUrl(qrPayload);

    const updated = await this.prisma.visitor.update({
      where: { id: visitorId },
      data: {
        photoPath: filename,
        qrCodeData: qrDataUrl,
        status: VisitStatus.INVITED,
      },
    });

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
        qrPng: await renderQrPng(qrPayload),
        // Links in emails must be reachable from the visitor's phone — skip localhost URLs.
        qrImageUrl:
          apiPublic && !isLocalUrl(apiPublic)
            ? `${apiPublic}/visitors/qr/${invite.token}/${visitorId}.png`
            : undefined,
        registrationLink: frontend ? `${frontend}/visitor/${invite.token}` : undefined,
        orgName: invite.organisation?.name,
      });
    }

    return {
      visitor: updated,
      passphrase: invite.passphrase,
      qrCodeData: qrDataUrl,
      message: 'Photo captured successfully. Show QR or passphrase at the gate.',
    };
  }

  /**
   * Fresh, scan-optimised QR PNG for a registered visitor. Public but gated by the
   * unguessable invite token (same access level as the visitor page itself).
   * Used for the email "open image" link and the "Download QR" button.
   */
  async getQrPng(token: string, visitorId: string): Promise<Buffer> {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: { visitors: { where: { id: visitorId } } },
    });
    const visitor = invite?.visitors?.[0];
    if (!invite || !visitor) throw new NotFoundException('QR code not found');
    if (!visitor.photoPath) {
      throw new BadRequestException('Photo not captured yet — QR is issued after registration');
    }
    return renderQrPng(buildGateQrPayload(visitor.id, invite.passphrase, invite.token));
  }

  async getPhoto(filename: string) {
    const filepath = path.join(this.getPhotoDir(), filename);
    if (!fs.existsSync(filepath)) {
      throw new NotFoundException('Photo not found');
    }
    return filepath;
  }
}
