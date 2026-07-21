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
import { useState, type JSX } from 'react';

/**
 * The mobile-first run screen (issue #16). Works through one run's steps: each is
 * marked incomplete / complete / skipped and the state switches freely, so a
 * mistake is corrected by tapping another state (CONTEXT.md — step state is not a
 * boolean). A plain step with custom fields shows its inputs; the values are
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
  onExit,
}: {
  readonly runId: Id;
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
  return <RunWorkspace key={query.data.id} run={query.data} onExit={onExit} />;
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

const STATE_LABELS: Record<StepState, string> = {
  incomplete: 'To do',
  complete: 'Done',
  skipped: 'Skip',
};

const STATE_ORDER: readonly StepState[] = ['incomplete', 'complete', 'skipped'];

function RunWorkspace({
  run,
  onExit,
}: {
  readonly run: Run;
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

  return (
    <section className="flex flex-col gap-4" aria-label="Run">
      <div className="flex flex-col gap-2">
        <BackButton onExit={onExit} />
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold text-brand dark:text-ink-inverted">
            {new Date(`${run.startedOn}T00:00:00`).toLocaleDateString(
              undefined,
              {
                dateStyle: 'medium',
              },
            )}
          </h2>
          <span className="text-sm text-brand-muted" aria-live="polite">
            {progress.inProgress
              ? `${String(progress.completed + progress.skipped)} of ${String(progress.total)} done`
              : 'All done'}
          </span>
        </div>
      </div>

      {steps.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          This run has no steps.
        </p>
      ) : undefined}

      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="flex flex-col gap-3 rounded-xl border border-hairline p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={
                  step.state === 'complete'
                    ? 'text-base text-brand-muted line-through dark:text-brand-muted'
                    : step.state === 'skipped'
                      ? 'text-base text-brand-muted italic'
                      : 'text-base text-brand dark:text-ink-inverted'
                }
              >
                {step.text}
              </span>
            </div>

            <div
              className="flex gap-2"
              role="group"
              aria-label={`State for “${step.text}”`}
            >
              {STATE_ORDER.map((state) => {
                const isActive = step.state === state;
                return (
                  <button
                    key={state}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      setStepState(index, state);
                    }}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-brand bg-brand text-white'
                        : 'border-hairline text-brand-muted hover:border-brand dark:hover:text-ink-inverted'
                    }`}
                  >
                    {STATE_LABELS[state]}
                  </button>
                );
              })}
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
