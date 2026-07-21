import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  Checklist,
  ChecklistRepository as ChecklistRepositoryPort,
  Id,
} from '@rv-checklist/domain';
import { Repository } from 'typeorm';
import { ChecklistEntity } from './entities/checklist.entity.js';

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
  abstract save(checklist: Checklist): Promise<Checklist>;
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

  async save(checklist: Checklist): Promise<Checklist> {
    const saved = await this.repo.save(this.repo.create(checklist));
    return toChecklist(saved);
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByRig(rigId: Id): Promise<Checklist[]> {
    const rows = await this.repo.find({ where: { rigId } });
    return rows.map((row) => toChecklist(row));
  }
}
