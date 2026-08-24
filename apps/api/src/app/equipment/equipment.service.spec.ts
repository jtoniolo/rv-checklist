import { NotFoundException } from '@nestjs/common';
import type { CreateEquipmentItem, Rig } from '@rv-checklist/domain';
import {
  InMemoryEquipmentItemRepository,
  InMemoryRigRepository,
} from '@rv-checklist/domain/testing';
import { EquipmentService } from './equipment.service.js';

const alice = '550e8400-e29b-41d4-a716-446655440001';
const bob = '550e8400-e29b-41d4-a716-446655440002';
const aliceRigId = '550e8400-e29b-41d4-a716-446655440010';
const bobRigId = '550e8400-e29b-41d4-a716-446655440011';

const aliceRig: Rig = {
  id: aliceRigId,
  ownerId: alice,
  nickname: 'Silver Bullet',
};
const bobRig: Rig = { id: bobRigId, ownerId: bob, nickname: "Bob's Rig" };

const generator = (rigId: string): CreateEquipmentItem => ({
  rigId,
  name: 'Onan generator',
});

const detailedItem = (rigId: string): CreateEquipmentItem => ({
  rigId,
  name: 'Onan generator',
  make: 'Onan',
  model: 'QG 5500',
  purchaseDate: '2024-03-15',
  notes: '5-year warranty',
  costCents: 389_900,
});

async function makeService(): Promise<{
  service: EquipmentService;
  items: InMemoryEquipmentItemRepository;
  rigs: InMemoryRigRepository;
}> {
  const items = new InMemoryEquipmentItemRepository();
  const rigs = new InMemoryRigRepository();
  await rigs.save(aliceRig);
  await rigs.save(bobRig);
  return { service: new EquipmentService(items, rigs), items, rigs };
}

describe('EquipmentService', () => {
  describe('create', () => {
    it('assigns an id, keeping the given fields', async () => {
      const { service } = await makeService();

      const item = await service.create(alice, generator(aliceRigId));

      expect(item.id).toEqual(expect.any(String));
      expect(item).toMatchObject({
        rigId: aliceRigId,
        name: 'Onan generator',
      });
    });

    it('refuses to create equipment on a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, generator(bobRigId)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it("returns the equipment items of the owner's rig", async () => {
      const { service } = await makeService();
      await service.create(alice, generator(aliceRigId));
      await service.create(alice, { rigId: aliceRigId, name: 'Solar panel' });

      const items = await service.list(alice, aliceRigId);

      expect(items).toHaveLength(2);
      expect(new Set(items.map((i) => i.name))).toEqual(
        new Set(['Onan generator', 'Solar panel']),
      );
    });

    it('refuses to list equipment of a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(service.list(alice, bobRigId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('get', () => {
    it("returns the owner's equipment item by id", async () => {
      const { service } = await makeService();
      const created = await service.create(alice, generator(aliceRigId));

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
    it('renames an equipment item', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, generator(aliceRigId));

      const updated = await service.update(alice, created.id, {
        name: 'Cummins generator',
      });

      expect(updated).toEqual({ ...created, name: 'Cummins generator' });
      await expect(service.get(alice, created.id)).resolves.toEqual(updated);
    });

    it('never changes the rig an equipment item belongs to', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, generator(aliceRigId));

      const updated = await service.update(alice, created.id, {
        name: 'Renamed',
      });

      expect(updated.rigId).toBe(aliceRigId);
    });
  });

  describe('detail fields (issue #80)', () => {
    it('creates an item with all detail fields', async () => {
      const { service } = await makeService();

      const item = await service.create(alice, detailedItem(aliceRigId));

      expect(item).toMatchObject({
        name: 'Onan generator',
        make: 'Onan',
        model: 'QG 5500',
        purchaseDate: '2024-03-15',
        notes: '5-year warranty',
        costCents: 389_900,
      });
    });

    it('creates a name-only item with no detail fields', async () => {
      const { service } = await makeService();

      const item = await service.create(alice, generator(aliceRigId));

      expect(item.make).toBeUndefined();
      expect(item.model).toBeUndefined();
      expect(item.purchaseDate).toBeUndefined();
      expect(item.notes).toBeUndefined();
      expect(item.costCents).toBeUndefined();
    });

    it('updates a detail field to a new value', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, detailedItem(aliceRigId));

      const updated = await service.update(alice, created.id, {
        make: 'Cummins',
      });

      expect(updated.make).toBe('Cummins');
      expect(updated.model).toBe('QG 5500');
    });

    it('clears a detail field with null', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, detailedItem(aliceRigId));

      // eslint-disable-next-line unicorn/no-null
      const updated = await service.update(alice, created.id, { make: null });

      expect(updated.make).toBeUndefined();
      expect(updated.model).toBe('QG 5500');
    });

    it('leaves a detail field unchanged when omitted', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, detailedItem(aliceRigId));

      const updated = await service.update(alice, created.id, {
        name: 'Cummins generator',
      });

      expect(updated.name).toBe('Cummins generator');
      expect(updated.make).toBe('Onan');
      expect(updated.costCents).toBe(389_900);
    });

    it('round-trips costCents exactly', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Solar panel',
        costCents: 11_240,
      });

      expect(created.costCents).toBe(11_240);
      const fetched = await service.get(alice, created.id);
      expect(fetched.costCents).toBe(11_240);
    });
  });

  describe('delete', () => {
    it("removes the owner's equipment item", async () => {
      const { service } = await makeService();
      const created = await service.create(alice, generator(aliceRigId));

      await service.remove(alice, created.id);

      await expect(service.list(alice, aliceRigId)).resolves.toEqual([]);
    });
  });

  describe('owner isolation', () => {
    it('never lets another owner see, read, edit, or delete an equipment item', async () => {
      const { service } = await makeService();
      const aliceItem = await service.create(alice, generator(aliceRigId));

      await expect(service.list(bob, aliceRigId)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      await expect(service.get(bob, aliceItem.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      await expect(
        service.update(bob, aliceItem.id, { name: 'Hijacked' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.get(alice, aliceItem.id)).resolves.toEqual(
        aliceItem,
      );

      await expect(service.remove(bob, aliceItem.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.get(alice, aliceItem.id)).resolves.toEqual(
        aliceItem,
      );
    });
  });

  // Client-generated ids (ADR-0028, issue #143).
  describe('create with a client-generated id', () => {
    const clientId = '550e8400-e29b-41d4-a716-446655440077';

    it('creates under the supplied id', async () => {
      const { service } = await makeService();

      const item = await service.create(alice, {
        ...generator(aliceRigId),
        id: clientId,
      });

      expect(item.id).toBe(clientId);
    });

    it('treats a re-post as success, leaving one item on the rig', async () => {
      const { service } = await makeService();
      await service.create(alice, { ...generator(aliceRigId), id: clientId });

      const replayed = await service.create(alice, {
        ...generator(aliceRigId),
        id: clientId,
      });

      expect(replayed.id).toBe(clientId);
      await expect(service.list(alice, aliceRigId)).resolves.toHaveLength(1);
    });

    it('never adopts an item on another owner’s rig', async () => {
      const { service, items } = await makeService();
      await service.create(bob, { ...generator(bobRigId), id: clientId });

      await expect(
        service.create(alice, { ...generator(aliceRigId), id: clientId }),
      ).rejects.toThrow(NotFoundException);
      await expect(items.findById(clientId)).resolves.toMatchObject({
        rigId: bobRigId,
      });
      await expect(service.list(alice, aliceRigId)).resolves.toEqual([]);
    });

    it('initialises the item’s edit time from X-Edited-At', async () => {
      const { service, items } = await makeService();
      const stamp = new Date(Date.now() - 60_000);

      await service.create(
        alice,
        { ...generator(aliceRigId), id: clientId },
        stamp,
      );

      expect(items.editedAtOf(clientId)).toEqual(stamp);
    });
  });
});
