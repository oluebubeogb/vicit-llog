import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthService } from '../auth/auth.service';
import { RingHub } from './ring.hub';

const RING_MS = 45_000;
const USER_SELECT = { id: true, fullName: true, phone: true, role: true, isActive: true } as const;
const PLATFORM = ['SUPER_ADMIN', 'GLOBAL_ADMIN', 'GLOBAL_GATE'];
const GATE_ROLES = ['GATE', 'GLOBAL_GATE'];
const INITIATOR_ROLES = ['GATE', 'GLOBAL_GATE', 'SUPER_ADMIN', 'GLOBAL_ADMIN'];

@Injectable()
export class RingService implements OnModuleInit, OnModuleDestroy {
  private timers = new Map<string, NodeJS.Timeout>();
  /** Missed call-back cascades, keyed by the original (root) call id. */
  private cascades = new Map<string, { actorId: string; remaining: string[]; visitorId?: string | null; dispatchId?: string | null; gateId?: string | null; hostId?: string | null; parentCallId: string }>();

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

  async start(actor: any, input: { visitorId?: string; dispatchId?: string; hostId?: string; direction: 'GATE_TO_HOST' | 'HOST_TO_GATE' }) {
    if (input.dispatchId) return this.startDispatch(actor, input);
    if (!input.visitorId) throw new BadRequestException('Visitor or dispatch is required');
    const visitor = await this.prisma.visitor.findUnique({
      where: { id: input.visitorId },
      include: { invite: { include: { host: true, organisation: { select: { id: true, name: true } } } } },
    });
    if (!visitor) throw new NotFoundException('Visitor not found');
    if (visitor.status !== 'ARRIVED') throw new BadRequestException('Ring once the visitor is on site');

    const gateInfo = await this.gateContext(visitor, actor);
    const last = await this.lastCall({ visitorId: visitor.id });

    if (input.direction === 'GATE_TO_HOST') {
      this.assertOfficer(actor, visitor, gateInfo.assigned);
      const host = visitor.invite.host;
      if (!host) throw new BadRequestException('This visitor has no host to ring');
      if (host.id === actor.id) throw new BadRequestException('You cannot ring yourself');
      const officerId = await this.resolveGateOfficerId(actor, gateInfo.gateId, last);
      return this.placeRing({
        actor,
        toUserId: host.id,
        direction: 'GATE_TO_HOST',
        visitorId: visitor.id,
        gateId: gateInfo.gateId,
        callerUserId: actor.id,
        calleeUserId: host.id,
        gateOfficerUserId: officerId,
        subject: visitor.fullName,
      });
    }

    // Host (or a platform viewer) ringing the gate / original initiator.
    const isHost = visitor.invite.hostId === actor.id;
    if (!isHost && !PLATFORM.includes(actor.role)) throw new ForbiddenException('Only the host can ring the gate');
    const chain = await this.returnTargetIds({
      actorId: actor.id,
      visitorId: visitor.id,
      gateId: gateInfo.gateId,
      last,
      entryById: visitor.entryById,
    });
    if (!chain.length) {
      throw new BadRequestException('No one is available to call back. The original caller and any gate officers could not be found.');
    }
    const picked = this.pickTarget(chain, actor.id, true);
    if (!picked.target) throw new BadRequestException('No one is available to call back.');
    const officerId = last?.gateOfficerUserId || gateInfo.officer?.id || picked.target;
    const view = await this.placeRing({
      actor,
      toUserId: picked.target,
      direction: 'HOST_TO_GATE',
      visitorId: visitor.id,
      gateId: gateInfo.gateId,
      callerUserId: actor.id,
      calleeUserId: picked.target,
      gateOfficerUserId: officerId,
      subject: visitor.fullName,
    });
    if (picked.rest.length) {
      this.cascades.set(view.id, {
        actorId: actor.id,
        remaining: picked.rest,
        visitorId: visitor.id,
        gateId: gateInfo.gateId,
        parentCallId: view.id,
      });
    }
    return view;
  }

  async callback(actor: any, callId: string) {
    const parent = await this.prisma.ringCall.findUnique({ where: { id: callId } });
    if (!parent) throw new NotFoundException('Call not found');
    if (!this.canView(actor, parent)) throw new ForbiddenException('This call is not for you');
    if (['RINGING', 'ACCEPTED'].includes(parent.status)) {
      throw new BadRequestException('Finish the current call before calling back');
    }
    const rootId = parent.parentCallId || parent.id;
    const hostId = await this.hostIdFromCall(parent);
    const actorIsHost = !!hostId && hostId === actor.id;
    const actorIsGateSide = [parent.callerUserId, parent.fromUserId, parent.gateOfficerUserId].includes(actor.id)
      || INITIATOR_ROLES.includes(actor.role);

    let chain: string[] = [];
    let direction: 'GATE_TO_HOST' | 'HOST_TO_GATE';
    if (actorIsHost && !actorIsGateSide) {
      direction = 'HOST_TO_GATE';
      chain = await this.returnTargetIds({
        actorId: actor.id,
        visitorId: parent.visitorId,
        dispatchId: parent.dispatchId,
        gateId: parent.gateId,
        last: parent,
      });
    } else if (actorIsGateSide || PLATFORM.includes(actor.role)) {
      direction = 'GATE_TO_HOST';
      if (hostId && hostId !== actor.id) chain = [hostId];
      // If the original call was already host→gate, the host is the original caller.
      if (parent.direction === 'HOST_TO_GATE' && parent.callerUserId && parent.callerUserId !== actor.id) {
        chain = [parent.callerUserId, ...chain];
      }
    } else {
      throw new ForbiddenException('You cannot call back on this ring');
    }
    const picked = this.pickTarget(chain, actor.id, true);
    if (!picked.target) {
      throw new BadRequestException('No one is available to call back.');
    }
    const officerId = await this.resolveGateOfficerId(actor, parent.gateId, parent);
    const subject = parent.visitorId
      ? (await this.prisma.visitor.findUnique({ where: { id: parent.visitorId }, select: { fullName: true } }))?.fullName
      : parent.dispatchId
        ? (await this.prisma.dispatch.findUnique({ where: { id: parent.dispatchId }, select: { courierName: true } }))?.courierName
        : 'Call back';
    const view = await this.placeRing({
      actor,
      toUserId: picked.target,
      direction,
      visitorId: parent.visitorId,
      dispatchId: parent.dispatchId,
      gateId: parent.gateId,
      callerUserId: actor.id,
      calleeUserId: picked.target,
      gateOfficerUserId: officerId,
      parentCallId: rootId,
      subject: subject || 'Call back',
    });
    if (picked.rest.length) {
      this.cascades.set(rootId, {
        actorId: actor.id,
        remaining: picked.rest,
        visitorId: parent.visitorId,
        dispatchId: parent.dispatchId,
        gateId: parent.gateId,
        hostId,
        parentCallId: rootId,
      });
    }
    return view;
  }

  async act(actor: any, id: string, action: 'accept' | 'decline' | 'busy' | 'cancel' | 'hangup') {
    const call = await this.prisma.ringCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('Ring not found');
    const isCaller = call.fromUserId === actor.id;
    const isCallee = call.toUserId === actor.id;
    if (!isCaller && !isCallee && !this.canView(actor, call)) throw new ForbiddenException('This ring is not for you');

    if (action === 'hangup') {
      if (call.status !== 'RINGING' && call.status !== 'ACCEPTED') return this.present(call.id, actor.id);
      const status = call.status === 'ACCEPTED' ? 'ENDED' : isCaller ? 'CANCELLED' : 'DECLINED';
      await this.finish(call.id, status, call.status === 'ACCEPTED');
      return this.present(call.id, actor.id);
    }

    if (call.status !== 'RINGING') return this.present(call.id, actor.id);
    if (action === 'cancel' && !isCaller && !PLATFORM.includes(actor.role)) throw new ForbiddenException('Only the caller can cancel');
    if (action !== 'cancel' && !isCallee && !PLATFORM.includes(actor.role)) throw new ForbiddenException('Only the person being rung can answer');

    if (action === 'accept') {
      await this.acceptCall(call);
      return this.present(call.id, actor.id);
    }

    const status = action === 'decline' ? 'DECLINED' : action === 'busy' ? 'BUSY' : 'CANCELLED';
    await this.finish(call.id, status, false);
    return this.present(call.id, actor.id);
  }

  iceServers() {
    const iceServers: Array<Record<string, any>> = [{ urls: 'stun:stun.l.google.com:19302' }];
    const urls = (process.env.TURN_URL || '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length) {
      iceServers.push({
        urls: urls.length === 1 ? urls[0] : urls,
        username: process.env.TURN_USERNAME || undefined,
        credential: process.env.TURN_CREDENTIAL || undefined,
      });
    }
    return { iceServers };
  }

  async signal(actor: any, id: string, payload: { type: string; sdp?: string; candidate?: any }) {
    const call = await this.prisma.ringCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('Ring not found');
    if (call.fromUserId !== actor.id && call.toUserId !== actor.id && !this.canView(actor, call)) {
      throw new ForbiddenException('This ring is not for you');
    }
    if (call.status !== 'ACCEPTED') throw new BadRequestException('Voice can only be negotiated after the ring is answered');
    const other = actor.id === call.fromUserId ? call.toUserId : call.fromUserId;
    this.hub.publish(other, { type: 'signal', callId: id, from: actor.id, payload });
    return { ok: true };
  }

  private async acceptCall(call: { id: string; visitorId: string | null; direction: string; fromUserId: string; toUserId: string }) {
    const timer = this.timers.get(call.id);
    if (timer) clearTimeout(timer);
    this.timers.delete(call.id);
    const current = await this.prisma.ringCall.findUnique({ where: { id: call.id } });
    if (!current || current.status !== 'RINGING') return;
    await this.prisma.ringCall.update({
      where: { id: call.id },
      data: { status: 'ACCEPTED', answeredAt: new Date(), endedAt: null },
    });
    if (call.direction === 'GATE_TO_HOST' && call.visitorId) {
      await this.prisma.visitor.update({
        where: { id: call.visitorId },
        data: { hostAvailabilityStatus: 'AVAILABLE', hostWaitUntil: null, hostRespondedAt: new Date() },
      }).catch(() => {});
    }
    // A successful answer cancels any pending fallback cascade.
    const root = current.parentCallId || current.id;
    this.cascades.delete(root);
    const [caller, callee] = await Promise.all([this.present(call.id, call.fromUserId), this.present(call.id, call.toUserId)]);
    this.hub.publish(call.fromUserId, { type: 'ring', call: caller });
    this.hub.publish(call.toUserId, { type: 'ring', call: callee });
  }

  async active(actor: any) {
    const call = await this.prisma.ringCall.findFirst({
      where: { status: { in: ['RINGING', 'ACCEPTED'] }, OR: [{ toUserId: actor.id }, { fromUserId: actor.id }] },
      orderBy: { createdAt: 'desc' },
    });
    return { call: call ? await this.present(call.id, actor.id) : null };
  }

  async one(actor: any, id: string) {
    const call = await this.prisma.ringCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('Ring not found');
    if (!this.canView(actor, call)) throw new ForbiddenException('This ring is not for you');
    return this.present(call.id, actor.id);
  }

  async recent(actor: any) {
    const where: any = PLATFORM.includes(actor.role)
      ? {}
      : {
          OR: [
            { fromUserId: actor.id },
            { toUserId: actor.id },
            { callerUserId: actor.id },
            { calleeUserId: actor.id },
            { gateOfficerUserId: actor.id },
          ],
        };
    const rows = await this.prisma.ringCall.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    return Promise.all(rows.map((row) => this.present(row.id, actor.id)));
  }

  private async startDispatch(actor: any, input: { dispatchId?: string; hostId?: string; direction: 'GATE_TO_HOST' | 'HOST_TO_GATE' }) {
    const dispatch = await this.prisma.dispatch.findUnique({
      where: { id: input.dispatchId },
      include: { destinations: true },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');
    let hostId = input.hostId || dispatch.destinations.find((d) => d.hostId)?.hostId || null;
    const last = await this.lastCall({ dispatchId: dispatch.id });
    if (input.direction === 'HOST_TO_GATE') {
      const dest = dispatch.destinations.find((d) => d.hostId === actor.id);
      if (!dest && !PLATFORM.includes(actor.role)) throw new ForbiddenException('Only a listed host can ring about this dispatch');
      hostId = actor.id;
    }
    if (input.direction === 'GATE_TO_HOST') {
      if (!INITIATOR_ROLES.includes(actor.role)) throw new ForbiddenException('Only a gate officer can ring the host');
      if (!hostId) throw new BadRequestException('Choose a host to ring for this dispatch');
      const host = await this.prisma.user.findUnique({ where: { id: hostId }, select: USER_SELECT });
      if (!host || !host.isActive) throw new NotFoundException('Host not found');
      if (host.id === actor.id) throw new BadRequestException('You cannot ring yourself');
      const officerId = await this.resolveGateOfficerId(actor, dispatch.gateId, last, dispatch.createdById);
      return this.placeRing({
        actor,
        toUserId: host.id,
        direction: 'GATE_TO_HOST',
        dispatchId: dispatch.id,
        gateId: dispatch.gateId,
        callerUserId: actor.id,
        calleeUserId: host.id,
        gateOfficerUserId: officerId,
        subject: dispatch.courierName,
      });
    }

    // Host calling back the gate / original initiator.
    const chain = await this.returnTargetIds({
      actorId: actor.id,
      dispatchId: dispatch.id,
      gateId: dispatch.gateId,
      last,
      createdById: dispatch.createdById,
    });
    if (!chain.length) {
      throw new BadRequestException('No one is available to call back. The original caller and any gate officers could not be found.');
    }
    const picked = this.pickTarget(chain, actor.id, true);
    if (!picked.target) throw new BadRequestException('No one is available to call back.');
    const officerId = last?.gateOfficerUserId || dispatch.createdById || picked.target;
    const view = await this.placeRing({
      actor,
      toUserId: picked.target,
      direction: 'HOST_TO_GATE',
      dispatchId: dispatch.id,
      gateId: dispatch.gateId,
      callerUserId: actor.id,
      calleeUserId: picked.target,
      gateOfficerUserId: officerId,
      subject: dispatch.courierName,
    });
    if (picked.rest.length) {
      this.cascades.set(view.id, {
        actorId: actor.id,
        remaining: picked.rest,
        dispatchId: dispatch.id,
        gateId: dispatch.gateId,
        parentCallId: view.id,
      });
    }
    return view;
  }

  private async placeRing(opts: {
    actor: any;
    toUserId: string;
    direction: 'GATE_TO_HOST' | 'HOST_TO_GATE';
    visitorId?: string | null;
    dispatchId?: string | null;
    gateId?: string | null;
    callerUserId: string;
    calleeUserId: string;
    gateOfficerUserId?: string | null;
    parentCallId?: string | null;
    subject: string;
  }) {
    if (opts.toUserId === opts.actor.id) throw new BadRequestException('You cannot ring yourself');
    const previous = await this.prisma.ringCall.findMany({ where: { fromUserId: opts.actor.id, status: 'RINGING' }, select: { id: true } });
    for (const row of previous) await this.finish(row.id, 'CANCELLED');
    const targetBusy = await this.prisma.ringCall.findFirst({ where: { toUserId: opts.toUserId, status: 'RINGING' }, select: { id: true } });
    const call = await this.prisma.ringCall.create({
      data: {
        visitorId: opts.visitorId || null,
        dispatchId: opts.dispatchId || null,
        fromUserId: opts.actor.id,
        toUserId: opts.toUserId,
        callerUserId: opts.callerUserId,
        calleeUserId: opts.calleeUserId,
        gateOfficerUserId: opts.gateOfficerUserId || null,
        parentCallId: opts.parentCallId || null,
        direction: opts.direction,
        gateId: opts.gateId || null,
        status: targetBusy ? 'BUSY' : 'RINGING',
        endedAt: targetBusy ? new Date() : null,
      },
    });
    const callerView = await this.present(call.id, opts.actor.id);
    const calleeView = await this.present(call.id, opts.toUserId);
    this.hub.publish(opts.actor.id, { type: 'ring', call: callerView });
    if (!targetBusy) {
      this.hub.publish(opts.toUserId, { type: 'ring', call: calleeView });
      this.arm(call.id, RING_MS);
      const who = opts.direction === 'GATE_TO_HOST' ? 'In-app call from the gate' : 'In-app call from the host';
      const where = callerView.gate?.name || callerView.gate?.location || (opts.dispatchId ? 'dispatch' : 'the gate');
      await this.notifications.create({
        userId: opts.toUserId,
        title: who,
        body: `${opts.subject} · ${where}`,
        link: `/ring?call=${call.id}`,
        meta: { type: 'RING', callId: call.id, visitorId: opts.visitorId || undefined, dispatchId: opts.dispatchId || undefined, url: `/ring?call=${call.id}` },
        channels: ['in_app'],
      });
    }
    return callerView;
  }

  private async dispatchSummary(id: string) {
    const d = await this.prisma.dispatch.findUnique({
      where: { id },
      select: { id: true, courierName: true, courierCompany: true, status: true, notes: true },
    });
    return d;
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
    if (!current) return;
    const closable = current.status === 'RINGING' || (current.status === 'ACCEPTED' && ['ENDED', 'CANCELLED'].includes(status));
    if (!closable) return;
    await this.prisma.ringCall.update({
      where: { id },
      data: { status, endedAt: new Date(), answeredAt: answered ? new Date() : current.answeredAt },
    });
    const [caller, callee] = await Promise.all([this.present(id, current.fromUserId), this.present(id, current.toUserId)]);
    this.hub.publish(current.fromUserId, { type: 'ring', call: caller });
    this.hub.publish(current.toUserId, { type: 'ring', call: callee });

    if (status === 'MISSED') {
      await this.tryCascade(current).catch(() => {});
    } else {
      const root = current.parentCallId || current.id;
      this.cascades.delete(root);
    }
  }

  private async tryCascade(missed: { id: string; parentCallId: string | null; fromUserId: string }) {
    const root = missed.parentCallId || missed.id;
    const job = this.cascades.get(root);
    if (!job || !job.remaining.length) return;
    const nextId = job.remaining.shift()!;
    this.cascades.set(root, job);
    const actor = await this.prisma.user.findUnique({ where: { id: job.actorId }, select: { ...USER_SELECT, organisationId: true, permissions: true, email: true } });
    if (!actor || !actor.isActive) return;
    const subject = job.visitorId
      ? (await this.prisma.visitor.findUnique({ where: { id: job.visitorId }, select: { fullName: true } }))?.fullName
      : job.dispatchId
        ? (await this.prisma.dispatch.findUnique({ where: { id: job.dispatchId }, select: { courierName: true } }))?.courierName
        : 'Call back';
    await this.placeRing({
      actor: { id: actor.id, role: actor.role, orgId: actor.organisationId, permissions: [], fullName: actor.fullName },
      toUserId: nextId,
      direction: 'HOST_TO_GATE',
      visitorId: job.visitorId,
      dispatchId: job.dispatchId,
      gateId: job.gateId,
      callerUserId: actor.id,
      calleeUserId: nextId,
      gateOfficerUserId: nextId,
      parentCallId: job.parentCallId,
      subject: `${subject || 'Call back'} (trying next officer)`,
    });
  }

  private assertOfficer(actor: any, visitor: any, assigned: boolean) {
    if (PLATFORM.includes(actor.role)) return;
    if (!GATE_ROLES.includes(actor.role)) throw new ForbiddenException('Only a gate officer can ring the host');
    if (actor.role === 'GATE' && visitor.invite.organisationId !== actor.orgId) throw new NotFoundException('Visitor not found');
    if (!assigned && actor.role !== 'GLOBAL_GATE') throw new ForbiddenException('You are not assigned to this visitor’s gate');
  }

  private canView(actor: any, call: { fromUserId: string; toUserId: string; callerUserId?: string | null; calleeUserId?: string | null; gateOfficerUserId?: string | null }) {
    if (!actor?.id) return false;
    if (PLATFORM.includes(actor.role)) return true;
    return [call.fromUserId, call.toUserId, call.callerUserId, call.calleeUserId, call.gateOfficerUserId].includes(actor.id);
  }

  private pickTarget(ids: string[], actorId: string, preferOnline: boolean) {
    const unique = [...new Set(ids.filter((id) => id && id !== actorId))];
    if (!unique.length) return { target: null as string | null, rest: [] as string[] };
    if (preferOnline) {
      const online = unique.filter((id) => this.hub.isOnline(id));
      if (online.length) {
        const rest = [...online.slice(1), ...unique.filter((id) => !online.includes(id))];
        return { target: online[0], rest };
      }
    }
    return { target: unique[0], rest: unique.slice(1) };
  }

  private async lastCall(where: { visitorId?: string | null; dispatchId?: string | null }) {
    const clause: any = {};
    if (where.visitorId) clause.visitorId = where.visitorId;
    if (where.dispatchId) clause.dispatchId = where.dispatchId;
    if (!Object.keys(clause).length) return null;
    return this.prisma.ringCall.findFirst({ where: clause, orderBy: { createdAt: 'desc' } });
  }

  private async hostIdFromCall(call: { visitorId: string | null; dispatchId: string | null; direction: string; callerUserId: string | null; calleeUserId: string | null; fromUserId: string; toUserId: string }) {
    if (call.visitorId) {
      const v = await this.prisma.visitor.findUnique({ where: { id: call.visitorId }, select: { invite: { select: { hostId: true } } } });
      if (v?.invite?.hostId) return v.invite.hostId;
    }
    if (call.dispatchId) {
      const d = await this.prisma.dispatch.findUnique({ where: { id: call.dispatchId }, select: { destinations: { select: { hostId: true } } } });
      const hid = d?.destinations.find((x) => x.hostId)?.hostId;
      if (hid) return hid;
    }
    if (call.direction === 'GATE_TO_HOST') return call.calleeUserId || call.toUserId;
    if (call.direction === 'HOST_TO_GATE') return call.callerUserId || call.fromUserId;
    return null;
  }

  /** People a host should reach when calling the gate back, in priority order. */
  private async returnTargetIds(opts: {
    actorId: string;
    visitorId?: string | null;
    dispatchId?: string | null;
    gateId?: string | null;
    last?: { callerUserId?: string | null; fromUserId?: string; gateOfficerUserId?: string | null; direction?: string } | null;
    entryById?: string | null;
    createdById?: string | null;
  }) {
    const ids: string[] = [];
    const push = (id?: string | null) => { if (id && !ids.includes(id)) ids.push(id); };
    // 1. Original initiator (including SA / SA II / super gate who are not attached to a gate).
    if (opts.last) {
      push(opts.last.callerUserId);
      if (opts.last.direction === 'GATE_TO_HOST') push(opts.last.fromUserId);
      push(opts.last.gateOfficerUserId);
    }
    // 2. Officer who admitted / created the record.
    push(opts.entryById);
    push(opts.createdById);
    // 3. Officers assigned to the gate (on duty first when we can tell).
    if (opts.visitorId) {
      const visits = await this.prisma.gateVisit.findMany({
        where: { visitorId: opts.visitorId },
        orderBy: { occurredAt: 'desc' },
        select: { officerId: true, gateId: true },
        take: 8,
      });
      for (const v of visits) push(v.officerId);
    }
    const gateId = opts.gateId;
    if (gateId) {
      const assigned = await this.prisma.gateOfficerAssignment.findMany({ where: { gateId }, select: { userId: true } });
      for (const row of assigned) push(row.userId);
    }
    // 4. Super gate officers.
    const supers = await this.prisma.user.findMany({
      where: { isActive: true, role: 'GLOBAL_GATE' },
      select: { id: true },
      take: 8,
    });
    for (const u of supers) push(u.id);
    return ids.filter((id) => id !== opts.actorId);
  }

  private async resolveGateOfficerId(actor: any, gateId?: string | null, last?: { gateOfficerUserId?: string | null } | null, createdById?: string | null) {
    if (GATE_ROLES.includes(actor.role)) return actor.id;
    if (last?.gateOfficerUserId) return last.gateOfficerUserId;
    if (createdById) {
      const creator = await this.prisma.user.findUnique({ where: { id: createdById }, select: { id: true, role: true, isActive: true } });
      if (creator?.isActive && GATE_ROLES.includes(creator.role)) return creator.id;
    }
    if (gateId) {
      const assigned = await this.prisma.gateOfficerAssignment.findMany({ where: { gateId }, select: { userId: true } });
      if (assigned[0]) return assigned[0].userId;
    }
    const superGate = await this.prisma.user.findFirst({ where: { isActive: true, role: 'GLOBAL_GATE' }, select: { id: true } });
    return superGate?.id || null;
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
          where: { id: { in: officerIds }, isActive: true },
          select: { id: true, fullName: true, phone: true, role: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    // Prefer a gate / super-gate officer, but keep whoever admitted the guest (including SA) as a fallback.
    const officer = officerIds.map((id) => byId.get(id)).find((u) => u && GATE_ROLES.includes(u.role))
      || officerIds.map((id) => byId.get(id)).find(Boolean)
      || null;
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
    const locationId = call.visitor?.invite?.locationId;
    const userIds = [call.fromUserId, call.toUserId, call.callerUserId, call.calleeUserId, call.gateOfficerUserId].filter(Boolean) as string[];
    const [users, gate, location] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, role: true, phone: true } }),
      call.gateId
        ? this.prisma.gate.findUnique({ where: { id: call.gateId }, select: { id: true, name: true, location: { select: { name: true } } } })
        : Promise.resolve(null),
      locationId ? this.prisma.location.findUnique({ where: { id: locationId }, select: { name: true } }) : Promise.resolve(null),
    ]);
    const byId = new Map(users.map((u) => [u.id, u]));
    const from = byId.get(call.fromUserId) || null;
    const to = byId.get(call.toUserId) || null;
    const caller = (call.callerUserId && byId.get(call.callerUserId)) || from;
    const callee = (call.calleeUserId && byId.get(call.calleeUserId)) || to;
    const officer = (call.gateOfficerUserId && byId.get(call.gateOfficerUserId)) || null;
    const other = viewerId === call.fromUserId ? to : from;
    const ended = !['RINGING', 'ACCEPTED'].includes(call.status);
    const canCallback = ended && [call.fromUserId, call.toUserId, call.callerUserId, call.calleeUserId, call.gateOfficerUserId].includes(viewerId);
    const stub = (u: any) => (u ? { id: u.id, fullName: u.fullName, role: u.role, phone: u.phone } : null);
    return {
      id: call.id,
      status: call.status,
      direction: call.direction,
      createdAt: call.createdAt,
      answeredAt: call.answeredAt,
      endedAt: call.endedAt,
      expiresAt: new Date(call.createdAt.getTime() + RING_MS).toISOString(),
      youAre: viewerId === call.toUserId ? 'callee' : 'caller',
      parentCallId: call.parentCallId,
      canCallback,
      visitor: call.visitor ? { id: call.visitor.id, fullName: call.visitor.fullName, status: call.visitor.status, purpose: call.visitor.invite?.purpose || null } : null,
      dispatch: call.dispatchId ? await this.dispatchSummary(call.dispatchId) : null,
      gate: gate ? { id: gate.id, name: gate.name, location: gate.location?.name || location?.name || null } : location ? { id: null, name: 'Gate', location: location.name } : null,
      from: stub(from),
      to: stub(to),
      caller: stub(caller),
      callee: stub(callee),
      gateOfficer: stub(officer),
      phone: other?.phone || null,
    };
  }
}
