import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentRequestMeta } from '../../common/request-context';

function deviceLabel(ua?: string | null) {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' · ');
}

function cleanValue(v: any): any {
  if (Array.isArray(v)) return v.map(cleanValue);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => !/(password|passphrase|secret|token|hash|credential)/i.test(k))
        .map(([k, val]) => [k, cleanValue(val)]),
    );
  }
  return v;
}

function diffRecords(details: any): { field: string; from: any; to: any }[] {
  if (!details || typeof details !== 'object') return [];
  const before = details.before && typeof details.before === 'object' ? details.before : null;
  const after = details.after && typeof details.after === 'object' ? details.after : null;
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: { field: string; from: any; to: any }[] = [];
  for (const field of keys) {
    if (/(password|passphrase|secret|token|hash|credential)/i.test(field)) continue;
    if (JSON.stringify(before[field]) === JSON.stringify(after[field])) continue;
    out.push({ field, from: cleanValue(before[field]), to: cleanValue(after[field]) });
  }
  return out;
}

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
    userAgent?: string;
  }) {
    const meta = currentRequestMeta();
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        details: data.details || {},
        userId: data.userId,
        ip: data.ip || meta.ip || null,
        userAgent: data.userAgent || meta.userAgent || null,
      },
    });
  }

  async findAll(limit = 100, organisationId?: string, skip = 0) {
    let scope: any = undefined;
    if (organisationId) {
      const [inviteIds, visitorIds] = await Promise.all([
        this.prisma.invite.findMany({ where: { organisationId }, select: { id: true } }),
        this.prisma.visitor.findMany({ where: { invite: { organisationId } }, select: { id: true } }),
      ]);
      const entityIds = [...inviteIds.map(x => x.id), ...visitorIds.map(x => x.id)];
      scope = { OR: [ { user: { is: { organisationId } } }, ...(entityIds.length ? [{ entityId: { in: entityIds } }] : []) ] };
    }
    const rows = await this.prisma.auditLog.findMany({
      where: scope,
      take: limit,
      skip,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            avatarPath: true,
            organisation: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    // Resolve related records so the admin UI can show full details inline
    const visitorIds = new Set<string>();
    const inviteIds = new Set<string>();
    const userIds = new Set<string>();
    const blacklistIds = new Set<string>();
    for (const r of rows) {
      if (!r.entityId) continue;
      const e = (r.entity || '').toLowerCase();
      if (e === 'visitor') visitorIds.add(r.entityId);
      else if (e === 'invite') inviteIds.add(r.entityId);
      else if (e === 'user') userIds.add(r.entityId);
      else if (e === 'blacklistentry') blacklistIds.add(r.entityId);
    }

    const [visitors, invites, users, blacklist] = await Promise.all([
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
              gateId: true,
              createdAt: true,
              invite: {
                select: {
                  id: true,
                  purpose: true,
                  category: true,
                  expectedMode: true,
                  status: true,
                  expectedAt: true,
                  createdAt: true,
                  locationId: true,
                  host: { select: { id: true, fullName: true, phone: true } },
                  organisation: { select: { id: true, name: true, code: true } },
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
              expiresAt: true,
              locationId: true,
              organisation: { select: { id: true, name: true, code: true } },
              host: { select: { id: true, fullName: true, phone: true, email: true } },
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
              organisation: { select: { id: true, name: true, code: true } },
            },
          })
        : Promise.resolve([] as any[]),
      blacklistIds.size
        ? this.prisma.blacklistEntry.findMany({
            where: { id: { in: [...blacklistIds] } },
            select: { id: true, fullName: true, phone: true, idNumber: true, reason: true, isActive: true, createdAt: true },
          })
        : Promise.resolve([] as any[]),
    ]);

    const gateIds = new Set<string>();
    const locationIds = new Set<string>();
    const orgIds = new Set<string>();
    for (const r of rows) {
      const d: any = r.details || {};
      if (typeof d.gateId === 'string') gateIds.add(d.gateId);
      if (typeof d.locationId === 'string') locationIds.add(d.locationId);
      if (typeof d.organisationId === 'string') orgIds.add(d.organisationId);
      if (typeof d.agencyId === 'string') orgIds.add(d.agencyId);
      const e = (r.entity || '').toLowerCase();
      if (r.entityId && e === 'organisation') orgIds.add(r.entityId);
      if (r.entityId && e === 'location') locationIds.add(r.entityId);
      if (r.entityId && e === 'gate') gateIds.add(r.entityId);
    }
    for (const v of visitors as any[]) {
      if (v.invite?.locationId) locationIds.add(v.invite.locationId);
      if (v.gateId) gateIds.add(v.gateId);
    }
    for (const inv of invites as any[]) if (inv.locationId) locationIds.add(inv.locationId);

    const [gates, locations, orgs] = await Promise.all([
      gateIds.size
        ? this.prisma.gate.findMany({
            where: { id: { in: [...gateIds] } },
            select: { id: true, name: true, code: true, location: { select: { id: true, name: true, organisation: { select: { id: true, name: true, code: true } } } } },
          })
        : Promise.resolve([] as any[]),
      locationIds.size
        ? this.prisma.location.findMany({
            where: { id: { in: [...locationIds] } },
            select: { id: true, name: true, code: true, address: true, organisation: { select: { id: true, name: true, code: true } } },
          })
        : Promise.resolve([] as any[]),
      orgIds.size
        ? this.prisma.organisation.findMany({
            where: { id: { in: [...orgIds] } },
            select: { id: true, name: true, code: true, logoUrl: true },
          })
        : Promise.resolve([] as any[]),
    ]);

    const bMap = Object.fromEntries(blacklist.map((b) => [b.id, b]));
    const vMap = Object.fromEntries(visitors.map((v) => [v.id, v]));
    const iMap = Object.fromEntries(invites.map((i) => [i.id, i]));
    const uMap = Object.fromEntries(users.map((u) => [u.id, u]));
    const gMap = Object.fromEntries(gates.map((g) => [g.id, g]));
    const lMap = Object.fromEntries(locations.map((l) => [l.id, l]));
    const oMap = Object.fromEntries(orgs.map((o) => [o.id, o]));

    return rows.map((r) => {
      const e = (r.entity || '').toLowerCase();
      const details: any = cleanValue(r.details || {});
      let related: any = null;
      if (r.entityId) {
        if (e === 'visitor') related = vMap[r.entityId] || null;
        else if (e === 'invite') related = iMap[r.entityId] || null;
        else if (e === 'user') related = uMap[r.entityId] || null;
        else if (e === 'blacklistentry') related = bMap[r.entityId] || null;
        else if (e === 'gate') related = gMap[r.entityId] || null;
        else if (e === 'location') related = lMap[r.entityId] || null;
        else if (e === 'organisation') related = oMap[r.entityId] || null;
      }
      const gate = (details.gateId && gMap[details.gateId]) || (e === 'gate' ? related : null) || (related?.gateId && gMap[related.gateId]) || null;
      const location =
        (details.locationId && lMap[details.locationId]) ||
        gate?.location ||
        (e === 'location' ? related : null) ||
        (related?.invite?.locationId && lMap[related.invite.locationId]) ||
        null;
      const agency =
        r.user?.organisation ||
        location?.organisation ||
        gate?.location?.organisation ||
        (details.organisationId && oMap[details.organisationId]) ||
        (details.agencyId && oMap[details.agencyId]) ||
        related?.organisation ||
        (e === 'organisation' ? related : null) ||
        null;
      const invite = e === 'invite' ? related : e === 'visitor' ? related?.invite || null : null;
      return {
        ...r,
        details,
        related,
        context: {
          actor: r.user
            ? {
                id: r.user.id,
                name: r.user.fullName,
                email: r.user.email,
                phone: r.user.phone,
                role: r.user.role,
                agency: r.user.organisation?.name || null,
                agencyCode: r.user.organisation?.code || null,
              }
            : null,
          agency: agency ? { id: agency.id, name: agency.name, code: agency.code } : null,
          location: location ? { id: location.id, name: location.name, code: location.code || null, address: location.address || null } : null,
          gate: gate ? { id: gate.id, name: gate.name, code: gate.code || null } : details.gateName ? { name: details.gateName } : null,
          target: {
            type: r.entity,
            id: r.entityId,
            label: related?.fullName || related?.name || related?.purpose || related?.reason || details.gateName || r.entity,
          },
          visitor: e === 'visitor' ? related : null,
          invite,
          ip: r.ip || null,
          userAgent: (r as any).userAgent || null,
          device: deviceLabel((r as any).userAgent),
          changes: diffRecords(details),
          at: r.createdAt,
        },
      };
    });
  }
}
