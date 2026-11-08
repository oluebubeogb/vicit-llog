import { BadRequestException, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Panels show the newest 100 records; CSV export is capped to protect the server. */
export const DRILL_PAGE_LIMIT = 100;
export const EXPORT_CAP = 5000;
const SCAN_CAP = 20000; // same ceiling the dashboard aggregation uses

export const MODE_LABEL: Record<string, string> = { PEDESTRIAN: 'On foot', MOTORCYCLE: 'Motorcycle', VEHICLE: 'Vehicle' };
const STATUS_LABEL: Record<string, string> = {
  INVITED: 'Registered',
  ARRIVED: 'On site',
  EXITED: 'Exited',
  DENIED: 'Declined',
  CANCELLED: 'Cancelled',
};
const DURATION_BUCKETS = [30, 60, 120, 240, Infinity];
const VISITOR_METRICS = ['total', 'arrived', 'exited', 'denied', 'activeNow', 'showed', 'returning', 'blacklist'];
const INVITE_METRICS = ['invites', 'approvals'];

export type DrillFilter = {
  days?: number;
  from?: string;
  to?: string;
  metric?: string;
  category?: string;
  purpose?: string;
  entryMode?: string;
  status?: string;
  locationId?: string;
  gateId?: string;
  hostId?: string;
  day?: string; // YYYY-MM-DD within the range (series point)
  hour?: number; // 0–23 (peak hours, heatmap)
  weekday?: number; // 0–6, Sunday = 0 (heatmap)
  duration?: number; // index into length-of-stay buckets
  visitorKey?: string; // frequent visitors (phone digits or lower-case name)
  inviteStatus?: string;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Same range rules as AnalyticsService.dashboard so drill-downs always match the numbers. */
export function resolveRange(days = 30, fromIso?: string, toIso?: string) {
  const to = toIso && !isNaN(+new Date(toIso)) ? endOfDay(new Date(toIso)) : new Date();
  let from: Date;
  if (fromIso && !isNaN(+new Date(fromIso))) from = startOfDay(new Date(fromIso));
  else {
    from = startOfDay(new Date(to));
    from.setDate(from.getDate() - (Math.max(1, days) - 1));
  }
  if (from > to) {
    from = startOfDay(new Date());
    from.setDate(from.getDate() - 29);
  }
  return { from, to };
}

const vKey = (v: { phone?: string | null; fullName?: string | null }) =>
  (v.phone && v.phone.replace(/\D/g, '').slice(-10)) || (v.fullName || '').trim().toLowerCase();
const norm = (s?: string | null) => (s || '').trim().toLowerCase();
const digits = (s?: string | null) => (s || '').replace(/\D/g, '').slice(-10);

/** RFC 4180 cell + spreadsheet formula-injection guard. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString().replace('T', ' ').slice(0, 19) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

@Injectable()
export class AnalyticsDrillService {
  constructor(private prisma: PrismaService) {}

  private entity(f: DrillFilter): 'visitors' | 'invites' {
    const m = f.metric || 'total';
    if (INVITE_METRICS.includes(m)) return 'invites';
    if (!VISITOR_METRICS.includes(m)) throw new BadRequestException('Unknown metric');
    return 'visitors';
  }

  /** Which timestamp a metric counts by (also the sort key: newest first). */
  private dateField(metric: string): 'createdAt' | 'enteredAt' | 'exitedAt' | 'deniedAt' {
    if (metric === 'arrived') return 'enteredAt';
    if (metric === 'exited') return 'exitedAt';
    if (metric === 'denied') return 'deniedAt';
    return 'createdAt';
  }

  private visitorWhere(orgId: string, f: DrillFilter) {
    const metric = f.metric || 'total';
    const { from, to } = resolveRange(f.days, f.from, f.to);
    let win: any = { gte: from, lte: to };
    if (f.day && /^\d{4}-\d{2}-\d{2}$/.test(f.day)) {
      const d = new Date(`${f.day}T00:00:00`);
      win = { gte: startOfDay(d) > from ? startOfDay(d) : from, lte: endOfDay(d) < to ? endOfDay(d) : to };
    }
    const where: any = { invite: { organisationId: orgId } };
    const field = this.dateField(metric);
    if (metric === 'activeNow') where.status = 'ARRIVED';
    else where[field] = win;
    if (metric === 'arrived') where.status = { in: ['ARRIVED', 'EXITED'] };
    if (metric === 'exited') where.status = 'EXITED';
    if (metric === 'denied') where.status = 'DENIED';
    if (metric === 'showed') where.enteredAt = { not: null };
    if (f.status && !['arrived', 'exited', 'denied', 'activeNow'].includes(metric)) where.status = f.status;
    if (f.category) where.invite.category = f.category;
    if (f.purpose) where.invite.purpose = f.purpose;
    if (f.hostId) where.invite.hostId = f.hostId;
    if (f.locationId) where.invite.locationId = f.locationId === 'none' ? null : f.locationId;
    if (f.gateId) where.gateId = f.gateId === 'none' ? null : f.gateId;
    if (f.entryMode === 'PEDESTRIAN') {
      // the dashboard counts a missing mode as "On foot"
      where.OR = [{ entryMode: 'PEDESTRIAN' }, { entryMode: null }];
    } else if (f.entryMode) where.entryMode = f.entryMode;
    return { where, field };
  }

  private needsScan(f: DrillFilter) {
    const m = f.metric || 'total';
    return (
      f.hour !== undefined || f.weekday !== undefined || f.duration !== undefined || !!f.visitorKey || m === 'returning' || m === 'blacklist'
    );
  }

  /**
   * Filters that cannot be expressed in Prisma (hour of day in server time, stay length,
   * returning / blacklisted visitors) are applied to a light id+timestamp scan — the same
   * maths the dashboard uses — and the result is an ordered id list.
   */
  private async scanIds(orgId: string, f: DrillFilter, where: any, field: string): Promise<string[]> {
    const rows = await this.prisma.visitor.findMany({
      where,
      select: { id: true, fullName: true, phone: true, idNumber: true, createdAt: true, enteredAt: true, exitedAt: true, deniedAt: true },
      orderBy: { [field]: 'desc' },
      take: SCAN_CAP,
    });
    let out = rows;
    if (f.hour !== undefined || f.weekday !== undefined) {
      out = out.filter((v) => {
        const d = v.enteredAt ? new Date(v.enteredAt) : null;
        if (!d) return false;
        return (f.hour === undefined || d.getHours() === f.hour) && (f.weekday === undefined || d.getDay() === f.weekday);
      });
    }
    if (f.duration !== undefined) {
      const hi = DURATION_BUCKETS[f.duration];
      const lo = f.duration > 0 ? DURATION_BUCKETS[f.duration - 1] : -1;
      out = out.filter((v) => {
        if (!v.enteredAt || !v.exitedAt) return false;
        const m = (+v.exitedAt - +v.enteredAt) / 60000;
        return m >= 0 && m < hi && m >= (lo < 0 ? 0 : lo);
      });
    }
    if (f.visitorKey) out = out.filter((v) => vKey(v) === f.visitorKey);
    if (f.metric === 'returning') {
      const counts = new Map<string, number>();
      for (const v of out) if (!/^guest \d+$/i.test(v.fullName || '')) counts.set(vKey(v), (counts.get(vKey(v)) || 0) + 1);
      out = out.filter((v) => (counts.get(vKey(v)) || 0) > 1);
    }
    if (f.metric === 'blacklist') {
      const bl = await this.prisma.blacklistEntry.findMany({
        where: { organisationId: orgId, isActive: true },
        select: { fullName: true, phone: true, idNumber: true },
      });
      out = out.filter((v) =>
        bl.some(
          (e) =>
            (e.phone && v.phone && digits(e.phone) && digits(e.phone) === digits(v.phone)) ||
            (e.idNumber && v.idNumber && norm(e.idNumber) === norm(v.idNumber)) ||
            (e.fullName && norm(e.fullName) === norm(v.fullName)),
        ),
      );
    }
    return out.map((v) => v.id);
  }

  private visitorInclude = {
    invite: {
      select: {
        id: true,
        purpose: true,
        category: true,
        expectedMode: true,
        expectedAt: true,
        locationId: true,
        createdAt: true,
        host: { select: { id: true, fullName: true, email: true } },
      },
    },
  } as const;

  private async lookups(orgId: string) {
    const [locations, gates, users] = await Promise.all([
      this.prisma.location.findMany({ where: { organisationId: orgId }, select: { id: true, name: true } }),
      this.prisma.gate.findMany({ where: { location: { organisationId: orgId } }, select: { id: true, name: true, location: { select: { name: true } } } }),
      this.prisma.user.findMany({ where: { organisationId: orgId }, select: { id: true, fullName: true } }),
    ]);
    return {
      loc: new Map(locations.map((l) => [l.id, l.name])),
      gate: new Map(gates.map((g) => [g.id, g.location?.name ? `${g.name} · ${g.location.name}` : g.name])),
      user: new Map(users.map((u) => [u.id, u.fullName])),
    };
  }

  private decorate(rows: any[], L: Awaited<ReturnType<AnalyticsDrillService['lookups']>>) {
    return rows.map((v) => ({
      ...v,
      qrCodeData: undefined,
      locationName: v.invite?.locationId ? L.loc.get(v.invite.locationId) || null : null,
      gateName: v.gateId ? L.gate.get(v.gateId) || null : null,
      entryByName: v.entryById ? L.user.get(v.entryById) || null : null,
      exitByName: v.exitById ? L.user.get(v.exitById) || null : null,
    }));
  }

  private inviteWhere(orgId: string, f: DrillFilter) {
    const { from, to } = resolveRange(f.days, f.from, f.to);
    const where: any = { organisationId: orgId, createdAt: { gte: from, lte: to } };
    if (f.metric === 'approvals') where.approvedById = { not: null };
    if (f.category) where.category = f.category;
    if (f.inviteStatus) where.status = f.inviteStatus;
    if (f.hostId) where.hostId = f.hostId;
    return where;
  }

  /** Newest 100 records behind a number, plus the true total. */
  async list(orgId: string, f: DrillFilter) {
    const entity = this.entity(f);
    if (entity === 'invites') {
      const where = this.inviteWhere(orgId, f);
      const [total, rows] = await Promise.all([
        this.prisma.invite.count({ where }),
        this.prisma.invite.findMany({
          where,
          include: { host: { select: { id: true, fullName: true } }, visitors: { select: { id: true, fullName: true, status: true } } },
          orderBy: { createdAt: 'desc' },
          take: DRILL_PAGE_LIMIT,
        }),
      ]);
      return { entity, total, limit: DRILL_PAGE_LIMIT, exportCap: EXPORT_CAP, rows };
    }

    const { where, field } = this.visitorWhere(orgId, f);
    const L = await this.lookups(orgId);
    if (this.needsScan(f)) {
      const ids = await this.scanIds(orgId, f, where, field);
      const page = ids.slice(0, DRILL_PAGE_LIMIT);
      const rows = await this.prisma.visitor.findMany({ where: { id: { in: page } }, include: this.visitorInclude });
      const order = new Map(page.map((id, i) => [id, i]));
      rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      return { entity, total: ids.length, limit: DRILL_PAGE_LIMIT, exportCap: EXPORT_CAP, rows: this.decorate(rows, L) };
    }
    const [total, rows] = await Promise.all([
      this.prisma.visitor.count({ where }),
      this.prisma.visitor.findMany({
        where,
        include: this.visitorInclude,
        orderBy: [{ [field]: 'desc' }, { createdAt: 'desc' }],
        take: DRILL_PAGE_LIMIT,
      }),
    ]);
    return { entity, total, limit: DRILL_PAGE_LIMIT, exportCap: EXPORT_CAP, rows: this.decorate(rows, L) };
  }

  /**
   * CSV of every record behind a number, newest first, capped at EXPORT_CAP rows. Rows are
   * fetched and written in batches of 500 so memory stays flat. When the cap is hit, the
   * X-Export-Truncated / X-Export-Total headers tell the client to narrow the date range.
   */
  async exportCsv(orgId: string, f: DrillFilter, res: Response, name = 'vicit-export') {
    const entity = this.entity(f);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `${name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || 'vicit-export'}_${stamp}.csv`;
    const BATCH = 500;

    let total = 0;
    let header: string[];
    let fetchBatch: (skip: number) => Promise<any[]>;
    let toRow: (r: any) => unknown[];

    if (entity === 'invites') {
      const where = this.inviteWhere(orgId, f);
      total = await this.prisma.invite.count({ where });
      header = ['Created', 'Description', 'Purpose', 'Status', 'Host', 'Guests', 'Arriving by', 'Expected arrival', 'Walk-in', 'Approved'];
      fetchBatch = (skip) =>
        this.prisma.invite.findMany({
          where,
          include: { host: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: Math.min(BATCH, EXPORT_CAP - skip),
        });
      toRow = (i) => [
        i.createdAt,
        i.purpose,
        i.category === 'PERSONAL' ? 'Personal' : 'Official',
        i.status,
        i.host?.fullName,
        i.guestCount,
        MODE_LABEL[i.expectedMode] || i.expectedMode || '',
        i.expectedAt,
        i.isOffline ? 'Yes' : 'No',
        i.approvedById ? 'Yes' : 'No',
      ];
    } else {
      const { where, field } = this.visitorWhere(orgId, f);
      const L = await this.lookups(orgId);
      header = [
        'Name', 'Phone', 'Email', 'Status', 'Description', 'Purpose', 'Host', 'Location', 'Gate', 'Arriving by',
        'Registered', 'Checked in', 'Checked out', 'Declined', 'Decline reason', 'Stay (min)', 'Admitted by', 'Signed out by',
      ];
      if (this.needsScan(f)) {
        const ids = (await this.scanIds(orgId, f, where, field)).slice(0, EXPORT_CAP);
        total = ids.length; // scan path is already bounded
        fetchBatch = async (skip) => {
          const page = ids.slice(skip, skip + BATCH);
          if (!page.length) return [];
          const rows = await this.prisma.visitor.findMany({ where: { id: { in: page } }, include: this.visitorInclude });
          const order = new Map(page.map((id, i) => [id, i]));
          return this.decorate(rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!), L);
        };
      } else {
        total = await this.prisma.visitor.count({ where });
        fetchBatch = async (skip) =>
          this.decorate(
            await this.prisma.visitor.findMany({
              where,
              include: this.visitorInclude,
              orderBy: [{ [field]: 'desc' }, { createdAt: 'desc' }],
              skip,
              take: Math.min(BATCH, EXPORT_CAP - skip),
            }),
            L,
          );
      }
      toRow = (v) => [
        v.fullName,
        v.phone,
        v.email,
        STATUS_LABEL[v.status] || v.status,
        v.invite?.purpose,
        v.invite?.category === 'PERSONAL' ? 'Personal' : 'Official',
        v.invite?.host?.fullName,
        v.locationName,
        v.gateName,
        v.entryMode ? MODE_LABEL[v.entryMode] : v.invite?.expectedMode ? MODE_LABEL[v.invite.expectedMode] : '',
        v.createdAt,
        v.enteredAt,
        v.exitedAt,
        v.deniedAt,
        v.deniedReason,
        v.enteredAt && v.exitedAt ? Math.max(0, Math.round((+new Date(v.exitedAt) - +new Date(v.enteredAt)) / 60000)) : '',
        v.entryByName,
        v.exitByName,
      ];
    }

    const truncated = total > EXPORT_CAP;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Export-Total', String(total));
    res.setHeader('X-Export-Cap', String(EXPORT_CAP));
    res.setHeader('X-Export-Truncated', truncated ? 'true' : 'false');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Export-Total, X-Export-Cap, X-Export-Truncated');
    res.write('\uFEFF' + header.map(cell).join(',') + '\r\n'); // BOM so Excel opens UTF-8 correctly

    for (let skip = 0; skip < Math.min(total, EXPORT_CAP); skip += BATCH) {
      const rows = await fetchBatch(skip);
      if (!rows.length) break;
      const chunk = rows.map((r) => toRow(r).map(cell).join(',')).join('\r\n') + '\r\n';
      if (!res.write(chunk)) await new Promise((r) => res.once('drain', r));
    }
    res.end();
  }
}
