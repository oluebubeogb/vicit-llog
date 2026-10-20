import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { sendSms } from './providers/sms.provider';
import { sendWhatsApp } from './providers/whatsapp.provider';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create in-app notification and optionally fan-out to SMS / WhatsApp.
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

    if (Object.keys(delivery).length) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { meta: { ...(notification.meta as any), delivery } },
      });
    }

    return notification;
  }

  async findForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
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
