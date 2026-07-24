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
  interval: { basis: 'calendar' as const, months: 12 },
  fieldSchema: [
    { name: 'Product used', type: 'text' as const, required: false },
  ],
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
      });

      expect(task.oneTime).toBe(true);
      expect(task.interval).toBeUndefined();
    });

    it('refuses to create a task on a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, { ...sealsInput, rigId: bobRigId }),
      ).rejects.toBeInstanceOf(NotFoundException);
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
        interval: { basis: 'calendar' as const, months: 6 },
        fieldSchema: [
          { name: 'Product used', type: 'text', required: true },
          { name: 'Cost', type: 'number', required: false, unit: '$' },
        ],
      });

      expect(updated.name).toBe('Condition all seals');
      expect(updated.interval).toEqual({ basis: 'calendar', months: 6 });
      expect(updated.fieldSchema).toHaveLength(2);
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
      });

      const updated = await service.update(alice, task.id, {
        interval: { basis: 'calendar' as const, months: 12 },
        // eslint-disable-next-line unicorn/no-null -- the form sends the coherent pair
        oneTime: null,
      });

      expect(updated.interval).toEqual({ basis: 'calendar', months: 12 });
      expect(updated.oneTime).toBeUndefined();
    });

    it('clears the one-time marker with an explicit null', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Re-glue loose trim',
        oneTime: true,
        fieldSchema: [],
      });

      // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
      const updated = await service.update(alice, task.id, { oneTime: null });

      expect(updated.oneTime).toBeUndefined();
      expect(updated.interval).toBeUndefined();
    });

    it('leaves omitted fields unchanged and never changes the rig', async () => {
      const { service } = await makeService();
      const task = await service.create(alice, {
        ...sealsInput,
        description: 'Why and how.',
      });

      const updated = await service.update(alice, task.id, { name: 'Seals' });

      expect(updated.rigId).toBe(aliceRigId);
      expect(updated.interval).toEqual({ basis: 'calendar', months: 12 });
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
});
