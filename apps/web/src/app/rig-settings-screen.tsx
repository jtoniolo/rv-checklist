'use client';

import type { CreateRig, Id } from '@rv-checklist/domain';
import {
  useCreateEquipmentMutation,
  useDeleteEquipmentMutation,
  useListEquipmentQuery,
  useListRigsQuery,
  useUpdateEquipmentMutation,
  useUpdateRigMutation,
} from '@rv-checklist/web-data-access';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type JSX, useRef, useState } from 'react';
import { RigForm, toCreateRig, toRigUpdate } from './rig-form';

/**
 * The rig settings screen (issue #62): the "Rig" nav destination for a
 * rig-scoped route. Edits the active rig in place with the shared RigForm;
 * adding or removing rigs stays on the rig-agnostic manager at `/rigs`.
 * Equipment section added in issue #79.
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
        <p className="text-brand-muted">Loading your rig&hellip;</p>
      ) : undefined}

      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load your rig. Please try again.
        </p>
      ) : undefined}

      {!isLoading && !isError && !rig ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          This rig was not found — it may have been removed.
        </p>
      ) : undefined}

      {rig ? (
        <>
          <RigForm
            initial={toCreateRig(rig)}
            submitLabel="Save changes"
            pending={isUpdating}
            onSubmit={(values) => void handleUpdate(values)}
            onCancel={() => {
              router.push(`/rig/${rigId}`);
            }}
          />
          <EquipmentSection rigId={rigId} />
        </>
      ) : undefined}
    </section>
  );
}

function EquipmentSection({ rigId }: { readonly rigId: Id }): JSX.Element {
  const { data: items, isLoading } = useListEquipmentQuery(rigId);
  const [createEquipment] = useCreateEquipmentMutation();
  const [updateEquipment] = useUpdateEquipmentMutation();
  const [deleteEquipment] = useDeleteEquipmentMutation();

  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async (): Promise<void> => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await createEquipment({ rigId, name: trimmed }).unwrap();
    setNewName('');
    inputRef.current?.focus();
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Equipment">
      <h3 className="text-lg font-semibold text-brand dark:text-ink-inverted">
        Equipment
      </h3>

      {isLoading ? (
        <p className="text-brand-muted">Loading equipment&hellip;</p>
      ) : undefined}

      {items?.length === 0 ? (
        <p className="text-brand-muted">No equipment added yet.</p>
      ) : undefined}

      {items && items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <EquipmentRow
              key={item.id}
              id={item.id}
              rigId={rigId}
              name={item.name}
              onRename={(name) => {
                void updateEquipment({ id: item.id, changes: { name } });
              }}
              onRemove={() => {
                void deleteEquipment({ id: item.id, rigId });
              }}
            />
          ))}
        </ul>
      ) : undefined}

      <form
        aria-label="Add equipment"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void handleAdd();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Equipment name"
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
          }}
          className="dark:bg-surface-elevated flex-1 rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-brand-muted focus:border-brand focus:outline-none dark:text-ink-inverted"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-brand-muted"
        >
          Add
        </button>
      </form>
    </section>
  );
}

function EquipmentRow({
  id,
  rigId,
  name,
  onRename,
  onRemove,
}: {
  readonly id: Id;
  readonly rigId: Id;
  readonly name: string;
  readonly onRename: (name: string) => void;
  readonly onRemove: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);

  const commitRename = (): void => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  return (
    <li
      className="dark:bg-surface-elevated flex items-center justify-between rounded-lg border border-hairline bg-surface px-3 py-2"
      data-equipment-id={id}
      data-rig-id={rigId}
    >
      {editing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
          }}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            else if (e.key === 'Escape') {
              setEditValue(name);
              setEditing(false);
            }
          }}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="flex-1 bg-transparent text-sm text-ink focus:outline-none dark:text-ink-inverted"
          aria-label={`Rename ${name}`}
        />
      ) : (
        <span className="text-sm text-ink dark:text-ink-inverted">{name}</span>
      )}
      <div className="flex gap-1">
        {editing ? undefined : (
          <button
            type="button"
            onClick={() => {
              setEditValue(name);
              setEditing(true);
            }}
            className="rounded px-2 py-1 text-xs text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
            aria-label={`Rename ${name}`}
          >
            Rename
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="rounded px-2 py-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          aria-label={`Remove ${name}`}
        >
          Remove
        </button>
      </div>
    </li>
  );
}
