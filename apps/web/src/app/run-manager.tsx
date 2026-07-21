'use client';

import {
  runProgress,
  type Checklist,
  type Id,
  type Run,
} from '@rv-checklist/domain';
import {
  useCreateRunMutation,
  useDeleteRunMutation,
  useListRunsQuery,
} from '@rv-checklist/web-data-access';
import { useState, type JSX } from 'react';
import { RunScreen } from './run-screen';

/**
 * The runs surface for one checklist (issue #16). Starting a run copies the
 * checklist's steps on the server and drops straight into the run screen. Past
 * runs are listed newest-effort-first with their progress, so an in-progress one
 * (still has incomplete steps) is easy to spot and resume, and a run started by
 * mistake can be deleted. Editing a checklist never changes these runs — each
 * holds its own copy of the steps.
 */
export function RunManager({
  checklist,
  onClose,
}: {
  readonly checklist: Checklist;
  readonly onClose: () => void;
}): JSX.Element {
  const { data: runs, isLoading, isError } = useListRunsQuery(checklist.id);
  const [createRun, { isLoading: isStarting }] = useCreateRunMutation();
  const [deleteRun] = useDeleteRunMutation();
  const [openRunId, setOpenRunId] = useState<Id | undefined>(undefined);

  // An open run takes over the whole surface, so resolve that before the list.
  if (openRunId) {
    return (
      <div className="rounded-xl border border-hairline p-4">
        <RunScreen
          runId={openRunId}
          onExit={() => {
            setOpenRunId(undefined);
          }}
        />
      </div>
    );
  }

  const handleStart = async (): Promise<void> => {
    const run = await createRun({ checklistId: checklist.id }).unwrap();
    setOpenRunId(run.id);
  };

  const handleDelete = async (id: Id): Promise<void> => {
    await deleteRun(id).unwrap();
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-hairline p-4"
      aria-label={`Runs of ${checklist.name}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-brand dark:text-ink-inverted">
          {checklist.name} — runs
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
        >
          Close
        </button>
      </div>

      <button
        type="button"
        onClick={() => void handleStart()}
        disabled={isStarting}
        className="self-start rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isStarting ? 'Starting…' : 'Start a run'}
      </button>

      {isLoading ? (
        <p className="text-brand-muted">Loading runs…</p>
      ) : undefined}

      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn’t load runs. Please try again.
        </p>
      ) : undefined}

      {!isLoading && runs?.length === 0 ? (
        <p className="text-sm text-brand-muted">
          No runs yet — start one when you next work through this checklist.
        </p>
      ) : undefined}

      <ul className="flex flex-col gap-2">
        {runs?.map((run) => (
          <li key={run.id}>
            <RunRow
              run={run}
              onOpen={() => {
                setOpenRunId(run.id);
              }}
              onDelete={() => void handleDelete(run.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RunRow({
  run,
  onOpen,
  onDelete,
}: {
  readonly run: Run;
  readonly onOpen: () => void;
  readonly onDelete: () => void;
}): JSX.Element {
  const progress = runProgress(run);
  const dateLabel = new Date(`${run.startedOn}T00:00:00`).toLocaleDateString(
    undefined,
    { dateStyle: 'medium' },
  );

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-hairline p-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-brand dark:text-ink-inverted">
          {dateLabel}
        </span>
        <span className="text-sm text-brand-muted">
          {progress.inProgress
            ? `In progress — ${String(progress.completed + progress.skipped)}/${String(progress.total)} done`
            : `Done — ${String(progress.completed)} completed, ${String(progress.skipped)} skipped`}
        </span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={onOpen}
          className="font-medium text-brand hover:opacity-80 dark:text-ink-inverted"
        >
          {progress.inProgress ? 'Resume' : 'View'}
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
