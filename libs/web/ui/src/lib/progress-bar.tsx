import type { JSX } from 'react';

/**
 * The thin brand-coloured progress bar used on continue cards, checklist rows,
 * and the run screen (issue #22). `value` is a 0–1 fraction; resolved steps
 * (complete or skipped) both count as progress.
 */
export function ProgressBar({
  value,
}: {
  readonly value: number;
}): JSX.Element {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
      <div
        className="h-full rounded-full bg-brand transition-all"
        style={{ width: `${String(Math.round(value * 100))}%` }}
      />
    </div>
  );
}

/** The resolved-over-total fraction for a progress bar. */
export function fractionDone(progress: {
  readonly completed: number;
  readonly skipped: number;
  readonly total: number;
}): number {
  return (progress.completed + progress.skipped) / Math.max(1, progress.total);
}
