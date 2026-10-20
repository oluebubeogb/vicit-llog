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

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  portfolio: true,
  phone: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto, orgId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('Email already registered');

    const initialPassword = generateNigerianPassword();
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

    // Return initial password ONLY once at creation time
    return { user, initialPassword };
  }

  async findAll(orgId: string) {
    return this.prisma.user.findMany({
      where: { organisationId: orgId },
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
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

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      initialPassword, // shown once only
    };
  }

  async updateStaff(
    userId: string,
    orgId: string,
    data: { fullName?: string; phone?: string; portfolio?: string; role?: Role; isActive?: boolean },
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organisationId: orgId },
    });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        portfolio: data.portfolio,
        role: data.role,
        isActive: data.isActive,
      },
      select: userSelect,
    });
  }

  /**
   * Bulk create from CSV rows: fullName,email,role,portfolio,phone
   * Returns users + credentials for downloadable CSV
   */
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

    // Build credentials CSV
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
      credentialsCsv,
      // credentials also as structured data (passwords only in this response)
      credentials: created,
    };
  }
}
