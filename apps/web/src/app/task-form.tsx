'use client';

import {
  FieldSchemaSchema,
  SUPPORTED_FIELD_TYPES,
  type FieldSchema,
  type Interval,
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
 * The add/edit maintenance-task form (issue #17). Authors a task's name, how
 * it's tracked, and its custom `field_schema`: the same field rows the checklist
 * form uses for a plain step (name / type / unit / required).
 *
 * Tracking is a three-way choice (issue #29), mutually exclusive by
 * construction: a **one-time** task (due from creation, done once) hides the
 * interval; otherwise a recurring interval measured on a **basis** (calendar
 * months or Distance km — issue #32) makes it recurring, and a blank interval
 * leaves it untracked. The basis picker chooses months vs km; only the chosen
 * basis's field is shown, and only its value is emitted. So the form never emits
 * both an interval and the one-time marker, nor an interval on two bases.
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
  /**
   * The recurring Interval on its chosen basis (calendar months or Distance km),
   * or `undefined` when untracked or one-time — the two are exclusive (issue #29).
   */
  readonly interval: Interval | undefined;
  /** Marks a one-time task — due from creation, done once (issue #29). */
  readonly oneTime: boolean;
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
  // The interval's basis (issue #32) and the field value for each — only the
  // chosen basis's field is shown and emitted. Default calendar for a new task.
  const [basis, setBasis] = useState<'calendar' | 'distance'>(
    initial?.interval?.basis ?? 'calendar',
  );
  const [monthsText, setMonthsText] = useState(
    initial?.interval?.basis === 'calendar'
      ? String(initial.interval.months)
      : '',
  );
  const [kmText, setKmText] = useState(
    initial?.interval?.basis === 'distance' ? String(initial.interval.km) : '',
  );
  const [oneTime, setOneTime] = useState(initial?.oneTime === true);
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
    // A one-time task never has an interval (issue #29) — the two are exclusive.
    // Otherwise the chosen basis's field gives the interval; a blank field
    // leaves the task untracked (issue #32).
    const rawAmount = (basis === 'calendar' ? monthsText : kmText).trim();
    const amount = oneTime || rawAmount === '' ? undefined : Number(rawAmount);
    if (
      amount !== undefined &&
      (!Number.isSafeInteger(amount) || amount <= 0)
    ) {
      setError(
        basis === 'calendar'
          ? 'The interval must be a whole number of months.'
          : 'The interval must be a whole number of kilometres.',
      );
      return;
    }
    const interval: Interval | undefined =
      amount === undefined
        ? undefined
        : basis === 'calendar'
          ? { basis: 'calendar', months: amount }
          : { basis: 'distance', km: amount };
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
      interval,
      oneTime,
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

      <Label className="flex-row items-start gap-2 font-normal text-muted-foreground">
        <Checkbox
          checked={oneTime}
          onCheckedChange={(checked) => {
            setOneTime(checked === true);
          }}
          aria-label="One-time task"
        />
        <span className="flex flex-col gap-0.5">
          <span>One-time task</span>
          <span className="text-xs">
            Something to do once — due now, and cleared from the list once
            you’ve logged it.
          </span>
        </span>
      </Label>

      {oneTime ? undefined : (
        <div className="flex flex-wrap items-end gap-3">
          <Label className={labelClass}>
            Track by
            <Select
              value={basis}
              onValueChange={(value) => {
                setBasis(value as 'calendar' | 'distance');
              }}
            >
              <SelectTrigger className="w-40" aria-label="Track by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="calendar">Calendar (months)</SelectItem>
                <SelectItem value="distance">Distance (km)</SelectItem>
              </SelectContent>
            </Select>
          </Label>

          {basis === 'calendar' ? (
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
          ) : (
            <Label className={labelClass}>
              Repeat every (km)
              <Input
                type="number"
                min={1}
                step={1}
                className="w-32"
                value={kmText}
                onChange={(e) => {
                  setKmText(e.target.value);
                }}
                placeholder="20000"
              />
              <span className="text-xs">
                Leave blank to leave it untracked. Set the rig’s distance to
                track it.
              </span>
            </Label>
          )}
        </div>
      )}

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
