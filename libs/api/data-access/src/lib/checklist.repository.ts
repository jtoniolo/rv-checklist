import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  Checklist,
  ChecklistRepository as ChecklistRepositoryPort,
  ConditionalWrite,
  Id,
  InsertResult,
} from '@rv-checklist/domain';
import { LessThan, Repository } from 'typeorm';
import { ChecklistEntity } from './entities/checklist.entity.js';
import { isUniqueViolation } from './unique-violation.js';

/**
 * The {@link ChecklistRepositoryPort} as a concrete Nest DI token (an abstract
 * class, so it survives type erasure). The use-case in `apps/api` injects this;
 * the module binds it to {@link TypeOrmChecklistRepository} in production and a
 * test binds it to the in-memory double under `@rv-checklist/domain/testing`.
 * Reads are expressed in domain terms; owner scoping (ADR-0003) is enforced a
 * layer up in the use-case (a checklist is owned via its rig), so no ownership
 * rule is duplicated here.
 */
export abstract class ChecklistRepository implements ChecklistRepositoryPort {
  abstract findById(id: Id): Promise<Checklist | undefined>;
  abstract save(checklist: Checklist, editedAt?: Date): Promise<Checklist>;
  abstract insert(
    checklist: Checklist,
    editedAt?: Date,
  ): Promise<InsertResult<Checklist>>;
  abstract saveIfNewer(
    checklist: Checklist,
    editedAt: Date,
  ): Promise<ConditionalWrite<Checklist>>;
  abstract delete(id: Id): Promise<void>;
  abstract listByRig(rigId: Id): Promise<Checklist[]>;
}

/** The persisted row (with its timestamps) narrowed to the {@link Checklist} wire model. */
function toChecklist(entity: ChecklistEntity): Checklist {
  return {
    id: entity.id,
    rigId: entity.rigId,
    name: entity.name,
    tags: entity.tags,
    steps: entity.steps,
  };
}

/**
 * TypeORM-backed {@link ChecklistRepository} (ADR-0009). `save` is a
 * whole-aggregate upsert — the use-case assigns the id and step ids and hands
 * over a complete {@link Checklist} — so a create and an edit are the same
 * write, and the embedded `steps`/`tags` JSONB is replaced wholesale. The
 * persistence shape (timestamps) never leaves this lib.
 */
@Injectable()
export class TypeOrmChecklistRepository extends ChecklistRepository {
  constructor(
    @InjectRepository(ChecklistEntity)
    private readonly repo: Repository<ChecklistEntity>,
  ) {
    super();
  }

  async findById(id: Id): Promise<Checklist | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toChecklist(found) : undefined;
  }

  async save(checklist: Checklist, editedAt?: Date): Promise<Checklist> {
    if (editedAt === undefined) {
      // A plain save re-stamps the LWW edit time (issue #141) — see RigRepository.
      const saved = await this.repo.save(
        this.repo.create({ ...checklist, editedAt: new Date() }),
      );
      return toChecklist(saved);
    }
    // An exempt write carrying the client's clamped stamp: the row lands, then
    // the edit clock moves to max(stored, editedAt) — see RigRepository (issue #143).
    const saved = await this.repo.save(this.repo.create({ ...checklist }));
    await this.repo.update(
      { id: checklist.id, editedAt: LessThan(editedAt) },
      { editedAt },
    );
    return toChecklist(saved);
  }

  async insert(
    checklist: Checklist,
    editedAt?: Date,
  ): Promise<InsertResult<Checklist>> {
    // Insert-then-catch, never check-then-insert — see RigRepository (issue #143).
    try {
      await this.repo.insert({
        ...checklist,
        editedAt: editedAt ?? new Date(),
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await this.repo.findOneByOrFail({ id: checklist.id });
      return { created: false, record: toChecklist(existing) };
    }
    return { created: true, record: checklist };
  }

  async saveIfNewer(
    checklist: Checklist,
    editedAt: Date,
  ): Promise<ConditionalWrite<Checklist>> {
    // The strictly-newer comparison and the write are one conditional UPDATE
    // (ADR-0028) — no read-compare-write window.
    const { id: _id, ...row } = checklist;
    const result = await this.repo.update(
      { id: checklist.id, editedAt: LessThan(editedAt) },
      { ...row, editedAt },
    );
    const current = await this.repo.findOneByOrFail({ id: checklist.id });
    return {
      applied: (result.affected ?? 0) > 0,
      record: toChecklist(current),
    };
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByRig(rigId: Id): Promise<Checklist[]> {
    const rows = await this.repo.find({ where: { rigId } });
    return rows.map((row) => toChecklist(row));
  }
}
