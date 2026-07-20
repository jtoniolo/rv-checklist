'use client';

import { CreateRigSchema, type CreateRig } from '@rv-checklist/domain';
import { useState, type ChangeEvent, type JSX } from 'react';

/**
 * The add/edit rig form. Fields mirror {@link CreateRig}; the shared
 * `CreateRigSchema` validates on submit (ADR-0009: the web reuses the same Zod
 * schemas), so a bad VIN or year is caught before the request. The same form
 * serves creation (empty initial values) and editing (the rig's current
 * values).
 */
export interface RigFormProps {
  readonly initial?: CreateRig;
  readonly submitLabel: string;
  readonly pending: boolean;
  readonly onSubmit: (values: CreateRig) => void;
  readonly onCancel: () => void;
}

interface FormFields {
  vin: string;
  make: string;
  model: string;
  year: string;
  nickname: string;
}

function toFields(initial: CreateRig | undefined): FormFields {
  return {
    vin: initial?.vin ?? '',
    make: initial?.make ?? '',
    model: initial?.model ?? '',
    year: initial?.year === undefined ? '' : String(initial.year),
    nickname: initial?.nickname ?? '',
  };
}

const inputClass =
  'w-full rounded-md border border-hairline bg-transparent px-3 py-2 text-base text-brand outline-none focus:border-brand dark:text-ink-inverted';
const labelClass = 'flex flex-col gap-1 text-sm text-brand-muted';

export function RigForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: RigFormProps): JSX.Element {
  const [fields, setFields] = useState<FormFields>(() => toFields(initial));
  const [error, setError] = useState<string | undefined>(undefined);

  const set =
    (key: keyof FormFields) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      setFields((current) => ({ ...current, [key]: event.target.value }));
    };

  const submit = (): void => {
    const year = fields.year.trim();
    // Only the nickname is required; blank details are omitted, not sent empty.
    const parsed = CreateRigSchema.safeParse({
      nickname: fields.nickname.trim(),
      vin: fields.vin.trim() || undefined,
      make: fields.make.trim() || undefined,
      model: fields.model.trim() || undefined,
      year: year ? Number(year) : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the details.');
      return;
    }
    setError(undefined);
    onSubmit(parsed.data);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3 rounded-xl border border-hairline p-4"
      aria-label={initial ? 'Edit rig' : 'Add rig'}
    >
      <label className={labelClass}>
        Nickname
        <input
          className={inputClass}
          value={fields.nickname}
          onChange={set('nickname')}
          placeholder="Silver Bullet"
        />
      </label>
      <div className="flex gap-3">
        <label className={`${labelClass} flex-1`}>
          Make (optional)
          <input
            className={inputClass}
            value={fields.make}
            onChange={set('make')}
            placeholder="Airstream"
          />
        </label>
        <label className={`${labelClass} flex-1`}>
          Model (optional)
          <input
            className={inputClass}
            value={fields.model}
            onChange={set('model')}
            placeholder="Flying Cloud"
          />
        </label>
      </div>
      <div className="flex gap-3">
        <label className={`${labelClass} w-28`}>
          Year (optional)
          <input
            className={inputClass}
            value={fields.year}
            onChange={set('year')}
            inputMode="numeric"
            placeholder="2021"
          />
        </label>
        <label className={`${labelClass} flex-1`}>
          VIN (optional)
          <input
            className={inputClass}
            value={fields.vin}
            onChange={set('vin')}
            placeholder="1FDXE4FS…"
          />
        </label>
      </div>
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
