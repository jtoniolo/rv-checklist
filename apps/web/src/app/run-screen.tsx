'use client';

import {
  runProgress,
  type FieldDefinition,
  type FieldValue,
  type Id,
  type Run,
  type RunStep,
  type StepState,
} from '@rv-checklist/domain';
import {
  useGetRunQuery,
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
  onExit,
}: {
  readonly runId: Id;
  /** The checklist's name — the run itself holds only ids. */
  readonly title: string;
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
        <BackButton onExit={onExit} />
      </div>
    );
  }
  // Remount on a different run so local step state is reseeded from the load.
  return (
    <RunWorkspace
      key={query.data.id}
      run={query.data}
      title={title}
      onExit={onExit}
    />
  );
}

function BackButton({ onExit }: { readonly onExit: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onExit}
      className="self-start text-sm font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
    >
      ← Back to runs
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
  onExit,
}: {
  readonly run: Run;
  readonly title: string;
  readonly onExit: () => void;
}): JSX.Element {
  // Seeded once from the fresh load; `RunScreen` keys this component on the run
  // id, so switching runs remounts and reseeds. During a session local state is
  // the source of truth — each edit is persisted, so a refetch never needs to
  // clobber an in-flight change back over it.
  const [steps, setSteps] = useState<RunStep[]>(run.steps);
  const [updateRun] = useUpdateRunMutation();

  const persist = (next: RunStep[]): void => {
    setSteps(next);
    void updateRun({ id: run.id, changes: { steps: next } });
  };

  const setStepState = (index: number, state: StepState): void => {
    persist(steps.map((step, i) => (i === index ? { ...step, state } : step)));
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
        <BackButton onExit={onExit} />
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
          {displayOrder.map(({ step, index }, position) => (
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

              {step.fieldSchema && step.fieldSchema.length > 0 ? (
                <StepFields
                  step={step}
                  onCommit={(values) => {
                    persist(
                      steps.map((s, i) => (i === index ? { ...s, values } : s)),
                    );
                  }}
                />
              ) : undefined}
            </li>
          ))}
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
 * The custom-field inputs for a plain step. A local draft mirrors the captured
 * values so typing is smooth; free-text/number fields commit on blur, and
 * boolean/date/select fields commit immediately — each commit hands the whole
 * recorded set back up to be persisted onto the run.
 */
function StepFields({
  step,
  onCommit,
}: {
  readonly step: RunStep;
  readonly onCommit: (values: RecordedValue[]) => void;
}): JSX.Element {
  const [draft, setDraft] = useState<RecordedValue[]>(step.values ?? []);

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
      {(step.fieldSchema ?? []).map((field) => (
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
