'use client';

import type {
  CreateRig,
  EquipmentItem,
  Id,
  UpdateEquipmentItem,
} from '@rv-checklist/domain';
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

/** Cents to display dollars, e.g. 11240 to "112.40". Empty string when absent. */
function centsToDisplayDollars(cents: number | undefined): string {
  if (cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

function parseCostCents(text: string): number | undefined | 'invalid' {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const dollars = Number(trimmed);
  if (Number.isNaN(dollars) || dollars < 0) return 'invalid';
  return Math.round(dollars * 100);
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

  const handleUpdate = (id: Id, changes: UpdateEquipmentItem): void => {
    void updateEquipment({ id, changes });
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
              item={item}
              rigId={rigId}
              onUpdate={(changes) => {
                handleUpdate(item.id, changes);
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

const fieldInputClass =
  'dark:bg-surface-elevated w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-brand-muted focus:border-brand focus:outline-none dark:text-ink-inverted';

function EquipmentRow({
  item,
  rigId,
  onUpdate,
  onRemove,
}: {
  readonly item: EquipmentItem;
  readonly rigId: Id;
  readonly onUpdate: (changes: UpdateEquipmentItem) => void;
  readonly onRemove: () => void;
}): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [editMake, setEditMake] = useState(item.make ?? '');
  const [editModel, setEditModel] = useState(item.model ?? '');
  const [editPurchaseDate, setEditPurchaseDate] = useState(
    item.purchaseDate ?? '',
  );
  const [editNotes, setEditNotes] = useState(item.notes ?? '');
  const [editCost, setEditCost] = useState(
    centsToDisplayDollars(item.costCents),
  );
  const [error, setError] = useState<string | undefined>(undefined);

  const resetForm = (): void => {
    setEditName(item.name);
    setEditMake(item.make ?? '');
    setEditModel(item.model ?? '');
    setEditPurchaseDate(item.purchaseDate ?? '');
    setEditNotes(item.notes ?? '');
    setEditCost(centsToDisplayDollars(item.costCents));
    setError(undefined);
  };

  const handleSave = (): void => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }
    const costResult = parseCostCents(editCost);
    if (costResult === 'invalid') {
      setError('Cost must be a positive dollar amount.');
      return;
    }
    setError(undefined);

    const changes: UpdateEquipmentItem = {};
    if (trimmedName !== item.name) changes.name = trimmedName;

    const trimmedMake = editMake.trim();
    if (trimmedMake !== (item.make ?? '')) {
      // eslint-disable-next-line unicorn/no-null
      changes.make = trimmedMake || null;
    }
    const trimmedModel = editModel.trim();
    if (trimmedModel !== (item.model ?? '')) {
      // eslint-disable-next-line unicorn/no-null
      changes.model = trimmedModel || null;
    }
    const trimmedDate = editPurchaseDate.trim();
    if (trimmedDate !== (item.purchaseDate ?? '')) {
      // eslint-disable-next-line unicorn/no-null
      changes.purchaseDate = trimmedDate || null;
    }
    const trimmedNotes = editNotes.trim();
    if (trimmedNotes !== (item.notes ?? '')) {
      // eslint-disable-next-line unicorn/no-null
      changes.notes = trimmedNotes || null;
    }
    if (costResult !== item.costCents) {
      // eslint-disable-next-line unicorn/no-null
      changes.costCents = costResult ?? null;
    }

    if (Object.keys(changes).length > 0) onUpdate(changes);
    setExpanded(false);
  };

  const handleCancel = (): void => {
    resetForm();
    setExpanded(false);
  };

  const summaryParts: string[] = [];
  if (item.make) summaryParts.push(item.make);
  if (item.model) summaryParts.push(item.model);
  if (item.costCents !== undefined) {
    summaryParts.push(`$${centsToDisplayDollars(item.costCents)}`);
  }

  return (
    <li
      className="dark:bg-surface-elevated rounded-lg border border-hairline bg-surface"
      data-equipment-id={item.id}
      data-rig-id={rigId}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-ink dark:text-ink-inverted">
            {item.name}
          </span>
          {summaryParts.length > 0 ? (
            <span className="text-xs text-brand-muted">
              {summaryParts.join(' · ')}
            </span>
          ) : undefined}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              if (expanded) {
                handleCancel();
              } else {
                resetForm();
                setExpanded(true);
              }
            }}
            className="rounded px-2 py-1 text-xs text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
            aria-label={expanded ? `Close ${item.name}` : `Edit ${item.name}`}
          >
            {expanded ? 'Close' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded px-2 py-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            aria-label={`Remove ${item.name}`}
          >
            Remove
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-3 border-t border-hairline px-3 py-3">
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : undefined}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-brand-muted">Name</span>
            <input
              type="text"
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
              }}
              className={fieldInputClass}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-brand-muted">Make</span>
              <input
                type="text"
                value={editMake}
                onChange={(e) => {
                  setEditMake(e.target.value);
                }}
                placeholder="e.g. Onan"
                className={fieldInputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-brand-muted">
                Model
              </span>
              <input
                type="text"
                value={editModel}
                onChange={(e) => {
                  setEditModel(e.target.value);
                }}
                placeholder="e.g. QG 5500"
                className={fieldInputClass}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-brand-muted">
                Purchase date
              </span>
              <input
                type="date"
                value={editPurchaseDate}
                onChange={(e) => {
                  setEditPurchaseDate(e.target.value);
                }}
                className={fieldInputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-brand-muted">
                Cost ($)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={editCost}
                onChange={(e) => {
                  setEditCost(e.target.value);
                }}
                placeholder="0.00"
                className={fieldInputClass}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-brand-muted">Notes</span>
            <textarea
              value={editNotes}
              onChange={(e) => {
                setEditNotes(e.target.value);
              }}
              rows={2}
              placeholder="Specs, warranty length, provenance..."
              className={fieldInputClass}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg px-4 py-2 text-sm font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-brand-muted"
            >
              Save
            </button>
          </div>
        </div>
      ) : undefined}
    </li>
  );
}
