'use client';

import {
  FieldSchemaSchema,
  SUPPORTED_FIELD_TYPES,
  type FieldSchema,
  type MaintenanceTask,
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
  Textarea,
} from '@rv-checklist/web-ui';
import { useState, type JSX } from 'react';

/**
 * The add/edit maintenance-task form (issue #17). Authors a task's name, its
 * optional interval (whole months — blank means a one-off task, not tracked for
 * due-status), and its custom `field_schema`: the same field rows the
 * checklist form uses for a plain step (name / type / unit / required).
 *
 * The built field schema is validated by the shared `FieldSchemaSchema` before
 * submit, so the ADR-0004 rules (unique names, supported types, `photo`
 * rejected, unit only on number) are enforced with one source of truth. The
 * same form serves creation (empty initial) and editing (an existing task).
 * Controls are the shared shadcn/ui set (issue #23), matching the other forms.
 */

export interface TaskFormValues {
  readonly name: string;
  /** Trimmed free text, or `undefined` when left blank — absent means absent. */
  readonly description: string | undefined;
  /** Whole months, or `undefined` for an untracked one-off task. */
  readonly intervalMonths: number | undefined;
  readonly fieldSchema: FieldSchema;
}

export interface TaskFormProps {
  readonly initial?: MaintenanceTask;
  readonly submitLabel: string;
  readonly pending: boolean;
  readonly onSubmit: (values: TaskFormValues) => void;
  readonly onCancel: () => void;
}

interface FieldDraft {
  key: string;
  name: string;
  type: SupportedFieldType;
  required: boolean;
  unit: string;
}

const labelClass =
  'flex-col items-start gap-1 font-normal text-muted-foreground';

function newKey(): string {
  return crypto.randomUUID();
}

function toFieldDraft(field: FieldSchema[number]): FieldDraft {
  return {
    key: newKey(),
    name: field.name,
    // The wire type includes `photo`; an authored field is always a supported
    // one, so fall back rather than widen the draft's type.
    type: (SUPPORTED_FIELD_TYPES as readonly string[]).includes(field.type)
      ? (field.type as SupportedFieldType)
      : 'text',
    required: field.required,
    unit: field.unit ?? '',
  };
}

/** Build one wire field for a draft, dropping a unit off a non-number. */
function toFieldDefinition(draft: FieldDraft): FieldSchema[number] {
  return {
    name: draft.name.trim(),
    type: draft.type,
    required: draft.required,
    // A unit is meaningful only on a number (ADR-0004); drop it otherwise so
    // it never trips validation.
    ...(draft.type === 'number' &&
      draft.unit.trim() && { unit: draft.unit.trim() }),
  };
}

export function TaskForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: TaskFormProps): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [monthsText, setMonthsText] = useState(
    initial?.interval ? String(initial.interval.months) : '',
  );
  const [fields, setFields] = useState<FieldDraft[]>(
    () => initial?.fieldSchema.map(toFieldDraft) ?? [],
  );
  const [error, setError] = useState<string | undefined>(undefined);

  const updateField = (key: string, change: Partial<FieldDraft>): void => {
    setFields((current) =>
      current.map((field) =>
        field.key === key ? { ...field, ...change } : field,
      ),
    );
  };

  const submit = (): void => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('A maintenance task needs a name.');
      return;
    }
    const trimmedMonths = monthsText.trim();
    const months = trimmedMonths === '' ? undefined : Number(trimmedMonths);
    if (
      months !== undefined &&
      (!Number.isSafeInteger(months) || months <= 0)
    ) {
      setError('The interval must be a whole number of months.');
      return;
    }
    const parsed = FieldSchemaSchema.safeParse(
      fields.map((draft) => toFieldDefinition(draft)),
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the fields.');
      return;
    }
    setError(undefined);
    const trimmedDescription = description.trim();
    onSubmit({
      name: trimmedName,
      // Blank means no description — never a stored placeholder (issue #25).
      description: trimmedDescription === '' ? undefined : trimmedDescription,
      intervalMonths: months,
      fieldSchema: parsed.data,
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4 rounded-xl border border-hairline p-4"
      aria-label={initial ? 'Edit maintenance task' : 'Add maintenance task'}
    >
      <Label className={labelClass}>
        Name
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="Condition slide seals"
        />
      </Label>

      <Label className={labelClass}>
        Description
        <Textarea
          rows={4}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          placeholder="Why this task matters, and how to do it"
        />
        <span className="text-xs">
          Optional — why it needs doing and a basic outline of how.
        </span>
      </Label>

      <Label className={labelClass}>
        Repeat every (months)
        <Input
          type="number"
          min={1}
          step={1}
          className="w-32"
          value={monthsText}
          onChange={(e) => {
            setMonthsText(e.target.value);
          }}
          placeholder="12"
        />
        <span className="text-xs">
          Leave blank for a one-off task — it won’t be tracked as due.
        </span>
      </Label>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-brand dark:text-ink-inverted">
          Fields to record each time
        </legend>

        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No fields — a log entry will just record the date.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {fields.map((field) => (
              <li key={field.key} className="flex flex-wrap items-center gap-2">
                <Input
                  className="flex-1"
                  value={field.name}
                  onChange={(e) => {
                    updateField(field.key, { name: e.target.value });
                  }}
                  placeholder="Field name"
                  aria-label="Field name"
                />
                <Select
                  value={field.type}
                  onValueChange={(value) => {
                    updateField(field.key, {
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
                      updateField(field.key, { unit: e.target.value });
                    }}
                    placeholder="unit"
                    aria-label="Field unit"
                  />
                ) : undefined}
                <Label className="gap-1.5 text-xs font-normal text-muted-foreground">
                  <Checkbox
                    checked={field.required}
                    onCheckedChange={(checked) => {
                      updateField(field.key, { required: checked === true });
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
                    setFields((current) =>
                      current.filter((f) => f.key !== field.key),
                    );
                  }}
                  aria-label="Remove field"
                >
                  Remove field
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setFields((current) => [
              ...current,
              {
                key: newKey(),
                name: '',
                type: 'text',
                required: false,
                unit: '',
              },
            ]);
          }}
        >
          Add field
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
