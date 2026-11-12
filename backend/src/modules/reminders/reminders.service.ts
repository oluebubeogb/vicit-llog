import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { fmtAppTime } from '../../common/utils/app-time';
import { publicFrontendBase } from '../../common/utils/urls';

type Kind = 'DAY' | 'HOUR';

/**
 * Visit reminders (v19).
 *  - DAY: 24 h before the visit, only when the visit was booked more than ~24 h ahead.
 *  - HOUR: 1 h before the visit.
 * Host gets in-app (with Confirm availability / Postpone) + email; guests with an email get an email.
 * Idempotent: each reminder is claimed with an atomic `updateMany ... where flag IS NULL`, so restarts
 * or several API replicas never double-send. Postponing an invite clears the flags.
 *
 * Env: REMINDERS_ENABLED (default "true"), REMINDER_INTERVAL_SECONDS (default 60).
 * With SMTP unset the in-app notifications are still created and the email skip is logged.
 */
@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Reminders');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mail: MailService,
    private audit: AuditService,
  ) {}

  onModuleInit() {
    if (String(process.env.REMINDERS_ENABLED ?? 'true').toLowerCase() === 'false') {
      this.logger.log('Visit reminders disabled (REMINDERS_ENABLED=false)');
      return;
    }
    const every = Math.max(15, parseInt(process.env.REMINDER_INTERVAL_SECONDS || '60', 10) || 60) * 1000;
    this.timer = setInterval(() => this.tick().catch((e) => this.logger.error(`tick failed: ${e?.message || e}`)), every);
    this.timer.unref?.();
    setTimeout(() => this.tick().catch(() => {}), 10_000).unref?.();
    this.logger.log(`Visit reminders on — checking every ${every / 1000}s`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = Date.now();
      const base: any = {
        status: { in: ['ACTIVE', 'USED', 'EXPIRED'] },
        cancelledAt: null,
        visitors: { some: { status: 'INVITED' } },
      };
      // DAY: inside the 24h window, still more than an hour away.
      const day = await this.prisma.invite.findMany({
        where: { ...base, reminderDaySentAt: null, expectedAt: { gt: new Date(now + 60 * 60000), lte: new Date(now + 24 * 3600000) } },
        select: { id: true, createdAt: true, postponedAt: true, expectedAt: true },
        take: 100,
      });
      for (const inv of day) {
        const bookedAt = (inv.postponedAt || inv.createdAt).getTime();
        // Only when the visit was booked "days apart" (> ~24h ahead).
        if (inv.expectedAt!.getTime() - bookedAt < 24 * 3600000 - 5 * 60000) {
          await this.prisma.invite.updateMany({ where: { id: inv.id, reminderDaySentAt: null }, data: { reminderDaySentAt: new Date(0) } });
          continue;
        }
        await this.send(inv.id, 'DAY');
      }
      // HOUR: inside the final hour, not yet started (15-minute grace).
      const hour = await this.prisma.invite.findMany({
        where: { ...base, reminderHourSentAt: null, expectedAt: { gt: new Date(now - 15 * 60000), lte: new Date(now + 60 * 60000) } },
        select: { id: true, createdAt: true, postponedAt: true, expectedAt: true },
        take: 100,
      });
      for (const inv of hour) {
        const bookedAt = (inv.postponedAt || inv.createdAt).getTime();
        if (inv.expectedAt!.getTime() - bookedAt < 70 * 60000) {
          // Booked less than ~an hour ahead: a reminder would arrive with the invite itself.
          await this.prisma.invite.updateMany({ where: { id: inv.id, reminderHourSentAt: null }, data: { reminderHourSentAt: new Date(0) } });
          continue;
        }
        await this.send(inv.id, 'HOUR');
      }
    } finally {
      this.running = false;
    }
  }

  private async send(inviteId: string, kind: Kind) {
    const flag = kind === 'DAY' ? 'reminderDaySentAt' : 'reminderHourSentAt';
    const claim = await this.prisma.invite.updateMany({ where: { id: inviteId, [flag]: null }, data: { [flag]: new Date() } });
    if (claim.count !== 1) return; // someone else sent it
    const invite = await this.prisma.invite.findUnique({
      where: { id: inviteId },
      include: { visitors: true, host: { select: { id: true, fullName: true, email: true } }, organisation: { select: { id: true, name: true, customDomain: true } } },
    });
    if (!invite?.expectedAt) return;
    const when = fmtAppTime(invite.expectedAt);
    const lead = kind === 'DAY' ? 'tomorrow' : 'in about 1 hour';
    const guests = invite.visitors.filter((v) => v.status === 'INVITED');
    const names = guests.map((v) => v.fullName).join(', ');
    const base = publicFrontendBase(invite.organisation?.customDomain);

    await this.notifications.create({
      userId: invite.hostId,
      title: kind === 'DAY' ? 'Visit tomorrow' : 'Visit in 1 hour',
      body: `${names || 'Your guest'} — "${invite.purpose}" ${lead} (${when}). Confirm you are available or postpone.`,
      meta: { type: 'VISIT_REMINDER', kind, inviteId, expectedAt: invite.expectedAt.toISOString(), actions: ['confirm-availability', 'postpone'] },
      channels: ['in_app'],
    }).catch((e) => this.logger.warn(`in-app reminder failed: ${e?.message}`));

    if (!this.mail.isEnabled()) {
      this.logger.log(`[reminder:${kind}] SMTP not configured — in-app only for invite ${inviteId}`);
    } else {
      if (invite.host.email) {
        await this.mail.sendNotice({
          to: invite.host.email,
          organisationId: invite.organisationId,
          subject: `Reminder: ${invite.purpose} ${lead}`,
          eyebrow: kind === 'DAY' ? 'Tomorrow' : 'In 1 hour',
          title: `Your visitor${guests.length > 1 ? 's arrive' : ' arrives'} ${lead}`,
          paragraphs: [`${names} — "${invite.purpose}".`, 'Open the app to confirm you are available, or postpone to a new date and time.'],
          facts: [['Date & time', when]],
          button: base ? { href: `${base}/notifications`, label: 'Confirm or postpone' } : null,
        }).catch(() => null);
      }
      for (const v of guests) {
        if (!v.email) continue;
        await this.mail.sendNotice({
          to: v.email,
          organisationId: invite.organisationId,
          subject: `Reminder: your visit ${lead}`,
          eyebrow: kind === 'DAY' ? 'Tomorrow' : 'In 1 hour',
          title: `Hello ${v.fullName}, see you ${lead}`,
          paragraphs: [`${invite.host.fullName} is expecting you for "${invite.purpose}".`, v.photoPath ? 'Show your gate QR code on arrival.' : 'Please complete your registration (a quick photo) before you arrive.'],
          facts: [['Date & time', when], ['Host', invite.host.fullName], ['Gate passphrase', invite.passphrase]],
          button: base ? { href: `${base}/visitor/${invite.token}`, label: v.photoPath ? 'View my gate pass' : 'Complete registration' } : null,
        }).catch(() => null);
      }
    }
    await this.audit.log({
      action: 'INVITE_REMINDER_SENT',
      entity: 'Invite',
      entityId: inviteId,
      details: { kind, expectedAt: invite.expectedAt.toISOString(), guestsEmailed: this.mail.isEnabled() ? guests.filter((g) => g.email).length : 0, smtp: this.mail.isEnabled() },
    }).catch(() => {});
  }
}
