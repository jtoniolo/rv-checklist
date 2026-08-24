import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { MaintenanceTask, Rig } from '@rv-checklist/domain';
import {
  InMemoryLogEntryRepository,
  InMemoryMaintenanceTaskRepository,
  InMemoryRigRepository,
} from '@rv-checklist/domain/testing';
import { LogEntryService } from './log-entry.service.js';

const alice = '550e8400-e29b-41d4-a716-446655440001';
const bob = '550e8400-e29b-41d4-a716-446655440002';
const aliceRigId = '550e8400-e29b-41d4-a716-446655440010';
const bobRigId = '550e8400-e29b-41d4-a716-446655440011';
const sealsTaskId = '550e8400-e29b-41d4-a716-446655440020';
const bobTaskId = '550e8400-e29b-41d4-a716-446655440021';

const aliceRig: Rig = {
  id: aliceRigId,
  ownerId: alice,
  nickname: 'Silver Bullet',
};
const bobRig: Rig = { id: bobRigId, ownerId: bob, nickname: 'Bob’s Rig' };

const sealsTask: MaintenanceTask = {
  id: sealsTaskId,
  rigId: aliceRigId,
  name: 'Condition slide seals',
  interval: { months: 12 },
  fieldSchema: [
    { name: 'Product used', type: 'text', required: false },
    { name: 'Tire Pressure', type: 'number', required: true, unit: 'psi' },
  ],
  tags: [],
};

const bobTask: MaintenanceTask = {
  id: bobTaskId,
  rigId: bobRigId,
  name: 'Bob’s task',
  fieldSchema: [],
  tags: [],
};

/** A performed-standalone create body, snapshotting the seals task's fields. */
const performSeals = {
  taskId: sealsTaskId,
  performedOn: '2026-07-21',
  fields: [
    { name: 'Product used', type: 'text' as const, required: false },
    {
      name: 'Tire Pressure',
      type: 'number' as const,
      required: true,
      unit: 'psi',
      value: 32,
    },
  ],
};

async function makeService(): Promise<{
  service: LogEntryService;
  tasks: InMemoryMaintenanceTaskRepository;
  logEntries: InMemoryLogEntryRepository;
}> {
  const logEntries = new InMemoryLogEntryRepository();
  const tasks = new InMemoryMaintenanceTaskRepository();
  const rigs = new InMemoryRigRepository();
  await rigs.save(aliceRig);
  await rigs.save(bobRig);
  await tasks.save(sealsTask);
  await tasks.save(bobTask);
  return {
    service: new LogEntryService(logEntries, tasks, rigs),
    tasks,
    logEntries,
  };
}

/**
 * Create an entry, then delete its task and null the entry's task_id — the end
 * state ON DELETE SET NULL yields (issue #28). The in-memory double doesn't
 * cascade, so we drive that end state here at the contract level.
 */
async function orphanOne(): Promise<{
  service: LogEntryService;
  entryId: string;
}> {
  const { service, tasks, logEntries } = await makeService();
  const entry = await service.create(alice, performSeals);
  await tasks.delete(sealsTaskId);
  // eslint-disable-next-line unicorn/no-null
  await logEntries.save({ ...entry, taskId: null });
  return { service, entryId: entry.id };
}

describe('LogEntryService', () => {
  describe('create — perform a task standalone', () => {
    it('records a dated entry carrying the field snapshot and values', async () => {
      const { service } = await makeService();

      const entry = await service.create(alice, performSeals);

      expect(entry).toMatchObject({
        taskId: sealsTaskId,
        rigId: aliceRigId,
        taskName: 'Condition slide seals',
        performedOn: '2026-07-21',
        fields: performSeals.fields,
      });
      expect(entry.id).toBeDefined();
    });

    it('snapshots the task’s name as it was when performed (issue #27)', async () => {
      const { service } = await makeService();

      const entry = await service.create(alice, performSeals);

      expect(entry.taskName).toBe(sealsTask.name);
    });

    it('rejects an entry missing a value for a required field', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, {
          ...performSeals,
          // Tire Pressure is required in the snapshot but carries no value.
          fields: performSeals.fields.map(
            ({ value: _value, ...field }) => field,
          ),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to log against a task the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, { ...performSeals, taskId: bobTaskId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // The rig's Distance reading at the time (issue #32) — the anchor a distance
    // Interval measures from — rides along on the completion when given.
    it('records the rig’s Distance reading when given', async () => {
      const { service } = await makeService();

      const entry = await service.create(alice, {
        ...performSeals,
        distanceKm: 20_000,
      });

      expect(entry.distanceKm).toBe(20_000);
    });

    it('records no reading when none is given — absent means absent', async () => {
      const { service } = await makeService();

      const entry = await service.create(alice, performSeals);

      expect(entry.distanceKm).toBeUndefined();
    });

    // The cost in cents (issue #39) — what it cost to perform this task.
    it('records the cost in cents when given', async () => {
      const { service } = await makeService();

      const entry = await service.create(alice, {
        ...performSeals,
        costCents: 11_240,
      });

      expect(entry.costCents).toBe(11_240);
    });

    it('records no cost when none is given — absent means absent', async () => {
      const { service } = await makeService();

      const entry = await service.create(alice, performSeals);

      expect(entry.costCents).toBeUndefined();
    });

    // The free-text comment (issue #101) — findings, an observation, the method used.
    it('records the comment when given', async () => {
      const { service } = await makeService();

      const entry = await service.create(alice, {
        ...performSeals,
        comment: 'Seal looked worn — replace next season.',
      });

      expect(entry.comment).toBe('Seal looked worn — replace next season.');
    });

    it('records no comment when none is given — absent means absent', async () => {
      const { service } = await makeService();

      const entry = await service.create(alice, performSeals);

      expect(entry.comment).toBeUndefined();
    });
  });

  // A one-time task is done once (issue #29): performing it writes a normal Log
  // Entry, then the task deletes itself. The entry is the permanent record and
  // outlives the task (issue #28) — labeled by its snapshotted taskName.
  describe('create — a one-time task deletes itself on completion (issue #29)', () => {
    const oneTimeTaskId = '550e8400-e29b-41d4-a716-446655440030';

    async function makeWithOneTime(): Promise<{
      service: LogEntryService;
      tasks: InMemoryMaintenanceTaskRepository;
    }> {
      const { service, tasks } = await makeService();
      await tasks.save({
        id: oneTimeTaskId,
        rigId: aliceRigId,
        name: 'Re-glue loose trim',
        oneTime: true,
        fieldSchema: [{ name: 'Notes', type: 'text', required: false }],
        tags: [],
      });
      return { service, tasks };
    }

    const performOneTime = {
      taskId: oneTimeTaskId,
      performedOn: '2026-07-22',
      fields: [
        {
          name: 'Notes',
          type: 'text' as const,
          required: false,
          value: 'Re-seated the awning rail',
        },
      ],
    };

    it('writes a normal entry, correctly labeled by the task’s name', async () => {
      const { service } = await makeWithOneTime();

      const entry = await service.create(alice, performOneTime);

      expect(entry).toMatchObject({
        taskName: 'Re-glue loose trim',
        performedOn: '2026-07-22',
        fields: performOneTime.fields,
      });
    });

    it('deletes the task, while the entry remains', async () => {
      const { service, tasks } = await makeWithOneTime();

      const entry = await service.create(alice, performOneTime);

      expect(await tasks.findById(oneTimeTaskId)).toBeUndefined();
      // The entry is the permanent record — still fetchable via its rig.
      await expect(service.get(alice, entry.id)).resolves.toMatchObject({
        id: entry.id,
        taskName: 'Re-glue loose trim',
      });
    });

    it('leaves a recurring task in place on completion', async () => {
      const { service, tasks } = await makeService();

      await service.create(alice, performSeals);

      expect(await tasks.findById(sealsTaskId)).toBeDefined();
    });
  });

  describe('snapshot-to-log (issue #17’s TDD seam)', () => {
    it('a later edit to the task does not rewrite a past entry', async () => {
      const { service, tasks } = await makeService();
      const entry = await service.create(alice, performSeals);

      // Rework the task's fields entirely after the completion was logged.
      await tasks.save({
        ...sealsTask,
        fieldSchema: [{ name: 'Notes', type: 'note', required: false }],
      });

      const reloaded = await service.get(alice, entry.id);
      expect(reloaded.fields).toEqual(performSeals.fields);
    });

    it('a later rename of the task does not relabel a past entry (issue #27)', async () => {
      const { service, tasks } = await makeService();
      const entry = await service.create(alice, performSeals);

      // Rename the task after the completion was logged.
      await tasks.save({ ...sealsTask, name: 'Recondition slide-out seals' });

      const reloaded = await service.get(alice, entry.id);
      expect(reloaded.taskName).toBe('Condition slide seals');
    });
  });

  describe('list — a task’s full log history', () => {
    it('returns the entries of the owner’s task', async () => {
      const { service } = await makeService();
      await service.create(alice, performSeals);
      await service.create(alice, {
        ...performSeals,
        performedOn: '2025-07-01',
      });

      const entries = await service.listByTask(alice, sealsTaskId);

      expect(entries).toHaveLength(2);
    });

    it('refuses to list entries of a task the owner does not own', async () => {
      const { service } = await makeService();

      await expect(service.listByTask(alice, bobTaskId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('list — a rig’s entries (the due-status read)', () => {
    it('returns every entry on the owner’s rig, across its tasks', async () => {
      const { service, tasks } = await makeService();
      await tasks.save({
        id: '550e8400-e29b-41d4-a716-446655440022',
        rigId: aliceRigId,
        name: 'Repack wheel bearings',
        fieldSchema: [],
        tags: [],
      });
      await service.create(alice, performSeals);
      await service.create(alice, {
        taskId: '550e8400-e29b-41d4-a716-446655440022',
        performedOn: '2026-06-01',
        fields: [],
      });

      const entries = await service.listByRig(alice, aliceRigId);

      expect(entries).toHaveLength(2);
    });

    it('refuses to list entries of a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(service.listByRig(alice, bobRigId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update — a past entry stays editable', () => {
    it('corrects the date and a recorded value', async () => {
      const { service } = await makeService();
      const entry = await service.create(alice, performSeals);

      const updated = await service.update(alice, entry.id, {
        performedOn: '2026-07-19',
        fields: performSeals.fields.map((f) =>
          f.name === 'Tire Pressure' ? { ...f, value: 35 } : f,
        ),
      });

      expect(updated.performedOn).toBe('2026-07-19');
      expect(
        updated.fields.find((f) => f.name === 'Tire Pressure')?.value,
      ).toBe(35);
    });

    it('rejects a correction that clears a required value', async () => {
      const { service } = await makeService();
      const entry = await service.create(alice, performSeals);

      await expect(
        service.update(alice, entry.id, {
          fields: entry.fields.map(({ value: _value, ...field }) => field),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('sets a Distance reading on a past entry, then clears it with null (issue #32)', async () => {
      const { service } = await makeService();
      const entry = await service.create(alice, performSeals);

      const withReading = await service.update(alice, entry.id, {
        distanceKm: 20_000,
      });
      expect(withReading.distanceKm).toBe(20_000);

      const cleared = await service.update(alice, entry.id, {
        // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
        distanceKm: null,
      });
      expect(cleared.distanceKm).toBeUndefined();
    });

    it('leaves the Distance reading unchanged when the key is omitted', async () => {
      const { service } = await makeService();
      const entry = await service.create(alice, {
        ...performSeals,
        distanceKm: 20_000,
      });

      const updated = await service.update(alice, entry.id, {
        performedOn: '2026-07-19',
      });

      expect(updated.distanceKm).toBe(20_000);
    });

    it('sets a cost on a past entry, then clears it with null (issue #39)', async () => {
      const { service } = await makeService();
      const entry = await service.create(alice, performSeals);

      const withCost = await service.update(alice, entry.id, {
        costCents: 5000,
      });
      expect(withCost.costCents).toBe(5000);

      const cleared = await service.update(alice, entry.id, {
        // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
        costCents: null,
      });
      expect(cleared.costCents).toBeUndefined();
    });

    it('leaves the cost unchanged when the key is omitted', async () => {
      const { service } = await makeService();
      const entry = await service.create(alice, {
        ...performSeals,
        costCents: 5000,
      });

      const updated = await service.update(alice, entry.id, {
        performedOn: '2026-07-19',
      });

      expect(updated.costCents).toBe(5000);
    });

    it('sets a comment on a past entry, then clears it with null (issue #101)', async () => {
      const { service } = await makeService();
      const entry = await service.create(alice, performSeals);

      const withComment = await service.update(alice, entry.id, {
        comment: 'Used the 303 protectant this time.',
      });
      expect(withComment.comment).toBe('Used the 303 protectant this time.');

      const cleared = await service.update(alice, entry.id, {
        // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
        comment: null,
      });
      expect(cleared.comment).toBeUndefined();
    });

    it('leaves the comment unchanged when the key is omitted', async () => {
      const { service } = await makeService();
      const entry = await service.create(alice, {
        ...performSeals,
        comment: 'Used the 303 protectant this time.',
      });

      const updated = await service.update(alice, entry.id, {
        performedOn: '2026-07-19',
      });

      expect(updated.comment).toBe('Used the 303 protectant this time.');
    });

    it('never changes which task or rig an entry belongs to', async () => {
      const { service } = await makeService();
      const entry = await service.create(alice, performSeals);

      const updated = await service.update(alice, entry.id, {
        performedOn: '2026-07-19',
      });

      expect(updated.taskId).toBe(sealsTaskId);
      expect(updated.rigId).toBe(aliceRigId);
    });
  });

  describe('delete', () => {
    it('removes a mistaken record', async () => {
      const { service } = await makeService();
      const entry = await service.create(alice, performSeals);

      await service.remove(alice, entry.id);

      await expect(service.get(alice, entry.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // Deleting a task must never lose "when did I last do this?" — its entries are
  // kept, orphaned (taskId null), owned via the rig (issue #28). The DB does this
  // by ON DELETE SET NULL; the in-memory double doesn't cascade, so we drive the
  // same end state at the contract level: delete the task, null out the entry's
  // taskId, and prove it stays listable, fetchable, editable, and deletable.
  describe('orphaned entry — task since deleted (issue #28)', () => {
    it('keeps the entry in the rig’s history, labeled by its snapshotted taskName', async () => {
      const { service } = await orphanOne();

      const entries = await service.listByRig(alice, aliceRigId);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.taskId).toBeNull();
      expect(entries[0]).toMatchObject({
        rigId: aliceRigId,
        taskName: 'Condition slide seals',
      });
    });

    it('stays fetchable via the rig-ownership path', async () => {
      const { service, entryId } = await orphanOne();

      const fetched = await service.get(alice, entryId);

      expect(fetched.taskId).toBeNull();
    });

    it('stays editable — correcting a date leaves it orphaned', async () => {
      const { service, entryId } = await orphanOne();

      const updated = await service.update(alice, entryId, {
        performedOn: '2026-07-19',
      });

      expect(updated.performedOn).toBe('2026-07-19');
      expect(updated.taskId).toBeNull();
    });

    it('stays deletable', async () => {
      const { service, entryId } = await orphanOne();

      await service.remove(alice, entryId);

      await expect(service.get(alice, entryId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('never lets another owner touch it — ownership is still the rig', async () => {
      const { service, entryId } = await orphanOne();

      await expect(service.get(bob, entryId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // The row-level ownership guarantee (ADR-0003), proven at the use-case seam.
  // An entry is owned via its rig, so isolation follows rig ownership.
  describe('owner isolation', () => {
    it('never lets another owner read, edit, or delete an entry', async () => {
      const { service } = await makeService();
      const entry = await service.create(alice, performSeals);

      await expect(service.get(bob, entry.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.update(bob, entry.id, { performedOn: '2026-01-01' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(bob, entry.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      await expect(service.get(alice, entry.id)).resolves.toEqual(entry);
    });
  });

  // Client-generated ids (ADR-0028, issue #143).
  describe('create with a client-generated id', () => {
    const clientId = '550e8400-e29b-41d4-a716-446655440077';

    it('records the entry under the supplied id', async () => {
      const { service } = await makeService();

      const entry = await service.create(alice, {
        ...performSeals,
        id: clientId,
      });

      expect(entry.id).toBe(clientId);
    });

    it('treats a re-post as success, leaving exactly one entry', async () => {
      const { service } = await makeService();
      await service.create(alice, { ...performSeals, id: clientId });

      const replayed = await service.create(alice, {
        ...performSeals,
        id: clientId,
      });

      expect(replayed.id).toBe(clientId);
      await expect(
        service.listByTask(alice, sealsTaskId),
      ).resolves.toHaveLength(1);
    });

    it('never adopts an entry logged against another owner’s task', async () => {
      const { service, logEntries } = await makeService();
      await service.create(bob, {
        taskId: bobTaskId,
        performedOn: '2026-07-21',
        fields: [],
        id: clientId,
      });

      await expect(
        service.create(alice, { ...performSeals, id: clientId }),
      ).rejects.toThrow(NotFoundException);
      await expect(logEntries.findById(clientId)).resolves.toMatchObject({
        taskId: bobTaskId,
      });
    });

    it('initialises the entry’s edit time from X-Edited-At', async () => {
      const { service, logEntries } = await makeService();
      const stamp = new Date(Date.now() - 60_000);

      await service.create(alice, { ...performSeals, id: clientId }, stamp);

      expect(logEntries.editedAtOf(clientId)).toEqual(stamp);
    });

    /**
     * The replay trap ADR-0028 names: performing a one-time task deletes it,
     * so a replay must not re-run that side effect against whatever else the
     * queue did in between. It writes nothing, so it triggers nothing.
     */
    it('does not re-run the one-time task deletion on a replay', async () => {
      const oneTimeTaskId = '550e8400-e29b-41d4-a716-446655440031';
      const { service, tasks } = await makeService();
      const oneTime = {
        id: oneTimeTaskId,
        rigId: aliceRigId,
        name: 'Re-glue loose trim',
        oneTime: true as const,
        fieldSchema: [],
        tags: [],
      };
      await tasks.save(oneTime);
      const body = {
        taskId: oneTimeTaskId,
        performedOn: '2026-07-22',
        fields: [],
        id: clientId,
      };
      await service.create(alice, body);
      // The owner re-created the task after the first completion; the queued
      // create then replays.
      await tasks.save(oneTime);

      const replayed = await service.create(alice, body);

      expect(replayed.id).toBe(clientId);
      await expect(tasks.findById(oneTimeTaskId)).resolves.toMatchObject({
        id: oneTimeTaskId,
      });
    });

    /**
     * The same trap without the owner re-creating the task in between — the
     * ordinary case. Performing the one-time task deleted it, so the replay
     * arrives with nothing left to resolve the create against and must answer
     * from the entry the first call wrote. Resolving the task first would turn
     * a create that really succeeded into a 404, and the offline upload queue
     * would mark a completion the server is holding as permanently failed.
     */
    describe('replaying a create whose one-time task deleted itself', () => {
      const goneTaskId = '550e8400-e29b-41d4-a716-446655440032';
      const otherTaskId = '550e8400-e29b-41d4-a716-446655440033';
      const body = {
        taskId: goneTaskId,
        performedOn: '2026-07-22',
        fields: [],
        id: clientId,
      };

      async function performOnce(): Promise<{
        service: LogEntryService;
        logEntries: InMemoryLogEntryRepository;
        entryId: string;
      }> {
        const { service, tasks, logEntries } = await makeService();
        await tasks.save({
          id: goneTaskId,
          rigId: aliceRigId,
          name: 'Re-glue loose trim',
          oneTime: true,
          fieldSchema: [],
          tags: [],
        });
        const entry = await service.create(alice, body);
        // The double doesn't cascade, so drive the end state ON DELETE SET NULL
        // leaves behind: the task gone, the entry kept and orphaned (issue #28).
        // eslint-disable-next-line unicorn/no-null
        await logEntries.save({ ...entry, taskId: null });
        return { service, logEntries, entryId: entry.id };
      }

      it('returns the stored entry instead of reporting the task missing', async () => {
        const { service, entryId } = await performOnce();

        const replayed = await service.create(alice, body);

        expect(replayed.id).toBe(entryId);
        expect(replayed).toMatchObject({
          taskName: 'Re-glue loose trim',
          performedOn: '2026-07-22',
        });
      });

      it('leaves exactly one entry on the rig', async () => {
        const { service } = await performOnce();

        await service.create(alice, body);

        await expect(
          service.listByRig(alice, aliceRigId),
        ).resolves.toHaveLength(1);
      });

      it('writes nothing, so the entry’s edit time does not move', async () => {
        const { service, logEntries } = await performOnce();
        const before = logEntries.editedAtOf(clientId);

        await service.create(alice, body, new Date());

        expect(logEntries.editedAtOf(clientId)).toEqual(before);
      });

      it('still refuses a client id naming another owner’s entry', async () => {
        const { service, logEntries } = await makeService();
        const bobEntry = await service.create(bob, {
          taskId: bobTaskId,
          performedOn: '2026-07-21',
          fields: [],
          id: clientId,
        });
        // eslint-disable-next-line unicorn/no-null
        await logEntries.save({ ...bobEntry, taskId: null });

        await expect(service.create(alice, body)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        await expect(logEntries.findById(clientId)).resolves.toMatchObject({
          rigId: bobRigId,
        });
      });

      it('refuses a client id naming an entry still attached to another task', async () => {
        const { service } = await makeService();
        // One of Alice's own entries, recorded against a task that still
        // exists — so it is demonstrably not the row this create would write.
        await service.create(alice, { ...performSeals, id: clientId });

        await expect(
          service.create(alice, { ...body, taskId: otherTaskId }),
        ).rejects.toBeInstanceOf(NotFoundException);
      });

      it('still reports a genuinely missing task when no client id was sent', async () => {
        const { service } = await performOnce();

        await expect(
          service.create(alice, { ...body, id: undefined }),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });
  });
});
