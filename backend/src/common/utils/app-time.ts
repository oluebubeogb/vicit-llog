/** APP_TIMEZONE (default Africa/Lagos) helpers. */
export const APP_TZ = () => process.env.APP_TIMEZONE || 'Africa/Lagos';

function tzOffsetMinutes(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const g = (t: string) => parseInt(parts.find((p) => p.type === t)?.value || '0', 10);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * Parse a date/time from the client. ISO strings with Z/offset are taken as-is; a bare
 * "YYYY-MM-DDTHH:mm" wall time is read in APP_TIMEZONE.
 */
export function parseAppDateTime(input: any): Date | null {
  if (input === undefined || input === null || input === '') return null;
  const s = String(input).trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  const off = tzOffsetMinutes(new Date(naive), APP_TZ());
  return new Date(naive - off * 60000);
}

/** Reject dates/times in the past (1-minute grace for clock drift). */
export function isPast(d: Date, graceMs = 60_000) {
  return d.getTime() < Date.now() - graceMs;
}

export function fmtAppTime(d?: Date | string | null) {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toLocaleString('en-GB', { timeZone: APP_TZ(), weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
