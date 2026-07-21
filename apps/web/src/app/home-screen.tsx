'use client';

import {
  runProgress,
  type Checklist,
  type Id,
  type Owner,
  type Rig,
  type Run,
} from '@rv-checklist/domain';
import {
  skipToken,
  useListChecklistsQuery,
  useListRunsByRigQuery,
} from '@rv-checklist/web-data-access';
import { fractionDone, ProgressBar } from '@rv-checklist/web-ui';
import type { JSX } from 'react';
import { formatStartedOn } from './run-dates';

/**
 * The summary homepage (issue #22). Everything on it clicks through — stat
 * tiles, continue cards, and checklist rows all navigate, no dead ends. The
 * "in progress" tile and continue cards read the whole rig's runs in one
 * request (`listRunsByRig`) and surface the ones with steps still to do, so
 * a half-finished pre-departure list is one tap from where it was left.
 */
export function HomeScreen({
  owner,
  rigs,
  activeRig,
  onOpenChecklist,
  onOpenRun,
  onGoChecklists,
  onGoRig,
}: {
  readonly owner: Owner | undefined;
  readonly rigs: readonly Rig[] | undefined;
  readonly activeRig: Rig | undefined;
  readonly onOpenChecklist: (id: Id) => void;
  readonly onOpenRun: (checklistId: Id, runId: Id) => void;
  readonly onGoChecklists: () => void;
  readonly onGoRig: () => void;
}): JSX.Element {
  const { data: checklists } = useListChecklistsQuery(
    activeRig?.id ?? skipToken,
  );
  const { data: runs } = useListRunsByRigQuery(activeRig?.id ?? skipToken);

  const inProgress = (runs ?? [])
    .map((run) => ({ run, progress: runProgress(run) }))
    .filter(({ progress }) => progress.inProgress)
    .toSorted((a, b) => b.run.startedOn.localeCompare(a.run.startedOn));
  const firstInProgress = inProgress[0];

  const firstName = owner?.name?.trim().split(/\s+/, 1)[0];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight text-brand lg:text-3xl dark:text-ink-inverted">
        {firstName ? `Hi ${firstName} 👋` : 'Welcome back 👋'}
      </h1>

      {/* Click-through stat tiles. */}
      <div className="grid grid-cols-3 gap-2 lg:gap-3">
        <StatTile
          value={String(rigs?.length ?? 0)}
          label={rigs?.length === 1 ? 'rig' : 'rigs'}
          onClick={onGoRig}
        />
        <StatTile
          value={String(checklists?.length ?? 0)}
          label="checklists"
          onClick={onGoChecklists}
        />
        <StatTile
          value={String(inProgress.length)}
          label="in progress"
          onClick={
            firstInProgress
              ? () => {
                  onOpenRun(
                    firstInProgress.run.checklistId,
                    firstInProgress.run.id,
                  );
                }
              : onGoChecklists
          }
        />
      </div>

      {rigs?.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          No rigs yet — add your first one to get started.
        </p>
      ) : undefined}

      {inProgress.length > 0 ? (
        <section
          className="flex flex-col gap-2"
          aria-label="Pick up where you left off"
        >
          <h2 className="text-sm font-semibold tracking-wide text-brand-muted uppercase">
            Pick up where you left off
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {inProgress.map(({ run, progress }) => (
              <ContinueCard
                key={run.id}
                run={run}
                progress={progress}
                checklistName={
                  checklists?.find((c) => c.id === run.checklistId)?.name
                }
                onOpen={() => {
                  onOpenRun(run.checklistId, run.id);
                }}
              />
            ))}
          </div>
        </section>
      ) : undefined}

      {activeRig && checklists && checklists.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="Checklists">
          <h2 className="text-sm font-semibold tracking-wide text-brand-muted uppercase">
            Checklists for {activeRig.nickname}
          </h2>
          <div className="overflow-hidden rounded-xl border border-hairline">
            {checklists.map((checklist, i) => (
              <ChecklistRow
                key={checklist.id}
                checklist={checklist}
                withDivider={i > 0}
                onOpen={() => {
                  onOpenChecklist(checklist.id);
                }}
              />
            ))}
          </div>
        </section>
      ) : undefined}

      {activeRig && checklists?.length === 0 ? (
        <button
          type="button"
          onClick={onGoChecklists}
          className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted transition-colors hover:border-brand"
        >
          No checklists yet for {activeRig.nickname} — add your first one.
        </button>
      ) : undefined}
    </div>
  );
}

function StatTile({
  value,
  label,
  onClick,
}: {
  readonly value: string;
  readonly label: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center rounded-xl border border-hairline p-3 transition-colors hover:border-brand lg:items-start lg:p-4"
    >
      <span className="text-2xl font-semibold text-brand dark:text-ink-inverted">
        {value}
      </span>
      <span className="text-xs text-brand-muted lg:text-sm">
        {label}{' '}
        <span
          aria-hidden
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          ›
        </span>
      </span>
    </button>
  );
}

function ContinueCard({
  run,
  progress,
  checklistName,
  onOpen,
}: {
  readonly run: Run;
  readonly progress: ReturnType<typeof runProgress>;
  readonly checklistName: string | undefined;
  readonly onOpen: () => void;
}): JSX.Element {
  const dateLabel = formatStartedOn(run.startedOn);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-2 rounded-xl border border-brand bg-brand/5 p-4 text-left transition-colors hover:bg-brand/10"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-brand dark:text-ink-inverted">
          {checklistName ?? dateLabel}
        </span>
        <span className="text-sm text-brand-muted">
          {progress.completed + progress.skipped}/{progress.total}
        </span>
      </div>
      {checklistName ? (
        <span className="text-xs text-brand-muted">Started {dateLabel}</span>
      ) : undefined}
      <ProgressBar value={fractionDone(progress)} />
    </button>
  );
}

function ChecklistRow({
  checklist,
  withDivider,
  onOpen,
}: {
  readonly checklist: Checklist;
  readonly withDivider: boolean;
  readonly onOpen: () => void;
}): JSX.Element {
  const stepCount = checklist.steps.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-hairline/30 lg:py-3 ${
        withDivider ? 'border-t border-hairline' : ''
      }`}
    >
      <span className="font-medium text-brand dark:text-ink-inverted">
        {checklist.name}
      </span>
      <span className="flex items-center gap-2 text-sm text-brand-muted">
        {checklist.tags.map((tag) => (
          <span
            key={tag}
            className="hidden rounded-full bg-hairline px-2 py-0.5 text-xs sm:inline"
          >
            {tag}
          </span>
        ))}
        {stepCount} {stepCount === 1 ? 'step' : 'steps'}{' '}
        <span aria-hidden>›</span>
      </span>
    </button>
  );
}
