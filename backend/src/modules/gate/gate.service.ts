import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { EntryMode, VisitStatus } from '@prisma/client';
import { EntryDto } from './dto/entry.dto';
import { parseGateCode } from '../../common/utils/qr';

@Injectable()
export class GateService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private mail: MailService,
  ) {}

  async lookup(passphraseOrQr: string, actor?: any) {
    // Accept every form a QR / officer can produce: QR JSON, /visitor/<token> URL,
    // bare token or visitor id, passphrase in any case / spacing.
    const parsed = parseGateCode(passphraseOrQr);
    if (!parsed.passphrase && !parsed.token && !parsed.visitorId) {
      throw new BadRequestException('Scan a QR code or enter a passphrase');
    }

    const include = {
      visitors: { include: { gateVisits: { include: { gate: { select: { name: true, sequence: true } }, officer: { select: { fullName: true } }, particulars: true }, orderBy: { occurredAt: 'asc' } } } },
      host: { select: { id: true, fullName: true, email: true } },
      organisation: { select: { id: true, name: true } },
    } as const;

    let invite: any = null;
    let scannedVisitorId: string | null = null;

    if (parsed.passphrase) {
      invite = await this.prisma.invite.findFirst({
        where: { passphrase: parsed.passphrase },
        include,
      });
      // Legacy/raw value (e.g. stored with unusual characters) — exact match as typed
      if (!invite && typeof passphraseOrQr === 'string') {
        invite = await this.prisma.invite.findFirst({
          where: { passphrase: passphraseOrQr.trim().toUpperCase() },
          include,
        });
      }
    }

    if (!invite && parsed.token) {
      invite = await this.prisma.invite.findUnique({ where: { token: parsed.token }, include });
    }

    if (parsed.visitorId) {
      if (!invite) {
        const v = await this.prisma.visitor.findUnique({
          where: { id: parsed.visitorId },
          select: { id: true, inviteId: true },
        });
        if (v) {
          invite = await this.prisma.invite.findUnique({ where: { id: v.inviteId }, include });
        }
      }
      if (invite?.visitors?.some((v: any) => v.id === parsed.visitorId)) {
        scannedVisitorId = parsed.visitorId;
      }
    }

    if (!invite) throw new NotFoundException('No matching invite found');
    const globalAccess = actor && ['SUPER_ADMIN', 'GLOBAL_GATE'].includes(actor.role);
    if (actor?.role === 'GLOBAL_ADMIN' && !(actor.permissions || []).includes('visits.view')) throw new ForbiddenException('Cross-agency visitor access is not enabled for your account');
    if (actor && !globalAccess && actor.role !== 'GLOBAL_ADMIN' && invite.organisationId !== actor.orgId) throw new NotFoundException('No matching invite found');

    return {
      inviteId: invite.id,
      scannedVisitorId,
      purpose: invite.purpose,
      expectedMode: invite.expectedMode,
      host: invite.host,
      organisation: invite.organisation,
      organisationId: invite.organisationId,
      locationId: invite.locationId,
      visitors: invite.visitors.map((v: any) => ({
        id: v.id,
        fullName: v.fullName,
        photoPath: v.photoPath,
        status: v.status,
        entryMode: v.entryMode,
        enteredAt: v.enteredAt,
        exitedAt: v.exitedAt,
        deniedAt: (v as any).deniedAt,
        deniedReason: (v as any).deniedReason,
        gateVisits: (v as any).gateVisits || [],
      })),
    };
  }



  async listCheckpoints(actor: any) {
    if (actor.role === 'GLOBAL_ADMIN' && !(actor.permissions || []).includes('gates.manage')) throw new ForbiddenException('Gate oversight permission is required');
    const global = ['SUPER_ADMIN', 'GLOBAL_GATE', 'GLOBAL_ADMIN'].includes(actor.role);
    const where: any = global ? {} : { location: { organisationId: actor.orgId } };
    if (actor.role === 'GATE' || actor.role === 'GLOBAL_GATE') where.assignments = { some: { userId: actor.id } };
    return this.prisma.gate.findMany({ where: { ...where, isActive: true }, include: { location: { select: { name: true, organisationId: true, organisation: { select: { name: true } } } } }, orderBy: [{ locationId: 'asc' }, { sequence: 'asc' }] });
  }

  async recordCheckpoint(body: any, actor: any) {
    if (actor.role === 'GLOBAL_ADMIN') throw new ForbiddenException('Global Admin accounts provide oversight, not checkpoint operations');
    const visitorId = String(body.visitorId || '');
    const gateId = String(body.gateId || '');
    const decision = String(body.decision || '').toUpperCase();
    if (!visitorId || !gateId || !['PASSED', 'DENIED'].includes(decision)) throw new BadRequestException('Visitor, gate and a PASSED or DENIED decision are required');
    const visitor = await this.prisma.visitor.findUnique({ where: { id: visitorId }, include: { invite: true } });
    if (!visitor) throw new NotFoundException('Visitor not found');
    if (decision === 'PASSED' && !visitor.photoPath) throw new BadRequestException('Visitor has not completed photo capture');
    if (decision === 'DENIED' && !String(body.notes || '').trim()) throw new BadRequestException('A reason is required when denying entry');
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, isActive: true }, include: { location: true, assignments: true } });
    if (!gate) throw new NotFoundException('Active gate not found');
    if (!gate.admissionsEnabled && decision === 'PASSED') throw new BadRequestException('Admissions are disabled at this checkpoint. Contact the agency administrator.');
    if (gate.particularsCheckEnabled && body.particularsChecked !== true) throw new BadRequestException('Confirm that particulars have been checked at this checkpoint before proceeding.');
    if (decision === 'PASSED' && gate.dailyAdmissionLimit) { const start = new Date(); start.setHours(0,0,0,0); const admittedToday = await this.prisma.gateVisit.count({ where: { gateId, decision: 'PASSED', occurredAt: { gte: start } } }); if (admittedToday >= gate.dailyAdmissionLimit) throw new BadRequestException('This checkpoint has reached its daily admission limit.'); }
    const global = ['SUPER_ADMIN', 'GLOBAL_ADMIN', 'GLOBAL_GATE'].includes(actor.role);
    if (!global && gate.location.organisationId !== actor.orgId) throw new NotFoundException('Gate not found');
    if (visitor.invite.organisationId !== gate.location.organisationId) throw new BadRequestException('This visitor is not invited to this agency');
    if (visitor.invite.locationId && visitor.invite.locationId !== gate.locationId) throw new BadRequestException('This gate is outside the visitor destination');
    if (['GATE', 'GLOBAL_GATE'].includes(actor.role) && !gate.assignments.some(a => a.userId === actor.id)) throw new BadRequestException('You are not assigned to this checkpoint');
    if (visitor.status === VisitStatus.EXITED || visitor.status === VisitStatus.CANCELLED) throw new BadRequestException('This visit is already closed');
    if (visitor.status === VisitStatus.DENIED) throw new BadRequestException('This visitor has already been denied');
    const currentEvent = await this.prisma.gateVisit.findFirst({ where: { visitorId, gateId }, orderBy: { occurredAt: 'desc' } });
    if (currentEvent?.decision === 'PASSED') throw new BadRequestException('Visitor has already passed this checkpoint');
    const earlier = await this.prisma.gate.findMany({ where: { locationId: gate.locationId, isActive: true, sequence: { lt: gate.sequence } }, orderBy: { sequence: 'asc' } });
    for (const prior of earlier) {
      const event = await this.prisma.gateVisit.findFirst({ where: { visitorId, gateId: prior.id }, orderBy: { occurredAt: 'desc' } });
      if (!event || event.decision !== 'PASSED') throw new BadRequestException(`Visitor must pass ${prior.name} before this checkpoint`);
    }
    const particulars = Array.isArray(body.particulars) ? body.particulars : [];
    for (const item of particulars) {
      if (!['WITHHELD', 'ALLOWED'].includes(String(item.kind || '').toUpperCase()) || !String(item.description || '').trim()) throw new BadRequestException('Each particular needs a description and WITHHELD or ALLOWED classification');
      if (item.imagePath && !/^\/visitors\/particulars\/[a-f0-9-]+\.webp$/i.test(String(item.imagePath))) throw new BadRequestException('Particular image must be uploaded through the evidence capture endpoint');
    }
    const evidencePhotos = Array.isArray(body.evidencePhotos) ? body.evidencePhotos.map((p: unknown) => String(p)) : [];
    if (evidencePhotos.length > 10) throw new BadRequestException('A checkpoint can have at most 10 evidence photos');
    if (evidencePhotos.some((p: string) => !/^\/visitors\/particulars\/[a-f0-9-]+\.webp$/i.test(p))) throw new BadRequestException('All checkpoint photos must be uploaded WebP evidence images');
    const event = await this.prisma.$transaction(async tx => {
      const created = await tx.gateVisit.create({ data: { visitorId, gateId, officerId: actor.id, decision, particularsChecked: body.particularsChecked === true, evidencePhotos, notes: body.notes ? String(body.notes).slice(0, 2000) : null } });
      if (particulars.length) await tx.gateParticular.createMany({ data: particulars.map(item => ({ gateVisitId: created.id, kind: String(item.kind).toUpperCase(), description: String(item.description).trim().slice(0, 500), quantity: Math.max(1, Math.min(1000, Number(item.quantity) || 1)), imagePath: item.imagePath ? String(item.imagePath).slice(0, 1000) : null, createdById: actor.id })) });
      if (decision === 'DENIED') await tx.visitor.update({ where: { id: visitorId }, data: { status: VisitStatus.DENIED, deniedAt: new Date(), deniedReason: String(body.notes || 'Denied at checkpoint').slice(0, 1000), entryById: actor.id } });
      else {
        const remaining = await tx.gate.count({ where: { locationId: gate.locationId, isActive: true, sequence: { gt: gate.sequence } } });
        if (remaining === 0) await tx.visitor.update({ where: { id: visitorId }, data: { status: VisitStatus.ARRIVED, enteredAt: visitor.enteredAt || new Date(), entryById: actor.id, gateId, entryMode: Object.values(EntryMode).includes(body.entryMode) ? body.entryMode : EntryMode.PEDESTRIAN } });
      }
      return tx.gateVisit.findUnique({ where: { id: created.id }, include: { gate: { include: { location: true } }, officer: { select: { id: true, fullName: true } }, particulars: true } });
    });
    await this.audit.log({ action: `CHECKPOINT_${decision}`, entity: 'Visitor', entityId: visitorId, userId: actor.id, details: { gateId, gateName: gate.name, particulars: particulars.length } });
    if (decision === 'DENIED') {
      await this.notifications.create({ userId: visitor.invite.hostId, title: 'Visitor entry declined', body: `${visitor.fullName} was declined at ${gate.name}: ${String(body.notes).trim()}`, meta: { visitorId, inviteId: visitor.inviteId, type: 'ENTRY_DENIED' }, channels: ['in_app'] });
      const host = await this.prisma.user.findUnique({ where: { id: visitor.invite.hostId }, select: { email: true, fullName: true } });
      if (host?.email) await this.mail.sendHostVisitorUpdate({ to: host.email, hostName: host.fullName, guestName: visitor.fullName, purpose: visitor.invite.purpose, event: 'denied', reason: String(body.notes).trim(), at: new Date().toISOString(), organisationId: visitor.invite.organisationId }).catch(() => {});
    }
    if (decision === 'PASSED') {
      const fresh = await this.prisma.visitor.findUnique({ where: { id: visitorId }, include: { invite: true } });
      if (fresh?.status === VisitStatus.ARRIVED && visitor.status !== VisitStatus.ARRIVED) {
        const host = await this.prisma.user.findUnique({ where: { id: fresh.invite.hostId }, select: { id: true, phone: true, email: true, fullName: true } });
        if (host) {
          const channels: Array<'in_app' | 'sms' | 'whatsapp'> = ['in_app'];
          if (process.env.SMS_PROVIDER && process.env.SMS_PROVIDER !== 'log' && host.phone) channels.push('sms');
          if (process.env.WHATSAPP_PROVIDER && process.env.WHATSAPP_PROVIDER !== 'log' && host.phone) channels.push('whatsapp');
          await this.notifications.create({ userId: host.id, title: 'Visitor Arrived', body: `${visitor.fullName} has completed all checkpoints and entered the premises.`, meta: { visitorId, inviteId: visitor.inviteId, type: 'ARRIVAL' }, channels, phone: host.phone || undefined });
          if (host.email) await this.mail.sendHostVisitorUpdate({ to: host.email, hostName: host.fullName, guestName: visitor.fullName, purpose: visitor.invite.purpose, event: 'arrival', at: fresh.enteredAt?.toISOString(), organisationId: fresh.invite.organisationId });
        }
      }
    }
    return event;
  }


  async returnParticular(particularId: string, actor: any) {
    if (actor.role === 'GLOBAL_ADMIN') throw new ForbiddenException('Global Admin accounts provide oversight, not custody operations');
    const item = await this.prisma.gateParticular.findUnique({ where: { id: particularId }, include: { gateVisit: { include: { gate: { include: { location: true, assignments: true } } } } } });
    if (!item) throw new NotFoundException('Particular record not found');
    if (item.kind !== 'WITHHELD') throw new BadRequestException('Only withheld items can be marked as returned');
    if (item.returnedAt) throw new BadRequestException('This item has already been marked as returned');
    const gate = item.gateVisit.gate;
    const global = ['SUPER_ADMIN', 'GLOBAL_GATE'].includes(actor.role);
    if (!global && gate.location.organisationId !== actor.orgId) throw new NotFoundException('Particular record not found');
    if (['GATE', 'GLOBAL_GATE'].includes(actor.role) && !gate.assignments.some(a => a.userId === actor.id)) throw new ForbiddenException('You are not assigned to this checkpoint');
    const updated = await this.prisma.gateParticular.update({ where: { id: particularId }, data: { returnedAt: new Date(), returnedById: actor.id } });
    await this.audit.log({ action: 'WITHHELD_ITEM_RETURNED', entity: 'GateParticular', entityId: particularId, userId: actor.id, details: { gateId: gate.id, visitorId: item.gateVisit.visitorId } });
    return updated;
  }

  async checkpointHistory(visitorId: string, actor: any) {
    const visitor = await this.prisma.visitor.findUnique({ where: { id: visitorId }, include: { invite: true } });
    if (!visitor) throw new NotFoundException('Visitor not found');
    if (actor.role === 'GLOBAL_ADMIN' && !(actor.permissions || []).includes('visits.view')) throw new ForbiddenException('Cross-agency visitor access is not enabled for your account');
    const global = ['SUPER_ADMIN', 'GLOBAL_GATE', 'GLOBAL_ADMIN'].includes(actor.role);
    if (!global && visitor.invite.organisationId !== actor.orgId) throw new NotFoundException('Visitor not found');
    return this.prisma.gateVisit.findMany({ where: { visitorId }, include: { gate: { include: { location: true } }, officer: { select: { id: true, fullName: true } }, particulars: { orderBy: { createdAt: 'asc' } } }, orderBy: { occurredAt: 'asc' } });
  }

  async recordEntry(dto: EntryDto, actor: any) {
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: dto.visitorId },
      include: {
        invite: {
          include: { host: true },
        },
      },
    });

    if (!visitor || (actor.role !== 'SUPER_ADMIN' && visitor.invite.organisationId !== actor.orgId)) throw new NotFoundException('Visitor not found');
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
        entryById: actor.id,
        gateNotes: dto.notes,
      },
    });

    await this.audit.log({
      action: 'ENTRY_RECORDED',
      entity: 'Visitor',
      entityId: visitor.id,
      userId: actor.id,
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
        organisationId: visitor.invite.organisationId,
      });
    }

    return updated;
  }

  async recordExit(visitorId: string, actor: any, notes?: string) {
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: visitorId },
      include: {
        invite: { include: { host: true } },
      },
    });

    const globalExit = ['SUPER_ADMIN', 'GLOBAL_GATE'].includes(actor.role);
    if (!visitor || (!globalExit && visitor.invite.organisationId !== actor.orgId)) throw new NotFoundException('Visitor not found');
    if (visitor.status !== VisitStatus.ARRIVED) {
      throw new BadRequestException('Visitor is not currently on premises');
    }

    const updated = await this.prisma.visitor.update({
      where: { id: visitorId },
      data: {
        status: VisitStatus.EXITED,
        exitedAt: new Date(),
        exitById: actor.id,
        gateNotes: notes ? `${visitor.gateNotes || ''}\nExit: ${notes}`.trim() : visitor.gateNotes,
      },
    });

    await this.audit.log({
      action: 'EXIT_RECORDED',
      entity: 'Visitor',
      entityId: visitor.id,
      userId: actor.id,
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
          organisationId: visitor.invite.organisationId,
        });
      }
    }

    return updated;
  }

  /** Recent invites/visits for gate dashboard */

  async denyEntry(visitorId: string, actor: any, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A comment is required when declining entry');
    }
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: visitorId },
      include: { invite: { include: { host: true } } },
    });
    if (!visitor || (actor.role !== 'SUPER_ADMIN' && visitor.invite.organisationId !== actor.orgId)) throw new NotFoundException('Visitor not found');
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
        entryById: actor.id,
        gateNotes: reason.trim(),
      },
    });

    await this.audit.log({
      action: 'ENTRY_DENIED',
      entity: 'Visitor',
      entityId: visitor.id,
      userId: actor.id,
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
        event: 'denied',
        reason: reason.trim(),
        at: updated.deniedAt?.toISOString(),
        organisationId: visitor.invite.organisationId,
      }).catch(() => {});
    }

    return updated;
  }

  async listVisits(actor: any, filter?: string) {
    if (actor.role === 'GLOBAL_ADMIN' && !(actor.permissions || []).includes('visits.view')) throw new ForbiddenException('Cross-agency visitor access is not enabled for your account');
    const globalAccess = ['SUPER_ADMIN', 'GLOBAL_ADMIN', 'GLOBAL_GATE'].includes(actor.role);
    const invites = await this.prisma.invite.findMany({
      where: globalAccess ? {} : { organisationId: actor.orgId },
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

