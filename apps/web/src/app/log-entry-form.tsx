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
  readonly submitLabel: string;
  readonly pending: boolean;
  readonly onSubmit: (performedOn: IsoDate, fields: LoggedField[]) => void;
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

export function LogEntryForm({
  initialFields,
  initialDate,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: LogEntryFormProps): JSX.Element {
  const [performedOn, setPerformedOn] = useState<string>(initialDate);
  const [fields, setFields] = useState<LoggedField[]>([...initialFields]);
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
    setError(undefined);
    onSubmit(performedOn, fields);
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
