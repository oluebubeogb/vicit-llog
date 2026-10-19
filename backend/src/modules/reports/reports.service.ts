import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private reportsDir() {
    const dir = process.env.REPORTS_PATH || '/data/reports';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async exportVisitsCsv(orgId: string, from?: string, to?: string) {
    const where: any = { invite: { organisationId: orgId } };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const visitors = await this.prisma.visitor.findMany({
      where,
      include: {
        invite: {
          select: {
            purpose: true,
            passphrase: true,
            host: { select: { fullName: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const header = [
      'Visitor ID',
      'Full Name',
      'Status',
      'Purpose',
      'Host',
      'Entry Mode',
      'Entered At',
      'Exited At',
      'Created At',
    ].join(',');

    const rows = visitors.map((v) =>
      [
        v.id,
        `"${v.fullName.replace(/"/g, '""')}"`,
        v.status,
        `"${(v.invite.purpose || '').replace(/"/g, '""')}"`,
        `"${v.invite.host.fullName}"`,
        v.entryMode || '',
        v.enteredAt?.toISOString() || '',
        v.exitedAt?.toISOString() || '',
        v.createdAt.toISOString(),
      ].join(','),
    );

    const csv = [header, ...rows].join('\n');
    const filename = `visits-${orgId.slice(0, 8)}-${Date.now()}.csv`;
    const filepath = path.join(this.reportsDir(), filename);
    fs.writeFileSync(filepath, csv, 'utf8');

    return { filename, path: filepath, rowCount: visitors.length, csv };
  }

  async visitorHistory(orgId: string, query: string) {
    return this.prisma.visitor.findMany({
      where: {
        invite: { organisationId: orgId },
        OR: [
          { fullName: { contains: query, mode: 'insensitive' } },
          { idNumber: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        invite: {
          select: {
            purpose: true,
            host: { select: { fullName: true } },
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
