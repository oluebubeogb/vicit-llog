import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { InviteStatus, Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { buildGateQrPayload, renderQrDataUrl } from '../../common/utils/qr';
import { isValidEmail } from '../../common/utils/email';

@Injectable()
export class InvitesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private mail: MailService,
  ) {}

  private generatePassphrase(): string {
    const words = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL'];
    const w1 = words[Math.floor(Math.random() * words.length)];
    const w2 = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${w1}-${w2}-${num}`;
  }

  async create(dto: CreateInviteDto, hostId: string, orgId: string) {
    const ttl = parseInt(process.env.INVITE_LINK_TTL_MINUTES || '60', 10);
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);
    const token = uuidv4();
    const passphrase = this.generatePassphrase();

    const invite = await this.prisma.invite.create({
      data: {
        token,
        passphrase,
        purpose: dto.purpose,
        category: dto.category || 'OFFICIAL',
        guestCount: dto.guestCount || 1,
        guestNames: dto.guestNames || [],
        expectedMode: dto.expectedMode,
        expiresAt,
        hostId,
        organisationId: orgId,
        isOffline: dto.isOffline || false,
        status: dto.isOffline ? InviteStatus.OFFLINE_PENDING : InviteStatus.ACTIVE,
        ...(dto.expectedAt ? { expectedAt: new Date(dto.expectedAt) } : {}),
      },
      include: {
        host: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Build guest list from structured guests[] or legacy guestNames
    type G = { fullName: string; email?: string; phone?: string; address?: string };
    let guests: G[] = [];
    if (dto.guests?.length) {
      for (const g of dto.guests) {
        if (g.email?.trim() && !isValidEmail(g.email)) {
          throw new BadRequestException(
            `Invalid email address: "${g.email}". Please correct it so the invite can be delivered.`,
          );
        }
      }
      guests = dto.guests.map((g) => ({
        fullName: g.fullName.trim(),
        email: g.email?.trim().toLowerCase() || undefined,
        phone: g.phone?.trim() || undefined,
        address: g.address?.trim() || undefined,
      }));
    } else if (dto.guestNames?.length) {
      guests = dto.guestNames.map((n) => ({ fullName: n.trim() }));
    } else {
      guests = Array.from({ length: dto.guestCount || 1 }, (_, i) => ({
        fullName: `Guest ${i + 1}`,
      }));
    }

    const createdVisitors: any[] = [];
    for (const g of guests) {
      const v = await this.prisma.visitor.create({
        data: {
          inviteId: invite.id,
          fullName: g.fullName,
          email: g.email || null,
          phone: g.phone || null,
          address: g.address || null,
        },
      });
      createdVisitors.push(v);
    }

    await this.audit.log({
      action: 'INVITE_CREATED',
      entity: 'Invite',
      entityId: invite.id,
      userId: hostId,
      details: { purpose: dto.purpose, guestCount: guests.length },
    });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link = `${baseUrl}/visitor/${token}`;

    // Email each guest that has an address (skip offline-pending until approved)
    const emailsSent: string[] = [];
    if (!dto.isOffline) {
      for (const g of guests) {
        if (!g.email) continue;
        const r = await this.mail.sendInviteEmail({
          to: g.email,
          guestName: g.fullName,
          hostName: invite.host.fullName,
          purpose: dto.purpose,
          link,
          passphrase,
          ttlMinutes: ttl,
          expectedAt: dto.expectedAt || null,
        });
        if (r.ok) emailsSent.push(g.email);
      }
    }

    return {
      ...invite,
      guestCount: guests.length,
      visitors: createdVisitors,
      link,
      expiresInMinutes: ttl,
      emailsSent,
    };
  }

  async findMyInvites(hostId: string) {
    return this.prisma.invite.findMany({
      where: { hostId },
      include: {
        visitors: true,
        host: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(orgId: string) {
    return this.prisma.invite.findMany({
      where: { organisationId: orgId },
      include: {
        visitors: true,
        host: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByToken(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        visitors: true,
        host: { select: { id: true, fullName: true, email: true } },
        organisation: { select: { name: true } },
      },
    });

    if (!invite) throw new NotFoundException('Invite not found');

    if (invite.status === InviteStatus.OFFLINE_PENDING) {
      throw new BadRequestException('This offline request is awaiting admin approval');
    }

    if (invite.status === InviteStatus.REVOKED) {
      throw new BadRequestException('This invite has been revoked');
    }

    const expired =
      invite.status === InviteStatus.EXPIRED || new Date() > invite.expiresAt;
    if (expired) {
      // Still allow viewing status if any visitor already registered a photo
      const anyPhoto = invite.visitors?.some((v) => v.photoPath);
      if (!anyPhoto) {
        if (invite.status !== InviteStatus.EXPIRED) {
          await this.prisma.invite.update({
            where: { id: invite.id },
            data: { status: InviteStatus.EXPIRED },
          });
        }
        throw new BadRequestException('This invite link has expired');
      }
    }

    // Re-render QR codes on read so every visitor (including those registered before the
    // scan-compatibility fix, whose stored image had a too-small quiet zone) gets a
    // scan-friendly code. Cheap: a few ms per visitor.
    for (const v of invite.visitors || []) {
      if (!v.photoPath) continue;
      try {
        v.qrCodeData = await renderQrDataUrl(buildGateQrPayload(v.id, invite.passphrase, invite.token));
      } catch {
        // keep stored image
      }
    }

    return invite;
  }

  async revive(inviteId: string, userId: string, orgId: string) {
    const invite = await this.prisma.invite.findFirst({
      where: { id: inviteId, organisationId: orgId },
    });
    if (!invite) throw new NotFoundException('Invite not found');

    const ttl = parseInt(process.env.INVITE_LINK_TTL_MINUTES || '60', 10);
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

    const updated = await this.prisma.invite.update({
      where: { id: inviteId },
      data: {
        status: InviteStatus.ACTIVE,
        expiresAt,
        revivedAt: new Date(),
      },
    });

    await this.audit.log({
      action: 'INVITE_REVIVED',
      entity: 'Invite',
      entityId: inviteId,
      userId,
    });

    return updated;
  }

  async approveOffline(inviteId: string, adminId: string, orgId: string) {
    const invite = await this.prisma.invite.findFirst({
      where: { id: inviteId, organisationId: orgId, isOffline: true },
    });
    if (!invite) throw new NotFoundException('Offline invite not found');

    const ttl = parseInt(process.env.INVITE_LINK_TTL_MINUTES || '60', 10);

    const updated = await this.prisma.invite.update({
      where: { id: inviteId },
      data: {
        status: InviteStatus.ACTIVE,
        approvedById: adminId,
        expiresAt: new Date(Date.now() + ttl * 60 * 1000),
      },
    });

    await this.audit.log({
      action: 'OFFLINE_INVITE_APPROVED',
      entity: 'Invite',
      entityId: inviteId,
      userId: adminId,
    });

    return updated;
  }

  async getPublicInviteInfo(token: string) {
    return this.getByToken(token);
  }
}
