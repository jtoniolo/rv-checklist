import { NotFoundException } from '@nestjs/common';
import type { Rig, Trip } from '@rv-checklist/domain';
import {
  InMemoryAttachmentRepository,
  InMemoryRigRepository,
  InMemoryStopRepository,
  InMemoryTripRepository,
} from '@rv-checklist/domain/testing';
import { InMemoryObjectStorage } from '../storage/in-memory-object-storage.js';
import { StopService } from './stop.service.js';

const alice = '550e8400-e29b-41d4-a716-446655440001';
const bob = '550e8400-e29b-41d4-a716-446655440002';
const aliceRigId = '550e8400-e29b-41d4-a716-446655440010';
const bobRigId = '550e8400-e29b-41d4-a716-446655440011';
const aliceTripId = '550e8400-e29b-41d4-a716-446655440030';
const bobTripId = '550e8400-e29b-41d4-a716-446655440031';
// Ids a client minted offline, before the rows ever reached the server.
const clientStopId = '550e8400-e29b-41d4-a716-446655440077';

const aliceTrip: Trip = {
  id: aliceTripId,
  rigId: aliceRigId,
  name: 'Fall colours loop',
  checklistIds: [],
};
const bobTrip: Trip = {
  id: bobTripId,
  rigId: bobRigId,
  name: "Bob's trip",
  checklistIds: [],
};

async function makeService(aliceRig: Partial<Rig> = {}): Promise<{
  service: StopService;
  stops: InMemoryStopRepository;
  rigs: InMemoryRigRepository;
}> {
  const stops = new InMemoryStopRepository();
  const trips = new InMemoryTripRepository();
  const rigs = new InMemoryRigRepository();
  await rigs.save({
    id: aliceRigId,
    ownerId: alice,
    nickname: 'Silver Bullet',
    ...aliceRig,
  });
  await rigs.save({ id: bobRigId, ownerId: bob, nickname: "Bob's Rig" });
  await trips.save(aliceTrip);
  await trips.save(bobTrip);
  return {
    service: new StopService(
      stops,
      trips,
      rigs,
      new InMemoryAttachmentRepository(),
      new InMemoryObjectStorage(),
    ),
    stops,
    rigs,
  };
}

const aliceDistance = async (rigs: InMemoryRigRepository) => {
  const rig = await rigs.findById(aliceRigId);
  return rig?.distanceKm;
};

/**
 * One instant the whole timeline below hangs off, captured once. Reading
 * `Date.now()` per call made every helper return a *different* Date each time,
 * so a test that passed `deleteStamp()` into a write and then compared the
 * result against `deleteStamp()` was comparing two instants a tick apart — a
 * 1 ms flake whenever the clock happened to tick in between. Every offset here
 * is half an hour or more, so pinning the origin changes nothing else.
 */
const NOW = Date.now();

// LWW stamps (issue #141): clearly older / newer than any record the test just wrote.
const staleStamp = () => new Date(NOW - 60_000);
const newerStamp = () => new Date(NOW + 60_000);

// The replay timeline for the exempt-write clock (issue #143): the rows were
// last edited hours ago, the offline arrival is stamped an hour back, and the
// rename queued behind it half an hour back. Everything replays now.
const longAgo = () => new Date(NOW - 3 * 60 * 60 * 1000);
const arrivalStamp = () => new Date(NOW - 60 * 60 * 1000);
const renameStamp = () => new Date(NOW - 30 * 60 * 1000);
// An offline delete replaying at the same point in that timeline (issue #157).
const deleteStamp = arrivalStamp;

/**
 * Seed the rig with an edit clock that is already old — the state a row is
 * really in when a queued operation finally replays. The clock only ever moves
 * forward (that is the rule under test), so an old row has to be inserted as
 * one rather than saved and wound back.
 */
async function backdateRig(
  rigs: InMemoryRigRepository,
  when: Date,
): Promise<void> {
  const rig = await rigs.findById(aliceRigId);
  if (!rig) {
    throw new Error('backdateRig: no rig to backdate');
  }
  await rigs.delete(aliceRigId);
  await rigs.insert(rig, when);
}

describe('StopService', () => {
  describe('create', () => {
    it('appends at the end: fresh id, next position, not arrived', async () => {
      const { service } = await makeService();

      const first = await service.create(alice, { tripId: aliceTripId });
      const second = await service.create(alice, {
        tripId: aliceTripId,
        campground: 'KOA Kingston',
        legKm: 165,
      });

      expect(first).toMatchObject({ position: 0, arrived: false });
      expect(second).toMatchObject({
        position: 1,
        arrived: false,
        campground: 'KOA Kingston',
        legKm: 165,
      });
      expect(second.id).not.toBe(first.id);
    });

    it("persists the owning rig's id on the stored stop but keeps it off the read (ADR-0028)", async () => {
      const { service, stops } = await makeService();

      const created = await service.create(alice, { tripId: aliceTripId });

      const stored = await stops.findById(created.id);
      expect(stored?.rigId).toBe(aliceRigId);
      expect(created).not.toHaveProperty('rigId');
    });

    it('refuses to create a stop on a trip the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, { tripId: bobTripId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('sets, keeps, and clears detail fields (clear-vs-omit)', async () => {
      const { service } = await makeService();
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        campground: 'Algonquin',
        campsite: 'B-42',
        nights: 3,
      });

      const updated = await service.update(alice, stop.id, {
        // eslint-disable-next-line unicorn/no-null
        campsite: null,
        nights: 4,
      });

      expect(updated.campsite).toBeUndefined();
      expect(updated.nights).toBe(4);
      expect(updated.campground).toBe('Algonquin');
    });

    it('does not touch the rig’s Distance when the stop is not arrived', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 100,
      });

      await service.update(alice, stop.id, { legKm: 250 });

      expect(await aliceDistance(rigs)).toBe(1000);
    });

    it('sets and clears the legKmManual provenance flag (issue #121)', async () => {
      const { service } = await makeService();
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 100,
        legKmManual: true,
      });
      expect(stop.legKmManual).toBe(true);

      const fetched = await service.update(alice, stop.id, {
        legKm: 145,
        legKmManual: false,
      });
      expect(fetched.legKmManual).toBe(false);
      expect(fetched.legKm).toBe(145);

      const cleared = await service.update(alice, stop.id, {
        // eslint-disable-next-line unicorn/no-null
        legKm: null,
        // eslint-disable-next-line unicorn/no-null
        legKmManual: null,
      });
      expect(cleared.legKm).toBeUndefined();
      expect(cleared.legKmManual).toBeUndefined();
    });
  });

  describe('update under LWW — X-Edited-At (ADR-0028, issue #141)', () => {
    it('a stale stamp is a full no-op: record kept, no delta arithmetic', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 100,
      });
      await service.setArrived(alice, stop.id, true);

      const result = await service.update(
        alice,
        stop.id,
        { legKm: 250, campground: 'Stale camp' },
        staleStamp(),
      );

      // The current record comes back as a normal success — never an error.
      expect(result.legKm).toBe(100);
      expect(result.campground).toBeUndefined();
      expect(await aliceDistance(rigs)).toBe(1100);
    });

    it('a newer stamp applies, and the arrived-leg delta runs with it', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 100,
      });
      await service.setArrived(alice, stop.id, true);

      const result = await service.update(
        alice,
        stop.id,
        { legKm: 250 },
        newerStamp(),
      );

      expect(result.legKm).toBe(250);
      expect(await aliceDistance(rigs)).toBe(1250);
    });
  });

  describe('arrival — the Distance side effects (issue #111)', () => {
    it('arriving adds the stop’s legKm to the rig’s Distance', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 245,
      });

      const arrived = await service.setArrived(alice, stop.id, true);

      expect(arrived.arrived).toBe(true);
      expect(await aliceDistance(rigs)).toBe(1245);
    });

    it('treats an unset rig Distance as 0 when the first leg lands', async () => {
      const { service, rigs } = await makeService();
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 120,
      });

      await service.setArrived(alice, stop.id, true);

      expect(await aliceDistance(rigs)).toBe(120);
    });

    it('arriving a stop with no legKm changes nothing', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, { tripId: aliceTripId });

      await service.setArrived(alice, stop.id, true);

      expect(await aliceDistance(rigs)).toBe(1000);
    });

    it('is idempotent — arriving an already-arrived stop adds nothing', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 245,
      });

      await service.setArrived(alice, stop.id, true);
      await service.setArrived(alice, stop.id, true);

      expect(await aliceDistance(rigs)).toBe(1245);
    });

    it('un-arriving subtracts the leg again', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 245,
      });

      await service.setArrived(alice, stop.id, true);
      const back = await service.setArrived(alice, stop.id, false);

      expect(back.arrived).toBe(false);
      expect(await aliceDistance(rigs)).toBe(1000);
    });

    it('editing an arrived stop’s legKm adjusts the rig by the difference', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 200,
      });
      await service.setArrived(alice, stop.id, true);

      await service.update(alice, stop.id, { legKm: 250 });

      // 1000 base + 200 on arrival + 50 difference = exactly the new leg on top.
      expect(await aliceDistance(rigs)).toBe(1250);
    });

    it('clearing an arrived stop’s legKm backs the whole leg out', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 200,
      });
      await service.setArrived(alice, stop.id, true);

      // eslint-disable-next-line unicorn/no-null
      await service.update(alice, stop.id, { legKm: null });

      expect(await aliceDistance(rigs)).toBe(1000);
    });

    it('setting a legKm on an already-arrived stop that had none adds it', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, { tripId: aliceTripId });
      await service.setArrived(alice, stop.id, true);

      await service.update(alice, stop.id, { legKm: 85 });

      expect(await aliceDistance(rigs)).toBe(1085);
    });

    it('deleting an arrived stop subtracts its legKm', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 245,
      });
      await service.setArrived(alice, stop.id, true);

      await service.remove(alice, stop.id);

      expect(await aliceDistance(rigs)).toBe(1000);
    });

    it('deleting a planned (not arrived) stop leaves the Distance alone', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 245,
      });

      await service.remove(alice, stop.id);

      expect(await aliceDistance(rigs)).toBe(1000);
    });

    it('never drives the Distance below zero', async () => {
      const { service, rigs } = await makeService({ distanceKm: 100 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 245,
      });
      await service.setArrived(alice, stop.id, true);
      // The owner manually corrects the rig downwards in the meantime.
      const rig = await rigs.findById(aliceRigId);
      if (!rig) throw new Error('rig fixture missing');
      await rigs.save({ ...rig, distanceKm: 50 });

      await service.setArrived(alice, stop.id, false);

      expect(await aliceDistance(rigs)).toBe(0);
    });

    it('holds the invariant: manual base plus exactly the arrived legs', async () => {
      // On top of manual adjustments, the rig's Distance includes exactly the
      // legs of currently-arrived stops — worked through a whole trip's life.
      const { service, rigs } = await makeService({ distanceKm: 10_000 });
      const a = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 100,
      });
      const b = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 200,
      });
      const c = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 300,
      });

      await service.setArrived(alice, a.id, true); // +100 → arrived legs: 100
      await service.setArrived(alice, b.id, true); // +200 → arrived legs: 300
      await service.update(alice, b.id, { legKm: 250 }); // ±50 → arrived legs: 350
      await service.setArrived(alice, a.id, false); // -100 → arrived legs: 250
      await service.setArrived(alice, c.id, true); // +300 → arrived legs: 550
      await service.remove(alice, c.id); // -300 → arrived legs: 250

      expect(await aliceDistance(rigs)).toBe(10_000 + 250);
    });
  });

  describe('reorder', () => {
    it('moves a stop to a new position and renumbers the trip contiguously', async () => {
      const { service } = await makeService();
      const a = await service.create(alice, {
        tripId: aliceTripId,
        campground: 'A',
      });
      await service.create(alice, { tripId: aliceTripId, campground: 'B' });
      await service.create(alice, { tripId: aliceTripId, campground: 'C' });

      const ordered = await service.reorder(alice, a.id, { position: 2 });

      expect(ordered.map((s) => s.campground)).toEqual(['B', 'C', 'A']);
      expect(ordered.map((s) => s.position)).toEqual([0, 1, 2]);
    });

    it('clamps a past-the-end position to the last slot', async () => {
      const { service } = await makeService();
      const a = await service.create(alice, {
        tripId: aliceTripId,
        campground: 'A',
      });
      await service.create(alice, { tripId: aliceTripId, campground: 'B' });

      const ordered = await service.reorder(alice, a.id, { position: 99 });

      expect(ordered.map((s) => s.campground)).toEqual(['B', 'A']);
    });
  });

  describe('delete keeps positions contiguous', () => {
    it('renumbers the remaining stops so a later create cannot collide', async () => {
      const { service, stops } = await makeService();
      await service.create(alice, { tripId: aliceTripId, campground: 'A' });
      const b = await service.create(alice, {
        tripId: aliceTripId,
        campground: 'B',
      });
      await service.create(alice, { tripId: aliceTripId, campground: 'C' });

      await service.remove(alice, b.id);
      const d = await service.create(alice, {
        tripId: aliceTripId,
        campground: 'D',
      });

      const ordered = await stops.listByTrip(aliceTripId);
      expect(ordered.map((s) => s.campground)).toEqual(['A', 'C', 'D']);
      expect(ordered.map((s) => s.position)).toEqual([0, 1, 2]);
      expect(d.position).toBe(2);
    });
  });

  describe('owner isolation', () => {
    it('never lets another owner touch a stop, arrival included', async () => {
      const { service, rigs } = await makeService({ distanceKm: 1000 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 245,
      });

      await expect(
        service.update(bob, stop.id, { campground: 'Hijacked' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.setArrived(bob, stop.id, true),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.reorder(bob, stop.id, { position: 0 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(bob, stop.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(await aliceDistance(rigs)).toBe(1000);
    });
  });

  // Client-generated ids on the stop create (ADR-0028, issue #143).
  describe('create with a client-generated id', () => {
    it('appends under the supplied id', async () => {
      const { service } = await makeService();

      const stop = await service.create(alice, {
        tripId: aliceTripId,
        id: clientStopId,
        campground: 'Pine Hollow',
      });

      expect(stop).toMatchObject({ id: clientStopId, position: 0 });
    });

    it('treats a re-post as success, leaving one stop on the trip', async () => {
      const { service, stops } = await makeService();
      await service.create(alice, { tripId: aliceTripId, id: clientStopId });

      const replayed = await service.create(alice, {
        tripId: aliceTripId,
        id: clientStopId,
      });

      expect(replayed.id).toBe(clientStopId);
      await expect(stops.listByTrip(aliceTripId)).resolves.toHaveLength(1);
    });

    it('keeps rigId server-derived — a client id names the row, not its parents', async () => {
      const { service, stops } = await makeService();

      await service.create(alice, { tripId: aliceTripId, id: clientStopId });

      await expect(stops.findById(clientStopId)).resolves.toMatchObject({
        rigId: aliceRigId,
      });
    });

    it('never adopts a stop sitting on someone else’s trip', async () => {
      const { service, stops } = await makeService();
      await service.create(bob, { tripId: bobTripId, id: clientStopId });

      await expect(
        service.create(alice, { tripId: aliceTripId, id: clientStopId }),
      ).rejects.toThrow(NotFoundException);
      await expect(stops.findById(clientStopId)).resolves.toMatchObject({
        tripId: bobTripId,
      });
      await expect(stops.listByTrip(aliceTripId)).resolves.toEqual([]);
    });
  });

  /**
   * The exempt-write edit-clock rule (ADR-0028, issue #143). Arrival and
   * reorder are exempt from the LWW *gate*, not from the *stamp*: before this,
   * they re-stamped the row (and the rig) to server receipt time, and the same
   * client's next queued edit was then dropped as stale. The fix stores
   * max(stored, clamped) instead — forward-only, so it closes that gap without
   * letting a third device's stale write win.
   */
  describe('the exempt-write edit clock', () => {
    it('leaves the rig’s clock behind the edit queued after an offline arrival', async () => {
      const { service, rigs } = await makeService();
      await backdateRig(rigs, longAgo());
      const stop = await service.create(
        alice,
        { tripId: aliceTripId, legKm: 120 },
        longAgo(),
      );

      await service.setArrived(alice, stop.id, true, arrivalStamp());

      // The rename the client queued behind the arrival is older than now but
      // newer than the arrival. Re-stamping the rig to "now" dropped it — the
      // reported bug; max(stored, clamped) lets it land.
      const { applied } = await rigs.saveIfNewer(
        { id: aliceRigId, ownerId: alice, nickname: 'Renamed offline' },
        renameStamp(),
      );
      expect(applied).toBe(true);
      await expect(rigs.findById(aliceRigId)).resolves.toMatchObject({
        nickname: 'Renamed offline',
      });
    });

    it('leaves the stop’s own clock behind that queued edit too', async () => {
      const { service, stops } = await makeService();
      const stamp = arrivalStamp();
      const stop = await service.create(
        alice,
        { tripId: aliceTripId, legKm: 120 },
        longAgo(),
      );

      await service.setArrived(alice, stop.id, true, stamp);

      expect(stops.editedAtOf(stop.id)).toEqual(stamp);
    });

    it('applies the Distance delta regardless — exemption is from the gate', async () => {
      const { service, rigs } = await makeService({ distanceKm: 500 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 120,
      });

      await service.setArrived(alice, stop.id, true, staleStamp());

      expect(await aliceDistance(rigs)).toBe(620);
    });

    it('never winds a clock backwards below a newer stored edit', async () => {
      const { service, rigs, stops } = await makeService();
      const stop = await service.create(
        alice,
        { tripId: aliceTripId, legKm: 120 },
        longAgo(),
      );
      // A newer edit from another device lands first.
      await stops.saveIfNewer({ ...stop, rigId: aliceRigId }, newerStamp());
      const newerStored = stops.editedAtOf(stop.id);

      await service.setArrived(alice, stop.id, true, staleStamp());

      // max(stored, clamped) keeps the newer stamp, so a third device's stale
      // queued write still loses — the reason this is not a plain overwrite.
      expect(stops.editedAtOf(stop.id)).toEqual(newerStored);
      expect(await aliceDistance(rigs)).toBe(120);
    });

    it('stamps server now when arrival carries no header — unchanged from before', async () => {
      const { service, stops } = await makeService();
      const stop = await service.create(
        alice,
        { tripId: aliceTripId },
        longAgo(),
      );
      const before = Date.now();

      await service.setArrived(alice, stop.id, true);

      expect(stops.editedAtOf(stop.id)?.getTime()).toBeGreaterThanOrEqual(
        before,
      );
    });

    it('stamps every stop a reorder moves with max(stored, clamped)', async () => {
      const { service, stops } = await makeService();
      const first = await service.create(
        alice,
        { tripId: aliceTripId },
        longAgo(),
      );
      const second = await service.create(
        alice,
        { tripId: aliceTripId },
        longAgo(),
      );
      const stamp = arrivalStamp();

      await service.reorder(alice, second.id, { position: 0 }, stamp);

      expect(stops.editedAtOf(first.id)).toEqual(stamp);
      expect(stops.editedAtOf(second.id)).toEqual(stamp);
    });

    /**
     * A delete never participates in the gate — it always applies, with or
     * without a stamp. What it must not do is re-stamp the records it touches
     * as a *side effect* to server now: that dropped the edits queued behind an
     * offline delete exactly as an arrival used to (issue #157).
     */
    it('leaves the rig’s clock behind the edit queued after an offline delete', async () => {
      const { service, rigs } = await makeService();
      await backdateRig(rigs, longAgo());
      const stop = await service.create(
        alice,
        { tripId: aliceTripId, legKm: 120 },
        longAgo(),
      );
      await service.setArrived(alice, stop.id, true, longAgo());

      await service.remove(alice, stop.id, deleteStamp());

      const { applied } = await rigs.saveIfNewer(
        { id: aliceRigId, ownerId: alice, nickname: 'Renamed offline' },
        renameStamp(),
      );
      expect(applied).toBe(true);
      await expect(rigs.findById(aliceRigId)).resolves.toMatchObject({
        nickname: 'Renamed offline',
      });
    });

    it('leaves a renumbered sibling’s clock behind that queued edit too', async () => {
      const { service, stops } = await makeService();
      const doomed = await service.create(
        alice,
        { tripId: aliceTripId },
        longAgo(),
      );
      const survivor = await service.create(
        alice,
        { tripId: aliceTripId, campground: 'KOA Kingston' },
        longAgo(),
      );

      // Deleting the first stop renumbers the survivor from 1 to 0.
      await service.remove(alice, doomed.id, deleteStamp());

      expect(stops.editedAtOf(survivor.id)).toEqual(deleteStamp());
      const stored = await stops.findById(survivor.id);
      if (!stored) throw new Error('the survivor should still be stored');
      const { applied } = await stops.saveIfNewer(
        { ...stored, campground: 'Renamed offline' },
        renameStamp(),
      );
      expect(applied).toBe(true);
    });

    it('deletes regardless of the stamp — delete never joins the gate', async () => {
      const { service, stops, rigs } = await makeService({ distanceKm: 500 });
      const stop = await service.create(alice, {
        tripId: aliceTripId,
        legKm: 120,
      });
      await service.setArrived(alice, stop.id, true);

      await service.remove(alice, stop.id, staleStamp());

      await expect(stops.findById(stop.id)).resolves.toBeUndefined();
      expect(await aliceDistance(rigs)).toBe(500);
    });

    it('stamps server now when a delete carries no header — unchanged from before', async () => {
      const { service, stops } = await makeService();
      const doomed = await service.create(
        alice,
        { tripId: aliceTripId },
        longAgo(),
      );
      const survivor = await service.create(
        alice,
        { tripId: aliceTripId },
        longAgo(),
      );
      const before = Date.now();

      await service.remove(alice, doomed.id);

      expect(stops.editedAtOf(survivor.id)?.getTime()).toBeGreaterThanOrEqual(
        before,
      );
    });
  });
});
