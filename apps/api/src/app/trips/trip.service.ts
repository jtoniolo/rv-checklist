import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AttachmentRepository,
  ChecklistRepository,
  ownedOrUndefined,
  RigRepository,
  StopRepository,
  TripRepository,
} from '@rv-checklist/api-data-access';
import {
  tripStatus,
  type CreateTrip,
  type Id,
  type StopRead,
  type StoredStop,
  type Trip,
  type TripRead,
  type UpdateTrip,
} from '@rv-checklist/domain';
import { ObjectStorage } from '../storage/object-storage.js';
import { stopAttachmentPrefix } from './attachment-keys.js';

/**
 * Trip CRUD, owner-scoped (issue #111). A trip belongs to a rig (ADR-0006), so
 * ownership (ADR-0003) is enforced *via the rig*, exactly as
 * {@link MaintenanceTaskService} does: every operation resolves the trip's (or
 * target) rig through {@link ownedOrUndefined}, so a foreign id is
 * indistinguishable from "not found".
 *
 * Every read comes back as a {@link TripRead}: the stored trip plus its stops
 * in position order and the derived `status` (CONTEXT.md — status is derived
 * from which stops are arrived, never stored). `checklistIds` is the
 * denormalized grouping (ADR-0017's pattern), unconstrained in the database,
 * so reads drop the id of a since-deleted checklist instead of failing.
 *
 * Deleting a trip cascades its stops and their attachments (ADR-0026): the
 * database cascade reaches the rows, and this service clears each stop's
 * one-prefix slice of the bucket — objects the database cannot touch. Runs
 * are unlinked, never deleted. The rig's Distance is untouched: the km were
 * really driven; only *stop-level* operations (arrive, un-arrive, leg edits,
 * stop delete — {@link StopService}) adjust it.
 */
@Injectable()
export class TripService {
  constructor(
    private readonly trips: TripRepository,
    private readonly stops: StopRepository,
    private readonly checklists: ChecklistRepository,
    private readonly rigs: RigRepository,
    private readonly attachments: AttachmentRepository,
    private readonly storage: ObjectStorage,
  ) {}

  /** Whether the rig exists and belongs to the owner — the single ownership gate. */
  private async ownsRig(ownerId: Id, rigId: Id): Promise<boolean> {
    return (
      ownedOrUndefined(await this.rigs.findById(rigId), ownerId) !== undefined
    );
  }

  /** The stored trip if the owner owns it (via its rig), else `NotFound`. */
  private async ownedTrip(ownerId: Id, id: Id): Promise<Trip> {
    const trip = await this.trips.findById(id);
    if (trip && (await this.ownsRig(ownerId, trip.rigId))) {
      return trip;
    }
    throw new NotFoundException('Trip not found');
  }

  /** A stored stop widened to the read shape: its attachments' metadata embedded (ADR-0026). */
  private async toStopRead(stop: StoredStop): Promise<StopRead> {
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

  /** A stored trip widened to the read shape: ordered stops (with attachments), derived status, live checklist ids. */
  private async toRead(trip: Trip): Promise<TripRead> {
    const stops = await this.stops.listByTrip(trip.id);
    return {
      ...trip,
      checklistIds: await this.liveChecklistIds(trip),
      stops: await Promise.all(stops.map((stop) => this.toStopRead(stop))),
      status: tripStatus(stops),
    };
  }

  /** The trip's checklist ids minus any pointing at a since-deleted checklist. */
  private async liveChecklistIds(trip: Trip): Promise<Id[]> {
    if (trip.checklistIds.length === 0) {
      return [];
    }
    const checklists = await this.checklists.listByRig(trip.rigId);
    const live = new Set(checklists.map((c) => c.id));
    return trip.checklistIds.filter((id) => live.has(id));
  }

  /**
   * Create a trip — with any initial stops — on one of the owner's rigs, in
   * one atomic save (issue #120). The server assigns every id, positions the
   * stops 0..n-1 in array order, and starts each un-arrived (arrival is an
   * explicit operation with Distance side effects). An empty `stops` stays
   * valid: the at-least-one-stop rule is the web form's, not the wire's.
   */
  async create(ownerId: Id, input: CreateTrip): Promise<TripRead> {
    if (!(await this.ownsRig(ownerId, input.rigId))) {
      throw new NotFoundException('Rig not found');
    }
    const { stops, ...tripFields } = input;
    const trip: Trip = { id: randomUUID(), ...tripFields };
    const initialStops: StoredStop[] = stops.map((stop, position) => ({
      ...stop,
      id: randomUUID(),
      tripId: trip.id,
      // The owning rig's id, denormalized for sync (ADR-0028) — always the
      // trip's own, never client input; immutable after create.
      rigId: trip.rigId,
      position,
      arrived: false,
    }));
    return this.toRead(await this.trips.createWithStops(trip, initialStops));
  }

  /** The trips of one of the owner's rigs, each with stops and status embedded. */
  async list(ownerId: Id, rigId: Id): Promise<TripRead[]> {
    if (!(await this.ownsRig(ownerId, rigId))) {
      throw new NotFoundException('Rig not found');
    }
    const trips = await this.trips.listByRig(rigId);
    return Promise.all(trips.map((trip) => this.toRead(trip)));
  }

  /** One of the owner's trips, or `NotFound` if missing or another's. */
  async get(ownerId: Id, id: Id): Promise<TripRead> {
    return this.toRead(await this.ownedTrip(ownerId, id));
  }

  /**
   * Apply a partial edit to one of the owner's trips (rig membership never
   * changes). An explicit `null` clears a start-point field; `checklistIds`
   * replaces the whole set, like a task's tags (issue #41).
   */
  async update(ownerId: Id, id: Id, changes: UpdateTrip): Promise<TripRead> {
    const next: Trip = { ...(await this.ownedTrip(ownerId, id)) };
    if (changes.name !== undefined) next.name = changes.name;
    if (changes.startLocation === null) delete next.startLocation;
    else if (changes.startLocation !== undefined)
      next.startLocation = changes.startLocation;
    if (changes.startPlaceId === null) delete next.startPlaceId;
    else if (changes.startPlaceId !== undefined)
      next.startPlaceId = changes.startPlaceId;
    if (changes.checklistIds !== undefined)
      next.checklistIds = changes.checklistIds;
    return this.toRead(await this.trips.save(next));
  }

  /**
   * Delete one of the owner's trips (its stops go with it; its runs are
   * unlinked). Each stop's attachment objects are cleared from the bucket
   * first — the database cascade only reaches the rows (ADR-0026).
   */
  async remove(ownerId: Id, id: Id): Promise<void> {
    const trip = await this.ownedTrip(ownerId, id);
    const stops = await this.stops.listByTrip(trip.id);
    for (const stop of stops) {
      await this.storage.deletePrefix(stopAttachmentPrefix(stop.id));
    }
    await this.trips.delete(trip.id);
  }
}
