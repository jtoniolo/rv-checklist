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
// Ids a client minted offline, before the rows ever reached the server.
const clientTripId = '550e8400-e29b-41d4-a716-446655440077';
const clientStopId = '550e8400-e29b-41d4-a716-446655440078';

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
  const stops = new InMemoryStopRepository();
  // Wired with the stop repository so the atomic create-with-stops (issue
  // #120) lands its stops where the read path looks.
  const trips = new InMemoryTripRepository(stops);
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
        stops: [],
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

    it('creates the trip with its initial stops in one save — positions 0..n-1 in array order, arrived false (issue #120)', async () => {
      const { service } = await makeService();

      const trip = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Fall colours loop',
        startLocation: 'Home driveway, Ottawa',
        startPlaceId: 'ChIJHome123',
        checklistIds: [],
        stops: [
          { campground: 'Killbear Provincial Park', legKm: 245 },
          { campground: 'Pancake Bay' },
        ],
      });

      expect(trip.stops.map((s) => s.campground)).toEqual([
        'Killbear Provincial Park',
        'Pancake Bay',
      ]);
      expect(trip.stops.map((s) => s.position)).toEqual([0, 1]);
      expect(trip.stops.map((s) => s.arrived)).toEqual([false, false]);
      expect(trip.stops[0]?.legKm).toBe(245);
      expect(trip.status).toBe('planned');
      // Server-assigned ids, all distinct, all on this trip.
      expect(new Set(trip.stops.map((s) => s.id)).size).toBe(2);
      expect(trip.stops.every((s) => s.tripId === trip.id)).toBe(true);

      // The whole plan persisted — a later read returns the same trip.
      await expect(service.get(alice, trip.id)).resolves.toEqual(trip);
    });

    it("persists the owning rig's id on each stored initial stop but keeps it off the read (ADR-0028)", async () => {
      const { service, stops } = await makeService();

      const trip = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Fall colours loop',
        checklistIds: [],
        stops: [{ campground: 'Killbear' }, { campground: 'Pancake Bay' }],
      });

      const stored = await stops.listByTrip(trip.id);
      expect(stored.map((s) => s.rigId)).toEqual([aliceRigId, aliceRigId]);
      for (const stop of trip.stops) {
        expect(stop).not.toHaveProperty('rigId');
      }
    });

    it('refuses to create a trip on a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, {
          rigId: bobRigId,
          name: 'Nope',
          checklistIds: [],
          stops: [],
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
        stops: [],
      });
      await stops.save({
        id: goneChecklistId,
        tripId: trip.id,
        rigId: aliceRigId,
        position: 1,
        arrived: false,
      });
      await stops.save({
        id: aliceChecklistId,
        tripId: trip.id,
        rigId: aliceRigId,
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
        stops: [],
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
        stops: [],
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
        stops: [],
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
        stops: [],
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
        stops: [],
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
        stops: [],
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
        stops: [],
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

  // Client-generated ids on the trip create (ADR-0028, issue #143). A trip
  // create is the one that carries nested ids: an offline trip must produce
  // stops the operation queue can already name.
  describe('create with client-generated ids', () => {
    it('creates the trip and its stops under the supplied ids', async () => {
      const { service } = await makeService();

      const trip = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Fall colours loop',
        checklistIds: [],
        id: clientTripId,
        stops: [{ id: clientStopId, campground: 'Pine Hollow' }],
      });

      expect(trip.id).toBe(clientTripId);
      expect(trip.stops).toEqual([
        expect.objectContaining({
          id: clientStopId,
          position: 0,
          arrived: false,
        }),
      ]);
    });

    it('mints ids for the stops the client did not name', async () => {
      const { service } = await makeService();

      const trip = await service.create(alice, {
        rigId: aliceRigId,
        name: 'Mixed',
        checklistIds: [],
        stops: [{ id: clientStopId }, { campground: 'Server minted' }],
      });

      expect(trip.stops[0]?.id).toBe(clientStopId);
      expect(trip.stops[1]?.id).toEqual(expect.any(String));
      expect(trip.stops[1]?.id).not.toBe(clientStopId);
    });

    it('treats a re-post as success, leaving exactly one trip', async () => {
      const { service } = await makeService();
      const body = {
        rigId: aliceRigId,
        name: 'Fall colours loop',
        checklistIds: [],
        id: clientTripId,
        stops: [{ id: clientStopId, campground: 'Pine Hollow' }],
      };
      await service.create(alice, body);

      const replayed = await service.create(alice, body);

      expect(replayed.id).toBe(clientTripId);
      expect(replayed.stops).toHaveLength(1);
      await expect(service.list(alice, aliceRigId)).resolves.toHaveLength(1);
    });

    it('does not let the create body overwrite a trip edited since', async () => {
      const { service } = await makeService();
      const body = {
        rigId: aliceRigId,
        name: 'Original name',
        checklistIds: [],
        id: clientTripId,
        stops: [],
      };
      await service.create(alice, body);
      await service.update(alice, clientTripId, { name: 'Renamed since' });

      const replayed = await service.create(alice, body);

      expect(replayed.name).toBe('Renamed since');
    });

    it('never adopts a trip on another owner’s rig', async () => {
      const { service } = await makeService();
      await service.create(bob, {
        rigId: bobRigId,
        name: "Bob's trip",
        checklistIds: [],
        id: clientTripId,
        stops: [],
      });

      await expect(
        service.create(alice, {
          rigId: aliceRigId,
          name: 'Attempted takeover',
          checklistIds: [],
          id: clientTripId,
          stops: [],
        }),
      ).rejects.toThrow(NotFoundException);
      await expect(service.get(bob, clientTripId)).resolves.toMatchObject({
        name: "Bob's trip",
        rigId: bobRigId,
      });
      await expect(service.list(alice, aliceRigId)).resolves.toEqual([]);
    });

    it('initialises the trip’s edit time from X-Edited-At', async () => {
      const { service, trips } = await makeService();
      const stamp = new Date(Date.now() - 60_000);

      await service.create(
        alice,
        {
          rigId: aliceRigId,
          name: 'Queued offline',
          checklistIds: [],
          id: clientTripId,
          stops: [],
        },
        stamp,
      );

      expect(trips.editedAtOf(clientTripId)).toEqual(stamp);
    });

    it('leaves a re-posted trip’s edit time where it was', async () => {
      const { service, trips } = await makeService();
      const createdAt = new Date(Date.now() - 60_000);
      const body = {
        rigId: aliceRigId,
        name: 'Queued offline',
        checklistIds: [],
        id: clientTripId,
        stops: [],
      };
      await service.create(alice, body, createdAt);

      await service.create(alice, body, new Date(Date.now() - 10_000));

      expect(trips.editedAtOf(clientTripId)).toEqual(createdAt);
    });
  });
});
