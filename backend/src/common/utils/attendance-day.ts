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
