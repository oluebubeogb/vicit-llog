import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { generateNigerianPassword } from '../../common/utils/password-words';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const userSelect = { id: true, email: true, fullName: true, phone: true, role: true, isActive: true, mustChangePassword: true, organisationId: true, permissions: true, createdAt: true } as const;
const showTempInAdmin = () => (process.env.SHOW_TEMP_PASSWORDS_IN_ADMIN || 'false').toLowerCase() === 'true';
const GLOBAL_PERMISSIONS = ['agencies.view', 'agencies.create', 'agency_admins.create', 'people.view', 'people.create', 'gates.manage', 'visits.view', 'audit.view'];

@Injectable()
export class PlatformService {
  constructor(private prisma: PrismaService, private mail: MailService, private audit: AuditService) {}

  private assertPermission(actor: any, permission: string) {
    if (actor.role === Role.SUPER_ADMIN) return;
    if (actor.role !== Role.GLOBAL_ADMIN || !(actor.permissions || []).includes(permission)) throw new ForbiddenException('You do not have permission to perform this platform action');
  }


  async people(actor: any, page = 1, pageSize = 50) {
    this.assertPermission(actor, 'people.view');
    const take = Math.min(100, Math.max(1, pageSize));
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({ select: { ...userSelect, organisation: { select: { id: true, name: true, code: true } } }, orderBy: [{ organisationId: 'asc' }, { createdAt: 'desc' }], skip: (Math.max(1, page) - 1) * take, take }),
      this.prisma.user.count(),
    ]);
    return { rows, total, page: Math.max(1, page), pageSize: take, hasMore: Math.max(1, page) * take < total };
  }

  async platformInvites(actor: any, page = 1, pageSize = 30, query = '') {
    this.assertPermission(actor, 'visits.view');
    const take = Math.min(60, Math.max(1, pageSize));
    const q = String(query || '').trim();
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 6);
    const searchable = (term: string) => ({ OR: [
      { purpose: { contains: term, mode: 'insensitive' } },
      { guestNames: { has: term } },
      { host: { fullName: { contains: term, mode: 'insensitive' } } },
      { organisation: { name: { contains: term, mode: 'insensitive' } } },
      { visitors: { some: { fullName: { contains: term, mode: 'insensitive' } } } },
      { category: { equals: term.toUpperCase() as any } },
    ] });
    const where: any = terms.length ? { AND: terms.map(searchable) } : {};
    const [rows, total] = await Promise.all([
      this.prisma.invite.findMany({ where, include: {
        organisation: { select: { id: true, name: true, code: true, logoUrl: true } },
        host: { select: { id: true, fullName: true, email: true, avatarPath: true } },
        visitors: { select: { id: true, fullName: true, photoPath: true, status: true, enteredAt: true, exitedAt: true, deniedAt: true, deniedReason: true } },
      }, orderBy: { createdAt: 'desc' }, skip: (Math.max(1, page) - 1) * take, take }),
      this.prisma.invite.count({ where }),
    ]);
    return { rows, total, page: Math.max(1, page), pageSize: take, hasMore: Math.max(1, page) * take < total };
  }

  async platformInvite(actor: any, id: string) {
    this.assertPermission(actor, 'visits.view');
    const invite = await this.prisma.invite.findUnique({
      where: { id },
      include: {
        organisation: { select: { id: true, name: true, code: true, logoUrl: true } },
        host: { select: { id: true, fullName: true, email: true, phone: true, portfolio: true, role: true } },
        visitors: {
          include: {
            gateVisits: {
              include: {
                gate: { select: { id: true, name: true, location: { select: { name: true } } } },
                officer: { select: { id: true, fullName: true, role: true } },
                particulars: true,
              },
              orderBy: { occurredAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!invite) throw new NotFoundException('Invitation not found');
    const location = invite.locationId
      ? await this.prisma.location.findUnique({ where: { id: invite.locationId }, select: { id: true, name: true, address: true } })
      : null;
    const { token: _token, passphrase: _passphrase, ...rest } = invite;
    return {
      ...rest,
      location,
      visitors: rest.visitors.map(({ qrCodeData: _qr, ...visitor }) => visitor),
    };
  }

  async platformAudit(actor: any, page = 1, pageSize = 40) {
    this.assertPermission(actor, 'audit.view');
    const take = Math.min(80, Math.max(1, pageSize));
    const [rows, total] = await Promise.all([this.audit.findAll(take, undefined, (Math.max(1, page) - 1) * take), this.prisma.auditLog.count()]);
    const orgIds = rows.filter(r => (r.entity || '').toLowerCase() === 'organisation' && r.entityId).map(r => r.entityId as string);
    const orgs = orgIds.length ? await this.prisma.organisation.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, code: true, logoUrl: true } }) : [];
    const orgMap = new Map(orgs.map(o => [o.id, o]));
    return { rows: rows.map((r: any) => ({ ...r, related: r.related || ((r.entity || '').toLowerCase() === 'organisation' ? orgMap.get(r.entityId as string) || null : null) })), total, page: Math.max(1, page), pageSize: take, hasMore: Math.max(1, page) * take < total };
  }

  async agencies(actor: any) {
    this.assertPermission(actor, 'agencies.view');
    const organisations = await this.prisma.organisation.findMany({
      include: { _count: { select: { users: true, invites: true, locations: true } }, users: { where: { role: { in: [Role.ADMIN, Role.STAFF, Role.GATE] } }, select: { id: true, fullName: true, email: true, phone: true, role: true, isActive: true }, orderBy: [{ role: 'asc' }, { fullName: 'asc' }] } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(organisations.map(async (org) => {
      const [agencyAccounts, visitors, gates, activeVisitors] = await Promise.all([
        this.prisma.user.count({ where: { organisationId: org.id, role: { in: [Role.ADMIN, Role.STAFF, Role.GATE] } } }),
        this.prisma.visitor.count({ where: { invite: { organisationId: org.id } } }),
        this.prisma.gate.count({ where: { location: { OR: [{ organisationId: org.id }, { isShared: true }] } } }),
        this.prisma.visitor.count({ where: { invite: { organisationId: org.id }, status: 'ARRIVED' } }),
      ]);
      return { ...org, _count: { ...org._count, users: agencyAccounts, visitors, gates, activeVisitors } };
    }));
  }

  async createAgency(actor: any, input: any) {
    this.assertPermission(actor, 'agencies.create');
    const name = String(input.name || '').trim();
    const fullName = String(input.adminName || '').trim();
    const email = String(input.adminEmail || '').trim().toLowerCase();
    const phone = String(input.adminPhone || '').trim();
    if (!name || !fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Agency name and valid administrator name/email are required');
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('That administrator email is already registered');
    const base = (String(input.code || name).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || 'AGENCY');
    let code = base;
    for (let n = 1; await this.prisma.organisation.findUnique({ where: { code } }); n++) code = `${base.slice(0, 10 - String(n).length)}${n}`;
    const initialPassword = generateNigerianPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const logoUrl = input.logoUrl ? String(input.logoUrl).trim() : null;
    if (logoUrl && !/^https:\/\//i.test(logoUrl)) throw new BadRequestException('Agency logo URL must use HTTPS, or upload an image file');
    const agency = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organisation.create({ data: { name, code, logoUrl } });
      const admin = await tx.user.create({ data: { email, passwordHash, fullName, phone: phone || null, role: Role.ADMIN, portfolio: 'Agency Administration', organisationId: org.id, mustChangePassword: true } });
      await tx.location.create({ data: { name: 'Main Site', code: 'MAIN', organisationId: org.id } });
      return { org, admin };
    });
    const mailResult = await this.mail.sendWelcome(email, fullName, initialPassword, undefined, agency.org.id);
    await this.audit.log({ action: 'AGENCY_CREATED', entity: 'Organisation', entityId: agency.org.id, userId: actor.id, details: { name, code, adminId: agency.admin.id } });
    return { agency: agency.org, admin: { id: agency.admin.id, email, fullName, phone, role: agency.admin.role, mustChangePassword: true }, emailSent: !!mailResult?.ok, ...(showTempInAdmin() ? { initialPassword } : {}) };
  }


  async updateAgency(actor: any, agencyId: string, input: any) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Only the Super Admin can edit agencies');
    const current = await this.prisma.organisation.findUnique({ where: { id: agencyId } });
    if (!current) throw new NotFoundException('Agency not found');
    const data: any = {};
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) throw new BadRequestException('Agency name is required');
      data.name = name;
    }
    if (input.logoUrl !== undefined) {
      const logoUrl = String(input.logoUrl || '').trim();
      if (logoUrl && !/^https:\/\//i.test(logoUrl) && !logoUrl.startsWith('/branding/logo/')) throw new BadRequestException('Agency logo must use HTTPS or be an uploaded Vicit logo');
      data.logoUrl = logoUrl || null;
    }
    const updated = await this.prisma.organisation.update({ where: { id: agencyId }, data });
    await this.audit.log({ action: 'AGENCY_UPDATED', entity: 'Organisation', entityId: agencyId, userId: actor.id, details: data });
    return updated;
  }

  async updatePlatformPerson(actor: any, userId: string, input: any) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Only the Super Admin can edit platform and agency accounts');
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.role === Role.SUPER_ADMIN) throw new NotFoundException('Editable account not found');
    const fullName = input.fullName === undefined ? target.fullName : String(input.fullName).trim();
    const email = input.email === undefined ? target.email : String(input.email).trim().toLowerCase();
    const phone = input.phone === undefined ? target.phone : (String(input.phone).trim() || null);
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('A valid name and email are required');
    const duplicate = await this.prisma.user.findUnique({ where: { email } });
    if (duplicate && duplicate.id !== userId) throw new ConflictException('That email is already registered');
    const data: any = { fullName, email, phone };
    if (input.role !== undefined) {
      const role = String(input.role).toUpperCase();
      // Explicitly type these collections as Role[] so TypeScript does not
      // narrow Array.includes() to a smaller enum-literal union.
      const agencyRoles: Role[] = [Role.ADMIN, Role.STAFF, Role.GATE];
      const globalRoles: Role[] = [Role.GLOBAL_ADMIN, Role.GLOBAL_GATE];
      const requestedRole = role as Role;
      if (agencyRoles.includes(target.role) && !agencyRoles.includes(requestedRole)) throw new BadRequestException('Agency accounts can only use agency roles');
      if (globalRoles.includes(target.role) && !globalRoles.includes(requestedRole)) throw new BadRequestException('Platform accounts can only use platform roles');
      if (![...agencyRoles, ...globalRoles].includes(requestedRole)) throw new BadRequestException('Unsupported account role');
      data.role = requestedRole;
    }
    if (target.role === Role.GLOBAL_ADMIN && Array.isArray(input.permissions)) data.permissions = input.permissions.filter((p: string) => GLOBAL_PERMISSIONS.includes(p));
    const updated = await this.prisma.user.update({ where: { id: userId }, data, select: userSelect });
    if (updated.role !== Role.GATE) await this.prisma.gateOfficerAssignment.deleteMany({ where: { userId } });
    await this.audit.log({ action: 'PLATFORM_PERSON_UPDATED', entity: 'User', entityId: userId, userId: actor.id, details: { role: updated.role, email: updated.email } });
    return updated;
  }

  async createGlobalAdmin(actor: any, input: any) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Only the Super Admin can appoint Global Admins');
    const fullName = String(input.fullName || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const phone = String(input.phone || '').trim();
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Name and valid email are required');
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already registered');
    const homeOrg = await this.prisma.organisation.findUnique({ where: { id: actor.orgId } });
    if (!homeOrg) throw new NotFoundException('Platform organisation not found');
    const allowed = Array.isArray(input.permissions) ? input.permissions.filter((p: string) => GLOBAL_PERMISSIONS.includes(p)) : GLOBAL_PERMISSIONS;
    const initialPassword = generateNigerianPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const user = await this.prisma.user.create({ data: { email, fullName, phone: phone || null, passwordHash, role: Role.GLOBAL_ADMIN, permissions: allowed, organisationId: homeOrg.id, mustChangePassword: true }, select: userSelect });
    const mailResult = await this.mail.sendWelcome(email, fullName, initialPassword);
    await this.audit.log({ action: 'GLOBAL_ADMIN_CREATED', entity: 'User', entityId: user.id, userId: actor.id, details: { email, permissions: allowed } });
    return { user, emailSent: !!mailResult?.ok, ...(showTempInAdmin() ? { initialPassword } : {}) };
  }




  async uploadAgencyLogo(actor: any, agencyId: string, file: Express.Multer.File) {
    this.assertPermission(actor, 'agencies.create');
    if (!file || !file.mimetype.startsWith('image/')) throw new BadRequestException('An image file is required');
    const agency = await this.prisma.organisation.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('Agency not found');
    const ext = (path.extname(file.originalname) || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '');
    const dir = path.join(process.env.PHOTO_STORAGE_PATH || '/data/photos', 'logos');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `logo-${agencyId.slice(0, 8)}-${uuidv4()}${ext}`;
    fs.writeFileSync(path.join(dir, filename), file.buffer);
    const updated = await this.prisma.organisation.update({ where: { id: agencyId }, data: { logoUrl: `/branding/logo/${filename}` } });
    await this.audit.log({ action: 'AGENCY_LOGO_UPDATED', entity: 'Organisation', entityId: agencyId, userId: actor.id });
    return updated;
  }

  async createAgencyUser(actor: any, agencyId: string, input: any) {
    this.assertPermission(actor, 'people.create');
    const agency = await this.prisma.organisation.findUnique({ where: { id: agencyId } });
    if (!agency) throw new NotFoundException('Agency not found');
    const fullName = String(input.fullName || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    const role = String(input.role || 'STAFF').toUpperCase();
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['STAFF', 'GATE', 'ADMIN'].includes(role)) throw new BadRequestException('Provide a name, valid email and STAFF, GATE or ADMIN role');
    if (role === 'ADMIN') this.assertPermission(actor, 'agency_admins.create');
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already registered');
    const gateIds: string[] = Array.isArray(input.gateIds) ? (input.gateIds as unknown[]).map((id): string => String(id)) : [];
    const uniqueGateIds: string[] = Array.from(new Set<string>(gateIds));
    if (role === 'GATE' && gateIds.length) {
      const count = await this.prisma.gate.count({ where: { id: { in: gateIds }, location: { OR: [{ organisationId: agencyId }, { isShared: true }] } } });
      if (count !== uniqueGateIds.length) throw new BadRequestException('One or more selected gates do not belong to this agency');
    }
    const initialPassword = generateNigerianPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const user = await this.prisma.$transaction(async tx => {
      const created = await tx.user.create({ data: { fullName, email, phone: input.phone || null, role: role as Role, portfolio: input.portfolio || null, passwordHash, organisationId: agencyId, mustChangePassword: true } });
      if (role === 'GATE' && gateIds.length) await tx.gateOfficerAssignment.createMany({ data: uniqueGateIds.map((gateId: string) => ({ gateId, userId: created.id })) });
      return created;
    });
    const mailResult = await this.mail.sendWelcome(email, fullName, initialPassword, undefined, agencyId);
    await this.audit.log({ action: 'AGENCY_USER_CREATED', entity: 'User', entityId: user.id, userId: actor.id, details: { role, agencyId, assignedGateIds: gateIds } });
    return { user: { id: user.id, email, fullName, role: user.role, organisationId: agencyId, mustChangePassword: true }, emailSent: !!mailResult?.ok, ...(showTempInAdmin() ? { initialPassword } : {}) };
  }

  async bulkCreateAgencyPeople(actor: any, rows: any[]) {
    this.assertPermission(actor, 'people.create');
    if (!Array.isArray(rows) || rows.length > 500) throw new BadRequestException('Upload between 1 and 500 rows');
    const agencies = await this.prisma.organisation.findMany({ select: { id: true, name: true, code: true } });
    const byCode = new Map<string, typeof agencies[number]>(agencies.map(a => [a.code.toLowerCase(), a] as const));
    const byName = new Map<string, typeof agencies[number]>(agencies.map(a => [a.name.toLowerCase(), a] as const));
    const results: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      const key = String(row.agencyCode || row.agency || row.agencyName || '').trim().toLowerCase();
      const agency = byCode.get(key) || byName.get(key);
      if (!agency) { results.push({ row: i + 2, error: 'Agency code/name not found' }); continue; }
      try {
        const created = await this.createAgencyUser(actor, agency.id, row);
        results.push({ row: i + 2, agency: agency.name, email: created.user.email, success: true, emailSent: created.emailSent });
      } catch (error: any) {
        results.push({ row: i + 2, agency: agency.name, email: row.email, error: error?.message || 'Unable to create user' });
      }
    }
    return { total: rows.length, createdCount: results.filter(r => r.success).length, errorCount: results.filter(r => !r.success).length, results };
  }

  async locations(actor: any) {
    this.assertPermission(actor, 'agencies.view');
    return this.prisma.location.findMany({ include: { organisation: { select: { id: true, name: true, code: true } }, gates: { select: { id: true, name: true, code: true } } }, orderBy: [{ isShared: 'desc' }, { name: 'asc' }] });
  }

  async setLocationShared(actor: any, locationId: string, isShared: boolean) {
    this.assertPermission(actor, 'agencies.create');
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException('Location not found');
    const updated = await this.prisma.location.update({ where: { id: locationId }, data: { isShared: !!isShared }, include: { organisation: { select: { id: true, name: true, code: true } } } });
    await this.audit.log({ action: isShared ? 'LOCATION_SHARED' : 'LOCATION_UNSHARED', entity: 'Location', entityId: locationId, userId: actor.id, details: { organisationId: location.organisationId } });
    return updated;
  }

  async gates(actor: any) {
    this.assertPermission(actor, 'gates.manage');
    return this.prisma.gate.findMany({ include: { location: { include: { organisation: { select: { id: true, name: true, code: true } } } }, assignments: { include: { user: { select: { id: true, fullName: true, email: true, role: true } } } } }, orderBy: [{ location: { organisationId: 'asc' } }, { sequence: 'asc' }] });
  }

  async assignGlobalGate(actor: any, gateId: string, userId: string) {
    this.assertPermission(actor, 'gates.manage');
    const [gate, officer] = await Promise.all([this.prisma.gate.findUnique({ where: { id: gateId }, include: { location: true } }), this.prisma.user.findUnique({ where: { id: userId } })]);
    if (!gate || !officer || officer.role !== Role.GLOBAL_GATE) throw new NotFoundException('Gate or global gate officer not found');
    const assignment = await this.prisma.gateOfficerAssignment.upsert({ where: { gateId_userId: { gateId, userId } }, update: {}, create: { gateId, userId } });
    await this.audit.log({ action: 'GLOBAL_GATE_ASSIGNED', entity: 'Gate', entityId: gateId, userId: actor.id, details: { officerId: userId, agencyId: gate.location.organisationId } });
    return assignment;
  }

  async globalAdmins(actor: any) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException();
    return this.prisma.user.findMany({ where: { role: { in: [Role.GLOBAL_ADMIN, Role.GLOBAL_GATE] } }, select: userSelect, orderBy: { createdAt: 'desc' } });
  }


  async globalGateOfficers(actor: any) {
    this.assertPermission(actor, 'gates.manage');
    return this.prisma.user.findMany({ where: { role: Role.GLOBAL_GATE }, select: userSelect, orderBy: { createdAt: 'desc' } });
  }

  async createGlobalGate(actor: any, input: any) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException();
    const fullName = String(input.fullName || '').trim();
    const email = String(input.email || '').trim().toLowerCase();
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Name and valid email are required');
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Email already registered');
    const initialPassword = generateNigerianPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    const user = await this.prisma.user.create({ data: { email, fullName, phone: input.phone || null, passwordHash, role: Role.GLOBAL_GATE, organisationId: actor.orgId, mustChangePassword: true }, select: userSelect });
    const mailResult = await this.mail.sendWelcome(email, fullName, initialPassword);
    await this.audit.log({ action: 'GLOBAL_GATE_CREATED', entity: 'User', entityId: user.id, userId: actor.id, details: { email } });
    return { user, emailSent: !!mailResult?.ok, ...(showTempInAdmin() ? { initialPassword } : {}) };
  }

  async resetPersonPassword(actor: any, userId: string) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException('Only the Super Admin can reset platform or agency passwords');
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.role === Role.SUPER_ADMIN) throw new NotFoundException('Editable account not found');
    const initialPassword = generateNigerianPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: true } });
    const mailResult = await this.mail.sendPasswordReset(target.email, target.fullName, initialPassword, undefined, (target.role === Role.ADMIN || target.role === Role.STAFF || target.role === Role.GATE) ? target.organisationId : undefined);
    await this.audit.log({ action: 'PLATFORM_PASSWORD_RESET', entity: 'User', entityId: userId, userId: actor.id, details: { targetRole: target.role, email: target.email } });
    return { userId, email: target.email, fullName: target.fullName, emailSent: !!mailResult?.ok, ...(showTempInAdmin() ? { initialPassword } : {}) };
  }

  async setUserActive(actor: any, userId: string, isActive: boolean) {
    if (actor.role !== Role.SUPER_ADMIN) throw new ForbiddenException();
    if (userId === actor.id) throw new BadRequestException('You cannot suspend your own account');
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target || (target.role !== Role.GLOBAL_ADMIN && target.role !== Role.GLOBAL_GATE)) throw new NotFoundException('Platform user not found');
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { isActive }, select: userSelect });
    await this.audit.log({ action: isActive ? 'PLATFORM_USER_ACTIVATED' : 'PLATFORM_USER_SUSPENDED', entity: 'User', entityId: userId, userId: actor.id });
    return updated;
  }
}
