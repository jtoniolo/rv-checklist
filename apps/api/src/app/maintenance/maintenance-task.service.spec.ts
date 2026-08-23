import { NotFoundException } from '@nestjs/common';
import type { Rig } from '@rv-checklist/domain';
import {
  InMemoryMaintenanceTaskRepository,
  InMemoryRigRepository,
} from '@rv-checklist/domain/testing';
import { MaintenanceTaskService } from './maintenance-task.service.js';

const alice = '550e8400-e29b-41d4-a716-446655440001';
const bob = '550e8400-e29b-41d4-a716-446655440002';
const aliceRigId = '550e8400-e29b-41d4-a716-446655440010';
const bobRigId = '550e8400-e29b-41d4-a716-446655440011';

const aliceRig: Rig = {
  id: aliceRigId,
  ownerId: alice,
  nickname: 'Silver Bullet',
};
const bobRig: Rig = { id: bobRigId, ownerId: bob, nickname: 'Bob’s Rig' };

const sealsInput = {
  rigId: aliceRigId,
  name: 'Condition slide seals',
  interval: { months: 12 },
  fieldSchema: [
    { name: 'Product used', type: 'text' as const, required: false },
  ],
  tags: [] as string[],
};

async function makeService(): Promise<{
  service: MaintenanceTaskService;
  tasks: InMemoryMaintenanceTaskRepository;
}> {
  const tasks = new InMemoryMaintenanceTaskRepository();
  const rigs = new InMemoryRigRepository();
  await rigs.save(aliceRig);
  await rigs.save(bobRig);
  return { service: new MaintenanceTaskService(tasks, rigs), tasks };
}

describe('MaintenanceTaskService', () => {
  describe('create', () => {
    it('creates a task on the owner’s rig, assigning the id', async () => {
      const { service } = await makeService();

      const task = await service.create(alice, sealsInput);

      expect(task).toMatchObject(sealsInput);
      expect(task.id).toBeDefined();
    });

    it('creates a task with no interval — simply not tracked', async () => {
      const { service } = await makeService();

      const task = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Replace anode rod',
        fieldSchema: [],
        tags: [],
      });

      expect(task.interval).toBeUndefined();
    });

    it('creates a task with a description', async () => {
      const { service } = await makeService();

      const task = await service.create(alice, {
        ...sealsInput,
        description: 'Seals dry out in the sun.\nWipe down, then condition.',
      });

      expect(task.description).toBe(
        'Seals dry out in the sun.\nWipe down, then condition.',
      );
    });

    it('creates a one-time task — due from creation, no interval (issue #29)', async () => {
      const { service } = await makeService();

      const task = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Re-glue loose trim',
        oneTime: true,
        fieldSchema: [],
        tags: [],
      });

      expect(task.oneTime).toBe(true);
      expect(task.interval).toBeUndefined();
    });

    it('creates a task with tags (issue #41)', async () => {
      const { service } = await makeService();

      const task = await service.create(alice, {
        ...sealsInput,
        tags: ['exterior', 'slides'],
      });

      expect(task.tags).toEqual(['exterior', 'slides']);
    });

    it('defaults tags to an empty array when omitted', async () => {
      const { service } = await makeService();

      const task = await service.create(alice, sealsInput);

      expect(task.tags).toEqual([]);
    });

    it('refuses to create a task on a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, { ...sealsInput, rigId: bobRigId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // A distance interval (issue #32) round-trips through the whole write path,
    // proving the flattened `interval_km` column maps back to the union member.
    it('creates a task on a distance basis', async () => {
      const { service } = await makeService();

      const task = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Repack wheel bearings',
        interval: { km: 20_000 },
        fieldSchema: [],
        tags: [],
      });

      expect(task.interval).toEqual({ km: 20_000 });
    });

    // A combined interval (ADR-0016) carries both limits at once and round-trips
    // through the write path, proving neither the schema nor the repository drops
    // a limit when both are present.
    it('creates a task carrying both a calendar and a distance limit', async () => {
      const { service } = await makeService();

      const task = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Service trailer axle',
        interval: { months: 24, km: 30_000 },
        lastPerformed: '2025-07-21',
        fieldSchema: [],
        tags: [],
      });

      expect(task.interval).toEqual({ months: 24, km: 30_000 });
      // The manual anchor rides along — the interval carries a calendar limit.
      expect(task.lastPerformed).toBe('2025-07-21');
    });
  });

  describe('list — a rig’s tasks', () => {
    it('returns the owner’s rig’s tasks', async () => {
      const { service } = await makeService();
      await service.create(alice, sealsInput);
      await service.create(alice, {
        rigId: aliceRigId,
        name: 'Repack wheel bearings',
        fieldSchema: [],
        tags: [],
      });

      const listed = await service.listByRig(alice, aliceRigId);

      expect(listed).toHaveLength(2);
    });

    it('refuses to list tasks of a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(service.listByRig(alice, bobRigId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('edits name, interval, and fields', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, sealsInput);

      const updated = await service.update(alice, task.id, {
        name: 'Condition all seals',
        interval: { months: 6 },
        fieldSchema: [
          { name: 'Product used', type: 'text', required: true },
          { name: 'Cost', type: 'number', required: false, unit: '$' },
        ],
      });

      expect(updated.name).toBe('Condition all seals');
      expect(updated.interval).toEqual({ months: 6 });
      expect(updated.fieldSchema).toHaveLength(2);
    });

    it('switches a calendar task to a distance basis (issue #32)', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, sealsInput);

      const updated = await service.update(alice, task.id, {
        interval: { km: 20_000 },
      });

      expect(updated.interval).toEqual({ km: 20_000 });
    });

    it('removes the interval with an explicit null — the task stops being tracked', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, sealsInput);

      // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
      const updated = await service.update(alice, task.id, { interval: null });

      expect(updated.interval).toBeUndefined();
      expect(updated.name).toBe(sealsInput.name);
    });

    it('marking a recurring task one-time drops its interval (they are exclusive)', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, sealsInput);

      const updated = await service.update(alice, task.id, {
        oneTime: true,
        // eslint-disable-next-line unicorn/no-null -- the form sends the coherent pair
        interval: null,
      });

      expect(updated.oneTime).toBe(true);
      expect(updated.interval).toBeUndefined();
    });

    it('giving a one-time task an interval drops the one-time marker', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Re-glue loose trim',
        oneTime: true,
        fieldSchema: [],
        tags: [],
      });

      const updated = await service.update(alice, task.id, {
        interval: { months: 12 },
        // eslint-disable-next-line unicorn/no-null -- the form sends the coherent pair
        oneTime: null,
      });

      expect(updated.interval).toEqual({ months: 12 });
      expect(updated.oneTime).toBeUndefined();
    });

    it('clears the one-time marker with an explicit null', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Re-glue loose trim',
        oneTime: true,
        fieldSchema: [],
        tags: [],
      });

      // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
      const updated = await service.update(alice, task.id, { oneTime: null });

      expect(updated.oneTime).toBeUndefined();
      expect(updated.interval).toBeUndefined();
    });

    it('replaces the tags set when provided (issue #41)', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        ...sealsInput,
        tags: ['exterior'],
      });

      const updated = await service.update(alice, task.id, {
        tags: ['exterior', 'slides'],
      });

      expect(updated.tags).toEqual(['exterior', 'slides']);
    });

    it('clears tags with an empty array', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        ...sealsInput,
        tags: ['exterior'],
      });

      const updated = await service.update(alice, task.id, { tags: [] });

      expect(updated.tags).toEqual([]);
    });

    it('leaves tags unchanged when omitted from the update', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        ...sealsInput,
        tags: ['exterior'],
      });

      const updated = await service.update(alice, task.id, {
        name: 'Condition all seals',
      });

      expect(updated.tags).toEqual(['exterior']);
    });

    it('leaves omitted fields unchanged and never changes the rig', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        ...sealsInput,
        description: 'Why and how.',
      });

      const updated = await service.update(alice, task.id, { name: 'Seals' });

      expect(updated.rigId).toBe(aliceRigId);
      expect(updated.interval).toEqual({ months: 12 });
      expect(updated.fieldSchema).toEqual(sealsInput.fieldSchema);
      expect(updated.description).toBe('Why and how.');
    });

    it('writes an edited description', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, sealsInput);

      const updated = await service.update(alice, task.id, {
        description: 'Wipe down first, then apply conditioner.',
      });

      expect(updated.description).toBe(
        'Wipe down first, then apply conditioner.',
      );
    });

    // The manual last-performed anchor (issue #33) rides only with a calendar
    // interval; the update path sets, clears, and drops it accordingly.
    it('sets a manual last-performed anchor on a calendar task', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, sealsInput);

      const updated = await service.update(alice, task.id, {
        lastPerformed: '2025-07-21',
      });

      expect(updated.lastPerformed).toBe('2025-07-21');
    });

    it('clears the manual anchor with an explicit null', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        ...sealsInput,
        lastPerformed: '2025-07-21',
      });

      const updated = await service.update(alice, task.id, {
        // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
        lastPerformed: null,
      });

      expect(updated.lastPerformed).toBeUndefined();
    });

    it('drops the manual anchor when the interval is removed (no calendar interval left)', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        ...sealsInput,
        lastPerformed: '2025-07-21',
      });

      const updated = await service.update(alice, task.id, {
        // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
        interval: null,
      });

      expect(updated.interval).toBeUndefined();
      expect(updated.lastPerformed).toBeUndefined();
    });

    it('drops the manual anchor when switching to a distance basis (issue #33)', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        ...sealsInput,
        lastPerformed: '2025-07-21',
      });

      const updated = await service.update(alice, task.id, {
        interval: { km: 20_000 },
      });

      expect(updated.interval).toEqual({ km: 20_000 });
      expect(updated.lastPerformed).toBeUndefined();
    });

    it('drops the manual anchor when the task is made one-time', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        ...sealsInput,
        lastPerformed: '2025-07-21',
      });

      const updated = await service.update(alice, task.id, {
        oneTime: true,
        // eslint-disable-next-line unicorn/no-null -- the form sends the coherent pair
        interval: null,
      });

      expect(updated.oneTime).toBe(true);
      expect(updated.lastPerformed).toBeUndefined();
    });

    it('keeps the manual anchor when the calendar interval is only re-tuned', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        ...sealsInput,
        lastPerformed: '2025-07-21',
      });

      const updated = await service.update(alice, task.id, {
        interval: { months: 6 },
      });

      expect(updated.lastPerformed).toBe('2025-07-21');
    });

    it('clears the description with an explicit null, like the interval', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        ...sealsInput,
        description: 'Obsolete advice.',
      });

      const updated = await service.update(alice, task.id, {
        // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
        description: null,
      });

      expect(updated.description).toBeUndefined();
      expect(updated.name).toBe(sealsInput.name);
    });
  });

  describe('delete', () => {
    it('removes a task the owner no longer does', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, sealsInput);

      await service.remove(alice, task.id);

      await expect(service.get(alice, task.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // The row-level ownership guarantee (ADR-0003), proven at the use-case seam.
  // A task is owned via its rig, so isolation follows rig ownership.
  describe('owner isolation', () => {
    it('never lets another owner read, edit, or delete a task', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, sealsInput);

      await expect(service.get(bob, task.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.update(bob, task.id, { name: 'Hijacked' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(bob, task.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      await expect(service.get(alice, task.id)).resolves.toEqual(task);
    });
  });

  // Client-generated ids (ADR-0028, issue #143).
  describe('create with a client-generated id', () => {
    const clientId = '550e8400-e29b-41d4-a716-446655440077';

    it('creates under the supplied id', async () => {
      const { service } = await makeService();

      const task = await service.create(alice, {
        ...sealsInput,
        rigId: aliceRigId,
        id: clientId,
      });

      expect(task.id).toBe(clientId);
    });

    it('treats a re-post as success, leaving one task on the rig', async () => {
      const { service } = await makeService();
      const body = { ...sealsInput, rigId: aliceRigId, id: clientId };
      await service.create(alice, body);

      const replayed = await service.create(alice, body);

      expect(replayed.id).toBe(clientId);
      await expect(service.listByRig(alice, aliceRigId)).resolves.toHaveLength(
        1,
      );
    });

    it('never adopts a task on another owner’s rig', async () => {
      const { service, tasks } = await makeService();
      await service.create(bob, {
        ...sealsInput,
        rigId: bobRigId,
        id: clientId,
      });

      await expect(
        service.create(alice, {
          ...sealsInput,
          rigId: aliceRigId,
          id: clientId,
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(tasks.findById(clientId)).resolves.toMatchObject({
        rigId: bobRigId,
      });
      await expect(service.listByRig(alice, aliceRigId)).resolves.toEqual([]);
    });

    it('initialises the task’s edit time from X-Edited-At', async () => {
      const { service, tasks } = await makeService();
      const stamp = new Date(Date.now() - 60_000);

      await service.create(
        alice,
        { ...sealsInput, rigId: aliceRigId, id: clientId },
        stamp,
      );

      expect(tasks.editedAtOf(clientId)).toEqual(stamp);
    });
  });
});
