import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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

  async create(dto: CreateUserDto, orgId: string) {
    if (!isValidEmail(dto.email)) {
      throw new BadRequestException('Please enter a valid email address that can receive mail.');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already registered');

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
      },
      select: userSelect,
    });

    // Always try welcome email
    await this.mail.sendWelcome(user.email, user.fullName, initialPassword);

    return {
      user,
      // Only include plaintext password in API when env allows admin UI display
      ...(showTempInAdmin() ? { initialPassword } : {}),
      emailSent: true,
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
      select: { ...userSelect, organisationId: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
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

    await this.mail.sendPasswordReset(user.email, user.fullName, initialPassword);

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

    if (actorId && actorId === userId) {
      if (next.isActive === false) throw new BadRequestException('You cannot deactivate your own account');
      if (next.role && next.role !== Role.ADMIN) throw new BadRequestException('You cannot remove your own admin role');
    }

    const changes: Record<string, { from: any; to: any }> = {};
    for (const [k, v] of Object.entries(next)) {
      const before = (user as any)[k] ?? null;
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
        await this.mail.sendWelcome(
          row.email.toLowerCase().trim(),
          row.fullName.trim(),
          initialPassword,
        );
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
      emailSent: true,
      ...(showTempInAdmin()
        ? { credentialsCsv, credentials: created }
        : {}),
    };
  }

  async requestProfileEdit(userId: string, orgId: string, after: Record<string, any>) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organisationId: orgId } });
    if (!user) throw new NotFoundException('User not found');
    if (after.email && !isValidEmail(after.email)) {
      throw new BadRequestException('Invalid email address');
    }
    const before = {
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
    if (!Object.keys(cleaned).length) {
      throw new BadRequestException('No changes detected');
    }
    return (this.prisma as any).profileEditRequest.create({
      data: {
        userId,
        organisationId: orgId,
        before,
        after: { ...before, ...cleaned },
        status: 'PENDING',
      },
    });
  }

  async listProfileEdits(orgId: string, status?: string) {
    const where: any = { organisationId: orgId };
    if (status) where.status = status;
    return (this.prisma as any).profileEditRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async reviewProfileEdit(id: string, orgId: string, adminId: string, approve: boolean, note?: string) {
    const req = await (this.prisma as any).profileEditRequest.findFirst({
      where: { id, organisationId: orgId },
    });
    if (!req) throw new NotFoundException('Edit request not found');
    if (req.status !== 'PENDING') throw new BadRequestException('Already reviewed');

    if (approve) {
      const after = req.after as any;
      await this.prisma.user.update({
        where: { id: req.userId },
        data: {
          fullName: after.fullName,
          phone: after.phone || null,
          portfolio: after.portfolio || null,
          ...(after.email ? { email: String(after.email).toLowerCase() } : {}),
          ...(after.avatarPath !== undefined ? { avatarPath: after.avatarPath } : {}),
        },
      });
    }

    const updated = await (this.prisma as any).profileEditRequest.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'DECLINED',
        reviewedById: adminId,
        reviewedAt: new Date(),
        reviewNote: note || null,
      },
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



  async bulkReviewProfileEdits(
    orgId: string,
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
        organisation: { select: { name: true } },
      },
    });
    if (!user) throw new NotFoundException('Profile not found');

    // Scope to same organisation when viewer is known
    if (viewer?.orgId && user.organisationId !== viewer.orgId) {
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
      // isGate subject (for UI tabs) — not the viewer's role
      subjectIsGate: user.role === Role.GATE,
      guests,
    };

    // Admin-only: gate officer activity (entries / declines / exits they recorded)
    if (viewer?.role === 'ADMIN' && user.role === Role.GATE) {
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

}
