import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailService } from '../mail/mail.service';
import { canManageContractors, canViewContractors, isPlatformRole, normalizeEmail, normalizePhone } from '../../common/utils/access';
import { buildContractorQrPayload, renderQrPng } from '../../common/utils/qr';
import { currentAttendanceDay } from '../../common/utils/attendance-day';

const SELECT = {
  id: true,
  token: true,
  qrToken: true,
  fullName: true,
  company: true,
  phone: true,
  email: true,
  photoPath: true,
  organisationId: true,
  validFrom: true,
  validThrough: true,
  createdById: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  organisation: { select: { id: true, name: true, code: true } },
} as const;

@Injectable()
export class ContractorsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private mail: MailService) {}

  private photoDir() {
    const dir = path.join(process.env.PHOTO_STORAGE_PATH || '/data/photos', 'contractors');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private longToken() {
    return randomBytes(32).toString('hex');
  }

  private qrToken() {
    return 'c_' + randomBytes(20).toString('hex');
  }

  private assertView(actor: any) {
    if (!canViewContractors(actor?.role)) throw new ForbiddenException('You cannot view contractors');
  }

  private assertManage(actor: any) {
    if (!canManageContractors(actor?.role)) throw new ForbiddenException('Only Super Admins and agency admins can manage contractors');
  }

  private orgScope(actor: any, organisationId?: string) {
    if (isPlatformRole(actor.role)) return organisationId || undefined;
    return actor.orgId;
  }

  private async minDays() {
    const row = await this.prisma.platformSettings.upsert({ where: { id: 'platform' }, create: { id: 'platform' }, update: {} });
    return Math.max(1, row.contractorMinDurationDays || 1);
  }

  private async assertDuration(from: Date, through: Date) {
    const min = await this.minDays();
    const span = (through.getTime() - from.getTime()) / 86400000;
    if (span < min - 0.001) throw new BadRequestException(`Contractor passes must be valid for at least ${min} day${min === 1 ? '' : 's'}`);
  }

  private scopeWhere(actor: any, organisationId?: string) {
    const orgId = this.orgScope(actor, organisationId);
    return orgId ? { organisationId: orgId } : {};
  }

  private canSee(actor: any, organisationId: string) {
    if (isPlatformRole(actor.role)) return true;
    return actor.orgId === organisationId;
  }

  async list(actor: any, q?: { search?: string; organisationId?: string; status?: string }) {
    this.assertView(actor);
    const where: any = { ...this.scopeWhere(actor, q?.organisationId) };
    if (q?.search) {
      const s = q.search.trim();
      where.OR = [
        { fullName: { contains: s, mode: 'insensitive' } },
        { company: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { phone: { contains: s, mode: 'insensitive' } },
      ];
    }
    const now = new Date();
    if (q?.status === 'active') where.isActive = true, where.validThrough = { gte: now };
    if (q?.status === 'expired') where.validThrough = { lt: now };
    if (q?.status === 'inactive') where.isActive = false;
    const rows = await this.prisma.contractor.findMany({
      where,
      select: { ...SELECT, visits: { orderBy: { arrivedAt: 'desc' }, take: 1, select: { id: true, arrivedAt: true, exitedAt: true, destination: true } } },
      orderBy: { createdAt: 'desc' },
      take: 400,
    });
    const minDays = await this.minDays();
    return { rows: rows.map((r) => this.present(r, now)), minDays };
  }

  async getByToken(actor: any, token: string) {
    this.assertView(actor);
    const row = await this.prisma.contractor.findFirst({
      where: { OR: [{ token }, { qrToken: token }, { id: token }] },
      select: SELECT,
    });
    if (!row || !this.canSee(actor, row.organisationId)) throw new NotFoundException('Contractor not found');
    const visits = await this.prisma.contractorVisit.findMany({
      where: { contractorId: row.id },
      orderBy: { arrivedAt: 'desc' },
      take: 200,
    });
    const gates = await this.gateMap(visits.map((v) => v.gateId));
    const officers = await this.officerMap(visits.map((v) => v.officerId));
    return {
      ...this.present(row),
      history: visits.map((v) => ({
        ...v,
        gate: v.gateId ? gates.get(v.gateId) || null : null,
        officer: v.officerId ? officers.get(v.officerId) || null : null,
      })),
      qrPayload: buildContractorQrPayload(row.qrToken),
      minDays: await this.minDays(),
    };
  }

  async create(actor: any, body: any) {
    this.assertManage(actor);
    const fullName = String(body.fullName || '').trim();
    if (fullName.length < 2) throw new BadRequestException('Name is required');
    const organisationId = isPlatformRole(actor.role) ? String(body.organisationId || '') : actor.orgId;
    if (!organisationId) throw new BadRequestException('Choose an agency');
    const org = await this.prisma.organisation.findUnique({ where: { id: organisationId }, select: { id: true, name: true } });
    if (!org) throw new NotFoundException('Agency not found');
    const validFrom = body.validFrom ? new Date(body.validFrom) : new Date();
    const validThrough = body.validThrough ? new Date(body.validThrough) : new Date(validFrom.getTime() + (await this.minDays()) * 86400000);
    if (isNaN(+validFrom) || isNaN(+validThrough)) throw new BadRequestException('Valid from / through dates are invalid');
    await this.assertDuration(validFrom, validThrough);
    const row = await this.prisma.contractor.create({
      data: {
        token: this.longToken(),
        qrToken: this.qrToken(),
        fullName,
        company: body.company ? String(body.company).trim().slice(0, 160) : null,
        phone: normalizePhone(body.phone),
        email: normalizeEmail(body.email),
        organisationId,
        validFrom,
        validThrough,
        createdById: actor.id,
      },
      select: SELECT,
    });
    await this.audit.log({ action: 'CONTRACTOR_CREATED', entity: 'Contractor', entityId: row.id, userId: actor.id, details: { organisationId, fullName } });
    if (row.email) await this.sendCard(row).catch(() => {});
    return { ...this.present(row), qrPayload: buildContractorQrPayload(row.qrToken), emailed: Boolean(row.email) };
  }

  async update(actor: any, id: string, body: any) {
    this.assertManage(actor);
    const row = await this.prisma.contractor.findUnique({ where: { id }, select: SELECT });
    if (!row || !this.canSee(actor, row.organisationId)) throw new NotFoundException('Contractor not found');
    if (!isPlatformRole(actor.role) && row.organisationId !== actor.orgId) throw new ForbiddenException();
    const data: any = {};
    if (body.fullName !== undefined) {
      const n = String(body.fullName).trim();
      if (n.length < 2) throw new BadRequestException('Name is required');
      data.fullName = n;
    }
    if (body.company !== undefined) data.company = body.company ? String(body.company).trim().slice(0, 160) : null;
    if (body.phone !== undefined) data.phone = normalizePhone(body.phone);
    if (body.email !== undefined) data.email = normalizeEmail(body.email);
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.validFrom !== undefined || body.validThrough !== undefined) {
      const from = body.validFrom ? new Date(body.validFrom) : row.validFrom;
      const through = body.validThrough ? new Date(body.validThrough) : row.validThrough;
      if (isNaN(+from) || isNaN(+through)) throw new BadRequestException('Valid from / through dates are invalid');
      await this.assertDuration(from, through);
      data.validFrom = from;
      data.validThrough = through;
    }
    const updated = await this.prisma.contractor.update({ where: { id }, data, select: SELECT });
    await this.audit.log({ action: 'CONTRACTOR_UPDATED', entity: 'Contractor', entityId: id, userId: actor.id, details: data });
    return this.present(updated);
  }

  async renew(actor: any, id: string, body: any) {
    this.assertManage(actor);
    const row = await this.prisma.contractor.findUnique({ where: { id }, select: SELECT });
    if (!row || !this.canSee(actor, row.organisationId)) throw new NotFoundException('Contractor not found');
    const min = await this.minDays();
    const base = new Date(Math.max(Date.now(), row.validThrough.getTime()));
    const validFrom = row.validThrough < new Date() ? new Date() : row.validFrom;
    const validThrough = body.validThrough ? new Date(body.validThrough) : new Date(base.getTime() + min * 86400000);
    if (isNaN(+validThrough)) throw new BadRequestException('Renewal date is invalid');
    await this.assertDuration(validFrom, validThrough);
    const updated = await this.prisma.contractor.update({
      where: { id },
      data: { validFrom, validThrough, isActive: true },
      select: SELECT,
    });
    await this.audit.log({ action: 'CONTRACTOR_RENEWED', entity: 'Contractor', entityId: id, userId: actor.id, details: { validThrough } });
    if (updated.email) await this.sendCard(updated).catch(() => {});
    return this.present(updated);
  }

  async uploadPhoto(actor: any, id: string, file: Express.Multer.File) {
    this.assertManage(actor);
    const row = await this.prisma.contractor.findUnique({ where: { id }, select: SELECT });
    if (!row || !this.canSee(actor, row.organisationId)) throw new NotFoundException('Contractor not found');
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
    const filename = `${id.slice(0, 8)}-${uuidv4()}${ext}`;
    fs.writeFileSync(path.join(this.photoDir(), filename), file.buffer);
    const updated = await this.prisma.contractor.update({ where: { id }, data: { photoPath: filename }, select: SELECT });
    return this.present(updated);
  }

  getPhotoPath(filename: string) {
    const filepath = path.join(this.photoDir(), path.basename(filename));
    if (!fs.existsSync(filepath)) throw new NotFoundException('Photo not found');
    return filepath;
  }

  async reprint(actor: any, id: string, sendEmail = false) {
    this.assertView(actor);
    const row = await this.prisma.contractor.findUnique({ where: { id }, select: SELECT });
    if (!row || !this.canSee(actor, row.organisationId)) throw new NotFoundException('Contractor not found');
    let emailed = false;
    if (sendEmail && row.email) {
      await this.sendCard(row);
      emailed = true;
    }
    await this.audit.log({ action: 'CONTRACTOR_CARD_REPRINT', entity: 'Contractor', entityId: id, userId: actor.id, details: { emailed } });
    return { ...this.present(row), qrPayload: buildContractorQrPayload(row.qrToken), emailed };
  }

  async qrPng(actor: any, id: string) {
    this.assertView(actor);
    const row = await this.prisma.contractor.findUnique({ where: { id }, select: { qrToken: true, organisationId: true, fullName: true } });
    if (!row || !this.canSee(actor, row.organisationId)) throw new NotFoundException('Contractor not found');
    const png = await renderQrPng(buildContractorQrPayload(row.qrToken));
    return { png, filename: `contractor-${row.fullName.replace(/\s+/g, '-').toLowerCase()}.png` };
  }

  async history(actor: any, id: string) {
    const data = await this.getByToken(actor, id);
    return data;
  }

  async checkIn(actor: any, input: { token?: string; contractorId?: string; destination: string; gateId?: string; notes?: string }) {
    if (!['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN'].includes(actor.role)) throw new ForbiddenException('Only gate officers can check contractors in');
    const destination = String(input.destination || '').trim();
    if (!destination) throw new BadRequestException('Enter where the contractor is headed');
    const row = await this.findForScan(input.token || input.contractorId || '');
    if (!row) throw new NotFoundException('Contractor not found');
    if (!isPlatformRole(actor.role) && row.organisationId !== actor.orgId) throw new NotFoundException('Contractor not found');
    this.assertValid(row);
    const day = currentAttendanceDay();
    const open = await this.prisma.contractorVisit.findFirst({
      where: { contractorId: row.id, day, exitedAt: null },
      orderBy: { arrivedAt: 'desc' },
    });
    if (open) throw new BadRequestException('This contractor is already checked in. Record their exit first.');
    const visit = await this.prisma.contractorVisit.create({
      data: {
        contractorId: row.id,
        organisationId: row.organisationId,
        destination: destination.slice(0, 240),
        gateId: input.gateId || null,
        officerId: actor.id,
        day,
        notes: input.notes ? String(input.notes).slice(0, 1000) : null,
      },
    });
    await this.audit.log({ action: 'CONTRACTOR_CHECKIN', entity: 'Contractor', entityId: row.id, userId: actor.id, details: { destination, visitId: visit.id } });
    return { kind: 'contractor', contractor: this.present(row), visit };
  }

  async checkOut(actor: any, input: { token?: string; contractorId?: string; visitId?: string }) {
    if (!['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN'].includes(actor.role)) throw new ForbiddenException('Only gate officers can check contractors out');
    const row = await this.findForScan(input.token || input.contractorId || '');
    if (!row) throw new NotFoundException('Contractor not found');
    if (!isPlatformRole(actor.role) && row.organisationId !== actor.orgId) throw new NotFoundException('Contractor not found');
    const visit = input.visitId
      ? await this.prisma.contractorVisit.findUnique({ where: { id: input.visitId } })
      : await this.prisma.contractorVisit.findFirst({ where: { contractorId: row.id, exitedAt: null }, orderBy: { arrivedAt: 'desc' } });
    if (!visit || visit.contractorId !== row.id) throw new BadRequestException('No open contractor visit to close');
    const updated = await this.prisma.contractorVisit.update({ where: { id: visit.id }, data: { exitedAt: new Date() } });
    await this.audit.log({ action: 'CONTRACTOR_CHECKOUT', entity: 'Contractor', entityId: row.id, userId: actor.id, details: { visitId: visit.id } });
    return { kind: 'contractor', contractor: this.present(row), visit: updated };
  }

  async lookup(token: string, actor?: any) {
    const row = await this.findForScan(token);
    if (!row) return null;
    if (actor && !isPlatformRole(actor.role) && actor.role !== 'GLOBAL_ADMIN' && row.organisationId !== actor.orgId) return null;
    const open = await this.prisma.contractorVisit.findFirst({
      where: { contractorId: row.id, exitedAt: null },
      orderBy: { arrivedAt: 'desc' },
    });
    return {
      kind: 'contractor' as const,
      contractor: this.present(row),
      openVisit: open,
      qrPayload: buildContractorQrPayload(row.qrToken),
    };
  }

  private async findForScan(raw: string) {
    const token = String(raw || '').trim();
    if (!token) return null;
    return this.prisma.contractor.findFirst({
      where: { OR: [{ qrToken: token }, { token }, { id: token }] },
      select: SELECT,
    });
  }

  private assertValid(row: { isActive: boolean; validFrom: Date; validThrough: Date }) {
    const now = new Date();
    if (!row.isActive) throw new BadRequestException('This contractor pass has been deactivated');
    if (now < row.validFrom) throw new BadRequestException('This contractor pass is not valid yet');
    if (now > row.validThrough) throw new BadRequestException('This contractor pass has expired. An administrator can renew it.');
  }

  private present(row: any, now = new Date()) {
    const expired = row.validThrough < now;
    const upcoming = row.validFrom > now;
    return {
      ...row,
      expired,
      upcoming,
      status: !row.isActive ? 'inactive' : expired ? 'expired' : upcoming ? 'upcoming' : 'valid',
    };
  }

  private async sendCard(row: any) {
    if (!row.email) return;
    const qrPng = await renderQrPng(buildContractorQrPayload(row.qrToken));
    let photoPng: Buffer | null = null;
    if (row.photoPath) {
      const fp = path.join(this.photoDir(), path.basename(row.photoPath));
      if (fs.existsSync(fp)) photoPng = fs.readFileSync(fp);
    }
    await this.mail.sendContractorCardEmail({
      to: row.email,
      fullName: row.fullName,
      company: row.company,
      orgName: row.organisation?.name,
      organisationId: row.organisationId,
      validFrom: row.validFrom.toISOString(),
      validThrough: row.validThrough.toISOString(),
      qrPng,
      photoPng,
    });
  }

  private async gateMap(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter(Boolean))] as string[];
    if (!unique.length) return new Map();
    const rows = await this.prisma.gate.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(rows.map((g) => [g.id, g]));
  }

  private async officerMap(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter(Boolean))] as string[];
    if (!unique.length) return new Map();
    const rows = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, fullName: true } });
    return new Map(rows.map((u) => [u.id, u]));
  }

  async agencies(actor: any) {
    if (!actor?.id) throw new ForbiddenException();
    return this.prisma.organisation.findMany({
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  async hosts(actor: any, organisationId: string) {
    if (!actor?.id) throw new ForbiddenException();
    if (!organisationId) throw new BadRequestException('Agency is required');
    return this.prisma.user.findMany({
      where: { organisationId, isActive: true, role: { in: ['STAFF', 'ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true, fullName: true, email: true, role: true, portfolio: true },
      orderBy: { fullName: 'asc' },
      take: 400,
    });
  }
}
