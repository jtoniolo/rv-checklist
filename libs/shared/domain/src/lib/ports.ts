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

/**
 * The outcome of an {@link Repository.insert}: whether this call created the
 * row, and the record as it stands either way. `created: false` means a row
 * already carried that id — the create is a replay of one the caller made
 * before (ADR-0028, issue #143), and `record` is the row already stored.
 * Callers **must** ownership- and parent-scope-check a `created: false` record
 * before returning it: an id is client-supplied, so the row it collides with
 * may be someone else's.
 */
export interface InsertResult<T> {
  readonly created: boolean;
  readonly record: T;
}

/**
 * A create carried a client-generated id that is already in use by a row it
 * cannot adopt as its own replay — today only a reused *stop* id inside a trip
 * create (ADR-0028, issue #143), where the trip id was free so the write is a
 * genuine new create naming a stop that exists. The write rolls back whole;
 * nothing partial lands.
 *
 * Distinct from an ordinary {@link Repository.insert} collision, which *is* a
 * replay and comes back as `created: false`. This one has no outcome but
 * rejection, and the caller must map it to a **client** error: the offline
 * upload queue retries a 5xx without cap and only marks an operation
 * permanently failed on a 4xx, so letting the driver's failure surface as a
 * 500 would turn a request that can never succeed into an endless retry.
 */
export class DuplicateIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateIdError';
  }
}

export interface Repository<T> {
  findById(id: Id): Promise<T | undefined>;
  /**
   * Upsert the whole aggregate. Without `editedAt` the write stamps the
   * record's LWW edit time server now — an authoritative online edit, which is
   * why it beats any older queued offline stamp.
   *
   * With `editedAt` the write is an **exempt** one (ADR-0028, issue #143):
   * stop arrival, stop reorder, and the rig-Distance delta those trigger. The
   * effect always applies — exemption is from the LWW *gate*, not from the
   * stamp — and the edit time becomes `max(stored, editedAt)`. Taking the
   * maximum rather than storing the stamp outright is deliberate: a plain
   * overwrite could wind a record's clock *backwards* past another device's
   * newer edit, letting a third device's stale queued write win.
   *
   * The record need not exist (this is an upsert), but a create goes through
   * {@link insert}, which is where a supplied stamp initialises the clock.
   */
  save(entity: T, editedAt?: Date): Promise<T>;
  /**
   * Create the aggregate under the id it already carries — the client-generated
   * id path (ADR-0028, issue #143). A row that already holds that id is left
   * **untouched**, edit time included, and comes back as `created: false`: a
   * replayed offline create is a success, not an overwrite. The insert and the
   * collision check are one statement, so a concurrent duplicate cannot slip
   * between a read and a write.
   *
   * `editedAt` initialises the record's LWW edit time (the row is new, so
   * there is nothing to take a maximum against); absent stamps server now.
   */
  insert(entity: T, editedAt?: Date): Promise<InsertResult<T>>;
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
   *
   * The trip's id may be client-generated (ADR-0028, issue #143), so this is
   * {@link Repository.insert} for the pair: a trip id already in use leaves
   * everything untouched and comes back as `created: false`. A *stop* id in
   * use under an otherwise-new trip is not a replay — the client reused an id
   * — and rejects the whole write with {@link DuplicateIdError}.
   */
  createWithStops(
    trip: Trip,
    stops: StoredStop[],
    editedAt?: Date,
  ): Promise<InsertResult<Trip>>;
}

/** Stops — ordered overnight halts on a trip; the list comes back position-ordered. */
export interface StopRepository extends Repository<StoredStop> {
  listByTrip(tripId: Id): Promise<StoredStop[]>;
}

/** Attachments — files kept on a stop (ADR-0026); rows are metadata only, the bytes live in object storage. */
export interface AttachmentRepository extends Repository<StoredAttachment> {
  listByStop(stopId: Id): Promise<StoredAttachment[]>;
}
