'use client';

import {
  runProgress,
  validateFieldValues,
  type FieldDefinition,
  type FieldValue,
  type Id,
  type MaintenanceTask,
  type Run,
  type RunStep,
  type StepState,
} from '@rv-checklist/domain';
import {
  useGetRunQuery,
  useListTasksQuery,
  useUpdateRunMutation,
} from '@rv-checklist/web-data-access';
import { fractionDone, ProgressBar } from '@rv-checklist/web-ui';
import { useState, type JSX } from 'react';
import { formatIsoDate } from './dates';

/**
 * The run screen (issue #16, reshaped by #22 into an actual checklist). Works
 * through one run's steps: each row is a checkbox (incomplete ⇄ complete) with
 * a Skip/Undo beside it, so all three states stay reachable and freely
 * switchable (CONTEXT.md — step state is not a boolean). Skipped rows dim and
 * italicise; resolved rows tint; a progress bar and "n of m" counter sit on
 * top. The Skip control is always visible on touch and hover-revealed from
 * `lg` up. A plain step with custom fields shows its inputs; the values are
 * captured onto the run's own copy of that step.
 *
 * A task-linked step presents its *task's* fields instead (issue #18 — a
 * task-linked step defines none of its own, ADR-0008), captured onto the run
 * step the same way; completing it makes the server write a Log Entry for the
 * task, so completion is blocked client-side until every required task field
 * has a value — mirroring the server's rule rather than surfacing its 400.
 * Skipping needs no values: it records nothing.
 *
 * Every change is persisted straight away (via {@link useUpdateRunMutation}) so
 * the owner can put the phone down and resume later — the whole `steps` array
 * travels on each save, the same write that covers state, answers, and
 * corrections. Local state mirrors the run so the UI stays responsive; state
 * taps and boolean/date/select edits save immediately, while free-text and
 * number fields save on blur to avoid a request per keystroke. The run is loaded
 * fresh on open so resuming always shows the server's truth.
 */
export function RunScreen({
  runId,
  title,
  exitLabel = '← Back to checklist',
  onExit,
}: {
  readonly runId: Id;
  /** The checklist's name — the run itself holds only ids. */
  readonly title: string;
  readonly exitLabel?: string;
  readonly onExit: () => void;
}): JSX.Element {
  const query = useGetRunQuery(runId);

  if (query.isLoading) {
    return <p className="text-brand-muted">Loading run…</p>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn’t load this run. Please try again.
        </p>
        <BackButton label={exitLabel} onExit={onExit} />
      </div>
    );
  }
  // Remount on a different run so local step state is reseeded from the load.
  return (
    <RunWorkspace
      key={query.data.id}
      run={query.data}
      title={title}
      exitLabel={exitLabel}
      onExit={onExit}
    />
  );
}

function BackButton({
  label,
  onExit,
}: {
  readonly label: string;
  readonly onExit: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onExit}
      className="self-start text-sm font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
    >
      {label}
    </button>
  );
}

/**
 * Display rank for the sink-resolved-to-bottom sort: still-to-do steps
 * (`incomplete`) rank above resolved ones (`complete` or `skipped`), which a
 * deliberate skip removes from the active list just as completing does.
 */
function stepRank(step: RunStep): number {
  return step.state === 'incomplete' ? 0 : 1;
}

function RunWorkspace({
  run,
  title,
  exitLabel,
  onExit,
}: {
  readonly run: Run;
  readonly title: string;
  readonly exitLabel: string;
  readonly onExit: () => void;
}): JSX.Element {
  // Seeded once from the fresh load; `RunScreen` keys this component on the run
  // id, so switching runs remounts and reseeds. During a session local state is
  // the source of truth — each edit is persisted, so a refetch never needs to
  // clobber an in-flight change back over it.
  const [steps, setSteps] = useState<RunStep[]>(run.steps);
  const [updateRun] = useUpdateRunMutation();
  // The rig's tasks: a task-linked step takes its fields from its task.
  const { data: rigTasks } = useListTasksQuery(run.rigId);
  const taskOf = (step: RunStep): MaintenanceTask | undefined =>
    step.taskId === undefined
      ? undefined
      : rigTasks?.find((t) => t.id === step.taskId);
  // Steps whose completion was blocked on missing required task fields.
  const [blocked, setBlocked] = useState<readonly Id[]>([]);

  const persist = (next: RunStep[]): void => {
    setSteps(next);
    void updateRun({ id: run.id, changes: { steps: next } });
  };

  const setStepState = (index: number, state: StepState): void => {
    const step = steps[index];
    if (!step) {
      return;
    }
    // Completing a task-linked step writes a Log Entry, so the task's required
    // fields must be filled first — the server would reject the save anyway.
    if (state === 'complete' && step.taskId !== undefined) {
      // Until the rig's tasks load there is nothing to validate against; a
      // no-op beats optimistically completing a save the server will 400.
      if (!rigTasks) {
        return;
      }
      const fields = taskOf(step)?.fieldSchema;
      if (fields && !validateFieldValues(fields, step.values ?? []).valid) {
        setBlocked((ids) => [...ids, step.id]);
        return;
      }
    }
    setBlocked((ids) => ids.filter((id) => id !== step.id));
    persist(steps.map((s, i) => (i === index ? { ...s, state } : s)));
  };

  const progress = runProgress({ steps });

  // Resolved steps (complete or skipped) sink to the bottom so what's still
  // to-do stays at the top — a display-only sort. The persisted `steps` keep
  // their canonical checklist order; each rendered row carries its original
  // index so a state/value edit still targets the right step. Sort is stable,
  // so order within each group is preserved.
  const displayOrder = steps
    .map((step, index) => ({ step, index }))
    .toSorted((a, b) => stepRank(a.step) - stepRank(b.step));

  return (
    <section className="flex flex-col gap-3" aria-label="Run">
      <div className="flex flex-col gap-2">
        <BackButton label={exitLabel} onExit={onExit} />
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-2xl font-semibold tracking-tight text-brand lg:text-xl dark:text-ink-inverted">
            {title}
          </h2>
          <span className="text-sm text-brand-muted" aria-live="polite">
            {progress.inProgress
              ? `${String(progress.completed + progress.skipped)} of ${String(progress.total)}`
              : 'All done ✓'}
          </span>
        </div>
        <p className="text-sm text-brand-muted">
          Started {formatIsoDate(run.startedOn)}
        </p>
        <ProgressBar value={fractionDone(progress)} />
      </div>

      {steps.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          This run has no steps.
        </p>
      ) : (
        <ol className="overflow-hidden rounded-xl border border-hairline">
          {displayOrder.map(({ step, index }, position) => {
            const task = taskOf(step);
            const fields =
              step.taskId === undefined
                ? (step.fieldSchema ?? [])
                : (task?.fieldSchema ?? []);
            return (
              <li
                key={step.id}
                className={`group flex flex-col gap-3 px-4 py-3 lg:py-2.5 ${
                  position > 0 ? 'border-t border-hairline' : ''
                } ${step.state === 'incomplete' ? '' : 'bg-hairline/20'}`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={step.text}
                    checked={step.state === 'complete'}
                    disabled={step.state === 'skipped'}
                    onChange={(event) => {
                      setStepState(
                        index,
                        event.target.checked ? 'complete' : 'incomplete',
                      );
                    }}
                    className="size-5 shrink-0 accent-brand lg:size-4"
                  />
                  <span
                    className={`flex-1 text-base lg:text-sm ${
                      step.state === 'complete'
                        ? 'text-brand-muted line-through'
                        : step.state === 'skipped'
                          ? 'text-brand-muted italic'
                          : 'text-brand dark:text-ink-inverted'
                    }`}
                  >
                    {step.text}
                    {step.state === 'skipped' ? ' — skipped' : ''}
                  </span>
                  {/* Skip: always visible on touch, hover-revealed on desktop. */}
                  <button
                    type="button"
                    onClick={() => {
                      setStepState(
                        index,
                        step.state === 'skipped' ? 'incomplete' : 'skipped',
                      );
                    }}
                    className="shrink-0 text-sm font-medium text-brand-muted hover:text-brand lg:text-xs lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 dark:hover:text-ink-inverted"
                  >
                    {step.state === 'skipped' ? 'Undo' : 'Skip'}
                  </button>
                </div>

                {step.taskId === undefined ? undefined : (
                  <p className="pl-8 text-xs text-brand-muted lg:pl-7">
                    ⚙{' '}
                    {task
                      ? `Completing records maintenance: ${task.name}`
                      : 'The linked maintenance task no longer exists — completing won’t record it.'}
                  </p>
                )}

                {fields.length > 0 ? (
                  <StepFields
                    fields={fields}
                    values={step.values}
                    onCommit={(values) => {
                      setBlocked((ids) => ids.filter((id) => id !== step.id));
                      persist(
                        steps.map((s, i) =>
                          i === index ? { ...s, values } : s,
                        ),
                      );
                    }}
                  />
                ) : undefined}

                {blocked.includes(step.id) ? (
                  <p
                    className="pl-8 text-sm text-red-600 lg:pl-7 dark:text-red-400"
                    role="alert"
                  >
                    Fill the required fields to complete this step — completing
                    it records the maintenance.
                  </p>
                ) : undefined}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const inputBaseClass =
  'rounded-md border border-hairline bg-transparent px-3 py-2 text-base text-brand outline-none focus:border-brand dark:text-ink-inverted';
const labelClass = 'flex flex-col gap-1 text-sm text-brand-muted';

/** The HTML input type for each single-line field type (note/boolean render differently). */
const SCALAR_INPUT_TYPE: Record<string, string> = {
  text: 'text',
  number: 'number',
  date: 'date',
};

// The exact element type of a run step's captured values (domain-derived), so a
// step's `values` flows in without a cast and stays in sync with the schema.
type RecordedValue = NonNullable<RunStep['values']>[number];

/** The current value for a field name, from the step's captured values. */
function valueOf(
  values: readonly RecordedValue[] | undefined,
  name: string,
): FieldValue | undefined {
  return values?.find((v) => v.name === name)?.value;
}

/**
 * Merge one field's value into the step's recorded values, dropping a blank so a
 * cleared field is not stored as an empty answer. Both `commit` triggers (blur
 * and immediate change) funnel through here so the run always holds a clean set.
 */
function withValue(
  values: readonly RecordedValue[] | undefined,
  name: string,
  value: FieldValue | undefined,
): RecordedValue[] {
  const rest = (values ?? []).filter((v) => v.name !== name);
  return value === undefined || value === ''
    ? rest
    : [...rest, { name, value }];
}

/**
 * The field inputs for one step — a plain step's own `fieldSchema` or a
 * task-linked step's task fields (the caller decides which; the capture path is
 * identical, ADR-0008). A local draft mirrors the captured values so typing is
 * smooth; free-text/number fields commit on blur, and boolean/date/select
 * fields commit immediately — each commit hands the whole recorded set back up
 * to be persisted onto the run.
 */
function StepFields({
  fields,
  values,
  onCommit,
}: {
  readonly fields: readonly FieldDefinition[];
  readonly values: readonly RecordedValue[] | undefined;
  readonly onCommit: (values: RecordedValue[]) => void;
}): JSX.Element {
  const [draft, setDraft] = useState<RecordedValue[]>([...(values ?? [])]);

  const commit = (name: string, value: FieldValue | undefined): void => {
    const next = withValue(draft, name, value);
    setDraft(next);
    onCommit(next);
  };

  const setLocal = (name: string, value: FieldValue | undefined): void => {
    setDraft((current) => withValue(current, name, value));
  };

  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-3">
      {fields.map((field) => (
        <FieldInput
          key={field.name}
          field={field}
          value={valueOf(draft, field.name)}
          onChange={(value) => {
            setLocal(field.name, value);
          }}
          onCommit={(value) => {
            commit(field.name, value);
          }}
        />
      ))}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  onCommit,
}: {
  readonly field: FieldDefinition;
  readonly value: FieldValue | undefined;
  readonly onChange: (value: FieldValue | undefined) => void;
  readonly onCommit: (value: FieldValue | undefined) => void;
}): JSX.Element {
  const label = (
    <span>
      {field.name}
      {field.unit ? ` (${field.unit})` : ''}
      {field.required ? ' *' : ''}
    </span>
  );

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-brand-muted">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => {
            onCommit(e.target.checked ? true : undefined);
          }}
        />
        {label}
      </label>
    );
  }

  if (field.type === 'note') {
    return (
      <label className={labelClass}>
        {label}
        <textarea
          className={`w-full ${inputBaseClass}`}
          rows={3}
          value={value === undefined ? '' : String(value)}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          onBlur={(e) => {
            onCommit(e.target.value);
          }}
        />
      </label>
    );
  }

  const inputType = SCALAR_INPUT_TYPE[field.type] ?? 'text';
  const parse = (raw: string): FieldValue | undefined => {
    if (field.type === 'number') {
      return raw === '' ? undefined : Number(raw);
    }
    return raw;
  };

  return (
    <label className={labelClass}>
      {label}
      <input
        type={inputType}
        className={`w-full ${inputBaseClass}`}
        value={value === undefined ? '' : String(value)}
        onChange={(e) => {
          onChange(parse(e.target.value));
        }}
        onBlur={(e) => {
          onCommit(parse(e.target.value));
        }}
      />
    </label>
  );
}
