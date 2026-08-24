import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type {
  Checklist,
  LogEntry,
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
  InMemoryTripRepository,
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
  tags: [],
};
const bobTask: MaintenanceTask = {
  id: bobTaskId,
  rigId: bobRigId,
  name: 'Repack wheel bearings',
  fieldSchema: [],
  tags: [],
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

// The trip fixtures (issue #111): a run may link to one of the rig's trips.
// Alice's second rig carries a trip of its own, to prove a trip link cannot
// cross rigs even within one owner.
const aliceTripId = '550e8400-e29b-41d4-a716-446655440050';
const bobTripId = '550e8400-e29b-41d4-a716-446655440051';
const aliceOtherRigId = '550e8400-e29b-41d4-a716-446655440012';
const aliceOtherTripId = '550e8400-e29b-41d4-a716-446655440052';

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
  const trips = new InMemoryTripRepository();
  await rigs.save(aliceRig);
  await rigs.save(bobRig);
  await checklists.save(aliceChecklist);
  await checklists.save(bobChecklist);
  await checklists.save(sealsChecklist);
  await tasks.save(sealsTask);
  await tasks.save(bobTask);
  await trips.save({
    id: aliceTripId,
    rigId: aliceRigId,
    name: 'Fall colours loop',
    checklistIds: [],
  });
  await trips.save({
    id: bobTripId,
    rigId: bobRigId,
    name: 'Bob’s trip',
    checklistIds: [],
  });
  await rigs.save({
    id: aliceOtherRigId,
    ownerId: alice,
    nickname: 'Backup Rig',
  });
  await trips.save({
    id: aliceOtherTripId,
    rigId: aliceOtherRigId,
    name: 'Other rig’s trip',
    checklistIds: [],
  });
  return {
    service: new RunService(
      runs,
      checklists,
      rigs,
      tasks,
      logEntries,
      trips,
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
        // The entry snapshots the task's name at completion time (issue #27).
        taskName: 'Condition slide seals',
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

    // The link is no longer server-*only* (ADR-0030): a client may name an entry it
    // authored. What survives from #18 is that a link already stored always wins, so
    // neither dropping it nor forging one can duplicate or detach an entry.
    it('keeps a stored link when a client echo drops it — neither duplicating nor losing the entry', async () => {
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

    it('ignores a link naming an entry that does not exist and still writes the real one', async () => {
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

describe('RunService — trip link (issue #111)', () => {
  it('creates a run linked to one of the rig’s trips', async () => {
    const { service } = await makeService();

    const run = await service.create(alice, {
      checklistId: aliceChecklistId,
      tripId: aliceTripId,
    });

    expect(run.tripId).toBe(aliceTripId);
  });

  it('rejects a trip the owner does not own as NotFound', async () => {
    const { service } = await makeService();

    await expect(
      service.create(alice, {
        checklistId: aliceChecklistId,
        tripId: bobTripId,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a same-owner trip on a different rig than the checklist as BadRequest', async () => {
    const { service } = await makeService();

    await expect(
      service.create(alice, {
        checklistId: aliceChecklistId,
        tripId: aliceOtherTripId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists the runs of one of the owner’s trips', async () => {
    const { service } = await makeService();
    const linked = await service.create(alice, {
      checklistId: aliceChecklistId,
      tripId: aliceTripId,
    });
    await service.create(alice, { checklistId: aliceChecklistId });

    const runs = await service.listByTrip(alice, aliceTripId);

    expect(runs.map((r) => r.id)).toEqual([linked.id]);
  });

  it('refuses to list the runs of a trip the owner does not own', async () => {
    const { service } = await makeService();

    await expect(service.listByTrip(alice, bobTripId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// LWW stamps (issue #141): clearly older / newer than any record the test just wrote.
const staleStamp = (): Date => new Date(Date.now() - 60_000);
const newerStamp = (): Date => new Date(Date.now() + 60_000);

describe('RunService update under LWW — X-Edited-At (ADR-0028, issue #141)', () => {
  it('a stale stamp is a full no-op: run kept, no Log Entry written', async () => {
    const { service, logEntries } = await makeService();
    const run = await service.create(alice, { checklistId: sealsChecklistId });

    const result = await service.update(
      alice,
      run.id,
      {
        steps: patchStep(run, 'Condition the slide seals', {
          state: 'complete',
          values: [{ name: 'Product used', value: '303 Protectant' }],
        }),
      },
      staleStamp(),
    );

    // The current record comes back as a normal success — never an error.
    expect(taskStepOf(result)?.state).toBe('incomplete');
    expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(0);
  });

  it('a stale un-complete echo deletes no Log Entry', async () => {
    const { service, logEntries } = await makeService();
    const run = await service.create(alice, { checklistId: sealsChecklistId });
    const completed = await service.update(alice, run.id, {
      steps: patchStep(run, 'Condition the slide seals', {
        state: 'complete',
        values: [{ name: 'Product used', value: '303 Protectant' }],
      }),
    });
    expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(1);

    const result = await service.update(
      alice,
      run.id,
      {
        steps: patchStep(completed, 'Condition the slide seals', {
          state: 'incomplete',
        }),
      },
      staleStamp(),
    );

    expect(taskStepOf(result)?.state).toBe('complete');
    expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(1);
  });

  it('a newer stamp applies the whole run write, Log Entry included', async () => {
    const { service, logEntries } = await makeService();
    const run = await service.create(alice, { checklistId: sealsChecklistId });

    const result = await service.update(
      alice,
      run.id,
      {
        steps: patchStep(run, 'Condition the slide seals', {
          state: 'complete',
          values: [{ name: 'Product used', value: '303 Protectant' }],
        }),
      },
      newerStamp(),
    );

    const entries = await logEntries.listByTask(sealsTaskId);
    expect(entries).toHaveLength(1);
    expect(taskStepOf(result)?.logEntryId).toBe(entries[0]?.id);
  });

  // Client-generated ids (ADR-0028, issue #143). Run *step* ids stay server-
  // minted here; per-step client ids ride with issue #144.
  describe('create with a client-generated id', () => {
    const clientId = '550e8400-e29b-41d4-a716-446655440077';

    it('creates under the supplied id, still minting the step ids', async () => {
      const { service } = await makeService();

      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
        id: clientId,
      });

      expect(run.id).toBe(clientId);
      for (const step of run.steps) {
        expect(step.id).toEqual(expect.any(String));
        expect(step.id).not.toBe(clientId);
      }
    });

    it('treats a re-post as success, leaving one run on the checklist', async () => {
      const { service } = await makeService();
      const body = { checklistId: aliceChecklistId, id: clientId };
      await service.create(alice, body);

      const replayed = await service.create(alice, body);

      expect(replayed.id).toBe(clientId);
      await expect(
        service.listByChecklist(alice, aliceChecklistId),
      ).resolves.toHaveLength(1);
    });

    it('never adopts a run on another owner’s checklist', async () => {
      const { service, runs } = await makeService();
      await service.create(bob, { checklistId: bobChecklistId, id: clientId });

      await expect(
        service.create(alice, { checklistId: aliceChecklistId, id: clientId }),
      ).rejects.toThrow(NotFoundException);
      await expect(runs.findById(clientId)).resolves.toMatchObject({
        checklistId: bobChecklistId,
      });
      await expect(
        service.listByChecklist(alice, aliceChecklistId),
      ).resolves.toEqual([]);
    });

    it('initialises the run’s edit time from X-Edited-At', async () => {
      const { service, runs } = await makeService();
      const stamp = new Date(Date.now() - 60_000);

      await service.create(
        alice,
        { checklistId: aliceChecklistId, id: clientId },
        stamp,
      );

      expect(runs.editedAtOf(clientId)).toEqual(stamp);
    });
  });
});

/**
 * Per-step operations (ADR-0030, issue #144) — the offline surface this ticket exists for.
 * Every run here is created with a stamp a minute in the past, so the steps start with a
 * clock the tests' own readings can be newer than; readings are expressed as "so many
 * milliseconds ago" for the same reason, since a future one would be clamped to now.
 */
/** A run create stamp comfortably older than any reading a step-op test uses. */
const createdAt = (): Date => new Date(Date.now() - 60_000);

/** A client clock reading so many milliseconds ago — never ahead, which would be clamped. */
const at = (msAgo: number): string =>
  new Date(Date.now() - msAgo).toISOString();

/** The id of the created run's own copy of a step, found by its text. */
const stepIdOf = (run: Run, text: string): string =>
  run.steps.find((s) => s.text === text)?.id ?? 'no such step';

/** The state of the run's own copy of a step, found by its text. */
const stateOf = (run: Run, text: string): string | undefined =>
  run.steps.find((s) => s.text === text)?.state;

describe('RunService step operations (ADR-0030, issue #144)', () => {
  const SEALS = 'Condition the slide seals';
  const ROOF = 'Sweep the roof';
  const VENTS = 'Close roof vents';
  const WATER = 'Fresh water level';

  describe('two devices, two different steps — the case record-level LWW loses', () => {
    // The acceptance criterion, run both ways round: the queues drain in whichever
    // order the network gives, and neither ordering may cost the other its work.
    const bothOrders: readonly [string, boolean][] = [
      ['phone first', false],
      ['tablet first', true],
    ];

    it.each(bothOrders)(
      'keeps both completions when they land %s',
      async (_label, tabletFirst) => {
        const { service } = await makeService();
        const run = await service.create(
          alice,
          { checklistId: aliceChecklistId },
          createdAt(),
        );
        const phone = {
          stepId: stepIdOf(run, VENTS),
          state: 'complete' as const,
          editedAt: at(30_000),
        };
        const tablet = {
          stepId: stepIdOf(run, WATER),
          state: 'complete' as const,
          editedAt: at(20_000),
        };

        const [first, second] = tabletFirst ? [tablet, phone] : [phone, tablet];
        await service.applyStepOps(alice, run.id, [first]);
        const merged = await service.applyStepOps(alice, run.id, [second]);

        expect(stateOf(merged, VENTS)).toBe('complete');
        expect(stateOf(merged, WATER)).toBe('complete');
      },
    );

    it('merges a whole batch in one request', async () => {
      const { service } = await makeService();
      const run = await service.create(
        alice,
        { checklistId: aliceChecklistId },
        createdAt(),
      );

      const merged = await service.applyStepOps(alice, run.id, [
        {
          stepId: stepIdOf(run, VENTS),
          state: 'complete',
          editedAt: at(30_000),
        },
        {
          stepId: stepIdOf(run, WATER),
          state: 'skipped',
          editedAt: at(29_000),
        },
      ]);

      expect(stateOf(merged, VENTS)).toBe('complete');
      expect(stateOf(merged, WATER)).toBe('skipped');
    });
  });

  describe('the same step on two devices — newest wins', () => {
    const bothOrders: readonly [string, boolean][] = [
      ['the newer op last', false],
      ['the newer op first', true],
    ];

    it.each(bothOrders)(
      'resolves to the newer reading with %s',
      async (_label, newerFirst) => {
        const { service } = await makeService();
        const run = await service.create(
          alice,
          { checklistId: aliceChecklistId },
          createdAt(),
        );
        const stepId = stepIdOf(run, VENTS);
        const older = {
          stepId,
          state: 'complete' as const,
          editedAt: at(30_000),
        };
        const newer = {
          stepId,
          state: 'skipped' as const,
          editedAt: at(20_000),
        };

        const [first, second] = newerFirst ? [newer, older] : [older, newer];
        await service.applyStepOps(alice, run.id, [first]);
        const settled = await service.applyStepOps(alice, run.id, [second]);

        expect(stateOf(settled, VENTS)).toBe('skipped');
      },
    );

    it('clamps a reading from a device whose clock runs fast, so it cannot veto later edits', async () => {
      const { service } = await makeService();
      const run = await service.create(
        alice,
        { checklistId: aliceChecklistId },
        createdAt(),
      );
      const stepId = stepIdOf(run, VENTS);

      await service.applyStepOps(alice, run.id, [
        {
          stepId,
          state: 'complete',
          editedAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      ]);
      // An honest reading from a minute ago would lose to tomorrow, but not to now.
      const corrected = await service.applyStepOps(alice, run.id, [
        { stepId, state: 'skipped' },
      ]);

      expect(stateOf(corrected, VENTS)).toBe('skipped');
    });
  });

  describe('what an operation leaves alone', () => {
    it('captures values without moving the step’s state', async () => {
      const { service } = await makeService();
      const run = await service.create(
        alice,
        { checklistId: aliceChecklistId },
        createdAt(),
      );
      const stepId = stepIdOf(run, WATER);
      await service.applyStepOps(alice, run.id, [
        { stepId, state: 'complete', editedAt: at(30_000) },
      ]);

      const updated = await service.applyStepOps(alice, run.id, [
        {
          stepId,
          values: [{ name: 'Level', value: 80 }],
          editedAt: at(20_000),
        },
      ]);

      expect(updated.steps.find((s) => s.id === stepId)).toMatchObject({
        state: 'complete',
        values: [{ name: 'Level', value: 80 }],
      });
    });

    it('leaves every untouched step exactly as it was', async () => {
      const { service } = await makeService();
      const run = await service.create(
        alice,
        { checklistId: aliceChecklistId },
        createdAt(),
      );
      const untouched = run.steps.find((s) => s.text === WATER);

      const merged = await service.applyStepOps(alice, run.id, [
        {
          stepId: stepIdOf(run, VENTS),
          state: 'complete',
          editedAt: at(30_000),
        },
      ]);

      expect(merged.steps.find((s) => s.text === WATER)).toEqual(untouched);
    });

    it('rejects an op naming a step the run does not have — a bug no retry can fix', async () => {
      const { service } = await makeService();
      const run = await service.create(
        alice,
        { checklistId: aliceChecklistId },
        createdAt(),
      );

      await expect(
        service.applyStepOps(alice, run.id, [
          {
            stepId: '550e8400-e29b-41d4-a716-4466554400ff',
            state: 'complete',
            editedAt: at(30_000),
          },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('never touches another owner’s run', async () => {
      const { service } = await makeService();
      const run = await service.create(bob, { checklistId: bobChecklistId });

      await expect(
        service.applyStepOps(alice, run.id, [
          { stepId: run.steps[0]?.id ?? '', state: 'complete' },
        ]),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('a client-authored Log Entry (the offline task-linked completion)', () => {
    const clientEntryId = '550e8400-e29b-41d4-a716-446655440088';

    /** The entry an offline client wrote for itself before queuing the step op. */
    const clientEntry = (over: Partial<LogEntry> = {}): LogEntry => ({
      id: clientEntryId,
      taskId: sealsTaskId,
      rigId: aliceRigId,
      taskName: 'Condition slide seals',
      // Dated the day the work was really done, not the day the queue drained —
      // this is what makes due status correct after an offline stretch.
      performedOn: '2026-07-01',
      fields: [
        { name: 'Product used', type: 'text', required: true, value: '303' },
        { name: 'Notes', type: 'note', required: false },
      ],
      ...over,
    });

    it('adopts the client’s entry instead of writing a second one, and a replay adds none', async () => {
      const { service, logEntries } = await makeService();
      await logEntries.save(clientEntry());
      const run = await service.create(
        alice,
        { checklistId: sealsChecklistId },
        createdAt(),
      );
      const op = {
        stepId: stepIdOf(run, SEALS),
        state: 'complete' as const,
        values: [{ name: 'Product used', value: '303' }],
        logEntryId: clientEntryId,
        editedAt: at(30_000),
      };

      const completed = await service.applyStepOps(alice, run.id, [op]);
      const replayed = await service.applyStepOps(alice, run.id, [op]);

      const entries = await logEntries.listByTask(sealsTaskId);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.performedOn).toBe('2026-07-01');
      expect(taskStepOf(completed)?.logEntryId).toBe(clientEntryId);
      expect(taskStepOf(replayed)?.logEntryId).toBe(clientEntryId);
    });

    it('deletes the adopted entry when the completion is undone', async () => {
      const { service, logEntries } = await makeService();
      await logEntries.save(clientEntry());
      const run = await service.create(
        alice,
        { checklistId: sealsChecklistId },
        createdAt(),
      );
      const stepId = stepIdOf(run, SEALS);
      await service.applyStepOps(alice, run.id, [
        {
          stepId,
          state: 'complete',
          values: [{ name: 'Product used', value: '303' }],
          logEntryId: clientEntryId,
          editedAt: at(30_000),
        },
      ]);

      const reopened = await service.applyStepOps(alice, run.id, [
        { stepId, state: 'incomplete', editedAt: at(20_000) },
      ]);

      expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(0);
      expect(taskStepOf(reopened)?.logEntryId).toBeUndefined();
    });

    it('adopts an orphaned entry, the shape a completed one-time task leaves behind', async () => {
      const { service, logEntries } = await makeService();
      // eslint-disable-next-line unicorn/no-null
      await logEntries.save(clientEntry({ taskId: null }));
      const run = await service.create(
        alice,
        { checklistId: sealsChecklistId },
        createdAt(),
      );

      const completed = await service.applyStepOps(alice, run.id, [
        {
          stepId: stepIdOf(run, SEALS),
          state: 'complete',
          values: [{ name: 'Product used', value: '303' }],
          logEntryId: clientEntryId,
          editedAt: at(30_000),
        },
      ]);

      expect(taskStepOf(completed)?.logEntryId).toBe(clientEntryId);
    });

    it('keeps a link named earlier in the batch when a later op only captures values', async () => {
      const { service, logEntries } = await makeService();
      await logEntries.save(clientEntry());
      const run = await service.create(
        alice,
        { checklistId: sealsChecklistId },
        createdAt(),
      );
      const stepId = stepIdOf(run, SEALS);

      const completed = await service.applyStepOps(alice, run.id, [
        {
          stepId,
          state: 'complete',
          logEntryId: clientEntryId,
          editedAt: at(30_000),
        },
        {
          stepId,
          values: [{ name: 'Product used', value: '303' }],
          editedAt: at(29_000),
        },
      ]);

      expect(taskStepOf(completed)?.logEntryId).toBe(clientEntryId);
      expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(1);
    });

    it('adopts the entry as it stands, without re-checking the step against the task’s current fields', async () => {
      const { service, logEntries } = await makeService();
      await logEntries.save(clientEntry());
      const run = await service.create(
        alice,
        { checklistId: sealsChecklistId },
        createdAt(),
      );

      // The values live on the entry the client already wrote; the op need not repeat
      // them, and a completion made under an older schema must not be rejected here.
      const completed = await service.applyStepOps(alice, run.id, [
        {
          stepId: stepIdOf(run, SEALS),
          state: 'complete',
          logEntryId: clientEntryId,
          editedAt: at(30_000),
        },
      ]);

      expect(taskStepOf(completed)?.logEntryId).toBe(clientEntryId);
      expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(1);
    });
  });

  describe('a link the client has no business naming', () => {
    const forgedId = '550e8400-e29b-41d4-a716-446655440099';

    /** Complete the task-linked step, claiming `forgedId` as its entry. */
    const completeClaiming = async (
      service: RunService,
      runId: string,
      stepId: string,
    ): Promise<Run> =>
      service.applyStepOps(alice, runId, [
        {
          stepId,
          state: 'complete',
          values: [{ name: 'Product used', value: '303' }],
          logEntryId: forgedId,
          editedAt: at(30_000),
        },
      ]);

    it('refuses an entry on another owner’s rig, writing its own instead', async () => {
      const { service, logEntries } = await makeService();
      await logEntries.save({
        id: forgedId,
        taskId: bobTaskId,
        rigId: bobRigId,
        taskName: 'Repack wheel bearings',
        performedOn: '2026-07-01',
        fields: [],
      });
      const run = await service.create(
        alice,
        { checklistId: sealsChecklistId },
        createdAt(),
      );

      const completed = await completeClaiming(
        service,
        run.id,
        stepIdOf(run, SEALS),
      );

      const link = taskStepOf(completed)?.logEntryId;
      expect(link).not.toBe(forgedId);
      // Bob's entry is neither adopted, relabelled, nor exposed.
      await expect(logEntries.listByTask(bobTaskId)).resolves.toHaveLength(1);
      const written = await logEntries.listByTask(sealsTaskId);
      expect(written).toHaveLength(1);
      expect(written[0]?.id).toBe(link);
      expect(written[0]?.rigId).toBe(aliceRigId);
    });

    it('refuses an entry of a different task, even one of the owner’s own', async () => {
      const { service, logEntries, tasks } = await makeService();
      const otherTaskId = '550e8400-e29b-41d4-a716-446655440042';
      await tasks.save({
        id: otherTaskId,
        rigId: aliceRigId,
        name: 'Flush the water heater',
        fieldSchema: [],
        tags: [],
      });
      await logEntries.save({
        id: forgedId,
        taskId: otherTaskId,
        rigId: aliceRigId,
        taskName: 'Flush the water heater',
        performedOn: '2026-07-01',
        fields: [],
      });
      const run = await service.create(
        alice,
        { checklistId: sealsChecklistId },
        createdAt(),
      );

      const completed = await completeClaiming(
        service,
        run.id,
        stepIdOf(run, SEALS),
      );

      expect(taskStepOf(completed)?.logEntryId).not.toBe(forgedId);
      // The other task's history is untouched — no work is cross-filed onto it.
      await expect(logEntries.listByTask(otherTaskId)).resolves.toHaveLength(1);
      await expect(logEntries.listByTask(sealsTaskId)).resolves.toHaveLength(1);
    });

    it('cannot detach an entry by claiming it on a step that never wrote it', async () => {
      const { service, logEntries } = await makeService();
      const run = await service.create(
        alice,
        { checklistId: sealsChecklistId },
        createdAt(),
      );
      const completed = await service.applyStepOps(alice, run.id, [
        {
          stepId: stepIdOf(run, SEALS),
          state: 'complete',
          values: [{ name: 'Product used', value: '303' }],
          editedAt: at(40_000),
        },
      ]);
      const realId = taskStepOf(completed)?.logEntryId;

      // A plain step claims the entry the task-linked one wrote, then un-completes.
      const roofId = stepIdOf(run, ROOF);
      await service.applyStepOps(alice, run.id, [
        {
          stepId: roofId,
          state: 'complete',
          logEntryId: realId,
          editedAt: at(30_000),
        },
      ]);
      await service.applyStepOps(alice, run.id, [
        { stepId: roofId, state: 'incomplete', editedAt: at(20_000) },
      ]);

      const entries = await logEntries.listByTask(sealsTaskId);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.id).toBe(realId);
    });
  });

  describe('losing the compare-and-set', () => {
    it('re-merges against what landed instead of overwriting it', async () => {
      const { service, runs } = await makeService();
      const run = await service.create(
        alice,
        { checklistId: aliceChecklistId },
        createdAt(),
      );
      const real = runs.saveStepsIfUnchanged.bind(runs);
      // The first attempt loses the race to a merge that completed the *other*
      // step — the exact collision this ticket exists to survive.
      const other = stepIdOf(run, WATER);
      let isRaced = false;
      jest
        .spyOn(runs, 'saveStepsIfUnchanged')
        .mockImplementation(async (id, steps, expected) => {
          if (!isRaced) {
            isRaced = true;
            const current = await runs.findById(id);
            await real(
              id,
              (current?.steps ?? []).map((s) =>
                s.id === other ? { ...s, state: 'complete' as const } : s,
              ),
              current?.steps ?? [],
            );
            const landed = await runs.findById(id);
            if (landed === undefined) {
              throw new Error('the run vanished mid-race');
            }
            return { applied: false, record: landed };
          }
          return real(id, steps, expected);
        });

      const merged = await service.applyStepOps(alice, run.id, [
        {
          stepId: stepIdOf(run, VENTS),
          state: 'complete',
          editedAt: at(30_000),
        },
      ]);

      expect(stateOf(merged, VENTS)).toBe('complete');
      expect(stateOf(merged, WATER)).toBe('complete');
      jest.restoreAllMocks();
    });

    it('writes no Log Entry for a round that never landed', async () => {
      const { service, runs, logEntries } = await makeService();
      const run = await service.create(
        alice,
        { checklistId: sealsChecklistId },
        createdAt(),
      );
      jest
        .spyOn(runs, 'saveStepsIfUnchanged')
        .mockResolvedValue({ applied: false, record: run });

      await expect(
        service.applyStepOps(alice, run.id, [
          {
            stepId: stepIdOf(run, SEALS),
            state: 'complete',
            values: [{ name: 'Product used', value: '303' }],
            editedAt: at(30_000),
          },
        ]),
      ).rejects.toThrow(ConflictException);

      expect(await logEntries.listByTask(sealsTaskId)).toHaveLength(0);
      jest.restoreAllMocks();
    });
  });

  describe('step work and record-level edits stay out of each other’s way', () => {
    it('a stale re-dating cannot roll back a merge that already landed', async () => {
      const { service } = await makeService();
      const run = await service.create(
        alice,
        { checklistId: aliceChecklistId },
        createdAt(),
      );
      await service.applyStepOps(alice, run.id, [
        {
          stepId: stepIdOf(run, VENTS),
          state: 'complete',
          editedAt: at(30_000),
        },
      ]);

      const result = await service.update(
        alice,
        run.id,
        { startedOn: '2026-01-01' },
        new Date(Date.now() - 120_000),
      );

      expect(result.startedOn).toBe(run.startedOn);
      expect(stateOf(result, VENTS)).toBe('complete');
    });

    it('a merge leaves the record clock alone, so a later re-dating still applies', async () => {
      const { service, runs } = await makeService();
      const stamp = createdAt();
      const run = await service.create(
        alice,
        { checklistId: aliceChecklistId },
        stamp,
      );
      await service.applyStepOps(alice, run.id, [
        { stepId: stepIdOf(run, VENTS), state: 'complete', editedAt: at(1000) },
      ]);

      expect(runs.editedAtOf(run.id)).toEqual(stamp);
      const redated = await service.update(
        alice,
        run.id,
        { startedOn: '2026-01-01' },
        new Date(Date.now() - 30_000),
      );
      expect(redated.startedOn).toBe('2026-01-01');
      expect(stateOf(redated, VENTS)).toBe('complete');
    });

    it('a stale whole-array PATCH loses only the steps it is stale about', async () => {
      const { service } = await makeService();
      const run = await service.create(
        alice,
        { checklistId: aliceChecklistId },
        createdAt(),
      );
      // The tablet completes one step at a reading the phone's echo cannot beat.
      const merged = await service.applyStepOps(alice, run.id, [
        {
          stepId: stepIdOf(run, VENTS),
          state: 'complete',
          editedAt: at(10_000),
        },
      ]);

      // The phone echoes the run as it knew it — both steps incomplete — from earlier.
      const echoed = await service.update(
        alice,
        run.id,
        { steps: run.steps.map((s) => ({ ...s, state: 'skipped' as const })) },
        new Date(Date.now() - 30_000),
      );

      expect(stateOf(echoed, VENTS)).toBe('complete');
      expect(stateOf(echoed, WATER)).toBe('skipped');
      expect(merged.startedOn).toBe(echoed.startedOn);
    });
  });
});
