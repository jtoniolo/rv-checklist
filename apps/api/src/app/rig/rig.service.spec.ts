import { NotFoundException } from '@nestjs/common';
import type { CreateRig } from '@rv-checklist/domain';
import {
  InMemoryEquipmentItemRepository,
  InMemoryRigRepository,
} from '@rv-checklist/domain/testing';
import { RigService } from './rig.service.js';

const alice = '550e8400-e29b-41d4-a716-446655440001';
const bob = '550e8400-e29b-41d4-a716-446655440002';

const airstream: CreateRig = {
  vin: '1FDXE4FS1234567890',
  make: 'Airstream',
  model: 'Flying Cloud',
  year: 2021,
  nickname: 'Silver Bullet',
};

function makeService(): {
  service: RigService;
  repo: InMemoryRigRepository;
  equipmentRepo: InMemoryEquipmentItemRepository;
} {
  const repo = new InMemoryRigRepository();
  const equipmentRepo = new InMemoryEquipmentItemRepository();
  return { service: new RigService(repo, equipmentRepo), repo, equipmentRepo };
}

describe('RigService', () => {
  describe('create', () => {
    it('assigns an id and the authenticated owner, keeping the given fields', async () => {
      const { service } = makeService();

      const rig = await service.create(alice, airstream);

      expect(rig).toMatchObject({ ...airstream, ownerId: alice });
      expect(rig.id).toEqual(expect.any(String));
    });

    it('gives each rig a distinct id', async () => {
      const { service } = makeService();

      const first = await service.create(alice, airstream);
      const second = await service.create(alice, airstream);

      expect(first.id).not.toEqual(second.id);
    });
  });

  describe('list', () => {
    it('returns the owner’s rigs', async () => {
      const { service } = makeService();
      await service.create(alice, airstream);
      await service.create(alice, { ...airstream, nickname: 'Second' });

      const rigs = await service.list(alice);

      expect(rigs).toHaveLength(2);
      expect(new Set(rigs.map((r) => r.nickname))).toEqual(
        new Set(['Second', 'Silver Bullet']),
      );
    });
  });

  describe('get', () => {
    it('returns the owner’s rig by id', async () => {
      const { service } = makeService();
      const created = await service.create(alice, airstream);

      await expect(service.get(alice, created.id)).resolves.toEqual({
        ...created,
        equipment: [],
      });
    });

    it('throws NotFound for an id that does not exist', async () => {
      const { service } = makeService();

      await expect(service.get(alice, bob)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('includes the rig’s equipment items', async () => {
      const { service, equipmentRepo } = makeService();
      const created = await service.create(alice, airstream);

      await equipmentRepo.save({
        id: '550e8400-e29b-41d4-a716-446655440010',
        rigId: created.id,
        name: 'Surge protector',
        costCents: 8999,
      });

      const result = await service.get(alice, created.id);

      expect(result.equipment).toHaveLength(1);
      expect(result.equipment[0]).toMatchObject({
        name: 'Surge protector',
        costCents: 8999,
      });
    });

    it('returns an empty equipment array when the rig has none', async () => {
      const { service } = makeService();
      const created = await service.create(alice, airstream);

      const result = await service.get(alice, created.id);

      expect(result.equipment).toEqual([]);
    });
  });

  describe('update', () => {
    it('a stale X-Edited-At stamp is a no-op returning the current record (issue #141)', async () => {
      const { service } = makeService();
      const created = await service.create(alice, airstream);

      const result = await service.update(
        alice,
        created.id,
        { nickname: 'Stale rename' },
        new Date(Date.now() - 60_000),
      );

      // The current record comes back as a normal success — never an error.
      expect(result.nickname).toBe('Silver Bullet');
      await expect(service.get(alice, created.id)).resolves.toMatchObject({
        nickname: 'Silver Bullet',
      });
    });

    it('a newer X-Edited-At stamp applies (issue #141)', async () => {
      const { service } = makeService();
      const created = await service.create(alice, airstream);

      const result = await service.update(
        alice,
        created.id,
        { nickname: 'Fresh rename' },
        new Date(Date.now() + 60_000),
      );

      expect(result.nickname).toBe('Fresh rename');
      await expect(service.get(alice, created.id)).resolves.toMatchObject({
        nickname: 'Fresh rename',
      });
    });

    it('applies a partial edit and persists it', async () => {
      const { service } = makeService();
      const created = await service.create(alice, airstream);

      const updated = await service.update(alice, created.id, { year: 2022 });

      expect(updated).toEqual({ ...created, year: 2022 });
      await expect(service.get(alice, created.id)).resolves.toEqual({
        ...updated,
        equipment: [],
      });
    });

    // The rig's current Distance (issue #32) is set and cleared by the owner.
    it('sets the rig’s current Distance', async () => {
      const { service } = makeService();
      const created = await service.create(alice, airstream);

      const updated = await service.update(alice, created.id, {
        distanceKm: 38_200,
      });

      expect(updated.distanceKm).toBe(38_200);
      await expect(service.get(alice, created.id)).resolves.toMatchObject({
        distanceKm: 38_200,
      });
    });

    it('clears the rig’s Distance with an explicit null', async () => {
      const { service } = makeService();
      const created = await service.create(alice, {
        ...airstream,
        distanceKm: 38_200,
      });

      const updated = await service.update(alice, created.id, {
        // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
        distanceKm: null,
      });

      expect(updated.distanceKm).toBeUndefined();
      await expect(service.get(alice, created.id)).resolves.not.toHaveProperty(
        'distanceKm',
      );
    });

    it('leaves the Distance unchanged when the key is omitted', async () => {
      const { service } = makeService();
      const created = await service.create(alice, {
        ...airstream,
        distanceKm: 38_200,
      });

      const updated = await service.update(alice, created.id, { year: 2022 });

      expect(updated.distanceKm).toBe(38_200);
    });

    // The rig's Dimensions (issue #139) carry the same null-clears marker.
    it('sets and clears a Dimension with the null marker', async () => {
      const { service } = makeService();
      const created = await service.create(alice, {
        ...airstream,
        travelHeightMm: 4110,
      });

      const updated = await service.update(alice, created.id, {
        clearancePassengerMm: 900,
      });
      expect(updated).toMatchObject({
        travelHeightMm: 4110,
        clearancePassengerMm: 900,
      });

      const cleared = await service.update(alice, created.id, {
        // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
        travelHeightMm: null,
      });
      expect(cleared.travelHeightMm).toBeUndefined();
      expect(cleared.clearancePassengerMm).toBe(900);
    });
  });

  describe('delete', () => {
    it('removes the owner’s rig', async () => {
      const { service } = makeService();
      const created = await service.create(alice, airstream);

      await service.remove(alice, created.id);

      await expect(service.list(alice)).resolves.toEqual([]);
    });
  });

  // The row-level ownership guarantee (ADR-0003), proven at the use-case seam.
  describe('owner isolation', () => {
    it('never lets another owner see, read, edit, or delete a rig', async () => {
      const { service } = makeService();
      const aliceRig = await service.create(alice, airstream);

      // Bob sees nothing of Alice's.
      await expect(service.list(bob)).resolves.toEqual([]);

      // Bob cannot read it — its existence is indistinguishable from "not found".
      await expect(service.get(bob, aliceRig.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      // Bob cannot edit it, and Alice's rig is untouched.
      await expect(
        service.update(bob, aliceRig.id, { nickname: 'Hijacked' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.get(alice, aliceRig.id)).resolves.toEqual({
        ...aliceRig,
        equipment: [],
      });

      // Bob cannot delete it, and Alice's rig survives.
      await expect(service.remove(bob, aliceRig.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.get(alice, aliceRig.id)).resolves.toEqual({
        ...aliceRig,
        equipment: [],
      });
    });
  });
});
