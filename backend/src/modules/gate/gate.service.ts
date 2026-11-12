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
import { currentAttendanceDay, localDayKey, attendanceTimeZone, startOfNextLocalDay } from '../../common/utils/attendance-day';
import { roleLabel } from '../../common/utils/role-labels';
import { ContractorsService } from '../contractors/contractors.service';
import { allowedEntryModes, cleanPlate, cleanVehicleDetails, vehicleMode } from '../../common/utils/entry-modes';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

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
      // No email and no phone: no registration link reached them, so the gate takes the photo
      noContact: !v.email && !v.phone,
      gatePhotoPath: v.gatePhotoPath || null,
      identityStatus: v.identityStatus || null,
      identityRequestedAt: v.identityRequestedAt || null,
      identityReviewedAt: v.identityReviewedAt || null,
      vehiclePlate: v.vehiclePlate || null,
      vehicleDetails: v.vehicleDetails || null,
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
      inviteStatus: invite.status,
      cancelled: !!invite.cancelledAt || invite.status === 'REVOKED',
      cancelledAt: invite.cancelledAt || null,
      cancelReason: invite.cancelReason || null,
      expectedAt: invite.expectedAt || null,
      vehiclePlate: invite.vehiclePlate || null,
      vehicleDetails: invite.vehicleDetails || null,
      allowedEntryModes: await allowedEntryModes(this.prisma),
      // The route this visitor must follow. The gate page uses this even if its own checkpoint
      // list failed to load (the v18 mobile bypass), so legacy entry/exit never shows when gates exist.
      gates: await this.routeGates(invite, actor),
      passToken: linked.passToken,
      appointments,
      visitors: this.lookupVisitors(invite, linked, !seedVisitorId && !scannedVisitorId).map(presentVisitor),
    };
  }

  /**
   * Which guests the gate sees. An invite-level code (passphrase / invite link) shows every guest on
   * the invite. A personal code shows that person's same-day visits on this invite, plus any guest on
   * the invite with no email and no phone (they never got a personal code, so the gate reaches them
   * through a companion's or the host's code).
   */
  private lookupVisitors(invite: any, linked: any, inviteLevel: boolean) {
    const all: any[] = invite.visitors || [];
    if (inviteLevel || !linked.visitors?.length) return all;
    const mine = linked.visitors.filter((v: any) => v.inviteId === invite.id);
    const ids = new Set(mine.map((v: any) => v.id));
    const extra = all.filter((v: any) => !ids.has(v.id) && !v.email && !v.phone);
    return [...mine, ...extra];
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

  /** Active checkpoints on this invite's route: its location, or every location of its agency. */
  async routeGates(invite: { organisationId: string; locationId?: string | null }, actor?: any) {
    const where: any = { isActive: true };
    if (invite.locationId) where.locationId = invite.locationId;
    else where.location = { organisationId: invite.organisationId };
    const gates = await this.prisma.gate.findMany({
      where,
      include: { location: { select: { id: true, name: true, organisationId: true, organisation: { select: { name: true } } } }, assignments: { select: { userId: true } } },
      orderBy: [{ locationId: 'asc' }, { sequence: 'asc' }],
    });
    return gates.map(({ assignments, ...g }: any) => ({
      ...g,
      assigned: !actor || !['GATE', 'GLOBAL_GATE'].includes(actor.role) || assignments.some((a: any) => a.userId === actor.id),
    }));
  }

  private photoDir() {
    return process.env.PHOTO_STORAGE_PATH || '/data/photos';
  }

  private async assertGateCanHandle(visitorId: string, actor: any) {
    const visitor = await this.prisma.visitor.findUnique({ where: { id: visitorId }, include: { invite: { include: { host: { select: { id: true, fullName: true, email: true } } } } } });
    if (!visitor) throw new NotFoundException('Guest not found');
    const global = ['SUPER_ADMIN', 'GLOBAL_GATE'].includes(actor.role);
    if (!global && visitor.invite.organisationId !== actor.orgId) throw new NotFoundException('Guest not found');
    if (actor.role === 'GLOBAL_ADMIN') throw new ForbiddenException('Super Admin II accounts provide oversight, not checkpoint operations');
    return visitor;
  }

  /** Gate officer takes a live photo of a guest who had no email/phone (no registration link). */
  async uploadGatePhoto(visitorId: string, file: Express.Multer.File, actor: any) {
    if (!file?.buffer?.length) throw new BadRequestException('No photo received');
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype || '')) throw new BadRequestException('Photo must be JPEG, PNG or WebP');
    const visitor = await this.assertGateCanHandle(visitorId, actor);
    if (visitor.invite.cancelledAt || visitor.invite.status === 'REVOKED') throw new BadRequestException('This visit was cancelled by the host');
    if (visitor.photoPath) throw new BadRequestException('This guest already has a photo');
    if (['DENIED', 'CANCELLED', 'EXITED'].includes(visitor.status)) throw new BadRequestException('This visit is already closed');
    if (visitor.identityStatus === 'PENDING') throw new BadRequestException('Waiting for the host — retake after they respond');
    const ext = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const dir = this.photoDir();
    fs.mkdirSync(dir, { recursive: true });
    const name = `${visitorId}-gate-${uuidv4()}${ext}`;
    fs.writeFileSync(path.join(dir, name), file.buffer);
    const updated = await this.prisma.visitor.update({
      where: { id: visitorId },
      data: { gatePhotoPath: name, identityStatus: 'CAPTURED', identityReviewedAt: null, identityReviewedById: null },
    });
    await this.audit.log({ action: 'GATE_GUEST_PHOTO_TAKEN', entity: 'Visitor', entityId: visitorId, userId: actor.id, details: { guest: visitor.fullName } });
    return { id: updated.id, gatePhotoPath: updated.gatePhotoPath, identityStatus: updated.identityStatus };
  }

  /** Send the captured photos to the host, who ticks or crosses each guest. */
  async requestIdentityConfirmation(visitorIds: string[], actor: any) {
    const ids = Array.from(new Set((visitorIds || []).map(String))).slice(0, 30);
    if (!ids.length) throw new BadRequestException('Choose at least one guest');
    const visitors = [] as any[];
    for (const id of ids) visitors.push(await this.assertGateCanHandle(id, actor));
    const ready = visitors.filter((v) => v.gatePhotoPath && v.identityStatus === 'CAPTURED' && !v.photoPath);
    if (!ready.length) throw new BadRequestException('Take a photo of each guest first');
    const now = new Date();
    await this.prisma.visitor.updateMany({ where: { id: { in: ready.map((v) => v.id) } }, data: { identityStatus: 'PENDING', identityRequestedAt: now, identityRequestedById: actor.id } });
    const byHost = new Map<string, any[]>();
    for (const v of ready) {
      const k = v.invite.hostId;
      byHost.set(k, [...(byHost.get(k) || []), v]);
    }
    for (const [hostId, list] of byHost) {
      const host = list[0].invite.host;
      const names = list.map((v) => v.fullName).join(', ');
      await this.notifications.create({
        userId: hostId,
        title: 'Confirm your guest' + (list.length > 1 ? 's' : ''),
        body: `The gate photographed ${names}. Tick the people you are expecting.`,
        meta: { type: 'IDENTITY_CONFIRM', visitorIds: list.map((v) => v.id), inviteId: list[0].inviteId, url: '/identity' },
        channels: ['in_app'],
      }).catch(() => {});
      if (host?.email) {
        const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
        await this.mail.sendNotice({
          to: host.email,
          organisationId: list[0].invite.organisationId,
          subject: `Confirm guest identity: ${names}`,
          eyebrow: 'At the gate',
          title: `Please confirm ${list.length > 1 ? 'these guests' : 'this guest'}`,
          paragraphs: [`${names} ${list.length > 1 ? 'are' : 'is'} at the gate for "${list[0].invite.purpose}" without a registered photo. Open the app to confirm each person with a tick, or decline with an X.`],
          button: base ? { href: `${base}/identity`, label: 'Confirm identity' } : null,
        }).catch(() => null);
      }
    }
    await this.audit.log({ action: 'GUEST_IDENTITY_REQUESTED', entity: 'Invite', entityId: ready[0].inviteId, userId: actor.id, details: { guests: ready.map((v) => v.fullName) } });
    return { requested: ready.map((v) => v.id) };
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
    if ((visitor.status === VisitStatus.INVITED || visitor.status === VisitStatus.CANCELLED) && (visitor.invite.cancelledAt || visitor.invite.status === 'REVOKED')) throw new BadRequestException('This visit was cancelled by the host — entry is not allowed');
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
    if (direction === 'ENTRY' && (visitor.invite.cancelledAt || visitor.invite.status === 'REVOKED')) throw new BadRequestException('This visit was cancelled by the host — entry is not allowed');
    if (direction === 'ENTRY' && decision === 'PASSED' && visitor.invite.status !== 'ACTIVE' && visitor.invite.status !== 'USED' && visitor.invite.status !== 'EXPIRED') throw new BadRequestException('This invite is not active');
    const modes = await allowedEntryModes(this.prisma);
    if (direction === 'ENTRY' && body.entryMode && !modes.includes(String(body.entryMode))) throw new BadRequestException(`${String(body.entryMode).toLowerCase()} entry is not accepted`);
    const plate = vehicleMode(body.entryMode) ? cleanPlate(body.vehiclePlate) : null;
    const vDetails = vehicleMode(body.entryMode) ? cleanVehicleDetails(body.vehicleDetails) : null;
    if (direction === 'EXIT' && visitor.status !== VisitStatus.ARRIVED) throw new BadRequestException('Exit checkpoints start after the visitor has arrived');
    if (direction === 'EXIT' && decision === 'PASSED') await this.assertParticularsResolved(visitorId, { gateId });
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
        if (remaining === 0) await tx.visitor.update({ where: { id: visitorId }, data: { status: VisitStatus.ARRIVED, hostAvailabilityStatus: 'PENDING', hostWaitUntil: null, hostRespondedAt: null, lastHostPromptAt: new Date(), enteredAt: visitor.enteredAt || new Date(), entryById: actor.id, gateId, entryMode: Object.values(EntryMode).includes(body.entryMode) ? body.entryMode : EntryMode.PEDESTRIAN, vehiclePlate: plate || (vehicleMode(body.entryMode) ? visitor.invite.vehiclePlate : null), vehicleDetails: vDetails || (vehicleMode(body.entryMode) ? visitor.invite.vehicleDetails : null) } });
      } else if (decision === 'PASSED' && direction === 'EXIT') {
        const remaining = await tx.gate.count({ where: { locationId: gate.locationId, isActive: true, sequence: { lt: gate.sequence } } });
        if (remaining === 0) {
          await this.assertParticularsResolved(visitorId);
          await tx.visitor.update({ where: { id: visitorId }, data: { status: VisitStatus.EXITED, exitedAt: new Date(), exitById: actor.id } });
        }
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
    if (['GATE', 'GLOBAL_GATE'].includes(actor.role) && !gate.assignments.some(a => a.userId === actor.id)) throw new ForbiddenException(`This item can only be returned or seized at ${gate.name}`);
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
    if (['GATE', 'GLOBAL_GATE'].includes(actor.role) && !gate.assignments.some((a: any) => a.userId === actor.id)) throw new ForbiddenException(`This item can only be returned or seized at ${gate.name}`);
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
    if (visitor.invite.cancelledAt || visitor.invite.status === 'REVOKED') {
      throw new BadRequestException('This visit was cancelled by the host — entry is not allowed');
    }
    if (!visitor.photoPath) {
      throw new BadRequestException('Visitor has not completed photo capture');
    }
    if (visitor.status !== VisitStatus.INVITED) throw new BadRequestException('This visit is closed');
    // Gate passes are mandatory whenever the route has checkpoints (fixes the v18 mobile bypass).
    const route = await this.routeGates(visitor.invite);
    if (route.length) {
      throw new BadRequestException(`Entry must go through the checkpoints: ${route.map((g: any) => g.name).join(' → ')}`);
    }
    const modes = await allowedEntryModes(this.prisma);
    if (dto.entryMode && !modes.includes(dto.entryMode)) throw new BadRequestException(`${dto.entryMode.toLowerCase()} entry is not accepted`);

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

  async listVisits(actor: any, filter?: string, q?: string) {
    if (actor.role === 'GLOBAL_ADMIN' && !(actor.permissions || []).includes('visits.view')) throw new ForbiddenException('Cross-agency visitor access is not enabled for your account');
    const globalAccess = ['SUPER_ADMIN', 'GLOBAL_ADMIN', 'GLOBAL_GATE'].includes(actor.role);
    const tomorrow = startOfNextLocalDay();
    const term = String(q || '').trim();
    const digits = term.replace(/\D+/g, '');
    const searchOr: any[] = [];
    if (term) {
      const contains = { contains: term, mode: 'insensitive' as const };
      searchOr.push(
        { fullName: contains },
        { phone: contains },
        { email: contains },
        { invite: { purpose: contains } },
        { invite: { passphrase: contains } },
        { invite: { token: contains } },
        { invite: { host: { fullName: contains } } },
        { invite: { organisation: { name: contains } } },
        { invite: { organisation: { code: contains } } },
      );
      if (digits.length >= 4) {
        searchOr.push({ phone: { contains: digits, mode: 'insensitive' as const } });
      }
    }
    const orgInvite: { organisationId?: string } = globalAccess ? {} : { organisationId: actor.orgId };
    const scheduledWhere = {
      invite: { ...orgInvite, expectedAt: { gte: tomorrow } },
      status: 'INVITED' as const,
    };
    const currentWhere = {
      invite: orgInvite,
      OR: [
        { invite: { expectedAt: null } },
        { invite: { expectedAt: { lt: tomorrow } } },
        { status: { in: [VisitStatus.ARRIVED, VisitStatus.EXITED, VisitStatus.DENIED, VisitStatus.CANCELLED] } },
      ],
    };

    const visitors = await this.prisma.visitor.findMany({
      where: {
        ...(filter === 'scheduled' ? scheduledWhere : currentWhere),
        ...(term ? { AND: [{ OR: searchOr }] } : {}),
      },
      include: {
        invite: {
          include: {
            host: { select: { fullName: true, email: true } },
            organisation: { select: { name: true, code: true } },
          },
        },
      },
      orderBy: filter === 'scheduled' ? { createdAt: 'asc' } : { createdAt: 'desc' },
      take: 250,
    });

    const rows = visitors.map((v) => ({
      visitorId: v.id,
      fullName: v.fullName,
      phone: v.phone,
      status: v.status,
      photoPath: v.photoPath,
      noContact: !v.email && !v.phone,
      identityStatus: v.identityStatus || null,
      cancelled: !!v.invite.cancelledAt,
      inviteStatus: v.invite.status,
      entryMode: v.entryMode,
      vehiclePlate: v.vehiclePlate || v.invite.vehiclePlate || null,
      enteredAt: v.enteredAt,
      exitedAt: v.exitedAt,
      deniedAt: v.deniedAt,
      inviteId: v.invite.id,
      purpose: v.invite.purpose,
      passphrase: v.invite.passphrase,
      hostName: v.invite.host?.fullName,
      agencyName: v.invite.organisation?.name || null,
      agencyCode: v.invite.organisation?.code || null,
      expectedAt: v.invite.expectedAt,
      createdAt: v.createdAt,
      scheduled: filter === 'scheduled',
    }));

    // Sort scheduled by expected date, current by most recent activity.
    rows.sort((a, b) => {
      if (filter === 'scheduled') {
        return new Date(a.expectedAt || a.createdAt).getTime() - new Date(b.expectedAt || b.createdAt).getTime();
      }
      const da = new Date(a.enteredAt || a.exitedAt || a.createdAt).getTime();
      const db = new Date(b.enteredAt || b.exitedAt || b.createdAt).getTime();
      return db - da;
    });

    if (filter === 'arrived' || filter === 'on_site') return rows.filter((r) => r.status === 'ARRIVED');
    if (filter === 'exited') return rows.filter((r) => r.status === 'EXITED');
    if (filter === 'pending') return rows.filter((r) => r.status === 'INVITED');
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

  private async assertParticularsResolved(visitorId: string, opts?: { gateId?: string }) {
    const open = await this.prisma.gateParticular.findFirst({
      where: {
        kind: 'WITHHELD',
        resolvedAt: null,
        returnedAt: null,
        gateVisit: { visitorId, ...(opts?.gateId ? { gateId: opts.gateId } : {}) },
      },
      include: { gateVisit: { include: { gate: { select: { name: true } } } } },
    });
    if (open) {
      const at = open.gateVisit.gate?.name || 'a checkpoint';
      if (opts?.gateId) {
        throw new BadRequestException(`Cannot pass this exit yet: "${open.description}" is still withheld at ${at}. Return, seize, or otherwise resolve it at that gate.`);
      }
      throw new BadRequestException(`Cannot complete the final exit yet: "${open.description}" is still withheld at ${at}. Return, seize, or otherwise resolve it at that gate first.`);
    }
  }

  private async assertExitCheckpointsComplete(visitor: { id: string; invite: { locationId?: string | null; organisationId?: string } }) {
    // Every checkpoint the visitor entered through (plus the whole destination route when set)
    // must record a passed exit — the legacy "Record exit" can never skip gate passes.
    const entered = await this.prisma.gateVisit.findMany({ where: { visitorId: visitor.id, direction: 'ENTRY', decision: 'PASSED' }, select: { gateId: true } });
    const ids = new Set(entered.map((e) => e.gateId));
    const locationId = visitor.invite.locationId;
    const gates = await this.prisma.gate.findMany({
      where: { isActive: true, OR: [{ id: { in: [...ids] } }, ...(locationId ? [{ locationId }] : [])] },
      orderBy: { sequence: 'desc' },
    });
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
