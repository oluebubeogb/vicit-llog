import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(data: {
    action: string;
    entity: string;
    entityId?: string;
    details?: any;
    userId?: string;
    ip?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        details: data.details || {},
        userId: data.userId,
        ip: data.ip,
      },
    });
  }

  async findAll(limit = 100) {
    const rows = await this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Resolve related records so the admin UI can show full details inline
    const visitorIds = new Set<string>();
    const inviteIds = new Set<string>();
    const userIds = new Set<string>();
    for (const r of rows) {
      if (!r.entityId) continue;
      const e = (r.entity || '').toLowerCase();
      if (e === 'visitor') visitorIds.add(r.entityId);
      else if (e === 'invite') inviteIds.add(r.entityId);
      else if (e === 'user') userIds.add(r.entityId);
    }

    const [visitors, invites, users] = await Promise.all([
      visitorIds.size
        ? this.prisma.visitor.findMany({
            where: { id: { in: [...visitorIds] } },
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              address: true,
              status: true,
              photoPath: true,
              entryMode: true,
              enteredAt: true,
              exitedAt: true,
              deniedAt: true,
              deniedReason: true,
              createdAt: true,
              invite: {
                select: {
                  id: true,
                  purpose: true,
                  category: true,
                  expectedMode: true,
                  host: { select: { id: true, fullName: true } },
                },
              },
              entryById: true,
              exitById: true,
            },
          })
        : Promise.resolve([] as any[]),
      inviteIds.size
        ? this.prisma.invite.findMany({
            where: { id: { in: [...inviteIds] } },
            select: {
              id: true,
              purpose: true,
              category: true,
              expectedMode: true,
              status: true,
              expectedAt: true,
              createdAt: true,
              host: { select: { id: true, fullName: true } },
              visitors: {
                select: {
                  id: true,
                  fullName: true,
                  status: true,
                  photoPath: true,
                  email: true,
                  phone: true,
                },
              },
            },
          })
        : Promise.resolve([] as any[]),
      userIds.size
        ? this.prisma.user.findMany({
            where: { id: { in: [...userIds] } },
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              portfolio: true,
              role: true,
              avatarPath: true,
              isActive: true,
            },
          })
        : Promise.resolve([] as any[]),
    ]);

    const vMap = Object.fromEntries(visitors.map((v) => [v.id, v]));
    const iMap = Object.fromEntries(invites.map((i) => [i.id, i]));
    const uMap = Object.fromEntries(users.map((u) => [u.id, u]));

    return rows.map((r) => {
      const e = (r.entity || '').toLowerCase();
      let related: any = null;
      if (r.entityId) {
        if (e === 'visitor') related = vMap[r.entityId] || null;
        else if (e === 'invite') related = iMap[r.entityId] || null;
        else if (e === 'user') related = uMap[r.entityId] || null;
      }
      return { ...r, related };
    });
  }
}
