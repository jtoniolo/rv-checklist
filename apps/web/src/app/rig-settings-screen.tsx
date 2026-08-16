'use client';

import type { CreateRig, Id } from '@rv-checklist/domain';
import {
  useListRigsQuery,
  useUpdateRigMutation,
} from '@rv-checklist/web-data-access';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';
import { RigForm, toCreateRig, toRigUpdate } from './rig-form';

/**
 * The rig settings screen (issue #62): the "Rig" nav destination for a
 * rig-scoped route. Edits the active rig in place with the shared RigForm;
 * adding or removing rigs stays on the rig-agnostic manager at `/rigs`.
 */
export function RigSettingsScreen({
  rigId,
}: {
  readonly rigId: Id;
}): JSX.Element {
  const { data: rigs, isLoading, isError } = useListRigsQuery();
  const [updateRig, { isLoading: isUpdating }] = useUpdateRigMutation();
  const router = useRouter();

  const rig = rigs?.find((r) => r.id === rigId);

  const handleUpdate = async (values: CreateRig): Promise<void> => {
    await updateRig({ id: rigId, changes: toRigUpdate(values) }).unwrap();
    router.push(`/rig/${rigId}`);
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Rig settings">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-brand dark:text-ink-inverted">
          Rig settings
        </h2>
        <Link
          href="/rigs"
          className="text-sm font-medium text-brand hover:opacity-80 dark:text-ink-inverted"
        >
          Manage all rigs
        </Link>
      </div>

      {isLoading ? (
        <p className="text-brand-muted">Loading your rig…</p>
      ) : undefined}

      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn’t load your rig. Please try again.
        </p>
      ) : undefined}

      {!isLoading && !isError && !rig ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          This rig was not found — it may have been removed.
        </p>
      ) : undefined}

      {rig ? (
        <RigForm
          initial={toCreateRig(rig)}
          submitLabel="Save changes"
          pending={isUpdating}
          onSubmit={(values) => void handleUpdate(values)}
          onCancel={() => {
            router.push(`/rig/${rigId}`);
          }}
        />
      ) : undefined}
    </section>
  );
}
