import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

function naturalDate(d?: Date | null) {
  if (!d) return '';
  try {
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private reportsDir() {
    const dir = process.env.REPORTS_PATH || '/data/reports';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async exportVisitsCsv(
    orgId: string,
    from?: string,
    to?: string,
    columns?: string[],
  ) {
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
            category: true,
            passphrase: true,
            host: { select: { fullName: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    // Resolve gate officers
    const officerIds = new Set<string>();
    for (const v of visitors) {
      if ((v as any).entryById) officerIds.add((v as any).entryById);
      if ((v as any).exitById) officerIds.add((v as any).exitById);
    }
    const officers = officerIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: [...officerIds] } },
          select: { id: true, fullName: true },
        })
      : [];
    const officerMap = Object.fromEntries(officers.map((o) => [o.id, o.fullName]));

    const allCols: Record<string, (v: any) => string> = {
      fullName: (v) => `"${(v.fullName || '').replace(/"/g, '""')}"`,
      email: (v) => v.email || '',
      phone: (v) => v.phone || '',
      status: (v) => v.status,
      purpose: (v) => `"${(v.invite?.purpose || '').replace(/"/g, '""')}"`,
      category: (v) => v.invite?.category || '',
      host: (v) => `"${v.invite?.host?.fullName || ''}"`,
      // display label (stored enum stays PEDESTRIAN / MOTORCYCLE / VEHICLE)
      entryMode: (v) => ({ PEDESTRIAN: 'On foot', MOTORCYCLE: 'Motorcycle', VEHICLE: 'Vehicle' } as Record<string, string>)[v.entryMode] || v.entryMode || '',
      enteredAt: (v) => naturalDate(v.enteredAt),
      exitedAt: (v) => naturalDate(v.exitedAt),
      deniedAt: (v) => naturalDate(v.deniedAt),
      deniedReason: (v) =>
        v.deniedReason ? `"${String(v.deniedReason).replace(/"/g, '""')}"` : '',
      entryOfficer: (v) =>
        v.entryById ? `"${officerMap[v.entryById] || ''}"` : '',
      exitOfficer: (v) =>
        v.exitById ? `"${officerMap[v.exitById] || ''}"` : '',
      createdAt: (v) => naturalDate(v.createdAt),
    };

    const defaultCols = [
      'fullName',
      'status',
      'purpose',
      'category',
      'host',
      'entryMode',
      'enteredAt',
      'exitedAt',
      'entryOfficer',
      'exitOfficer',
      'createdAt',
    ];
    const cols =
      columns?.length && columns.every((c) => allCols[c])
        ? columns
        : defaultCols;

    const labels: Record<string, string> = {
      fullName: 'Visitor Name',
      email: 'Email',
      phone: 'Phone',
      status: 'Status',
      purpose: 'Purpose',
      category: 'Category',
      host: 'Host',
      entryMode: 'Arrived by',
      enteredAt: 'Entered',
      exitedAt: 'Exited',
      deniedAt: 'Declined At',
      deniedReason: 'Decline Reason',
      entryOfficer: 'Entry Gate Officer',
      exitOfficer: 'Exit Gate Officer',
      createdAt: 'Registered',
    };

    const header = cols.map((c) => labels[c] || c).join(',');
    const rows = visitors.map((v) => cols.map((c) => allCols[c](v)).join(','));
    const csv = [header, ...rows].join('\n');
    const filename = `visits-${orgId.slice(0, 8)}-${Date.now()}.csv`;
    const filepath = path.join(this.reportsDir(), filename);
    fs.writeFileSync(filepath, csv, 'utf8');

    return { filename, path: filepath, rowCount: visitors.length, csv, columns: cols };
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
            category: true,
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
