import { NotFoundException } from '@nestjs/common';
import type { CreateRig } from '@rv-checklist/domain';
import { InMemoryRigRepository } from '@rv-checklist/domain/testing';
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

function makeService(): { service: RigService; repo: InMemoryRigRepository } {
  const repo = new InMemoryRigRepository();
  return { service: new RigService(repo), repo };
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

      await expect(service.get(alice, created.id)).resolves.toEqual(created);
    });

    it('throws NotFound for an id that does not exist', async () => {
      const { service } = makeService();

      await expect(service.get(alice, bob)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('applies a partial edit and persists it', async () => {
      const { service } = makeService();
      const created = await service.create(alice, airstream);

      const updated = await service.update(alice, created.id, { year: 2022 });

      expect(updated).toEqual({ ...created, year: 2022 });
      await expect(service.get(alice, created.id)).resolves.toEqual(updated);
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
      await expect(service.get(alice, aliceRig.id)).resolves.toEqual(aliceRig);

      // Bob cannot delete it, and Alice's rig survives.
      await expect(service.remove(bob, aliceRig.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.get(alice, aliceRig.id)).resolves.toEqual(aliceRig);
    });
  });
});
