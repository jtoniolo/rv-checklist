'use client';

import {
  runProgress,
  type Checklist,
  type Id,
  type MaintenanceTask,
  type Rig,
  type Run,
  type Step,
  type StepInput,
} from '@rv-checklist/domain';
import {
  skipToken,
  useCreateChecklistMutation,
  useDeleteChecklistMutation,
  useListChecklistsQuery,
  useListRunsByRigQuery,
  useListTasksQuery,
  useUpdateChecklistMutation,
} from '@rv-checklist/web-data-access';
import {
  BackLink,
  Input,
  ListEmpty,
  SortGroup,
  TagChip,
  type SortOption,
} from '@rv-checklist/web-ui';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { ChecklistForm, type ChecklistFormValues } from './checklist-form';
import { RunHistory } from './run-history';
import { RunScreen } from './run-screen';

/**
 * A checklist's step as a create-body step: drop the server-assigned id so the
 * copy gets fresh step ids (story 21), while carrying any task link or field
 * schema across.
 */
function toStepInput(step: Step): StepInput {
  return {
    text: step.text,
    ...(step.taskId && { taskId: step.taskId }),
    ...(step.fieldSchema && { fieldSchema: step.fieldSchema }),
  };
}

/**
 * The checklists surface, redesigned (issue #42): a single-column, searchable
 * list with sort and tag-filter controls, matching the maintenance screen's
 * drill-in pattern (issue #38). Selecting a checklist opens a full-page
 * read-only detail — steps, authoring actions, run history — with a back
 * action to return to the list. No split pane, no sidebar.
 *
 * The layout components ({@link BackLink}, {@link SortGroup}, {@link ListEmpty},
 * {@link TagChip}) are shared primitives from `@rv-checklist/web-ui`, the same
 * ones the maintenance screen uses.
 */

type ChecklistSortKey = 'name' | 'lastRun';

const SORT_OPTIONS: readonly SortOption<ChecklistSortKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'lastRun', label: 'Last run' },
];

export function ChecklistsScreen({
  activeRig,
  openChecklistId,
  openRunId,
  onOpenChecklist,
  onOpenRun,
  onCloseRun,
  onBackToList,
  onGoRig,
}: {
  readonly activeRig: Rig | undefined;
  readonly openChecklistId: Id | undefined;
  readonly openRunId: Id | undefined;
  readonly onOpenChecklist: (id: Id) => void;
  readonly onOpenRun: (runId: Id) => void;
  readonly onCloseRun: () => void;
  readonly onBackToList: () => void;
  readonly onGoRig: () => void;
}): JSX.Element {
  const {
    data: checklists,
    isLoading,
    isError,
  } = useListChecklistsQuery(activeRig?.id ?? skipToken);
  // The rig's runs (cached from home) drive the in-progress badge on list rows
  // and the "Last run" sort.
  const { data: rigRuns } = useListRunsByRigQuery(activeRig?.id ?? skipToken);
  // The rig's maintenance tasks: link targets for steps (issue #18).
  const { data: rigTasks } = useListTasksQuery(activeRig?.id ?? skipToken);
  const [createChecklist, { isLoading: isCreating }] =
    useCreateChecklistMutation();
  const [updateChecklist, { isLoading: isUpdating }] =
    useUpdateChecklistMutation();
  const [deleteChecklist] = useDeleteChecklistMutation();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ChecklistSortKey>('name');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // All distinct tags across the rig's checklists — drives the tag filter.
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    const list = checklists ?? [];
    for (const checklist of list) {
      for (const tag of checklist.tags) {
        tagSet.add(tag);
      }
    }
    return [...tagSet].toSorted((a, b) => a.localeCompare(b));
  }, [checklists]);

  // Reset ephemeral UI state when the navigation target changes (e.g. browser
  // Back fires popstate, changing the open checklist/run under this component).
  useEffect(() => {
    setAdding(false);
    setEditing(false);
  }, [openChecklistId, openRunId]);

  if (!activeRig) {
    return (
      <button
        type="button"
        onClick={onGoRig}
        className="w-full rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted transition-colors hover:border-brand"
      >
        Checklists belong to a rig — add your first rig to get started.
      </button>
    );
  }

  const openChecklist = checklists?.find((c) => c.id === openChecklistId);

  // ── Run open: full-page run screen ──────────────────────────────────────
  if (openRunId && openChecklist) {
    return (
      <RunScreen
        runId={openRunId}
        title={openChecklist.name}
        onExit={onCloseRun}
      />
    );
  }

  const handleCreate = async (values: ChecklistFormValues): Promise<void> => {
    const created = await createChecklist({
      rigId: activeRig.id,
      ...values,
    }).unwrap();
    setAdding(false);
    onOpenChecklist(created.id);
  };

  // ── Adding a checklist: full-page form ──────────────────────────────────
  if (adding) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink
          label="&#8249; All checklists"
          onClick={() => {
            setAdding(false);
          }}
        />
        <ChecklistForm
          tasks={rigTasks ?? []}
          submitLabel="Add checklist"
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
    values: ChecklistFormValues,
  ): Promise<void> => {
    await updateChecklist({ id, changes: values }).unwrap();
    setEditing(false);
  };

  const handleDuplicate = async (checklist: Checklist): Promise<void> => {
    // Story 21 — duplicate falls out cheaply from create: re-create the
    // checklist with id-less steps so the copy is an independent template.
    const copy = await createChecklist({
      rigId: activeRig.id,
      name: `${checklist.name} (copy)`,
      tags: checklist.tags,
      steps: checklist.steps.map((step) => toStepInput(step)),
    }).unwrap();
    onOpenChecklist(copy.id);
  };

  const handleDelete = async (id: Id): Promise<void> => {
    await deleteChecklist(id).unwrap();
    onBackToList();
  };

  // ── Checklist detail open: full-page detail (or edit form) ──────────────
  if (openChecklist) {
    if (editing) {
      return (
        <div className="flex flex-col gap-4">
          <BackLink
            label="&#8249; All checklists"
            onClick={() => {
              setEditing(false);
              onBackToList();
            }}
          />
          <ChecklistForm
            initial={openChecklist}
            tasks={rigTasks ?? []}
            submitLabel="Save changes"
            pending={isUpdating}
            onSubmit={(values) => void handleUpdate(openChecklist.id, values)}
            onCancel={() => {
              setEditing(false);
            }}
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <BackLink label="&#8249; All checklists" onClick={onBackToList} />
        <ChecklistDetail
          checklist={openChecklist}
          tasks={rigTasks ?? []}
          onEdit={() => {
            setEditing(true);
          }}
          onDuplicate={() => void handleDuplicate(openChecklist)}
          onDelete={() => void handleDelete(openChecklist.id)}
          onOpenRun={onOpenRun}
        />
      </div>
    );
  }

  const toggleTag = (tag: string): void => {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  };

  /** The most recent run's startedOn for a checklist, or undefined if none. */
  const lastRunDate = (checklistId: Id): string | undefined => {
    const runs = (rigRuns ?? []).filter(
      (run) => run.checklistId === checklistId,
    );
    if (runs.length === 0) return undefined;
    return runs.toSorted((a, b) => b.startedOn.localeCompare(a.startedOn))[0]
      .startedOn;
  };

  // ── List view: search / sort / filter / checklist rows ──────────────────
  return (
    <ChecklistList
      checklists={checklists}
      isLoading={isLoading}
      isError={isError}
      search={search}
      onSearch={setSearch}
      sort={sort}
      onSort={setSort}
      allTags={allTags}
      selectedTags={selectedTags}
      onToggleTag={toggleTag}
      lastRunDate={lastRunDate}
      latestInProgressRun={(checklistId) =>
        latestInProgressRun(rigRuns, checklistId)
      }
      onOpenChecklist={(id) => {
        setEditing(false);
        onOpenChecklist(id);
      }}
      onAdd={() => {
        setEditing(false);
        setAdding(true);
      }}
    />
  );
}

/** The newest run of this checklist that still has steps to do, if any. */
function latestInProgressRun(
  rigRuns: readonly Run[] | undefined,
  checklistId: Id,
): Run | undefined {
  return (rigRuns ?? [])
    .filter((run) => run.checklistId === checklistId)
    .filter((run) => runProgress(run).inProgress)
    .toSorted((a, b) => b.startedOn.localeCompare(a.startedOn))[0];
}

// ── List (search / sort / filter / rows) ──────────────────────────────────

function ChecklistList({
  checklists,
  isLoading,
  isError,
  search,
  onSearch,
  sort,
  onSort,
  allTags,
  selectedTags,
  onToggleTag,
  lastRunDate,
  latestInProgressRun: inProgressRun,
  onOpenChecklist,
  onAdd,
}: {
  readonly checklists: readonly Checklist[] | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly search: string;
  readonly onSearch: (value: string) => void;
  readonly sort: ChecklistSortKey;
  readonly onSort: (key: ChecklistSortKey) => void;
  readonly allTags: readonly string[];
  readonly selectedTags: readonly string[];
  readonly onToggleTag: (tag: string) => void;
  readonly lastRunDate: (checklistId: Id) => string | undefined;
  readonly latestInProgressRun: (checklistId: Id) => Run | undefined;
  readonly onOpenChecklist: (id: Id) => void;
  readonly onAdd: () => void;
}): JSX.Element {
  const rows = useMemo(() => {
    let result = [...(checklists ?? [])];

    // Tag filter: AND — a checklist must carry every selected tag.
    if (selectedTags.length > 0) {
      result = result.filter((c) =>
        selectedTags.every((tag) => c.tags.includes(tag)),
      );
    }

    // Search by name and tags.
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((c) => {
        const hay = `${c.name} ${c.tags.join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }

    // Sort.
    result.sort((a, b) => {
      switch (sort) {
        case 'name': {
          return a.name.localeCompare(b.name);
        }
        case 'lastRun': {
          // Most recently run first; never-run sinks last.
          const av = lastRunDate(a.id) ?? '';
          const bv = lastRunDate(b.id) ?? '';
          return bv.localeCompare(av);
        }
      }
    });

    return result;
  }, [checklists, selectedTags, search, sort, lastRunDate]);

  return (
    <div className="flex flex-col gap-4">
      {/* Sticky toolbar: search + sort + tag filter, always in reach. */}
      <div className="sticky top-[3.25rem] z-10 -mx-4 flex flex-col gap-3 border-b border-hairline bg-surface/95 px-4 pt-3 pb-3 backdrop-blur lg:top-[3.5rem] lg:-mx-6 lg:px-6 dark:bg-surface-dark/95">
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => {
              onSearch(e.target.value);
            }}
            placeholder="Search checklists…"
            className="flex-1"
            aria-label="Search checklists"
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
        <p className="text-brand-muted">Loading checklists…</p>
      ) : undefined}
      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load checklists. Please try again.
        </p>
      ) : undefined}
      {!isLoading && checklists?.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          No checklists yet — add your first one for this rig.
        </p>
      ) : undefined}

      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y divide-hairline">
          {rows.map((checklist) => (
            <li key={checklist.id}>
              <ChecklistListRow
                checklist={checklist}
                inProgressRun={inProgressRun(checklist.id)}
                onOpen={() => {
                  onOpenChecklist(checklist.id);
                }}
              />
            </li>
          ))}
        </ul>
      ) : undefined}

      {rows.length === 0 && (checklists?.length ?? 0) > 0 ? (
        <ListEmpty message="No checklists match." />
      ) : undefined}
    </div>
  );
}

// ── Checklist list row ────────────────────────────────────────────────────

/** One checklist in the list — full-width, single column (no sidebar). */
function ChecklistListRow({
  checklist,
  inProgressRun,
  onOpen,
}: {
  readonly checklist: Checklist;
  readonly inProgressRun: Run | undefined;
  readonly onOpen: () => void;
}): JSX.Element {
  const stepCount = checklist.steps.length;
  const progress = inProgressRun ? runProgress(inProgressRun) : undefined;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 py-3 text-left hover:bg-hairline/30"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium text-brand dark:text-ink-inverted">
          {checklist.name}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-brand-muted">
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
          {progress ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              In progress —
              {` ${String(progress.completed + progress.skipped)}/${String(progress.total)}`}
            </span>
          ) : undefined}
          {checklist.tags.map((tag) => (
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

// ── Checklist detail ──────────────────────────────────────────────────────

/**
 * The checklist detail: what the template holds, its authoring actions,
 * and its runs. The steps here are the *template* — working through them
 * happens in a run (copy-on-start), never on the checklist itself.
 */
function ChecklistDetail({
  checklist,
  tasks,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenRun,
}: {
  readonly checklist: Checklist;
  readonly tasks: readonly MaintenanceTask[];
  readonly onEdit: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onOpenRun: (runId: Id) => void;
}): JSX.Element {
  const stepCount = checklist.steps.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight text-brand dark:text-ink-inverted">
          {checklist.name}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-brand-muted">
          <span>
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
          {checklist.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </div>
      </div>

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
          onClick={onDuplicate}
          className="font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="font-medium text-red-600 hover:opacity-80 dark:text-red-400"
        >
          Delete
        </button>
      </div>

      {stepCount > 0 ? (
        <ol className="overflow-hidden rounded-xl border border-hairline">
          {checklist.steps.map((step, i) => (
            <li
              key={step.id}
              className={`px-4 py-2.5 text-sm text-brand dark:text-ink-inverted ${
                i > 0 ? 'border-t border-hairline' : ''
              }`}
            >
              {step.text}
              {/* A task-linked step — completing it in a run logs
                  maintenance for the named task (issue #18). */}
              {step.taskId ? (
                <span className="ml-2 text-xs text-brand-muted">
                  &#9881;{' '}
                  {tasks.find((t) => t.id === step.taskId)?.name ??
                    'logs maintenance'}
                </span>
              ) : undefined}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          No steps yet — edit the checklist to add some.
        </p>
      )}

      <RunHistory checklist={checklist} onOpenRun={onOpenRun} />
    </div>
  );
}
