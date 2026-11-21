import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GatePassProtocol, VisitStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { HostNotifierService } from '../notifications/host-notifier.service';
import { buildGateQrPayload, QR_RENDER_OPTIONS } from '../../common/utils/qr';
import { linkSameDayVisits } from '../../common/utils/visitor-pass';
import { attendanceTimeZone, startOfNextLocalDay } from '../../common/utils/attendance-day';

/** CR80 ID-1 card: 85.6 x 54 mm in PDF points (1 mm = 72 / 25.4 pt). */
export const CR80_PT = { width: (85.6 * 72) / 25.4, height: (54 * 72) / 25.4 };

const OPERATOR_ROLES = ['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN', 'ADMIN'];
const GLOBAL_ROLES = ['SUPER_ADMIN', 'GLOBAL_GATE'];
const PROTOCOLS: GatePassProtocol[] = ['PLAIN_TAGS', 'PRINTED_PASS', 'NONE'];
export const PROTOCOL_LABEL: Record<GatePassProtocol, string> = {
  PLAIN_TAGS: 'Option 1 · Plain tags at each gate',
  PRINTED_PASS: 'Option 2 · Printed pass from Gate 1',
  NONE: 'Option 3 · No cards',
};

type PassCard = {
  visitorId: string;
  fullName: string;
  agency: string;
  agencyColor: string;
  logoPath: string | null;
  logoUrl: string | null;
  photoPath: string | null;
  photoFile: string | null;
  hostName: string;
  subline: string;
  destination: string;
  validUntil: string;
  validUntilLabel: string;
  passphrase: string;
  qrPayload: string;
};

@Injectable()
export class GatePassService {
  constructor(private prisma: PrismaService, private audit: AuditService, private hostEvents: HostNotifierService) {}

  // ---------------------------------------------------------------- protocol
  async protocol(): Promise<GatePassProtocol> {
    const row = await this.prisma.platformSettings.upsert({ where: { id: 'platform' }, create: { id: 'platform' }, update: {}, select: { gatePassProtocol: true } });
    return row.gatePassProtocol;
  }

  async setProtocol(actor: any, value: string) {
    if (actor?.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only the Super Admin can change the gate pass protocol');
    const next = String(value || '').toUpperCase() as GatePassProtocol;
    if (!PROTOCOLS.includes(next)) throw new BadRequestException('Choose PLAIN_TAGS, PRINTED_PASS or NONE');
    const before = await this.protocol();
    await this.prisma.platformSettings.update({ where: { id: 'platform' }, data: { gatePassProtocol: next } });
    const outstanding = await this.prisma.gatePassItem.count({ where: { status: 'ISSUED' } });
    await this.audit.log({ action: 'GATE_PASS_PROTOCOL_CHANGED', entity: 'PlatformSettings', entityId: 'platform', userId: actor.id, details: { from: before, to: next, outstandingItems: outstanding } });
    return { protocol: next, label: PROTOCOL_LABEL[next], previous: before, outstanding };
  }

  async summary() {
    const protocol = await this.protocol();
    return { protocol, label: PROTOCOL_LABEL[protocol] };
  }

  // ---------------------------------------------------------------- access
  private async loadVisitor(visitorId: string) {
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: visitorId },
      include: {
        invite: {
          include: {
            host: { select: { id: true, fullName: true, portfolio: true } },
            organisation: { select: { id: true, name: true, logoUrl: true, primaryColor: true, shortName: true } },
          },
        },
      },
    });
    if (!visitor) throw new NotFoundException('Guest not found');
    return visitor;
  }

  private async loadGate(gateId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId }, include: { location: true, assignments: { select: { userId: true } } } });
    if (!gate) throw new NotFoundException('Gate not found');
    return gate;
  }

  /** Same people who may record a checkpoint at this gate may issue / collect its tags and passes. */
  private assertOperator(actor: any, visitor: any, gate: any) {
    if (actor?.role === 'GLOBAL_ADMIN') throw new ForbiddenException('Super Admin II accounts provide oversight, not gate operations');
    if (!OPERATOR_ROLES.includes(actor?.role)) throw new ForbiddenException('Only gate officers can issue or collect tags and passes');
    const global = GLOBAL_ROLES.includes(actor.role);
    if (!global && visitor.invite.organisationId !== actor.orgId) throw new NotFoundException('Guest not found');
    if (gate) {
      if (gate.location.organisationId !== visitor.invite.organisationId) throw new BadRequestException('This gate is not on the guest’s route');
      if (visitor.invite.locationId && gate.locationId !== visitor.invite.locationId) throw new BadRequestException('This gate is outside the guest’s destination');
      if (actor.role === 'GATE' && !gate.assignments.some((a: any) => a.userId === actor.id)) throw new ForbiddenException('You are not assigned to this checkpoint');
    }
  }

  /**
   * Gate 1 of a guest's route.
   * 1. The invite names a site → the first gate of that site.
   * 2. No site on the invite (agencies with several sites): follow the guest's own route —
   *    the site of their first recorded checkpoint, else the site of a pass already issued,
   *    else the site the officer works at (hint gate, or the officer's own assigned gate 1).
   * 3. Nothing known yet → the agency's oldest site, then its lowest sequence.
   */
  async firstGateFor(
    visitor: { id?: string; invite: { organisationId: string; locationId?: string | null } },
    hint?: { gateId?: string | null; actor?: any },
  ) {
    const include = { location: true, assignments: { select: { userId: true } } };
    const order: any = [{ sequence: 'asc' }, { createdAt: 'asc' }];
    const firstOf = (locationId: string) => this.prisma.gate.findFirst({ where: { isActive: true, locationId }, orderBy: order, include });
    const orgId = visitor.invite.organisationId;
    if (visitor.invite.locationId) return firstOf(visitor.invite.locationId);

    const siteCount = await this.prisma.location.count({ where: { organisationId: orgId, gates: { some: { isActive: true } } } });
    if (siteCount > 1) {
      if (visitor.id) {
        const gv = await this.prisma.gateVisit.findFirst({
          where: { visitorId: visitor.id, gate: { location: { organisationId: orgId } } },
          orderBy: { occurredAt: 'asc' },
          select: { gate: { select: { locationId: true } } },
        });
        if (gv) return firstOf(gv.gate.locationId);
        const item = await this.prisma.gatePassItem.findFirst({
          where: { visitorId: visitor.id, gate: { location: { organisationId: orgId } } },
          orderBy: { issuedAt: 'asc' },
          select: { gate: { select: { locationId: true } } },
        });
        if (item) return firstOf(item.gate.locationId);
      }
      if (hint?.gateId) {
        const g = await this.prisma.gate.findFirst({ where: { id: hint.gateId, location: { organisationId: orgId } }, select: { locationId: true } });
        if (g) return firstOf(g.locationId);
      }
      if (hint?.actor?.role === 'GATE' && hint.actor.id) {
        const mine = await this.prisma.gate.findMany({
          where: { isActive: true, location: { organisationId: orgId }, assignments: { some: { userId: hint.actor.id } } },
          select: { locationId: true },
        });
        const sites = Array.from(new Set(mine.map((g) => g.locationId)));
        if (sites.length === 1) return firstOf(sites[0]);
      }
    }
    return this.prisma.gate.findFirst({
      where: { isActive: true, location: { organisationId: orgId } },
      orderBy: [{ location: { createdAt: 'asc' } }, ...order],
      include,
    });
  }

  /** Printed pass: a place (the chip on the card), not the host — the host has its own line. */
  passDestination(visitor: any, locationName?: string | null) {
    return locationName || visitor.invite?.organisation?.name || '';
  }

  defaultDestination(visitor: any, locationName?: string | null) {
    const host = visitor.invite?.host;
    return [host?.fullName, host?.portfolio, locationName].filter(Boolean).join(' · ') || visitor.invite?.purpose || '';
  }

  // ---------------------------------------------------------------- items
  async itemsForVisitors(visitorIds: string[]) {
    if (!visitorIds.length) return new Map<string, any[]>();
    const rows = await this.prisma.gatePassItem.findMany({
      where: { visitorId: { in: visitorIds } },
      orderBy: { issuedAt: 'asc' },
      include: { gate: { select: { id: true, name: true, sequence: true, locationId: true } } },
    });
    const userIds = [...new Set(rows.flatMap((r) => [r.issuedById, r.closedById]).filter(Boolean) as string[])];
    const users = userIds.length ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }) : [];
    const name = new Map(users.map((u) => [u.id, u.fullName]));
    const out = new Map<string, any[]>();
    for (const r of rows) {
      const list = out.get(r.visitorId) || [];
      list.push({ ...r, issuedByName: name.get(r.issuedById) || null, closedByName: r.closedById ? name.get(r.closedById) || null : null });
      out.set(r.visitorId, list);
    }
    return out;
  }

  /** Exit at a gate is blocked while a tag / pass issued there is still out (any protocol). */
  async assertNoOpenItems(visitorId: string, gateId?: string | null) {
    const open = await this.prisma.gatePassItem.findMany({
      where: { visitorId, status: 'ISSUED', ...(gateId ? { gateId } : {}) },
      include: { gate: { select: { name: true } } },
    });
    if (!open.length) return;
    const first = open[0];
    const what = first.kind === 'PASS' ? 'printed pass' : `tag${first.tagNumber ? ` ${first.tagNumber}` : ''}`;
    throw new BadRequestException(`Collect the ${what} issued at ${first.gate?.name || 'this gate'} first — mark it returned or lost before exit.`);
  }

  async hasOpenItems(visitorId: string, gateId?: string | null) {
    return (await this.prisma.gatePassItem.count({ where: { visitorId, status: 'ISSUED', ...(gateId ? { gateId } : {}) } })) > 0;
  }

  async issue(actor: any, body: { visitorId?: string; gateId?: string; tagNumber?: string; destination?: string }) {
    const protocol = await this.protocol();
    if (protocol === 'NONE') throw new BadRequestException('No tags or passes are issued under the current gate pass protocol (Option 3)');
    const kind = protocol === 'PLAIN_TAGS' ? 'TAG' : 'PASS';
    const visitor = await this.loadVisitor(String(body.visitorId || ''));
    let gate: any = body.gateId ? await this.loadGate(String(body.gateId)) : null;
    if (kind === 'PASS' && !gate) gate = await this.firstGateFor(visitor, { actor });
    if (!gate) throw new BadRequestException('Choose the checkpoint first');
    this.assertOperator(actor, visitor, gate);
    this.assertOpenVisit(visitor);
    if (kind === 'PASS' && !visitor.photoPath) throw new BadRequestException('Capture or confirm the guest photo before printing a pass');
    const tagNumber = body.tagNumber ? String(body.tagNumber).trim().slice(0, 60) : null;
    const destination = body.destination !== undefined ? String(body.destination || '').trim().slice(0, 300) || null : undefined;
    const existing = await this.prisma.gatePassItem.findFirst({ where: { visitorId: visitor.id, gateId: gate.id, kind, status: 'ISSUED' } });
    if (existing) {
      const updated = await this.prisma.gatePassItem.update({
        where: { id: existing.id },
        data: { ...(tagNumber !== null ? { tagNumber } : {}), ...(destination !== undefined ? { destination } : {}) },
      });
      return updated;
    }
    const lastEntry = await this.prisma.gateVisit.findFirst({ where: { visitorId: visitor.id, gateId: gate.id }, orderBy: { occurredAt: 'desc' }, select: { id: true } });
    const item = await this.prisma.gatePassItem.create({
      data: {
        visitorId: visitor.id,
        gateId: gate.id,
        gateVisitId: lastEntry?.id || null,
        kind,
        tagNumber,
        destination: destination ?? (kind === 'PASS' ? this.passDestination(visitor, gate.location?.name) : null),
        issuedById: actor.id,
      },
    });
    await this.audit.log({ action: kind === 'TAG' ? 'TAG_ISSUED' : 'PASS_ISSUED', entity: 'Visitor', entityId: visitor.id, userId: actor.id, details: { itemId: item.id, gateId: gate.id, gateName: gate.name, tagNumber, destination: item.destination, guest: visitor.fullName } });
    await this.hostEvents.visitorEvent(visitor.id, { type: `${kind}_ISSUED`, title: kind === 'TAG' ? 'Visitor tag issued' : 'Visitor pass issued', body: `${visitor.fullName} was given a ${kind === 'TAG' ? 'tag' : 'pass'}${tagNumber ? ` (${tagNumber})` : ''} at ${gate.name}.`, meta: { gateId: gate.id, itemId: item.id } });
    return item;
  }

  async close(actor: any, id: string, body: { status?: string; reason?: string }) {
    const item = await this.prisma.gatePassItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Tag or pass not found');
    const status = String(body.status || '').toUpperCase();
    if (!['RETURNED', 'LOST'].includes(status)) throw new BadRequestException('Mark the item RETURNED or LOST');
    const reason = String(body.reason || '').trim();
    if (status === 'LOST' && reason.length < 3) throw new BadRequestException('Give a reason for the lost item');
    if (item.status !== 'ISSUED') throw new BadRequestException('This item is already closed');
    const visitor = await this.loadVisitor(item.visitorId);
    const gate = await this.loadGate(item.gateId);
    this.assertOperator(actor, visitor, gate);
    const updated = await this.prisma.gatePassItem.update({
      where: { id },
      data: { status, lostReason: status === 'LOST' ? reason.slice(0, 500) : null, closedById: actor.id, closedAt: new Date() },
    });
    await this.audit.log({ action: `${item.kind}_${status}`, entity: 'Visitor', entityId: item.visitorId, userId: actor.id, details: { itemId: id, gateId: item.gateId, gateName: gate.name, tagNumber: item.tagNumber, reason: status === 'LOST' ? reason : undefined, guest: visitor.fullName } });
    const word = item.kind === 'TAG' ? 'tag' : 'pass';
    await this.hostEvents.visitorEvent(item.visitorId, {
      type: `${item.kind}_${status}`,
      title: status === 'LOST' ? `Visitor ${word} reported lost` : `Visitor ${word} returned`,
      body: status === 'LOST' ? `${visitor.fullName}'s ${word}${item.tagNumber ? ` (${item.tagNumber})` : ''} was reported lost at ${gate.name}: ${reason}` : `${visitor.fullName} returned the ${word}${item.tagNumber ? ` (${item.tagNumber})` : ''} at ${gate.name}.`,
      meta: { gateId: gate.id, itemId: id },
      email: status === 'LOST' ? 'now' : 'none',
    });
    return updated;
  }

  async outstanding(actor: any, gateId?: string) {
    if (actor?.role === 'GLOBAL_ADMIN' && !(actor.permissions || []).includes('gates.manage')) throw new ForbiddenException('Gate oversight permission is required');
    const where: any = { status: 'ISSUED' };
    if (gateId) where.gateId = gateId;
    if (!['SUPER_ADMIN', 'GLOBAL_GATE', 'GLOBAL_ADMIN'].includes(actor.role)) where.gate = { location: { organisationId: actor.orgId } };
    if (actor.role === 'GATE') where.gate = { ...(where.gate || {}), assignments: { some: { userId: actor.id } } };
    const rows = await this.prisma.gatePassItem.findMany({
      where,
      orderBy: { issuedAt: 'asc' },
      take: 500,
      include: {
        gate: { select: { id: true, name: true, sequence: true, location: { select: { name: true, organisation: { select: { name: true } } } } } },
        visitor: { select: { id: true, fullName: true, photoPath: true, status: true, phone: true, invite: { select: { passphrase: true, purpose: true, host: { select: { fullName: true } }, organisation: { select: { name: true } } } } } },
      },
    });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.issuedById))] } }, select: { id: true, fullName: true } });
    const name = new Map(users.map((u) => [u.id, u.fullName]));
    return {
      protocol: await this.protocol(),
      count: rows.length,
      tags: rows.filter((r) => r.kind === 'TAG').length,
      passes: rows.filter((r) => r.kind === 'PASS').length,
      items: rows.map((r) => ({ ...r, issuedByName: name.get(r.issuedById) || null })),
    };
  }

  private assertOpenVisit(visitor: any) {
    if (visitor.invite.cancelledAt || visitor.invite.status === 'REVOKED') {
      if (visitor.status !== VisitStatus.ARRIVED) throw new BadRequestException('This visit was cancelled by the host');
    }
    if (['EXITED', 'DENIED', 'CANCELLED'].includes(visitor.status)) throw new BadRequestException('This visit is already closed');
  }

  // ---------------------------------------------------------------- printed pass
  private validUntil(visitor: any) {
    const day = visitor.invite.expectedAt ? new Date(visitor.invite.expectedAt) : new Date();
    const end = new Date(startOfNextLocalDay(day).getTime() - 60_000);
    const label = new Intl.DateTimeFormat('en-GB', { timeZone: attendanceTimeZone(), day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(end);
    return { iso: end.toISOString(), label };
  }

  /** The guest's registration QR payload — the very same code, never a new one. */
  async registrationQrPayload(visitor: any) {
    const linked = await linkSameDayVisits(this.prisma, visitor.id);
    const canonicalId = linked.visitorIds[0] || visitor.id;
    return buildGateQrPayload(canonicalId, visitor.invite.passphrase, visitor.invite.token, visitor.passToken || linked.passToken);
  }

  /** pdfkit embeds JPEG and PNG only — sniff the bytes rather than trusting the file name. */
  private embeddable(file: string | null) {
    if (!file) return false;
    try {
      const fd = fs.openSync(file, 'r');
      const b = Buffer.alloc(8);
      fs.readSync(fd, b, 0, 8, 0);
      fs.closeSync(fd);
      return (b[0] === 0xff && b[1] === 0xd8) || b.toString('hex', 0, 8) === '89504e470d0a1a0a';
    } catch { return false; }
  }

  private photoFile(photoPath?: string | null) {
    if (!photoPath) return null;
    const file = path.join(process.env.PHOTO_STORAGE_PATH || '/data/photos', path.basename(photoPath));
    return fs.existsSync(file) ? file : null;
  }

  private logoFile(logoUrl?: string | null) {
    if (!logoUrl || !logoUrl.startsWith('/branding/logo/')) return null;
    const file = path.join(process.env.PHOTO_STORAGE_PATH || '/data/photos', 'logos', path.basename(logoUrl));
    return fs.existsSync(file) ? file : null;
  }

  private async cardFor(visitor: any, item: any | null, gateName?: string | null): Promise<PassCard> {
    const org = visitor.invite.organisation;
    const valid = this.validUntil(visitor);
    return {
      visitorId: visitor.id,
      fullName: visitor.fullName,
      agency: org?.name || 'Agency',
      agencyColor: /^#[0-9a-f]{6}$/i.test(org?.primaryColor || '') ? org.primaryColor : '#1e3a8a',
      logoPath: this.logoFile(org?.logoUrl),
      logoUrl: org?.logoUrl || null,
      photoPath: visitor.photoPath || null,
      photoFile: this.photoFile(visitor.photoPath),
      hostName: visitor.invite.host?.fullName || '',
      subline: visitor.invite.host?.portfolio || org?.name || '',
      destination: item?.destination || this.passDestination(visitor, gateName),
      validUntil: valid.iso,
      validUntilLabel: valid.label,
      passphrase: visitor.invite.passphrase,
      qrPayload: await this.registrationQrPayload(visitor),
    };
  }

  /** JSON for the on-screen pass preview (no item is issued by looking). */
  async preview(actor: any, visitorIds: string[]) {
    const ids = [...new Set((visitorIds || []).map(String))].slice(0, 100);
    if (!ids.length) throw new BadRequestException('Choose at least one guest');
    const out: any[] = [];
    for (const id of ids) {
      const visitor = await this.loadVisitor(id);
      const gate = await this.firstGateFor(visitor, { actor });
      this.assertOperator(actor, visitor, null);
      const item = gate ? await this.prisma.gatePassItem.findFirst({ where: { visitorId: id, gateId: gate.id, kind: 'PASS' }, orderBy: { issuedAt: 'desc' } }) : null;
      const card = await this.cardFor(visitor, item, gate?.location?.name);
      const { photoFile, logoPath, ...rest } = card;
      out.push({ ...rest, gateId: gate?.id || null, gateName: gate?.name || null, item, qrDataUrl: await QRCode.toDataURL(card.qrPayload, { ...QR_RENDER_OPTIONS, type: 'image/png' }), canPrint: !!visitor.photoPath && !['EXITED', 'DENIED', 'CANCELLED'].includes(visitor.status) });
    }
    return out;
  }

  /** Bulk / single pass PDF: one CR80 page per guest. Issues the PASS item at Gate 1 when missing. */
  async pdf(actor: any, body: { visitorIds?: string[]; mode?: string; destination?: string }) {
    const protocol = await this.protocol();
    if (protocol !== 'PRINTED_PASS') throw new BadRequestException('Printed passes are only used under Option 2 (printed pass)');
    const ids = [...new Set((body.visitorIds || []).map(String))].slice(0, 200);
    if (!ids.length) throw new BadRequestException('Choose at least one guest');
    const mode = body.mode === 'download' ? 'download' : 'print';
    const cards: PassCard[] = [];
    for (const id of ids) {
      const visitor = await this.loadVisitor(id);
      const gate = await this.firstGateFor(visitor, { actor });
      if (!gate) throw new BadRequestException(`${visitor.fullName} has no Gate 1 on their route`);
      this.assertOperator(actor, visitor, gate);
      this.assertOpenVisit(visitor);
      if (!visitor.photoPath) throw new BadRequestException(`${visitor.fullName} has no photo yet — capture it before printing a pass`);
      let item = await this.prisma.gatePassItem.findFirst({ where: { visitorId: id, gateId: gate.id, kind: 'PASS', status: 'ISSUED' } });
      if (!item) item = await this.issue(actor, { visitorId: id, gateId: gate.id, destination: ids.length === 1 ? body.destination : undefined });
      else if (ids.length === 1 && body.destination !== undefined) item = await this.issue(actor, { visitorId: id, gateId: gate.id, destination: body.destination });
      await this.prisma.gatePassItem.update({ where: { id: item.id }, data: { printCount: { increment: 1 }, lastPrintedAt: new Date() } });
      cards.push(await this.cardFor(visitor, item, gate.location?.name));
    }
    const buffer = await this.renderPdf(cards);
    await this.audit.log({ action: mode === 'download' ? 'PASS_DOWNLOADED' : 'PASS_PRINTED', entity: 'Visitor', entityId: ids.length === 1 ? ids[0] : undefined, userId: actor.id, details: { count: cards.length, visitorIds: ids, guests: cards.map((c) => c.fullName) } });
    return { buffer, filename: `vicit-pass${cards.length > 1 ? 'es' : ''}-${new Date().toISOString().slice(0, 10)}.pdf` };
  }

  /** Mix a hex colour with white (t = share of the colour, 0..1). */
  private tint(hex: string, t: number) {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c: number) => Math.round(255 - (255 - c) * t).toString(16).padStart(2, '0');
    return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
  }

  /**
   * v23 CR80 layout (85.6 × 54 mm, landscape): agency logo + name left and a large “Visitor” right,
   * thin rule; photo, name and portfolio on the left; a thin divider; Host / Destination chip /
   * Valid until on the right with the registration QR bottom-right; v22 footer kept.
   * The agency colour is used sparingly: corner swooshes, the rule, divider and chip tint.
   */
  private async renderPdf(cards: PassCard[]): Promise<Buffer> {
    const W = CR80_PT.width;
    const H = CR80_PT.height;
    const NAVY = '#0f1f3d';
    const MUTED = '#64748b';
    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, info: { Title: 'Vicit visitor pass', Author: 'Vicit', Creator: "CISTECH's Vicit 1.0.1" } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    for (const c of cards) {
      const accent = c.agencyColor;
      doc.addPage({ size: [W, H], margin: 0 });
      doc.rect(0, 0, W, H).fill('#ffffff');

      // Corner swooshes (agency colour, low intensity)
      doc.save();
      doc.path(`M ${W - 78} 0 C ${W - 46} 10 ${W - 18} 30 ${W} 58 L ${W} 0 Z`).fill(this.tint(accent, 0.07));
      doc.path(`M ${W - 46} 0 C ${W - 26} 8 ${W - 10} 20 ${W} 34 L ${W} 0 Z`).fill(this.tint(accent, 0.13));
      doc.path(`M 0 ${H - 52} C 18 ${H - 34} 40 ${H - 18} 74 ${H - 11} L 0 ${H - 11} Z`).fill(this.tint(accent, 0.07));
      doc.restore();

      // Header: logo + agency name (left), “Visitor” (right)
      let tx = 10;
      if (this.embeddable(c.logoPath)) {
        try { doc.image(c.logoPath as string, 10, 8, { fit: [20, 20], align: 'center', valign: 'center' }); tx = 34; } catch { /* unsupported logo */ }
      }
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.6).text(c.agency.toUpperCase(), tx, 10.5, { width: W - tx - 82, height: 9, lineBreak: false, ellipsis: true, characterSpacing: 0.3 });
      doc.fillColor(MUTED).font('Helvetica').fontSize(4.8).text('Visitor Access & Exit Control', tx, 20, { width: W - tx - 82, lineBreak: false });
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(19).text('Visitor', W - 86, 8.5, { width: 76, align: 'right', lineBreak: false });
      doc.save().lineWidth(0.6).strokeColor(this.tint(accent, 0.45)).moveTo(10, 34).lineTo(W - 10, 34).stroke().restore();

      // Left column: photo, name, portfolio
      const px = 10, py = 40, pw = 44, ph = 52;
      doc.save().roundedRect(px, py, pw, ph, 5).clip();
      let photoDone = false;
      if (this.embeddable(c.photoFile)) {
        try { doc.image(c.photoFile as string, px, py, { cover: [pw, ph], align: 'center', valign: 'center' }); photoDone = true; } catch { /* fall back */ }
      }
      if (!photoDone) {
        doc.rect(px, py, pw, ph).fill(this.tint(accent, 0.1));
        const initials = c.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(initials, px, py + ph / 2 - 8, { width: pw, align: 'center' });
      }
      doc.restore();
      doc.save().lineWidth(0.5).strokeColor('#d6dde8').roundedRect(px, py, pw, ph, 5).stroke().restore();
      const colW = 80;
      // Auto-fit long names (two lines max) before falling back to an ellipsis.
      let nameSize = 9.2;
      doc.font('Helvetica-Bold');
      while (nameSize > 6.6 && doc.fontSize(nameSize).heightOfString(c.fullName, { width: colW, lineGap: -0.5 }) > nameSize * 2.3) nameSize -= 0.4;
      doc.fillColor(NAVY).fontSize(nameSize).text(c.fullName, px, py + ph + 5, { width: colW, height: nameSize * 2.4, ellipsis: true, lineGap: -0.5 });
      const subY = Math.min(doc.y + 1.5, H - 24);
      // small building/briefcase glyph
      doc.save().fillColor(this.tint(accent, 0.75));
      doc.roundedRect(px, subY + 0.6, 5.2, 4.6, 0.6).fill();
      doc.rect(px + 1.7, subY - 0.4, 1.8, 1.2).fill();
      doc.restore();
      doc.fillColor(MUTED).font('Helvetica').fontSize(5.6).text(c.subline || c.agency, px + 7.5, subY, { width: colW - 7.5, height: 7, lineBreak: false, ellipsis: true });

      // Divider
      const dx = 96;
      doc.save().lineWidth(0.5).strokeColor(this.tint(accent, 0.35)).moveTo(dx, 40).lineTo(dx, H - 17).stroke().restore();

      // Right column: Host, Destination chip, Valid until; QR bottom-right
      const rx = dx + 8, rw = W - rx - 10;
      const label = (t: string, y: number) => doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(4.7).text(t.toUpperCase(), rx, y, { width: rw, characterSpacing: 0.5, lineBreak: false });
      label('Host', 40);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.4).text(c.hostName || '—', rx, 46, { width: rw, height: 9, lineBreak: false, ellipsis: true });
      label('Destination', 59);
      const dest = c.destination || '—';
      doc.font('Helvetica-Bold').fontSize(6.4);
      const chipW = Math.min(rw, doc.widthOfString(dest) + 17);
      doc.save().roundedRect(rx, 65, chipW, 11, 5.5).fill(this.tint(accent, 0.1)).restore();
      // building icon in the chip
      doc.save().fillColor(accent);
      doc.rect(rx + 4.5, 67.6, 4.4, 6).fill();
      doc.fillColor(this.tint(accent, 0.1));
      for (const [ox, oy] of [[5.4, 68.6], [7.2, 68.6], [5.4, 70.4], [7.2, 70.4]]) doc.rect(rx + ox, oy, 0.9, 0.9).fill();
      doc.restore();
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(6.4).text(dest, rx + 11.5, 68.2, { width: chipW - 14, lineBreak: false, ellipsis: true });
      const qrSize = 64;
      const qx = W - qrSize - 8, qy = H - 13 - qrSize - 6;
      label('Valid until', 83);
      const [vDate, vTime] = c.validUntilLabel.split(', ');
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7).text(vDate || c.validUntilLabel, rx, 89, { width: qx - rx - 4, lineBreak: false });
      if (vTime) doc.fillColor(MUTED).font('Helvetica').fontSize(6).text(vTime, rx, 98, { width: qx - rx - 4, lineBreak: false });
      const qr = await QRCode.toBuffer(c.qrPayload, { ...QR_RENDER_OPTIONS, type: 'png', margin: 2, color: { dark: '#0b1530', light: '#ffffff' } });
      doc.image(qr, qx, qy, { width: qrSize, height: qrSize });
      doc.fillColor(MUTED).font('Courier-Bold').fontSize(5.2).text(c.passphrase, rx, qy + qrSize - 6, { width: qx - rx - 4, lineBreak: false });

      // Footer (kept from v22)
      doc.rect(0, H - 11, W, 11).fill('#f3f5f9');
      doc.rect(0, H - 11, W, 0.6).fill(this.tint(accent, 0.3));
      doc.fillColor('#475569').font('Helvetica').fontSize(4.6).text('Return this pass at exit · Scan at every gate', 10, H - 7.4, { width: W / 2, lineBreak: false });
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(4.4).text("Powered by CISTECH's Vicit 1.0.1", W / 2, H - 7.4, { width: W / 2 - 10, align: 'right', lineBreak: false });
    }
    doc.end();
    return done;
  }
}
