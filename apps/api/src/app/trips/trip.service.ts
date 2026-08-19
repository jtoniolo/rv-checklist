import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
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
  type Trip,
  type TripRead,
  type UpdateTrip,
} from '@rv-checklist/domain';

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
 * Deleting a trip cascades its stops (and their coming attachments, ADR-0026)
 * at the database, and unlinks — never deletes — its runs. The rig's Distance
 * is untouched: the km were really driven; only *stop-level* operations
 * (arrive, un-arrive, leg edits, stop delete — {@link StopService}) adjust it.
 */
@Injectable()
export class TripService {
  constructor(
    private readonly trips: TripRepository,
    private readonly stops: StopRepository,
    private readonly checklists: ChecklistRepository,
    private readonly rigs: RigRepository,
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

  /** A stored trip widened to the read shape: ordered stops, derived status, live checklist ids. */
  private async toRead(trip: Trip): Promise<TripRead> {
    const stops = await this.stops.listByTrip(trip.id);
    return {
      ...trip,
      checklistIds: await this.liveChecklistIds(trip),
      stops,
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

  /** Create a trip on one of the owner's rigs — the server assigns the id. */
  async create(ownerId: Id, input: CreateTrip): Promise<TripRead> {
    if (!(await this.ownsRig(ownerId, input.rigId))) {
      throw new NotFoundException('Rig not found');
    }
    return this.toRead(await this.trips.save({ id: randomUUID(), ...input }));
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

  /** Delete one of the owner's trips (its stops go with it; its runs are unlinked). */
  async remove(ownerId: Id, id: Id): Promise<void> {
    const trip = await this.ownedTrip(ownerId, id);
    await this.trips.delete(trip.id);
  }
}
