import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { sendSms } from './providers/sms.provider';
import { sendWhatsApp } from './providers/whatsapp.provider';
import { isPushReady, pushEnabledFlag, sendPush } from './providers/push.provider';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create in-app notification and fan-out to SMS / WhatsApp (when requested)
   * and Firebase web push (every in-app notification, when ENABLE_PUSH + service account).
   */
  async create(data: {
    userId: string;
    title: string;
    body: string;
    meta?: any;
    channels?: Array<'in_app' | 'sms' | 'whatsapp'>;
    phone?: string;
  }) {
    const channels = data.channels?.length ? data.channels : ['in_app'];
    const primaryChannel = channels.includes('in_app') ? 'in_app' : channels[0];

    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        body: data.body,
        channel: primaryChannel,
        meta: {
          ...(data.meta || {}),
          channels,
          phone: data.phone || null,
        },
      },
    });

    const message = `${data.title}\n${data.body}`;
    const delivery: Record<string, any> = {};

    if (channels.includes('sms') && data.phone) {
      delivery.sms = await sendSms(data.phone, message);
      if (!delivery.sms.ok) {
        this.logger.warn(`SMS failed for user ${data.userId}: ${delivery.sms.error}`);
      }
    }

    if (channels.includes('whatsapp') && data.phone) {
      delivery.whatsapp = await sendWhatsApp(data.phone, message);
      if (!delivery.whatsapp.ok) {
        this.logger.warn(`WhatsApp failed for user ${data.userId}: ${delivery.whatsapp.error}`);
      }
    }

    if (channels.includes('in_app') && pushEnabledFlag()) {
      try {
        delivery.push = await this.pushToUser(data.userId, {
          title: data.title,
          body: data.body,
          notificationId: notification.id,
        });
      } catch (e: any) {
        delivery.push = { ok: false, error: e?.message || String(e) };
        this.logger.warn(`Push failed for user ${data.userId}: ${delivery.push.error}`);
      }
    }

    if (Object.keys(delivery).length) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { meta: { ...(notification.meta as any), delivery } },
      });
    }

    return notification;
  }

  /** Send an FCM push to every registered device of a user; prunes dead tokens. */
  private async pushToUser(userId: string, msg: { title: string; body: string; notificationId: string }) {
    const devices = await (this.prisma as any).pushDevice.findMany({
      where: { userId },
      select: { token: true },
    });
    const tokens: string[] = devices.map((d: any) => d.token);
    if (!tokens.length) return { ok: false, sent: 0, devices: 0, error: 'No registered devices' };
    const url = '/notifications';
    const res = await sendPush(tokens, {
      title: msg.title,
      body: msg.body,
      link: url,
      data: { url, notificationId: msg.notificationId },
    });
    if (res.invalidTokens.length) {
      await (this.prisma as any).pushDevice
        .deleteMany({ where: { token: { in: res.invalidTokens } } })
        .catch(() => {});
    }
    if (!res.ok && res.error) this.logger.warn(`Push not delivered for user ${userId}: ${res.error}`);
    return {
      ok: res.ok,
      sent: res.sent,
      failed: res.failed,
      devices: tokens.length,
      pruned: res.invalidTokens.length,
      ...(res.error ? { error: res.error } : {}),
    };
  }

  async registerPushToken(userId: string, dto: { token: string; platform?: string; userAgent?: string }) {
    const token = dto.token.trim();
    const platform = (dto.platform || 'web').slice(0, 32);
    const userAgent = dto.userAgent ? dto.userAgent.slice(0, 512) : null;
    // Upsert by token: a shared device that logs in as another user is reassigned.
    await (this.prisma as any).pushDevice.upsert({
      where: { token },
      update: { userId, platform, userAgent },
      create: { userId, token, platform, userAgent },
    });
    return { ok: true, enabled: isPushReady() };
  }

  async removePushToken(userId: string, token: string) {
    const r = await (this.prisma as any).pushDevice.deleteMany({ where: { token: token.trim(), userId } });
    return { ok: true, removed: r.count };
  }

  pushStatus() {
    return { enabled: isPushReady() };
  }

  /**
   * Notifications enriched with human context (visitor, invite, officers, gate, duration)
   * resolved from the ids stored in meta, so the UI never has to show raw UUIDs.
   * Lookups are scoped to the viewer's organisation.
   */
  async findForUser(userId: string, orgId?: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const visitorIds = new Set<string>();
    const inviteIds = new Set<string>();
    const requestIds = new Set<string>();
    for (const n of rows) {
      const m: any = n.meta || {};
      if (typeof m.visitorId === 'string') visitorIds.add(m.visitorId);
      if (typeof m.inviteId === 'string') inviteIds.add(m.inviteId);
      if (typeof m.requestId === 'string') requestIds.add(m.requestId);
    }
    const orgScope = orgId ? { organisationId: orgId } : {};

    const [visitors, invites, requests] = await Promise.all([
      visitorIds.size
        ? this.prisma.visitor.findMany({
            where: { id: { in: [...visitorIds] }, invite: orgScope },
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              address: true,
              photoPath: true,
              status: true,
              entryMode: true,
              enteredAt: true,
              exitedAt: true,
              deniedAt: true,
              deniedReason: true,
              gateNotes: true,
              gateId: true,
              entryById: true,
              exitById: true,
              createdAt: true,
              updatedAt: true,
              inviteId: true,
            },
          })
        : Promise.resolve([] as any[]),
      inviteIds.size
        ? this.prisma.invite.findMany({
            where: { id: { in: [...inviteIds] }, ...orgScope },
            select: {
              id: true,
              purpose: true,
              category: true,
              status: true,
              expectedAt: true,
              expectedMode: true,
              guestCount: true,
              createdAt: true,
              locationId: true,
              host: { select: { id: true, fullName: true, portfolio: true } },
              visitors: { select: { id: true, fullName: true, status: true, photoPath: true } },
            },
          })
        : Promise.resolve([] as any[]),
      requestIds.size
        ? (this.prisma as any).profileEditRequest.findMany({
            where: { id: { in: [...requestIds] } },
            select: { id: true, status: true, before: true, after: true, reviewedAt: true, reviewNote: true, reviewedById: true },
          })
        : Promise.resolve([] as any[]),
    ]);

    const officerIds = new Set<string>();
    const gateIds = new Set<string>();
    const locationIds = new Set<string>();
    for (const v of visitors) {
      if (v.entryById) officerIds.add(v.entryById);
      if (v.exitById) officerIds.add(v.exitById);
      if (v.gateId) gateIds.add(v.gateId);
    }
    for (const i of invites) if (i.locationId) locationIds.add(i.locationId);
    for (const r of requests) if (r.reviewedById) officerIds.add(r.reviewedById);

    const [officers, gates, locations] = await Promise.all([
      officerIds.size
        ? this.prisma.user.findMany({
            where: { id: { in: [...officerIds] } },
            select: { id: true, fullName: true, role: true },
          })
        : Promise.resolve([] as any[]),
      gateIds.size
        ? this.prisma.gate.findMany({
            where: { id: { in: [...gateIds] } },
            select: { id: true, name: true, location: { select: { name: true } } },
          })
        : Promise.resolve([] as any[]),
      locationIds.size
        ? this.prisma.location.findMany({
            where: { id: { in: [...locationIds] } },
            select: { id: true, name: true },
          })
        : Promise.resolve([] as any[]),
    ]);

    const by = <T extends { id: string }>(xs: T[]) => Object.fromEntries(xs.map((x) => [x.id, x]));
    const vMap = by(visitors);
    const iMap = by(invites);
    const rMap = by(requests as any[]);
    const oMap = by(officers);
    const gMap = by(gates);
    const lMap = by(locations);

    // invites referenced only via a visitor
    const missingInviteIds = visitors.map((v) => v.inviteId).filter((id) => !iMap[id]);
    if (missingInviteIds.length) {
      const extra = await this.prisma.invite.findMany({
        where: { id: { in: [...new Set(missingInviteIds)] }, ...orgScope },
        select: {
          id: true,
          purpose: true,
          category: true,
          status: true,
          expectedAt: true,
          expectedMode: true,
          guestCount: true,
          createdAt: true,
          locationId: true,
          host: { select: { id: true, fullName: true, portfolio: true } },
          visitors: { select: { id: true, fullName: true, status: true, photoPath: true } },
        },
      });
      for (const i of extra) iMap[i.id] = i;
    }

    return rows.map((n) => {
      const m: any = n.meta || {};
      const v = m.visitorId ? vMap[m.visitorId] : null;
      const inv = (m.inviteId && iMap[m.inviteId]) || (v && iMap[v.inviteId]) || null;
      const req = m.requestId ? rMap[m.requestId] : null;
      const context: any = {};
      if (v) {
        const durationMinutes =
          v.enteredAt && v.exitedAt
            ? Math.max(0, Math.round((+new Date(v.exitedAt) - +new Date(v.enteredAt)) / 60000))
            : v.enteredAt && v.status === 'ARRIVED'
              ? Math.max(0, Math.round((Date.now() - +new Date(v.enteredAt)) / 60000))
              : null;
        const gate = v.gateId ? gMap[v.gateId] : null;
        context.visitor = {
          ...v,
          entryBy: v.entryById ? oMap[v.entryById] || null : null,
          exitBy: v.exitById ? oMap[v.exitById] || null : null,
          gate: gate ? { name: gate.name, location: gate.location?.name } : null,
          durationMinutes,
          onSite: v.status === 'ARRIVED',
        };
      }
      if (inv) {
        context.invite = {
          ...inv,
          location: inv.locationId ? lMap[inv.locationId]?.name || null : null,
        };
      }
      if (req) {
        context.request = {
          ...req,
          reviewedBy: req.reviewedById ? oMap[req.reviewedById] || null : null,
        };
      }
      return { ...n, context: Object.keys(context).length ? context : null };
    });
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
