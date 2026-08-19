'use client';

import type { Id } from '@rv-checklist/domain';
import { useCreateTripMutation } from '@rv-checklist/web-data-access';
import { Button, Input, Label } from '@rv-checklist/web-ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';

const labelClass =
  'flex-col items-start gap-1 font-normal text-muted-foreground';

/**
 * The minimal create form (issue #114) — the only trip creation entry point.
 * Name required, start point optional free text; place autocomplete and the
 * full editor are a separate issue. Creating navigates to the trip's route.
 */
export function NewTripScreen({ rigId }: { readonly rigId: Id }): JSX.Element {
  const router = useRouter();
  const [createTrip, { isLoading, isError }] = useCreateTripMutation();
  const [name, setName] = useState('');
  const [startLocation, setStartLocation] = useState('');

  const submit = async (): Promise<void> => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedStart = startLocation.trim();
    const created = await createTrip({
      rigId,
      name: trimmedName,
      ...(trimmedStart && { startLocation: trimmedStart }),
      checklistIds: [],
    }).unwrap();
    router.push(`/rig/${rigId}/trips/${created.id}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/rig/${rigId}/trips`}
        className="self-start text-sm font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
      >
        &#8249; All trips
      </Link>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="flex flex-col gap-3 rounded-xl border border-hairline p-4"
        aria-label="New trip"
      >
        <Label className={labelClass}>
          Name
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder="Fall Colours Loop"
            required
          />
        </Label>
        <Label className={labelClass}>
          Start point (optional)
          <Input
            value={startLocation}
            onChange={(e) => {
              setStartLocation(e.target.value);
            }}
            placeholder="Home — Newmarket, ON"
          />
        </Label>
        {isError ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            Couldn&apos;t create the trip. Please try again.
          </p>
        ) : undefined}
        <div className="flex gap-2">
          <Button type="submit" disabled={isLoading}>
            Create trip
          </Button>
        </div>
      </form>
    </div>
  );
}
