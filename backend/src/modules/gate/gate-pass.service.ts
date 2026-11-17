import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GatePassProtocol, VisitStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
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
  destination: string;
  validUntil: string;
  validUntilLabel: string;
  passphrase: string;
  qrPayload: string;
};

@Injectable()
export class GatePassService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

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

  /** Gate 1 of a guest's route (lowest sequence on their location, or on their agency). */
  async firstGateFor(visitor: { invite: { organisationId: string; locationId?: string | null } }) {
    const where: any = { isActive: true };
    if (visitor.invite.locationId) where.locationId = visitor.invite.locationId;
    else where.location = { organisationId: visitor.invite.organisationId };
    return this.prisma.gate.findFirst({ where, orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }], include: { location: true, assignments: { select: { userId: true } } } });
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
    if (kind === 'PASS' && !gate) gate = await this.firstGateFor(visitor);
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
        destination: destination ?? (kind === 'PASS' ? this.defaultDestination(visitor, gate.location?.name) : null),
        issuedById: actor.id,
      },
    });
    await this.audit.log({ action: kind === 'TAG' ? 'TAG_ISSUED' : 'PASS_ISSUED', entity: 'Visitor', entityId: visitor.id, userId: actor.id, details: { itemId: item.id, gateId: gate.id, gateName: gate.name, tagNumber, destination: item.destination, guest: visitor.fullName } });
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
      destination: item?.destination || this.defaultDestination(visitor, gateName),
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
      const gate = await this.firstGateFor(visitor);
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
      const gate = await this.firstGateFor(visitor);
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

  private async renderPdf(cards: PassCard[]): Promise<Buffer> {
    const W = CR80_PT.width;
    const H = CR80_PT.height;
    const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false, info: { Title: 'Vicit visitor pass', Author: 'Vicit', Creator: "CISTECH's Vicit 1.0.1" } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
    for (const c of cards) {
      doc.addPage({ size: [W, H], margin: 0 });
      const band = 27;
      doc.rect(0, 0, W, H).fill('#ffffff');
      doc.rect(0, 0, W, band).fill(c.agencyColor);
      let textX = 8;
      if (this.embeddable(c.logoPath)) {
        try {
          doc.save().roundedRect(6, 4, 19, 19, 4).fill('#ffffff').restore();
          doc.image(c.logoPath as string, 7.5, 5.5, { fit: [16, 16], align: 'center', valign: 'center' });
          textX = 30;
        } catch { /* unsupported logo image */ }
      }
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5).text(c.agency, textX, 6.5, { width: W - textX - 62, height: 10, lineBreak: false, ellipsis: true });
      doc.font('Helvetica').fontSize(5).fillColor('#e2e8f0').text('Visitor Access & Exit Control', textX, 16, { width: W - textX - 62, lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(6).fillColor('#ffffff').text('VISITOR PASS', W - 60, 10.5, { width: 54, align: 'right', characterSpacing: 0.6 });

      // Photo
      const px = 7, py = band + 6, pw = 54, ph = 72;
      doc.save().roundedRect(px, py, pw, ph, 4).clip();
      let photoDone = false;
      if (this.embeddable(c.photoFile)) {
        try { doc.image(c.photoFile as string, px, py, { cover: [pw, ph], align: 'center', valign: 'center' }); photoDone = true; } catch { /* fall back */ }
      }
      if (!photoDone) {
        doc.rect(px, py, pw, ph).fill('#e2e8f0');
        const initials = c.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(16).text(initials, px, py + ph / 2 - 9, { width: pw, align: 'center' });
      }
      doc.restore();
      doc.save().lineWidth(0.6).strokeColor('#cbd5e1').roundedRect(px, py, pw, ph, 4).stroke().restore();

      // Details
      const qrSize = 80;
      const qx = W - qrSize - 6, qy = band + 4;
      const tx = px + pw + 6, tw = qx - tx - 4;
      let y = band + 5;
      doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5).text(c.fullName, tx, y, { width: tw, height: 21, ellipsis: true });
      y = doc.y + 2;
      const field = (label: string, value: string, h = 9) => {
        doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(4.6).text(label.toUpperCase(), tx, y, { width: tw, characterSpacing: 0.4 });
        doc.fillColor('#1e293b').font('Helvetica').fontSize(6).text(value || '—', tx, doc.y + 0.6, { width: tw, height: h, ellipsis: true });
        y = doc.y + 2.2;
      };
      field('Host', c.hostName);
      field('Destination', c.destination, 15);
      field('Valid until', c.validUntilLabel);

      // Registration QR (same code as on registration)
      const qr = await QRCode.toBuffer(c.qrPayload, { ...QR_RENDER_OPTIONS, type: 'png', margin: 2 });
      doc.image(qr, qx, qy, { width: qrSize, height: qrSize });
      doc.fillColor('#334155').font('Courier-Bold').fontSize(5.6).text(c.passphrase, qx - 4, qy + qrSize + 1.5, { width: qrSize + 8, align: 'center', lineBreak: false });

      // Footer
      doc.rect(0, H - 11, W, 11).fill('#f1f5f9');
      doc.fillColor('#475569').font('Helvetica').fontSize(4.6).text('Return this pass at exit · Scan at every gate', 7, H - 7.6, { width: W / 2, lineBreak: false });
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(4.4).text("Powered by CISTECH's Vicit 1.0.1", W / 2, H - 7.6, { width: W / 2 - 7, align: 'right', lineBreak: false });
    }
    doc.end();
    return done;
  }
}
