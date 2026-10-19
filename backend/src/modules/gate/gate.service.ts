import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EntryMode, VisitStatus } from '@prisma/client';
import { EntryDto } from './dto/entry.dto';

@Injectable()
export class GateService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
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

    // Notify host
    await this.notifications.create({
      userId: visitor.invite.hostId,
      title: 'Visitor Arrived',
      body: `${visitor.fullName} has entered the premises.`,
      meta: { visitorId: visitor.id, inviteId: visitor.inviteId },
    });

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

    await this.notifications.create({
      userId: visitor.invite.hostId,
      title: 'Visitor Exited',
      body: `${visitor.fullName} has left the premises.`,
      meta: { visitorId: visitor.id, inviteId: visitor.inviteId },
    });

    return updated;
  }
}
