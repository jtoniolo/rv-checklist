/**
 * Whether a caught error is Postgres' `unique_violation` (SQLSTATE 23505) —
 * the signal every client-generated-id create leans on (ADR-0028, issue #143).
 * A create inserts and catches instead of reading first: check-then-insert has
 * a window two concurrent replays of the same queued operation fit through,
 * whereas the unique index on the primary key decides once, in the database.
 *
 * TypeORM wraps driver errors in `QueryFailedError`, copying the driver's own
 * properties onto it; older paths surface the driver error nested under
 * `driverError`, so both are checked.
 */
export function isUniqueViolation(error: unknown): boolean {
  return hasCode23505(error) || hasCode23505(driverErrorOf(error));
}

function driverErrorOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'driverError' in error
    ? error.driverError
    : undefined;
}

function hasCode23505(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}
