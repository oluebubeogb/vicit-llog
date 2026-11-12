import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Role } from '@prisma/client';
import { generateNigerianPassword } from '../../common/utils/password-words';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { isValidEmail } from '../../common/utils/email';
import { AuditService } from '../audit/audit.service';
import { cleanCustomFields } from '../../common/utils/custom-fields';

const APPROVER_ROLES = ['ADMIN', 'SUPER_ADMIN', 'GLOBAL_ADMIN'];

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  portfolio: true,
  phone: true,
  avatarPath: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  organisationId: true,
  staffBadgePhotoPath: true,
  customFields: true,
} as const;

function showTempInAdmin(): boolean {
  return (process.env.SHOW_TEMP_PASSWORDS_IN_ADMIN || 'false').toLowerCase() === 'true';
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, orgId: string, actorId?: string) {
    if (!isValidEmail(dto.email)) {
      throw new BadRequestException('Please enter a valid email address that can receive mail.');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const customFields = await cleanCustomFields(this.prisma, orgId, (dto as any).customFields, { enforceRequired: true });
    const initialPassword = generateNigerianPassword(); // lowercase 5-letter
    const passwordHash = await bcrypt.hash(initialPassword, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        fullName: dto.fullName,
        role: dto.role || Role.STAFF,
        portfolio: dto.portfolio,
        phone: dto.phone,
        organisationId: orgId,
        mustChangePassword: true,
        ...(customFields && Object.keys(customFields).length ? { customFields } : {}),
      },
      select: userSelect,
    });

    // Always try welcome email
    const mailResult = await this.mail.sendWelcome(user.email, user.fullName, initialPassword, undefined, orgId);
    await this.audit.log({ action: 'USER_CREATED', entity: 'User', entityId: user.id, userId: actorId, details: { role: user.role, welcomeEmailSent: !!mailResult?.ok } });

    return {
      user,
      // Only include plaintext password in API when env allows admin UI display
      ...(showTempInAdmin() ? { initialPassword } : {}),
      emailSent: !!mailResult?.ok,
      mailError: mailResult?.ok ? undefined : (mailResult as any)?.error,
    };
  }

  async findAll(orgId: string) {
    return this.prisma.user.findMany({
      where: { organisationId: orgId },
      select: { ...userSelect, updatedAt: true, _count: { select: { invites: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, orgId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, ...(orgId ? { organisationId: orgId } : {}) },
      select: {
        ...userSelect,
        organisationId: true,
        organisation: { select: { id: true, name: true, code: true } },
        staffPinHash: true,
        staffQrToken: true,
        staffPinLockedUntil: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const { staffPinHash, staffQrToken, ...safe } = user as any;
    return {
      ...safe,
      hasStaffPin: Boolean(staffPinHash),
      hasStaffQr: Boolean(staffQrToken),
      staffPinLockedUntil: user.staffPinLockedUntil,
      customFieldsList: await this.labelledCustomFields(user.organisationId, user.customFields),
    };
  }

  async resetPassword(userId: string, orgId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organisationId: orgId },
    });
    if (!user) throw new NotFoundException('User not found');

    const initialPassword = generateNigerianPassword();
    const passwordHash = await bcrypt.hash(initialPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true },
    });

    await this.mail.sendPasswordReset(user.email, user.fullName, initialPassword, undefined, orgId);

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      emailSent: true,
      ...(showTempInAdmin() ? { initialPassword } : {}),
    };
  }

  /**
   * Admin edit of a staff member. Editable: fullName, email, phone, portfolio, role, isActive.
   * Validated, org-scoped, self-lockout protected and audit-logged with a from → to diff.
   */
  async updateStaff(
    userId: string,
    orgId: string,
    data: {
      fullName?: string;
      email?: string;
      phone?: string | null;
      portfolio?: string | null;
      role?: Role;
      isActive?: boolean;
      customFields?: Record<string, any>;
    },
    actorId?: string,
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organisationId: orgId },
    });
    if (!user) throw new NotFoundException('User not found');

    const next: Record<string, any> = {};
    if (data.fullName !== undefined) {
      const v = String(data.fullName || '').trim();
      if (v.length < 2 || v.length > 120) throw new BadRequestException('Full name must be 2–120 characters');
      next.fullName = v;
    }
    if (data.email !== undefined) {
      const v = String(data.email || '').trim().toLowerCase();
      if (!isValidEmail(v)) throw new BadRequestException('Please enter a valid email address that can receive mail.');
      if (v !== user.email) {
        const taken = await this.prisma.user.findUnique({ where: { email: v } });
        if (taken) throw new ConflictException('Email already registered');
      }
      next.email = v;
    }
    if (data.phone !== undefined) {
      const v = String(data.phone || '').trim();
      if (v && !/^\+?[0-9 ()-]{7,20}$/.test(v)) throw new BadRequestException('Phone number looks invalid');
      next.phone = v || null;
    }
    if (data.portfolio !== undefined) {
      const v = String(data.portfolio || '').trim();
      if (v.length > 120) throw new BadRequestException('Portfolio is too long');
      next.portfolio = v || null;
    }
    if (data.role !== undefined) {
      if (!Object.values(Role).includes(data.role as Role)) throw new BadRequestException('Invalid role');
      next.role = data.role;
    }
    if (data.isActive !== undefined) next.isActive = Boolean(data.isActive);
    if (data.customFields !== undefined) {
      const cf = await cleanCustomFields(this.prisma, orgId, data.customFields, { existing: user.customFields });
      if (JSON.stringify(cf || {}) !== JSON.stringify(user.customFields || {})) next.customFields = cf || {};
    }

    if (actorId && actorId === userId) {
      if (next.isActive === false) throw new BadRequestException('You cannot deactivate your own account');
      if (next.role && next.role !== Role.ADMIN) throw new BadRequestException('You cannot remove your own admin role');
    }

    const changes: Record<string, { from: any; to: any }> = {};
    for (const [k, v] of Object.entries(next)) {
      const before = (user as any)[k] ?? null;
      if (k === 'customFields') { changes[k] = { from: before, to: v }; continue; }
      if (before !== v) changes[k] = { from: before, to: v };
      else delete next[k];
    }
    if (!Object.keys(next).length) {
      return this.prisma.user.findUnique({ where: { id: userId }, select: userSelect });
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: next,
      select: userSelect,
    });

    await this.audit.log({
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: userId,
      userId: actorId,
      details: { changes },
    });

    return updated;
  }

  async bulkCreate(
    orgId: string,
    rows: Array<{ fullName: string; email: string; role?: string; portfolio?: string; phone?: string }>,
  ) {
    if (!rows?.length) throw new BadRequestException('No rows provided');

    const created: Array<{
      fullName: string;
      email: string;
      role: string;
      phone: string;
      initialPassword: string;
    }> = [];
    const errors: Array<{ row: number; email: string; error: string }> = [];
    const mailFailures: Array<{ row: number; email: string; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.email || !row.fullName) {
          errors.push({ row: i + 1, email: row.email || '', error: 'fullName and email required' });
          continue;
        }
        const role = (row.role || 'STAFF').toUpperCase();
        if (!['ADMIN', 'STAFF', 'GATE'].includes(role)) {
          errors.push({ row: i + 1, email: row.email, error: 'Invalid role' });
          continue;
        }
        const existing = await this.prisma.user.findUnique({
          where: { email: row.email.toLowerCase() },
        });
        if (existing) {
          errors.push({ row: i + 1, email: row.email, error: 'Email already exists' });
          continue;
        }
        const initialPassword = generateNigerianPassword();
        const passwordHash = await bcrypt.hash(initialPassword, 12);
        await this.prisma.user.create({
          data: {
            email: row.email.toLowerCase().trim(),
            passwordHash,
            fullName: row.fullName.trim(),
            role: role as Role,
            portfolio: row.portfolio || null,
            phone: row.phone || null,
            organisationId: orgId,
            mustChangePassword: true,
          },
        });
        const mailResult = await this.mail.sendWelcome(
          row.email.toLowerCase().trim(),
          row.fullName.trim(),
          initialPassword,
          undefined,
          orgId,
        );
        if (!mailResult?.ok) mailFailures.push({ row: i + 1, email: row.email.toLowerCase().trim(), error: (mailResult as any)?.error || 'Email not sent' });
        created.push({
          fullName: row.fullName.trim(),
          email: row.email.toLowerCase().trim(),
          role,
          phone: row.phone || '',
          initialPassword,
        });
      } catch (e: any) {
        errors.push({ row: i + 1, email: row.email || '', error: e.message });
      }
    }

    // Credentials CSV always generated for download when admin explicitly downloads
    // (still gated: only return csv if SHOW_TEMP_PASSWORDS_IN_ADMIN or always for bulk download?)
    // User asked: showing on admin off by default; email still goes.
    // Bulk download of credentials is useful — return csv only when SHOW_TEMP_PASSWORDS_IN_ADMIN=true
    const header = 'fullName,email,role,phone,initialPassword';
    const lines = created.map(
      (c) =>
        `"${c.fullName.replace(/"/g, '""')}",${c.email},${c.role},${c.phone},${c.initialPassword}`,
    );
    const credentialsCsv = [header, ...lines].join('\n');

    return {
      createdCount: created.length,
      errorCount: errors.length,
      errors,
      emailSent: mailFailures.length === 0,
      emailSentCount: created.length - mailFailures.length,
      mailFailures,
      ...(showTempInAdmin()
        ? { credentialsCsv, credentials: created }
        : {}),
    };
  }

  async requestProfileEdit(userId: string, orgId: string, after: Record<string, any>, actorRole?: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organisationId: orgId } });
    if (!user) throw new NotFoundException('User not found');
    if (after.email && !isValidEmail(after.email)) {
      throw new BadRequestException('Invalid email address');
    }
    const before: Record<string, any> = {
      fullName: user.fullName,
      phone: user.phone,
      portfolio: user.portfolio,
      email: user.email,
      avatarPath: user.avatarPath,
    };
    const cleaned: any = {};
    for (const k of ['fullName', 'phone', 'portfolio', 'email', 'avatarPath']) {
      if (after[k] !== undefined && after[k] !== before[k as keyof typeof before]) {
        cleaned[k] = after[k];
      }
    }
    if (after.customFields !== undefined) {
      const cf = await cleanCustomFields(this.prisma, orgId, after.customFields, { existing: user.customFields });
      if (JSON.stringify(cf || {}) !== JSON.stringify(user.customFields || {})) {
        before.customFields = user.customFields || {};
        cleaned.customFields = cf || {};
      }
    }
    if (!Object.keys(cleaned).length) {
      throw new BadRequestException('No changes detected');
    }
    if (cleaned.email && cleaned.email !== user.email) {
      const taken = await this.prisma.user.findUnique({ where: { email: String(cleaned.email).toLowerCase() } });
      if (taken && taken.id !== userId) throw new ConflictException('Email already registered');
    }
    const role = actorRole || user.role;
    // Admins and Super Admins are the approvers — their own edits apply immediately.
    if (APPROVER_ROLES.includes(role)) {
      await this.applyProfileChanges(userId, { ...before, ...cleaned });
      const req = await this.prisma.profileEditRequest.create({
        data: {
          userId,
          organisationId: orgId,
          before,
          after: { ...before, ...cleaned },
          status: 'APPROVED',
          reviewedById: userId,
          reviewedAt: new Date(),
          reviewNote: 'Applied immediately (approver self-edit)',
        },
      });
      await this.audit.log({ action: 'PROFILE_EDIT_AUTO_APPLIED', entity: 'User', entityId: userId, userId, details: { requestId: req.id, changes: this.diff(before, cleaned) } });
      return { ...req, applied: true };
    }
    const req = await this.prisma.profileEditRequest.create({
      data: {
        userId,
        organisationId: orgId,
        before,
        after: { ...before, ...cleaned },
        status: 'PENDING',
      },
    });
    await this.audit.log({ action: 'PROFILE_EDIT_REQUESTED', entity: 'User', entityId: userId, userId, details: { requestId: req.id, changes: this.diff(before, cleaned) } });
    const approvers = await this.prisma.user.findMany({ where: { organisationId: orgId, role: Role.ADMIN, isActive: true }, select: { id: true } });
    for (const a of approvers) {
      await this.notifications.create({ userId: a.id, title: 'Profile change awaiting approval', body: `${user.fullName} updated their profile. Review and approve or reject.`, meta: { type: 'PROFILE_EDIT_PENDING', requestId: req.id, url: '/approvals' }, channels: ['in_app'] }).catch(() => {});
    }
    return { ...req, applied: false };
  }

  private diff(before: Record<string, any>, after: Record<string, any>) {
    const out: Record<string, { from: any; to: any }> = {};
    for (const k of Object.keys(after)) if (k !== 'avatarPath' || after[k] !== before[k]) out[k] = { from: before[k] ?? null, to: after[k] ?? null };
    return out;
  }

  private async applyProfileChanges(userId: string, after: any) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: after.fullName,
        phone: after.phone || null,
        portfolio: after.portfolio || null,
        ...(after.email ? { email: String(after.email).toLowerCase() } : {}),
        ...(after.avatarPath !== undefined ? { avatarPath: after.avatarPath } : {}),
        ...(after.customFields !== undefined ? { customFields: after.customFields } : {}),
      },
    });
  }

  private scopeWhere(actor: { role?: string; orgId?: string } | string) {
    if (typeof actor === 'string') return { organisationId: actor };
    if (actor.role === 'SUPER_ADMIN' || actor.role === 'GLOBAL_ADMIN') return {};
    return { organisationId: actor.orgId };
  }

  async listProfileEdits(actor: { role?: string; orgId?: string } | string, status?: string) {
    const where: any = { ...this.scopeWhere(actor) };
    if (status) where.status = status;
    const rows = await this.prisma.profileEditRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const ids = Array.from(new Set(rows.flatMap((r) => [r.userId, r.reviewedById].filter(Boolean) as string[])));
    const people = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, email: true, role: true, avatarPath: true, organisation: { select: { name: true, code: true } } } })
      : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    return rows.map((r) => ({ ...r, user: byId.get(r.userId) || null, reviewedBy: r.reviewedById ? byId.get(r.reviewedById) || null : null }));
  }

  /** Orange "Pending approvals" card: pending count, invite approvals and a recent decision timeline. */
  async approvalsSummary(actor: { role?: string; orgId?: string }) {
    const scope = this.scopeWhere(actor);
    const since = new Date(Date.now() - 30 * 86400000);
    const [pendingEdits, approved, declined, pendingInvites, recent] = await Promise.all([
      this.prisma.profileEditRequest.count({ where: { ...scope, status: 'PENDING' } }),
      this.prisma.profileEditRequest.count({ where: { ...scope, status: 'APPROVED', reviewedAt: { gte: since } } }),
      this.prisma.profileEditRequest.count({ where: { ...scope, status: 'DECLINED', reviewedAt: { gte: since } } }),
      this.prisma.invite.count({ where: { ...scope, status: { in: ['OFFLINE_PENDING', 'AWAITING_APPROVAL'] } } }),
      this.listProfileEdits(actor).then((rows) => rows.slice(0, 8)),
    ]);
    return { pendingEdits, pendingInvites, pending: pendingEdits + pendingInvites, approved30d: approved, declined30d: declined, recent };
  }

  async reviewProfileEdit(id: string, actorOrOrg: { id?: string; role?: string; orgId?: string } | string, adminId: string, approve: boolean, note?: string) {
    const req = await this.prisma.profileEditRequest.findFirst({
      where: { id, ...this.scopeWhere(actorOrOrg as any) },
    });
    if (!req) throw new NotFoundException('Edit request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('Already reviewed');
    if (req.userId === adminId) throw new BadRequestException('You cannot review your own request');

    if (approve) {
      await this.applyProfileChanges(req.userId, req.after as any);
    }

    const updated = await this.prisma.profileEditRequest.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'DECLINED',
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNote: note ? String(note).slice(0, 500) : null,
      },
    });

    await this.audit.log({
      action: approve ? 'PROFILE_EDIT_APPROVED' : 'PROFILE_EDIT_REJECTED',
      entity: 'User',
      entityId: req.userId,
      userId: adminId,
      details: { requestId: id, note: note || null, changes: this.diff((req.before || {}) as any, (req.after || {}) as any) },
    });

    // Notify the user of the decision (works for GATE, STAFF, ADMIN, etc.)
    const statusText = approve ? 'approved' : 'declined';
    const noteText = note ? ` Note: ${note}` : '';
    await this.notifications.create({
      userId: req.userId,
      title: `Profile edit ${statusText}`,
      body: `Your profile changes have been ${statusText}.${noteText}`,
      meta: { type: 'profile_edit', requestId: id, status: updated.status },
    });

    return updated;
  }

  async customFieldsFor(orgId: string) {
    return this.prisma.agencyCustomField.findMany({ where: { organisationId: orgId, isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async bulkReviewProfileEdits(
    orgId: any,
    adminId: string,
    ids: string[],
    approve: boolean,
    note?: string,
  ) {
    if (!ids?.length) throw new BadRequestException('No items selected');
    const results: any[] = [];
    for (const id of ids) {
      try {
        results.push(await this.reviewProfileEdit(id, orgId, adminId, approve, note));
      } catch (e: any) {
        results.push({ id, error: e?.message || 'failed' });
      }
    }
    return { processed: results.length, results };
  }

  async getPublicProfile(
    userId: string,
    viewer?: { id: string; role: string; orgId: string },
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: {
        id: true,
        fullName: true,
        phone: true,
        portfolio: true,
        avatarPath: true,
        role: true,
        organisationId: true,
        customFields: true,
        organisation: { select: { name: true } },
      },
    });
    if (!user) throw new NotFoundException('Profile not found');

    // Scope to same organisation when viewer is known
    if (viewer?.orgId && !['SUPER_ADMIN', 'GLOBAL_ADMIN', 'GLOBAL_GATE'].includes(viewer.role) && user.organisationId !== viewer.orgId) {
      throw new NotFoundException('Profile not found');
    }

    const guests = await this.prisma.visitor.findMany({
      where: { invite: { hostId: userId } },
      select: {
        id: true,
        fullName: true,
        status: true,
        photoPath: true,
        enteredAt: true,
        exitedAt: true,
        deniedAt: true,
        deniedReason: true,
        entryMode: true,
        createdAt: true,
        invite: { select: { purpose: true, category: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const result: any = {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      portfolio: user.portfolio,
      avatarPath: user.avatarPath,
      organisationName: user.organisation?.name,
      customFields: await this.labelledCustomFields(user.organisationId, user.customFields),
      // isGate subject (for UI tabs) — not the viewer's role
      subjectIsGate: user.role === Role.GATE,
      guests,
    };

    // Admin-only: gate officer activity (entries / declines / exits they recorded)
    if (['ADMIN', 'SUPER_ADMIN', 'GLOBAL_ADMIN', 'GLOBAL_GATE'].includes(viewer?.role || '') && user.role === Role.GATE) {
      const [entries, declines, exits] = await Promise.all([
        this.prisma.visitor.findMany({
          where: {
            entryById: userId,
            status: { in: ['ARRIVED', 'EXITED'] },
            enteredAt: { not: null },
          },
          select: {
            id: true,
            fullName: true,
            status: true,
            photoPath: true,
            entryMode: true,
            enteredAt: true,
            exitedAt: true,
            invite: {
              select: {
                purpose: true,
                category: true,
                host: { select: { fullName: true } },
              },
            },
          },
          orderBy: { enteredAt: 'desc' },
          take: 100,
        }),
        this.prisma.visitor.findMany({
          where: { entryById: userId, status: 'DENIED' },
          select: {
            id: true,
            fullName: true,
            status: true,
            photoPath: true,
            deniedAt: true,
            deniedReason: true,
            invite: {
              select: {
                purpose: true,
                category: true,
                host: { select: { fullName: true } },
              },
            },
          },
          orderBy: { deniedAt: 'desc' },
          take: 100,
        }),
        this.prisma.visitor.findMany({
          where: { exitById: userId, status: 'EXITED' },
          select: {
            id: true,
            fullName: true,
            status: true,
            photoPath: true,
            entryMode: true,
            enteredAt: true,
            exitedAt: true,
            invite: {
              select: {
                purpose: true,
                category: true,
                host: { select: { fullName: true } },
              },
            },
          },
          orderBy: { exitedAt: 'desc' },
          take: 100,
        }),
      ]);
      result.gateActivity = { entries, declines, exits };
    }

    return result;
  }

  async labelledCustomFields(orgId: string, values: any) {
    if (!values || typeof values !== 'object') return [];
    const defs = await this.prisma.agencyCustomField.findMany({ where: { organisationId: orgId }, orderBy: { sortOrder: 'asc' } });
    return defs
      .filter((d) => values[d.key] !== undefined && values[d.key] !== '' && values[d.key] !== null)
      .map((d) => ({ key: d.key, label: d.label, type: d.type, value: values[d.key] }));
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('No image provided');
    const dir = path.join(process.env.PHOTO_STORAGE_PATH || '/data/photos', 'avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(file.originalname || '') || '.jpg';
    const filename = `avatar-${userId.slice(0, 8)}-${uuidv4()}${ext}`;
    fs.writeFileSync(path.join(dir, filename), file.buffer);
    // Do not apply immediately — return path so client can submit via profile edit request
    return { avatarPath: filename };
  }

  getAvatarPath(filename: string) {
    const safe = path.basename(filename);
    const filepath = path.join(
      process.env.PHOTO_STORAGE_PATH || '/data/photos',
      'avatars',
      safe,
    );
    if (!fs.existsSync(filepath)) {
      throw new NotFoundException('Avatar not found');
    }
    return filepath;
  }


  private async ensureStaffQrToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { staffQrToken: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.staffQrToken) return user.staffQrToken;
    for (let i = 0; i < 5; i++) {
      const token = crypto.randomBytes(32).toString('hex');
      try {
        await this.prisma.user.update({ where: { id: userId }, data: { staffQrToken: token } });
        return token;
      } catch {
        // unique collision — retry
      }
    }
    throw new BadRequestException('Could not allocate a staff QR token');
  }

  private assertPinFormat(pin: string) {
    if (!/^\d{4}$/.test(String(pin || ''))) throw new BadRequestException('PIN must be exactly 4 digits');
  }

  private async assertPinUnlocked(user: { staffPinLockedUntil?: Date | null; staffPinFailCount?: number }) {
    if (user.staffPinLockedUntil && user.staffPinLockedUntil.getTime() > Date.now()) {
      const secs = Math.ceil((user.staffPinLockedUntil.getTime() - Date.now()) / 1000);
      throw new HttpException(`PIN locked. Try again in ${secs}s`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async staffQrStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        staffPinHash: true,
        staffPinLockedUntil: true,
        staffBadgePhotoPath: true,
        staffQrToken: true,
        fullName: true,
        organisation: { select: { name: true, code: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      hasStaffPin: Boolean(user.staffPinHash),
      hasBadgePhoto: Boolean(user.staffBadgePhotoPath),
      hasStaffQr: Boolean(user.staffQrToken),
      lockedUntil: user.staffPinLockedUntil,
      organisationName: user.organisation?.name,
    };
  }

  async setStaffPin(userId: string, pin: string, confirmPin: string) {
    this.assertPinFormat(pin);
    if (pin !== confirmPin) throw new BadRequestException('PIN confirmation does not match');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { staffPinHash: true } });
    if (!user) throw new NotFoundException('User not found');
    if (user.staffPinHash) throw new BadRequestException('PIN is already set. Reset it with your password first.');
    const staffPinHash = await bcrypt.hash(pin, 12);
    await this.ensureStaffQrToken(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { staffPinHash, staffPinFailCount: 0, staffPinLockedUntil: null },
    });
    return { ok: true, hasStaffPin: true };
  }

  async verifyStaffPin(userId: string, pin: string) {
    this.assertPinFormat(pin);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        staffPinHash: true,
        staffPinFailCount: true,
        staffPinLockedUntil: true,
        staffQrToken: true,
        staffBadgePhotoPath: true,
        fullName: true,
        avatarPath: true,
        organisation: { select: { id: true, name: true, code: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.staffPinHash) throw new BadRequestException('Set a PIN first');
    await this.assertPinUnlocked(user);
    const ok = await bcrypt.compare(pin, user.staffPinHash);
    if (!ok) {
      const fails = (user.staffPinFailCount || 0) + 1;
      const lock = fails >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await this.prisma.user.update({
        where: { id: userId },
        data: { staffPinFailCount: fails, staffPinLockedUntil: lock },
      });
      if (lock) throw new HttpException('Too many wrong PIN attempts. Locked for 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
      throw new ForbiddenException(`Incorrect PIN (${5 - fails} attempts left)`);
    }
    const token = await this.ensureStaffQrToken(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { staffPinFailCount: 0, staffPinLockedUntil: null },
    });
    return {
      ok: true,
      qrPayload: JSON.stringify({ s: token }),
      staffBadgePhotoPath: user.staffBadgePhotoPath,
      fullName: user.fullName,
      organisation: user.organisation,
      avatarPath: user.avatarPath,
    };
  }

  async resetStaffPinWithPassword(userId: string, password: string, newPin?: string, confirmPin?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(password || '', user.passwordHash);
    if (!valid) throw new ForbiddenException('Password is incorrect');
    if (newPin) {
      this.assertPinFormat(newPin);
      if (newPin !== confirmPin) throw new BadRequestException('PIN confirmation does not match');
      const staffPinHash = await bcrypt.hash(newPin, 12);
      await this.ensureStaffQrToken(userId);
      await this.prisma.user.update({
        where: { id: userId },
        data: { staffPinHash, staffPinFailCount: 0, staffPinLockedUntil: null },
      });
      return { ok: true, hasStaffPin: true };
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { staffPinHash: null, staffPinFailCount: 0, staffPinLockedUntil: null },
    });
    return { ok: true, hasStaffPin: false };
  }

  async adminClearStaffPin(targetUserId: string, actorOrgId: string, actorRole: string) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(actorRole)) throw new ForbiddenException();
    const where: any = { id: targetUserId };
    if (actorRole === 'ADMIN') where.organisationId = actorOrgId;
    const user = await this.prisma.user.findFirst({ where });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { staffPinHash: null, staffPinFailCount: 0, staffPinLockedUntil: null },
    });
    return { ok: true };
  }

  async uploadStaffBadgePhoto(userId: string, file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('No image provided');
    // Must be a camera snap (client enforces); accept jpeg/png/webp
    const mime = (file.mimetype || '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(mime)) {
      throw new BadRequestException('Badge photo must be a camera image (JPEG/PNG/WebP)');
    }
    const dir = path.join(process.env.PHOTO_STORAGE_PATH || '/data/photos', 'staff-badges');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
    const filename = `badge-${userId.slice(0, 8)}-${uuidv4()}${ext}`;
    fs.writeFileSync(path.join(dir, filename), file.buffer);
    await this.prisma.user.update({ where: { id: userId }, data: { staffBadgePhotoPath: filename } });
    return { staffBadgePhotoPath: filename };
  }

  getStaffBadgePath(filename: string) {
    const safe = path.basename(filename);
    const filepath = path.join(process.env.PHOTO_STORAGE_PATH || '/data/photos', 'staff-badges', safe);
    if (!fs.existsSync(filepath)) throw new NotFoundException('Badge photo not found');
    return filepath;
  }

}
