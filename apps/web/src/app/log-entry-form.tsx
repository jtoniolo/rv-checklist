'use client';

import {
  validateFieldValues,
  type FieldValue,
  type IsoDate,
  type LoggedField,
} from '@rv-checklist/domain';
import {
  Button,
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
 * The log-entry form (issue #17): the dated record that a maintenance task was
 * performed, and
 * the values for its field snapshot. Performing a task standalone seeds the
 * snapshot from the task's current `field_schema` (no values yet); editing a
 * past entry seeds it from the entry's own copy — either way the fields
 * edited here are the entry's snapshot, so a later task edit never touches
 * them (ADR-0004).
 *
 * `required` is enforced here via the shared `validateFieldValues` before
 * submit — a log entry must carry its required measurements. A boolean field
 * is a Yes/No choice (story 42), so "No" is recordable and distinct from
 * "not filled in".
 */

export interface LogEntryFormProps {
  /** The entry's field snapshot, with any already-recorded values. */
  readonly initialFields: readonly LoggedField[];
  readonly initialDate: IsoDate;
  /** The rig's Distance reading at the time (km), if the entry recorded one (issue #32). */
  readonly initialDistanceKm?: number | undefined;
  /** What the task cost in integer cents (issue #39), if the entry recorded one. */
  readonly initialCostCents?: number | undefined;
  readonly submitLabel: string;
  readonly pending: boolean;
  /**
   * `distanceKm` is the optional Distance reading (issue #32): a whole km count,
   * or `undefined` when the field is left blank — absent means absent.
   * `costCents` is the optional cost (issue #39): integer cents, or `undefined`
   * when the field is left blank.
   */
  readonly onSubmit: (
    performedOn: IsoDate,
    fields: LoggedField[],
    distanceKm: number | undefined,
    costCents: number | undefined,
  ) => void;
  readonly onCancel: () => void;
}

const labelClass =
  'flex-col items-start gap-1 font-normal text-muted-foreground';

/** One field with `value` replaced (or removed, so a cleared field stays unfilled). */
function withValue(
  field: LoggedField,
  value: FieldValue | undefined,
): LoggedField {
  const { value: _dropped, ...definition } = field;
  return value === undefined || value === ''
    ? definition
    : { ...definition, value };
}

/** Cents → display dollars, e.g. 11240 → "112.40". Empty string when absent. */
function centsToDisplayDollars(cents: number | undefined): string {
  if (cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

export function LogEntryForm({
  initialFields,
  initialDate,
  initialDistanceKm,
  initialCostCents,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: LogEntryFormProps): JSX.Element {
  const [performedOn, setPerformedOn] = useState<string>(initialDate);
  const [fields, setFields] = useState<LoggedField[]>([...initialFields]);
  const [distanceText, setDistanceText] = useState(
    initialDistanceKm === undefined ? '' : String(initialDistanceKm),
  );
  const [costText, setCostText] = useState(
    centsToDisplayDollars(initialCostCents),
  );
  const [error, setError] = useState<string | undefined>(undefined);

  const setValue = (name: string, value: FieldValue | undefined): void => {
    setFields((current) =>
      current.map((field) =>
        field.name === name ? withValue(field, value) : field,
      ),
    );
  };

  const submit = (): void => {
    if (!performedOn) {
      setError('A log entry needs the date it was performed.');
      return;
    }
    const required = validateFieldValues(
      fields,
      fields.map(({ name, value }) => ({ name, value })),
    );
    if (!required.valid) {
      setError(required.errors[0]);
      return;
    }
    // The optional Distance reading (issue #32): blank means none, otherwise a
    // whole, non-negative km count.
    const trimmedDistance = distanceText.trim();
    const distanceKm =
      trimmedDistance === '' ? undefined : Number(trimmedDistance);
    if (
      distanceKm !== undefined &&
      (!Number.isSafeInteger(distanceKm) || distanceKm < 0)
    ) {
      setError('The distance reading must be a whole number of kilometres.');
      return;
    }
    // The optional cost (issue #39): decimal dollars → integer cents.
    const trimmedCost = costText.trim();
    let costCents: number | undefined;
    if (trimmedCost !== '') {
      const dollars = Number(trimmedCost);
      if (Number.isNaN(dollars) || dollars < 0) {
        setError('Cost must be a positive dollar amount.');
        return;
      }
      costCents = Math.round(dollars * 100);
    }
    setError(undefined);
    onSubmit(performedOn, fields, distanceKm, costCents);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4 rounded-xl border border-hairline p-4"
      aria-label="Log entry"
    >
      <Label className={labelClass}>
        Performed on
        <Input
          type="date"
          className="w-44"
          value={performedOn}
          onChange={(e) => {
            setPerformedOn(e.target.value);
          }}
        />
      </Label>

      <Label className={labelClass}>
        Distance (km)
        <Input
          type="number"
          min={0}
          step={1}
          className="w-44"
          value={distanceText}
          onChange={(e) => {
            setDistanceText(e.target.value);
          }}
          placeholder="38200"
        />
        <span className="text-xs">
          Optional — the rig’s distance now, so distance-based tasks know when
          they’re next due.
        </span>
      </Label>

      <Label className={labelClass}>
        Cost ($)
        <Input
          type="number"
          min={0}
          step={0.01}
          className="w-44"
          value={costText}
          onChange={(e) => {
            setCostText(e.target.value);
          }}
          placeholder="112.40"
        />
        <span className="text-xs text-muted-foreground/70 italic">
          Optional — what this job cost (parts, labour, consumables).
        </span>
      </Label>

      {fields.map((field) => (
        <LoggedFieldInput
          key={field.name}
          field={field}
          onChange={(value) => {
            setValue(field.name, value);
          }}
        />
      ))}

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

/** The HTML input type for each single-line field type (note/boolean render differently). */
const SCALAR_INPUT_TYPE: Record<string, string> = {
  text: 'text',
  number: 'number',
  date: 'date',
};

function LoggedFieldInput({
  field,
  onChange,
}: {
  readonly field: LoggedField;
  readonly onChange: (value: FieldValue | undefined) => void;
}): JSX.Element {
  const label = (
    <span>
      {field.name}
      {field.unit ? ` (${field.unit})` : ''}
      {field.required ? ' *' : ''}
    </span>
  );

  if (field.type === 'boolean') {
    // Yes / No (story 42) — with an explicit "not filled in" for an optional field.
    const current =
      field.value === true ? 'yes' : field.value === false ? 'no' : 'unset';
    return (
      <Label className={labelClass}>
        {label}
        <Select
          value={current}
          onValueChange={(choice) => {
            onChange(
              choice === 'yes' ? true : choice === 'no' ? false : undefined,
            );
          }}
        >
          <SelectTrigger className="w-32" aria-label={field.name}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unset">—</SelectItem>
            <SelectItem value="yes">Yes</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      </Label>
    );
  }

  if (field.type === 'note') {
    return (
      <Label className={labelClass}>
        {label}
        <Textarea
          rows={3}
          value={field.value === undefined ? '' : String(field.value)}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        />
      </Label>
    );
  }

  const parse = (raw: string): FieldValue | undefined => {
    if (field.type === 'number') {
      return raw === '' ? undefined : Number(raw);
    }
    return raw;
  };

  return (
    <Label className={labelClass}>
      {label}
      <Input
        type={SCALAR_INPUT_TYPE[field.type] ?? 'text'}
        value={field.value === undefined ? '' : String(field.value)}
        onChange={(e) => {
          onChange(parse(e.target.value));
        }}
      />
    </Label>
  );
}
