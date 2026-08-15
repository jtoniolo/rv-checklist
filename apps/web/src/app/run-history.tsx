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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';
import { formatIsoDate } from './dates';

/**
 * One checklist's runs, inside the detail pane (issue #16, reshaped for the
 * #22 shell). Starting a run copies the checklist's steps on the server —
 * copy-on-start, never local state — and navigates to the new run's URL.
 * Past runs are listed newest first with their progress, so an in-progress one
 * is easy to spot and resume, and a run started by mistake can be deleted.
 */
export function RunHistory({
  checklist,
  rigId,
}: {
  readonly checklist: Checklist;
  readonly rigId: Id;
}): JSX.Element {
  const router = useRouter();
  const { data: runs, isLoading, isError } = useListRunsQuery(checklist.id);
  const [createRun, { isLoading: isStarting }] = useCreateRunMutation();
  const [deleteRun] = useDeleteRunMutation();

  const handleStart = async (): Promise<void> => {
    const run = await createRun({ checklistId: checklist.id }).unwrap();
    router.push(`/rig/${rigId}/runs/${run.id}`);
  };

  return (
    <section
      className="flex flex-col gap-3"
      aria-label={`Runs of ${checklist.name}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-wide text-brand-muted uppercase">
          Runs
        </h3>
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={isStarting}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isStarting ? 'Starting…' : 'Start a run'}
        </button>
      </div>

      {isLoading ? (
        <p className="text-brand-muted">Loading runs…</p>
      ) : undefined}

      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load runs. Please try again.
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
              rigId={rigId}
              onDelete={() => void deleteRun(run.id).unwrap()}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RunRow({
  run,
  rigId,
  onDelete,
}: {
  readonly run: Run;
  readonly rigId: Id;
  readonly onDelete: () => void;
}): JSX.Element {
  const progress = runProgress(run);
  const dateLabel = formatIsoDate(run.startedOn);

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
        <Link
          href={`/rig/${rigId}/runs/${run.id}`}
          className="font-medium text-brand hover:opacity-80 dark:text-ink-inverted"
        >
          {progress.inProgress ? 'Resume' : 'View'}
        </Link>
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
