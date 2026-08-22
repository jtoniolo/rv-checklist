'use client';

import {
  CreateRigSchema,
  type CreateRig,
  type Rig,
  type UpdateRig,
} from '@rv-checklist/domain';
import { Button, Input, Label } from '@rv-checklist/web-ui';
import { useState, type ChangeEvent, type JSX } from 'react';

/** Map a rig's current values to the form's initial values. */
export function toCreateRig(rig: Rig): CreateRig {
  return {
    vin: rig.vin,
    make: rig.make,
    model: rig.model,
    year: rig.year,
    nickname: rig.nickname,
    distanceKm: rig.distanceKm,
    travelHeightMm: rig.travelHeightMm,
    lengthMm: rig.lengthMm,
    combinedLengthMm: rig.combinedLengthMm,
    clearancePassengerMm: rig.clearancePassengerMm,
    clearanceDriverMm: rig.clearanceDriverMm,
  };
}

/**
 * Map submitted form values to a rig update. A blank distance or dimension
 * clears the stored value (issues #32, #139); the wire spells removal `null`,
 * so a blank field maps to it rather than "unchanged".
 */
export function toRigUpdate(values: CreateRig): UpdateRig {
  /* eslint-disable unicorn/no-null */
  return {
    ...values,
    distanceKm: values.distanceKm ?? null,
    travelHeightMm: values.travelHeightMm ?? null,
    lengthMm: values.lengthMm ?? null,
    combinedLengthMm: values.combinedLengthMm ?? null,
    clearancePassengerMm: values.clearancePassengerMm ?? null,
    clearanceDriverMm: values.clearanceDriverMm ?? null,
  };
  /* eslint-enable unicorn/no-null */
}

/**
 * The add/edit rig form. Fields mirror {@link CreateRig}; the shared
 * `CreateRigSchema` validates on submit (ADR-0009: the web reuses the same Zod
 * schemas), so a bad VIN or year is caught before the request. The same form
 * serves creation (empty initial values) and editing (the rig's current
 * values). First screen on the shadcn/ui controls (issue #23).
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
  distance: string;
  travelHeight: string;
  length: string;
  combinedLength: string;
  clearancePassenger: string;
  clearanceDriver: string;
}

// Dimensions are stored in millimetres but entered metric (CONTEXT.md,
// issue #139): heights and lengths as decimal metres, side clearances as
// whole centimetres — matching how a tape measure and a Canadian clearance
// sign read.
function metersField(mm: number | undefined): string {
  return mm === undefined ? '' : String(mm / 1000);
}

function centimetersField(mm: number | undefined): string {
  return mm === undefined ? '' : String(mm / 10);
}

/** A blank entry is unset; anything else scales to integer millimetres. */
function toMm(field: string, mmPerUnit: number): number | undefined {
  const trimmed = field.trim();
  return trimmed ? Math.round(Number(trimmed) * mmPerUnit) : undefined;
}

function toFields(initial: CreateRig | undefined): FormFields {
  return {
    vin: initial?.vin ?? '',
    make: initial?.make ?? '',
    model: initial?.model ?? '',
    year: initial?.year === undefined ? '' : String(initial.year),
    nickname: initial?.nickname ?? '',
    distance:
      initial?.distanceKm === undefined ? '' : String(initial.distanceKm),
    travelHeight: metersField(initial?.travelHeightMm),
    length: metersField(initial?.lengthMm),
    combinedLength: metersField(initial?.combinedLengthMm),
    clearancePassenger: centimetersField(initial?.clearancePassengerMm),
    clearanceDriver: centimetersField(initial?.clearanceDriverMm),
  };
}

const labelClass =
  'flex-col items-start gap-1 font-normal text-muted-foreground';

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
    const distance = fields.distance.trim();
    // Only the nickname is required; blank details are omitted, not sent empty.
    const parsed = CreateRigSchema.safeParse({
      nickname: fields.nickname.trim(),
      vin: fields.vin.trim() || undefined,
      make: fields.make.trim() || undefined,
      model: fields.model.trim() || undefined,
      year: year ? Number(year) : undefined,
      // The rig's current Distance (issue #32) — blank means unset.
      distanceKm: distance ? Number(distance) : undefined,
      // Dimensions (issue #139): metres and centimetres entered, mm stored.
      travelHeightMm: toMm(fields.travelHeight, 1000),
      lengthMm: toMm(fields.length, 1000),
      combinedLengthMm: toMm(fields.combinedLength, 1000),
      clearancePassengerMm: toMm(fields.clearancePassenger, 10),
      clearanceDriverMm: toMm(fields.clearanceDriver, 10),
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
      <Label className={labelClass}>
        Nickname
        <Input
          value={fields.nickname}
          onChange={set('nickname')}
          placeholder="Silver Bullet"
        />
      </Label>
      <div className="flex gap-3">
        <Label className={`${labelClass} flex-1`}>
          Make (optional)
          <Input
            value={fields.make}
            onChange={set('make')}
            placeholder="Airstream"
          />
        </Label>
        <Label className={`${labelClass} flex-1`}>
          Model (optional)
          <Input
            value={fields.model}
            onChange={set('model')}
            placeholder="Flying Cloud"
          />
        </Label>
      </div>
      <div className="flex gap-3">
        <Label className={`${labelClass} w-28`}>
          Year (optional)
          <Input
            value={fields.year}
            onChange={set('year')}
            inputMode="numeric"
            placeholder="2021"
          />
        </Label>
        <Label className={`${labelClass} flex-1`}>
          VIN (optional)
          <Input
            value={fields.vin}
            onChange={set('vin')}
            placeholder="1FDXE4FS…"
          />
        </Label>
      </div>
      <Label className={`${labelClass} w-40`}>
        Current distance (km)
        <Input
          value={fields.distance}
          onChange={set('distance')}
          inputMode="numeric"
          placeholder="38200"
        />
        <span className="text-xs font-normal">
          Optional — tracks distance-based maintenance.
        </span>
      </Label>
      <fieldset className="flex flex-col gap-3 border-t border-hairline pt-3">
        <legend className="pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Dimensions
        </legend>
        <div className="flex gap-3">
          <Label className={`${labelClass} flex-1`}>
            Travel height (m)
            <Input
              value={fields.travelHeight}
              onChange={set('travelHeight')}
              inputMode="decimal"
              placeholder="4.11"
            />
          </Label>
          <Label className={`${labelClass} flex-1`}>
            Length (m)
            <Input
              value={fields.length}
              onChange={set('length')}
              inputMode="decimal"
              placeholder="8.53"
            />
          </Label>
          <Label className={`${labelClass} flex-1`}>
            Combined length (m)
            <Input
              value={fields.combinedLength}
              onChange={set('combinedLength')}
              inputMode="decimal"
              placeholder="16.15"
            />
          </Label>
        </div>
        <div className="flex gap-3">
          <Label className={`${labelClass} flex-1`}>
            Passenger side clearance (cm)
            <Input
              value={fields.clearancePassenger}
              onChange={set('clearancePassenger')}
              inputMode="numeric"
              placeholder="90"
            />
          </Label>
          <Label className={`${labelClass} flex-1`}>
            Driver side clearance (cm)
            <Input
              value={fields.clearanceDriver}
              onChange={set('clearanceDriver')}
              inputMode="numeric"
              placeholder="15"
            />
          </Label>
        </div>
        <span className="text-xs font-normal text-muted-foreground">
          Optional — measured figures, no margin. Side clearances are how far
          the slide or awning reaches when deployed. Shown on the trip screen.
        </span>
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
