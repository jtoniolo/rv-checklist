import {
  liveChecklistIds,
  tripStatus,
  type Checklist,
  type EquipmentItem,
  type Id,
  type LogEntry,
  type MaintenanceTask,
  type Rig,
  type Run,
  type StopRead,
  type TripRead,
} from '@rv-checklist/domain';
import type { LocalQuery } from './local-store.js';
import {
  toAttachment,
  toChecklist,
  toEquipmentItem,
  toLogEntry,
  toMaintenanceTask,
  toRig,
  toRun,
  toStop,
  toTrip,
} from './rows.js';
import { localColumns, type LocalRow } from './tables.js';

/**
 * One local query per syncable endpoint (ADR-0029). Each is a faithful
 * reconstruction of the endpoint's payload from the ten synced tables, so a
 * watch emission is indistinguishable from the REST response it replaces.
 *
 * Endpoints whose payload carries anything the API computes from data that
 * does not sync — the Maps proxies, the MCP and OAuth surfaces, the web
 * session list, and `me` — have no query here and stay network-only (#155).
 *
 * Ordering follows the API repositories where they order at all. `listRigs`,
 * `listChecklists`, `listEquipment`, `listRunsByRig` and `listLogEntriesByRig`
 * issue an unordered `find`, so Postgres makes no promise and the screens
 * either sort themselves or use the result as an unordered pool; those read
 * `created_at` ascending here so the local order is at least stable.
 */

const rigColumns = localColumns('rigs');
const checklistColumns = localColumns('checklists');
const equipmentColumns = localColumns('equipment_items');
const runColumns = localColumns('runs');
const taskColumns = localColumns('maintenance_tasks');
const logEntryColumns = localColumns('log_entries');
const tripColumns = localColumns('trips');
const stopColumns = localColumns('stops');
const attachmentColumns = localColumns('attachments');

export const rigsQuery: LocalQuery<Rig[]> = {
  tables: ['rigs'],
  async run(store) {
    const rows = await store.getAll<LocalRow<'rigs'>>(
      `SELECT ${rigColumns} FROM rigs ORDER BY created_at`,
    );
    return rows.map((row) => toRig(row));
  },
};

export function checklistsQuery(rigId: Id): LocalQuery<Checklist[]> {
  return {
    tables: ['checklists'],
    async run(store) {
      const rows = await store.getAll<LocalRow<'checklists'>>(
        `SELECT ${checklistColumns} FROM checklists WHERE rig_id = ? ORDER BY created_at`,
        [rigId],
      );
      return rows.map((row) => toChecklist(row));
    },
  };
}

export function equipmentQuery(rigId: Id): LocalQuery<EquipmentItem[]> {
  return {
    tables: ['equipment_items'],
    async run(store) {
      const rows = await store.getAll<LocalRow<'equipment_items'>>(
        `SELECT ${equipmentColumns} FROM equipment_items WHERE rig_id = ? ORDER BY created_at`,
        [rigId],
      );
      return rows.map((row) => toEquipmentItem(row));
    },
  };
}

export function tasksQuery(rigId: Id): LocalQuery<MaintenanceTask[]> {
  return {
    tables: ['maintenance_tasks'],
    async run(store) {
      const rows = await store.getAll<LocalRow<'maintenance_tasks'>>(
        `SELECT ${taskColumns} FROM maintenance_tasks WHERE rig_id = ? ORDER BY name`,
        [rigId],
      );
      return rows.map((row) => toMaintenanceTask(row));
    },
  };
}

export function logEntriesByTaskQuery(taskId: Id): LocalQuery<LogEntry[]> {
  return {
    tables: ['log_entries'],
    async run(store) {
      const rows = await store.getAll<LocalRow<'log_entries'>>(
        `SELECT ${logEntryColumns} FROM log_entries WHERE task_id = ?
         ORDER BY performed_on DESC, created_at DESC`,
        [taskId],
      );
      return rows.map((row) => toLogEntry(row));
    },
  };
}

export function logEntriesByRigQuery(rigId: Id): LocalQuery<LogEntry[]> {
  return {
    tables: ['log_entries'],
    async run(store) {
      const rows = await store.getAll<LocalRow<'log_entries'>>(
        `SELECT ${logEntryColumns} FROM log_entries WHERE rig_id = ? ORDER BY created_at`,
        [rigId],
      );
      return rows.map((row) => toLogEntry(row));
    },
  };
}

export function runsByChecklistQuery(checklistId: Id): LocalQuery<Run[]> {
  return {
    tables: ['runs'],
    async run(store) {
      const rows = await store.getAll<LocalRow<'runs'>>(
        `SELECT ${runColumns} FROM runs WHERE checklist_id = ?
         ORDER BY started_on DESC, created_at DESC`,
        [checklistId],
      );
      return rows.map((row) => toRun(row));
    },
  };
}

export function runsByTripQuery(tripId: Id): LocalQuery<Run[]> {
  return {
    tables: ['runs'],
    async run(store) {
      const rows = await store.getAll<LocalRow<'runs'>>(
        `SELECT ${runColumns} FROM runs WHERE trip_id = ?
         ORDER BY started_on DESC, created_at DESC`,
        [tripId],
      );
      return rows.map((row) => toRun(row));
    },
  };
}

export function runsByRigQuery(rigId: Id): LocalQuery<Run[]> {
  return {
    tables: ['runs'],
    async run(store) {
      const rows = await store.getAll<LocalRow<'runs'>>(
        `SELECT ${runColumns} FROM runs WHERE rig_id = ? ORDER BY created_at`,
        [rigId],
      );
      return rows.map((row) => toRun(row));
    },
  };
}

export function runQuery(runId: Id): LocalQuery<Run> {
  return {
    tables: ['runs'],
    async run(store) {
      const rows = await store.getAll<LocalRow<'runs'>>(
        `SELECT ${runColumns} FROM runs WHERE id = ?`,
        [runId],
      );
      const row = rows[0];
      // Absent locally means "not replicated yet" as often as "deleted", and
      // there is no cache value for "gone" — leave the entry alone.
      return row === undefined ? undefined : toRun(row);
    },
  };
}

/**
 * The rig's trips as `TripRead` — the one endpoint whose payload the API
 * assembles rather than reads. Sync rules cannot join, but local watch SQL is
 * under no such rule, so the three rig-scoped tables are read in one pass each
 * (stops and attachments carry the denormalized `rig_id` from #140) and
 * stitched in memory. `status` is derived from the stops exactly as the API
 * derives it, and `checklistIds` drops ids whose checklist no longer exists.
 */
export function tripsByRigQuery(rigId: Id): LocalQuery<TripRead[]> {
  return {
    tables: ['trips', 'stops', 'attachments', 'checklists'],
    async run(store) {
      const [trips, stops, attachments, checklists] = await Promise.all([
        store.getAll<LocalRow<'trips'>>(
          `SELECT ${tripColumns} FROM trips WHERE rig_id = ? ORDER BY created_at`,
          [rigId],
        ),
        store.getAll<LocalRow<'stops'>>(
          `SELECT ${stopColumns} FROM stops WHERE rig_id = ? ORDER BY position`,
          [rigId],
        ),
        store.getAll<LocalRow<'attachments'>>(
          `SELECT ${attachmentColumns} FROM attachments WHERE rig_id = ? ORDER BY created_at`,
          [rigId],
        ),
        store.getAll<{ id: string }>(
          `SELECT id FROM checklists WHERE rig_id = ?`,
          [rigId],
        ),
      ]);
      return stitchTrips(trips, stops, attachments, checklists);
    },
  };
}

/**
 * Assemble `TripRead`s from rig-scoped rows. `stops` must arrive in position
 * order and `attachments` in upload order — both groupings preserve the order
 * they are given, which is how the API's per-trip and per-stop reads order
 * them.
 */
export function stitchTrips(
  trips: readonly LocalRow<'trips'>[],
  stops: readonly LocalRow<'stops'>[],
  attachments: readonly LocalRow<'attachments'>[],
  checklists: readonly { readonly id: string }[],
): TripRead[] {
  const existingChecklistIds = checklists.map((row) => row.id);

  const attachmentsByStop = new Map<string, LocalRow<'attachments'>[]>();
  for (const row of attachments) {
    const forStop = attachmentsByStop.get(row.stop_id);
    if (forStop === undefined) {
      attachmentsByStop.set(row.stop_id, [row]);
    } else {
      forStop.push(row);
    }
  }

  const stopsByTrip = new Map<string, StopRead[]>();
  for (const row of stops) {
    const stop: StopRead = {
      ...toStop(row),
      attachments: (attachmentsByStop.get(row.id) ?? []).map((attachment) =>
        toAttachment(attachment),
      ),
    };
    const forTrip = stopsByTrip.get(row.trip_id);
    if (forTrip === undefined) {
      stopsByTrip.set(row.trip_id, [stop]);
    } else {
      forTrip.push(stop);
    }
  }

  return trips.map((row) => {
    const trip = toTrip(row);
    const tripStops = stopsByTrip.get(row.id) ?? [];
    return {
      ...trip,
      checklistIds: liveChecklistIds(trip.checklistIds, existingChecklistIds),
      stops: tripStops,
      status: tripStatus(tripStops),
    };
  });
}
