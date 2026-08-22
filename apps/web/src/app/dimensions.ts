/**
 * Dual-unit formatting for the rig's **Dimensions** (CONTEXT.md, issue #139).
 * Storage is integer millimetres; display is metric first with imperial in
 * parentheses. The imperial figure always rounds **up** to the next whole inch:
 * for the rig's own size, overstating is the safe error — "at most this big"
 * is the dangerous lie, "at least this big" never is.
 */

const MM_PER_INCH = 25.4;

/** Whole inches, rounded up — the safe direction for the rig's own size. */
function toInches(mm: number): number {
  return Math.ceil(mm / MM_PER_INCH);
}

/** Inches as `13 ft 6 in`, dropping a zero remainder (`28 ft`). */
function formatFeetInches(totalInches: number): string {
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  if (feet === 0) {
    return `${String(inches)} in`;
  }
  return inches === 0
    ? `${String(feet)} ft`
    : `${String(feet)} ft ${String(inches)} in`;
}

/** Millimetres as `4.11 m (13 ft 6 in)` — metres echo the two-decimal entry. */
export function formatMeters(mm: number): string {
  return `${(mm / 1000).toFixed(2)} m (${formatFeetInches(toInches(mm))})`;
}

/** Millimetres as `90 cm (36 in)` — whole centimetres, as entered. */
export function formatCentimeters(mm: number): string {
  return `${String(Math.round(mm / 10))} cm (${String(toInches(mm))} in)`;
}
