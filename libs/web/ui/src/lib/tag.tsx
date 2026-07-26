import { type JSX } from 'react';
import { cn } from './ui/utils';

/**
 * A tag chip — a small rounded badge for rendering a canonical tag (issue #41,
 * ADR-0017). Shared presentational component (ADR-0009/0013) used on task rows,
 * the detail view, and the tag filter toolbar.
 */
export function TagChip({
  tag,
  selected,
  onClick,
}: {
  readonly tag: string;
  readonly selected?: boolean;
  readonly onClick?: () => void;
}): JSX.Element {
  const base =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';
  const isInteractive = onClick !== undefined;

  if (isInteractive) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={onClick}
        className={cn(
          base,
          selected
            ? 'bg-brand text-white'
            : 'bg-hairline text-brand-muted hover:border-brand',
        )}
      >
        {tag}
      </button>
    );
  }

  return (
    <span className={cn(base, 'bg-hairline text-brand-muted')}>{tag}</span>
  );
}
