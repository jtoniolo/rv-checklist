import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  ConditionalWrite,
  Id,
  Run,
  RunRepository as RunRepositoryPort,
} from '@rv-checklist/domain';
import { LessThan, Repository } from 'typeorm';
import { RunEntity } from './entities/run.entity.js';

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
  abstract save(run: Run): Promise<Run>;
  abstract saveIfNewer(
    run: Run,
    editedAt: Date,
  ): Promise<ConditionalWrite<Run>>;
  abstract delete(id: Id): Promise<void>;
  abstract listByRig(rigId: Id): Promise<Run[]>;
  abstract listByChecklist(checklistId: Id): Promise<Run[]>;
  abstract listByTrip(tripId: Id): Promise<Run[]>;
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

  async save(run: Run): Promise<Run> {
    // A plain save re-stamps the LWW edit time (issue #141) — see RigRepository.
    const saved = await this.repo.save(
      this.repo.create({ ...toRow(run), editedAt: new Date() }),
    );
    return toRun(saved);
  }

  async saveIfNewer(run: Run, editedAt: Date): Promise<ConditionalWrite<Run>> {
    // The strictly-newer comparison and the write are one conditional UPDATE
    // (ADR-0028) — no read-compare-write window. Record-level: the whole
    // `steps` JSONB rides with the run (per-step merge is a later ticket).
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
