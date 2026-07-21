/**
 * An IsoDate calendar day in the owner's locale, e.g. "Jul 20, 2026" — used for
 * a run's occasion and a log entry's performed-on / due dates alike. The
 * explicit midnight keeps the calendar date from shifting a day in
 * negative-offset timezones (a bare date string parses as UTC).
 */
export function formatIsoDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    dateStyle: 'medium',
  });
}

/** Today as an IsoDate (`YYYY-MM-DD`) in the owner's local calendar. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}
