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
import * as QRCode from 'qrcode';

@Injectable()
export class InvitesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
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
        guestCount: dto.guestCount || 1,
        guestNames: dto.guestNames || [],
        expectedMode: dto.expectedMode,
        expiresAt,
        hostId,
        organisationId: orgId,
        isOffline: dto.isOffline || false,
        status: dto.isOffline ? InviteStatus.OFFLINE_PENDING : InviteStatus.ACTIVE,
      },
      include: {
        host: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Create visitor records
    const names = dto.guestNames?.length
      ? dto.guestNames
      : Array.from({ length: dto.guestCount || 1 }, (_, i) => `Guest ${i + 1}`);

    for (const name of names) {
      await this.prisma.visitor.create({
        data: {
          inviteId: invite.id,
          fullName: name,
        },
      });
    }

    await this.audit.log({
      action: 'INVITE_CREATED',
      entity: 'Invite',
      entityId: invite.id,
      userId: hostId,
      details: { purpose: dto.purpose, guestCount: dto.guestCount },
    });

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link = `${baseUrl}/visitor/${token}`;

    return {
      ...invite,
      link,
      expiresInMinutes: ttl,
    };
  }

  async findMyInvites(hostId: string) {
    return this.prisma.invite.findMany({
      where: { hostId },
      include: {
        visitors: true,
        host: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(orgId: string) {
    return this.prisma.invite.findMany({
      where: { organisationId: orgId },
      include: {
        visitors: true,
        host: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByToken(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        visitors: true,
        host: { select: { fullName: true, email: true } },
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

    if (invite.status === InviteStatus.EXPIRED || new Date() > invite.expiresAt) {
      if (invite.status !== InviteStatus.EXPIRED) {
        await this.prisma.invite.update({
          where: { id: invite.id },
          data: { status: InviteStatus.EXPIRED },
        });
      }
      throw new BadRequestException('This invite link has expired');
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
