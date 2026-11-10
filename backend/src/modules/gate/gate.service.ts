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
import { linkSameDayVisits, visitorsForPassToken } from '../../common/utils/visitor-pass';
import { currentAttendanceDay, localDayKey, attendanceTimeZone } from '../../common/utils/attendance-day';
import { roleLabel } from '../../common/utils/role-labels';
import { ContractorsService } from '../contractors/contractors.service';

@Injectable()
export class GateService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private mail: MailService,
    private contractors: ContractorsService,
  ) {}

  async lookup(passphraseOrQr: string, actor?: any) {
    const parsed = parseGateCode(passphraseOrQr);
    if (parsed.contractorToken) {
      const found = await this.contractors.lookup(parsed.contractorToken, actor);
      if (!found) throw new NotFoundException('No matching contractor found');
      return found;
    }
    if (parsed.staffToken) {
      return this.scanStaffAttendance(parsed.staffToken, actor);
    }
    if (!parsed.passphrase && !parsed.token && !parsed.visitorId && !parsed.passToken) {
      throw new BadRequestException('Scan a QR code or enter a passphrase');
    }

    const include = {
      visitors: { include: { gateVisits: { include: { gate: { select: { name: true, sequence: true, locationId: true } }, officer: { select: { fullName: true } }, particulars: true }, orderBy: { occurredAt: 'asc' } }, transfers: { orderBy: { createdAt: 'asc' } } } },
      host: { select: { id: true, fullName: true, email: true, phone: true } },
      organisation: { select: { id: true, name: true, code: true } },
    } as const;

    let invite: any = null;
    let scannedVisitorId: string | null = null;
    let seedVisitorId: string | null = null;

    if (parsed.passToken) {
      const pack = await visitorsForPassToken(this.prisma, parsed.passToken);
      if (pack.visitors.length) {
        seedVisitorId = pack.visitors[0].id;
        invite = await this.prisma.invite.findUnique({ where: { id: pack.visitors[0].inviteId }, include });
      }
    }

    if (parsed.passphrase) {
      invite = invite || await this.prisma.invite.findFirst({
        where: { passphrase: parsed.passphrase },
        include,
      });
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
        seedVisitorId = parsed.visitorId;
      }
    }

    if (!invite) throw new NotFoundException('No matching invite found');
    const globalAccess = actor && ['SUPER_ADMIN', 'GLOBAL_GATE'].includes(actor.role);
    if (actor?.role === 'GLOBAL_ADMIN' && !(actor.permissions || []).includes('visits.view')) throw new ForbiddenException('Cross-agency visitor access is not enabled for your account');

    const seed = seedVisitorId || scannedVisitorId || invite.visitors[0]?.id;
    const linked = seed ? await linkSameDayVisits(this.prisma, seed) : { visitors: invite.visitors, visitorIds: invite.visitors.map((v: any) => v.id), passToken: null, day: null };
    const appointments = this.groupAppointments(linked.visitors?.length ? linked.visitors : invite.visitors);
    if (actor && !globalAccess && actor.role !== 'GLOBAL_ADMIN') {
      const mine = appointments.find((a: any) => a.organisationId === actor.orgId) || (invite.organisationId === actor.orgId ? invite : null);
      if (!mine) throw new NotFoundException('No matching invite found');
      if (mine && mine.inviteId && mine.inviteId !== invite.id) {
        const alt = await this.prisma.invite.findUnique({ where: { id: mine.inviteId }, include });
        if (alt) invite = alt;
      }
    }

    const presentVisitor = (v: any) => ({
      id: v.id,
      fullName: v.fullName,
      email: v.email,
      phone: v.phone,
      photoPath: v.photoPath,
      status: v.status,
      hostAvailabilityStatus: v.hostAvailabilityStatus,
      hostWaitUntil: v.hostWaitUntil,
      hostRespondedAt: v.hostRespondedAt,
      lastHostPromptAt: v.lastHostPromptAt,
      entryMode: v.entryMode,
      enteredAt: v.enteredAt,
      exitedAt: v.exitedAt,
      deniedAt: v.deniedAt,
      deniedReason: v.deniedReason,
      passToken: v.passToken,
      gateVisits: v.gateVisits || [],
      transfers: v.transfers || [],
      inviteId: v.inviteId,
    });

    return {
      kind: 'visitor',
      inviteId: invite.id,
      scannedVisitorId,
      purpose: invite.purpose,
      expectedMode: invite.expectedMode,
      host: invite.host,
      organisation: invite.organisation,
      organisationId: invite.organisationId,
      locationId: invite.locationId,
      passToken: linked.passToken,
      appointments,
      visitors: (linked.visitors?.length ? linked.visitors.filter((v: any) => v.inviteId === invite.id) : invite.visitors).map(presentVisitor),
    };
  }

  private groupAppointments(visitors: any[]) {
    const byInvite = new Map<string, any>();
    for (const v of visitors || []) {
      const inv = v.invite || {};
      const id = v.inviteId || inv.id;
      if (!id) continue;
      if (!byInvite.has(id)) {
        byInvite.set(id, {
          inviteId: id,
          purpose: inv.purpose,
          expectedAt: inv.expectedAt,
          organisation: inv.organisation,
          organisationId: inv.organisationId,
          locationId: inv.locationId,
          host: inv.host,
          visitors: [],
        });
      }
      byInvite.get(id).visitors.push({
        id: v.id,
        fullName: v.fullName,
        email: v.email,
        phone: v.phone,
        photoPath: v.photoPath,
        status: v.status,
        enteredAt: v.enteredAt,
        exitedAt: v.exitedAt,
        deniedAt: v.deniedAt,
        deniedReason: v.deniedReason,
        hostAvailabilityStatus: v.hostAvailabilityStatus,
        gateVisits: v.gateVisits || [],
        transfers: v.transfers || [],
      });
    }
    return [...byInvite.values()];
  }

  async listCheckpoints(actor: any) {
    if (actor.role === 'GLOBAL_ADMIN' && !(actor.permissions || []).includes('gates.manage')) throw new ForbiddenException('Gate oversight permission is required');
    const global = ['SUPER_ADMIN', 'GLOBAL_GATE', 'GLOBAL_ADMIN'].includes(actor.role);
    const where: any = global ? {} : { location: { organisationId: actor.orgId } };
    if (actor.role === 'GATE' || actor.role === 'GLOBAL_GATE') where.assignments = { some: { userId: actor.id } };
    return this.prisma.gate.findMany({ where: { ...where, isActive: true }, include: { location: { select: { name: true, organisationId: true, organisation: { select: { name: true } } } } }, orderBy: [{ locationId: 'asc' }, { sequence: 'asc' }] });
  }

  async recordCheckpoint(body: any, actor: any) {
    if (actor.role === 'GLOBAL_ADMIN') throw new ForbiddenException('Super Admin II accounts provide oversight, not checkpoint operations');
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
    const direction = String(body.direction || '').toUpperCase() === 'EXIT' || visitor.status === VisitStatus.ARRIVED ? 'EXIT' : 'ENTRY';
    if (direction === 'EXIT' && visitor.status !== VisitStatus.ARRIVED) throw new BadRequestException('Exit checkpoints start after the visitor has arrived');
    if (direction === 'EXIT' && decision === 'PASSED') await this.assertParticularsResolved(visitorId, direction === 'EXIT');
    const currentEvent = await this.prisma.gateVisit.findFirst({ where: { visitorId, gateId, direction }, orderBy: { occurredAt: 'desc' } });
    if (currentEvent?.decision === 'PASSED') throw new BadRequestException('Visitor has already passed this checkpoint');
    if (direction === 'ENTRY') {
      const earlier = await this.prisma.gate.findMany({ where: { locationId: gate.locationId, isActive: true, sequence: { lt: gate.sequence } }, orderBy: { sequence: 'asc' } });
      for (const prior of earlier) {
        const event = await this.prisma.gateVisit.findFirst({ where: { visitorId, gateId: prior.id, direction: 'ENTRY' }, orderBy: { occurredAt: 'desc' } });
        if (!event || event.decision !== 'PASSED') throw new BadRequestException(`Visitor must pass ${prior.name} before this checkpoint`);
      }
    } else {
      const later = await this.prisma.gate.findMany({ where: { locationId: gate.locationId, isActive: true, sequence: { gt: gate.sequence } }, orderBy: { sequence: 'desc' } });
      for (const prior of later) {
        const event = await this.prisma.gateVisit.findFirst({ where: { visitorId, gateId: prior.id, direction: 'EXIT' }, orderBy: { occurredAt: 'desc' } });
        if (!event || event.decision !== 'PASSED') throw new BadRequestException(`Visitor must pass ${prior.name} before this exit checkpoint`);
      }
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
      const created = await tx.gateVisit.create({ data: { visitorId, gateId, officerId: actor.id, decision, direction, particularsChecked: body.particularsChecked === true, evidencePhotos, notes: body.notes ? String(body.notes).slice(0, 2000) : null } });
      if (particulars.length) await tx.gateParticular.createMany({ data: particulars.map(item => ({ gateVisitId: created.id, kind: String(item.kind).toUpperCase(), description: String(item.description).trim().slice(0, 500), quantity: Math.max(1, Math.min(1000, Number(item.quantity) || 1)), imagePath: item.imagePath ? String(item.imagePath).slice(0, 1000) : null, createdById: actor.id })) });
      if (decision === 'DENIED' && direction === 'ENTRY') await tx.visitor.update({ where: { id: visitorId }, data: { status: VisitStatus.DENIED, deniedAt: new Date(), deniedReason: String(body.notes || 'Denied at checkpoint').slice(0, 1000), entryById: actor.id } });
      else if (decision === 'PASSED' && direction === 'ENTRY') {
        const remaining = await tx.gate.count({ where: { locationId: gate.locationId, isActive: true, sequence: { gt: gate.sequence } } });
        if (remaining === 0) await tx.visitor.update({ where: { id: visitorId }, data: { status: VisitStatus.ARRIVED, hostAvailabilityStatus: 'PENDING', hostWaitUntil: null, hostRespondedAt: null, lastHostPromptAt: new Date(), enteredAt: visitor.enteredAt || new Date(), entryById: actor.id, gateId, entryMode: Object.values(EntryMode).includes(body.entryMode) ? body.entryMode : EntryMode.PEDESTRIAN } });
      } else if (decision === 'PASSED' && direction === 'EXIT') {
        await this.assertParticularsResolved(visitorId);
        const remaining = await tx.gate.count({ where: { locationId: gate.locationId, isActive: true, sequence: { lt: gate.sequence } } });
        if (remaining === 0) await tx.visitor.update({ where: { id: visitorId }, data: { status: VisitStatus.EXITED, exitedAt: new Date(), exitById: actor.id } });
      }
      return tx.gateVisit.findUnique({ where: { id: created.id }, include: { gate: { include: { location: true } }, officer: { select: { id: true, fullName: true } }, particulars: true } });
    });
    await this.audit.log({ action: `CHECKPOINT_${decision}`, entity: 'Visitor', entityId: visitorId, userId: actor.id, details: { gateId, gateName: gate.name, particulars: particulars.length, direction } });
    await this.mirrorCheckpointToLinked(visitorId, gate, { decision, direction, actorId: actor.id, particularsChecked: body.particularsChecked === true, evidencePhotos, notes: body.notes ? String(body.notes).slice(0, 2000) : null, entryMode: body.entryMode });
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
          await this.notifications.create({ userId: host.id, title: 'Visitor Arrived', body: `${visitor.fullName} has completed all checkpoints and entered the premises.`, meta: { visitorId, inviteId: visitor.inviteId, type: 'HOST_ARRIVAL_CONFIRMATION', requiresHostResponse: true }, channels, phone: host.phone || undefined });
          if (host.email) await this.mail.sendHostVisitorUpdate({ to: host.email, hostName: host.fullName, guestName: visitor.fullName, purpose: visitor.invite.purpose, event: 'arrival', at: fresh.enteredAt?.toISOString(), organisationId: fresh.invite.organisationId }).catch(() => {});
        }
      }
    }
    return event;
  }


  async respondHostAvailability(visitorId: string, body: any, actor: any) {
    const visitor = await this.prisma.visitor.findUnique({ where: { id: visitorId }, include: { invite: true } });
    if (!visitor) throw new NotFoundException('Visitor not found');
    if (visitor.invite.hostId !== actor.id) throw new NotFoundException('Visitor not found');
    if (visitor.status !== VisitStatus.ARRIVED) throw new BadRequestException('Host availability can only be confirmed after the final checkpoint');
    const available = body.available === true;
    const waitMinutes = Math.max(1, Math.min(60, Number(body.waitMinutes) || 1));
    const updated = await this.prisma.visitor.update({ where: { id: visitorId }, data: {
      hostAvailabilityStatus: available ? 'AVAILABLE' : 'WAITING',
      hostWaitUntil: available ? null : new Date(Date.now() + waitMinutes * 60000),
      hostRespondedAt: new Date(),
    } });
    await this.audit.log({ action: available ? 'HOST_CONFIRMED_AVAILABILITY' : 'HOST_REQUESTED_VISITOR_WAIT', entity: 'Visitor', entityId: visitorId, userId: actor.id, details: { waitMinutes: available ? 0 : waitMinutes } });
    return { status: updated.hostAvailabilityStatus, waitUntil: updated.hostWaitUntil, respondedAt: updated.hostRespondedAt };
  }

  async requestHostAvailability(visitorId: string, actor: any) {
    if (!['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN'].includes(actor.role)) throw new ForbiddenException('Only checkpoint officers can request host availability');
    const visitor = await this.prisma.visitor.findUnique({ where: { id: visitorId }, include: { invite: { include: { host: true } } } });
    if (!visitor || visitor.status !== VisitStatus.ARRIVED) throw new NotFoundException('Arrived visitor not found');
    const platformAdmin = actor.role === 'SUPER_ADMIN';
    const assignments = await this.prisma.gateOfficerAssignment.findMany({ where: { userId: actor.id, gate: { location: { organisationId: visitor.invite.organisationId } } }, select: { gateId: true } });
    if (!platformAdmin && (!assignments.length || (actor.role === 'GATE' && visitor.invite.organisationId !== actor.orgId))) throw new NotFoundException('Visitor not found');
    if (visitor.lastHostPromptAt && Date.now() - visitor.lastHostPromptAt.getTime() < 60000) throw new BadRequestException('Please wait at least one minute before asking the host again');
    await this.prisma.visitor.update({ where: { id: visitorId }, data: { lastHostPromptAt: new Date(), hostAvailabilityStatus: 'PENDING' } });
    const host = visitor.invite.host;
    await this.notifications.create({ userId: host.id, title: 'Host availability requested', body: `${visitor.fullName} is waiting at the final checkpoint. Please confirm availability or choose a wait time.`, meta: { visitorId, inviteId: visitor.inviteId, type: 'HOST_ARRIVAL_CONFIRMATION', requiresHostResponse: true }, channels: ['in_app'] });
    if (host.email) await this.mail.sendHostVisitorUpdate({ to: host.email, hostName: host.fullName, guestName: visitor.fullName, purpose: visitor.invite.purpose, event: 'arrival', at: new Date().toISOString(), organisationId: visitor.invite.organisationId }).catch(() => {});
    return { ok: true, requestedAt: new Date() };
  }

  async returnParticular(particularId: string, actor: any) {
    if (actor.role === 'GLOBAL_ADMIN') throw new ForbiddenException('Super Admin II accounts provide oversight, not custody operations');
    const item = await this.prisma.gateParticular.findUnique({ where: { id: particularId }, include: { gateVisit: { include: { gate: { include: { location: true, assignments: true } } } } } });
    if (!item) throw new NotFoundException('Particular record not found');
    if (item.kind !== 'WITHHELD') throw new BadRequestException('Only withheld items can be marked as returned');
    if (item.returnedAt) throw new BadRequestException('This item has already been marked as returned');
    const gate = item.gateVisit.gate;
    const global = ['SUPER_ADMIN', 'GLOBAL_GATE'].includes(actor.role);
    if (!global && gate.location.organisationId !== actor.orgId) throw new NotFoundException('Particular record not found');
    if (['GATE', 'GLOBAL_GATE'].includes(actor.role) && !gate.assignments.some(a => a.userId === actor.id)) throw new ForbiddenException('You are not assigned to this checkpoint');
    return this.resolveParticular(particularId, actor, { resolution: 'RETURNED' });
  }

  async resolveParticular(particularId: string, actor: any, body: { resolution: string; note?: string }) {
    if (actor.role === 'GLOBAL_ADMIN') throw new ForbiddenException('Super Admin II accounts provide oversight, not custody operations');
    const item = await this.prisma.gateParticular.findUnique({ where: { id: particularId }, include: { gateVisit: { include: { gate: { include: { location: true, assignments: true } } } } } });
    if (!item) throw new NotFoundException('Particular record not found');
    if (item.kind !== 'WITHHELD') throw new BadRequestException('Only withheld items can be resolved');
    if (item.resolvedAt || item.returnedAt) throw new BadRequestException('This item has already been resolved');
    const resolution = String(body.resolution || '').toUpperCase();
    if (!['RETURNED', 'SEIZED', 'OTHER'].includes(resolution)) throw new BadRequestException('Mark the item as returned, seized, or other');
    const note = String(body.note || '').trim();
    if (resolution === 'OTHER' && note.length < 2) throw new BadRequestException('Add a short note when resolving as other');
    const gate = item.gateVisit.gate;
    const global = ['SUPER_ADMIN', 'GLOBAL_GATE'].includes(actor.role);
    if (!global && gate.location.organisationId !== actor.orgId) throw new NotFoundException('Particular record not found');
    if (['GATE', 'GLOBAL_GATE'].includes(actor.role) && !gate.assignments.some((a: any) => a.userId === actor.id)) throw new ForbiddenException('You are not assigned to this checkpoint');
    const now = new Date();
    const updated = await this.prisma.gateParticular.update({
      where: { id: particularId },
      data: {
        resolution,
        resolutionNote: note ? note.slice(0, 500) : null,
        resolvedAt: now,
        resolvedById: actor.id,
        returnedAt: resolution === 'RETURNED' ? now : item.returnedAt,
        returnedById: resolution === 'RETURNED' ? actor.id : item.returnedById,
      },
    });
    await this.audit.log({ action: `WITHHELD_ITEM_${resolution}`, entity: 'GateParticular', entityId: particularId, userId: actor.id, details: { gateId: gate.id, visitorId: item.gateVisit.visitorId, note } });
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
    await this.assertParticularsResolved(visitorId);
    await this.assertExitCheckpointsComplete(visitor);

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

  /**
   * Staff permanent QR attendance.
   * Day boundary: APP_TIMEZONE (default Africa/Lagos).
   * First scan of the day → arrival. Later scans → set/refresh exit time.
   */
  async scanStaffAttendance(staffToken: string, actor?: any) {
    if (!actor) throw new ForbiddenException('Sign in required to record staff attendance');
    if (!['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN', 'ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Only gate officers (and Super Admin) can record staff attendance');
    }
    const staff = await this.prisma.user.findFirst({
      where: { staffQrToken: staffToken, isActive: true },
      select: {
        id: true,
        fullName: true,
        role: true,
        organisationId: true,
        avatarPath: true,
        staffBadgePhotoPath: true,
        organisation: { select: { id: true, name: true, code: true } },
      },
    });
    if (!staff) throw new NotFoundException('Staff QR not recognised');

    const global = ['SUPER_ADMIN', 'GLOBAL_GATE'].includes(actor.role);
    if (!global && actor.role !== 'ADMIN' && staff.organisationId !== actor.orgId) {
      throw new ForbiddenException('This staff member belongs to another agency');
    }
    if (actor.role === 'ADMIN' && staff.organisationId !== actor.orgId) {
      throw new ForbiddenException('This staff member belongs to another agency');
    }

    const day = currentAttendanceDay();
    const now = new Date();
    const existing = await this.prisma.staffAttendance.findUnique({
      where: { userId_day: { userId: staff.id, day } },
    });

    let attendance;
    let action: 'ARRIVAL' | 'EXIT';
    if (!existing) {
      attendance = await this.prisma.staffAttendance.create({
        data: {
          userId: staff.id,
          organisationId: staff.organisationId,
          day,
          arrivedAt: now,
          scannedById: actor.id,
        },
      });
      action = 'ARRIVAL';
      await this.audit.log({
        action: 'STAFF_ARRIVAL',
        entity: 'StaffAttendance',
        entityId: attendance.id,
        userId: actor.id,
        details: { staffId: staff.id, day: localDayKey(now) },
      });
    } else {
      attendance = await this.prisma.staffAttendance.update({
        where: { id: existing.id },
        data: { exitedAt: now, scannedById: actor.id },
      });
      action = 'EXIT';
      await this.audit.log({
        action: 'STAFF_EXIT',
        entity: 'StaffAttendance',
        entityId: attendance.id,
        userId: actor.id,
        details: { staffId: staff.id, day: localDayKey(now) },
      });
    }

    return {
      kind: 'staff',
      action,
      timezone: attendanceTimeZone(),
      day: localDayKey(now),
      staff: {
        id: staff.id,
        fullName: staff.fullName,
        role: staff.role,
        roleLabel: roleLabel(staff.role),
        organisation: staff.organisation,
        avatarPath: staff.avatarPath,
        staffBadgePhotoPath: staff.staffBadgePhotoPath,
      },
      attendance: {
        id: attendance.id,
        arrivedAt: attendance.arrivedAt,
        exitedAt: attendance.exitedAt,
      },
      message:
        action === 'ARRIVAL'
          ? `${staff.fullName} marked arrived for ${localDayKey(now)}`
          : `${staff.fullName} marked exited at ${now.toLocaleTimeString('en-GB', { timeZone: attendanceTimeZone(), hour: '2-digit', minute: '2-digit' })}`,
    };
  }

  private async assertParticularsResolved(visitorId: string, finalExit = true) {
    const open = await this.prisma.gateParticular.findFirst({
      where: {
        kind: 'WITHHELD',
        resolvedAt: null,
        returnedAt: null,
        gateVisit: { visitorId },
      },
      include: { gateVisit: { include: { gate: { select: { name: true } } } } },
    });
    if (open) {
      throw new BadRequestException(`Cannot exit yet: "${open.description}" is still withheld at ${open.gateVisit.gate?.name || 'a checkpoint'}. Mark it returned, seized, or otherwise resolved.`);
    }
  }

  private async assertExitCheckpointsComplete(visitor: { id: string; invite: { locationId?: string | null } }) {
    const locationId = visitor.invite.locationId;
    if (!locationId) return;
    const gates = await this.prisma.gate.findMany({ where: { locationId, isActive: true }, orderBy: { sequence: 'desc' } });
    if (!gates.length) return;
    for (const g of gates) {
      const ev = await this.prisma.gateVisit.findFirst({ where: { visitorId: visitor.id, gateId: g.id, direction: 'EXIT' }, orderBy: { occurredAt: 'desc' } });
      if (!ev || ev.decision !== 'PASSED') {
        throw new BadRequestException(`Exit must pass through checkpoints. ${g.name} has not been cleared for exit.`);
      }
    }
  }

  private async mirrorCheckpointToLinked(visitorId: string, gate: any, opts: { decision: string; direction: string; actorId: string; particularsChecked: boolean; evidencePhotos: string[]; notes: string | null; entryMode?: any }) {
    const linked = await linkSameDayVisits(this.prisma, visitorId);
    const others = (linked.visitors || []).filter((v: any) => v.id !== visitorId && v.invite?.organisationId === gate.location.organisationId);
    for (const other of others) {
      if (other.status === 'EXITED' || other.status === 'CANCELLED' || other.status === 'DENIED') continue;
      if (opts.direction === 'EXIT' && other.status !== 'ARRIVED') continue;
      const existing = await this.prisma.gateVisit.findFirst({ where: { visitorId: other.id, gateId: gate.id, direction: opts.direction }, orderBy: { occurredAt: 'desc' } });
      if (existing?.decision === 'PASSED') continue;
      await this.prisma.gateVisit.create({
        data: { visitorId: other.id, gateId: gate.id, officerId: opts.actorId, decision: opts.decision, direction: opts.direction, particularsChecked: opts.particularsChecked, evidencePhotos: opts.evidencePhotos, notes: opts.notes },
      });
      if (opts.decision === 'DENIED' && opts.direction === 'ENTRY') {
        await this.prisma.visitor.update({ where: { id: other.id }, data: { status: VisitStatus.DENIED, deniedAt: new Date(), deniedReason: (opts.notes || 'Denied at checkpoint').slice(0, 1000) } });
      } else if (opts.decision === 'PASSED' && opts.direction === 'ENTRY') {
        const remaining = await this.prisma.gate.count({ where: { locationId: gate.locationId, isActive: true, sequence: { gt: gate.sequence } } });
        if (remaining === 0) await this.prisma.visitor.update({ where: { id: other.id }, data: { status: VisitStatus.ARRIVED, enteredAt: other.enteredAt || new Date(), entryById: opts.actorId, gateId: gate.id } });
      } else if (opts.decision === 'PASSED' && opts.direction === 'EXIT') {
        const remaining = await this.prisma.gate.count({ where: { locationId: gate.locationId, isActive: true, sequence: { lt: gate.sequence } } });
        if (remaining === 0) {
          try { await this.assertParticularsResolved(other.id); } catch { continue; }
          await this.prisma.visitor.update({ where: { id: other.id }, data: { status: VisitStatus.EXITED, exitedAt: new Date(), exitById: opts.actorId } });
        }
      }
    }
  }


}
