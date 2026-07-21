'use client';

import {
  StepPatchSchema,
  SUPPORTED_FIELD_TYPES,
  type Checklist,
  type StepPatch,
  type SupportedFieldType,
} from '@rv-checklist/domain';
import { useState, type ChangeEvent, type JSX } from 'react';

/**
 * The add/edit checklist form (issue #15). Authors a checklist's name, free-form
 * tags, and its ordered plain steps — add, edit the text, reorder (up/down), and
 * delete — plus an optional custom `field_schema` per step. Task-linked steps
 * are out of scope here (task-linking is T8), so every step authored is a plain
 * step and the ADR-0008 "no fields on a task-linked step" conflict cannot arise.
 *
 * Each built step is validated by the shared `StepPatchSchema` before submit, so
 * the field rules (unique names, supported types, `photo` rejected, unit only on
 * number — ADR-0004/0007/0008) are enforced with one source of truth. The same
 * form serves creation (empty initial) and editing (an existing checklist, whose
 * step ids are preserved so a reorder keeps each step's identity).
 */

export interface ChecklistFormValues {
  readonly name: string;
  readonly tags: string[];
  readonly steps: StepPatch[];
}

export interface ChecklistFormProps {
  readonly initial?: Checklist;
  readonly submitLabel: string;
  readonly pending: boolean;
  readonly onSubmit: (values: ChecklistFormValues) => void;
  readonly onCancel: () => void;
}

interface FieldDraft {
  key: string;
  name: string;
  type: SupportedFieldType;
  required: boolean;
  unit: string;
}

interface StepDraft {
  key: string;
  id: string | undefined;
  text: string;
  fields: FieldDraft[];
}

// The width is applied per use so the narrow type/unit controls can share the
// same base without string-rewriting the class list.
const inputBaseClass =
  'rounded-md border border-hairline bg-transparent px-3 py-2 text-base text-brand outline-none focus:border-brand dark:text-ink-inverted';
const inputClass = `w-full ${inputBaseClass}`;
const labelClass = 'flex flex-col gap-1 text-sm text-brand-muted';
const smallButtonClass =
  'rounded-md px-2 py-1 text-xs font-medium text-brand-muted hover:text-brand disabled:opacity-30 dark:hover:text-ink-inverted';

function newKey(): string {
  return crypto.randomUUID();
}

function toStepDraft(step: Checklist['steps'][number]): StepDraft {
  return {
    key: newKey(),
    id: step.id,
    text: step.text,
    fields: (step.fieldSchema ?? []).map((f) => ({
      key: newKey(),
      name: f.name,
      // The wire type includes `photo`; an authored field is always a supported
      // one, so fall back rather than widen the draft's type.
      type: (SUPPORTED_FIELD_TYPES as readonly string[]).includes(f.type)
        ? (f.type as SupportedFieldType)
        : 'text',
      required: f.required,
      unit: f.unit ?? '',
    })),
  };
}

function emptyStep(): StepDraft {
  return { key: newKey(), id: undefined, text: '', fields: [] };
}

/** Split the free-form tags input on commas, trimming and dropping blanks. */
function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** Build the wire step for a draft, omitting an empty field schema and a unit off a number. */
function toStepPatch(draft: StepDraft): StepPatch {
  const fieldSchema = draft.fields.map((f) => ({
    name: f.name.trim(),
    type: f.type,
    required: f.required,
    // A unit is meaningful only on a number (ADR-0004); drop it otherwise so it
    // never trips validation.
    ...(f.type === 'number' && f.unit.trim() && { unit: f.unit.trim() }),
  }));
  return {
    ...(draft.id && { id: draft.id }),
    text: draft.text.trim(),
    ...(fieldSchema.length > 0 && { fieldSchema }),
  };
}

export function ChecklistForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: ChecklistFormProps): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '));
  const [steps, setSteps] = useState<StepDraft[]>(
    () => initial?.steps.map(toStepDraft) ?? [],
  );
  const [error, setError] = useState<string | undefined>(undefined);

  const updateStep = (key: string, change: Partial<StepDraft>): void => {
    setSteps((current) =>
      current.map((step) => (step.key === key ? { ...step, ...change } : step)),
    );
  };

  const moveStep = (index: number, delta: -1 | 1): void => {
    setSteps((current) => {
      const target = index + delta;
      const moved = current[index];
      const displaced = current[target];
      if (!moved || !displaced) {
        return current;
      }
      const next = [...current];
      next[index] = displaced;
      next[target] = moved;
      return next;
    });
  };

  const addField = (stepKey: string): void => {
    setSteps((current) =>
      current.map((step) =>
        step.key === stepKey
          ? {
              ...step,
              fields: [
                ...step.fields,
                {
                  key: newKey(),
                  name: '',
                  type: 'text',
                  required: false,
                  unit: '',
                },
              ],
            }
          : step,
      ),
    );
  };

  const updateField = (
    stepKey: string,
    fieldKey: string,
    change: Partial<FieldDraft>,
  ): void => {
    setSteps((current) =>
      current.map((step) =>
        step.key === stepKey
          ? {
              ...step,
              fields: step.fields.map((field) =>
                field.key === fieldKey ? { ...field, ...change } : field,
              ),
            }
          : step,
      ),
    );
  };

  const removeField = (stepKey: string, fieldKey: string): void => {
    setSteps((current) =>
      current.map((step) =>
        step.key === stepKey
          ? {
              ...step,
              fields: step.fields.filter((field) => field.key !== fieldKey),
            }
          : step,
      ),
    );
  };

  const submit = (): void => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('A checklist needs a name.');
      return;
    }
    const built: StepPatch[] = [];
    for (const draft of steps) {
      const parsed = StepPatchSchema.safeParse(toStepPatch(draft));
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Please check the steps.');
        return;
      }
      built.push(parsed.data);
    }
    setError(undefined);
    onSubmit({ name: trimmedName, tags: parseTags(tagsText), steps: built });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4 rounded-xl border border-hairline p-4"
      aria-label={initial ? 'Edit checklist' : 'Add checklist'}
    >
      <label className={labelClass}>
        Name
        <input
          className={inputClass}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="Pre-departure"
        />
      </label>

      <label className={labelClass}>
        Tags (optional, comma-separated)
        <input
          className={inputClass}
          value={tagsText}
          onChange={(e) => {
            setTagsText(e.target.value);
          }}
          placeholder="procedure, departure"
        />
      </label>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-brand dark:text-ink-inverted">
          Steps
        </legend>

        {steps.length === 0 ? (
          <p className="text-sm text-brand-muted">
            No steps yet — add the first thing to do or pack.
          </p>
        ) : undefined}

        <ol className="flex flex-col gap-3">
          {steps.map((step, index) => (
            <li
              key={step.key}
              className="flex flex-col gap-2 rounded-lg border border-hairline p-3"
            >
              <div className="flex items-start gap-2">
                <span className="pt-2 text-sm text-brand-muted">
                  {index + 1}.
                </span>
                <input
                  className={inputClass}
                  value={step.text}
                  onChange={(e) => {
                    updateStep(step.key, { text: e.target.value });
                  }}
                  placeholder="Close roof vents"
                  aria-label={`Step ${String(index + 1)} text`}
                />
                <div className="flex flex-col">
                  <button
                    type="button"
                    className={smallButtonClass}
                    onClick={() => {
                      moveStep(index, -1);
                    }}
                    disabled={index === 0}
                    aria-label={`Move step ${String(index + 1)} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={smallButtonClass}
                    onClick={() => {
                      moveStep(index, 1);
                    }}
                    disabled={index === steps.length - 1}
                    aria-label={`Move step ${String(index + 1)} down`}
                  >
                    ↓
                  </button>
                </div>
              </div>

              {step.fields.length > 0 ? (
                <ul className="flex flex-col gap-2 pl-6">
                  {step.fields.map((field) => (
                    <li
                      key={field.key}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input
                        className={`${inputClass} flex-1`}
                        value={field.name}
                        onChange={(e) => {
                          updateField(step.key, field.key, {
                            name: e.target.value,
                          });
                        }}
                        placeholder="Field name"
                        aria-label="Field name"
                      />
                      <select
                        className={`w-28 ${inputBaseClass}`}
                        value={field.type}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                          updateField(step.key, field.key, {
                            type: e.target.value as SupportedFieldType,
                          });
                        }}
                        aria-label="Field type"
                      >
                        {SUPPORTED_FIELD_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      {field.type === 'number' ? (
                        <input
                          className={`w-20 ${inputBaseClass}`}
                          value={field.unit}
                          onChange={(e) => {
                            updateField(step.key, field.key, {
                              unit: e.target.value,
                            });
                          }}
                          placeholder="unit"
                          aria-label="Field unit"
                        />
                      ) : undefined}
                      <label className="flex items-center gap-1 text-xs text-brand-muted">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => {
                            updateField(step.key, field.key, {
                              required: e.target.checked,
                            });
                          }}
                        />
                        required
                      </label>
                      <button
                        type="button"
                        className={smallButtonClass}
                        onClick={() => {
                          removeField(step.key, field.key);
                        }}
                        aria-label="Remove field"
                      >
                        Remove field
                      </button>
                    </li>
                  ))}
                </ul>
              ) : undefined}

              <div className="flex gap-3 pl-6 text-xs">
                <button
                  type="button"
                  className="font-medium text-brand hover:opacity-80 dark:text-ink-inverted"
                  onClick={() => {
                    addField(step.key);
                  }}
                >
                  Add field
                </button>
                <button
                  type="button"
                  className="font-medium text-red-600 hover:opacity-80 dark:text-red-400"
                  onClick={() => {
                    setSteps((current) =>
                      current.filter((s) => s.key !== step.key),
                    );
                  }}
                >
                  Delete step
                </button>
              </div>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={() => {
            setSteps((current) => [...current, emptyStep()]);
          }}
          className="self-start rounded-md border border-hairline px-3 py-1.5 text-sm font-medium text-brand hover:border-brand dark:text-ink-inverted"
        >
          Add step
        </button>
      </fieldset>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : undefined}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
