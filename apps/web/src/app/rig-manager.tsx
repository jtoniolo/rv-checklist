'use client';

import type { CreateRig, Id, Rig } from '@rv-checklist/domain';
import {
  useCreateRigMutation,
  useDeleteRigMutation,
  useListRigsQuery,
  useUpdateRigMutation,
} from '@rv-checklist/web-data-access';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';
import { RigForm } from './rig-form';

/**
 * The rig CRUD surface (issue #14). Lists the owner's rigs, adds, edits, and
 * deletes them. After creating a rig the owner lands on the new rig's
 * dashboard. Each rig card links to its rig-scoped home.
 */
export function RigManager(): JSX.Element {
  const { data: rigs, isLoading, isError } = useListRigsQuery();
  const [createRig, { isLoading: isCreating }] = useCreateRigMutation();
  const [updateRig, { isLoading: isUpdating }] = useUpdateRigMutation();
  const [deleteRig] = useDeleteRigMutation();
  const router = useRouter();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id | undefined>(undefined);

  const handleCreate = async (values: CreateRig): Promise<void> => {
    const created = await createRig(values).unwrap();
    setAdding(false);
    router.push(`/rig/${created.id}`);
  };

  const handleUpdate = async (id: Id, values: CreateRig): Promise<void> => {
    await updateRig({
      id,
      // A blank distance clears the rig's current Distance (issue #32); the wire
      // spells removal `null`, so a blank field maps to it rather than "unchanged".
      // eslint-disable-next-line unicorn/no-null
      changes: { ...values, distanceKm: values.distanceKm ?? null },
    }).unwrap();
    setEditingId(undefined);
  };

  const handleDelete = async (id: Id): Promise<void> => {
    await deleteRig(id).unwrap();
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Your rigs">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-brand dark:text-ink-inverted">
          Your rigs
        </h2>
        {adding ? undefined : (
          <button
            type="button"
            onClick={() => {
              setEditingId(undefined);
              setAdding(true);
            }}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Add rig
          </button>
        )}
      </div>

      {adding ? (
        <RigForm
          submitLabel="Add rig"
          pending={isCreating}
          onSubmit={(values) => void handleCreate(values)}
          onCancel={() => {
            setAdding(false);
          }}
        />
      ) : undefined}

      {isLoading ? (
        <p className="text-brand-muted">Loading your rigs…</p>
      ) : undefined}

      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn’t load your rigs. Please try again.
        </p>
      ) : undefined}

      {!adding && rigs?.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          No rigs yet — add your first one to get started.
        </p>
      ) : undefined}

      <ul className="flex flex-col gap-3">
        {rigs?.map((rig) =>
          editingId === rig.id ? (
            <li key={rig.id}>
              <RigForm
                initial={toCreateRig(rig)}
                submitLabel="Save changes"
                pending={isUpdating}
                onSubmit={(values) => void handleUpdate(rig.id, values)}
                onCancel={() => {
                  setEditingId(undefined);
                }}
              />
            </li>
          ) : (
            <li key={rig.id}>
              <RigCard
                rig={rig}
                onEdit={() => {
                  setAdding(false);
                  setEditingId(rig.id);
                }}
                onDelete={() => void handleDelete(rig.id)}
              />
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function toCreateRig(rig: Rig): CreateRig {
  return {
    vin: rig.vin,
    make: rig.make,
    model: rig.model,
    year: rig.year,
    nickname: rig.nickname,
    distanceKm: rig.distanceKm,
  };
}

interface RigCardProps {
  readonly rig: Rig;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

function RigCard({ rig, onEdit, onDelete }: RigCardProps): JSX.Element {
  const details = [rig.year, rig.make, rig.model]
    .filter((part): part is string | number => part !== undefined)
    .join(' ');
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-hairline p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <Link
            href={`/rig/${rig.id}`}
            className="text-lg font-semibold text-brand hover:underline dark:text-ink-inverted"
          >
            {rig.nickname}
          </Link>
          {details ? (
            <span className="text-sm text-brand-muted">{details}</span>
          ) : undefined}
          {rig.vin ? (
            <span className="font-mono text-xs text-brand-muted">
              VIN {rig.vin}
            </span>
          ) : undefined}
        </div>
      </div>
      <div className="flex gap-4 text-sm">
        <Link
          href={`/rig/${rig.id}`}
          className="font-medium text-brand hover:opacity-80 dark:text-ink-inverted"
        >
          View
        </Link>
        <button
          type="button"
          onClick={onEdit}
          className="font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="font-medium text-red-600 hover:opacity-80 dark:text-red-400"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
