import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';
import { RingHub } from './ring.hub';

const RING_MS = 45_000;

@Injectable()
export class RingService implements OnModuleInit, OnModuleDestroy {
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private prisma: PrismaService,
    private hub: RingHub,
    private notifications: NotificationsService,
    private jwt: JwtService,
    private auth: AuthService,
  ) {}

  async onModuleInit() {
    const stale = await this.prisma.ringCall.findMany({
      where: { status: 'RINGING', createdAt: { lt: new Date(Date.now() - RING_MS) } },
      select: { id: true },
    });
    for (const row of stale) await this.finish(row.id, 'MISSED');
    const live = await this.prisma.ringCall.findMany({ where: { status: 'RINGING' }, select: { id: true, createdAt: true } });
    for (const row of live) this.arm(row.id, Math.max(1000, RING_MS - (Date.now() - row.createdAt.getTime())));
  }

  onModuleDestroy() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  async userFromToken(token?: string) {
    if (!token) throw new ForbiddenException('Sign in required');
    let payload: any;
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new ForbiddenException('Sign in required');
    }
    const user = await this.auth.validateUser(payload.sub);
    if (!user || !user.isActive) throw new ForbiddenException('Sign in required');
    return { id: user.id, email: user.email, role: user.role, permissions: user.permissions, orgId: user.organisationId, fullName: user.fullName };
  }

  async start(actor: any, input: { visitorId: string; direction: 'GATE_TO_HOST' | 'HOST_TO_GATE' }) {
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: input.visitorId },
      include: { invite: { include: { host: true, organisation: { select: { id: true, name: true } } } } },
    });
    if (!visitor) throw new NotFoundException('Visitor not found');
    if (visitor.status !== 'ARRIVED') throw new BadRequestException('Ring once the visitor is on site');

    const gateInfo = await this.gateContext(visitor, actor);
    let fromId = actor.id;
    let toUser: { id: string; fullName: string; phone: string | null; role: string };
    let gateId: string | null = gateInfo.gateId;

    if (input.direction === 'GATE_TO_HOST') {
      this.assertOfficer(actor, visitor, gateInfo.assigned);
      toUser = visitor.invite.host;
    } else {
      if (visitor.invite.hostId !== actor.id && actor.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only the host can ring the gate');
      if (!gateInfo.officer) throw new BadRequestException('No gate officer is assigned to ring');
      toUser = gateInfo.officer;
      gateId = gateInfo.gateId;
    }
    if (toUser.id === fromId) throw new BadRequestException('You cannot ring yourself');

    const previous = await this.prisma.ringCall.findMany({ where: { fromUserId: fromId, status: 'RINGING' }, select: { id: true } });
    for (const row of previous) await this.finish(row.id, 'CANCELLED');

    const targetBusy = await this.prisma.ringCall.findFirst({
      where: { toUserId: toUser.id, status: 'RINGING' },
      select: { id: true },
    });

    const call = await this.prisma.ringCall.create({
      data: {
        visitorId: visitor.id,
        fromUserId: fromId,
        toUserId: toUser.id,
        direction: input.direction,
        gateId,
        status: targetBusy ? 'BUSY' : 'RINGING',
        endedAt: targetBusy ? new Date() : null,
      },
    });

    const viewFor = async (userId: string) => this.present(call.id, userId);
    const callerView = await viewFor(fromId);
    const calleeView = await viewFor(toUser.id);
    this.hub.publish(fromId, { type: 'ring', call: callerView });
    if (!targetBusy) {
      this.hub.publish(toUser.id, { type: 'ring', call: calleeView });
      this.arm(call.id, RING_MS);
      const who = input.direction === 'GATE_TO_HOST' ? 'Gate is ringing' : 'Host is ringing';
      const where = callerView.gate?.name || callerView.gate?.location || 'the gate';
      await this.notifications.create({
        userId: toUser.id,
        title: who,
        body: `${visitor.fullName} · ${where}`,
        link: `/ring?call=${call.id}`,
        meta: { type: 'RING', callId: call.id, visitorId: visitor.id, url: `/ring?call=${call.id}` },
        channels: ['in_app'],
      });
    }
    return callerView;
  }

  async act(actor: any, id: string, action: 'accept' | 'decline' | 'busy' | 'cancel') {
    const call = await this.prisma.ringCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('Ring not found');
    if (call.status !== 'RINGING') return this.present(call.id, actor.id);
    const isCaller = call.fromUserId === actor.id;
    const isCallee = call.toUserId === actor.id;
    if (!isCaller && !isCallee && actor.role !== 'SUPER_ADMIN') throw new ForbiddenException('This ring is not for you');
    if (action === 'cancel' && !isCaller && actor.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only the caller can cancel');
    if (action !== 'cancel' && !isCallee && actor.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only the person being rung can answer');

    const status = action === 'accept' ? 'ACCEPTED' : action === 'decline' ? 'DECLINED' : action === 'busy' ? 'BUSY' : 'CANCELLED';
    await this.finish(call.id, status, action === 'accept');
    if (action === 'accept' && call.direction === 'GATE_TO_HOST') {
      await this.prisma.visitor.update({
        where: { id: call.visitorId },
        data: { hostAvailabilityStatus: 'AVAILABLE', hostWaitUntil: null, hostRespondedAt: new Date() },
      }).catch(() => {});
    }
    return this.present(call.id, actor.id);
  }

  async active(actor: any) {
    const call = await this.prisma.ringCall.findFirst({
      where: { status: 'RINGING', OR: [{ toUserId: actor.id }, { fromUserId: actor.id }] },
      orderBy: { createdAt: 'desc' },
    });
    return { call: call ? await this.present(call.id, actor.id) : null };
  }

  async one(actor: any, id: string) {
    const call = await this.prisma.ringCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('Ring not found');
    if (call.fromUserId !== actor.id && call.toUserId !== actor.id && actor.role !== 'SUPER_ADMIN') throw new ForbiddenException('This ring is not for you');
    return this.present(call.id, actor.id);
  }

  private arm(id: string, ms: number) {
    const prev = this.timers.get(id);
    if (prev) clearTimeout(prev);
    const timer = setTimeout(() => {
      this.timers.delete(id);
      this.finish(id, 'MISSED').catch(() => {});
    }, ms);
    this.timers.set(id, timer);
  }

  private async finish(id: string, status: string, answered = false) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    const current = await this.prisma.ringCall.findUnique({ where: { id } });
    if (!current || current.status !== 'RINGING') return;
    await this.prisma.ringCall.update({
      where: { id },
      data: { status, endedAt: new Date(), answeredAt: answered ? new Date() : current.answeredAt },
    });
    const [caller, callee] = await Promise.all([this.present(id, current.fromUserId), this.present(id, current.toUserId)]);
    this.hub.publish(current.fromUserId, { type: 'ring', call: caller });
    this.hub.publish(current.toUserId, { type: 'ring', call: callee });
  }

  private assertOfficer(actor: any, visitor: any, assigned: boolean) {
    if (actor.role === 'SUPER_ADMIN') return;
    if (!['GATE', 'GLOBAL_GATE'].includes(actor.role)) throw new ForbiddenException('Only a gate officer can ring the host');
    if (actor.role === 'GATE' && visitor.invite.organisationId !== actor.orgId) throw new NotFoundException('Visitor not found');
    if (!assigned && actor.role !== 'GLOBAL_GATE') throw new ForbiddenException('You are not assigned to this visitor’s gate');
  }

  private async gateContext(visitor: any, actor: any) {
    const visits = await this.prisma.gateVisit.findMany({
      where: { visitorId: visitor.id },
      orderBy: { occurredAt: 'desc' },
      select: { officerId: true, gateId: true, gate: { select: { id: true, name: true, location: { select: { name: true } } } } },
    });
    const gateId = visitor.gateId || visits[0]?.gateId || null;
    const officerIds: string[] = [];
    if (visitor.entryById) officerIds.push(visitor.entryById);
    for (const visit of visits) if (!officerIds.includes(visit.officerId)) officerIds.push(visit.officerId);
    if (gateId) {
      const assigned = await this.prisma.gateOfficerAssignment.findMany({ where: { gateId }, select: { userId: true } });
      for (const row of assigned) if (!officerIds.includes(row.userId)) officerIds.push(row.userId);
    }
    const actorAssigned = officerIds.includes(actor.id) || (gateId ? !!(await this.prisma.gateOfficerAssignment.findUnique({ where: { gateId_userId: { gateId, userId: actor.id } } })) : false);
    const users = officerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: officerIds }, isActive: true, role: { in: ['GATE', 'GLOBAL_GATE'] } },
          select: { id: true, fullName: true, phone: true, role: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const officer = officerIds.map((id) => byId.get(id)).find(Boolean) || null;
    const gate = visits[0]?.gate || (gateId ? await this.prisma.gate.findUnique({ where: { id: gateId }, select: { id: true, name: true, location: { select: { name: true } } } }) : null);
    return { gateId, officer, assigned: actorAssigned, gate };
  }

  private async present(id: string, viewerId: string) {
    const call = await this.prisma.ringCall.findUnique({
      where: { id },
      include: {
        visitor: {
          select: {
            id: true,
            fullName: true,
            status: true,
            phone: true,
            invite: { select: { purpose: true, hostId: true, locationId: true } },
          },
        },
      },
    });
    if (!call) throw new NotFoundException('Ring not found');
    const locationId = call.visitor.invite?.locationId;
    const [from, to, gate, location] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: call.fromUserId }, select: { id: true, fullName: true, role: true, phone: true } }),
      this.prisma.user.findUnique({ where: { id: call.toUserId }, select: { id: true, fullName: true, role: true, phone: true } }),
      call.gateId
        ? this.prisma.gate.findUnique({ where: { id: call.gateId }, select: { id: true, name: true, location: { select: { name: true } } } })
        : Promise.resolve(null),
      locationId ? this.prisma.location.findUnique({ where: { id: locationId }, select: { name: true } }) : Promise.resolve(null),
    ]);
    const other = viewerId === call.fromUserId ? to : from;
    return {
      id: call.id,
      status: call.status,
      direction: call.direction,
      createdAt: call.createdAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      expiresAt: new Date(call.createdAt.getTime() + RING_MS).toISOString(),
      youAre: viewerId === call.toUserId ? 'callee' : 'caller',
      visitor: { id: call.visitor.id, fullName: call.visitor.fullName, status: call.visitor.status, purpose: call.visitor.invite?.purpose || null },
      gate: gate ? { id: gate.id, name: gate.name, location: gate.location?.name || location?.name || null } : location ? { id: null, name: 'Gate', location: location.name } : null,
      from: from ? { id: from.id, fullName: from.fullName, role: from.role, phone: from.phone } : null,
      to: to ? { id: to.id, fullName: to.fullName, role: to.role, phone: to.phone } : null,
      phone: other?.phone || null,
    };
  }
}
