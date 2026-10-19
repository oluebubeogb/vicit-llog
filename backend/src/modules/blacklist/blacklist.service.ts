import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class BlacklistService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(orgId: string) {
    return this.prisma.blacklistEntry.findMany({
      where: { organisationId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async add(
    orgId: string,
    userId: string,
    data: { fullName?: string; idNumber?: string; phone?: string; reason: string },
  ) {
    const entry = await this.prisma.blacklistEntry.create({
      data: {
        organisationId: orgId,
        fullName: data.fullName,
        idNumber: data.idNumber,
        phone: data.phone,
        reason: data.reason,
        createdById: userId,
      },
    });
    await this.audit.log({
      action: 'BLACKLIST_ADD',
      entity: 'BlacklistEntry',
      entityId: entry.id,
      userId,
      details: data,
    });
    return entry;
  }

  async deactivate(id: string, orgId: string, userId: string) {
    const entry = await this.prisma.blacklistEntry.findFirst({
      where: { id, organisationId: orgId },
    });
    if (!entry) throw new NotFoundException('Entry not found');
    const updated = await this.prisma.blacklistEntry.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit.log({
      action: 'BLACKLIST_DEACTIVATE',
      entity: 'BlacklistEntry',
      entityId: id,
      userId,
    });
    return updated;
  }

  async check(orgId: string, opts: { fullName?: string; idNumber?: string; phone?: string }) {
    const conditions: any[] = [];
    if (opts.idNumber) conditions.push({ idNumber: opts.idNumber });
    if (opts.phone) conditions.push({ phone: opts.phone });
    if (opts.fullName) conditions.push({ fullName: { equals: opts.fullName, mode: 'insensitive' } });
    if (!conditions.length) return { blocked: false };

    const hit = await this.prisma.blacklistEntry.findFirst({
      where: {
        organisationId: orgId,
        isActive: true,
        OR: conditions,
      },
    });
    return { blocked: !!hit, entry: hit || null };
  }
}
