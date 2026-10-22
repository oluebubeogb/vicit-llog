import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Full analytics for a date range (default: last `days` days), with the previous
   * period of equal length for comparison. Aggregation is done in memory from one
   * visitor query so it works on any Postgres without extra indexes.
   */
  async dashboard(orgId: string, days = 30, fromIso?: string, toIso?: string) {
    const to = toIso ? endOfDay(new Date(toIso)) : new Date();
    let from: Date;
    if (fromIso) from = startOfDay(new Date(fromIso));
    else {
      from = startOfDay(new Date(to));
      from.setDate(from.getDate() - (Math.max(1, days) - 1));
    }
    if (isNaN(+from) || isNaN(+to) || from > to) {
      from = startOfDay(new Date());
      from.setDate(from.getDate() - 29);
    }
    const spanMs = +to - +from;
    const prevFrom = new Date(+from - spanMs - 1);
    const prevTo = new Date(+from - 1);
    const periodDays = Math.max(1, Math.round(spanMs / 86400000));

    const inRange = (d: Date | null | undefined, a: Date, b: Date) => !!d && d >= a && d <= b;

    const [visitors, invites, activeNow, blacklist, locations, gates] = await Promise.all([
      this.prisma.visitor.findMany({
        where: {
          invite: { organisationId: orgId },
          OR: [
            { createdAt: { gte: prevFrom, lte: to } },
            { enteredAt: { gte: prevFrom, lte: to } },
            { exitedAt: { gte: prevFrom, lte: to } },
            { deniedAt: { gte: prevFrom, lte: to } },
          ],
        },
        select: {
          id: true,
          fullName: true,
          phone: true,
          idNumber: true,
          email: true,
          photoPath: true,
          status: true,
          entryMode: true,
          gateId: true,
          entryById: true,
          createdAt: true,
          enteredAt: true,
          exitedAt: true,
          deniedAt: true,
          invite: {
            select: {
              purpose: true,
              category: true,
              locationId: true,
              host: { select: { id: true, fullName: true, portfolio: true } },
            },
          },
        },
        take: 20000,
      }),
      this.prisma.invite.findMany({
        where: { organisationId: orgId, createdAt: { gte: prevFrom, lte: to } },
        select: { id: true, status: true, createdAt: true, isOffline: true, approvedById: true },
        take: 20000,
      }),
      this.prisma.visitor.count({ where: { invite: { organisationId: orgId }, status: 'ARRIVED' } }),
      this.prisma.blacklistEntry.findMany({
        where: { organisationId: orgId, isActive: true },
        select: { id: true, fullName: true, phone: true, idNumber: true, reason: true },
      }),
      this.prisma.location.findMany({ where: { organisationId: orgId }, select: { id: true, name: true } }),
      this.prisma.gate.findMany({
        where: { location: { organisationId: orgId } },
        select: { id: true, name: true, location: { select: { name: true } } },
      }),
    ]);

    const metrics = (a: Date, b: Date) => {
      const registered = visitors.filter((v) => inRange(v.createdAt, a, b));
      const entered = visitors.filter((v) => inRange(v.enteredAt, a, b));
      const exitedL = visitors.filter((v) => inRange(v.exitedAt, a, b) && v.status === 'EXITED');
      const deniedL = visitors.filter((v) => inRange(v.deniedAt, a, b) && v.status === 'DENIED');
      const durations = exitedL
        .filter((v) => v.enteredAt && v.exitedAt)
        .map((v) => (+v.exitedAt! - +v.enteredAt!) / 60000)
        .filter((m) => m >= 0);
      const invs = invites.filter((i) => inRange(i.createdAt, a, b));
      const decided = entered.length + deniedL.length;
      return {
        registered,
        entered,
        exitedL,
        deniedL,
        durations,
        invs,
        kpi: {
          totalVisits: registered.length,
          arrived: entered.length,
          exited: exitedL.length,
          denied: deniedL.length,
          invitesCreated: invs.length,
          avgDurationMinutes: durations.length
            ? Math.round(durations.reduce((x, y) => x + y, 0) / durations.length)
            : 0,
          admitRate: decided ? Math.round((entered.length / decided) * 100) : 0,
          denialRate: decided ? Math.round((deniedL.length / decided) * 100) : 0,
          showRate: registered.length
            ? Math.round((registered.filter((v) => v.enteredAt).length / registered.length) * 100)
            : 0,
        },
      };
    };

    const cur = metrics(from, to);
    const prev = metrics(prevFrom, prevTo);

    // Daily series (gap-filled)
    const series: Array<{ day: string; registered: number; entries: number; exits: number; denied: number }> = [];
    const idx: Record<string, number> = {};
    for (let d = startOfDay(new Date(from)); d <= to; d.setDate(d.getDate() + 1)) {
      const key = dayKey(d);
      idx[key] = series.length;
      series.push({ day: key, registered: 0, entries: 0, exits: 0, denied: 0 });
    }
    const bump = (d: Date | null | undefined, field: 'registered' | 'entries' | 'exits' | 'denied') => {
      if (!d) return;
      const i = idx[dayKey(d)];
      if (i !== undefined) series[i][field]++;
    };
    cur.registered.forEach((v) => bump(v.createdAt, 'registered'));
    cur.entered.forEach((v) => bump(v.enteredAt, 'entries'));
    cur.exitedL.forEach((v) => bump(v.exitedAt, 'exits'));
    cur.deniedL.forEach((v) => bump(v.deniedAt, 'denied'));

    // Hour-of-day and weekday × hour heatmap (entries)
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    for (const v of cur.entered) {
      const d = new Date(v.enteredAt!);
      hourly[d.getHours()].count++;
      heatmap[d.getDay()][d.getHours()]++;
    }

    const countBy = <T>(xs: T[], key: (x: T) => string | null | undefined) => {
      const m = new Map<string, number>();
      for (const x of xs) {
        const k = key(x);
        if (!k) continue;
        m.set(k, (m.get(k) || 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };

    const locName = Object.fromEntries(locations.map((l) => [l.id, l.name]));
    const gateName = Object.fromEntries(
      gates.map((g) => [g.id, g.location?.name ? `${g.name} · ${g.location.name}` : g.name]),
    );

    const byPurpose = countBy(cur.registered, (v) => v.invite?.purpose?.trim() || 'Unspecified')
      .slice(0, 10)
      .map(([purpose, count]) => ({ purpose, count }));
    const byCategory = countBy(cur.registered, (v) => v.invite?.category || 'OFFICIAL').map(
      ([category, count]) => ({ category, count }),
    );
    const byMode = countBy(cur.entered, (v) => v.entryMode || 'PEDESTRIAN').map(([mode, count]) => ({
      mode,
      count,
    }));
    // keyed by id ('none' = not set) so every row can drill down to its records
    const byLocation = countBy(cur.registered, (v) => v.invite?.locationId || 'none').map(([id, count]) => ({
      id,
      location: id === 'none' ? 'Main site' : locName[id] || 'Unknown location',
      count,
    }));
    const byGate = countBy(cur.entered, (v) => v.gateId || 'none').map(([id, count]) => ({
      id,
      gate: id === 'none' ? 'Main gate' : gateName[id] || 'Gate',
      count,
    }));
    // Official vs Personal (free-text descriptions are mostly unique, so purpose = category)
    const categoryDetail = ['OFFICIAL', 'PERSONAL'].map((category) => {
      const of = (xs: typeof visitors) => xs.filter((v) => (v.invite?.category || 'OFFICIAL') === category).length;
      return {
        category,
        registered: of(cur.registered),
        entries: of(cur.entered),
        denied: of(cur.deniedL),
        previous: of(prev.registered),
      };
    });

    const hostMap = new Map<string, { id: string; name: string; portfolio?: string | null; count: number; onSite: number }>();
    for (const v of cur.registered) {
      const h = v.invite?.host;
      if (!h) continue;
      const e = hostMap.get(h.id) || { id: h.id, name: h.fullName, portfolio: h.portfolio, count: 0, onSite: 0 };
      e.count++;
      if (v.status === 'ARRIVED') e.onSite++;
      hostMap.set(h.id, e);
    }
    const byHost = [...hostMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

    // Returning / top visitors keyed by phone, else normalised name
    const vKey = (v: any) =>
      (v.phone && v.phone.replace(/\D/g, '').slice(-10)) || (v.fullName || '').trim().toLowerCase();
    const visitorMap = new Map<string, { key: string; name: string; phone?: string | null; photoPath?: string | null; visits: number; lastVisit: Date }>();
    for (const v of cur.registered) {
      if (/^guest \d+$/i.test(v.fullName || '')) continue;
      const k = vKey(v);
      if (!k) continue;
      const e = visitorMap.get(k) || { key: k, name: v.fullName, phone: v.phone, photoPath: v.photoPath, visits: 0, lastVisit: v.createdAt };
      e.visits++;
      if (v.createdAt > e.lastVisit) e.lastVisit = v.createdAt;
      if (!e.photoPath && v.photoPath) e.photoPath = v.photoPath;
      visitorMap.set(k, e);
    }
    const topVisitors = [...visitorMap.values()].sort((a, b) => b.visits - a.visits).slice(0, 8);
    const returningVisitors = [...visitorMap.values()].filter((v) => v.visits > 1).length;

    // Duration distribution
    const buckets = [
      { label: '< 30m', max: 30 },
      { label: '30–60m', max: 60 },
      { label: '1–2h', max: 120 },
      { label: '2–4h', max: 240 },
      { label: '4h+', max: Infinity },
    ].map((b) => ({ ...b, count: 0 }));
    for (const m of cur.durations) buckets.find((b) => m < b.max)!.count++;

    // Blacklist hits: visitors in range matching an active entry by phone / ID / exact name
    const norm = (s?: string | null) => (s || '').trim().toLowerCase();
    const digits = (s?: string | null) => (s || '').replace(/\D/g, '').slice(-10);
    const hits: Array<{ visitor: string; reason: string; status: string; at: Date }> = [];
    for (const v of cur.registered) {
      const b = blacklist.find(
        (e) =>
          (e.phone && v.phone && digits(e.phone) && digits(e.phone) === digits(v.phone)) ||
          (e.idNumber && v.idNumber && norm(e.idNumber) === norm(v.idNumber)) ||
          (e.fullName && norm(e.fullName) === norm(v.fullName)),
      );
      if (b) hits.push({ visitor: v.fullName, reason: b.reason, status: v.status, at: v.createdAt });
    }

    const inviteStatus = countBy(cur.invs, (i) => i.status).map(([status, count]) => ({ status, count }));
    const approvals = cur.invs.filter((i) => i.approvedById).length;

    const peakHours = [...hourly].sort((a, b) => b.count - a.count).filter((h) => h.count > 0).slice(0, 5);

    return {
      range: { from: from.toISOString(), to: to.toISOString(), prevFrom: prevFrom.toISOString(), prevTo: prevTo.toISOString() },
      periodDays,
      // legacy top-level fields (kept for compatibility)
      totalVisits: cur.kpi.totalVisits,
      arrived: cur.kpi.arrived,
      exited: cur.kpi.exited,
      denied: cur.kpi.denied,
      activeNow,
      kpis: { ...cur.kpi, activeNow, returningVisitors, blacklistHits: hits.length, approvals },
      previous: prev.kpi,
      series,
      byDay: series.map((s) => ({ day: s.day, count: s.entries })),
      hourly,
      heatmap,
      peakHours,
      byPurpose,
      byCategory,
      categoryDetail,
      byMode,
      byLocation,
      byGate,
      byHost,
      topVisitors,
      durationBuckets: buckets.map(({ label, count }) => ({ label, count })),
      blacklistHits: hits.slice(0, 20),
      inviteStatus,
    };
  }

}

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
function dayKey(d: Date) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
