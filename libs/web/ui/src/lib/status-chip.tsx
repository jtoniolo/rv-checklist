import { type JSX } from 'react';
import { cn } from './ui/utils';

/** The derived trip statuses a chip can show (mirrors the domain's `TripStatus`). */
export type StatusChipStatus = 'planned' | 'underway' | 'completed';

const TONES: Record<StatusChipStatus, string> = {
  planned: 'bg-secondary text-secondary-foreground',
  underway: 'bg-primary text-primary-foreground',
  completed: 'bg-emerald-600 text-white',
};

const LABELS: Record<StatusChipStatus, string> = {
  planned: 'Planned',
  underway: 'Underway',
  completed: 'Completed',
};

/**
 * A trip-status chip (issue #114) — a small rounded badge in the status's
 * tone (planned = secondary, underway = primary, completed = emerald).
 * Shared presentational component (ADR-0009/0013) used on trip rows and, with
 * `onClick`, as a status filter toggle; the filter form only takes the tone
 * while pressed, so the pressed state reads at a glance.
 */
export function StatusChip({
  status,
  selected,
  onClick,
}: {
  readonly status: StatusChipStatus;
  readonly selected?: boolean;
  readonly onClick?: () => void;
}): JSX.Element {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

  if (onClick !== undefined) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={onClick}
        className={cn(
          base,
          'border transition-colors',
          selected
            ? cn(TONES[status], 'border-brand')
            : 'border-hairline text-brand-muted hover:border-brand',
        )}
      >
        {LABELS[status]}
      </button>
    );
  }

  return <span className={cn(base, TONES[status])}>{LABELS[status]}</span>;
}
