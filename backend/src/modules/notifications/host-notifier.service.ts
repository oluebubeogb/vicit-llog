import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from './notifications.service';
import { fmtAppTime } from '../../common/utils/app-time';
import { publicFrontendBase } from '../../common/utils/urls';

export type HostEmail = 'now' | 'digest' | 'none';

type DigestLine = { guest: string; text: string; at: Date };
type Digest = { to: string; hostName: string; organisationId: string; purpose: string; customDomain?: string | null; lines: DigestLine[]; timer: NodeJS.Timeout };

/**
 * v31 host notifications for every visitor event.
 *  - In-app (+ push, + live SSE through NotificationsService) for every event.
 *  - Email: urgent events right away; checkpoint progress is batched into ONE email per invite
 *    per window (HOST_DIGEST_SECONDS, default 60), so a group of 3 passing 2 gates sends one email.
 *  - Overstay: one alert per guest when they are still inside OVERSTAY_GRACE_MINUTES (default 30)
 *    after the visit's end time (invite.expiresAt). Claimed atomically (Visitor.overstayNotifiedAt).
 */
@Injectable()
export class HostNotifierService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('HostNotifier');
  private digests = new Map<string, Digest>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private prisma: PrismaService, private notifications: NotificationsService, private mail: MailService) {}

  onModuleInit() {
    if (String(process.env.OVERSTAY_ALERTS ?? 'true').toLowerCase() === 'false') return;
    const every = Math.max(5, parseInt(process.env.OVERSTAY_INTERVAL_SECONDS || '60', 10) || 60) * 1000;
    this.timer = setInterval(() => this.overstayTick().catch((e) => this.logger.warn(`overstay tick failed: ${e?.message || e}`)), every);
    this.timer.unref?.();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    for (const id of Array.from(this.digests.keys())) await this.flushDigest(id).catch(() => null);
  }

  digestSeconds() {
    return Math.max(1, parseInt(process.env.HOST_DIGEST_SECONDS || '60', 10) || 60);
  }

  /** Notify the host of one guest. Never throws: a failed alert must not undo a gate action. */
  async visitorEvent(visitorId: string, ev: { type: string; title: string; body: string; email?: HostEmail; emailTitle?: string; emailLine?: string; facts?: Array<[string, string | null | undefined]>; meta?: any; channels?: Array<'in_app' | 'sms' | 'whatsapp'> }) {
    try {
      const v = await this.prisma.visitor.findUnique({
        where: { id: visitorId },
        include: { invite: { include: { host: { select: { id: true, fullName: true, email: true, phone: true } }, organisation: { select: { id: true, customDomain: true } } } } },
      });
      if (!v?.invite?.host) return null;
      const host = v.invite.host;
      const n = await this.notifications.create({
        userId: host.id,
        title: ev.title,
        body: ev.body,
        meta: { visitorId, inviteId: v.inviteId, type: ev.type, url: '/notifications', ...(ev.meta || {}) },
        channels: ev.channels || ['in_app'],
        phone: host.phone || undefined,
      });
      const mode = ev.email || 'none';
      if (host.email && mode === 'now') {
        const base = publicFrontendBase(v.invite.organisation?.customDomain);
        await this.mail.sendNotice({
          to: host.email,
          organisationId: v.invite.organisationId,
          subject: `${ev.emailTitle || ev.title}: ${v.fullName}`,
          eyebrow: 'Visitor update',
          title: ev.emailTitle || ev.title,
          paragraphs: [ev.body],
          facts: [['Visit', v.invite.purpose], ['Guest', v.fullName], ['Time', fmtAppTime(new Date())], ...(ev.facts || [])],
          button: base ? { href: `${base}/notifications`, label: 'Open Vicit' } : null,
        }).catch((e) => this.logger.warn(`host email failed: ${e?.message || e}`));
      } else if (host.email && mode === 'digest') {
        this.addToDigest(v.inviteId, { to: host.email, hostName: host.fullName, organisationId: v.invite.organisationId, purpose: v.invite.purpose, customDomain: v.invite.organisation?.customDomain }, { guest: v.fullName, text: ev.emailLine || ev.body, at: new Date() });
      }
      return n;
    } catch (e: any) {
      this.logger.warn(`host notification failed (${ev.type}): ${e?.message || e}`);
      return null;
    }
  }

  private addToDigest(inviteId: string, head: Omit<Digest, 'lines' | 'timer'>, line: DigestLine) {
    const cur = this.digests.get(inviteId);
    if (cur) {
      cur.lines.push(line);
      return;
    }
    const timer = setTimeout(() => this.flushDigest(inviteId).catch(() => null), this.digestSeconds() * 1000);
    timer.unref?.();
    this.digests.set(inviteId, { ...head, lines: [line], timer });
  }

  /** Send the batched checkpoint email for one invite now. */
  async flushDigest(inviteId: string) {
    const d = this.digests.get(inviteId);
    if (!d) return false;
    this.digests.delete(inviteId);
    clearTimeout(d.timer);
    const guests = Array.from(new Set(d.lines.map((l) => l.guest)));
    const base = publicFrontendBase(d.customDomain);
    await this.mail.sendNotice({
      to: d.to,
      organisationId: d.organisationId,
      subject: `Gate updates: ${d.purpose}`,
      eyebrow: 'Gate progress',
      title: guests.length > 1 ? `${guests.length} of your guests are moving through the gates` : `${guests[0]} is moving through the gates`,
      paragraphs: d.lines.map((l) => `${fmtAppTime(l.at)} · ${l.guest}: ${l.text}`),
      facts: [['Visit', d.purpose]],
      button: base ? { href: `${base}/notifications`, label: 'Open Vicit' } : null,
    }).catch((e) => this.logger.warn(`digest email failed: ${e?.message || e}`));
    return true;
  }

  pendingDigests() {
    return Array.from(this.digests.entries()).map(([inviteId, d]) => ({ inviteId, lines: d.lines.length }));
  }

  /** v31: guests still inside 30 min after the visit end time. One alert per guest. */
  async overstayTick() {
    if (this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      const grace = Math.max(0, parseInt(process.env.OVERSTAY_GRACE_MINUTES || '30', 10) || 30);
      const cutoff = new Date(Date.now() - grace * 60000);
      const rows = await this.prisma.visitor.findMany({
        // Only visits that ended in the last 24 h: older open records are stale data, not live overstays.
        where: { status: 'ARRIVED', overstayNotifiedAt: null, invite: { expiresAt: { lte: cutoff, gte: new Date(Date.now() - 24 * 3600000) } } },
        include: { invite: { select: { expiresAt: true } } },
        take: 100,
      });
      for (const v of rows) {
        const claim = await this.prisma.visitor.updateMany({ where: { id: v.id, overstayNotifiedAt: null, status: 'ARRIVED' }, data: { overstayNotifiedAt: new Date() } });
        if (claim.count !== 1) continue;
        const mins = Math.round((Date.now() - v.invite.expiresAt.getTime()) / 60000);
        await this.visitorEvent(v.id, {
          type: 'VISITOR_OVERSTAY',
          title: 'Visitor still on site',
          body: `${v.fullName} is still inside ${mins} min after the visit ended (${fmtAppTime(v.invite.expiresAt)}).`,
          email: 'now',
          emailTitle: 'Visitor overstay',
        });
        sent++;
      }
    } finally {
      this.running = false;
    }
    return sent;
  }
}
