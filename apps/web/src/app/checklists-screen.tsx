'use client';

import {
  runProgress,
  type Checklist,
  type Id,
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
  useUpdateChecklistMutation,
} from '@rv-checklist/web-data-access';
import { fractionDone, ProgressBar } from '@rv-checklist/web-ui';
import { useState, type JSX } from 'react';
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
 * The checklists surface (issue #22): master–detail in one responsive
 * component. On mobile the list drills down into a detail screen with a back
 * link; from `lg` up the list is a sidebar and the detail pane always shows
 * something. Authoring (add / edit / duplicate / delete, issue #15) and runs
 * (start / resume / history, issue #16) both live here, reachable from the
 * detail pane; an open run takes the pane over.
 */
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
  // The rig's runs (cached from home) put an in-progress bar on list rows.
  const { data: rigRuns } = useListRunsByRigQuery(activeRig?.id ?? skipToken);
  const [createChecklist, { isLoading: isCreating }] =
    useCreateChecklistMutation();
  const [updateChecklist, { isLoading: isUpdating }] =
    useUpdateChecklistMutation();
  const [deleteChecklist] = useDeleteChecklistMutation();

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

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

  // Mobile drills down (detail only when explicitly opened); desktop's detail
  // pane always shows something.
  const mobileDetail = checklists?.find((c) => c.id === openChecklistId);
  const desktopSelected = mobileDetail ?? checklists?.[0];
  const isDetailOpenOnMobile = adding || mobileDetail !== undefined;

  const handleCreate = async (values: ChecklistFormValues): Promise<void> => {
    const created = await createChecklist({
      rigId: activeRig.id,
      ...values,
    }).unwrap();
    setAdding(false);
    onOpenChecklist(created.id);
  };

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

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
      {/* List: hidden on mobile while a detail is open; sidebar on desktop. */}
      <aside
        className={`${isDetailOpenOnMobile ? 'hidden lg:flex' : 'flex'} shrink-0 flex-col gap-2 lg:w-64 lg:gap-1`}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-brand lg:text-lg dark:text-ink-inverted">
            Checklists
          </h1>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              onCloseRun();
              setAdding(true);
            }}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add
          </button>
        </div>

        {isLoading ? (
          <p className="text-brand-muted">Loading checklists…</p>
        ) : undefined}
        {isError ? (
          <p className="text-red-600 dark:text-red-400" role="alert">
            Couldn’t load checklists. Please try again.
          </p>
        ) : undefined}
        {checklists?.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
            No checklists yet — add your first one for this rig.
          </p>
        ) : undefined}

        {checklists?.map((checklist) => (
          <ChecklistListRow
            key={checklist.id}
            checklist={checklist}
            isSelected={checklist.id === desktopSelected?.id && !adding}
            inProgressRun={latestInProgressRun(rigRuns, checklist.id)}
            onOpen={() => {
              setAdding(false);
              setEditing(false);
              onOpenChecklist(checklist.id);
            }}
          />
        ))}
      </aside>

      {/* Detail: drill-down on mobile, always-on pane on desktop. */}
      <section
        className={`${isDetailOpenOnMobile ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col gap-4`}
      >
        {adding ? (
          <>
            <BackToListButton
              label="‹ All checklists"
              onClick={() => {
                setAdding(false);
                onBackToList();
              }}
            />
            <ChecklistForm
              submitLabel="Add checklist"
              pending={isCreating}
              onSubmit={(values) => void handleCreate(values)}
              onCancel={() => {
                setAdding(false);
              }}
            />
          </>
        ) : desktopSelected ? (
          <>
            <BackToListButton label="‹ All checklists" onClick={onBackToList} />
            {openRunId ? (
              <RunScreen
                runId={openRunId}
                title={desktopSelected.name}
                onExit={onCloseRun}
              />
            ) : editing ? (
              <ChecklistForm
                initial={desktopSelected}
                submitLabel="Save changes"
                pending={isUpdating}
                onSubmit={(values) =>
                  void handleUpdate(desktopSelected.id, values)
                }
                onCancel={() => {
                  setEditing(false);
                }}
              />
            ) : (
              <ChecklistDetail
                checklist={desktopSelected}
                onEdit={() => {
                  setEditing(true);
                }}
                onDuplicate={() => void handleDuplicate(desktopSelected)}
                onDelete={() => void handleDelete(desktopSelected.id)}
                onOpenRun={onOpenRun}
              />
            )}
          </>
        ) : (
          <p className="hidden text-brand-muted lg:block">
            Select a checklist, or add your first one.
          </p>
        )}
      </section>
    </div>
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

/** Mobile-only back link above the detail pane. */
function BackToListButton({
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
      className="self-start text-sm font-medium text-brand-muted hover:text-brand lg:hidden dark:hover:text-ink-inverted"
    >
      {label}
    </button>
  );
}

/** One checklist in the list: a roomy card on mobile, a dense row on desktop. */
function ChecklistListRow({
  checklist,
  isSelected,
  inProgressRun,
  onOpen,
}: {
  readonly checklist: Checklist;
  readonly isSelected: boolean;
  readonly inProgressRun: Run | undefined;
  readonly onOpen: () => void;
}): JSX.Element {
  const stepCount = checklist.steps.length;
  const progress = inProgressRun ? runProgress(inProgressRun) : undefined;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex flex-col gap-2 rounded-xl border border-hairline p-4 text-left hover:border-brand lg:flex-row lg:items-center lg:justify-between lg:rounded-lg lg:border-0 lg:px-3 lg:py-2 lg:text-sm ${
        isSelected
          ? 'lg:bg-brand lg:font-semibold lg:text-white'
          : 'lg:text-brand lg:hover:bg-hairline/40 lg:dark:text-ink-inverted'
      }`}
    >
      <span className="flex items-center justify-between font-semibold text-brand lg:font-[inherit] lg:text-inherit dark:text-ink-inverted">
        {checklist.name}
        <span aria-hidden className="text-brand-muted lg:hidden">
          ›
        </span>
      </span>
      <span
        className={`flex items-center gap-2 text-sm lg:text-xs ${
          isSelected ? 'text-brand-muted lg:text-white/80' : 'text-brand-muted'
        }`}
      >
        <span className="lg:hidden">
          {stepCount} {stepCount === 1 ? 'step' : 'steps'}
        </span>
        <span className="hidden lg:inline">
          {progress
            ? `${String(progress.completed + progress.skipped)}/${String(progress.total)}`
            : stepCount}
        </span>
        {checklist.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-hairline px-2 py-0.5 text-xs lg:hidden"
          >
            {tag}
          </span>
        ))}
      </span>
      {progress ? (
        <span className="lg:hidden">
          <ProgressBar value={fractionDone(progress)} />
        </span>
      ) : undefined}
    </button>
  );
}

/**
 * The checklist detail pane: what the template holds, its authoring actions,
 * and its runs. The steps here are the *template* — working through them
 * happens in a run (copy-on-start), never on the checklist itself.
 */
function ChecklistDetail({
  checklist,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenRun,
}: {
  readonly checklist: Checklist;
  readonly onEdit: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onOpenRun: (runId: Id) => void;
}): JSX.Element {
  const stepCount = checklist.steps.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight text-brand lg:text-xl dark:text-ink-inverted">
          {checklist.name}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-brand-muted">
          <span>
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
          {checklist.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-hairline px-2 py-0.5 text-xs"
            >
              {tag}
            </span>
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
