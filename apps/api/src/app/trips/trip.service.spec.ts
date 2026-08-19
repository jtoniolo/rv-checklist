import { NotFoundException } from '@nestjs/common';
import type { Rig } from '@rv-checklist/domain';
import {
  InMemoryAttachmentRepository,
  InMemoryChecklistRepository,
  InMemoryRigRepository,
  InMemoryStopRepository,
  InMemoryTripRepository,
} from '@rv-checklist/domain/testing';
import { InMemoryObjectStorage } from '../storage/in-memory-object-storage.js';
import { TripService } from './trip.service.js';

const alice = '550e8400-e29b-41d4-a716-446655440001';
const bob = '550e8400-e29b-41d4-a716-446655440002';
const aliceRigId = '550e8400-e29b-41d4-a716-446655440010';
const bobRigId = '550e8400-e29b-41d4-a716-446655440011';
const aliceChecklistId = '550e8400-e29b-41d4-a716-446655440020';
const goneChecklistId = '550e8400-e29b-41d4-a716-446655440021';

const aliceRig: Rig = {
  id: aliceRigId,
  ownerId: alice,
  nickname: 'Silver Bullet',
};
const bobRig: Rig = { id: bobRigId, ownerId: bob, nickname: "Bob's Rig" };

async function makeService(): Promise<{
  service: TripService;
  trips: InMemoryTripRepository;
  stops: InMemoryStopRepository;
  checklists: InMemoryChecklistRepository;
}> {
  const trips = new InMemoryTripRepository();
  const stops = new InMemoryStopRepository();
  const checklists = new InMemoryChecklistRepository();
  const rigs = new InMemoryRigRepository();
  await rigs.save(aliceRig);
  await rigs.save(bobRig);
  await checklists.save({
    id: aliceChecklistId,
    rigId: aliceRigId,
    name: 'Pre-departure',
    tags: [],
    steps: [],
  });
  return {
    service: new TripService(
      trips,
      stops,
      checklists,
      rigs,
      new InMemoryAttachmentRepository(),
      new InMemoryObjectStorage(),
    ),
    trips,
    stops,
    checklists,
  };
}

describe('TripService', () => {
  describe('create', () => {
    it('assigns an id and reads back as a planned trip with no stops', async () => {
      const { service } = await makeService();

      const trip = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Fall colours loop',
        checklistIds: [],
      });

      expect(trip.id).toEqual(expect.any(String));
      expect(trip).toMatchObject({
        rigId: aliceRigId,
        name: 'Fall colours loop',
        checklistIds: [],
        stops: [],
        status: 'planned',
      });
    });

    it('refuses to create a trip on a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, {
          rigId: bobRigId,
          name: 'Nope',
          checklistIds: [],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('embeds each trip’s stops in position order with its derived status', async () => {
      const { service, stops } = await makeService();
      const trip = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Eastbound',
        checklistIds: [],
      });
      await stops.save({
        id: goneChecklistId,
        tripId: trip.id,
        position: 1,
        arrived: false,
      });
      await stops.save({
        id: aliceChecklistId,
        tripId: trip.id,
        position: 0,
        arrived: true,
      });

      const listed = await service.list(alice, aliceRigId);

      expect(listed).toHaveLength(1);
      expect(listed[0]?.stops.map((s) => s.position)).toEqual([0, 1]);
      expect(listed[0]?.status).toBe('underway');
    });

    it('refuses to list trips of a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(service.list(alice, bobRigId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('get', () => {
    it('returns the owner’s trip by id, read shape included', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Shakedown',
        checklistIds: [],
      });

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
    it('renames a trip and sets its start point', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Draft',
        checklistIds: [],
      });

      const updated = await service.update(alice, created.id, {
        name: 'Fall colours loop',
        startLocation: 'Home driveway, Ottawa',
        startPlaceId: 'ChIJHome123',
      });

      expect(updated).toMatchObject({
        name: 'Fall colours loop',
        startLocation: 'Home driveway, Ottawa',
        startPlaceId: 'ChIJHome123',
      });
    });

    it('clears the start point with null and leaves omitted fields unchanged', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Loop',
        startLocation: 'Ottawa',
        startPlaceId: 'ChIJHome123',
        checklistIds: [],
      });

      const updated = await service.update(alice, created.id, {
        // eslint-disable-next-line unicorn/no-null
        startPlaceId: null,
      });

      expect(updated.startPlaceId).toBeUndefined();
      expect(updated.startLocation).toBe('Ottawa');
      expect(updated.name).toBe('Loop');
    });

    it('replaces the whole checklistIds set', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Loop',
        checklistIds: [],
      });

      const updated = await service.update(alice, created.id, {
        checklistIds: [aliceChecklistId],
      });

      expect(updated.checklistIds).toEqual([aliceChecklistId]);
    });
  });

  describe('dangling checklist ids', () => {
    it('drops the id of a since-deleted checklist on read, keeping live ones', async () => {
      const { service, checklists } = await makeService();
      await checklists.save({
        id: goneChecklistId,
        rigId: aliceRigId,
        name: 'Doomed',
        tags: [],
        steps: [],
      });
      const created = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Loop',
        checklistIds: [aliceChecklistId, goneChecklistId],
      });

      await checklists.delete(goneChecklistId);

      const read = await service.get(alice, created.id);
      expect(read.checklistIds).toEqual([aliceChecklistId]);
    });
  });

  describe('delete', () => {
    it('removes the owner’s trip', async () => {
      const { service } = await makeService();
      const created = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Mistake',
        checklistIds: [],
      });

      await service.remove(alice, created.id);

      await expect(service.get(alice, created.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('owner isolation', () => {
    it('never lets another owner see, read, edit, or delete a trip', async () => {
      const { service } = await makeService();
      const aliceTrip = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Private',
        checklistIds: [],
      });

      await expect(service.list(bob, aliceRigId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.get(bob, aliceTrip.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.update(bob, aliceTrip.id, { name: 'Hijacked' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(bob, aliceTrip.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.get(alice, aliceTrip.id)).resolves.toEqual(
        aliceTrip,
      );
    });
  });
});
