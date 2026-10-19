import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { InviteStatus, VisitStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as QRCode from 'qrcode';

@Injectable()
export class VisitorsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
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
      include: { visitors: true },
    });

    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== InviteStatus.ACTIVE) {
      throw new BadRequestException('Invite is not active');
    }
    if (new Date() > invite.expiresAt) {
      throw new BadRequestException('Invite has expired');
    }

    const visitor = invite.visitors.find((v) => v.id === visitorId);
    if (!visitor) throw new NotFoundException('Visitor not found on this invite');

    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${visitorId}-${uuidv4()}${ext}`;
    const filepath = path.join(this.getPhotoDir(), filename);

    fs.writeFileSync(filepath, file.buffer);

    // Generate QR payload (passphrase + visitor id)
    const qrPayload = JSON.stringify({
      v: visitorId,
      p: invite.passphrase,
      t: invite.token.slice(0, 8),
    });
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 });

    const updated = await this.prisma.visitor.update({
      where: { id: visitorId },
      data: {
        photoPath: filename,
        qrCodeData: qrDataUrl,
        status: VisitStatus.INVITED,
      },
    });

    // Mark invite as used once photos are in
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

    return {
      visitor: updated,
      passphrase: invite.passphrase,
      qrCodeData: qrDataUrl,
      message: 'Photo captured successfully. Show QR or passphrase at the gate.',
    };
  }

  async getPhoto(filename: string) {
    const filepath = path.join(this.getPhotoDir(), filename);
    if (!fs.existsSync(filepath)) {
      throw new NotFoundException('Photo not found');
    }
    return filepath;
  }
}
