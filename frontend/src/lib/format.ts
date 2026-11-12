/** Human formatting helpers shared across pages. */

export function relTime(ts?: string | Date | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const s = Math.round((Date.now() - +d) / 1000);
  const abs = Math.abs(s);
  const fut = s < 0;
  const fmt = (n: number, u: string) => (fut ? `in ${n}${u}` : `${n}${u} ago`);
  if (abs < 45) return fut ? 'in a moment' : 'just now';
  if (abs < 3600) return fmt(Math.round(abs / 60), 'm');
  if (abs < 86400) return fmt(Math.round(abs / 3600), 'h');
  if (abs < 86400 * 7) {
    const days = Math.round(abs / 86400);
    if (days === 1) return fut ? 'tomorrow' : 'yesterday';
    return fmt(days, 'd');
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function fmtDate(ts?: string | Date | null, withTime = true): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(+d)) return '—';
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function fmtTime(ts?: string | Date | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDuration(minutes?: number | null): string {
  if (minutes == null || isNaN(minutes)) return '—';
  if (minutes < 1) return '< 1 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function initials(name?: string | null): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function titleCase(s?: string | null): string {
  return String(s || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function plural(n: number, one: string, many?: string) {
  return `${n} ${n === 1 ? one : many || one + 's'}`;
}

export const MODE_LABEL: Record<string, string> = {
  PEDESTRIAN: 'On foot',
  MOTORCYCLE: 'Motorcycle',
  VEHICLE: 'Vehicle',
};

/** Effective invite status (an ACTIVE invite past expiry is shown as Expired). */
export function inviteStatus(inv: { status: string; expiresAt?: string | null; cancelledAt?: string | null }): string {
  if (inv.cancelledAt) return 'CANCELLED';
  if (
    inv.status === 'EXPIRED' ||
    (inv.status === 'ACTIVE' && inv.expiresAt && new Date(inv.expiresAt) < new Date())
  )
    return 'EXPIRED';
  return inv.status;
}

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const photoUrl = (p?: string | null) => (p ? `${API_URL}/visitors/photo/${p}` : null);
export const avatarUrl = (p?: string | null) => (p ? `${API_URL}/users/avatar/${p}` : null);

export const staffBadgeUrl = (p?: string | null) => (p ? `${API_URL}/users/staff-badge/${p}` : null);

/** App calendar day (matches backend APP_TIMEZONE, default Africa/Lagos). */
export const APP_TIMEZONE = 'Africa/Lagos';

export function localDayKey(ts?: string | Date | null, timeZone = APP_TIMEZONE): string {
  const d = ts ? new Date(ts) : new Date();
  if (isNaN(+d)) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** True when the visit is expected after today (and has not already arrived/exited). */
export function isScheduledVisit(expectedAt?: string | Date | null, status?: string | null) {
  if (!expectedAt) return false;
  if (['ARRIVED', 'EXITED', 'DENIED', 'CANCELLED'].includes(String(status || ''))) return false;
  const when = localDayKey(expectedAt);
  return !!when && when > localDayKey(new Date());
}

export function isScheduledInvite(inv: { expectedAt?: string | Date | null; visitors?: Array<{ status?: string }> } | null | undefined) {
  if (!inv?.expectedAt) return false;
  const visitors = inv.visitors || [];
  if (visitors.some((v) => ['ARRIVED', 'EXITED', 'DENIED'].includes(String(v.status || '')))) return false;
  return isScheduledVisit(inv.expectedAt, 'INVITED');
}

/** Clock-style duration such as 02:14 (or 1:02:14 if an hour or more). */
export function fmtCallClock(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function callDurationMs(answeredAt?: string | Date | null, endedAt?: string | Date | null): number | null {
  if (!answeredAt || !endedAt) return null;
  const ms = new Date(endedAt).getTime() - new Date(answeredAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}
