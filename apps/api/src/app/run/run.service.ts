import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ChecklistRepository,
  ownedOrUndefined,
  RigRepository,
  RunRepository,
} from '@rv-checklist/api-data-access';
import type {
  Checklist,
  CreateRun,
  Id,
  Run,
  RunStep,
  Step,
  UpdateRun,
} from '@rv-checklist/domain';
import { Clock } from '../auth/clock.js';

/**
 * Copy a checklist step into a fresh run step: it starts `incomplete`, with a new
 * id (a run's steps are its own, not the template's) and no captured values. A
 * task link and any plain-step `field_schema` ride across unchanged (ADR-0008),
 * so completing the step later can capture values against that schema.
 */
function toRunStep(step: Step): RunStep {
  return {
    id: randomUUID(),
    text: step.text,
    ...(step.taskId !== undefined && { taskId: step.taskId }),
    ...(step.fieldSchema !== undefined && { fieldSchema: step.fieldSchema }),
    state: 'incomplete',
  };
}

/**
 * Runs over plain checklists, owner-scoped (issue #16). Starting a run **copies**
 * the checklist's steps (story: a run is a dated copy), so a later edit to the
 * checklist never alters a past run — the copy is the guarantee, held here, not a
 * live reference. A run belongs to a rig (ADR-0006), so ownership (ADR-0003) is
 * enforced *via the rig*, exactly as {@link ChecklistService} does: every
 * operation resolves the run's (or checklist's) rig through
 * {@link ownedOrUndefined}, so one owner can never see, edit, or delete another's
 * run — a foreign id is indistinguishable from "not found".
 *
 * Nothing is locked (CONTEXT.md): {@link update} rewrites the whole `steps` array,
 * so marking steps complete/skipped/incomplete, capturing a plain step's field
 * values, or correcting a past answer are all the same write and freely
 * reversible. It holds no HTTP or persistence detail, depending only on the
 * repository ports and a {@link Clock}, so the whole loop is exercised with no
 * database.
 */
@Injectable()
export class RunService {
  constructor(
    private readonly runs: RunRepository,
    private readonly checklists: ChecklistRepository,
    private readonly rigs: RigRepository,
    private readonly clock: Clock,
  ) {}

  /** Whether the rig exists and belongs to the owner — the single ownership gate. */
  private async ownsRig(ownerId: Id, rigId: Id): Promise<boolean> {
    return (
      ownedOrUndefined(await this.rigs.findById(rigId), ownerId) !== undefined
    );
  }

  /**
   * The checklist if the owner owns it (via its rig, ADR-0006), else reject — the
   * single gate for both starting a run and listing a checklist's runs. A foreign
   * or missing checklist is indistinguishable: both are "not found".
   */
  private async ownedChecklist(
    ownerId: Id,
    checklistId: Id,
  ): Promise<Checklist> {
    const checklist = await this.checklists.findById(checklistId);
    if (!checklist || !(await this.ownsRig(ownerId, checklist.rigId))) {
      throw new NotFoundException('Checklist not found');
    }
    return checklist;
  }

  /** Today as an IsoDate (`YYYY-MM-DD`), read from the injected clock. */
  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  /** Start a run over one of the owner's checklists — the server copies its steps. */
  async create(ownerId: Id, input: CreateRun): Promise<Run> {
    const checklist = await this.ownedChecklist(ownerId, input.checklistId);
    return this.runs.save({
      id: randomUUID(),
      checklistId: checklist.id,
      rigId: checklist.rigId,
      startedOn: input.startedOn ?? this.today(),
      steps: checklist.steps.map((step) => toRunStep(step)),
    });
  }

  /** One of the owner's runs, or `NotFound` if missing or another's. */
  async get(ownerId: Id, id: Id): Promise<Run> {
    const run = await this.runs.findById(id);
    if (run && (await this.ownsRig(ownerId, run.rigId))) {
      return run;
    }
    throw new NotFoundException('Run not found');
  }

  /** The past runs of one of the owner's checklists. */
  async listByChecklist(ownerId: Id, checklistId: Id): Promise<Run[]> {
    await this.ownedChecklist(ownerId, checklistId);
    return this.runs.listByChecklist(checklistId);
  }

  /** Apply a partial edit to one of the owner's runs (checklist/rig never change). */
  async update(ownerId: Id, id: Id, changes: UpdateRun): Promise<Run> {
    const existing = await this.get(ownerId, id);
    return this.runs.save({
      ...existing,
      ...(changes.startedOn !== undefined && { startedOn: changes.startedOn }),
      ...(changes.steps !== undefined && { steps: changes.steps }),
    });
  }

  /** Delete one of the owner's runs (e.g. one started by mistake). */
  async remove(ownerId: Id, id: Id): Promise<void> {
    const run = await this.get(ownerId, id);
    await this.runs.delete(run.id);
  }
}
