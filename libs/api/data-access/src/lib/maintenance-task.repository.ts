import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  ConditionalWrite,
  Id,
  MaintenanceTask,
  MaintenanceTaskRepository as MaintenanceTaskRepositoryPort,
} from '@rv-checklist/domain';
import { LessThan, Repository } from 'typeorm';
import { MaintenanceTaskEntity } from './entities/maintenance-task.entity.js';

/**
 * The {@link MaintenanceTaskRepositoryPort} as a concrete Nest DI token (an
 * abstract class, so it survives type erasure). The use-case in `apps/api`
 * injects this; the module binds it to {@link TypeOrmMaintenanceTaskRepository}
 * in production and a test binds it to the in-memory double under
 * `@rv-checklist/domain/testing`. Owner scoping (ADR-0003) is enforced a layer
 * up in the use-case (a task is owned via its rig), so no ownership rule lives
 * here.
 */
export abstract class MaintenanceTaskRepository implements MaintenanceTaskRepositoryPort {
  abstract findById(id: Id): Promise<MaintenanceTask | undefined>;
  abstract save(task: MaintenanceTask): Promise<MaintenanceTask>;
  abstract saveIfNewer(
    task: MaintenanceTask,
    editedAt: Date,
  ): Promise<ConditionalWrite<MaintenanceTask>>;
  abstract delete(id: Id): Promise<void>;
  abstract listByRig(rigId: Id): Promise<MaintenanceTask[]>;
}

/** The persisted row (timestamps, flattened interval) narrowed to the wire model. */
function toTask(entity: MaintenanceTaskEntity): MaintenanceTask {
  return {
    id: entity.id,
    rigId: entity.rigId,
    name: entity.name,
    // SQL NULL means no description — absent means absent (issue #25).
    ...(entity.description !== null && { description: entity.description }),
    // Both columns NULL means no interval — the task is untracked (CONTEXT.md).
    // Each non-NULL column is one of the Interval's coexisting limits (ADR-0016):
    // `interval_months` the calendar cadence, `interval_km` the distance one
    // (issue #32). At least one is present, so the object is never empty.
    ...((entity.intervalMonths !== null || entity.intervalKm !== null) && {
      interval: {
        ...(entity.intervalMonths !== null && {
          months: entity.intervalMonths,
        }),
        ...(entity.intervalKm !== null && { km: entity.intervalKm }),
      },
    }),
    // TRUE means one-time — due from creation, done once (issue #29). Absent
    // otherwise, mirroring the wire model's absent-means-absent marker.
    ...(entity.oneTime && { oneTime: true }),
    // SQL NULL means no manual anchor — absent means absent (issue #33). Only a
    // calendar task ever has one; the API service upholds that on the way in.
    ...(entity.lastPerformed !== null && {
      lastPerformed: entity.lastPerformed,
    }),
    fieldSchema: entity.fieldSchema,
    // SQL NULL and empty array both mean "no tags" — normalise to `[]`.
    tags: entity.tags ?? [],
  };
}

/** The wire model's optional interval flattened to the row's nullable column. */
function toRow(task: MaintenanceTask): Partial<MaintenanceTaskEntity> {
  return {
    id: task.id,
    rigId: task.rigId,
    name: task.name,
    // SQL NULL must be written explicitly: `save` skips `undefined` columns,
    // which would leave a removed description or interval in place.
    // eslint-disable-next-line unicorn/no-null
    description: task.description ?? null,
    // The Interval flattens to typed columns (ADR-0015): its calendar cadence to
    // `interval_months`, its distance cadence to `interval_km` (issue #32). The
    // two coexist (ADR-0016), so each is written independently; a limit the
    // interval omits (or an absent interval) is NULL.
    // eslint-disable-next-line unicorn/no-null
    intervalMonths: task.interval?.months ?? null,
    // eslint-disable-next-line unicorn/no-null
    intervalKm: task.interval?.km ?? null,
    // The one-time marker persists as a plain boolean (absent on the wire ⇒
    // false in the row); it never coexists with an interval (issue #29).
    oneTime: task.oneTime ?? false,
    // The manual anchor flattens to a nullable date column (issue #33); NULL
    // must be written explicitly so a cleared anchor persists (see above).
    // eslint-disable-next-line unicorn/no-null
    lastPerformed: task.lastPerformed ?? null,
    fieldSchema: task.fieldSchema,
    // An empty tags array writes NULL so old rows and tagless tasks stay uniform.
    // eslint-disable-next-line unicorn/no-null
    tags: task.tags.length > 0 ? task.tags : null,
  };
}

/**
 * TypeORM-backed {@link MaintenanceTaskRepository} (ADR-0009). `save` is a
 * whole-aggregate upsert — the use-case assigns the id and hands over a
 * complete {@link MaintenanceTask} — and the embedded `field_schema` JSONB is
 * replaced wholesale. The persistence shape (timestamps, `interval_months`)
 * never leaves this lib.
 */
@Injectable()
export class TypeOrmMaintenanceTaskRepository extends MaintenanceTaskRepository {
  constructor(
    @InjectRepository(MaintenanceTaskEntity)
    private readonly repo: Repository<MaintenanceTaskEntity>,
  ) {
    super();
  }

  async findById(id: Id): Promise<MaintenanceTask | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toTask(found) : undefined;
  }

  async save(task: MaintenanceTask): Promise<MaintenanceTask> {
    // A plain save re-stamps the LWW edit time (issue #141) — see RigRepository.
    const saved = await this.repo.save(
      this.repo.create({ ...toRow(task), editedAt: new Date() }),
    );
    return toTask(saved);
  }

  async saveIfNewer(
    task: MaintenanceTask,
    editedAt: Date,
  ): Promise<ConditionalWrite<MaintenanceTask>> {
    // The strictly-newer comparison and the write are one conditional UPDATE
    // (ADR-0028) — no read-compare-write window.
    const { id: _id, ...row } = toRow(task);
    const result = await this.repo.update(
      { id: task.id, editedAt: LessThan(editedAt) },
      { ...row, editedAt },
    );
    const current = await this.repo.findOneByOrFail({ id: task.id });
    return { applied: (result.affected ?? 0) > 0, record: toTask(current) };
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByRig(rigId: Id): Promise<MaintenanceTask[]> {
    // Alphabetical — the task list is a reference the owner scans by name.
    const rows = await this.repo.find({
      where: { rigId },
      order: { name: 'ASC' },
    });
    return rows.map((row) => toTask(row));
  }
}
