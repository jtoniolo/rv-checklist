'use client';

import {
  StepPatchSchema,
  SUPPORTED_FIELD_TYPES,
  type Checklist,
  type StepPatch,
  type SupportedFieldType,
} from '@rv-checklist/domain';
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@rv-checklist/web-ui';
import { useState, type JSX } from 'react';

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
 *
 * Controls are the shared shadcn/ui set (issue #23), matching the rig form.
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

const labelClass =
  'flex-col items-start gap-1 font-normal text-muted-foreground';

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
      <Label className={labelClass}>
        Name
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="Pre-departure"
        />
      </Label>

      <Label className={labelClass}>
        Tags (optional, comma-separated)
        <Input
          value={tagsText}
          onChange={(e) => {
            setTagsText(e.target.value);
          }}
          placeholder="procedure, departure"
        />
      </Label>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-brand dark:text-ink-inverted">
          Steps
        </legend>

        {steps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
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
                <span className="pt-2 text-sm text-muted-foreground">
                  {index + 1}.
                </span>
                <Input
                  value={step.text}
                  onChange={(e) => {
                    updateStep(step.key, { text: e.target.value });
                  }}
                  placeholder="Close roof vents"
                  aria-label={`Step ${String(index + 1)} text`}
                />
                <div className="flex flex-col">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      moveStep(index, -1);
                    }}
                    disabled={index === 0}
                    aria-label={`Move step ${String(index + 1)} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => {
                      moveStep(index, 1);
                    }}
                    disabled={index === steps.length - 1}
                    aria-label={`Move step ${String(index + 1)} down`}
                  >
                    ↓
                  </Button>
                </div>
              </div>

              {step.fields.length > 0 ? (
                <ul className="flex flex-col gap-2 pl-6">
                  {step.fields.map((field) => (
                    <li
                      key={field.key}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Input
                        className="flex-1"
                        value={field.name}
                        onChange={(e) => {
                          updateField(step.key, field.key, {
                            name: e.target.value,
                          });
                        }}
                        placeholder="Field name"
                        aria-label="Field name"
                      />
                      <Select
                        value={field.type}
                        onValueChange={(value) => {
                          updateField(step.key, field.key, {
                            type: value as SupportedFieldType,
                          });
                        }}
                      >
                        <SelectTrigger className="w-28" aria-label="Field type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_FIELD_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.type === 'number' ? (
                        <Input
                          className="w-20"
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
                      <Label className="gap-1.5 text-xs font-normal text-muted-foreground">
                        <Checkbox
                          checked={field.required}
                          onCheckedChange={(checked) => {
                            updateField(step.key, field.key, {
                              required: checked === true,
                            });
                          }}
                        />
                        required
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-muted-foreground"
                        onClick={() => {
                          removeField(step.key, field.key);
                        }}
                        aria-label="Remove field"
                      >
                        Remove field
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : undefined}

              <div className="flex gap-3 pl-6">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    addField(step.key);
                  }}
                >
                  Add field
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setSteps((current) =>
                      current.filter((s) => s.key !== step.key),
                    );
                  }}
                >
                  Delete step
                </Button>
              </div>
            </li>
          ))}
        </ol>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setSteps((current) => [...current, emptyStep()]);
          }}
        >
          Add step
        </Button>
      </fieldset>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : undefined}

      <div className="flex gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
