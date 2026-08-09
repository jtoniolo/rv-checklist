'use client';

import type { Id, LogEntry, MaintenanceTask } from '@rv-checklist/domain';
import {
  cn,
  FilterToggle,
  Input,
  ListEmpty,
  TagChip,
} from '@rv-checklist/web-ui';
import { useMemo, useState, type JSX } from 'react';

/**
 * The rig-wide maintenance history / timeline view (issue #43): every
 * completion over time as a reverse-chronological, month-grouped timeline,
 * with spend summarised on top and broken down by tag.
 *
 * Renders from the rig's already-loaded log entries (no new fetch) and the
 * task list (for tag lookup). Entries whose task was deleted appear with a
 * "deleted task" label and no tags.
 *
 * Cost handling: entries with no recorded cost contribute $0 to spend totals.
 * The "Avg / job" tile divides total cost by the number of entries that *have*
 * a cost recorded, so free / DIY jobs do not distort the average.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/** A log entry enriched with its task's tags for rendering and filtering. */
interface HistoryEntry {
  readonly entry: LogEntry;
  readonly tags: readonly string[];
}

interface MonthGroup {
  readonly key: string;
  readonly label: string;
  readonly entries: readonly HistoryEntry[];
  readonly subtotalCents: number;
}

// ── Formatting ──────────────────────────────────────────────────────────────

/** "$112.40" / "$100" — cents in, dropping the decimals when whole. */
function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

/** "Jul 10" — short day label for a timeline row. */
function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** "July 2026" from a "YYYY-MM" key. */
function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

// ── Grouping & filtering ────────────────────────────────────────────────────

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function totalCents(entries: readonly HistoryEntry[]): number {
  return entries.reduce((sum, h) => sum + (h.entry.costCents ?? 0), 0);
}

function groupByMonth(entries: readonly HistoryEntry[]): readonly MonthGroup[] {
  const keys = [
    ...new Set(entries.map((h) => monthKey(h.entry.performedOn))),
  ].toSorted((a, b) => b.localeCompare(a));

  return keys.map((key) => {
    const rows = entries
      .filter((h) => monthKey(h.entry.performedOn) === key)
      .toSorted((a, b) =>
        b.entry.performedOn.localeCompare(a.entry.performedOn),
      );
    return {
      key,
      label: monthLabel(key),
      entries: rows,
      subtotalCents: totalCents(rows),
    };
  });
}

function filterHistory(
  entries: readonly HistoryEntry[],
  search: string,
  tags: readonly string[],
  isCostsOnly: boolean,
): readonly HistoryEntry[] {
  const q = search.trim().toLowerCase();
  return entries.filter((h) => {
    if (isCostsOnly && h.entry.costCents === undefined) return false;
    if (tags.some((t) => !h.tags.includes(t))) return false;
    if (q.length > 0) {
      const hay = `${h.entry.taskName} ${h.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ── Component ───────────────────────────────────────────────────────────────

export function MaintenanceHistory({
  entries,
  tasks,
  allTags,
  today,
}: {
  readonly entries: readonly LogEntry[];
  readonly tasks: readonly MaintenanceTask[];
  readonly allTags: readonly string[];
  readonly today: string;
}): JSX.Element {
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<readonly string[]>([]);
  const [isCostsOnly, setIsCostsOnly] = useState(false);

  // Build tag lookup from tasks.
  const tagsByTaskId = useMemo(() => {
    const map = new Map<Id, readonly string[]>();
    for (const task of tasks) {
      map.set(task.id, task.tags);
    }
    return map;
  }, [tasks]);

  // Enrich entries with tags, newest first.
  const hydrated: readonly HistoryEntry[] = useMemo(
    () =>
      entries
        .map((entry) => {
          const tags =
            entry.taskId === null ? [] : (tagsByTaskId.get(entry.taskId) ?? []);
          return { entry, tags };
        })
        .toSorted((a, b) =>
          b.entry.performedOn.localeCompare(a.entry.performedOn),
        ),
    [entries, tagsByTaskId],
  );

  const filtered = useMemo(
    () => filterHistory(hydrated, search, selectedTags, isCostsOnly),
    [hydrated, search, selectedTags, isCostsOnly],
  );

  const months = useMemo(() => groupByMonth(filtered), [filtered]);

  // Summary tiles.
  const thisYear = today.slice(0, 4);
  const total = totalCents(filtered);
  const thisYearTotal = totalCents(
    filtered.filter((h) => h.entry.performedOn.startsWith(thisYear)),
  );
  const costed = filtered.filter((h) => h.entry.costCents !== undefined);
  const avg = costed.length > 0 ? Math.round(total / costed.length) : 0;
  let biggest = 0;
  for (const h of filtered) {
    biggest = Math.max(biggest, h.entry.costCents ?? 0);
  }

  // Spend by tag.
  const byTag = useMemo(() => {
    const sums = new Map<string, number>();
    for (const h of filtered) {
      for (const tag of h.tags) {
        sums.set(tag, (sums.get(tag) ?? 0) + (h.entry.costCents ?? 0));
      }
    }
    return [...sums]
      .filter(([, cents]) => cents > 0)
      .toSorted((a, b) => b[1] - a[1]);
  }, [filtered]);

  const toggleTag = (tag: string): void => {
    setSelectedTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Summary tiles. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Total spend" value={formatMoney(total)} />
        <Tile label="This year" value={formatMoney(thisYearTotal)} />
        <Tile label="Avg / job" value={formatMoney(avg)} />
        <Tile label="Biggest job" value={formatMoney(biggest)} />
      </div>

      {/* Filters — sticky under the app header. */}
      <div className="sticky top-[3.25rem] z-10 -mx-4 flex flex-col gap-3 border-b border-hairline bg-surface/95 px-4 py-3 backdrop-blur lg:top-[3.5rem] lg:-mx-6 lg:px-6 dark:bg-surface-dark/95">
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder="Search history…"
            className="flex-1"
            aria-label="Search history"
          />
          <FilterToggle
            label="Costs only"
            pressed={isCostsOnly}
            onToggle={() => {
              setIsCostsOnly((v) => !v);
            }}
          />
        </div>
        {allTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => (
              <TagChip
                key={tag}
                tag={tag}
                selected={selectedTags.includes(tag)}
                onClick={() => {
                  toggleTag(tag);
                }}
              />
            ))}
          </div>
        ) : undefined}
      </div>

      {filtered.length === 0 ? (
        <ListEmpty message="No history matches." />
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Timeline feed. */}
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {months.map((month) => (
              <section key={month.key} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold tracking-wide text-brand-muted uppercase">
                    {month.label}
                  </h2>
                  <span className="text-sm text-brand-muted">
                    {month.subtotalCents > 0
                      ? formatMoney(month.subtotalCents)
                      : '—'}{' '}
                    &middot; {month.entries.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-4 border-l-2 border-hairline pl-4">
                  {month.entries.map((h) => (
                    <TimelineRow key={h.entry.id} historyEntry={h} />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {/* Spend by tag. */}
          {byTag.length > 0 ? (
            <aside
              className="shrink-0 lg:sticky lg:top-[10rem] lg:w-56"
              aria-label="Spend by tag"
            >
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-brand-muted uppercase">
                Spend by tag
              </h3>
              <ul className="flex flex-col gap-2">
                {byTag.map(([tag, cents]) => (
                  <li key={tag} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-brand dark:text-ink-inverted">
                        {tag}
                      </span>
                      <span className="text-brand-muted tabular-nums">
                        {formatMoney(cents)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-hairline/50">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{
                          width: `${String(Math.round((cents / (byTag[0]?.[1] ?? cents)) * 100))}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </aside>
          ) : undefined}
        </div>
      )}
    </div>
  );
}

// ── Summary tile ────────────────────────────────────────────────────────────

function Tile({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-hairline p-3">
      <span className="text-xs text-brand-muted">{label}</span>
      <span className="text-lg font-semibold text-brand tabular-nums dark:text-ink-inverted">
        {value}
      </span>
    </div>
  );
}

// ── Timeline row ────────────────────────────────────────────────────────────

function TimelineRow({
  historyEntry,
}: {
  readonly historyEntry: HistoryEntry;
}): JSX.Element {
  const { entry, tags } = historyEntry;
  return (
    <li className="relative">
      {/* Dot on the rail. */}
      <span
        aria-hidden
        className="absolute top-1.5 -left-[1.3rem] h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand dark:border-surface-dark"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-medium text-brand-muted">
              {fmtDay(entry.performedOn)}
            </span>
            <span className="font-medium text-brand dark:text-ink-inverted">
              {entry.taskName}
            </span>
            {entry.taskId === null ? (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.65rem] font-medium text-secondary-foreground">
                deleted task
              </span>
            ) : undefined}
          </div>
          {tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <TagChip key={tag} tag={tag} />
              ))}
            </div>
          ) : undefined}
          {entry.distanceKm === undefined ? undefined : (
            <span className="text-sm text-brand-muted">
              {entry.distanceKm.toLocaleString('en-US')} km
            </span>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 text-sm font-semibold',
            entry.costCents === undefined
              ? 'text-brand-muted'
              : 'text-brand dark:text-ink-inverted',
          )}
        >
          {entry.costCents === undefined ? '—' : formatMoney(entry.costCents)}
        </span>
      </div>
    </li>
  );
}
