'use client';

import {
  runProgress,
  type Checklist,
  type Id,
  type Run,
} from '@rv-checklist/domain';
import {
  useCreateChecklistMutation,
  useListChecklistsQuery,
  useListRunsByRigQuery,
  useListTasksQuery,
} from '@rv-checklist/web-data-access';
import {
  BackLink,
  Input,
  ListEmpty,
  SortGroup,
  TagChip,
  type SortOption,
} from '@rv-checklist/web-ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type JSX } from 'react';
import { ChecklistForm, type ChecklistFormValues } from './checklist-form';

type ChecklistSortKey = 'name' | 'lastRun';

const SORT_OPTIONS: readonly SortOption<ChecklistSortKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'lastRun', label: 'Last run' },
];

export function ChecklistsScreen({
  rigId,
}: {
  readonly rigId: Id;
}): JSX.Element {
  const router = useRouter();
  const {
    data: checklists,
    isLoading,
    isError,
  } = useListChecklistsQuery(rigId);
  const { data: rigRuns } = useListRunsByRigQuery(rigId);
  const { data: rigTasks } = useListTasksQuery(rigId);
  const [createChecklist, { isLoading: isCreating }] =
    useCreateChecklistMutation();

  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ChecklistSortKey>('name');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

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

  const handleCreate = async (values: ChecklistFormValues): Promise<void> => {
    const created = await createChecklist({
      rigId,
      ...values,
    }).unwrap();
    setAdding(false);
    router.push(`/rig/${rigId}/checklists/${created.id}`);
  };

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

  const toggleTag = (tag: string): void => {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    );
  };

  const lastRunDate = (checklistId: Id): string | undefined => {
    const runs = (rigRuns ?? []).filter(
      (run) => run.checklistId === checklistId,
    );
    if (runs.length === 0) return undefined;
    const sorted = runs.toSorted((a, b) =>
      b.startedOn.localeCompare(a.startedOn),
    );
    return sorted[0]?.startedOn;
  };

  return (
    <ChecklistList
      rigId={rigId}
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
      onAdd={() => {
        setAdding(true);
      }}
    />
  );
}

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
  rigId,
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
  onAdd,
}: {
  readonly rigId: Id;
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
  readonly onAdd: () => void;
}): JSX.Element {
  const rows = useMemo(() => {
    let result = [...(checklists ?? [])];

    if (selectedTags.length > 0) {
      result = result.filter((c) =>
        selectedTags.every((tag) => c.tags.includes(tag)),
      );
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((c) => {
        const hay = `${c.name} ${c.tags.join(' ')}`.toLowerCase();
        return hay.includes(q);
      });
    }

    result.sort((a, b) => {
      switch (sort) {
        case 'name': {
          return a.name.localeCompare(b.name);
        }
        case 'lastRun': {
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
          <button
            type="button"
            onClick={onAdd}
            className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add
          </button>
        </div>
        {allTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
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
          </div>
        ) : undefined}
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
                rigId={rigId}
                checklist={checklist}
                inProgressRun={inProgressRun(checklist.id)}
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

function ChecklistListRow({
  rigId,
  checklist,
  inProgressRun,
}: {
  readonly rigId: Id;
  readonly checklist: Checklist;
  readonly inProgressRun: Run | undefined;
}): JSX.Element {
  const stepCount = checklist.steps.length;
  const progress = inProgressRun ? runProgress(inProgressRun) : undefined;
  return (
    <Link
      href={`/rig/${rigId}/checklists/${checklist.id}`}
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
    </Link>
  );
}
