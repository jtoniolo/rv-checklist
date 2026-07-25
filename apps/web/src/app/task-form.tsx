'use client';

import {
  FieldSchemaSchema,
  SUPPORTED_FIELD_TYPES,
  type FieldSchema,
  type Interval,
  type IsoDate,
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
 * interval; otherwise a recurring interval makes it recurring, and leaving the
 * interval blank leaves it untracked. The interval offers two independent
 * optional cadence fields (ADR-0016) — calendar `months` and Distance `km` — and
 * the task is due on whichever elapses first; each blank field is an absent
 * limit, and the interval is emitted only when at least one is filled. So the
 * form never emits both an interval and the one-time marker.
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
   * The recurring Interval — its calendar `months` and/or Distance `km` limits
   * (ADR-0016) — or `undefined` when untracked or one-time (the two are exclusive,
   * issue #29). Emitted only when at least one cadence field is filled.
   */
  readonly interval: Interval | undefined;
  /** Marks a one-time task — due from creation, done once (issue #29). */
  readonly oneTime: boolean;
  /**
   * The manual last-performed anchor (issue #33) — a hand-set date for the
   * interval's calendar limit, or `undefined` when unset or the interval has no
   * `months` limit. A real completion still supersedes it; the due engine takes
   * the later of the two. Emitted only when a calendar limit is present.
   */
  readonly lastPerformed: IsoDate | undefined;
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
  // The two independent cadence limits (ADR-0016) — a blank field is an absent
  // limit; at least one filled makes the task recurring. Both start from the
  // task's interval when editing.
  const [monthsText, setMonthsText] = useState(
    initial?.interval?.months === undefined
      ? ''
      : String(initial.interval.months),
  );
  const [kmText, setKmText] = useState(
    initial?.interval?.km === undefined ? '' : String(initial.interval.km),
  );
  const [oneTime, setOneTime] = useState(initial?.oneTime === true);
  // The manual last-performed anchor (issue #33) — anchors the calendar limit;
  // blank means unset. Shown and emitted only when a `months` limit is set.
  const [lastPerformedText, setLastPerformedText] = useState(
    initial?.lastPerformed ?? '',
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
    // A one-time task never has an interval (issue #29) — the two are exclusive.
    // Otherwise each cadence field is an optional limit (ADR-0016): a blank field
    // is absent, and both blank leaves the task untracked.
    const parseLimit = (text: string): number | undefined => {
      const raw = text.trim();
      return oneTime || raw === '' ? undefined : Number(raw);
    };
    const months = parseLimit(monthsText);
    if (
      months !== undefined &&
      (!Number.isSafeInteger(months) || months <= 0)
    ) {
      setError('The calendar interval must be a whole number of months.');
      return;
    }
    const km = parseLimit(kmText);
    if (km !== undefined && (!Number.isSafeInteger(km) || km <= 0)) {
      setError('The distance interval must be a whole number of kilometres.');
      return;
    }
    // Whichever limits are set coexist on one interval; both absent = untracked.
    const interval: Interval | undefined =
      months === undefined && km === undefined
        ? undefined
        : {
            ...(months !== undefined && { months }),
            ...(km !== undefined && { km }),
          };
    // The manual anchor rides only with a calendar limit (issue #33, ADR-0016):
    // emit it only when the interval carries a `months` limit and a date was set,
    // so the form never sends a stray anchor on a distance-only, one-time, or
    // untracked task.
    const lastPerformed: IsoDate | undefined =
      interval?.months !== undefined && lastPerformedText.trim() !== ''
        ? lastPerformedText
        : undefined;
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
      lastPerformed,
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
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-brand dark:text-ink-inverted">
            Repeat interval
          </legend>
          <p className="text-xs text-muted-foreground">
            Set a calendar cadence, a distance cadence, or both — with both,
            it’s due on whichever comes first. Leave both blank to leave it
            untracked.
          </p>
          <div className="flex flex-wrap items-end gap-3">
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
            </Label>

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
            </Label>

            {monthsText.trim() === '' ? undefined : (
              <Label className={labelClass}>
                Last performed
                <Input
                  type="date"
                  className="w-40"
                  value={lastPerformedText}
                  onChange={(e) => {
                    setLastPerformedText(e.target.value);
                  }}
                  aria-label="Last performed"
                />
                <span className="text-xs">
                  Optional — anchor the schedule to when it was last done,
                  before any log entry. A logged completion takes over from
                  here.
                </span>
              </Label>
            )}
          </div>
        </fieldset>
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
