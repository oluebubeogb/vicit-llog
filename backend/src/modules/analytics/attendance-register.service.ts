import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dayDateFromKey, localDayKey, attendanceTimeZone } from '../../common/utils/attendance-day';
import { roleLabel } from '../../common/utils/role-labels';

export type RegisterQuery = {
  q?: string;
  from?: string;
  to?: string;
  days?: number;
  organisationId?: string | null;
  locationId?: string;
  gateId?: string;
  role?: string;
  status?: string; // present | late | absent | no_exit | all
  staffId?: string;
  page?: number;
  pageSize?: number;
};

const EXPECTED_ROLES: Role[] = [Role.STAFF, Role.ADMIN, Role.GATE];
const LATE_HOUR = 9;
const EXPORT_CAP = 5000;

function fmtHour(date: Date, tz: string) {
  const hourStr = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(date);
  return parseInt(hourStr, 10);
}

function fmtTime(date: Date | null | undefined, tz: string) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function minutesOfDay(date: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  return (parseInt(parts.hour, 10) || 0) * 60 + (parseInt(parts.minute, 10) || 0);
}

function formatClock(mins: number | null) {
  if (mins == null || !Number.isFinite(mins)) return null;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isWeekdayKey(key: string) {
  const d = new Date(`${key}T12:00:00+01:00`);
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

function enumerateKeys(fromKey: string, toKey: string) {
  const keys: string[] = [];
  let cur = new Date(`${fromKey}T12:00:00.000Z`);
  const end = new Date(`${toKey}T12:00:00.000Z`);
  while (cur <= end) {
    keys.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400000);
  }
  return keys;
}

function csvEscape(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

@Injectable()
export class AttendanceRegisterService {
  constructor(private prisma: PrismaService) {}

  private resolveRange(q: RegisterQuery) {
    const periodDays = Math.min(366, Math.max(1, q.days || 30));
    let rangeTo = q.to ? new Date(`${q.to}T23:59:59.999Z`) : new Date();
    let rangeFrom = q.from ? new Date(`${q.from}T00:00:00.000Z`) : new Date(rangeTo.getTime() - (periodDays - 1) * 86400000);
    if (isNaN(+rangeFrom) || isNaN(+rangeTo)) throw new Error('Invalid date range');
    const fromKey = localDayKey(rangeFrom);
    const toKey = localDayKey(rangeTo);
    return { fromKey, toKey, dayFrom: dayDateFromKey(fromKey), dayTo: dayDateFromKey(toKey), tz: attendanceTimeZone() };
  }

  async register(orgId: string | null, q: RegisterQuery) {
    const { fromKey, toKey, dayFrom, dayTo, tz } = this.resolveRange(q);
    const todayKey = localDayKey(new Date());
    const page = Math.max(1, q.page || 1);
    const pageSize = Math.min(100, Math.max(10, q.pageSize || 25));
    const status = (q.status || 'all').toLowerCase();

    const attWhere: any = { day: { gte: dayFrom, lte: dayTo } };
    if (orgId) attWhere.organisationId = orgId;
    else if (q.organisationId) attWhere.organisationId = q.organisationId;
    if (q.staffId) attWhere.userId = q.staffId;
    if (q.role && /^(STAFF|ADMIN|GATE)$/.test(q.role)) attWhere.user = { role: q.role };
    if (q.gateId) attWhere.OR = [{ arrivalGateId: q.gateId }, { exitGateId: q.gateId }];

    const rows = await this.prisma.staffAttendance.findMany({
      where: attWhere,
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true, avatarPath: true, organisationId: true, createdAt: true, isActive: true } },
        organisation: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ day: 'desc' }, { arrivedAt: 'desc' }],
      take: 8000,
    });

    const gateIds = [...new Set(rows.flatMap((r) => [r.arrivalGateId, r.exitGateId]).filter(Boolean))] as string[];
    const gates = gateIds.length
      ? await this.prisma.gate.findMany({
          where: { id: { in: gateIds } },
          select: { id: true, name: true, locationId: true, location: { select: { id: true, name: true } } },
        })
      : [];
    const gateMap = new Map(gates.map((g) => [g.id, g]));

    let filteredAtt = rows;
    if (q.locationId) {
      filteredAtt = filteredAtt.filter((r) => {
        const a = r.arrivalGateId ? gateMap.get(r.arrivalGateId) : null;
        const e = r.exitGateId ? gateMap.get(r.exitGateId) : null;
        return a?.locationId === q.locationId || e?.locationId === q.locationId;
      });
    }
    const term = String(q.q || '').trim().toLowerCase();
    if (term) {
      filteredAtt = filteredAtt.filter((r) =>
        [r.user.fullName, r.user.email, r.organisation?.name, r.organisation?.code, roleLabel(r.user.role)]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(term)),
      );
    }

    const mapped = filteredAtt.map((r) => {
      const day = localDayKey(r.day);
      const hour = fmtHour(r.arrivedAt, tz);
      const late = Number.isFinite(hour) && hour >= LATE_HOUR;
      const durationMinutes = r.exitedAt ? Math.max(0, Math.round((r.exitedAt.getTime() - r.arrivedAt.getTime()) / 60000)) : null;
      const arrivalGate = r.arrivalGateId ? gateMap.get(r.arrivalGateId) : null;
      const exitGate = r.exitGateId ? gateMap.get(r.exitGateId) : null;
      const missingExit = !r.exitedAt;
      let rowStatus: 'present' | 'late' | 'no_exit' = 'present';
      if (missingExit) rowStatus = 'no_exit';
      else if (late) rowStatus = 'late';
      const anomaly =
        (durationMinutes != null && durationMinutes > 12 * 60) ||
        (Number.isFinite(hour) && (hour < 6 || hour >= 21)) ||
        (missingExit && day < todayKey);
      return {
        id: r.id,
        kind: 'attendance' as const,
        day,
        arrivedAt: r.arrivedAt,
        exitedAt: r.exitedAt,
        durationMinutes,
        late,
        missingExit,
        absent: false,
        status: rowStatus,
        anomaly,
        arrivalMinutes: minutesOfDay(r.arrivedAt, tz),
        staff: {
          id: r.user.id,
          fullName: r.user.fullName,
          email: r.user.email,
          role: r.user.role,
          roleLabel: roleLabel(r.user.role),
          avatarPath: r.user.avatarPath,
          createdAt: r.user.createdAt,
        },
        organisation: r.organisation,
        arrivalGate: arrivalGate ? { id: arrivalGate.id, name: arrivalGate.name, location: arrivalGate.location } : null,
        exitGate: exitGate ? { id: exitGate.id, name: exitGate.name, location: exitGate.location } : null,
      };
    });

    const staffWhere: any = { isActive: true, role: { in: EXPECTED_ROLES } };
    if (orgId) staffWhere.organisationId = orgId;
    else if (q.organisationId) staffWhere.organisationId = q.organisationId;
    if (q.role && /^(STAFF|ADMIN|GATE)$/.test(q.role)) staffWhere.role = q.role;
    if (q.staffId) staffWhere.id = q.staffId;

    const expected = await this.prisma.user.findMany({
      where: staffWhere,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        avatarPath: true,
        createdAt: true,
        organisationId: true,
        organisation: { select: { id: true, name: true, code: true } },
      },
    });

    const presentKeys = new Set(mapped.map((r) => `${r.staff.id}:${r.day}`));
    const weekdayKeys = enumerateKeys(fromKey, toKey).filter(isWeekdayKey);
    const absentRows: typeof mapped = [];
    const includeAbsent = status === 'absent' || status === 'all';
    if (includeAbsent) {
      for (const person of expected) {
        if (term) {
          const hay = [person.fullName, person.email, person.organisation?.name, person.organisation?.code, roleLabel(person.role)]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(term));
          if (!hay) continue;
        }
        const createdKey = localDayKey(person.createdAt);
        for (const day of weekdayKeys) {
          if (day < createdKey) continue;
          if (q.gateId || q.locationId) continue; // absences are not gate-specific
          if (presentKeys.has(`${person.id}:${day}`)) continue;
          absentRows.push({
            id: `absent:${person.id}:${day}`,
            kind: 'absent' as any,
            day,
            arrivedAt: null as any,
            exitedAt: null,
            durationMinutes: null,
            late: false,
            missingExit: false,
            absent: true,
            status: 'absent' as any,
            anomaly: false,
            arrivalMinutes: null as any,
            staff: {
              id: person.id,
              fullName: person.fullName,
              email: person.email,
              role: person.role,
              roleLabel: roleLabel(person.role),
              avatarPath: person.avatarPath,
              createdAt: person.createdAt,
            },
            organisation: person.organisation,
            arrivalGate: null,
            exitGate: null,
          });
        }
      }
    }

    let combined = [...mapped, ...absentRows];
    if (status === 'present') combined = mapped.filter((r) => !r.missingExit && !r.late);
    else if (status === 'late') combined = mapped.filter((r) => r.late);
    else if (status === 'no_exit') combined = mapped.filter((r) => r.missingExit);
    else if (status === 'absent') combined = absentRows;

    combined.sort((a, b) => (a.day === b.day ? String(a.staff.fullName).localeCompare(b.staff.fullName) : b.day.localeCompare(a.day)));

    // Insights from the unpaginated, un-status-filtered attendance in range (plus today's absences)
    const todayRows = mapped.filter((r) => r.day === todayKey);
    const presentNow = todayRows.filter((r) => r.missingExit).length;
    const lateToday = todayRows.filter((r) => r.late).length;
    const absentToday = isWeekdayKey(todayKey)
      ? expected.filter((p) => localDayKey(p.createdAt) <= todayKey && !todayRows.some((r) => r.staff.id === p.id)).length
      : 0;
    const arrivalVals = mapped.map((r) => r.arrivalMinutes).filter((n) => typeof n === 'number') as number[];
    const avgArrival = arrivalVals.length ? Math.round(arrivalVals.reduce((a, b) => a + b, 0) / arrivalVals.length) : null;
    const durVals = mapped.filter((r) => r.durationMinutes != null).map((r) => r.durationMinutes as number);
    const avgMinutes = durVals.length ? Math.round(durVals.reduce((a, b) => a + b, 0) / durVals.length) : null;

    const byStaff = new Map<string, { staff: (typeof mapped)[0]['staff']; organisation: any; days: number; late: number; missing: number; anomalies: number; expectedDays: number }>();
    for (const person of expected) {
      const createdKey = localDayKey(person.createdAt);
      const expectedDays = weekdayKeys.filter((d) => d >= createdKey).length;
      byStaff.set(person.id, {
        staff: {
          id: person.id,
          fullName: person.fullName,
          email: person.email,
          role: person.role,
          roleLabel: roleLabel(person.role),
          avatarPath: person.avatarPath,
          createdAt: person.createdAt,
        },
        organisation: person.organisation,
        days: 0,
        late: 0,
        missing: 0,
        anomalies: 0,
        expectedDays,
      });
    }
    for (const r of mapped) {
      const bucket = byStaff.get(r.staff.id) || {
        staff: r.staff,
        organisation: r.organisation,
        days: 0,
        late: 0,
        missing: 0,
        anomalies: 0,
        expectedDays: weekdayKeys.length,
      };
      bucket.days += 1;
      if (r.late) bucket.late += 1;
      if (r.missingExit) bucket.missing += 1;
      if (r.anomaly) bucket.anomalies += 1;
      byStaff.set(r.staff.id, bucket);
    }

    const staffList = [...byStaff.values()];
    const frequentlyLate = staffList
      .filter((s) => s.days >= 2 && s.late >= 2 && s.late / s.days >= 0.3)
      .sort((a, b) => b.late - a.late)
      .slice(0, 8)
      .map((s) => ({ ...s.staff, organisation: s.organisation, days: s.days, late: s.late }));
    const perfectAttendance = staffList
      .filter((s) => s.expectedDays > 0 && s.days >= s.expectedDays && s.late === 0 && s.missing === 0)
      .sort((a, b) => b.days - a.days)
      .slice(0, 8)
      .map((s) => ({ ...s.staff, organisation: s.organisation, days: s.days }));
    const missingExits = mapped
      .filter((r) => r.missingExit)
      .slice(0, 12)
      .map((r) => ({ id: r.id, day: r.day, staff: r.staff, organisation: r.organisation, arrivedAt: r.arrivedAt }));
    const anomalies = mapped
      .filter((r) => r.anomaly)
      .slice(0, 12)
      .map((r) => ({
        id: r.id,
        day: r.day,
        staff: r.staff,
        organisation: r.organisation,
        reason:
          r.durationMinutes != null && r.durationMinutes > 12 * 60
            ? `Long stay (${Math.round((r.durationMinutes / 60) * 10) / 10}h)`
            : r.missingExit && r.day < todayKey
              ? 'Missing exit on a past day'
              : 'Unusual arrival time',
      }));

    const total = combined.length;
    const paged = combined.slice((page - 1) * pageSize, page * pageSize);

    const orgIds = [...new Set(expected.map((p) => p.organisationId).concat(mapped.map((r) => r.organisation.id)))];
    const locWhere: any = orgId ? { OR: [{ organisationId: orgId }, { isShared: true }] } : q.organisationId ? { OR: [{ organisationId: q.organisationId }, { isShared: true }] } : {};
    const locations = await this.prisma.location.findMany({
      where: locWhere,
      select: { id: true, name: true, organisationId: true, gates: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      take: 200,
    });
    const agencies = orgId
      ? []
      : await this.prisma.organisation.findMany({
          where: orgIds.length ? { id: { in: orgIds } } : { users: { some: { role: { in: EXPECTED_ROLES } } } },
          select: { id: true, name: true, code: true },
          orderBy: { name: 'asc' },
        });

    return {
      timezone: tz,
      range: { from: fromKey, to: toKey },
      kpis: {
        presentNow,
        lateToday,
        absentToday,
        avgArrival: formatClock(avgArrival),
        avgArrivalMinutes: avgArrival,
        avgHours: avgMinutes != null ? Math.round((avgMinutes / 60) * 10) / 10 : null,
        avgMinutes,
        records: mapped.length,
        absences: absentRows.length,
      },
      flags: { frequentlyLate, perfectAttendance, missingExits, anomalies },
      facets: {
        agencies,
        locations: locations.map((l) => ({ id: l.id, name: l.name, organisationId: l.organisationId, gates: l.gates })),
        roles: ['STAFF', 'ADMIN', 'GATE'],
      },
      page,
      pageSize,
      total,
      rows: paged,
    };
  }

  async staffHistory(orgId: string | null, staffId: string, q: RegisterQuery) {
    const person = await this.prisma.user.findFirst({
      where: { id: staffId, ...(orgId ? { organisationId: orgId } : {}) },
      select: { id: true, fullName: true, email: true, role: true, avatarPath: true, organisation: { select: { id: true, name: true, code: true } } },
    });
    if (!person) return null;
    const data = await this.register(orgId, { ...q, staffId, status: 'all', page: 1, pageSize: 100 });
    return {
      timezone: data.timezone,
      range: data.range,
      staff: { ...person, roleLabel: roleLabel(person.role) },
      flags: data.flags,
      kpis: data.kpis,
      rows: data.rows,
      total: data.total,
    };
  }

  async exportCsv(orgId: string | null, q: RegisterQuery, res: Response) {
    const data = await this.register(orgId, { ...q, page: 1, pageSize: EXPORT_CAP });
    const header = ['Date', 'Name', 'Email', 'Agency', 'Role', 'Status', 'Arrival', 'Exit', 'Duration (min)', 'Late', 'Gate'];
    const lines = [header.map(csvEscape).join(',')];
    for (const r of data.rows.slice(0, EXPORT_CAP)) {
      lines.push(
        [
          r.day,
          r.staff.fullName,
          r.staff.email,
          r.organisation?.name || '',
          r.staff.roleLabel,
          r.absent ? 'Absent' : r.missingExit ? 'No exit' : r.late ? 'Late' : 'Present',
          r.arrivedAt ? fmtTime(new Date(r.arrivedAt), data.timezone) : '',
          r.exitedAt ? fmtTime(new Date(r.exitedAt), data.timezone) : '',
          r.durationMinutes ?? '',
          r.late ? 'Yes' : 'No',
          r.arrivalGate?.name || '',
        ].map(csvEscape).join(','),
      );
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vicit-attendance-register_${stamp}.csv"`);
    res.setHeader('X-Export-Total', String(data.total));
    res.setHeader('X-Export-Cap', String(EXPORT_CAP));
    res.setHeader('X-Export-Truncated', data.total > EXPORT_CAP ? 'true' : 'false');
    res.send('\ufeff' + lines.join('\r\n'));
  }
}
