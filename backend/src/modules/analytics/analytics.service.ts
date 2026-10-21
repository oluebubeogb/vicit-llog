import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async dashboard(orgId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totalVisits, arrived, exited, denied, byPurpose, byMode, byDay, activeNow] =
      await Promise.all([
        this.prisma.visitor.count({
          where: { invite: { organisationId: orgId }, createdAt: { gte: since } },
        }),
        this.prisma.visitor.count({
          where: {
            invite: { organisationId: orgId },
            status: { in: ['ARRIVED', 'EXITED'] },
            enteredAt: { gte: since },
          },
        }),
        this.prisma.visitor.count({
          where: {
            invite: { organisationId: orgId },
            status: 'EXITED',
            exitedAt: { gte: since },
          },
        }),
        this.prisma.visitor.count({
          where: {
            invite: { organisationId: orgId },
            status: 'DENIED',
            deniedAt: { gte: since },
          },
        }),
        this.prisma.invite.groupBy({
          by: ['purpose'],
          where: { organisationId: orgId, createdAt: { gte: since } },
          _count: true,
          orderBy: { _count: { purpose: 'desc' } },
          take: 10,
        }),
        this.prisma.visitor.groupBy({
          by: ['entryMode'],
          where: {
            invite: { organisationId: orgId },
            entryMode: { not: null },
            enteredAt: { gte: since },
          },
          _count: true,
        }),
        this.prisma.$queryRawUnsafe<any[]>(
          `SELECT DATE("enteredAt") as day, COUNT(*)::int as count
           FROM "Visitor" v
           JOIN "Invite" i ON v."inviteId" = i.id
           WHERE i."organisationId" = $1 AND v."enteredAt" >= $2
           GROUP BY DATE("enteredAt")
           ORDER BY day ASC`,
          orgId,
          since,
        ),
        this.prisma.visitor.count({
          where: {
            invite: { organisationId: orgId },
            status: 'ARRIVED',
          },
        }),
      ]);

    // Peak hours
    const peakHours = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT EXTRACT(HOUR FROM "enteredAt")::int as hour, COUNT(*)::int as count
       FROM "Visitor" v
       JOIN "Invite" i ON v."inviteId" = i.id
       WHERE i."organisationId" = $1 AND v."enteredAt" >= $2
       GROUP BY EXTRACT(HOUR FROM "enteredAt")
       ORDER BY count DESC
       LIMIT 5`,
      orgId,
      since,
    );

    return {
      periodDays: days,
      totalVisits,
      arrived,
      exited,
      denied,
      activeNow,
      byPurpose: byPurpose.map((p) => ({ purpose: p.purpose, count: p._count })),
      byMode: byMode.map((m) => ({ mode: m.entryMode, count: m._count })),
      byDay,
      peakHours,
    };
  }

  async listVisitors(
    orgId: string,
    days = 30,
    filter?: {
      status?: string;
      purpose?: string;
      entryMode?: string;
      metric?: string;
    },
  ) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const where: any = {
      invite: { organisationId: orgId },
      createdAt: { gte: since },
    };

    const metric = filter?.metric;
    if (metric === 'arrived') {
      where.status = { in: ['ARRIVED', 'EXITED'] };
      where.enteredAt = { gte: since };
      delete where.createdAt;
    } else if (metric === 'exited') {
      where.status = 'EXITED';
      where.exitedAt = { gte: since };
      delete where.createdAt;
    } else if (metric === 'activeNow') {
      where.status = 'ARRIVED';
      delete where.createdAt;
    } else if (metric === 'denied') {
      where.status = 'DENIED';
      where.deniedAt = { gte: since };
      delete where.createdAt;
    } else if (filter?.status) {
      where.status = filter.status;
    }

    if (filter?.purpose) {
      where.invite = { ...where.invite, purpose: filter.purpose };
    }
    if (filter?.entryMode) {
      where.entryMode = filter.entryMode;
    }

    return this.prisma.visitor.findMany({
      where,
      include: {
        invite: {
          select: {
            purpose: true,
            category: true,
            expectedMode: true,
            host: { select: { fullName: true, email: true } },
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

}
