import { Injectable, NotFoundException } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { McpController, McpRawRequest, Tool } from '@rekog/mcp-nest';
import {
  CreateChecklistSchema,
  CreateMaintenanceTaskSchema,
  IdSchema,
  UpdateChecklistSchema,
  UpdateMaintenanceTaskSchema,
  type Owner,
  dueStatusOf,
} from '@rv-checklist/domain';
import type { Request } from 'express';
import { z } from 'zod';
import { ChecklistService } from '../checklist/checklist.service.js';
import { LogEntryService } from '../maintenance/log-entry.service.js';
import { MaintenanceTaskService } from '../maintenance/maintenance-task.service.js';
import { RigService } from '../rig/rig.service.js';
import { RunService } from '../run/run.service.js';

function ownerFrom(req: Request | undefined): Owner {
  return (req as unknown as { user: Owner }).user;
}

function toolError(text: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text }],
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
@McpController()
export class McpToolsController {
  constructor(
    private readonly rigService: RigService,
    private readonly checklistService: ChecklistService,
    private readonly runService: RunService,
    private readonly taskService: MaintenanceTaskService,
    private readonly logEntryService: LogEntryService,
  ) {}

  @Tool({
    name: 'list_rigs',
    description: 'List all rigs belonging to the authenticated owner.',
    parameters: z.object({}),
    annotations: { readOnlyHint: true },
  })
  async listRigs(@McpRawRequest() req?: Request) {
    const owner = ownerFrom(req);
    const rigs = await this.rigService.list(owner.id);
    return JSON.stringify(rigs);
  }

  @Tool({
    name: 'get_rig',
    description:
      'Get a single rig by id. Returns nickname, VIN, make, model, year, and current Distance (km).',
    parameters: z.object({ id: IdSchema }),
    annotations: { readOnlyHint: true },
  })
  async getRig(
    @Payload() { id }: { id: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    const rig = await this.rigService.get(owner.id, id);
    return JSON.stringify(rig);
  }

  @Tool({
    name: 'list_checklists',
    description:
      'List all checklists on a rig. A checklist is a reusable ordered sequence of steps.',
    parameters: z.object({ rigId: IdSchema }),
    annotations: { readOnlyHint: true },
  })
  async listChecklists(
    @Payload() { rigId }: { rigId: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    const checklists = await this.checklistService.list(owner.id, rigId);
    return JSON.stringify(checklists);
  }

  @Tool({
    name: 'get_checklist',
    description: 'Get a single checklist by id, including its ordered steps.',
    parameters: z.object({ id: IdSchema }),
    annotations: { readOnlyHint: true },
  })
  async getChecklist(
    @Payload() { id }: { id: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    const checklist = await this.checklistService.get(owner.id, id);
    return JSON.stringify(checklist);
  }

  @Tool({
    name: 'list_runs',
    description:
      "List runs filtered by checklist or by rig. A run is a dated copy of a checklist's steps. Provide exactly one of checklistId or rigId.",
    parameters: z.object({
      checklistId: IdSchema.optional(),
      rigId: IdSchema.optional(),
    }),
    annotations: { readOnlyHint: true },
  })
  async listRuns(
    @Payload() { checklistId, rigId }: { checklistId?: string; rigId?: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    if (checklistId !== undefined) {
      if (rigId !== undefined) {
        return toolError('Provide checklistId or rigId, not both.');
      }
      return JSON.stringify(
        await this.runService.listByChecklist(owner.id, checklistId),
      );
    }
    if (rigId !== undefined) {
      return JSON.stringify(await this.runService.listByRig(owner.id, rigId));
    }
    return toolError('Provide one of checklistId or rigId.');
  }

  @Tool({
    name: 'get_run',
    description:
      'Get a single run by id, including per-step state (incomplete, complete, skipped).',
    parameters: z.object({ id: IdSchema }),
    annotations: { readOnlyHint: true },
  })
  async getRun(
    @Payload() { id }: { id: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    const run = await this.runService.get(owner.id, id);
    return JSON.stringify(run);
  }

  @Tool({
    name: 'list_maintenance_tasks',
    description:
      'List all maintenance tasks on a rig, each enriched with dueStatus. A task is tracked by an interval (recurring), as one-time, or is untracked. Distance is in kilometres.',
    parameters: z.object({ rigId: IdSchema }),
    annotations: { readOnlyHint: true },
  })
  async listMaintenanceTasks(
    @Payload() { rigId }: { rigId: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    const [tasks, entries, rig] = await Promise.all([
      this.taskService.listByRig(owner.id, rigId),
      this.logEntryService.listByRig(owner.id, rigId),
      this.rigService.get(owner.id, rigId),
    ]);

    const entriesByTask = new Map<string, typeof entries>();
    for (const entry of entries) {
      if (entry.taskId === null) {
        continue;
      }
      const list = entriesByTask.get(entry.taskId) ?? [];
      list.push(entry);
      entriesByTask.set(entry.taskId, list);
    }

    const enriched = tasks.map((task) => ({
      ...task,
      dueStatus: dueStatusOf(
        task,
        entriesByTask.get(task.id) ?? [],
        rig.distanceKm,
        today(),
      ),
    }));
    return JSON.stringify(enriched);
  }

  @Tool({
    name: 'get_maintenance_task',
    description:
      'Get a single maintenance task by id, enriched with dueStatus. Distance is in kilometres.',
    parameters: z.object({ id: IdSchema }),
    annotations: { readOnlyHint: true },
  })
  async getMaintenanceTask(
    @Payload() { id }: { id: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    const task = await this.taskService.get(owner.id, id);
    const [entries, rig] = await Promise.all([
      this.logEntryService.listByTask(owner.id, id),
      this.rigService.get(owner.id, task.rigId),
    ]);
    const enriched = {
      ...task,
      dueStatus: dueStatusOf(task, entries, rig.distanceKm, today()),
    };
    return JSON.stringify(enriched);
  }

  @Tool({
    name: 'list_log_entries',
    description:
      'List log entries filtered by task or by rig. A log entry is the dated record that a maintenance task was performed. Provide exactly one of taskId or rigId.',
    parameters: z.object({
      taskId: IdSchema.optional(),
      rigId: IdSchema.optional(),
    }),
    annotations: { readOnlyHint: true },
  })
  async listLogEntries(
    @Payload() { taskId, rigId }: { taskId?: string; rigId?: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    if (taskId !== undefined) {
      if (rigId !== undefined) {
        return toolError('Provide taskId or rigId, not both.');
      }
      return JSON.stringify(
        await this.logEntryService.listByTask(owner.id, taskId),
      );
    }
    if (rigId !== undefined) {
      return JSON.stringify(
        await this.logEntryService.listByRig(owner.id, rigId),
      );
    }
    return toolError('Provide one of taskId or rigId.');
  }

  // -- Checklist writes -----------------------------------------------------

  @Tool({
    name: 'create_checklist',
    description:
      'Create a checklist on a rig. A checklist is a reusable ordered sequence of steps. A task-linked step (has a taskId) takes its fields from the task, never its own fieldSchema.',
    parameters: CreateChecklistSchema,
    annotations: { readOnlyHint: false },
  })
  async createChecklist(
    @Payload() input: z.infer<typeof CreateChecklistSchema>,
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    try {
      return JSON.stringify(
        await this.checklistService.create(owner.id, input),
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return toolError(error.message);
      }
      throw error;
    }
  }

  @Tool({
    name: 'update_checklist',
    description:
      'Update a checklist by id. Replaces the full ordered step list when steps are provided — omit steps to leave them unchanged. A task-linked step (has a taskId) takes its fields from the task, never its own fieldSchema.',
    parameters: z.object({ id: IdSchema }).extend(UpdateChecklistSchema.shape),
    annotations: { readOnlyHint: false },
  })
  async updateChecklist(
    @Payload()
    { id, ...changes }: { id: string } & z.infer<typeof UpdateChecklistSchema>,
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    try {
      return JSON.stringify(
        await this.checklistService.update(owner.id, id, changes),
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return toolError(error.message);
      }
      throw error;
    }
  }

  @Tool({
    name: 'delete_checklist',
    description: 'Delete a checklist by id.',
    parameters: z.object({ id: IdSchema }),
    annotations: { readOnlyHint: false },
  })
  async deleteChecklist(
    @Payload() { id }: { id: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    try {
      await this.checklistService.remove(owner.id, id);
      return 'Checklist deleted.';
    } catch (error) {
      if (error instanceof NotFoundException) {
        return toolError(error.message);
      }
      throw error;
    }
  }

  // -- Maintenance task writes ----------------------------------------------

  @Tool({
    name: 'create_maintenance_task',
    description:
      'Create a maintenance task on a rig. A task is tracked by an interval (recurring), as one-time, or is untracked. Interval and one-time are mutually exclusive. Distance is in kilometres.',
    parameters: CreateMaintenanceTaskSchema,
    annotations: { readOnlyHint: false },
  })
  async createMaintenanceTask(
    @Payload() input: z.infer<typeof CreateMaintenanceTaskSchema>,
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    try {
      return JSON.stringify(await this.taskService.create(owner.id, input));
    } catch (error) {
      if (error instanceof NotFoundException) {
        return toolError(error.message);
      }
      throw error;
    }
  }

  @Tool({
    name: 'update_maintenance_task',
    description:
      'Update a maintenance task by id. Interval and one-time are mutually exclusive. Distance is in kilometres. Set interval or oneTime to null to remove them.',
    parameters: z
      .object({ id: IdSchema })
      .extend(UpdateMaintenanceTaskSchema.shape),
    annotations: { readOnlyHint: false },
  })
  async updateMaintenanceTask(
    @Payload()
    {
      id,
      ...changes
    }: { id: string } & z.infer<typeof UpdateMaintenanceTaskSchema>,
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    try {
      return JSON.stringify(
        await this.taskService.update(owner.id, id, changes),
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return toolError(error.message);
      }
      throw error;
    }
  }

  @Tool({
    name: 'delete_maintenance_task',
    description: 'Delete a maintenance task by id.',
    parameters: z.object({ id: IdSchema }),
    annotations: { readOnlyHint: false },
  })
  async deleteMaintenanceTask(
    @Payload() { id }: { id: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    try {
      await this.taskService.remove(owner.id, id);
      return 'Maintenance task deleted.';
    } catch (error) {
      if (error instanceof NotFoundException) {
        return toolError(error.message);
      }
      throw error;
    }
  }
}
