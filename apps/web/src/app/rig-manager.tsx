'use client';

import type { CreateRig, Id, Rig } from '@rv-checklist/domain';
import {
  activeRigCleared,
  activeRigSelected,
  selectActiveRigId,
  useAppDispatch,
  useAppSelector,
  useCreateRigMutation,
  useDeleteRigMutation,
  useListRigsQuery,
  useUpdateRigMutation,
} from '@rv-checklist/web-data-access';
import { useState, type JSX } from 'react';
import { RigForm } from './rig-form';

/**
 * The rig CRUD surface (issue #14) — the owner's rigs, end to end. Lists the
 * owner's rigs (RTK Query, owner-scoped by the API), adds, edits, and deletes
 * them, and selects the active rig (a client-local slice, ADR-0011). Every
 * mutation invalidates the `Rig` cache, so the list reflects each change without
 * a manual refetch.
 */
export function RigManager(): JSX.Element {
  const { data: rigs, isLoading, isError } = useListRigsQuery();
  const [createRig, { isLoading: isCreating }] = useCreateRigMutation();
  const [updateRig, { isLoading: isUpdating }] = useUpdateRigMutation();
  const [deleteRig] = useDeleteRigMutation();

  const dispatch = useAppDispatch();
  const activeRigId = useAppSelector(selectActiveRigId);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id | undefined>(undefined);

  const handleCreate = async (values: CreateRig): Promise<void> => {
    const created = await createRig(values).unwrap();
    setAdding(false);
    // A freshly added rig becomes the active one if none is selected yet.
    if (!activeRigId) {
      dispatch(activeRigSelected(created.id));
    }
  };

  const handleUpdate = async (id: Id, values: CreateRig): Promise<void> => {
    await updateRig({ id, changes: values }).unwrap();
    setEditingId(undefined);
  };

  const handleDelete = async (id: Id): Promise<void> => {
    await deleteRig(id).unwrap();
    // Deleting the active rig leaves no coherent selection — clear it.
    if (activeRigId === id) {
      dispatch(activeRigCleared());
    }
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
                isActive={rig.id === activeRigId}
                onSelect={() => dispatch(activeRigSelected(rig.id))}
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
  };
}

interface RigCardProps {
  readonly rig: Rig;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

function RigCard({
  rig,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: RigCardProps): JSX.Element {
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-4 ${
        isActive ? 'border-brand' : 'border-hairline'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-lg font-semibold text-brand dark:text-ink-inverted">
            {rig.nickname}
          </span>
          <span className="text-sm text-brand-muted">
            {rig.year} {rig.make} {rig.model}
          </span>
          <span className="font-mono text-xs text-brand-muted">
            VIN {rig.vin}
          </span>
        </div>
        {isActive ? (
          <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white">
            Active
          </span>
        ) : undefined}
      </div>
      <div className="flex gap-4 text-sm">
        {isActive ? undefined : (
          <button
            type="button"
            onClick={onSelect}
            className="font-medium text-brand hover:opacity-80 dark:text-ink-inverted"
          >
            Set active
          </button>
        )}
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
