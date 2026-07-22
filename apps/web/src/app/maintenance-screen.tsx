'use client';

import {
  dueStatus,
  latestPerformedOn,
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
import { useState, type JSX } from 'react';
import { formatIsoDate, todayIso } from './dates';
import { LogEntryForm } from './log-entry-form';
import { TaskForm, type TaskFormValues } from './task-form';

/**
 * The maintenance surface (issue #17): master–detail in one responsive
 * component, the same shape as the checklists screen. On mobile the task list
 * drills down into a detail screen with a back link; from `lg` up the list is
 * a sidebar and the detail pane always shows something.
 *
 * Each task row wears its due/overdue standing, computed on read (ADR-0005)
 * by the shared `dueStatus` domain function from the rig's log entries — one
 * request for the whole list, no persisted due-date, nothing scheduled. The
 * detail pane answers "when did I last do this, and what did I measure?": the
 * task's full log history, an add-log-entry form for performing it standalone
 * (story 45), and editing/deleting of past entries (nothing is locked).
 */
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
  const statusOf = (task: MaintenanceTask): DueStatus =>
    dueStatus(
      task.interval,
      latestPerformedOn(
        (rigEntries ?? []).filter((entry) => entry.taskId === task.id),
      ),
      today,
    );

  // Mobile drills down (detail only when explicitly opened); desktop's detail
  // pane always shows something.
  const mobileDetail = tasks?.find((task) => task.id === openTaskId);
  const desktopSelected = mobileDetail ?? tasks?.[0];
  const isDetailOpenOnMobile = adding || mobileDetail !== undefined;

  const handleCreate = async (values: TaskFormValues): Promise<void> => {
    const created = await createTask({
      rigId: activeRig.id,
      name: values.name,
      ...(values.description !== undefined && {
        description: values.description,
      }),
      ...(values.intervalMonths !== undefined && {
        interval: { months: values.intervalMonths },
      }),
      fieldSchema: values.fieldSchema,
    }).unwrap();
    setAdding(false);
    onOpenTask(created.id);
  };

  const handleUpdate = async (
    id: Id,
    values: TaskFormValues,
  ): Promise<void> => {
    await updateTask({
      id,
      changes: {
        name: values.name,
        // An emptied optional field is an explicit removal: a blank
        // description clears it, a blank interval stops due-status tracking.
        // The wire spells removal `null` (the schema's marker); an omitted
        // key would mean "leave it unchanged".
        // eslint-disable-next-line unicorn/no-null
        description: values.description ?? null,
        interval:
          values.intervalMonths === undefined
            ? // eslint-disable-next-line unicorn/no-null
              null
            : { months: values.intervalMonths },
        fieldSchema: values.fieldSchema,
      },
    }).unwrap();
    setEditing(false);
  };

  const handleDelete = async (id: Id): Promise<void> => {
    await deleteTask(id).unwrap();
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
            Maintenance
          </h1>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setAdding(true);
            }}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add
          </button>
        </div>

        {isLoading ? (
          <p className="text-brand-muted">Loading maintenance tasks…</p>
        ) : undefined}
        {isError ? (
          <p className="text-red-600 dark:text-red-400" role="alert">
            Couldn’t load maintenance tasks. Please try again.
          </p>
        ) : undefined}
        {tasks?.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
            No maintenance tasks yet — add the first upkeep you want an answer
            to “when did I last do this?” for.
          </p>
        ) : undefined}

        {tasks?.map((task) => (
          <TaskListRow
            key={task.id}
            task={task}
            status={statusOf(task)}
            isSelected={task.id === desktopSelected?.id && !adding}
            onOpen={() => {
              setAdding(false);
              setEditing(false);
              onOpenTask(task.id);
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
              label="‹ All tasks"
              onClick={() => {
                setAdding(false);
                onBackToList();
              }}
            />
            <TaskForm
              submitLabel="Add task"
              pending={isCreating}
              onSubmit={(values) => void handleCreate(values)}
              onCancel={() => {
                setAdding(false);
              }}
            />
          </>
        ) : desktopSelected ? (
          <>
            <BackToListButton label="‹ All tasks" onClick={onBackToList} />
            {editing ? (
              <TaskForm
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
              <TaskDetail
                // Remount on a different task so transient form state resets.
                key={desktopSelected.id}
                task={desktopSelected}
                status={statusOf(desktopSelected)}
                appearances={taskAppearances(
                  checklists ?? [],
                  desktopSelected.id,
                )}
                onOpenChecklist={onOpenChecklist}
                onEdit={() => {
                  setEditing(true);
                }}
                onDelete={() => void handleDelete(desktopSelected.id)}
              />
            )}
          </>
        ) : (
          <p className="hidden text-brand-muted lg:block">
            Select a maintenance task, or add your first one.
          </p>
        )}
      </section>
    </div>
  );
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

/** "Every 12 months" / "Every month" — or undefined for an untracked task. */
function intervalLabel(task: MaintenanceTask): string | undefined {
  if (!task.interval) {
    return undefined;
  }
  return task.interval.months === 1
    ? 'Every month'
    : `Every ${String(task.interval.months)} months`;
}

/**
 * The due/overdue standing as a badge (ADR-0005 — shown passively, never
 * pushed). An untracked task wears no badge at all.
 */
function DueBadge({
  status,
}: {
  readonly status: DueStatus;
}): JSX.Element | undefined {
  if (status.kind === 'untracked') {
    return undefined;
  }
  const [text, tone] =
    status.kind === 'never-performed'
      ? ['Never done', 'bg-hairline text-brand-muted']
      : status.kind === 'ok'
        ? [`Due ${formatIsoDate(status.dueOn)}`, 'bg-hairline text-brand-muted']
        : status.kind === 'due'
          ? [
              'Due today',
              'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
            ]
          : [
              `Overdue — ${formatIsoDate(status.dueOn)}`,
              'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
            ];
  return (
    <span
      className={`self-start rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tone}`}
    >
      {text}
    </span>
  );
}

/** One task in the list: a roomy card on mobile, a dense row on desktop. */
function TaskListRow({
  task,
  status,
  isSelected,
  onOpen,
}: {
  readonly task: MaintenanceTask;
  readonly status: DueStatus;
  readonly isSelected: boolean;
  readonly onOpen: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={isSelected ? 'true' : undefined}
      className={`flex flex-col gap-1.5 rounded-xl border border-hairline p-4 text-left hover:border-brand lg:gap-1 lg:rounded-lg lg:border-0 lg:px-3 lg:py-2 lg:text-sm ${
        isSelected
          ? 'lg:bg-brand lg:font-semibold lg:text-white'
          : 'lg:text-brand lg:hover:bg-hairline/40 lg:dark:text-ink-inverted'
      }`}
    >
      <span className="flex items-center justify-between gap-2 font-semibold text-brand lg:font-[inherit] lg:text-inherit dark:text-ink-inverted">
        {task.name}
        <span aria-hidden className="text-brand-muted lg:hidden">
          ›
        </span>
      </span>
      <span
        className={`flex flex-wrap items-center gap-2 text-sm lg:text-xs ${
          isSelected ? 'text-brand-muted lg:text-white/80' : 'text-brand-muted'
        }`}
      >
        {intervalLabel(task) ?? 'Not tracked'}
        <DueBadge status={status} />
      </span>
    </button>
  );
}

/**
 * The task detail pane: its standing, its authoring actions, performing it
 * standalone, and its full log history.
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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-semibold tracking-tight text-brand lg:text-xl dark:text-ink-inverted">
          {task.name}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-brand-muted">
          <span>{intervalLabel(task) ?? 'Not tracked for due-status'}</span>
          {'lastPerformedOn' in status ? (
            <span>· Last done {formatIsoDate(status.lastPerformedOn)}</span>
          ) : undefined}
          <DueBadge status={status} />
        </div>
      </div>

      {/* The optional why/how (issue #25) — absent renders nothing at all. */}
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

      <AppearsOn appearances={appearances} onOpenChecklist={onOpenChecklist} />

      <LogHistory task={task} />
    </div>
  );
}

/**
 * Where else this task lives (issue #24): every checklist of the rig with a
 * step linked to it, each showing the step's own wording — which often differs
 * from the task's name — and clicking through to that checklist. A checklist
 * linking the task via several steps appears once, with all of them. A task no
 * checklist references shows nothing: the section only exists when it has
 * something to say (the app is pull-based, it never pads).
 */
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

/**
 * One task's log history plus the add-log-entry form (story 45 — standalone
 * perform). Each past entry stays editable and deletable; editing seeds the
 * form from the entry's own snapshot, never the task's current fields.
 */
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
  ): Promise<void> => {
    await createEntry({ taskId: task.id, performedOn, fields }).unwrap();
    setLogging(false);
  };

  const handleCorrect = async (
    id: Id,
    performedOn: string,
    fields: LoggedField[],
  ): Promise<void> => {
    await updateEntry({ id, changes: { performedOn, fields } }).unwrap();
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
          onSubmit={(performedOn, fields) =>
            void handleLog(performedOn, fields)
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
                submitLabel="Save correction"
                pending={isCorrecting}
                onSubmit={(performedOn, fields) =>
                  void handleCorrect(entry.id, performedOn, fields)
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
        {/* The task's name as it was when performed (issue #27) — the entry's
            own snapshot, so a later rename never relabels this record. */}
        <span className="text-sm font-medium text-brand-muted">
          {entry.taskName}
        </span>
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
