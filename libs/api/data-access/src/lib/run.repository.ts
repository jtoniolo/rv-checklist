import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  ConditionalWrite,
  Id,
  InsertResult,
  IsoDate,
  Run,
  RunRepository as RunRepositoryPort,
  RunStep,
} from '@rv-checklist/domain';
import { LessThan, Raw, Repository, type FindOptionsWhere } from 'typeorm';
import { RunEntity } from './entities/run.entity.js';
import { isUniqueViolation } from './unique-violation.js';

/**
 * The {@link RunRepositoryPort} as a concrete Nest DI token (an abstract class,
 * so it survives type erasure). The use-case in `apps/api` injects this; the
 * module binds it to {@link TypeOrmRunRepository} in production and a test binds
 * it to the in-memory double under `@rv-checklist/domain/testing`. Reads are
 * expressed in domain terms; owner scoping (ADR-0003) is enforced a layer up in
 * the use-case (a run is owned via its rig), so no ownership rule lives here.
 */
export abstract class RunRepository implements RunRepositoryPort {
  abstract findById(id: Id): Promise<Run | undefined>;
  abstract save(run: Run, editedAt?: Date): Promise<Run>;
  abstract insert(run: Run, editedAt?: Date): Promise<InsertResult<Run>>;
  abstract saveIfNewer(
    run: Run,
    editedAt: Date,
  ): Promise<ConditionalWrite<Run>>;
  abstract delete(id: Id): Promise<void>;
  abstract listByRig(rigId: Id): Promise<Run[]>;
  abstract listByChecklist(checklistId: Id): Promise<Run[]>;
  abstract listByTrip(tripId: Id): Promise<Run[]>;
  abstract saveStepsIfUnchanged(
    id: Id,
    steps: readonly RunStep[],
    expected: readonly RunStep[],
  ): Promise<ConditionalWrite<Run>>;
  abstract saveStartedOn(
    id: Id,
    startedOn: IsoDate,
    editedAt?: Date,
  ): Promise<ConditionalWrite<Run>>;
  abstract anyStepLinksEntry(rigId: Id, logEntryId: Id): Promise<boolean>;
}

/** The persisted row (with its timestamps) narrowed to the {@link Run} wire model. */
function toRun(entity: RunEntity): Run {
  return {
    id: entity.id,
    checklistId: entity.checklistId,
    rigId: entity.rigId,
    tripId: entity.tripId ?? undefined,
    startedOn: entity.startedOn,
    steps: entity.steps,
  };
}

/**
 * The wire model widened to the row shape: an absent `tripId` writes SQL NULL
 * (never "leave unchanged" — `save` is a whole-aggregate upsert).
 */
function toRow(run: Run): Partial<RunEntity> {
  return {
    ...run,
    // eslint-disable-next-line unicorn/no-null
    tripId: run.tripId ?? null,
  };
}

/**
 * TypeORM-backed {@link RunRepository} (ADR-0009). `save` is a whole-aggregate
 * upsert — the use-case assigns the run and step ids and hands over a complete
 * {@link Run} — so starting a run and editing one are the same write, and the
 * embedded `steps` JSONB is replaced wholesale. The persistence shape
 * (timestamps) never leaves this lib.
 */
@Injectable()
export class TypeOrmRunRepository extends RunRepository {
  constructor(
    @InjectRepository(RunEntity)
    private readonly repo: Repository<RunEntity>,
  ) {
    super();
  }

  async findById(id: Id): Promise<Run | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toRun(found) : undefined;
  }

  async save(run: Run, editedAt?: Date): Promise<Run> {
    if (editedAt === undefined) {
      // A plain save re-stamps the LWW edit time (issue #141) — see RigRepository.
      const saved = await this.repo.save(
        this.repo.create({ ...toRow(run), editedAt: new Date() }),
      );
      return toRun(saved);
    }
    // An exempt write carrying the client's clamped stamp: the row lands, then
    // the edit clock moves to max(stored, editedAt) — see RigRepository (issue #143).
    const saved = await this.repo.save(this.repo.create({ ...toRow(run) }));
    await this.repo.update(
      { id: run.id, editedAt: LessThan(editedAt) },
      { editedAt },
    );
    return toRun(saved);
  }

  async insert(run: Run, editedAt?: Date): Promise<InsertResult<Run>> {
    // Insert-then-catch, never check-then-insert — see RigRepository (issue #143).
    try {
      await this.repo.insert({
        ...toRow(run),
        editedAt: editedAt ?? new Date(),
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await this.repo.findOneByOrFail({ id: run.id });
      return { created: false, record: toRun(existing) };
    }
    return { created: true, record: run };
  }

  /**
   * Compare-and-set the `steps` JSONB alone (ADR-0030, issue #144). The guard is jsonb
   * equality against the array the caller merged from, so a concurrent merge that landed
   * in between fails the WHERE instead of being overwritten — the caller re-reads and
   * re-merges. `edited_at` is deliberately untouched: the run's record clock governs
   * `started_on`, and each step carries its own.
   */
  async saveStepsIfUnchanged(
    id: Id,
    steps: readonly RunStep[],
    expected: readonly RunStep[],
  ): Promise<ConditionalWrite<Run>> {
    const unchanged: FindOptionsWhere<RunEntity> = {
      id,
      steps: Raw((column) => `${column} = CAST(:expectedSteps AS jsonb)`, {
        expectedSteps: JSON.stringify(expected),
      }),
    };
    const result = await this.repo.update(unchanged, { steps: [...steps] });
    const current = await this.repo.findOneByOrFail({ id });
    return { applied: (result.affected ?? 0) > 0, record: toRun(current) };
  }

  /**
   * Re-date the run, writing `started_on` alone (ADR-0030, issue #144) — the record-level
   * sibling of {@link saveStepsIfUnchanged}. Naming the one column is the whole point: a
   * whole-row write would carry the caller's `steps` and erase a merge that landed between
   * its read and this write, and the record clock cannot notice, since a step merge never
   * moves it.
   *
   * With `editedAt` the comparison and the write are one conditional UPDATE (ADR-0028),
   * strictly newer to land. Without it the edit is authoritative: it always lands and
   * stamps server now.
   */
  async saveStartedOn(
    id: Id,
    startedOn: IsoDate,
    editedAt?: Date,
  ): Promise<ConditionalWrite<Run>> {
    const stamp = editedAt ?? new Date();
    const gate: FindOptionsWhere<RunEntity> =
      editedAt === undefined ? { id } : { id, editedAt: LessThan(editedAt) };
    const result = await this.repo.update(gate, { startedOn, editedAt: stamp });
    const current = await this.repo.findOneByOrFail({ id });
    return { applied: (result.affected ?? 0) > 0, record: toRun(current) };
  }

  /**
   * Whether any run on the rig already links a step to this Log Entry (ADR-0030, issue
   * #144). A jsonb containment test — `steps @> '[{"logEntryId": …}]'` — because the link
   * sits inside one element of the array and the rest of that element is irrelevant.
   */
  async anyStepLinksEntry(rigId: Id, logEntryId: Id): Promise<boolean> {
    const linked: FindOptionsWhere<RunEntity> = {
      rigId,
      steps: Raw((column) => `${column} @> CAST(:link AS jsonb)`, {
        link: JSON.stringify([{ logEntryId }]),
      }),
    };
    return (await this.repo.count({ where: linked })) > 0;
  }

  async saveIfNewer(run: Run, editedAt: Date): Promise<ConditionalWrite<Run>> {
    // The strictly-newer comparison and the write are one conditional UPDATE
    // (ADR-0028) — no read-compare-write window. Record-level over the whole
    // run, `steps` included, which is why editing a run never comes through
    // here: the record clock cannot see a step merge (a merge deliberately
    // leaves it alone), so a whole-row write would carry a stale array past the
    // gate unnoticed. `startedOn` takes `saveStartedOn`, steps take
    // `saveStepsIfUnchanged` (ADR-0030).
    const { id: _id, ...row } = toRow(run);
    const result = await this.repo.update(
      { id: run.id, editedAt: LessThan(editedAt) },
      { ...row, editedAt },
    );
    const current = await this.repo.findOneByOrFail({ id: run.id });
    return { applied: (result.affected ?? 0) > 0, record: toRun(current) };
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByRig(rigId: Id): Promise<Run[]> {
    const rows = await this.repo.find({ where: { rigId } });
    return rows.map((row) => toRun(row));
  }

  async listByChecklist(checklistId: Id): Promise<Run[]> {
    // Newest occasion first (created-at breaks a same-day tie) so the run list
    // reads most-recent-first — the in-progress one is usually the latest.
    const rows = await this.repo.find({
      where: { checklistId },
      order: { startedOn: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => toRun(row));
  }

  async listByTrip(tripId: Id): Promise<Run[]> {
    // Same most-recent-first reading as a checklist's history — the trip
    // screen lists its runs newest occasion first (issue #111).
    const rows = await this.repo.find({
      where: { tripId },
      order: { startedOn: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => toRun(row));
  }
}
