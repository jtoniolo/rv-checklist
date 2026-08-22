import { Injectable, NotFoundException } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { McpController, McpRawRequest, Tool } from '@rekog/mcp-nest';
import {
  CreateChecklistSchema,
  CreateMaintenanceTaskSchema,
  CreateStopSchema,
  CreateTripSchema,
  IdSchema,
  SetStopArrivedSchema,
  UpdateChecklistSchema,
  UpdateMaintenanceTaskSchema,
  UpdateStopSchema,
  UpdateTripSchema,
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
import { StopService } from '../trips/stop.service.js';
import { TripService } from '../trips/trip.service.js';

function ownerFrom(req: Request | undefined): Owner {
  return (req as unknown as { user: Owner }).user;
}

function toolError(text: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text }],
  };
}

/**
 * Surface a service `NotFoundException` as a tool error ("Rig not found")
 * instead of letting it escape as an opaque "Internal server error".
 */
async function notFoundAsToolError<T>(
  fn: () => Promise<T>,
): Promise<T | ReturnType<typeof toolError>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof NotFoundException) {
      return toolError(error.message);
    }
    throw error;
  }
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
    private readonly tripService: TripService,
    private readonly stopService: StopService,
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
      'Get a single rig by id. Returns nickname, VIN, make, model, year, current Distance (km), Dimensions (integer millimetres: travelHeightMm, lengthMm, combinedLengthMm, clearancePassengerMm, clearanceDriverMm — measured figures, no safety margin), and the equipment list. Equipment is context-only inventory; the purchase date anchors warranty status; cost is integer cents.',
    parameters: z.object({ id: IdSchema }),
    annotations: { readOnlyHint: true },
  })
  async getRig(
    @Payload() { id }: { id: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.rigService.get(owner.id, id)),
    );
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
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.checklistService.list(owner.id, rigId)),
    );
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
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.checklistService.get(owner.id, id)),
    );
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
      return notFoundAsToolError(async () =>
        JSON.stringify(
          await this.runService.listByChecklist(owner.id, checklistId),
        ),
      );
    }
    if (rigId !== undefined) {
      return notFoundAsToolError(async () =>
        JSON.stringify(await this.runService.listByRig(owner.id, rigId)),
      );
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
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.runService.get(owner.id, id)),
    );
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
    return notFoundAsToolError(async () => {
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
    });
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
    return notFoundAsToolError(async () => {
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
    });
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
      return notFoundAsToolError(async () =>
        JSON.stringify(await this.logEntryService.listByTask(owner.id, taskId)),
      );
    }
    if (rigId !== undefined) {
      return notFoundAsToolError(async () =>
        JSON.stringify(await this.logEntryService.listByRig(owner.id, rigId)),
      );
    }
    return toolError('Provide one of taskId or rigId.');
  }

  @Tool({
    name: 'list_trips',
    description:
      "List all trips on a rig. A trip is a named one-way journey from a starting point through an ordered sequence of stops. Each trip embeds its stops in order and its status (planned, underway, completed) — status is derived from which stops are arrived and is never set directly. Distances (legKm) are kilometres. Each stop carries its attachments' metadata only (filename, type, size, campground-map flag); the campground map is for finding the way inside the grounds, not the navigation link that drives to the stop.",
    parameters: z.object({ rigId: IdSchema }),
    annotations: { readOnlyHint: true },
  })
  async listTrips(
    @Payload() { rigId }: { rigId: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.tripService.list(owner.id, rigId)),
    );
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
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.checklistService.create(owner.id, input)),
    );
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
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.checklistService.update(owner.id, id, changes)),
    );
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
    return notFoundAsToolError(async () => {
      await this.checklistService.remove(owner.id, id);
      return 'Checklist deleted.';
    });
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
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.taskService.create(owner.id, input)),
    );
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
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.taskService.update(owner.id, id, changes)),
    );
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
    return notFoundAsToolError(async () => {
      await this.taskService.remove(owner.id, id);
      return 'Maintenance task deleted.';
    });
  }

  // -- Trip writes ----------------------------------------------------------

  @Tool({
    name: 'create_trip',
    description:
      'Create a trip on a rig — a named one-way journey; it ends wherever its last stop is. Optional initial stops are created with the trip in one atomic save, positioned in array order and not yet arrived. Status is derived from stop arrivals and is never set directly. checklistIds links checklists of convenience to the trip.',
    parameters: CreateTripSchema,
    annotations: { readOnlyHint: false },
  })
  async createTrip(
    @Payload() input: z.infer<typeof CreateTripSchema>,
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.tripService.create(owner.id, input)),
    );
  }

  @Tool({
    name: 'update_trip',
    description:
      'Update a trip by id (rig membership never changes). An explicit null clears a start-point field; checklistIds replaces the whole set. Status is derived from stop arrivals and cannot be set here.',
    parameters: z.object({ id: IdSchema }).extend(UpdateTripSchema.shape),
    annotations: { readOnlyHint: false },
  })
  async updateTrip(
    @Payload()
    { id, ...changes }: { id: string } & z.infer<typeof UpdateTripSchema>,
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.tripService.update(owner.id, id, changes)),
    );
  }

  @Tool({
    name: 'delete_trip',
    description:
      "Delete a trip by id. Its stops (and their attachments) go with it; its runs are unlinked, never deleted. The rig's Distance is untouched — the kilometres were really driven.",
    parameters: z.object({ id: IdSchema }),
    annotations: { readOnlyHint: false },
  })
  async deleteTrip(
    @Payload() { id }: { id: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    return notFoundAsToolError(async () => {
      await this.tripService.remove(owner.id, id);
      return 'Trip deleted.';
    });
  }

  // -- Stop writes ----------------------------------------------------------

  @Tool({
    name: 'add_stop',
    description:
      "Add a stop to a trip — appends at the end; position and arrived are server-owned. legKm is the distance in whole kilometres driven into this stop from the previous stop or the trip's starting point.",
    parameters: CreateStopSchema,
    annotations: { readOnlyHint: false },
  })
  async addStop(
    @Payload() input: z.infer<typeof CreateStopSchema>,
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.stopService.create(owner.id, input)),
    );
  }

  @Tool({
    name: 'update_stop',
    description:
      "Update a stop by id (trip membership never changes). An explicit null clears a field. Distances are kilometres; editing an arrived stop's legKm adjusts the rig's Distance by the difference. Arrival and position have their own operations and cannot be set here.",
    parameters: z.object({ id: IdSchema }).extend(UpdateStopSchema.shape),
    annotations: { readOnlyHint: false },
  })
  async updateStop(
    @Payload()
    { id, ...changes }: { id: string } & z.infer<typeof UpdateStopSchema>,
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.stopService.update(owner.id, id, changes)),
    );
  }

  @Tool({
    name: 'delete_stop',
    description:
      "Delete a stop by id. An arrived stop's leg is backed out of the rig's Distance; the trip's remaining stops are renumbered contiguously.",
    parameters: z.object({ id: IdSchema }),
    annotations: { readOnlyHint: false },
  })
  async deleteStop(
    @Payload() { id }: { id: string },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    return notFoundAsToolError(async () => {
      await this.stopService.remove(owner.id, id);
      return 'Stop deleted.';
    });
  }

  @Tool({
    name: 'mark_stop_arrived',
    description:
      "Mark a stop arrived (true) or un-arrive it (false, the undo). Arriving writes the stop's leg (km) onto the rig's Distance; un-arriving backs it out. Idempotent — re-asserting the current state changes nothing, so a leg is never counted twice. Trip status is derived from these arrivals and is never set directly.",
    parameters: z.object({ id: IdSchema }).extend(SetStopArrivedSchema.shape),
    annotations: { readOnlyHint: false },
  })
  async markStopArrived(
    @Payload() { id, arrived }: { id: string; arrived: boolean },
    @McpRawRequest() req?: Request,
  ) {
    const owner = ownerFrom(req);
    return notFoundAsToolError(async () =>
      JSON.stringify(await this.stopService.setArrived(owner.id, id, arrived)),
    );
  }
}
