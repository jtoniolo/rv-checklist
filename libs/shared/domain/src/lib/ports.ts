import type { StoredAttachment } from './attachment.js';
import type { Checklist } from './checklist.js';
import type { Id } from './common.js';
import type { EquipmentItem } from './equipment.js';
import type { LogEntry } from './log-entry.js';
import type { MaintenanceTask } from './maintenance-task.js';
import type { Rig } from './rig.js';
import type { Run } from './run.js';
import type { StoredStop, Trip } from './trip.js';

/**
 * Repository ports — the seam that makes the whole core loop unit-testable without a
 * database (spec §Testing). One interface per aggregate, expressed purely in domain terms:
 * no TypeORM, SQL, or persistence shape leaks through. Production binds these to the
 * TypeORM implementations in `libs/api/data-access`; tests bind them to the in-memory
 * double under `@rv-checklist/domain/testing`.
 *
 * `save` is upsert (create-or-replace the whole aggregate); the use-case assigns ids and
 * builds the full aggregate before saving. Every read is scoped to its parent so ownership
 * scoping (ADR-0003) is enforceable a layer up.
 */
/**
 * The outcome of a {@link Repository.saveIfNewer} conditional write: whether the
 * write landed, and the record as it stands afterwards either way — the caller
 * returns `record` unconditionally and uses `applied` only to gate side effects.
 */
export interface ConditionalWrite<T> {
  readonly applied: boolean;
  readonly record: T;
}

export interface Repository<T> {
  findById(id: Id): Promise<T | undefined>;
  save(entity: T): Promise<T>;
  delete(id: Id): Promise<void>;
  /**
   * Server-enforced per-record LWW (ADR-0028, issue #141): replace the stored
   * aggregate only if `editedAt` is **strictly newer** than the record's stored
   * edit time; an equal or older stamp is a no-op that returns the current
   * record unchanged. An applied write stores `editedAt` as the record's new
   * edit time (a plain `save` stamps server now). The edit time is
   * persistence-side bookkeeping — it never appears on the domain model. The
   * record must already exist: callers resolve (and ownership-check) it first.
   */
  saveIfNewer(entity: T, editedAt: Date): Promise<ConditionalWrite<T>>;
}

/** Rigs — the aggregate root, scoped to their owner (ADR-0003, ADR-0006). */
export interface RigRepository extends Repository<Rig> {
  listByOwner(ownerId: Id): Promise<Rig[]>;
}

/** Checklists — reusable templates belonging to a rig. */
export interface ChecklistRepository extends Repository<Checklist> {
  listByRig(rigId: Id): Promise<Checklist[]>;
}

/** Runs — dated copies of a checklist's steps. */
export interface RunRepository extends Repository<Run> {
  listByRig(rigId: Id): Promise<Run[]>;
  listByChecklist(checklistId: Id): Promise<Run[]>;
  listByTrip(tripId: Id): Promise<Run[]>;
}

/** Maintenance tasks — recurring upkeep jobs on a rig. */
export interface MaintenanceTaskRepository extends Repository<MaintenanceTask> {
  listByRig(rigId: Id): Promise<MaintenanceTask[]>;
}

/** Log entries — dated records that a task was performed. */
export interface LogEntryRepository extends Repository<LogEntry> {
  listByRig(rigId: Id): Promise<LogEntry[]>;
  listByTask(taskId: Id): Promise<LogEntry[]>;
}

/** Equipment items — descriptive inventory on a rig (issue #79). */
export interface EquipmentItemRepository extends Repository<EquipmentItem> {
  listByRig(rigId: Id): Promise<EquipmentItem[]>;
}

/** Trips — named journeys of a rig through ordered stops (issue #111). */
export interface TripRepository extends Repository<Trip> {
  listByRig(rigId: Id): Promise<Trip[]>;
  /**
   * Write the trip and its initial stops in one atomic save (issue #120):
   * either the whole plan lands or nothing does — a mid-save failure must
   * never strand a stopless trip. The use-case hands over fully-built
   * aggregates (ids, positions, arrived already assigned), as with `save`.
   */
  createWithStops(trip: Trip, stops: StoredStop[]): Promise<Trip>;
}

/** Stops — ordered overnight halts on a trip; the list comes back position-ordered. */
export interface StopRepository extends Repository<StoredStop> {
  listByTrip(tripId: Id): Promise<StoredStop[]>;
}

/** Attachments — files kept on a stop (ADR-0026); rows are metadata only, the bytes live in object storage. */
export interface AttachmentRepository extends Repository<StoredAttachment> {
  listByStop(stopId: Id): Promise<StoredAttachment[]>;
}
