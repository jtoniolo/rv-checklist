import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AttachmentRepository,
  ownedOrUndefined,
  RigRepository,
  StopRepository,
  TripRepository,
} from '@rv-checklist/api-data-access';
import type {
  CreateStop,
  Id,
  ReorderStop,
  StopRead,
  StoredStop,
  Trip,
  UpdateStop,
} from '@rv-checklist/domain';
import { ObjectStorage } from '../storage/object-storage.js';
import { stopAttachmentPrefix } from './attachment-keys.js';

/**
 * Stop authoring and the arrival operation, owner-scoped (issue #111). A stop
 * belongs to a trip, which belongs to a rig (ADR-0006), so ownership
 * (ADR-0003) is enforced *via the trip's rig* — a foreign stop id is
 * indistinguishable from "not found".
 *
 * This service owns the rig-Distance invariant (CONTEXT.md): on top of manual
 * adjustments, the rig's Distance includes exactly the legs of
 * currently-arrived stops. Every path that changes which legs count — arriving,
 * un-arriving, editing an *arrived* stop's `legKm`, deleting an arrived stop —
 * adjusts the rig by exactly the difference, and nothing else touches the rig.
 * The Distance never drops below zero: it is owner-maintained, and a manual
 * downward correction between arrivals wins over exactness.
 *
 * `position` is server-owned: creating appends at the end, deleting renumbers
 * the survivors contiguously (so a later append can never collide), and
 * {@link reorder} is the only way to move a stop.
 *
 * Every read comes back as a {@link StopRead}: the stored stop plus its
 * attachments' metadata (ADR-0026). Deleting a stop hard-deletes its
 * attachments — the database cascades the rows, and this service clears the
 * stop's one-prefix slice of the bucket.
 */
@Injectable()
export class StopService {
  constructor(
    private readonly stops: StopRepository,
    private readonly trips: TripRepository,
    private readonly rigs: RigRepository,
    private readonly attachments: AttachmentRepository,
    private readonly storage: ObjectStorage,
  ) {}

  /** A stored stop widened to the read shape: its attachments' metadata embedded. */
  private async toRead(stop: StoredStop): Promise<StopRead> {
    // The denormalized rig_id (ADR-0028) is sync plumbing, never wire data —
    // dropped here so no read path (REST or MCP) carries it out.
    const { rigId: _rigId, ...wireStop } = stop;
    const attachments = await this.attachments.listByStop(stop.id);
    return {
      ...wireStop,
      attachments: attachments.map(
        ({ rigId: _attachmentRigId, ...attachment }) => attachment,
      ),
    };
  }

  /** Whether the rig exists and belongs to the owner — the single ownership gate. */
  private async ownsRig(ownerId: Id, rigId: Id): Promise<boolean> {
    return (
      ownedOrUndefined(await this.rigs.findById(rigId), ownerId) !== undefined
    );
  }

  /** The trip if the owner owns it (via its rig), else `NotFound`. */
  private async ownedTrip(ownerId: Id, tripId: Id): Promise<Trip> {
    const trip = await this.trips.findById(tripId);
    if (trip && (await this.ownsRig(ownerId, trip.rigId))) {
      return trip;
    }
    throw new NotFoundException('Trip not found');
  }

  /** The stop and its trip if the owner owns them, else `NotFound`. */
  private async ownedStop(
    ownerId: Id,
    id: Id,
  ): Promise<{ stop: StoredStop; trip: Trip }> {
    const stop = await this.stops.findById(id);
    if (stop) {
      const trip = await this.trips.findById(stop.tripId);
      if (trip && (await this.ownsRig(ownerId, trip.rigId))) {
        return { stop, trip };
      }
    }
    throw new NotFoundException('Stop not found');
  }

  /**
   * Move the rig's Distance by `deltaKm` — the one place arrived legs land on
   * the rig. An unset Distance counts as 0 (the first arrival starts the
   * running total); the result is floored at 0 so backing a leg out after a
   * manual downward correction can never go negative.
   */
  private async adjustDistance(rigId: Id, deltaKm: number): Promise<void> {
    if (deltaKm === 0) {
      return;
    }
    const rig = await this.rigs.findById(rigId);
    if (!rig) {
      return;
    }
    await this.rigs.save({
      ...rig,
      distanceKm: Math.max(0, (rig.distanceKm ?? 0) + deltaKm),
    });
  }

  /** Renumber a trip's stops 0..n-1 in their current order, writing only movers. */
  private async renumber(tripId: Id): Promise<StoredStop[]> {
    const ordered = await this.stops.listByTrip(tripId);
    return Promise.all(
      ordered.map((stop, index) =>
        stop.position === index
          ? Promise.resolve(stop)
          : this.stops.save({ ...stop, position: index }),
      ),
    );
  }

  /** Append a stop at the end of one of the owner's trips — not yet arrived. */
  async create(ownerId: Id, input: CreateStop): Promise<StopRead> {
    const trip = await this.ownedTrip(ownerId, input.tripId);
    const siblings = await this.stops.listByTrip(trip.id);
    const saved = await this.stops.save({
      id: randomUUID(),
      position: siblings.length,
      arrived: false,
      // The owning rig's id, denormalized for sync (ADR-0028) — always the
      // trip's own, never client input; immutable after create.
      rigId: trip.rigId,
      ...input,
    });
    return this.toRead(saved);
  }

  /**
   * Apply a partial edit to one of the owner's stops (trip membership never
   * changes; `arrived` and `position` have their own operations). An explicit
   * `null` clears a field. Editing an **arrived** stop's `legKm` adjusts the
   * rig's Distance by the difference — the recorded travel changed, so the
   * running total follows; clearing it backs the whole leg out.
   */
  async update(ownerId: Id, id: Id, changes: UpdateStop): Promise<StopRead> {
    const { stop, trip } = await this.ownedStop(ownerId, id);
    const next: StoredStop = { ...stop };
    if (changes.campground === null) delete next.campground;
    else if (changes.campground !== undefined)
      next.campground = changes.campground;
    if (changes.placeId === null) delete next.placeId;
    else if (changes.placeId !== undefined) next.placeId = changes.placeId;
    if (changes.campsite === null) delete next.campsite;
    else if (changes.campsite !== undefined) next.campsite = changes.campsite;
    if (changes.arrivalDate === null) delete next.arrivalDate;
    else if (changes.arrivalDate !== undefined)
      next.arrivalDate = changes.arrivalDate;
    if (changes.nights === null) delete next.nights;
    else if (changes.nights !== undefined) next.nights = changes.nights;
    if (changes.checkInTime === null) delete next.checkInTime;
    else if (changes.checkInTime !== undefined)
      next.checkInTime = changes.checkInTime;
    if (changes.checkOutTime === null) delete next.checkOutTime;
    else if (changes.checkOutTime !== undefined)
      next.checkOutTime = changes.checkOutTime;
    if (changes.bookingNumber === null) delete next.bookingNumber;
    else if (changes.bookingNumber !== undefined)
      next.bookingNumber = changes.bookingNumber;
    if (changes.costCents === null) delete next.costCents;
    else if (changes.costCents !== undefined)
      next.costCents = changes.costCents;
    if (changes.address === null) delete next.address;
    else if (changes.address !== undefined) next.address = changes.address;
    if (changes.phone === null) delete next.phone;
    else if (changes.phone !== undefined) next.phone = changes.phone;
    if (changes.notes === null) delete next.notes;
    else if (changes.notes !== undefined) next.notes = changes.notes;
    if (changes.legKm === null) delete next.legKm;
    else if (changes.legKm !== undefined) next.legKm = changes.legKm;
    if (changes.legKmManual === null) delete next.legKmManual;
    else if (changes.legKmManual !== undefined)
      next.legKmManual = changes.legKmManual;

    if (stop.arrived) {
      await this.adjustDistance(
        trip.rigId,
        (next.legKm ?? 0) - (stop.legKm ?? 0),
      );
    }
    return this.toRead(await this.stops.save(next));
  }

  /**
   * The explicit arrival operation (issue #111): `true` marks the stop arrived
   * and logs its leg onto the rig's Distance; `false` un-arrives it and backs
   * the leg out. Idempotent — re-asserting the current state changes nothing,
   * so a leg can never be counted twice.
   */
  async setArrived(ownerId: Id, id: Id, isArrived: boolean): Promise<StopRead> {
    const { stop, trip } = await this.ownedStop(ownerId, id);
    if (stop.arrived === isArrived) {
      return this.toRead(stop);
    }
    if (stop.legKm !== undefined) {
      await this.adjustDistance(
        trip.rigId,
        isArrived ? stop.legKm : -stop.legKm,
      );
    }
    return this.toRead(await this.stops.save({ ...stop, arrived: isArrived }));
  }

  /**
   * Move one of the owner's stops to a new zero-based position on its trip
   * (a past-the-end position lands it last), renumbering the whole trip
   * contiguously. Returns the trip's stops in their new order. Legs ride with
   * their stops, so reordering never touches the rig's Distance.
   */
  async reorder(ownerId: Id, id: Id, body: ReorderStop): Promise<StopRead[]> {
    const { stop, trip } = await this.ownedStop(ownerId, id);
    const siblings = await this.stops.listByTrip(trip.id);
    const others = siblings.filter((s) => s.id !== stop.id);
    others.splice(Math.min(body.position, others.length), 0, stop);
    await Promise.all(
      others.map((s, index) =>
        s.position === index
          ? Promise.resolve(s)
          : this.stops.save({ ...s, position: index }),
      ),
    );
    const reordered = await this.stops.listByTrip(trip.id);
    return Promise.all(reordered.map((s) => this.toRead(s)));
  }

  /**
   * Delete one of the owner's stops. An arrived stop's leg is backed out of
   * the rig's Distance first (the stop no longer counts among the arrived
   * legs); the stop's slice of the bucket is cleared (ADR-0026 — the database
   * cascade only reaches the rows); the survivors are then renumbered
   * contiguously.
   */
  async remove(ownerId: Id, id: Id): Promise<void> {
    const { stop, trip } = await this.ownedStop(ownerId, id);
    if (stop.arrived && stop.legKm !== undefined) {
      await this.adjustDistance(trip.rigId, -stop.legKm);
    }
    await this.storage.deletePrefix(stopAttachmentPrefix(stop.id));
    await this.stops.delete(stop.id);
    await this.renumber(trip.id);
  }
}
