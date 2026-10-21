import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { EntryMode, VisitStatus } from '@prisma/client';
import { EntryDto } from './dto/entry.dto';

@Injectable()
export class GateService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private mail: MailService,
  ) {}

  async lookup(passphraseOrQr: string) {
    // Try passphrase first
    let invite = await this.prisma.invite.findFirst({
      where: { passphrase: passphraseOrQr.toUpperCase() },
      include: {
        visitors: true,
        host: { select: { id: true, fullName: true, email: true } },
        organisation: { select: { name: true } },
      },
    });

    // Try parsing QR JSON
    if (!invite) {
      try {
        const parsed = JSON.parse(passphraseOrQr);
        if (parsed.p) {
          invite = await this.prisma.invite.findFirst({
            where: { passphrase: parsed.p },
            include: {
              visitors: true,
              host: { select: { id: true, fullName: true, email: true } },
              organisation: { select: { name: true } },
            },
          });
        }
      } catch {
        // not JSON
      }
    }

    if (!invite) throw new NotFoundException('No matching invite found');

    return {
      inviteId: invite.id,
      purpose: invite.purpose,
      expectedMode: invite.expectedMode,
      host: invite.host,
      organisation: invite.organisation,
      visitors: invite.visitors.map((v) => ({
        id: v.id,
        fullName: v.fullName,
        photoPath: v.photoPath,
        status: v.status,
        entryMode: v.entryMode,
        enteredAt: v.enteredAt,
        exitedAt: v.exitedAt,
        deniedAt: (v as any).deniedAt,
        deniedReason: (v as any).deniedReason,
      })),
    };
  }

  async recordEntry(dto: EntryDto, gateUserId: string) {
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: dto.visitorId },
      include: {
        invite: {
          include: { host: true },
        },
      },
    });

    if (!visitor) throw new NotFoundException('Visitor not found');
    if (visitor.status === VisitStatus.ARRIVED) {
      throw new BadRequestException('Visitor already recorded as entered');
    }
    if (visitor.status === VisitStatus.EXITED) {
      throw new BadRequestException('Visitor has already exited');
    }
    if (!visitor.photoPath) {
      throw new BadRequestException('Visitor has not completed photo capture');
    }

    const updated = await this.prisma.visitor.update({
      where: { id: dto.visitorId },
      data: {
        status: VisitStatus.ARRIVED,
        entryMode: dto.entryMode || EntryMode.PEDESTRIAN,
        enteredAt: new Date(),
        entryById: gateUserId,
        gateNotes: dto.notes,
      },
    });

    await this.audit.log({
      action: 'ENTRY_RECORDED',
      entity: 'Visitor',
      entityId: visitor.id,
      userId: gateUserId,
      details: { mode: dto.entryMode, notes: dto.notes },
    });

    // Notify host (in-app + optional SMS/WhatsApp)
    const host = await this.prisma.user.findUnique({
      where: { id: visitor.invite.hostId },
      select: { id: true, phone: true },
    });
    const channels: Array<'in_app' | 'sms' | 'whatsapp'> = ['in_app'];
    if (process.env.SMS_PROVIDER && process.env.SMS_PROVIDER !== 'log' && host?.phone) {
      channels.push('sms');
    }
    if (process.env.WHATSAPP_PROVIDER && process.env.WHATSAPP_PROVIDER !== 'log' && host?.phone) {
      channels.push('whatsapp');
    }
    await this.notifications.create({
      userId: visitor.invite.hostId,
      title: 'Visitor Arrived',
      body: `${visitor.fullName} has entered the premises.`,
      meta: { visitorId: visitor.id, inviteId: visitor.inviteId, type: 'ARRIVAL' },
      channels,
      phone: host?.phone || undefined,
    });

    const hostEmail = await this.prisma.user.findUnique({
      where: { id: visitor.invite.hostId },
      select: { email: true, fullName: true },
    });
    if (hostEmail?.email) {
      await this.mail.sendHostVisitorUpdate({
        to: hostEmail.email,
        hostName: hostEmail.fullName,
        guestName: visitor.fullName,
        purpose: visitor.invite.purpose,
        event: 'arrival',
        at: updated.enteredAt?.toISOString(),
      });
    }

    return updated;
  }

  async recordExit(visitorId: string, gateUserId: string, notes?: string) {
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: visitorId },
      include: {
        invite: { include: { host: true } },
      },
    });

    if (!visitor) throw new NotFoundException('Visitor not found');
    if (visitor.status !== VisitStatus.ARRIVED) {
      throw new BadRequestException('Visitor is not currently on premises');
    }

    const updated = await this.prisma.visitor.update({
      where: { id: visitorId },
      data: {
        status: VisitStatus.EXITED,
        exitedAt: new Date(),
        exitById: gateUserId,
        gateNotes: notes ? `${visitor.gateNotes || ''}\nExit: ${notes}`.trim() : visitor.gateNotes,
      },
    });

    await this.audit.log({
      action: 'EXIT_RECORDED',
      entity: 'Visitor',
      entityId: visitor.id,
      userId: gateUserId,
      details: { notes },
    });

    const hostExit = await this.prisma.user.findUnique({
      where: { id: visitor.invite.hostId },
      select: { id: true, phone: true },
    });
    const channelsExit: Array<'in_app' | 'sms' | 'whatsapp'> = ['in_app'];
    if (process.env.SMS_PROVIDER && process.env.SMS_PROVIDER !== 'log' && hostExit?.phone) {
      channelsExit.push('sms');
    }
    if (process.env.WHATSAPP_PROVIDER && process.env.WHATSAPP_PROVIDER !== 'log' && hostExit?.phone) {
      channelsExit.push('whatsapp');
    }
    await this.notifications.create({
      userId: visitor.invite.hostId,
      title: 'Visitor Exited',
      body: `${visitor.fullName} has left the premises.`,
      meta: { visitorId: visitor.id, inviteId: visitor.inviteId, type: 'EXIT' },
      channels: channelsExit,
      phone: hostExit?.phone || undefined,
    });

    if (hostExit) {
      const hostFull = await this.prisma.user.findUnique({
        where: { id: visitor.invite.hostId },
        select: { email: true, fullName: true },
      });
      if (hostFull?.email) {
        await this.mail.sendHostVisitorUpdate({
          to: hostFull.email,
          hostName: hostFull.fullName,
          guestName: visitor.fullName,
          purpose: visitor.invite.purpose,
          event: 'exit',
          at: updated.exitedAt?.toISOString(),
        });
      }
    }

    return updated;
  }

  /** Recent invites/visits for gate dashboard */

  async denyEntry(visitorId: string, gateUserId: string, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A comment is required when declining entry');
    }
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: visitorId },
      include: { invite: { include: { host: true } } },
    });
    if (!visitor) throw new NotFoundException('Visitor not found');
    if (visitor.status === VisitStatus.ARRIVED) {
      throw new BadRequestException('Visitor already on premises — use exit instead');
    }
    if (visitor.status === VisitStatus.EXITED) {
      throw new BadRequestException('Visitor has already exited');
    }
    if (visitor.status === VisitStatus.DENIED) {
      throw new BadRequestException('Entry already declined');
    }

    const updated = await this.prisma.visitor.update({
      where: { id: visitorId },
      data: {
        status: VisitStatus.DENIED,
        deniedAt: new Date(),
        deniedReason: reason.trim(),
        entryById: gateUserId,
        gateNotes: reason.trim(),
      },
    });

    await this.audit.log({
      action: 'ENTRY_DENIED',
      entity: 'Visitor',
      entityId: visitor.id,
      userId: gateUserId,
      details: { reason: reason.trim() },
    });

    await this.notifications.create({
      userId: visitor.invite.hostId,
      title: 'Visitor entry declined',
      body: `${visitor.fullName} was declined at the gate: ${reason.trim()}`,
      meta: { visitorId: visitor.id, inviteId: visitor.inviteId, type: 'ENTRY_DENIED' },
      channels: ['in_app'],
    });

    const host = await this.prisma.user.findUnique({
      where: { id: visitor.invite.hostId },
      select: { email: true, fullName: true },
    });
    if (host?.email) {
      await this.mail.sendHostVisitorUpdate({
        to: host.email,
        hostName: host.fullName,
        guestName: visitor.fullName,
        purpose: visitor.invite.purpose,
        event: 'photo', // fallback label; body covers decline in notification
        at: updated.deniedAt?.toISOString(),
      }).catch(() => {});
    }

    return updated;
  }

  async listVisits(orgId: string, filter?: string) {
    const invites = await this.prisma.invite.findMany({
      where: { organisationId: orgId },
      include: {
        visitors: true,
        host: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const rows = invites.flatMap((inv) =>
      inv.visitors.map((v) => ({
        visitorId: v.id,
        fullName: v.fullName,
        status: v.status,
        photoPath: v.photoPath,
        enteredAt: v.enteredAt,
        exitedAt: v.exitedAt,
        inviteId: inv.id,
        purpose: inv.purpose,
        passphrase: inv.passphrase,
        hostName: inv.host?.fullName,
        expectedAt: inv.expectedAt,
        createdAt: inv.createdAt,
      })),
    );

    if (filter === 'arrived') {
      return rows.filter((r) => r.status === 'ARRIVED');
    }
    if (filter === 'exited') {
      return rows.filter((r) => r.status === 'EXITED');
    }
    if (filter === 'on_site') {
      return rows.filter((r) => r.status === 'ARRIVED');
    }
    if (filter === 'pending') {
      return rows.filter((r) => r.status === 'INVITED');
    }
    return rows;
  }
}

