import type { StoredAttachment } from '../lib/attachment.js';
import type { Checklist } from '../lib/checklist.js';
import type { Id } from '../lib/common.js';
import type { EquipmentItem } from '../lib/equipment.js';
import type { LogEntry } from '../lib/log-entry.js';
import type { MaintenanceTask } from '../lib/maintenance-task.js';
import {
  DuplicateIdError,
  type AttachmentRepository,
  type ChecklistRepository,
  type ConditionalWrite,
  type EquipmentItemRepository,
  type InsertResult,
  type LogEntryRepository,
  type MaintenanceTaskRepository,
  type RigRepository,
  type RunRepository,
  type StopRepository,
  type TripRepository,
} from '../lib/ports.js';
import type { Rig } from '../lib/rig.js';
import type { Run, RunStep } from '../lib/run.js';
import type { StoredStop, Trip } from '../lib/trip.js';

/**
 * In-memory repository double — the test-support binding for the repository ports
 * (spec §Testing). Backs each aggregate with a `Map` and clones on the way in and out, so
 * a test can never accidentally alias stored state. Use-case tests bind their services to
 * these instead of the TypeORM implementations, exercising the whole core loop with no DB.
 */

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * The edit time a write leaves behind (issue #143): server now when it carries
 * no stamp, otherwise `max(stored, editedAt)` — forward-only, so an exempt
 * write can never wind a record's clock back below a newer edit.
 */
function nextEditTime(
  stored: Date | undefined,
  editedAt: Date | undefined,
): Date {
  if (editedAt === undefined) {
    return new Date();
  }
  return stored !== undefined && stored.getTime() > editedAt.getTime()
    ? stored
    : editedAt;
}

abstract class InMemoryRepository<T extends { readonly id: Id }> {
  // Per-record LWW edit times (ADR-0028) — persistence-side bookkeeping the
  // domain model never carries, mirrored here so `saveIfNewer` behaves as the
  // TypeORM implementations do.
  private readonly editTimes = new Map<Id, Date>();
  protected readonly store = new Map<Id, T>();

  findById(id: Id): Promise<T | undefined> {
    const found = this.store.get(id);
    return Promise.resolve(found === undefined ? undefined : clone(found));
  }

  /**
   * Upsert. A bare save stamps server now; a save carrying the client's
   * clamped stamp is an exempt write, whose edit time is `max(stored, editedAt)`
   * so the clock never runs backwards (issue #143).
   */
  save(entity: T, editedAt?: Date): Promise<T> {
    this.store.set(entity.id, clone(entity));
    this.editTimes.set(
      entity.id,
      nextEditTime(this.editTimes.get(entity.id), editedAt),
    );
    return Promise.resolve(clone(entity));
  }

  /** Create under the carried id; an id already in use is left untouched (issue #143). */
  insert(entity: T, editedAt?: Date): Promise<InsertResult<T>> {
    const existing = this.store.get(entity.id);
    if (existing !== undefined) {
      return Promise.resolve({ created: false, record: clone(existing) });
    }
    this.store.set(entity.id, clone(entity));
    this.editTimes.set(entity.id, editedAt ?? new Date());
    return Promise.resolve({ created: true, record: clone(entity) });
  }

  /**
   * The record's LWW edit time, as the SQL implementations expose it only
   * through behaviour — the seam a spec needs to assert on a create's
   * initialised stamp, or on a replay leaving one where it was.
   */
  editedAtOf(id: Id): Date | undefined {
    return this.editTimes.get(id);
  }

  /** Conditional LWW write — applies only a strictly newer stamp (issue #141). */
  saveIfNewer(entity: T, editedAt: Date): Promise<ConditionalWrite<T>> {
    const current = this.store.get(entity.id);
    if (current === undefined) {
      return Promise.reject(
        new Error(`saveIfNewer: no stored record ${entity.id}`),
      );
    }
    const stored = this.editTimes.get(entity.id);
    if (stored !== undefined && editedAt.getTime() <= stored.getTime()) {
      return Promise.resolve({ applied: false, record: clone(current) });
    }
    this.store.set(entity.id, clone(entity));
    this.editTimes.set(entity.id, editedAt);
    return Promise.resolve({ applied: true, record: clone(entity) });
  }

  delete(id: Id): Promise<void> {
    this.store.delete(id);
    this.editTimes.delete(id);
    return Promise.resolve();
  }

  protected where(isMatch: (entity: T) => boolean): Promise<T[]> {
    const results: T[] = [];
    for (const entity of this.store.values()) {
      if (isMatch(entity)) {
        results.push(clone(entity));
      }
    }
    return Promise.resolve(results);
  }
}

export class InMemoryRigRepository
  extends InMemoryRepository<Rig>
  implements RigRepository
{
  listByOwner(ownerId: Id): Promise<Rig[]> {
    return this.where((r) => r.ownerId === ownerId);
  }
}

export class InMemoryChecklistRepository
  extends InMemoryRepository<Checklist>
  implements ChecklistRepository
{
  listByRig(rigId: Id): Promise<Checklist[]> {
    return this.where((c) => c.rigId === rigId);
  }
}

export class InMemoryRunRepository
  extends InMemoryRepository<Run>
  implements RunRepository
{
  listByRig(rigId: Id): Promise<Run[]> {
    return this.where((r) => r.rigId === rigId);
  }

  listByChecklist(checklistId: Id): Promise<Run[]> {
    return this.where((r) => r.checklistId === checklistId);
  }

  listByTrip(tripId: Id): Promise<Run[]> {
    return this.where((r) => r.tripId === tripId);
  }

  /**
   * Compare-and-set on the steps alone (issue #144). The stored array is compared by
   * value, standing in for the SQL `steps = <expected>::jsonb` guard. The record's LWW
   * edit time is left exactly where it was — step recency rides inside the steps.
   */
  saveStepsIfUnchanged(
    id: Id,
    steps: readonly RunStep[],
    expected: readonly RunStep[],
  ): Promise<ConditionalWrite<Run>> {
    const current = this.store.get(id);
    if (current === undefined) {
      return Promise.reject(
        new Error(`saveStepsIfUnchanged: no stored run ${id}`),
      );
    }
    if (JSON.stringify(current.steps) !== JSON.stringify(expected)) {
      return Promise.resolve({ applied: false, record: clone(current) });
    }
    const next: Run = { ...clone(current), steps: clone([...steps]) };
    this.store.set(id, next);
    return Promise.resolve({ applied: true, record: clone(next) });
  }
}

export class InMemoryMaintenanceTaskRepository
  extends InMemoryRepository<MaintenanceTask>
  implements MaintenanceTaskRepository
{
  listByRig(rigId: Id): Promise<MaintenanceTask[]> {
    return this.where((t) => t.rigId === rigId);
  }
}

export class InMemoryLogEntryRepository
  extends InMemoryRepository<LogEntry>
  implements LogEntryRepository
{
  listByRig(rigId: Id): Promise<LogEntry[]> {
    return this.where((e) => e.rigId === rigId);
  }

  listByTask(taskId: Id): Promise<LogEntry[]> {
    return this.where((e) => e.taskId === taskId);
  }
}

export class InMemoryEquipmentItemRepository
  extends InMemoryRepository<EquipmentItem>
  implements EquipmentItemRepository
{
  listByRig(rigId: Id): Promise<EquipmentItem[]> {
    return this.where((e) => e.rigId === rigId);
  }
}

export class InMemoryStopRepository
  extends InMemoryRepository<StoredStop>
  implements StopRepository
{
  /** Position-ordered, matching the SQL implementation's ORDER BY. */
  async listByTrip(tripId: Id): Promise<StoredStop[]> {
    const stops = await this.where((s) => s.tripId === tripId);
    // `where` returns a fresh array of clones, so sorting in place aliases nothing.
    stops.sort((a, b) => a.position - b.position);
    return stops;
  }
}

export class InMemoryTripRepository
  extends InMemoryRepository<Trip>
  implements TripRepository
{
  /**
   * Where {@link createWithStops} lands its stops. Pass the suite's stop
   * repository so an atomic create is visible through it (as the shared SQL
   * database makes it in production); a repository constructed without one
   * keeps trip-only behaviour — its private stop store is reachable by nothing.
   */
  constructor(
    private readonly stopRepository: InMemoryStopRepository = new InMemoryStopRepository(),
  ) {
    super();
  }

  listByRig(rigId: Id): Promise<Trip[]> {
    return this.where((t) => t.rigId === rigId);
  }

  /** Trip and stops in one save — the in-memory stand-in for the SQL transaction (issue #120). */
  async createWithStops(
    trip: Trip,
    stops: StoredStop[],
    editedAt?: Date,
  ): Promise<InsertResult<Trip>> {
    const inserted = await this.insert(trip, editedAt);
    if (!inserted.created) {
      return inserted;
    }
    // A stop id already in use under a brand-new trip is a reused client id,
    // not a replay — the SQL transaction rolls the whole write back, so the
    // double refuses it before writing anything either, raising the same
    // DuplicateIdError the unique violation is mapped to there.
    for (const stop of stops) {
      if ((await this.stopRepository.findById(stop.id)) !== undefined) {
        await this.delete(trip.id);
        throw new DuplicateIdError(
          'createWithStops: a stop id is already in use',
        );
      }
    }
    for (const stop of stops) {
      await this.stopRepository.insert(stop, editedAt);
    }
    return inserted;
  }
}

export class InMemoryAttachmentRepository
  extends InMemoryRepository<StoredAttachment>
  implements AttachmentRepository
{
  listByStop(stopId: Id): Promise<StoredAttachment[]> {
    return this.where((a) => a.stopId === stopId);
  }
}

/** The full set of in-memory repositories, one per aggregate. */
export interface InMemoryRepositories {
  readonly rigs: InMemoryRigRepository;
  readonly checklists: InMemoryChecklistRepository;
  readonly runs: InMemoryRunRepository;
  readonly tasks: InMemoryMaintenanceTaskRepository;
  readonly logEntries: InMemoryLogEntryRepository;
  readonly equipmentItems: InMemoryEquipmentItemRepository;
  readonly trips: InMemoryTripRepository;
  readonly stops: InMemoryStopRepository;
  readonly attachments: InMemoryAttachmentRepository;
}

/** Fresh, empty in-memory repositories — the usual starting point for a use-case test. */
export function createInMemoryRepositories(): InMemoryRepositories {
  const stops = new InMemoryStopRepository();
  return {
    rigs: new InMemoryRigRepository(),
    checklists: new InMemoryChecklistRepository(),
    runs: new InMemoryRunRepository(),
    tasks: new InMemoryMaintenanceTaskRepository(),
    logEntries: new InMemoryLogEntryRepository(),
    equipmentItems: new InMemoryEquipmentItemRepository(),
    // Wired together so an atomic create-with-stops (issue #120) is visible
    // through the stop repository, as the shared database makes it in production.
    trips: new InMemoryTripRepository(stops),
    stops,
    attachments: new InMemoryAttachmentRepository(),
  };
}
