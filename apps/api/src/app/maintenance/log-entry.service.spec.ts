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
};

const bobTask: MaintenanceTask = {
  id: bobTaskId,
  rigId: bobRigId,
  name: 'Bob’s task',
  fieldSchema: [],
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
}> {
  const logEntries = new InMemoryLogEntryRepository();
  const tasks = new InMemoryMaintenanceTaskRepository();
  const rigs = new InMemoryRigRepository();
  await rigs.save(aliceRig);
  await rigs.save(bobRig);
  await tasks.save(sealsTask);
  await tasks.save(bobTask);
  return { service: new LogEntryService(logEntries, tasks, rigs), tasks };
}

describe('LogEntryService', () => {
  describe('create — perform a task standalone', () => {
    it('records a dated entry carrying the field snapshot and values', async () => {
      const { service } = await makeService();

      const entry = await service.create(alice, performSeals);

      expect(entry).toMatchObject({
        taskId: sealsTaskId,
        rigId: aliceRigId,
        performedOn: '2026-07-21',
        fields: performSeals.fields,
      });
      expect(entry.id).toBeDefined();
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
});
