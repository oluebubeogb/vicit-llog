import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { InviteStatus, Prisma, Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { buildGateQrPayload } from '../../common/utils/qr';
import { gatePassCaption, qrFileName, renderCaptionedQrDataUrl } from '../../common/utils/qr-caption';
import { isValidEmail } from '../../common/utils/email';
import { publicFrontendBase } from '../../common/utils/urls';
import { allowedEntryModes, cleanPlate, cleanVehicleDetails, vehicleMode } from '../../common/utils/entry-modes';
import { fmtAppTime, isPast, parseAppDateTime } from '../../common/utils/app-time';

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

  /** Public visitor-facing base URL: branding custom domain wins over FRONTEND_URL. */
  private async frontendBase(orgId: string) {
    const org = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      select: { customDomain: true },
    });
    return publicFrontendBase(org?.customDomain);
  }

  private async sendGuestInviteEmails(inviteId: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
      include: {
        visitors: true,
        host: { select: { fullName: true } },
        organisation: { select: { id: true, name: true, customDomain: true } },
      },
    });
    if (!invite) return [] as string[];
    const ttl = Math.max(1, Math.round((invite.expiresAt.getTime() - Date.now()) / 60000));
    const link = `${publicFrontendBase(invite.organisation?.customDomain)}/visitor/${invite.token}`;
    const sent: string[] = [];
    for (const v of invite.visitors) {
      if (!v.email) continue;
      const r = await this.mail.sendInviteEmail({
        to: v.email,
        guestName: v.fullName,
        hostName: invite.host.fullName,
        purpose: invite.purpose,
        link,
        passphrase: invite.passphrase,
        ttlMinutes: ttl,
        expectedAt: invite.expectedAt ? invite.expectedAt.toISOString() : null,
        orgName: invite.organisation?.name,
        organisationId: invite.organisation?.id,
      });
      if (r.ok) sent.push(v.email);
    }
    return sent;
  }

  async create(dto: CreateInviteDto, hostId: string, orgId: string, creatorRole?: string) {
    const ttl = parseInt(process.env.INVITE_LINK_TTL_MINUTES || '60', 10);
    const orgSettings = await this.prisma.organisation.findUnique({
      where: { id: orgId },
      select: { requireApproval: true },
    });
    // Branding & Settings → "Require approval for invites": non-admin invites wait for an admin.
    // v19: guests without a phone/email no longer need admin approval — they are tagged per guest.
    const needsApproval =
      Boolean(orgSettings?.requireApproval) && ![Role.ADMIN, Role.SUPER_ADMIN, Role.GLOBAL_ADMIN, Role.GLOBAL_GATE].includes(creatorRole as any);
    const expectedAt = parseAppDateTime(dto.expectedAt);
    if (dto.expectedAt && !expectedAt) throw new BadRequestException('Expected date/time is not valid');
    if (expectedAt && isPast(expectedAt)) throw new BadRequestException('The visit date and time cannot be in the past');
    const modes = await allowedEntryModes(this.prisma);
    if (dto.expectedMode && !modes.includes(dto.expectedMode)) {
      throw new BadRequestException(`${dto.expectedMode.toLowerCase()} entry is not accepted. Allowed: ${modes.map((m) => m.toLowerCase()).join(', ')}`);
    }
    const isVehicle = vehicleMode(dto.expectedMode);
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
        isOffline: false,
        status: needsApproval ? InviteStatus.AWAITING_APPROVAL : InviteStatus.ACTIVE,
        vehiclePlate: isVehicle ? cleanPlate(dto.vehiclePlate) : null,
        vehicleDetails: isVehicle ? cleanVehicleDetails(dto.vehicleDetails) : null,
        ...(expectedAt ? { expectedAt } : {}),
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

    if (!guests.length) throw new BadRequestException('Add at least one guest');
    for (const g of guests) if (!g.fullName) throw new BadRequestException('Every guest needs a full name');
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
      details: {
        purpose: dto.purpose,
        guestCount: guests.length,
        guests: guests.map((g) => g.fullName),
        noContactGuests: guests.filter((g) => !g.email && !g.phone).map((g) => g.fullName),
        expectedAt: expectedAt ? expectedAt.toISOString() : null,
        expectedMode: dto.expectedMode || null,
        awaitingApproval: needsApproval,
      },
    });

    const link = `${await this.frontendBase(orgId)}/visitor/${token}`;

    // Email each guest that has an address (awaiting approval waits until approved)
    let emailsSent: string[] = [];
    if (!needsApproval) {
      emailsSent = await this.sendGuestInviteEmails(invite.id);
      await this.auditGuestNotified(invite.id, hostId, 'INVITE_LINK', emailsSent);
    }

    if (needsApproval) {
      const admins = await this.prisma.user.findMany({
        where: { organisationId: orgId, role: Role.ADMIN, isActive: true },
        select: { id: true },
      });
      for (const a of admins) {
        await this.notifications.create({
          userId: a.id,
          title: 'Invite awaiting approval',
          body: `${invite.host.fullName} created an invite for "${dto.purpose}" (${guests.length} guest${guests.length === 1 ? '' : 's'}).`,
          meta: { type: 'INVITE_APPROVAL', inviteId: invite.id },
        });
      }
    }

    return {
      ...invite,
      guestCount: guests.length,
      visitors: createdVisitors,
      link,
      expiresInMinutes: ttl,
      emailsSent,
      noContactGuests: createdVisitors.filter((v) => !v.email && !v.phone).map((v) => ({ id: v.id, fullName: v.fullName })),
      awaitingApproval: needsApproval,
    };
  }

  private async auditGuestNotified(inviteId: string, userId: string | undefined, kind: string, emails: string[], extra?: any) {
    await this.audit.log({
      action: 'INVITE_GUESTS_NOTIFIED',
      entity: 'Invite',
      entityId: inviteId,
      userId,
      details: { kind, emailed: emails.length, recipients: emails, smtp: this.mail.isEnabled(), ...(extra || {}) },
    });
  }

  /** Host, an admin of the invite's agency, or a platform admin may manage the invite. */
  private async loadManageable(inviteId: string, actor: { id: string; role: string; orgId: string }) {
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
      include: {
        visitors: true,
        host: { select: { id: true, fullName: true, email: true } },
        organisation: { select: { id: true, name: true, customDomain: true } },
      },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    const ok =
      invite.hostId === actor.id ||
      (actor.role === Role.ADMIN && invite.organisationId === actor.orgId) ||
      actor.role === Role.SUPER_ADMIN ||
      actor.role === Role.GLOBAL_ADMIN;
    if (!ok) throw new ForbiddenException('Only the host or an admin can change this invite');
    return invite;
  }

  /** Host cancels an invite. Guests are told at any stage; the gate shows "Cancelled" and blocks entry. */
  async cancel(inviteId: string, actor: { id: string; role: string; orgId: string }, reason?: string) {
    const invite = await this.loadManageable(inviteId, actor);
    if (invite.cancelledAt) throw new BadRequestException('This invite is already cancelled');
    const now = new Date();
    const note = String(reason || '').trim().slice(0, 300) || null;
    await this.prisma.$transaction([
      this.prisma.invite.update({
        where: { id: inviteId },
        data: { status: InviteStatus.REVOKED, cancelledAt: now, cancelledById: actor.id, cancelReason: note },
      }),
      // Guests not yet through any gate are cancelled outright; anyone already inside keeps
      // their status so the gate can still record their exit.
      this.prisma.visitor.updateMany({
        where: { inviteId, status: 'INVITED', gateVisits: { none: {} } },
        data: { status: 'CANCELLED' },
      }),
    ]);
    const when = fmtAppTime(invite.expectedAt);
    const sent: string[] = [];
    for (const v of invite.visitors) {
      if (!v.email) continue;
      const r = await this.mail.sendNotice({
        to: v.email,
        organisationId: invite.organisationId,
        subject: `Visit cancelled: ${invite.purpose}`,
        eyebrow: 'Visit cancelled',
        title: `Hello ${v.fullName}, your visit has been cancelled`,
        paragraphs: [
          `${invite.host.fullName} has cancelled the visit "${invite.purpose}". Your gate pass will no longer be accepted.`,
          ...(note ? [`Reason: ${note}`] : []),
        ],
        facts: [['Host', invite.host.fullName], ['Was scheduled for', when || null]],
      });
      if (r.ok) sent.push(v.email);
    }
    if (invite.hostId !== actor.id) {
      await this.notifications.create({
        userId: invite.hostId,
        title: 'Invite cancelled',
        body: `Your invite "${invite.purpose}" was cancelled by an administrator.${note ? ` ${note}` : ''}`,
        meta: { type: 'INVITE_CANCELLED', inviteId },
        channels: ['in_app'],
      }).catch(() => {});
    }
    await this.audit.log({ action: 'INVITE_CANCELLED', entity: 'Invite', entityId: inviteId, userId: actor.id, details: { purpose: invite.purpose, reason: note, guests: invite.visitors.map((v) => v.fullName) } });
    await this.auditGuestNotified(inviteId, actor.id, 'CANCELLED', sent);
    return { ok: true, cancelledAt: now, emailsSent: sent };
  }

  /** Postpone an Active, Used or Expired invite to a new date/time (never in the past). */
  async postpone(inviteId: string, actor: { id: string; role: string; orgId: string }, body: { expectedAt?: string; note?: string }) {
    const invite = await this.loadManageable(inviteId, actor);
    if (invite.cancelledAt || invite.status === InviteStatus.REVOKED) throw new BadRequestException('A cancelled invite cannot be postponed');
    if (!([InviteStatus.ACTIVE, InviteStatus.EXPIRED, InviteStatus.USED] as InviteStatus[]).includes(invite.status)) {
      throw new BadRequestException('Only active or expired invites can be postponed');
    }
    const next = parseAppDateTime(body.expectedAt);
    if (!next) throw new BadRequestException('Choose the new date and time');
    if (isPast(next)) throw new BadRequestException('The new date and time cannot be in the past');
    if (invite.visitors.length && invite.visitors.every((v) => v.status !== 'INVITED')) {
      throw new BadRequestException('Every guest has already been processed at the gate');
    }
    const ttl = parseInt(process.env.INVITE_LINK_TTL_MINUTES || '60', 10);
    // Registration link stays usable until the new visit time (at least the normal TTL).
    const expiresAt = new Date(Math.max(Date.now() + ttl * 60000, next.getTime() + 60 * 60000));
    const note = String(body.note || '').trim().slice(0, 300) || null;
    const previous = invite.expectedAt;
    const updated = await this.prisma.invite.update({
      where: { id: inviteId },
      data: {
        expectedAt: next,
        postponedAt: new Date(),
        postponeCount: { increment: 1 },
        reminderDaySentAt: null,
        reminderHourSentAt: null,
        hostConfirmedAt: null,
        expiresAt,
        status: invite.status === InviteStatus.EXPIRED ? InviteStatus.ACTIVE : invite.status,
      },
    });
    const link = `${publicFrontendBase(invite.organisation?.customDomain)}/visitor/${invite.token}`;
    const sent: string[] = [];
    for (const v of invite.visitors) {
      if (!v.email || v.status !== 'INVITED') continue;
      const r = await this.mail.sendNotice({
        to: v.email,
        organisationId: invite.organisationId,
        subject: `Visit rescheduled: ${invite.purpose}`,
        eyebrow: 'New date & time',
        title: `Hello ${v.fullName}, your visit has moved`,
        paragraphs: [`${invite.host.fullName} has postponed "${invite.purpose}". Please come at the new time below.`, ...(note ? [`Note: ${note}`] : [])],
        facts: [['New date & time', fmtAppTime(next)], ['Previously', previous ? fmtAppTime(previous) : null], ['Gate passphrase', invite.passphrase]],
        button: { href: link, label: v.photoPath ? 'View my gate pass' : 'Complete registration' },
      });
      if (r.ok) sent.push(v.email);
    }
    await this.notifications.create({
      userId: invite.hostId,
      title: 'Visit postponed',
      body: `"${invite.purpose}" now takes place ${fmtAppTime(next)}.${sent.length ? ` ${sent.length} guest${sent.length === 1 ? '' : 's'} emailed.` : ''}`,
      meta: { type: 'INVITE_POSTPONED', inviteId, expectedAt: next.toISOString() },
      channels: ['in_app'],
    }).catch(() => {});
    if (invite.host.email && this.mail.isEnabled()) {
      await this.mail.sendNotice({
        to: invite.host.email,
        organisationId: invite.organisationId,
        subject: `Visit postponed: ${invite.purpose}`,
        eyebrow: 'Postponed',
        title: `Your visit is now ${fmtAppTime(next)}`,
        paragraphs: [`Guests: ${invite.visitors.map((v) => v.fullName).join(', ')}`],
        facts: [['Previously', previous ? fmtAppTime(previous) : null]],
      }).catch(() => null);
    }
    await this.audit.log({ action: 'INVITE_POSTPONED', entity: 'Invite', entityId: inviteId, userId: actor.id, details: { purpose: invite.purpose, from: previous?.toISOString() || null, to: next.toISOString(), note } });
    await this.auditGuestNotified(inviteId, actor.id, 'POSTPONED', sent);
    return { ...updated, emailsSent: sent };
  }

  /** Host answers the reminder: "I'll be available". */
  async confirmAvailability(inviteId: string, actor: { id: string; role: string; orgId: string }) {
    const invite = await this.loadManageable(inviteId, actor);
    const updated = await this.prisma.invite.update({ where: { id: inviteId }, data: { hostConfirmedAt: new Date() } });
    await this.audit.log({ action: 'HOST_AVAILABILITY_CONFIRMED', entity: 'Invite', entityId: inviteId, userId: actor.id, details: { purpose: invite.purpose, expectedAt: invite.expectedAt?.toISOString() || null } });
    return { ok: true, hostConfirmedAt: updated.hostConfirmedAt };
  }

  /**
   * Host ticks (confirm) or crosses (decline) a gate photo of a guest who had no email/phone.
   * Each guest is independent — one decline never blocks a co-guest.
   */
  async reviewIdentity(visitorId: string, actor: { id: string; role: string; orgId: string }, confirm: boolean) {
    const visitor = await this.prisma.visitor.findUnique({ where: { id: visitorId }, include: { invite: { include: { host: { select: { id: true, fullName: true } } } }, transfers: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!visitor) throw new NotFoundException('Guest not found');
    const last = visitor.transfers[0];
    const ok =
      visitor.invite.hostId === actor.id ||
      last?.toHostId === actor.id ||
      (actor.role === Role.ADMIN && visitor.invite.organisationId === actor.orgId) ||
      actor.role === Role.SUPER_ADMIN ||
      actor.role === Role.GLOBAL_ADMIN;
    if (!ok) throw new ForbiddenException('Only the host can confirm this guest');
    if (!visitor.gatePhotoPath) throw new BadRequestException('The gate has not sent a photo for this guest');
    if (visitor.identityStatus !== 'PENDING') throw new BadRequestException(`Already ${String(visitor.identityStatus || 'not requested').toLowerCase()}`);
    const now = new Date();
    const updated = await this.prisma.visitor.update({
      where: { id: visitorId },
      data: confirm
        ? { identityStatus: 'CONFIRMED', identityReviewedAt: now, identityReviewedById: actor.id, photoPath: visitor.gatePhotoPath }
        : { identityStatus: 'DECLINED', identityReviewedAt: now, identityReviewedById: actor.id, status: 'DENIED', deniedAt: now, deniedReason: 'Host did not confirm identity' },
    });
    if (visitor.identityRequestedById) {
      await this.notifications.create({
        userId: visitor.identityRequestedById,
        title: confirm ? 'Identity confirmed' : 'Identity not confirmed',
        body: `${visitor.invite.host.fullName} ${confirm ? 'confirmed' : 'did not confirm'} ${visitor.fullName}.`,
        meta: { type: 'IDENTITY_RESULT', visitorId, inviteId: visitor.inviteId, confirmed: confirm, url: `/gate?code=${encodeURIComponent(visitor.invite.passphrase)}` },
        channels: ['in_app'],
      }).catch(() => {});
    }
    await this.audit.log({ action: confirm ? 'GUEST_IDENTITY_CONFIRMED' : 'GUEST_IDENTITY_DECLINED', entity: 'Visitor', entityId: visitorId, userId: actor.id, details: { guest: visitor.fullName, inviteId: visitor.inviteId } });
    return { id: updated.id, identityStatus: updated.identityStatus, status: updated.status };
  }

  /** Identity requests waiting for this host. */
  async pendingIdentity(actor: { id: string; role: string; orgId: string }) {
    const where: any = { identityStatus: 'PENDING' };
    if (actor.role === Role.ADMIN) where.invite = { organisationId: actor.orgId };
    else if (actor.role !== Role.SUPER_ADMIN && actor.role !== Role.GLOBAL_ADMIN) where.invite = { hostId: actor.id };
    const rows = await this.prisma.visitor.findMany({
      where,
      include: { invite: { select: { id: true, purpose: true, expectedAt: true, host: { select: { id: true, fullName: true } } } } },
      orderBy: { identityRequestedAt: 'asc' },
      take: 100,
    });
    return rows.map((v) => ({ id: v.id, fullName: v.fullName, gatePhotoPath: v.gatePhotoPath, identityStatus: v.identityStatus, identityRequestedAt: v.identityRequestedAt, invite: v.invite }));
  }

  async findMyInvites(hostId: string) {
    return this.prisma.invite.findMany({
      where: {
        OR: [
          { hostId },
          { visitors: { some: { transfers: { some: { OR: [{ fromHostId: hostId }, { toHostId: hostId }] } } } } },
        ],
      },
      include: {
        visitors: { include: { gateVisits: { include: { particulars: true, gate: { select: { id: true, name: true, sequence: true } } }, orderBy: { occurredAt: 'asc' } }, transfers: { orderBy: { createdAt: 'asc' } } } },
        host: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Powerful visitor / invite search. The query is split on whitespace and an invite matches
   * if ANY token appears (case-insensitive, partial) in its searchable text:
   *   description/purpose, Official/Personal, status, arrival mode (incl. "on foot"),
   *   expected guest names, host name, location name/address, and every visitor's name,
   *   phone, email, address, status, entry mode and gate.
   * Results are ranked by how many distinct tokens matched, then newest first, and paginated.
   * Runs in Postgres (ILIKE over one concatenated document per invite), so it scales with the
   * database rather than the browser. Scope matches the lists: admins → organisation,
   * everyone else → their own invites.
   */
  async search(user: { id: string; role: string; orgId: string }, rawQ: string, page = 1, pageSize = 30) {
    const tokens = [
      ...new Set(
        (rawQ || '')
          .toLowerCase()
          .split(/\s+/)
          .map((t) => t.trim().slice(0, 40))
          .filter(Boolean),
      ),
    ].slice(0, 8);
    const size = Math.min(100, Math.max(1, pageSize));
    const offset = (Math.max(1, page) - 1) * size;
    if (!tokens.length) return { tokens, total: 0, page, pageSize: size, results: [] };

    const esc = (t: string) => `%${t.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    const scope =
      user.role === Role.ADMIN
        ? Prisma.sql`i."organisationId" = ${user.orgId}`
        : Prisma.sql`i."hostId" = ${user.id}`;
    // Friendly words for enum values so people can type what they see on screen.
    const doc = Prisma.sql`lower(concat_ws(' ',
        i.purpose,
        i.category::text,
        CASE i.status::text
          WHEN 'ACTIVE' THEN 'active live' WHEN 'USED' THEN 'used registered'
          WHEN 'EXPIRED' THEN 'expired' WHEN 'REVOKED' THEN 'cancelled revoked' WHEN 'OFFLINE_PENDING' THEN 'pending walk-in walkin offline'
          WHEN 'AWAITING_APPROVAL' THEN 'pending awaiting approval' ELSE i.status::text END,
        CASE i."expectedMode"::text WHEN 'PEDESTRIAN' THEN 'on foot walking' ELSE i."expectedMode"::text END,
        array_to_string(i."guestNames", ' '),
        h."fullName",
        l.name, l.address,
        (SELECT string_agg(concat_ws(' ', v."fullName", v.phone, v.email, v.address,
            CASE v.status::text WHEN 'ARRIVED' THEN 'arrived on site' WHEN 'EXITED' THEN 'exited left'
              WHEN 'DENIED' THEN 'denied declined' WHEN 'INVITED' THEN 'invited registered' ELSE v.status::text END,
            CASE v."entryMode"::text WHEN 'PEDESTRIAN' THEN 'on foot walking' ELSE v."entryMode"::text END,
            g.name), ' ')
           FROM "Visitor" v LEFT JOIN "Gate" g ON g.id = v."gateId" WHERE v."inviteId" = i.id)
      ))`;
    const score = Prisma.join(
      tokens.map((t) => Prisma.sql`(CASE WHEN d.doc LIKE ${esc(t)} ESCAPE '\' THEN 1 ELSE 0 END)`),
      ' + ',
    );
    const rows = await this.prisma.$queryRaw<Array<{ id: string; score: number; total: bigint }>>`
      WITH docs AS (
        SELECT i.id, i."createdAt", ${doc} AS doc
        FROM "Invite" i
        JOIN "User" h ON h.id = i."hostId"
        LEFT JOIN "Location" l ON l.id = i."locationId"
        WHERE ${scope}
      ), scored AS (
        SELECT d.id, d."createdAt", (${score})::int AS score FROM docs d
      )
      SELECT id, score, COUNT(*) OVER() AS total FROM scored
      WHERE score > 0
      ORDER BY score DESC, "createdAt" DESC
      LIMIT ${size} OFFSET ${offset}`;

    const total = rows.length ? Number(rows[0].total) : 0;
    const ids = rows.map((r) => r.id);
    const invites = ids.length
      ? await this.prisma.invite.findMany({
          where: { id: { in: ids } },
          include: { visitors: { include: { gateVisits: { include: { particulars: true, gate: { select: { id: true, name: true } } }, orderBy: { occurredAt: 'asc' } } } }, host: { select: { id: true, fullName: true, email: true } } },
        })
      : [];
    const byId = new Map(invites.map((i) => [i.id, i]));
    return {
      tokens,
      total,
      page,
      pageSize: size,
      results: rows
        .map((r) => (byId.has(r.id) ? { ...byId.get(r.id)!, matchScore: r.score } : null))
        .filter(Boolean),
    };
  }

  async findAll(orgId: string) {
    return this.prisma.invite.findMany({
      where: { organisationId: orgId },
      include: {
        visitors: { include: { gateVisits: { include: { particulars: true, gate: { select: { id: true, name: true, sequence: true } } }, orderBy: { occurredAt: 'asc' } }, transfers: { orderBy: { createdAt: 'asc' } } } },
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
    if (invite.status === InviteStatus.AWAITING_APPROVAL) {
      throw new BadRequestException('This invite is awaiting approval by an administrator');
    }

    if (invite.status === InviteStatus.REVOKED) {
      throw new BadRequestException('This visit has been cancelled by the host');
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
    const locationName = invite.locationId
      ? (await this.prisma.location.findUnique({ where: { id: invite.locationId }, select: { name: true } }))?.name
      : undefined;
    for (const v of invite.visitors || []) {
      if (!v.photoPath) continue;
      try {
        v.qrCodeData = renderCaptionedQrDataUrl(
          buildGateQrPayload(v.id, invite.passphrase, invite.token),
          gatePassCaption({
            fullName: v.fullName,
            visitorId: v.id,
            date: invite.expectedAt || v.createdAt,
            orgName: invite.organisation?.name,
            locationName,
          }),
        );
        (v as any).qrFileName = qrFileName(v.fullName, invite.expectedAt || v.createdAt);
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
    if (invite.cancelledAt) throw new BadRequestException('A cancelled invite cannot be revived');

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
      where: {
        id: inviteId,
        organisationId: orgId,
        OR: [
          { isOffline: true, status: InviteStatus.OFFLINE_PENDING },
          { status: InviteStatus.AWAITING_APPROVAL },
        ],
      },
    });
    if (!invite) throw new NotFoundException('Pending invite not found');

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
      action: invite.isOffline ? 'OFFLINE_INVITE_APPROVED' : 'INVITE_APPROVED',
      entity: 'Invite',
      entityId: inviteId,
      userId: adminId,
      details: { purpose: invite.purpose },
    });

    // Approved online invites now get their registration emails
    const emailsSent = await this.sendGuestInviteEmails(inviteId);
    await this.auditGuestNotified(inviteId, adminId, 'INVITE_LINK', emailsSent);
    await this.notifications.create({
      userId: invite.hostId,
      title: 'Invite approved',
      body: `Your invite for "${invite.purpose}" was approved${emailsSent.length ? ' and guests were emailed' : ''}.`,
      meta: { type: 'INVITE_APPROVED', inviteId },
    });

    return { ...updated, emailsSent };
  }


  async transferVisit(actor: any, visitorId: string, body: { toOrganisationId: string; toHostId?: string; comment: string }) {
    const comment = String(body.comment || '').trim();
    if (comment.length < 3) throw new BadRequestException('Add a short comment so the next host understands the transfer');
    const toOrganisationId = String(body.toOrganisationId || '').trim();
    if (!toOrganisationId) throw new BadRequestException('Choose the destination agency');
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: visitorId },
      include: { invite: true, transfers: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!visitor) throw new NotFoundException('Visitor not found');
    const last = visitor.transfers[0];
    const isOriginalHost = visitor.invite.hostId === actor.id;
    const isTransferredHost = last?.toHostId === actor.id || (last?.toOrganisationId === actor.orgId && ['ADMIN', 'STAFF', 'SUPER_ADMIN'].includes(actor.role));
    const isAdmin = actor.role === 'SUPER_ADMIN' || (actor.role === 'ADMIN' && (visitor.invite.organisationId === actor.orgId || last?.toOrganisationId === actor.orgId));
    if (!isOriginalHost && !isTransferredHost && !isAdmin) {
      throw new ForbiddenException('You can only transfer a visit you invited, or one transferred to you or your agency');
    }
    const dest = await this.prisma.organisation.findUnique({ where: { id: toOrganisationId }, select: { id: true, name: true } });
    if (!dest) throw new NotFoundException('Destination agency not found');
    let toHostId: string | null = body.toHostId ? String(body.toHostId) : null;
    if (toHostId) {
      const host = await this.prisma.user.findFirst({
        where: { id: toHostId, organisationId: toOrganisationId, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } },
        select: { id: true, fullName: true },
      });
      if (!host) throw new BadRequestException('Choose a host who belongs to the destination agency');
    }
    const fromOrganisationId = visitor.invite.organisationId;
    const fromHostId = visitor.invite.hostId;
    if (toOrganisationId === fromOrganisationId && (!toHostId || toHostId === fromHostId)) {
      throw new BadRequestException('Pick a different agency or a different host');
    }
    const data: any = { organisationId: toOrganisationId };
    if (toHostId) data.hostId = toHostId;
    if (toOrganisationId !== fromOrganisationId) data.locationId = null;
    await this.prisma.$transaction([
      this.prisma.visitTransfer.create({
        data: { visitorId, fromOrganisationId, toOrganisationId, fromHostId, toHostId, comment: comment.slice(0, 2000) },
      }),
      this.prisma.invite.update({ where: { id: visitor.inviteId }, data }),
    ]);
    if (toHostId) {
      await this.notifications.create({
        userId: toHostId,
        title: 'Visit transferred to you',
        body: `${visitor.fullName} was transferred to ${dest.name}. ${comment}`,
        meta: { type: 'VISIT_TRANSFER', visitorId, inviteId: visitor.inviteId },
        channels: ['in_app'],
      }).catch(() => {});
    }
    await this.audit.log({
      action: 'VISIT_TRANSFERRED',
      entity: 'Visitor',
      entityId: visitorId,
      userId: actor.id,
      details: { fromOrganisationId, toOrganisationId, comment },
    });
    return this.prisma.visitor.findUnique({
      where: { id: visitorId },
      include: {
        invite: { include: { host: { select: { id: true, fullName: true } }, organisation: { select: { id: true, name: true, code: true } } } },
        transfers: { orderBy: { createdAt: 'asc' } },
        gateVisits: { include: { particulars: true, gate: { select: { id: true, name: true, sequence: true } } }, orderBy: { occurredAt: 'asc' } },
      },
    });
  }

  async getPublicInviteInfo(token: string) {
    return this.getByToken(token);
  }
}
