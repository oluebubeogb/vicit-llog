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
export function inviteStatus(inv: { status: string; expiresAt?: string | null }): string {
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
