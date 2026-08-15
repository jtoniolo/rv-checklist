'use client';

import {
  type Checklist,
  type Id,
  type MaintenanceTask,
  type Step,
  type StepInput,
} from '@rv-checklist/domain';
import {
  useCreateChecklistMutation,
  useDeleteChecklistMutation,
  useListChecklistsQuery,
  useListTasksQuery,
  useUpdateChecklistMutation,
} from '@rv-checklist/web-data-access';
import { BackLink, TagChip } from '@rv-checklist/web-ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';
import {
  ChecklistForm,
  type ChecklistFormValues,
} from '../../../../checklist-form';
import { RunHistory } from '../../../../run-history';

function toStepInput(step: Step): StepInput {
  return {
    text: step.text,
    ...(step.taskId && { taskId: step.taskId }),
    ...(step.fieldSchema && { fieldSchema: step.fieldSchema }),
  };
}

export function ChecklistDetailView({
  rigId,
  checklistId,
}: {
  readonly rigId: Id;
  readonly checklistId: Id;
}): JSX.Element {
  const router = useRouter();
  const { data: checklists } = useListChecklistsQuery(rigId);
  const { data: rigTasks } = useListTasksQuery(rigId);
  const [updateChecklist, { isLoading: isUpdating }] =
    useUpdateChecklistMutation();
  const [createChecklist] = useCreateChecklistMutation();
  const [deleteChecklist] = useDeleteChecklistMutation();

  const [editing, setEditing] = useState(false);

  const checklist = checklists?.find((c) => c.id === checklistId);

  if (!checklist) {
    return <p className="text-brand-muted">Loading checklist…</p>;
  }

  if (editing) {
    const handleUpdate = async (values: ChecklistFormValues): Promise<void> => {
      await updateChecklist({ id: checklistId, changes: values }).unwrap();
      setEditing(false);
    };

    return (
      <div className="flex flex-col gap-4">
        <BackLink
          label="&#8249; All checklists"
          onClick={() => {
            setEditing(false);
            router.push(`/rig/${rigId}/checklists`);
          }}
        />
        <ChecklistForm
          initial={checklist}
          tasks={rigTasks ?? []}
          submitLabel="Save changes"
          pending={isUpdating}
          onSubmit={(values) => void handleUpdate(values)}
          onCancel={() => {
            setEditing(false);
          }}
        />
      </div>
    );
  }

  const handleDuplicate = async (): Promise<void> => {
    const copy = await createChecklist({
      rigId,
      name: `${checklist.name} (copy)`,
      tags: checklist.tags,
      steps: checklist.steps.map((step) => toStepInput(step)),
    }).unwrap();
    router.push(`/rig/${rigId}/checklists/${copy.id}`);
  };

  const handleDelete = async (): Promise<void> => {
    await deleteChecklist(checklistId).unwrap();
    router.push(`/rig/${rigId}/checklists`);
  };

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/rig/${rigId}/checklists`}
        className="self-start text-sm font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
      >
        &#8249; All checklists
      </Link>
      <ChecklistDetail
        checklist={checklist}
        rigId={rigId}
        tasks={rigTasks ?? []}
        onEdit={() => {
          setEditing(true);
        }}
        onDuplicate={() => void handleDuplicate()}
        onDelete={() => void handleDelete()}
      />
    </div>
  );
}

function ChecklistDetail({
  checklist,
  rigId,
  tasks,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  readonly checklist: Checklist;
  readonly rigId: Id;
  readonly tasks: readonly MaintenanceTask[];
  readonly onEdit: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
}): JSX.Element {
  const stepCount = checklist.steps.length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight text-brand dark:text-ink-inverted">
          {checklist.name}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm text-brand-muted">
          <span>
            {stepCount} {stepCount === 1 ? 'step' : 'steps'}
          </span>
          {checklist.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
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

      {stepCount > 0 ? (
        <ol className="overflow-hidden rounded-xl border border-hairline">
          {checklist.steps.map((step, i) => (
            <li
              key={step.id}
              className={`px-4 py-2.5 text-sm text-brand dark:text-ink-inverted ${
                i > 0 ? 'border-t border-hairline' : ''
              }`}
            >
              {step.text}
              {step.taskId ? (
                <span className="ml-2 text-xs text-brand-muted">
                  &#9881;{' '}
                  {tasks.find((t) => t.id === step.taskId)?.name ??
                    'logs maintenance'}
                </span>
              ) : undefined}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          No steps yet — edit the checklist to add some.
        </p>
      )}

      <RunHistory checklist={checklist} rigId={rigId} />
    </div>
  );
}
