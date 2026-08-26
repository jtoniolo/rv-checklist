import type { CrudEntry } from '@powersync/web';
import {
  toChecklist,
  toEquipmentItem,
  toLogEntry,
  toMaintenanceTask,
  toRig,
  toRun,
  toStop,
  toTrip,
} from './rows.js';
import type { LocalRow, LocalTableName } from './tables.js';
import type { UploadMetadata } from './upload-metadata.js';

/** One HTTP call the connector must make to replay a queued operation. */
export interface UploadRequest {
  readonly method: 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly body?: unknown;
  /**
   * Response statuses that mean "this can never succeed, and that is fine" —
   * a taken client id on replay (ADR-0028, #143) or a row already gone
   * (delete already applied, or a stale edit racing a delete). The connector
   * treats these the same as success: complete the entry, never retry it.
   */
  readonly fatalStatuses: readonly number[];
  /** `X-Edited-At`, when the write carries a client clock reading (#141). */
  readonly editedAt?: string;
}

/** A taken-id create is 404 or 409 (ADR-0028); every other op is 404-only. */
const CREATE_FATAL_STATUSES = [404, 409];
const FATAL_STATUSES = [404];

function pick(
  wire: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.hasOwn(wire, key)) body[key] = wire[key];
  }
  return body;
}

/**
 * The full record projected through its wire shape, with every key in `keys`
 * present — a key the projection omitted (an unset optional column) becomes
 * an explicit `null`. Every `Update*Schema` in the domain package is partial
 * over exactly this shape (value sets a field, `null` clears it, an omitted
 * key leaves it alone), so sending the record's whole current state this way
 * is indistinguishable from a true diff: an untouched field's value is its
 * own value again, a no-op.
 */
function withNulls(
  wire: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of keys) {
    // eslint-disable-next-line unicorn/no-null
    body[key] = Object.hasOwn(wire, key) ? wire[key] : null;
  }
  return body;
}

function stamp(
  request: Omit<UploadRequest, 'editedAt'>,
  metadata: UploadMetadata,
): UploadRequest {
  return {
    ...request,
    ...(metadata.editedAt !== undefined && { editedAt: metadata.editedAt }),
  };
}

/**
 * Map one queued CRUD entry to the semantic HTTP call that replays it
 * (ADR-0028's write path). `row` is the entry's row exactly as it stands in
 * the local store right now — absent only for a `DELETE`, where there is
 * nothing left to read, or a race the local write path is not expected to hit
 * (the row deleted again before this entry replayed). `undefined` means
 * "nothing to send, this entry is done" — the `users` table (network-only,
 * never written) and an attachment create (offline capture goes through the
 * IndexedDB outbox in ADR-0028, never this queue).
 */
export function planUpload(
  entry: CrudEntry,
  row: Record<string, unknown> | undefined,
  metadata: UploadMetadata,
): UploadRequest | undefined {
  const table = entry.table as LocalTableName;

  if (table === 'users') return undefined;

  // Widened to `string`, not compared as `entry.op === UpdateType.*`:
  // `@powersync/web`'s runtime export is ESM the Jest transform does not
  // touch, so this module (unlike `tables.ts` and its neighbours) must import
  // no value from the SDK — only `CrudEntry`'s type, erased at compile.
  // `CrudEntry.op`'s own type still checks these against a real `UpdateType`.
  const op: string = entry.op;
  if (op === 'DELETE') {
    return stamp(planDelete(table, entry.id), metadata);
  }
  if (row === undefined) return undefined;

  if (op === 'PUT') {
    const request = planCreate(table, entry, row);
    return request && stamp(request, metadata);
  }

  // 'PATCH'
  const request = planUpdate(table, entry, row, metadata);
  return request && stamp(request, metadata);
}

function planDelete(
  table: LocalTableName,
  id: string,
): Omit<UploadRequest, 'editedAt'> {
  const path: Record<LocalTableName, string> = {
    users: '',
    rigs: `/rigs/${id}`,
    equipment_items: `/equipment/${id}`,
    checklists: `/checklists/${id}`,
    runs: `/runs/${id}`,
    maintenance_tasks: `/tasks/${id}`,
    log_entries: `/log-entries/${id}`,
    trips: `/trips/${id}`,
    stops: `/stops/${id}`,
    attachments: `/attachments/${id}`,
  };
  return { method: 'DELETE', path: path[table], fatalStatuses: FATAL_STATUSES };
}

/**
 * A rig's editable wire fields — shared by create and edit: `CreateRigSchema`
 * is `RigSchema.omit({ id, ownerId })` and `UpdateRigSchema` is that same
 * shape made partial, so the two accept exactly the same field names.
 */
const RIG_FIELD_KEYS = [
  'nickname',
  'vin',
  'make',
  'model',
  'year',
  'distanceKm',
  'travelHeightMm',
  'lengthMm',
  'combinedLengthMm',
  'clearancePassengerMm',
  'clearanceDriverMm',
] as const;

const CREATE_KEYS: Partial<Record<LocalTableName, readonly string[]>> = {
  rigs: RIG_FIELD_KEYS,
  equipment_items: [
    'rigId',
    'name',
    'make',
    'model',
    'purchaseDate',
    'notes',
    'costCents',
  ],
  checklists: ['rigId', 'name', 'tags', 'steps'],
  maintenance_tasks: [
    'rigId',
    'name',
    'description',
    'interval',
    'oneTime',
    'lastPerformed',
    'fieldSchema',
    'tags',
  ],
  log_entries: [
    'taskId',
    'performedOn',
    'distanceKm',
    'costCents',
    'comment',
    'fields',
  ],
  trips: ['rigId', 'name', 'startLocation', 'startPlaceId', 'checklistIds'],
  runs: ['checklistId', 'tripId', 'startedOn'],
  // `stops` omits `position` and `arrived` — both server-owned on create.
  stops: [
    'tripId',
    'campground',
    'placeId',
    'campsite',
    'arrivalDate',
    'nights',
    'checkInTime',
    'checkOutTime',
    'bookingNumber',
    'costCents',
    'address',
    'phone',
    'notes',
    'legKm',
    'legKmManual',
  ],
};

const CREATE_ENDPOINT: Partial<Record<LocalTableName, string>> = {
  rigs: '/rigs',
  equipment_items: '/equipment',
  checklists: '/checklists',
  maintenance_tasks: '/tasks',
  log_entries: '/log-entries',
  trips: '/trips',
  runs: '/runs',
  stops: '/stops',
};

function toWire(table: LocalTableName, row: Record<string, unknown>) {
  switch (table) {
    case 'rigs': {
      return toRig(row as LocalRow<'rigs'>);
    }
    case 'equipment_items': {
      return toEquipmentItem(row as LocalRow<'equipment_items'>);
    }
    case 'checklists': {
      return toChecklist(row as LocalRow<'checklists'>);
    }
    case 'maintenance_tasks': {
      return toMaintenanceTask(row as LocalRow<'maintenance_tasks'>);
    }
    case 'log_entries': {
      return toLogEntry(row as LocalRow<'log_entries'>);
    }
    case 'trips': {
      return toTrip(row as LocalRow<'trips'>);
    }
    case 'runs': {
      return toRun(row as LocalRow<'runs'>);
    }
    case 'stops': {
      return toStop(row as LocalRow<'stops'>);
    }
    default: {
      return;
    }
  }
}

function planCreate(
  table: LocalTableName,
  entry: CrudEntry,
  row: Record<string, unknown>,
): Omit<UploadRequest, 'editedAt'> | undefined {
  const endpoint = CREATE_ENDPOINT[table];
  const keys = CREATE_KEYS[table];
  if (endpoint === undefined || keys === undefined) return undefined;

  const wire = toWire(table, row);
  if (wire === undefined) return undefined;

  const body = { id: entry.id, ...pick(wire, keys) };
  return {
    method: 'POST',
    path: endpoint,
    body,
    fatalStatuses: CREATE_FATAL_STATUSES,
  };
}

const UPDATE_KEYS: Partial<Record<LocalTableName, readonly string[]>> = {
  rigs: RIG_FIELD_KEYS,
  equipment_items: [
    'name',
    'make',
    'model',
    'purchaseDate',
    'notes',
    'costCents',
  ],
  checklists: ['name', 'tags', 'steps'],
  maintenance_tasks: [
    'name',
    'description',
    'interval',
    'oneTime',
    'lastPerformed',
    'fieldSchema',
    'tags',
  ],
  log_entries: ['performedOn', 'distanceKm', 'costCents', 'comment', 'fields'],
  trips: ['name', 'startLocation', 'startPlaceId', 'checklistIds'],
  runs: ['startedOn', 'steps'],
  stops: [
    'campground',
    'placeId',
    'campsite',
    'arrivalDate',
    'nights',
    'checkInTime',
    'checkOutTime',
    'bookingNumber',
    'costCents',
    'address',
    'phone',
    'notes',
    'legKm',
    'legKmManual',
  ],
};

function planUpdate(
  table: LocalTableName,
  entry: CrudEntry,
  row: Record<string, unknown>,
  metadata: UploadMetadata,
): Omit<UploadRequest, 'editedAt'> | undefined {
  if (table === 'stops') return planStopUpdate(entry, row);
  if (table === 'attachments') return planAttachmentUpdate(entry);
  if (table === 'runs' && metadata.runStepOps !== undefined) {
    return {
      method: 'POST',
      path: `/runs/${entry.id}/step-ops`,
      body: { ops: metadata.runStepOps },
      fatalStatuses: FATAL_STATUSES,
    };
  }

  const keys = UPDATE_KEYS[table];
  const endpoint = CREATE_ENDPOINT[table];
  if (keys === undefined || endpoint === undefined) return undefined;
  const wire = toWire(table, row);
  if (wire === undefined) return undefined;

  return {
    method: 'PATCH',
    path: `${endpoint}/${entry.id}`,
    body: withNulls(wire, keys),
    fatalStatuses: FATAL_STATUSES,
  };
}

/**
 * A stop's three write shapes share one table, distinguished by which
 * columns the local write actually touched (`opData`, PowerSync's diff of
 * changed columns): `arrived` alone is the arrival operation, `position`
 * alone is reorder, anything else is the plain detail PATCH. The write path
 * is expected to keep these single-purpose, matching the API's own split
 * (`stop.controller.ts`) — a local write that touched more than one group in
 * a single SQL statement is not a shape this connector can disambiguate.
 */
function planStopUpdate(
  entry: CrudEntry,
  row: Record<string, unknown>,
): Omit<UploadRequest, 'editedAt'> | undefined {
  const changed = entry.opData ?? {};

  if ('arrived' in changed) {
    return {
      method: 'POST',
      path: `/stops/${entry.id}/arrival`,
      body: {
        arrived: changed['arrived'] === 1 || changed['arrived'] === true,
      },
      fatalStatuses: FATAL_STATUSES,
    };
  }
  if ('position' in changed) {
    return {
      method: 'POST',
      path: `/stops/${entry.id}/reorder`,
      body: { position: Number(changed['position']) },
      fatalStatuses: FATAL_STATUSES,
    };
  }

  const wire = toStop(row as LocalRow<'stops'>);
  return {
    method: 'PATCH',
    path: `/stops/${entry.id}`,
    body: withNulls(wire, UPDATE_KEYS.stops ?? []),
    fatalStatuses: FATAL_STATUSES,
  };
}

/**
 * The only attachment edit a client makes is the campground-map flag — every
 * other column is set once, at upload, through the multipart outbox and never
 * touched again. `is_campground_map` is the one column this table's local
 * write is expected to change.
 */
function planAttachmentUpdate(
  entry: CrudEntry,
): Omit<UploadRequest, 'editedAt'> | undefined {
  const changed = entry.opData ?? {};
  if (!('is_campground_map' in changed)) return undefined;

  return {
    method: 'POST',
    path: `/attachments/${entry.id}/campground-map`,
    body: {
      isCampgroundMap:
        changed['is_campground_map'] === 1 ||
        changed['is_campground_map'] === true,
    },
    fatalStatuses: FATAL_STATUSES,
  };
}
