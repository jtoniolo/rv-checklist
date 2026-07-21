'use client';

import type { Checklist, Id, Step, StepInput } from '@rv-checklist/domain';
import {
  useCreateChecklistMutation,
  useDeleteChecklistMutation,
  useListChecklistsQuery,
  useUpdateChecklistMutation,
} from '@rv-checklist/web-data-access';
import { useState, type JSX } from 'react';
import { ChecklistForm, type ChecklistFormValues } from './checklist-form';

/**
 * A checklist's step as a create-body step: drop the server-assigned id so the
 * copy gets fresh step ids (story 21), while carrying any task link or field
 * schema across.
 */
function toStepInput(step: Step): StepInput {
  return {
    text: step.text,
    ...(step.taskId && { taskId: step.taskId }),
    ...(step.fieldSchema && { fieldSchema: step.fieldSchema }),
  };
}

/**
 * The checklist authoring surface (issue #15) for the active rig. Lists the
 * rig's checklists (RTK Query, rig-scoped by the API), adds, edits, and deletes
 * them. Editing sends the whole steps array, so add / edit / reorder / delete of
 * steps are one save; the server keeps existing step ids so a reorder preserves
 * identity, and — because a run holds its own copy of the steps — editing here
 * never touches a past run. Every mutation invalidates the rig's checklist
 * cache, so the list reflects each change without a manual refetch.
 */
export function ChecklistManager({
  rigId,
}: {
  readonly rigId: Id;
}): JSX.Element {
  const {
    data: checklists,
    isLoading,
    isError,
  } = useListChecklistsQuery(rigId);
  const [createChecklist, { isLoading: isCreating }] =
    useCreateChecklistMutation();
  const [updateChecklist, { isLoading: isUpdating }] =
    useUpdateChecklistMutation();
  const [deleteChecklist] = useDeleteChecklistMutation();

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id | undefined>(undefined);

  const handleCreate = async (values: ChecklistFormValues): Promise<void> => {
    await createChecklist({ rigId, ...values }).unwrap();
    setAdding(false);
  };

  const handleUpdate = async (
    id: Id,
    values: ChecklistFormValues,
  ): Promise<void> => {
    await updateChecklist({ id, changes: values }).unwrap();
    setEditingId(undefined);
  };

  const handleDelete = async (id: Id): Promise<void> => {
    await deleteChecklist(id).unwrap();
  };

  // Story 21 — duplicate falls out cheaply from create: re-create the checklist
  // with id-less steps so the copy is an independent template.
  const handleDuplicate = async (checklist: Checklist): Promise<void> => {
    await createChecklist({
      rigId,
      name: `${checklist.name} (copy)`,
      tags: checklist.tags,
      steps: checklist.steps.map((step) => toStepInput(step)),
    }).unwrap();
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Checklists">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-brand dark:text-ink-inverted">
          Checklists
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
            Add checklist
          </button>
        )}
      </div>

      {adding ? (
        <ChecklistForm
          submitLabel="Add checklist"
          pending={isCreating}
          onSubmit={(values) => void handleCreate(values)}
          onCancel={() => {
            setAdding(false);
          }}
        />
      ) : undefined}

      {isLoading ? (
        <p className="text-brand-muted">Loading checklists…</p>
      ) : undefined}

      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn’t load checklists. Please try again.
        </p>
      ) : undefined}

      {!adding && checklists?.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          No checklists yet — add your first one for this rig.
        </p>
      ) : undefined}

      <ul className="flex flex-col gap-3">
        {checklists?.map((checklist) =>
          editingId === checklist.id ? (
            <li key={checklist.id}>
              <ChecklistForm
                initial={checklist}
                submitLabel="Save changes"
                pending={isUpdating}
                onSubmit={(values) => void handleUpdate(checklist.id, values)}
                onCancel={() => {
                  setEditingId(undefined);
                }}
              />
            </li>
          ) : (
            <li key={checklist.id}>
              <ChecklistCard
                checklist={checklist}
                onEdit={() => {
                  setAdding(false);
                  setEditingId(checklist.id);
                }}
                onDuplicate={() => void handleDuplicate(checklist)}
                onDelete={() => void handleDelete(checklist.id)}
              />
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

interface ChecklistCardProps {
  readonly checklist: Checklist;
  readonly onEdit: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}

function ChecklistCard({
  checklist,
  onEdit,
  onDuplicate,
  onDelete,
}: ChecklistCardProps): JSX.Element {
  const stepCount = checklist.steps.length;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-hairline p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold text-brand dark:text-ink-inverted">
            {checklist.name}
          </span>
          <span className="text-sm text-brand-muted">
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
          {checklist.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {checklist.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-hairline px-2 py-0.5 text-xs text-brand-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : undefined}
        </div>
      </div>
      <div className="flex gap-4 text-sm">
        <button
          type="button"
          onClick={onEdit}
          className="font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
        >
          Duplicate
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
