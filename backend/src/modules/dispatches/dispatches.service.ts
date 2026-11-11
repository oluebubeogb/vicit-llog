import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isPlatformRole } from '../../common/utils/access';

const INCLUDE = {
  items: true,
  destinations: { include: { organisation: { select: { id: true, name: true, code: true } } } },
} as const;

@Injectable()
export class DispatchesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  private photoDir() {
    const dir = path.join(process.env.PHOTO_STORAGE_PATH || '/data/photos', 'dispatches');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private canOperate(actor: any) {
    return ['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN', 'ADMIN', 'GLOBAL_ADMIN'].includes(actor?.role);
  }

  private scopeWhere(actor: any) {
    if (isPlatformRole(actor.role) || actor.role === 'GLOBAL_ADMIN') return {};
    return {
      OR: [
        { createdById: actor.id },
        { destinations: { some: { organisationId: actor.orgId } } },
      ],
    };
  }

  async list(actor: any, status?: string) {
    if (!this.canOperate(actor)) throw new ForbiddenException();
    const where: any = { ...this.scopeWhere(actor) };
    if (status) where.status = status;
    const rows = await this.prisma.dispatch.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return this.withHosts(rows);
  }

  async one(actor: any, id: string) {
    const row = await this.prisma.dispatch.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException('Dispatch not found');
    if (!isPlatformRole(actor.role) && actor.role !== 'GLOBAL_ADMIN' && !this.canOperate(actor)) {
      const mine = row.destinations.some((d) => d.hostId === actor.id);
      if (!mine) throw new ForbiddenException();
    } else if (!isPlatformRole(actor.role) && actor.role !== 'GLOBAL_ADMIN') {
      const mine = row.createdById === actor.id || row.destinations.some((d) => d.organisationId === actor.orgId || d.hostId === actor.id);
      if (!mine) throw new NotFoundException('Dispatch not found');
    }
    const [hydrated] = await this.withHosts([row]);
    return hydrated;
  }

  async create(actor: any, body: any) {
    if (!['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN', 'GLOBAL_ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Only gate officers can register a dispatch');
    }
    const courierName = String(body.courierName || '').trim();
    if (courierName.length < 2) throw new BadRequestException('Courier name is required');
    const orgIds: string[] = Array.isArray(body.organisationIds) ? [...new Set((body.organisationIds as any[]).map((x: any) => String(x)))] : [];
    if (!orgIds.length) throw new BadRequestException('Choose at least one destination agency');
    const orgs = await this.prisma.organisation.findMany({ where: { id: { in: orgIds } }, select: { id: true, requireDispatchHostApproval: true } });
    if (orgs.length !== orgIds.length) throw new BadRequestException('One or more agencies could not be found');
    const items = Array.isArray(body.items)
      ? body.items.map((it: any) => ({
          description: String(it.description || it).trim().slice(0, 500),
          quantity: Math.max(1, Math.min(1000, Number(it.quantity) || 1)),
        })).filter((it: any) => it.description)
      : [];
    if (!items.length) throw new BadRequestException('List the items being delivered');
    const hosts: Record<string, string> = body.hosts && typeof body.hosts === 'object' ? body.hosts : {};
    const requireApproval = orgs.some((o) => o.requireDispatchHostApproval) || body.requireApproval === true;
    const row = await this.prisma.dispatch.create({
      data: {
        courierName,
        courierPhone: body.courierPhone ? String(body.courierPhone).trim().slice(0, 40) : null,
        courierCompany: body.courierCompany ? String(body.courierCompany).trim().slice(0, 160) : null,
        notes: body.notes ? String(body.notes).trim().slice(0, 2000) : null,
        photoPath: (Array.isArray(body.photoPaths) && body.photoPaths[0]) || body.photoPath || null,
        photoPaths: Array.isArray(body.photoPaths)
          ? body.photoPaths.map((p: any) => String(p)).filter(Boolean).slice(0, 10)
          : (body.photoPath ? [String(body.photoPath)] : []),
        createdById: actor.id,
        gateId: body.gateId || null,
        requireApproval,
        status: requireApproval ? 'AWAITING_APPROVAL' : 'REGISTERED',
        items: { create: items },
        destinations: {
          create: orgIds.map((organisationId) => ({
            organisationId,
            hostId: hosts[organisationId] || null,
            status: orgs.find((o) => o.id === organisationId)?.requireDispatchHostApproval ? 'PENDING' : 'APPROVED',
          })),
        },
      },
      include: INCLUDE,
    });
    await this.notifyRecipients(row, requireApproval);
    await this.audit.log({ action: 'DISPATCH_REGISTERED', entity: 'Dispatch', entityId: row.id, userId: actor.id, details: { orgIds, requireApproval } });
    const [hydrated] = await this.withHosts([row]);
    return hydrated;
  }

  async decide(actor: any, id: string, organisationId: string, approve: boolean, note?: string) {
    const row = await this.prisma.dispatch.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException('Dispatch not found');
    const dest = row.destinations.find((d) => d.organisationId === organisationId);
    if (!dest) throw new NotFoundException('This dispatch is not headed to that agency');
    const isHost = dest.hostId === actor.id;
    const isAdmin = (actor.role === 'ADMIN' && actor.orgId === organisationId) || actor.role === 'SUPER_ADMIN';
    if (!isHost && !isAdmin) throw new ForbiddenException('Only the host or an agency admin can decide');
    await this.prisma.dispatchDestination.update({
      where: { id: dest.id },
      data: { status: approve ? 'APPROVED' : 'DECLINED', decidedAt: new Date(), decidedById: actor.id, note: note ? String(note).slice(0, 500) : null },
    });
    const fresh = await this.prisma.dispatch.findUnique({ where: { id }, include: INCLUDE });
    const awaiting = fresh!.destinations.filter((d) => d.status === 'PENDING');
    const approved = fresh!.destinations.some((d) => d.status === 'APPROVED');
    const allDeclined = fresh!.destinations.every((d) => d.status === 'DECLINED');
    let status = fresh!.status;
    if (allDeclined) status = 'DECLINED';
    else if (!awaiting.length && approved) status = 'APPROVED';
    else if (awaiting.length) status = 'AWAITING_APPROVAL';
    if (status !== fresh!.status) {
      await this.prisma.dispatch.update({ where: { id }, data: { status } });
    }
    await this.audit.log({ action: approve ? 'DISPATCH_APPROVED' : 'DISPATCH_DECLINED', entity: 'Dispatch', entityId: id, userId: actor.id, details: { organisationId, note } });
    return this.one(actor, id);
  }

  async mark(actor: any, id: string, status: 'DELIVERED' | 'EXITED') {
    if (!['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN', 'GLOBAL_ADMIN'].includes(actor.role)) throw new ForbiddenException();
    const row = await this.prisma.dispatch.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException('Dispatch not found');
    if (row.requireApproval && row.status === 'AWAITING_APPROVAL') {
      throw new BadRequestException('Host approval is still outstanding for this dispatch');
    }
    if (row.status === 'DECLINED') throw new BadRequestException('This dispatch was declined');
    await this.prisma.dispatch.update({ where: { id }, data: { status } });
    await this.audit.log({ action: `DISPATCH_${status}`, entity: 'Dispatch', entityId: id, userId: actor.id });
    return this.one(actor, id);
  }

  async uploadPhoto(actor: any, file: Express.Multer.File) {
    if (!['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN', 'GLOBAL_ADMIN'].includes(actor.role)) throw new ForbiddenException();
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
    const filename = `dispatch-${uuidv4()}${ext}`;
    fs.writeFileSync(path.join(this.photoDir(), filename), file.buffer);
    return { photoPath: filename };
  }

  getPhotoPath(filename: string) {
    const filepath = path.join(this.photoDir(), path.basename(filename));
    if (!fs.existsSync(filepath)) throw new NotFoundException('Photo not found');
    return filepath;
  }

  private async notifyRecipients(row: any, requireApproval: boolean) {
    const recipientIds = new Set<string>();
    for (const dest of row.destinations || []) {
      if (dest.hostId) recipientIds.add(dest.hostId);
      const admins = await this.prisma.user.findMany({
        where: { organisationId: dest.organisationId, isActive: true, role: 'ADMIN' },
        select: { id: true },
      });
      for (const a of admins) recipientIds.add(a.id);
    }
    const title = requireApproval ? 'Dispatch awaiting approval' : 'Dispatch arriving';
    const body = `${row.courierName} is bringing items${row.items?.length ? ` (${row.items.map((i: any) => i.description).slice(0, 3).join(', ')})` : ''}.`;
    for (const userId of recipientIds) {
      await this.notifications.create({
        userId,
        title,
        body,
        meta: { type: 'DISPATCH', dispatchId: row.id, url: '/gate/dispatch' },
        link: '/gate/dispatch',
        channels: ['in_app'],
      }).catch(() => {});
    }
  }

  async inbox(actor: any) {
    if (!actor?.id) throw new ForbiddenException();
    const where: any = { acknowledgedAt: null, status: { not: 'DECLINED' } };
    if (isPlatformRole(actor.role)) {
      /* all outstanding receipts */
    } else if (actor.role === 'ADMIN') {
      where.organisationId = actor.orgId;
    } else {
      where.hostId = actor.id;
    }
    const dests = await this.prisma.dispatchDestination.findMany({
      where,
      include: {
        organisation: { select: { id: true, name: true, code: true } },
        dispatch: { include: { items: true } },
      },
      orderBy: { dispatch: { createdAt: 'desc' } },
      take: 40,
    });
    return dests.map((d) => ({
      id: d.id,
      dispatchId: d.dispatchId,
      organisation: d.organisation,
      hostId: d.hostId,
      status: d.status,
      acknowledgedAt: d.acknowledgedAt,
      dispatch: d.dispatch,
    }));
  }

  async acknowledge(actor: any, id: string, body: any) {
    const row = await this.prisma.dispatch.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new NotFoundException('Dispatch not found');
    const dest = row.destinations.find((d) => {
      if (body?.organisationId) return d.organisationId === body.organisationId;
      if (d.hostId === actor.id) return true;
      if (actor.role === 'ADMIN' && d.organisationId === actor.orgId) return true;
      return false;
    }) || (isPlatformRole(actor.role) ? row.destinations[0] : null);
    if (!dest) throw new ForbiddenException('You cannot acknowledge this dispatch');
    const can = isPlatformRole(actor.role) || dest.hostId === actor.id || (actor.role === 'ADMIN' && dest.organisationId === actor.orgId);
    if (!can) throw new ForbiddenException('You cannot acknowledge this dispatch');
    if (dest.acknowledgedAt) return this.one(actor, id);
    const comment = body?.comment || body?.note ? String(body.comment || body.note).trim().slice(0, 1000) : null;
    await this.prisma.dispatchDestination.update({
      where: { id: dest.id },
      data: { acknowledgedAt: new Date(), acknowledgedById: actor.id, acknowledgeComment: comment },
    });
    await this.audit.log({ action: 'DISPATCH_ACKNOWLEDGED', entity: 'Dispatch', entityId: id, userId: actor.id, details: { comment, organisationId: dest.organisationId } });
    return this.one(actor, id);
  }

  private async withHosts(rows: any[]) {
    const ids = [...new Set(rows.flatMap((r) => r.destinations.map((d: any) => d.hostId).filter(Boolean)))];
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, phone: true, role: true } })
      : [];
    const map = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      ...r,
      destinations: r.destinations.map((d: any) => ({ ...d, host: d.hostId ? map.get(d.hostId) || null : null })),
    }));
  }
}
