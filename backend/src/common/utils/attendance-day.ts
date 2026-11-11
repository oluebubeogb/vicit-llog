/**
 * Attendance calendar day uses APP_TIMEZONE (default Africa/Lagos).
 * Returns a Date at 00:00:00.000 UTC that uniquely identifies that local calendar day
 * via an ISO date string key (YYYY-MM-DD) stored as midnight UTC of that date number.
 */
export function attendanceTimeZone(): string {
  return process.env.APP_TIMEZONE || process.env.TZ || 'Africa/Lagos';
}

export function localDayKey(now = new Date(), timeZone = attendanceTimeZone()): string {
  // en-CA → YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Store day as Date at UTC midnight for the local YYYY-MM-DD key. */
export function dayDateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function currentAttendanceDay(now = new Date()): Date {
  return dayDateFromKey(localDayKey(now));
}

/** Milliseconds to add to a UTC instant to get the wall-clock time in `timeZone`. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const hour = get('hour') % 24;
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUtc - date.getTime();
}

/** UTC instant of local midnight for a YYYY-MM-DD key in `timeZone`. */
export function zonedMidnightUtc(dayKey: string, timeZone = attendanceTimeZone()): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let date = new Date(utcGuess);
  date = new Date(utcGuess - zoneOffsetMs(date, timeZone));
  date = new Date(utcGuess - zoneOffsetMs(date, timeZone));
  return date;
}

/** Exclusive upper bound of "today" in APP_TIMEZONE — i.e. tomorrow's local midnight. */
export function startOfNextLocalDay(now = new Date(), timeZone = attendanceTimeZone()): Date {
  const [y, m, d] = localDayKey(now, timeZone).split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return zonedMidnightUtc(next.toISOString().slice(0, 10), timeZone);
}

export function isAfterLocalToday(date: Date, now = new Date(), timeZone = attendanceTimeZone()): boolean {
  return localDayKey(date, timeZone) > localDayKey(now, timeZone);
}

