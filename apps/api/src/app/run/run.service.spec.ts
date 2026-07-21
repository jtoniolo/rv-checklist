import { BadRequestException, NotFoundException } from '@nestjs/common';
import type {
  Checklist,
  MaintenanceTask,
  Rig,
  Run,
  RunStep,
} from '@rv-checklist/domain';
import {
  InMemoryChecklistRepository,
  InMemoryLogEntryRepository,
  InMemoryMaintenanceTaskRepository,
  InMemoryRigRepository,
  InMemoryRunRepository,
} from '@rv-checklist/domain/testing';
import { Clock } from '../auth/clock.js';
import { RunService } from './run.service.js';

const alice = '550e8400-e29b-41d4-a716-446655440001';
const bob = '550e8400-e29b-41d4-a716-446655440002';
const aliceRigId = '550e8400-e29b-41d4-a716-446655440010';
const bobRigId = '550e8400-e29b-41d4-a716-446655440011';
const aliceChecklistId = '550e8400-e29b-41d4-a716-446655440020';
const bobChecklistId = '550e8400-e29b-41d4-a716-446655440021';
const stepA = '550e8400-e29b-41d4-a716-446655440030';
const stepB = '550e8400-e29b-41d4-a716-446655440031';

const aliceRig: Rig = {
  id: aliceRigId,
  ownerId: alice,
  nickname: 'Silver Bullet',
};
const bobRig: Rig = { id: bobRigId, ownerId: bob, nickname: 'Bob’s Rig' };

const aliceChecklist: Checklist = {
  id: aliceChecklistId,
  rigId: aliceRigId,
  name: 'Pre-departure',
  tags: ['procedure'],
  steps: [
    { id: stepA, text: 'Close roof vents' },
    {
      id: stepB,
      text: 'Fresh water level',
      fieldSchema: [
        { name: 'Level', type: 'number', required: true, unit: '%' },
      ],
    },
  ],
};

const bobChecklist: Checklist = {
  id: bobChecklistId,
  rigId: bobRigId,
  name: 'Bob’s list',
  tags: [],
  steps: [{ id: stepA, text: 'Do a thing' }],
};

// The task-linked fixtures (issue #18): a maintenance task with a required
// field, and a procedure checklist whose first step is linked to it.
const sealsTaskId = '550e8400-e29b-41d4-a716-446655440040';
const bobTaskId = '550e8400-e29b-41d4-a716-446655440041';
const sealsChecklistId = '550e8400-e29b-41d4-a716-446655440023';

const sealsTask: MaintenanceTask = {
  id: sealsTaskId,
  rigId: aliceRigId,
  name: 'Condition slide seals',
  interval: { months: 12 },
  fieldSchema: [
    { name: 'Product used', type: 'text', required: true },
    { name: 'Notes', type: 'note', required: false },
  ],
};
const bobTask: MaintenanceTask = {
  id: bobTaskId,
  rigId: bobRigId,
  name: 'Repack wheel bearings',
  fieldSchema: [],
};

const sealsChecklist: Checklist = {
  id: sealsChecklistId,
  rigId: aliceRigId,
  name: 'Spring opening',
  tags: ['procedure'],
  steps: [
    {
      id: '550e8400-e29b-41d4-a716-446655440032',
      text: 'Condition the slide seals',
      taskId: sealsTaskId,
    },
    { id: '550e8400-e29b-41d4-a716-446655440033', text: 'Sweep the roof' },
  ],
};

/** The run's steps with one step (found by text) patched. */
const patchStep = (
  run: Run,
  text: string,
  change: Partial<RunStep>,
): RunStep[] =>
  run.steps.map((s) => (s.text === text ? { ...s, ...change } : s));

/** The run's first task-linked step, if any. */
const taskStepOf = (run: Run): RunStep | undefined =>
  run.steps.find((s) => s.taskId !== undefined);

/** A clock frozen on a fixed occasion, so a server-dated run is deterministic. */
class FrozenClock extends Clock {
  now(): Date {
    return new Date('2026-07-21T12:00:00.000Z');
  }
}

async function makeService(): Promise<{
  service: RunService;
  runs: InMemoryRunRepository;
  checklists: InMemoryChecklistRepository;
  tasks: InMemoryMaintenanceTaskRepository;
  logEntries: InMemoryLogEntryRepository;
}> {
  const runs = new InMemoryRunRepository();
  const checklists = new InMemoryChecklistRepository();
  const rigs = new InMemoryRigRepository();
  const tasks = new InMemoryMaintenanceTaskRepository();
  const logEntries = new InMemoryLogEntryRepository();
  await rigs.save(aliceRig);
  await rigs.save(bobRig);
  await checklists.save(aliceChecklist);
  await checklists.save(bobChecklist);
  await checklists.save(sealsChecklist);
  await tasks.save(sealsTask);
  await tasks.save(bobTask);
  return {
    service: new RunService(
      runs,
      checklists,
      rigs,
      tasks,
      logEntries,
      new FrozenClock(),
    ),
    runs,
    checklists,
    tasks,
    logEntries,
  };
}

describe('RunService', () => {
  describe('create — a run is a dated copy of the checklist’s steps', () => {
    it('copies the steps, minting fresh incomplete step ids and dating the run', async () => {
      const { service } = await makeService();

      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      expect(run).toMatchObject({
        checklistId: aliceChecklistId,
        rigId: aliceRigId,
        startedOn: '2026-07-21',
      });
      expect(run.steps).toHaveLength(2);
      expect(run.steps[0]).toMatchObject({
        text: 'Close roof vents',
        state: 'incomplete',
      });
      // The copy carries the plain step's field schema…
      expect(run.steps[1]?.fieldSchema).toEqual([
        { name: 'Level', type: 'number', required: true, unit: '%' },
      ]);
      // …but no captured values yet, and no state is pre-filled.
      expect(run.steps[1]?.values).toBeUndefined();
      // Fresh, distinct step ids — the run's steps are its own (not the template's).
      const ids = run.steps.map((s) => s.id);
      expect(ids).not.toContain(stepA);
      expect(ids).not.toContain(stepB);
      expect(new Set(ids).size).toBe(2);
    });

    it('accepts an explicit occasion date', async () => {
      const { service } = await makeService();

      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
        startedOn: '2026-01-02',
      });

      expect(run.startedOn).toBe('2026-01-02');
    });

    it('is unaffected by a later edit to the checklist', async () => {
      const { service, checklists } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      // Rewrite the checklist entirely after the run started.
      await checklists.save({
        ...aliceChecklist,
        name: 'Rewritten',
        steps: [{ id: stepA, text: 'Something completely different' }],
      });

      const reloaded = await service.get(alice, run.id);
      expect(reloaded.steps).toHaveLength(2);
      expect(reloaded.steps[0]?.text).toBe('Close roof vents');
    });

    it('refuses to run a checklist on a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, { checklistId: bobChecklistId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound for a checklist that does not exist', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, { checklistId: aliceRigId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update — states transition freely and answers are captured', () => {
    it('moves a step incomplete → complete → skipped → incomplete', async () => {
      const { service } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });
      const setState = async (state: 'incomplete' | 'complete' | 'skipped') => {
        const current = await service.get(alice, run.id);
        return service.update(alice, run.id, {
          steps: current.steps.map((s, i) => (i === 0 ? { ...s, state } : s)),
        });
      };

      const completed = await setState('complete');
      expect(completed.steps[0]?.state).toBe('complete');
      const skipped = await setState('skipped');
      expect(skipped.steps[0]?.state).toBe('skipped');
      const reopened = await setState('incomplete');
      expect(reopened.steps[0]?.state).toBe('incomplete');
    });

    it('captures a plain step’s field values onto the run’s copy when completing it', async () => {
      const { service } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      const updated = await service.update(alice, run.id, {
        steps: run.steps.map((s, i) =>
          i === 1
            ? {
                ...s,
                state: 'complete',
                values: [{ name: 'Level', value: 80 }],
              }
            : s,
        ),
      });

      expect(updated.steps[1]).toMatchObject({
        state: 'complete',
        values: [{ name: 'Level', value: 80 }],
      });
      // The captured answer survives a reload — it's persisted on the run.
      const reloaded = await service.get(alice, run.id);
      expect(reloaded.steps[1]?.values).toEqual([{ name: 'Level', value: 80 }]);
    });

    it('can re-date the occasion after the fact', async () => {
      const { service } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      const updated = await service.update(alice, run.id, {
        startedOn: '2026-08-01',
      });

      expect(updated.startedOn).toBe('2026-08-01');
    });

    it('never changes which checklist or rig a run belongs to', async () => {
      const { service } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      const updated = await service.update(alice, run.id, {
        startedOn: '2026-08-01',
      });

      expect(updated.checklistId).toBe(aliceChecklistId);
      expect(updated.rigId).toBe(aliceRigId);
    });
  });

  // The T8 seam (issue #18): completing a task-linked step writes a Log Entry;
  // skipping writes nothing; the snapshot matches the task's fields at
  // completion time.
  describe('update — a task-linked step’s completion writes a Log Entry', () => {
    it('writes an entry snapshotting the task’s fields and the entered values, dated on the run’s occasion', async () => {
      const { service, logEntries } = await makeService();
      const run = await service.create(alice, {
        checklistId: sealsChecklistId,
        startedOn: '2026-05-01',
      });

      const updated = await service.update(alice, run.id, {
        steps: patchStep(run, 'Condition the slide seals', {
          state: 'complete',
          values: [{ name: 'Product used', value: '303 Protectant' }],
        }),
      });

      const entries = await logEntries.listByTask(sealsTaskId);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        taskId: sealsTaskId,
        rigId: aliceRigId,
        // The maintenance was performed on the run's occasion, not the day the
        // box happened to be ticked (a run stays correctable after the fact).
        performedOn: '2026-05-01',
        fields: [
          {
            name: 'Product used',
            type: 'text',
            required: true,
            value: '303 Protectant',
          },
          { name: 'Notes', type: 'note', required: false },
        ],
      });
      // The run's step remembers which entry its completion wrote.
      expect(taskStepOf(updated)?.logEntryId).toBe(entries[0]?.id);
    });

    it('records nothing when the task-linked step is skipped', async () => {
      const { service, logEntries } = await makeService();
      const run = await service.create(alice, {
        checklistId: sealsChecklistId,
      });

      await service.update(alice, run.id, {
        steps: patchStep(run, 'Condition the slide seals', {
          state: 'skipped',
        }),
      });

      expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(0);
    });

    it('records nothing when a plain step is completed', async () => {
      const { service, logEntries } = await makeService();
      const run = await service.create(alice, {
        checklistId: sealsChecklistId,
      });

      await service.update(alice, run.id, {
        steps: patchStep(run, 'Sweep the roof', { state: 'complete' }),
      });

      expect(await logEntries.listByRig(aliceRigId)).toHaveLength(0);
    });

    it('snapshots the task’s fields as they are at completion time, and a later task edit never rewrites the entry', async () => {
      const { service, tasks, logEntries } = await makeService();
      const run = await service.create(alice, {
        checklistId: sealsChecklistId,
      });

      // The task's fields change after the run started but before completion…
      await tasks.save({
        ...sealsTask,
        fieldSchema: [
          { name: 'Coats applied', type: 'number', required: false },
        ],
      });
      await service.update(alice, run.id, {
        steps: patchStep(run, 'Condition the slide seals', {
          state: 'complete',
          values: [{ name: 'Coats applied', value: 2 }],
        }),
      });

      // …so the entry snapshots the fields as they were when completed.
      const snapshot = [
        { name: 'Coats applied', type: 'number', required: false, value: 2 },
      ];
      const [written] = await logEntries.listByTask(sealsTaskId);
      expect(written?.fields).toEqual(snapshot);

      // A task edit after completion never rewrites the past entry.
      await tasks.save(sealsTask);
      const [afterEdit] = await logEntries.listByTask(sealsTaskId);
      expect(afterEdit?.fields).toEqual(snapshot);
    });

    it('writes no second entry when the run is saved again with the step still complete', async () => {
      const { service, logEntries } = await makeService();
      const run = await service.create(alice, {
        checklistId: sealsChecklistId,
      });
      const completed = await service.update(alice, run.id, {
        steps: patchStep(run, 'Condition the slide seals', {
          state: 'complete',
          values: [{ name: 'Product used', value: '303' }],
        }),
      });

      await service.update(alice, run.id, { steps: completed.steps });

      expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(1);
    });

    it('keeps the link server-owned: a client echo without it neither duplicates nor loses the entry', async () => {
      const { service, logEntries } = await makeService();
      const run = await service.create(alice, {
        checklistId: sealsChecklistId,
      });
      const completed = await service.update(alice, run.id, {
        steps: patchStep(run, 'Condition the slide seals', {
          state: 'complete',
          values: [{ name: 'Product used', value: '303' }],
        }),
      });

      // A stale client echoes the steps it has — without the server-assigned link.
      const echoed = await service.update(alice, run.id, {
        steps: completed.steps.map(({ logEntryId: _dropped, ...step }) => step),
      });

      const entries = await logEntries.listByTask(sealsTaskId);
      expect(entries).toHaveLength(1);
      expect(taskStepOf(echoed)?.logEntryId).toBe(entries[0]?.id);
    });

    it('ignores a client-forged link and still writes the real entry', async () => {
      const { service, logEntries } = await makeService();
      const run = await service.create(alice, {
        checklistId: sealsChecklistId,
      });
      const forged = '550e8400-e29b-41d4-a716-446655440099';

      const updated = await service.update(alice, run.id, {
        steps: patchStep(run, 'Condition the slide seals', {
          state: 'complete',
          values: [{ name: 'Product used', value: '303' }],
          logEntryId: forged,
        }),
      });

      const entries = await logEntries.listByTask(sealsTaskId);
      expect(entries).toHaveLength(1);
      expect(taskStepOf(updated)?.logEntryId).toBe(entries[0]?.id);
      expect(taskStepOf(updated)?.logEntryId).not.toBe(forged);
    });

    it('deletes the entry it wrote when the step is un-completed, and a re-completion writes a fresh one', async () => {
      const { service, logEntries } = await makeService();
      const run = await service.create(alice, {
        checklistId: sealsChecklistId,
      });
      const completed = await service.update(alice, run.id, {
        steps: patchStep(run, 'Condition the slide seals', {
          state: 'complete',
          values: [{ name: 'Product used', value: '303' }],
        }),
      });
      const [first] = await logEntries.listByTask(sealsTaskId);

      const reopened = await service.update(alice, run.id, {
        steps: patchStep(completed, 'Condition the slide seals', {
          state: 'incomplete',
        }),
      });
      expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(0);
      expect(taskStepOf(reopened)?.logEntryId).toBeUndefined();

      await service.update(alice, run.id, {
        steps: patchStep(reopened, 'Condition the slide seals', {
          state: 'complete',
          values: [{ name: 'Product used', value: 'Slide-out lube' }],
        }),
      });
      const entries = await logEntries.listByTask(sealsTaskId);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.id).not.toBe(first?.id);
    });

    it('deletes the entry when a mistaken completion is changed to skipped — skipping never falsely logs', async () => {
      const { service, logEntries } = await makeService();
      const run = await service.create(alice, {
        checklistId: sealsChecklistId,
      });
      const completed = await service.update(alice, run.id, {
        steps: patchStep(run, 'Condition the slide seals', {
          state: 'complete',
          values: [{ name: 'Product used', value: '303' }],
        }),
      });

      await service.update(alice, run.id, {
        steps: patchStep(completed, 'Condition the slide seals', {
          state: 'skipped',
        }),
      });

      expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(0);
    });

    it('rejects a completion missing a required field value, writing nothing', async () => {
      const { service, logEntries } = await makeService();
      const run = await service.create(alice, {
        checklistId: sealsChecklistId,
      });

      await expect(
        service.update(alice, run.id, {
          steps: patchStep(run, 'Condition the slide seals', {
            state: 'complete',
          }),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(0);
      const reloaded = await service.get(alice, run.id);
      expect(taskStepOf(reloaded)?.state).toBe('incomplete');
    });

    it('completes without logging when the linked task no longer exists', async () => {
      const { service, tasks, logEntries } = await makeService();
      const run = await service.create(alice, {
        checklistId: sealsChecklistId,
      });
      await tasks.delete(sealsTaskId);

      const updated = await service.update(alice, run.id, {
        steps: patchStep(run, 'Condition the slide seals', {
          state: 'complete',
        }),
      });

      expect(taskStepOf(updated)?.state).toBe('complete');
      expect(await logEntries.listByRig(aliceRigId)).toHaveLength(0);
    });

    it('never logs against a task on someone else’s rig', async () => {
      const { service, checklists, logEntries } = await makeService();
      await checklists.save({
        id: '550e8400-e29b-41d4-a716-446655440024',
        rigId: aliceRigId,
        name: 'Sneaky',
        tags: [],
        steps: [
          {
            id: '550e8400-e29b-41d4-a716-446655440034',
            text: 'Poke Bob’s bearings',
            taskId: bobTaskId,
          },
        ],
      });
      const run = await service.create(alice, {
        checklistId: '550e8400-e29b-41d4-a716-446655440024',
      });

      const updated = await service.update(alice, run.id, {
        steps: patchStep(run, 'Poke Bob’s bearings', { state: 'complete' }),
      });

      expect(updated.steps[0]?.state).toBe('complete');
      expect(await logEntries.listByTask(bobTaskId)).toHaveLength(0);
    });

    it('logs an entry from each run when the same task is referenced from steps on two checklists', async () => {
      const { service, checklists, logEntries } = await makeService();
      await checklists.save({
        id: '550e8400-e29b-41d4-a716-446655440025',
        rigId: aliceRigId,
        name: 'Fall closing',
        tags: [],
        steps: [
          {
            id: '550e8400-e29b-41d4-a716-446655440035',
            text: 'Condition the seals before storage',
            taskId: sealsTaskId,
          },
        ],
      });

      const springRun = await service.create(alice, {
        checklistId: sealsChecklistId,
      });
      await service.update(alice, springRun.id, {
        steps: patchStep(springRun, 'Condition the slide seals', {
          state: 'complete',
          values: [{ name: 'Product used', value: '303' }],
        }),
      });
      const fallRun = await service.create(alice, {
        checklistId: '550e8400-e29b-41d4-a716-446655440025',
      });
      await service.update(alice, fallRun.id, {
        steps: patchStep(fallRun, 'Condition the seals before storage', {
          state: 'complete',
          values: [{ name: 'Product used', value: '303' }],
        }),
      });

      expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(2);
    });
  });

  describe('list — past runs of a checklist', () => {
    it('returns the runs of the owner’s checklist', async () => {
      const { service } = await makeService();
      await service.create(alice, { checklistId: aliceChecklistId });
      await service.create(alice, { checklistId: aliceChecklistId });

      const runs = await service.listByChecklist(alice, aliceChecklistId);

      expect(runs).toHaveLength(2);
    });

    it('refuses to list runs of a checklist the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.listByChecklist(alice, bobChecklistId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list — runs across a rig (the home summary read, issue #22)', () => {
    it('returns every run on the owner’s rig, across its checklists', async () => {
      const { service, checklists } = await makeService();
      const secondChecklist: Checklist = {
        ...aliceChecklist,
        id: '550e8400-e29b-41d4-a716-446655440022',
        name: 'Spring opening',
      };
      await checklists.save(secondChecklist);
      await service.create(alice, { checklistId: aliceChecklistId });
      await service.create(alice, { checklistId: secondChecklist.id });

      const runs = await service.listByRig(alice, aliceRigId);

      expect(runs).toHaveLength(2);
      expect(new Set(runs.map((run) => run.checklistId))).toEqual(
        new Set([aliceChecklistId, secondChecklist.id]),
      );
    });

    it('refuses to list runs of a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(service.listByRig(alice, bobRigId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('removes a run started by mistake', async () => {
      const { service } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      await service.remove(alice, run.id);

      await expect(service.get(alice, run.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // The row-level ownership guarantee (ADR-0003), proven at the use-case seam.
  // A run is owned via its rig, so isolation follows rig ownership.
  describe('owner isolation', () => {
    it('never lets another owner read, edit, or delete a run', async () => {
      const { service } = await makeService();
      const aliceRun = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      await expect(service.get(bob, aliceRun.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.update(bob, aliceRun.id, { startedOn: '2026-08-01' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(bob, aliceRun.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      // Alice's run is untouched by Bob's attempts.
      await expect(service.get(alice, aliceRun.id)).resolves.toEqual(aliceRun);
    });
  });
});
