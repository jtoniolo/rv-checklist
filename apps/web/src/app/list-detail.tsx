'use client';

import { cn } from '@rv-checklist/web-ui';
import type { JSX } from 'react';

/**
 * Shared list/detail primitives (issue #38): building blocks for the "full-page
 * drill-in" pattern — one column, selecting an item replaces the list with a
 * full-page read-only detail, and a back action returns to the list. No split
 * pane, no sidebar. The maintenance screen uses these now; the checklists
 * screen adopts the same pattern later.
 */

/** A back link visible on all screen sizes (the drill-in exit). */
export function BackLink({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start text-sm font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
    >
      {label}
    </button>
  );
}

/** One option in a {@link SortGroup}. */
export interface SortOption<K extends string> {
  readonly key: K;
  readonly label: string;
}

/** A row of mutually exclusive sort buttons, labelled "Sort". */
export function SortGroup<K extends string>({
  options,
  value,
  onChange,
}: {
  readonly options: readonly SortOption<K>[];
  readonly value: K;
  readonly onChange: (key: K) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Sort">
      <span className="text-brand-muted">Sort</span>
      {options.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => {
            onChange(key);
          }}
          className={cn(
            'rounded-md px-2 py-1 font-medium',
            value === key
              ? 'bg-brand text-white'
              : 'text-brand-muted hover:text-brand dark:hover:text-ink-inverted',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A toggle button for binary filtering (e.g. "One-time"). */
export function FilterToggle({
  label,
  pressed,
  onToggle,
}: {
  readonly label: string;
  readonly pressed: boolean;
  readonly onToggle: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        'h-9 rounded-md border px-3 text-sm font-medium whitespace-nowrap',
        pressed
          ? 'border-brand bg-brand text-white'
          : 'border-hairline text-brand-muted hover:border-brand',
      )}
    >
      {label}
    </button>
  );
}

/** An empty-state message for a filtered/searched list with no results. */
export function ListEmpty({
  message,
}: {
  readonly message: string;
}): JSX.Element {
  return (
    <p className="py-10 text-center text-sm text-brand-muted">{message}</p>
  );
}
