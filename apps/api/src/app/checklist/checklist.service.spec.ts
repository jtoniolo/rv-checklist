import { NotFoundException } from '@nestjs/common';
import type { CreateChecklist, Rig } from '@rv-checklist/domain';
import {
  InMemoryChecklistRepository,
  InMemoryRigRepository,
} from '@rv-checklist/domain/testing';
import { ChecklistService } from './checklist.service.js';

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

const preDeparture = (rigId: string): CreateChecklist => ({
  rigId,
  name: 'Pre-departure',
  tags: ['procedure', 'departure'],
  steps: [
    { text: 'Close roof vents' },
    {
      text: 'Fresh water level',
      fieldSchema: [
        { name: 'Level', type: 'number', required: true, unit: '%' },
      ],
    },
  ],
});

async function makeService(): Promise<{
  service: ChecklistService;
  checklists: InMemoryChecklistRepository;
  rigs: InMemoryRigRepository;
}> {
  const checklists = new InMemoryChecklistRepository();
  const rigs = new InMemoryRigRepository();
  await rigs.save(aliceRig);
  await rigs.save(bobRig);
  return { service: new ChecklistService(checklists, rigs), checklists, rigs };
}

describe('ChecklistService', () => {
  describe('create', () => {
    it('assigns a checklist id and step ids, keeping the given fields', async () => {
      const { service } = await makeService();

      const checklist = await service.create(alice, preDeparture(aliceRigId));

      expect(checklist.id).toEqual(expect.any(String));
      expect(checklist).toMatchObject({
        rigId: aliceRigId,
        name: 'Pre-departure',
        tags: ['procedure', 'departure'],
      });
      expect(checklist.steps).toHaveLength(2);
      for (const step of checklist.steps) {
        expect(step.id).toEqual(expect.any(String));
      }
      expect(checklist.steps[0]).toMatchObject({ text: 'Close roof vents' });
      expect(checklist.steps[1]?.fieldSchema).toEqual([
        { name: 'Level', type: 'number', required: true, unit: '%' },
      ]);
    });

    it('gives each step a distinct id', async () => {
      const { service } = await makeService();

      const checklist = await service.create(alice, preDeparture(aliceRigId));

      const ids = checklist.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('refuses to create a checklist on a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, preDeparture(bobRigId)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns the checklists of the owner’s rig', async () => {
      const { service } = await makeService();
      await service.create(alice, preDeparture(aliceRigId));
      await service.create(alice, {
        rigId: aliceRigId,
        name: 'Packing',
        tags: [],
        steps: [],
      });

      const checklists = await service.list(alice, aliceRigId);

      expect(checklists).toHaveLength(2);
      expect(new Set(checklists.map((c) => c.name))).toEqual(
        new Set(['Packing', 'Pre-departure']),
      );
    });

    it('refuses to list checklists of a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(service.list(alice, bobRigId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('get', () => {
    it('returns the owner’s checklist by id', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, preDeparture(aliceRigId));

      await expect(service.get(alice, created.id)).resolves.toEqual(created);
    });

    it('throws NotFound for an id that does not exist', async () => {
      const { service } = await makeService();

      await expect(service.get(alice, aliceRigId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('applies a partial edit to name and tags', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, preDeparture(aliceRigId));

      const updated = await service.update(alice, created.id, {
        name: 'Departure',
        tags: ['procedure'],
      });

      expect(updated).toEqual({
        ...created,
        name: 'Departure',
        tags: ['procedure'],
      });
      await expect(service.get(alice, created.id)).resolves.toEqual(updated);
    });

    it('preserves existing step ids across a reorder and assigns ids to new steps', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, preDeparture(aliceRigId));
      const [first, second] = created.steps;

      const updated = await service.update(alice, created.id, {
        // reorder (second then first) and append a new, id-less step
        steps: [
          {
            id: second?.id,
            text: second?.text ?? '',
            fieldSchema: second?.fieldSchema,
          },
          { id: first?.id, text: first?.text ?? '' },
          { text: 'Pack the coffee maker' },
        ],
      });

      expect(updated.steps).toHaveLength(3);
      expect(updated.steps[0]?.id).toBe(second?.id);
      expect(updated.steps[1]?.id).toBe(first?.id);
      expect(updated.steps[2]?.id).toEqual(expect.any(String));
      expect(updated.steps[2]?.id).not.toBe(first?.id);
      expect(updated.steps[2]?.text).toBe('Pack the coffee maker');
    });

    it('never changes the rig a checklist belongs to', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, preDeparture(aliceRigId));

      const updated = await service.update(alice, created.id, { name: 'X' });

      expect(updated.rigId).toBe(aliceRigId);
    });
  });

  describe('delete', () => {
    it('removes the owner’s checklist', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, preDeparture(aliceRigId));

      await service.remove(alice, created.id);

      await expect(service.list(alice, aliceRigId)).resolves.toEqual([]);
    });
  });

  // The row-level ownership guarantee (ADR-0003), proven at the use-case seam.
  // A checklist is owned via its rig, so the isolation is by rig ownership.
  describe('owner isolation', () => {
    it('never lets another owner see, read, edit, or delete a checklist', async () => {
      const { service } = await makeService();
      const aliceChecklist = await service.create(
        alice,
        preDeparture(aliceRigId),
      );

      // Bob sees nothing of Alice's — and cannot even list her rig.
      await expect(service.list(bob, aliceRigId)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      // Bob cannot read it — its existence is indistinguishable from "not found".
      await expect(service.get(bob, aliceChecklist.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      // Bob cannot edit it, and Alice's checklist is untouched.
      await expect(
        service.update(bob, aliceChecklist.id, { name: 'Hijacked' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.get(alice, aliceChecklist.id)).resolves.toEqual(
        aliceChecklist,
      );

      // Bob cannot delete it, and Alice's checklist survives.
      await expect(
        service.remove(bob, aliceChecklist.id),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.get(alice, aliceChecklist.id)).resolves.toEqual(
        aliceChecklist,
      );
    });
  });
});
