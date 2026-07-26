'use client';

import {
  dueStatus,
  latestPerformedOn,
  latestReadingKm,
  taskAppearances,
  type DueStatus,
  type Id,
  type LogEntry,
  type LoggedField,
  type MaintenanceTask,
  type Rig,
  type TaskAppearance,
} from '@rv-checklist/domain';
import {
  skipToken,
  useCreateLogEntryMutation,
  useCreateTaskMutation,
  useDeleteLogEntryMutation,
  useDeleteTaskMutation,
  useListChecklistsQuery,
  useListLogEntriesByRigQuery,
  useListLogEntriesQuery,
  useListTasksQuery,
  useUpdateLogEntryMutation,
  useUpdateTaskMutation,
} from '@rv-checklist/web-data-access';
import {
  BackLink,
  FilterToggle,
  Input,
  ListEmpty,
  SortGroup,
  TagChip,
  type SortOption,
} from '@rv-checklist/web-ui';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { formatIsoDate, todayIso } from './dates';
import { LogEntryForm } from './log-entry-form';
import { TaskForm, type TaskFormValues } from './task-form';

/**
 * The maintenance surface, redesigned (issue #38): a single-column, searchable
 * task list with sort and filter controls. Selecting a task opens a full-page
 * read-only detail — standing, description, recorded fields, and full log
 * history — with a back action to return to the list. No split pane, no
 * sidebar, no Edit-to-see-details.
 *
 * The layout components ({@link BackLink}, {@link SortGroup}, {@link FilterToggle},
 * {@link ListEmpty}) are shared primitives from `@rv-checklist/web-ui` so the
 * checklists screen can adopt the same full-page drill-in pattern later.
 *
 * Each task row wears its due/overdue standing, computed on read (ADR-0005)
 * by the shared `dueStatus` domain function from the rig's log entries — one
 * request for the whole list, no persisted due-date, nothing scheduled.
 */

type MaintenanceSortKey = 'name' | 'due' | 'lastPerformed';

const SORT_OPTIONS: readonly SortOption<MaintenanceSortKey>[] = [
  { key: 'due', label: 'Due' },
  { key: 'name', label: 'Name' },
  { key: 'lastPerformed', label: 'Last performed' },
];

export function MaintenanceScreen({
  activeRig,
  openTaskId,
  onOpenTask,
  onOpenChecklist,
  onBackToList,
  onGoRig,
}: {
  readonly activeRig: Rig | undefined;
  readonly openTaskId: Id | undefined;
  readonly onOpenTask: (id: Id) => void;
  readonly onOpenChecklist: (id: Id) => void;
  readonly onBackToList: () => void;
  readonly onGoRig: () => void;
}): JSX.Element {
  const {
    data: tasks,
    isLoading,
    isError,
  } = useListTasksQuery(activeRig?.id ?? skipToken);
  // The rig's entries back every row's due badge in one read (ADR-0005).
  const { data: rigEntries } = useListLogEntriesByRigQuery(
    activeRig?.id ?? skipToken,
  );
  // The rig's checklists back the detail's "Appears on" section (issue #24) —
  // derived client-side from this already-cached list, no task-specific read.
  const { data: checklists } = useListChecklistsQuery(
    activeRig?.id ?? skipToken,
  );
  const [createTask, { isLoading: isCreating }] = useCreateTaskMutation();
  const [updateTask, { isLoading: isUpdating }] = useUpdateTaskMutation();
  const [deleteTask] = useDeleteTaskMutation();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<MaintenanceSortKey>('due');
  const [oneTimeOnly, setOneTimeOnly] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // All distinct tags across the rig's tasks — drives the tag filter and the
  // tag picker in the form (issue #41).
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    const taskList = tasks ?? [];
    for (const task of taskList) {
      const taskTags = task.tags;
      for (const tag of taskTags) {
        tagSet.add(tag);
      }
    }
    return [...tagSet].toSorted((a, b) => a.localeCompare(b));
  }, [tasks]);

  // Reset ephemeral UI state when the navigation target changes (e.g. browser
  // Back fires popstate, changing openTaskId under this component).
  useEffect(() => {
    setAdding(false);
    setEditing(false);
  }, [openTaskId]);

  if (!activeRig) {
    return (
      <button
        type="button"
        onClick={onGoRig}
        className="w-full rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted transition-colors hover:border-brand"
      >
        Maintenance tasks belong to a rig — add your first rig to get started.
      </button>
    );
  }

  const today = todayIso();

  /** Log entries belonging to a single task — shared by statusOf and lastPerformedOf. */
  const entriesFor = (taskId: Id): readonly LogEntry[] =>
    (rigEntries ?? []).filter((entry) => entry.taskId === taskId);

  // Pre-compute due status for every task in one pass from the rig's entries.
  const statusOf = (task: MaintenanceTask): DueStatus => {
    const entries = entriesFor(task.id);
    return dueStatus({
      interval: task.interval,
      lastPerformedOn: latestPerformedOn(entries),
      today,
      // Conditionally include isOneTime so an absent marker stays absent
      // rather than passing `undefined` (exactOptionalPropertyTypes).
      ...(task.oneTime && { isOneTime: task.oneTime }),
      lastPerformed: task.lastPerformed,
      rigDistanceKm: activeRig.distanceKm,
      lastReadingKm: latestReadingKm(entries),
    });
  };

  /** The effective "last performed" date for a task — the later of log and manual anchor. */
  const lastPerformedOf = (task: MaintenanceTask): string | undefined => {
    const fromLog = latestPerformedOn(entriesFor(task.id));
    const manual = task.lastPerformed;
    // IsoDate strings compare lexicographically — the later one wins.
    // eslint-disable-next-line unicorn/prefer-math-min-max
    if (fromLog && manual) return fromLog > manual ? fromLog : manual;
    return fromLog ?? manual;
  };

  const toggleTag = (tag: string): void => {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  };

  // Entries whose task was deleted (issue #28): kept, orphaned (taskId null),
  // owned via the rig. They belong to no live task section, so the screen shows
  // them on their own below the list, labeled by their snapshotted taskName.
  const orphanedEntries = (rigEntries ?? []).filter(
    (entry) => entry.taskId === null,
  );

  const openTask = tasks?.find((task) => task.id === openTaskId);

  const handleCreate = async (values: TaskFormValues): Promise<void> => {
    const created = await createTask({
      rigId: activeRig.id,
      name: values.name,
      ...(values.description !== undefined && {
        description: values.description,
      }),
      ...(values.oneTime
        ? { oneTime: true }
        : values.interval !== undefined && { interval: values.interval }),
      ...(values.lastPerformed !== undefined && {
        lastPerformed: values.lastPerformed,
      }),
      fieldSchema: values.fieldSchema,
      tags: [...values.tags],
    }).unwrap();
    setAdding(false);
    onOpenTask(created.id);
  };

  // ── Adding a task: full-page form ────────────────────────────────────────
  if (adding) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink
          label="‹ All tasks"
          onClick={() => {
            setAdding(false);
          }}
        />
        <TaskForm
          submitLabel="Add task"
          existingTags={allTags}
          pending={isCreating}
          onSubmit={(values) => void handleCreate(values)}
          onCancel={() => {
            setAdding(false);
          }}
        />
      </div>
    );
  }

  const handleUpdate = async (
    id: Id,
    values: TaskFormValues,
  ): Promise<void> => {
    await updateTask({
      id,
      changes: {
        name: values.name,
        // eslint-disable-next-line unicorn/no-null
        description: values.description ?? null,
        interval:
          values.oneTime || values.interval === undefined
            ? // eslint-disable-next-line unicorn/no-null
              null
            : values.interval,
        // eslint-disable-next-line unicorn/no-null
        oneTime: values.oneTime ? true : null,
        // eslint-disable-next-line unicorn/no-null
        lastPerformed: values.lastPerformed ?? null,
        fieldSchema: values.fieldSchema,
        tags: [...values.tags],
      },
    }).unwrap();
    setEditing(false);
  };

  const handleDelete = async (id: Id): Promise<void> => {
    await deleteTask({ id, rigId: activeRig.id }).unwrap();
    onBackToList();
  };

  // ── Task detail open: full-page detail (or edit form) ───────────────────
  if (openTask) {
    if (editing) {
      return (
        <div className="flex flex-col gap-4">
          <BackLink
            label="‹ All tasks"
            onClick={() => {
              setEditing(false);
              onBackToList();
            }}
          />
          <TaskForm
            initial={openTask}
            existingTags={allTags}
            submitLabel="Save changes"
            pending={isUpdating}
            onSubmit={(values) => void handleUpdate(openTask.id, values)}
            onCancel={() => {
              setEditing(false);
            }}
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <BackLink label="‹ All tasks" onClick={onBackToList} />
        <TaskDetail
          key={openTask.id}
          task={openTask}
          status={statusOf(openTask)}
          appearances={taskAppearances(checklists ?? [], openTask.id)}
          onOpenChecklist={onOpenChecklist}
          onEdit={() => {
            setEditing(true);
          }}
          onDelete={() => void handleDelete(openTask.id)}
        />
      </div>
    );
  }

  // ── List view: search / sort / filter / task rows ───────────────────────
  return (
    <TaskList
      tasks={tasks}
      isLoading={isLoading}
      isError={isError}
      search={search}
      onSearch={setSearch}
      sort={sort}
      onSort={setSort}
      oneTimeOnly={oneTimeOnly}
      onToggleOneTime={() => {
        setOneTimeOnly((v) => !v);
      }}
      allTags={allTags}
      selectedTags={selectedTags}
      onToggleTag={toggleTag}
      statusOf={statusOf}
      lastPerformedOf={lastPerformedOf}
      today={today}
      onOpenTask={(id) => {
        setEditing(false);
        onOpenTask(id);
      }}
      onAdd={() => {
        setEditing(false);
        setAdding(true);
      }}
      orphanedEntries={orphanedEntries}
    />
  );
}

// ── List (search / sort / filter / rows) ──────────────────────────────────

function TaskList({
  tasks,
  isLoading,
  isError,
  search,
  onSearch,
  sort,
  onSort,
  oneTimeOnly,
  onToggleOneTime,
  allTags,
  selectedTags,
  onToggleTag,
  statusOf,
  lastPerformedOf,
  today,
  onOpenTask,
  onAdd,
  orphanedEntries,
}: {
  readonly tasks: readonly MaintenanceTask[] | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly search: string;
  readonly onSearch: (value: string) => void;
  readonly sort: MaintenanceSortKey;
  readonly onSort: (key: MaintenanceSortKey) => void;
  readonly oneTimeOnly: boolean;
  readonly onToggleOneTime: () => void;
  readonly allTags: readonly string[];
  readonly selectedTags: readonly string[];
  readonly onToggleTag: (tag: string) => void;
  readonly statusOf: (task: MaintenanceTask) => DueStatus;
  readonly lastPerformedOf: (task: MaintenanceTask) => string | undefined;
  readonly today: string;
  readonly onOpenTask: (id: Id) => void;
  readonly onAdd: () => void;
  readonly orphanedEntries: readonly LogEntry[];
}): JSX.Element {
  const rows = useMemo(() => {
    let result = [...(tasks ?? [])];

    // One-time filter
    if (oneTimeOnly) result = result.filter((t) => t.oneTime === true);

    // Tag filter: AND — a task must carry every selected tag (issue #41).
    if (selectedTags.length > 0) {
      result = result.filter((t) =>
        selectedTags.every((tag) => t.tags.includes(tag)),
      );
    }

    // Search by name, description, and tags
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => {
        const hay =
          `${t.name} ${t.description ?? ''} ${t.tags.join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (sort) {
        case 'name': {
          return a.name.localeCompare(b.name);
        }
        case 'due': {
          return (
            dueSortKey(statusOf(a), today) - dueSortKey(statusOf(b), today)
          );
        }
        case 'lastPerformed': {
          // Most recently done first; never-done sinks last.
          const av = lastPerformedOf(a) ?? '';
          const bv = lastPerformedOf(b) ?? '';
          return bv.localeCompare(av);
        }
      }
    });

    return result;
  }, [
    tasks,
    oneTimeOnly,
    selectedTags,
    search,
    sort,
    statusOf,
    lastPerformedOf,
    today,
  ]);

  return (
    <div className="flex flex-col gap-4">
      {/* Sticky toolbar: search + sort + one-time toggle, always in reach. */}
      <div className="sticky top-[3.25rem] z-10 -mx-4 flex flex-col gap-3 border-b border-hairline bg-surface/95 px-4 pt-3 pb-3 backdrop-blur lg:top-[3.5rem] lg:-mx-6 lg:px-6 dark:bg-surface-dark/95">
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => {
              onSearch(e.target.value);
            }}
            placeholder="Search tasks…"
            className="flex-1"
            aria-label="Search tasks"
          />
          <FilterToggle
            label="One-time"
            pressed={oneTimeOnly}
            onToggle={onToggleOneTime}
          />
          {allTags.map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              selected={selectedTags.includes(tag)}
              onClick={() => {
                onToggleTag(tag);
              }}
            />
          ))}
          <button
            type="button"
            onClick={onAdd}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <SortGroup options={SORT_OPTIONS} value={sort} onChange={onSort} />
          <span className="text-xs text-brand-muted">{rows.length} shown</span>
        </div>
      </div>

      {isLoading ? (
        <p className="text-brand-muted">Loading maintenance tasks…</p>
      ) : undefined}
      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn’t load maintenance tasks. Please try again.
        </p>
      ) : undefined}
      {!isLoading && tasks?.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          No maintenance tasks yet — add the first upkeep you want an answer to
          {'“'}when did I last do this?{'”'} for.
        </p>
      ) : undefined}

      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y divide-hairline">
          {rows.map((task) => (
            <li key={task.id}>
              <TaskListRow
                task={task}
                status={statusOf(task)}
                onOpen={() => {
                  onOpenTask(task.id);
                }}
              />
            </li>
          ))}
        </ul>
      ) : undefined}

      {rows.length === 0 && (tasks?.length ?? 0) > 0 ? (
        <ListEmpty message="No tasks match." />
      ) : undefined}

      {orphanedEntries.length > 0 ? (
        <OrphanedHistory entries={orphanedEntries} />
      ) : undefined}
    </div>
  );
}

// ── Due-sort key ──────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

/** Calendar days from one IsoDate to another (positive if `to` is later). */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * A numeric sort key for "most urgent first" ordering — overdue tasks sort
 * earliest (negative key), then due (0), then ok (positive, nearer due is
 * smaller), with one-time at the very top and untracked/never-done at the
 * bottom. Calendar standings use days-to-due; distance standings use km-to-due.
 */
function dueSortKey(status: DueStatus, today: string): number {
  switch (status.kind) {
    case 'one-time': {
      return -1_000_000;
    }
    case 'overdue': {
      return status.basis === 'calendar'
        ? -daysBetween(status.dueOn, today)
        : -(status.currentKm - status.dueAtKm);
    }
    case 'due': {
      return 0;
    }
    case 'ok': {
      return status.basis === 'calendar'
        ? daysBetween(today, status.dueOn)
        : status.dueAtKm - status.currentKm;
    }
    case 'never-performed': {
      return 999_997;
    }
    case 'reading-needed': {
      return 999_998;
    }
    case 'untracked': {
      return 999_999;
    }
  }
}

// ── Shared formatting ─────────────────────────────────────────────────────

/** A whole kilometre count with thousands separators, e.g. "40,000 km". */
function formatKm(km: number): string {
  return `${km.toLocaleString('en-US')} km`;
}

/** Integer cents → display dollars, e.g. 11240 → "$112.40". */
function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * How the task is tracked, as a short label: "Every 12 months" / "Every month"
 * for a calendar limit, "Every 20,000 km" for a distance limit (issue #32),
 * "Every 12 months or 20,000 km" when it carries both (ADR-0016 — due on
 * whichever comes first), "One-time" for a one-time task (issue #29), or undefined
 * for an untracked one (the caller supplies its own "Not tracked" wording).
 */
function intervalLabel(task: MaintenanceTask): string | undefined {
  if (task.oneTime) {
    return 'One-time';
  }
  if (!task.interval) {
    return undefined;
  }
  const parts: string[] = [];
  if (task.interval.months !== undefined) {
    parts.push(
      task.interval.months === 1
        ? 'month'
        : `${String(task.interval.months)} months`,
    );
  }
  if (task.interval.km !== undefined) {
    parts.push(formatKm(task.interval.km));
  }
  return `Every ${parts.join(' or ')}`;
}

// ── Due badge ─────────────────────────────────────────────────────────────

const NEUTRAL_TONE = 'bg-hairline text-brand-muted';
const ATTENTION_TONE =
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
const OVERDUE_TONE =
  'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';

function badgeOf(status: DueStatus): readonly [string, string] | undefined {
  switch (status.kind) {
    case 'untracked': {
      return undefined;
    }
    case 'never-performed': {
      return ['Never performed', NEUTRAL_TONE];
    }
    case 'one-time': {
      return ['To do', ATTENTION_TONE];
    }
    case 'reading-needed': {
      return ['Set the rig’s distance to track this', ATTENTION_TONE];
    }
    case 'ok': {
      return status.basis === 'distance'
        ? [
            `Due at ${formatKm(status.dueAtKm)} — you’re at ${formatKm(status.currentKm)}`,
            NEUTRAL_TONE,
          ]
        : [`Due ${formatIsoDate(status.dueOn)}`, NEUTRAL_TONE];
    }
    case 'due': {
      return status.basis === 'distance'
        ? [`Due now — at ${formatKm(status.dueAtKm)}`, ATTENTION_TONE]
        : ['Due today', ATTENTION_TONE];
    }
    case 'overdue': {
      return status.basis === 'distance'
        ? [
            `Overdue — due at ${formatKm(status.dueAtKm)}, you’re at ${formatKm(status.currentKm)}`,
            OVERDUE_TONE,
          ]
        : [`Overdue — ${formatIsoDate(status.dueOn)}`, OVERDUE_TONE];
    }
  }
}

function DueBadge({
  status,
}: {
  readonly status: DueStatus;
}): JSX.Element | undefined {
  const badge = badgeOf(status);
  if (badge === undefined) {
    return undefined;
  }
  const [text, tone] = badge;
  return (
    <span
      className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {text}
    </span>
  );
}

// ── Task list row ─────────────────────────────────────────────────────────

/** One task in the list — full-width, single column (no sidebar). */
function TaskListRow({
  task,
  status,
  onOpen,
}: {
  readonly task: MaintenanceTask;
  readonly status: DueStatus;
  readonly onOpen: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 py-3 text-left hover:bg-hairline/30"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium text-brand dark:text-ink-inverted">
          {task.name}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <DueBadge status={status} />
          {badgeOf(status) === undefined ? (
            <span className="text-xs text-brand-muted">Not tracked</span>
          ) : undefined}
          {task.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-brand-muted">
        ›
      </span>
    </button>
  );
}

// ── Task detail ───────────────────────────────────────────────────────────

/**
 * The full-page detail: everything about a task — standing, description,
 * recorded fields with last values, full log history, and where it appears on
 * checklists — visible without an Edit click.
 */
function TaskDetail({
  task,
  status,
  appearances,
  onOpenChecklist,
  onEdit,
  onDelete,
}: {
  readonly task: MaintenanceTask;
  readonly status: DueStatus;
  readonly appearances: readonly TaskAppearance[];
  readonly onOpenChecklist: (id: Id) => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}): JSX.Element {
  // Entries for the field snapshot — cached with LogHistory's query, no extra
  // fetch (RTK Query shares the cache).
  const { data: entries } = useListLogEntriesQuery(task.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-semibold tracking-tight text-brand dark:text-ink-inverted">
          {task.name}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-brand-muted">
          <span>{intervalLabel(task) ?? 'Not tracked for due-status'}</span>
          {'lastPerformedOn' in status ? (
            <span>
              · Last performed {formatIsoDate(status.lastPerformedOn)}
            </span>
          ) : undefined}
          <DueBadge status={status} />
        </div>
        {task.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {task.tags.map((tag) => (
              <TagChip key={tag} tag={tag} />
            ))}
          </div>
        ) : undefined}
      </div>

      {task.description ? (
        <p className="text-sm whitespace-pre-line text-brand-muted">
          {task.description}
        </p>
      ) : undefined}

      <div className="flex gap-4 text-sm">
        <button
          type="button"
          onClick={onEdit}
          className="font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="font-medium text-red-600 hover:opacity-80 dark:text-red-400"
        >
          Delete
        </button>
      </div>

      <FieldsSummary task={task} entries={entries} />

      <AppearsOn appearances={appearances} onOpenChecklist={onOpenChecklist} />

      <LogHistory task={task} />
    </div>
  );
}

// ── Fields summary (the "Records" cards) ──────────────────────────────────

/**
 * The task’s field schema as readable cards, each showing the latest recorded
 * value from the newest log entry. A task with no fields renders nothing.
 */
function FieldsSummary({
  task,
  entries,
}: {
  readonly task: MaintenanceTask;
  readonly entries: readonly LogEntry[] | undefined;
}): JSX.Element | undefined {
  if (task.fieldSchema.length === 0) {
    return undefined;
  }

  // The newest entry (by performedOn) carries the last values for each field.
  const newest = entries?.toSorted((a, b) =>
    b.performedOn.localeCompare(a.performedOn),
  )[0];
  const valueMap = new Map(
    (newest?.fields ?? [])
      .filter((f) => f.value !== undefined)
      .map((f) => [f.name, f]),
  );

  return (
    <section className="flex flex-col gap-2" aria-label="Fields">
      <h3 className="text-xs font-semibold tracking-wide text-brand-muted uppercase">
        Fields
      </h3>
      <dl className="grid grid-cols-2 gap-2">
        {task.fieldSchema.map((field) => {
          const logged = valueMap.get(field.name);
          const value = logged?.value;
          const display =
            value === undefined
              ? '—'
              : field.type === 'boolean'
                ? value === true
                  ? 'Yes'
                  : 'No'
                : String(value);
          return (
            <div
              key={field.name}
              className="rounded-lg border border-hairline p-2.5"
            >
              <dt className="text-xs text-brand-muted">{field.name}</dt>
              <dd className="text-sm font-medium text-brand dark:text-ink-inverted">
                {display}
                {value !== undefined && field.unit ? ` ${field.unit}` : ''}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

// ── Appears on ────────────────────────────────────────────────────────────

function AppearsOn({
  appearances,
  onOpenChecklist,
}: {
  readonly appearances: readonly TaskAppearance[];
  readonly onOpenChecklist: (id: Id) => void;
}): JSX.Element | undefined {
  if (appearances.length === 0) {
    return undefined;
  }
  return (
    <section className="flex flex-col gap-3" aria-label="Appears on">
      <h3 className="text-sm font-semibold tracking-wide text-brand-muted uppercase">
        Appears on
      </h3>
      <ul className="flex flex-col gap-2">
        {appearances.map(({ checklist, steps }) => (
          <li key={checklist.id}>
            <button
              type="button"
              onClick={() => {
                onOpenChecklist(checklist.id);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-hairline p-3 text-left hover:border-brand"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium text-brand dark:text-ink-inverted">
                  {checklist.name}
                </span>
                {steps.map((step) => (
                  <span key={step.id} className="text-sm text-brand-muted">
                    {step.text}
                  </span>
                ))}
              </span>
              <span aria-hidden className="shrink-0 text-brand-muted">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Log history ───────────────────────────────────────────────────────────

/** The entry's field snapshot for performing the task now: definitions, no values. */
function snapshotOf(task: MaintenanceTask): LoggedField[] {
  return task.fieldSchema.map((field) => ({ ...field }));
}

/** "Tire Pressure: 32 psi · Sealed: Yes" — the filled-in values, one line. */
function valuesSummary(entry: LogEntry): string {
  return entry.fields
    .filter((field) => field.value !== undefined)
    .map((field) => {
      const value =
        field.type === 'boolean'
          ? field.value === true
            ? 'Yes'
            : 'No'
          : field.type === 'date'
            ? formatIsoDate(String(field.value))
            : String(field.value);
      return `${field.name}: ${value}${field.unit ? ` ${field.unit}` : ''}`;
    })
    .join(' · ');
}

function LogHistory({ task }: { readonly task: MaintenanceTask }): JSX.Element {
  const { data: entries, isLoading, isError } = useListLogEntriesQuery(task.id);
  const [createEntry, { isLoading: isLogging }] = useCreateLogEntryMutation();
  const [updateEntry, { isLoading: isCorrecting }] =
    useUpdateLogEntryMutation();
  const [deleteEntry] = useDeleteLogEntryMutation();

  const [logging, setLogging] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<Id | undefined>();

  const handleLog = async (
    performedOn: string,
    fields: LoggedField[],
    distanceKm: number | undefined,
    costCents: number | undefined,
  ): Promise<void> => {
    await createEntry({
      taskId: task.id,
      performedOn,
      fields,
      ...(distanceKm !== undefined && { distanceKm }),
      ...(costCents !== undefined && { costCents }),
    }).unwrap();
    setLogging(false);
  };

  const handleCorrect = async (
    id: Id,
    performedOn: string,
    fields: LoggedField[],
    distanceKm: number | undefined,
    costCents: number | undefined,
  ): Promise<void> => {
    await updateEntry({
      id,
      changes: {
        performedOn,
        fields,
        // eslint-disable-next-line unicorn/no-null
        distanceKm: distanceKm ?? null,
        // eslint-disable-next-line unicorn/no-null
        costCents: costCents ?? null,
      },
    }).unwrap();
    setEditingEntryId(undefined);
  };

  return (
    <section className="flex flex-col gap-3" aria-label={`Log of ${task.name}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-wide text-brand-muted uppercase">
          Log
        </h3>
        <button
          type="button"
          onClick={() => {
            setEditingEntryId(undefined);
            setLogging(true);
          }}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Add log entry
        </button>
      </div>

      {logging ? (
        <LogEntryForm
          initialFields={snapshotOf(task)}
          initialDate={todayIso()}
          submitLabel="Log it"
          pending={isLogging}
          onSubmit={(performedOn, fields, distanceKm, costCents) =>
            void handleLog(performedOn, fields, distanceKm, costCents)
          }
          onCancel={() => {
            setLogging(false);
          }}
        />
      ) : undefined}

      {isLoading ? <p className="text-brand-muted">Loading log…</p> : undefined}

      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn’t load the log. Please try again.
        </p>
      ) : undefined}

      {!isLoading && !logging && entries?.length === 0 ? (
        <p className="text-sm text-brand-muted">
          No log entries yet — add one when you next perform this task.
        </p>
      ) : undefined}

      <ul className="flex flex-col gap-2">
        {entries?.map((entry) => (
          <li key={entry.id}>
            {editingEntryId === entry.id ? (
              <LogEntryForm
                initialFields={entry.fields}
                initialDate={entry.performedOn}
                initialDistanceKm={entry.distanceKm}
                initialCostCents={entry.costCents}
                submitLabel="Save correction"
                pending={isCorrecting}
                onSubmit={(performedOn, fields, distanceKm, costCents) =>
                  void handleCorrect(
                    entry.id,
                    performedOn,
                    fields,
                    distanceKm,
                    costCents,
                  )
                }
                onCancel={() => {
                  setEditingEntryId(undefined);
                }}
              />
            ) : (
              <LogEntryRow
                entry={entry}
                onEdit={() => {
                  setLogging(false);
                  setEditingEntryId(entry.id);
                }}
                onDelete={() => void deleteEntry(entry.id).unwrap()}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Orphaned history ──────────────────────────────────────────────────────

function OrphanedHistory({
  entries,
}: {
  readonly entries: readonly LogEntry[];
}): JSX.Element {
  const [updateEntry, { isLoading: isCorrecting }] =
    useUpdateLogEntryMutation();
  const [deleteEntry] = useDeleteLogEntryMutation();
  const [editingEntryId, setEditingEntryId] = useState<Id | undefined>();

  const handleCorrect = async (
    id: Id,
    performedOn: string,
    fields: LoggedField[],
    distanceKm: number | undefined,
    costCents: number | undefined,
  ): Promise<void> => {
    await updateEntry({
      id,
      changes: {
        performedOn,
        fields,
        // eslint-disable-next-line unicorn/no-null
        distanceKm: distanceKm ?? null,
        // eslint-disable-next-line unicorn/no-null
        costCents: costCents ?? null,
      },
    }).unwrap();
    setEditingEntryId(undefined);
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Deleted tasks">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold tracking-wide text-brand-muted uppercase">
          Deleted tasks
        </h2>
        <p className="text-sm text-brand-muted">
          History kept from tasks you’ve deleted — each labeled by the task’s
          name at the time.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            {editingEntryId === entry.id ? (
              <LogEntryForm
                initialFields={entry.fields}
                initialDate={entry.performedOn}
                initialDistanceKm={entry.distanceKm}
                initialCostCents={entry.costCents}
                submitLabel="Save correction"
                pending={isCorrecting}
                onSubmit={(performedOn, fields, distanceKm, costCents) =>
                  void handleCorrect(
                    entry.id,
                    performedOn,
                    fields,
                    distanceKm,
                    costCents,
                  )
                }
                onCancel={() => {
                  setEditingEntryId(undefined);
                }}
              />
            ) : (
              <LogEntryRow
                entry={entry}
                onEdit={() => {
                  setEditingEntryId(entry.id);
                }}
                onDelete={() => void deleteEntry(entry.id).unwrap()}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LogEntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  readonly entry: LogEntry;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}): JSX.Element {
  const summary = valuesSummary(entry);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium text-brand dark:text-ink-inverted">
          {formatIsoDate(entry.performedOn)}
        </span>
        <span className="text-sm font-medium text-brand-muted">
          {entry.taskName}
        </span>
        {entry.distanceKm === undefined ? undefined : (
          <span className="text-sm text-brand-muted">
            {formatKm(entry.distanceKm)}
          </span>
        )}
        {entry.costCents === undefined ? undefined : (
          <span className="text-sm text-brand-muted">
            {formatCost(entry.costCents)}
          </span>
        )}
        {summary ? (
          <span className="text-sm text-brand-muted">{summary}</span>
        ) : undefined}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-sm">
        <button
          type="button"
          onClick={onEdit}
          className="font-medium text-brand hover:opacity-80 dark:text-ink-inverted"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="font-medium text-red-600 hover:opacity-80 dark:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
