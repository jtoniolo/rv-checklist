/**
 * A run's occasion date (`startedOn`, an IsoDate) in the owner's locale, e.g.
 * "Jul 20, 2026". The explicit midnight keeps the calendar date from shifting
 * a day in negative-offset timezones (a bare date string parses as UTC).
 */
export function formatStartedOn(startedOn: string): string {
  return new Date(`${startedOn}T00:00:00`).toLocaleDateString(undefined, {
    dateStyle: 'medium',
  });
}
