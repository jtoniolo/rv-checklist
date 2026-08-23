/**
 * The ten synced tables as they land in the browser's SQLite store (ADR-0028,
 * ADR-0029). Column names are the Postgres ones: the sync rules select `*`
 * (`charts/api/files/sync-rules.yaml`) and PowerSync replicates each column
 * under its own name, so these are snake_case and must track the API's
 * migrations.
 *
 * PowerSync's type mapping decides the two kinds below: `boolean` arrives as a
 * 0/1 integer, `date` and `timestamptz` as text, and `jsonb` and Postgres
 * arrays as serialized JSON text. Every table has an implicit `id`, so it is
 * not declared here.
 *
 * A trailing `?` marks a column Postgres allows to be NULL. This one
 * declaration drives the PowerSync schema, the row types the projections read,
 * and the SELECT lists the queries run — so a column cannot be spelled one way
 * in the schema and another way in a query.
 */
export type LocalColumnKind = 'text' | 'text?' | 'integer' | 'integer?';

export const localTables = {
  // Only the signed-in user's own row syncs. `me` stays network-only this
  // ticket (ADR-0029) — the table is here because the bucket carries it.
  users: {
    email: 'text',
    name: 'text?',
    picture: 'text?',
  },

  rigs: {
    owner_id: 'text',
    vin: 'text?',
    make: 'text?',
    model: 'text?',
    year: 'integer?',
    nickname: 'text',
    distance_km: 'integer?',
    travel_height_mm: 'integer?',
    length_mm: 'integer?',
    combined_length_mm: 'integer?',
    clearance_passenger_mm: 'integer?',
    clearance_driver_mm: 'integer?',
    created_at: 'text',
  },

  equipment_items: {
    rig_id: 'text',
    name: 'text',
    make: 'text?',
    model: 'text?',
    purchase_date: 'text?',
    notes: 'text?',
    cost_cents: 'integer?',
    created_at: 'text',
  },

  checklists: {
    rig_id: 'text',
    name: 'text',
    // jsonb — a JSON array of tag strings.
    tags: 'text',
    // jsonb — a JSON array of Step objects.
    steps: 'text',
    created_at: 'text',
  },

  runs: {
    checklist_id: 'text',
    rig_id: 'text',
    trip_id: 'text?',
    started_on: 'text',
    // jsonb — a JSON array of RunStep objects.
    steps: 'text',
    created_at: 'text',
  },

  maintenance_tasks: {
    rig_id: 'text',
    name: 'text',
    description: 'text?',
    interval_months: 'integer?',
    interval_km: 'integer?',
    one_time: 'integer',
    last_performed: 'text?',
    // jsonb — a JSON array of FieldDefinition objects.
    field_schema: 'text',
    // text[] — NULL when the task carries no tags.
    tags: 'text?',
    created_at: 'text',
  },

  log_entries: {
    task_id: 'text?',
    rig_id: 'text',
    // A stored snapshot of the task's name at completion, not a join (#27).
    task_name: 'text',
    performed_on: 'text',
    // The wire field is `distanceKm`; the column has always been at_distance_km.
    at_distance_km: 'integer?',
    cost_cents: 'integer?',
    comment: 'text?',
    // jsonb — a JSON array of LoggedField objects.
    fields: 'text',
    created_at: 'text',
  },

  trips: {
    rig_id: 'text',
    name: 'text',
    start_location: 'text?',
    start_place_id: 'text?',
    // uuid[] — a JSON array of checklist ids, unfiltered by deletion.
    checklist_ids: 'text',
    created_at: 'text',
  },

  stops: {
    trip_id: 'text',
    // Denormalized for the sync rules (#140); stripped from every wire read.
    rig_id: 'text',
    position: 'integer',
    arrived: 'integer',
    campground: 'text?',
    place_id: 'text?',
    campsite: 'text?',
    arrival_date: 'text?',
    nights: 'integer?',
    check_in_time: 'text?',
    check_out_time: 'text?',
    booking_number: 'text?',
    cost_cents: 'integer?',
    address: 'text?',
    phone: 'text?',
    notes: 'text?',
    leg_km: 'integer?',
    leg_km_manual: 'integer?',
    created_at: 'text',
  },

  attachments: {
    stop_id: 'text',
    // Denormalized for the sync rules (#140); stripped from every wire read.
    rig_id: 'text',
    filename: 'text',
    mime_type: 'text',
    size_bytes: 'integer',
    is_campground_map: 'integer',
    created_at: 'text',
  },
} as const satisfies Record<string, Record<string, LocalColumnKind>>;

export type LocalTableName = keyof typeof localTables;

/**
 * Indexes on the columns every read path filters by. The sync rules give a
 * client only its own owner's data, but a rig-scoped or trip-scoped watch
 * still re-runs on every replicated change, so the lookups stay indexed.
 */
export const localIndexes: Partial<
  Record<LocalTableName, Record<string, string[]>>
> = {
  equipment_items: { by_rig: ['rig_id'] },
  checklists: { by_rig: ['rig_id'] },
  runs: {
    by_rig: ['rig_id'],
    by_checklist: ['checklist_id'],
    by_trip: ['trip_id'],
  },
  maintenance_tasks: { by_rig: ['rig_id'] },
  log_entries: { by_rig: ['rig_id'], by_task: ['task_id'] },
  trips: { by_rig: ['rig_id'] },
  stops: { by_rig: ['rig_id'], by_trip: ['trip_id'] },
  attachments: { by_rig: ['rig_id'], by_stop: ['stop_id'] },
};

type ColumnValue<Kind extends LocalColumnKind> = Kind extends 'text'
  ? string
  : Kind extends 'text?'
    ? string | null
    : Kind extends 'integer'
      ? number
      : number | null;

/** A row of `table` as SQLite hands it back, with Postgres's nullability. */
export type LocalRow<Table extends LocalTableName> = {
  readonly id: string;
} & {
  readonly [Column in keyof (typeof localTables)[Table]]: ColumnValue<
    Extract<(typeof localTables)[Table][Column], LocalColumnKind>
  >;
};

/** The SELECT list for a table — `id` plus every declared column. */
export function localColumns(table: LocalTableName): string {
  return ['id', ...Object.keys(localTables[table])].join(', ');
}
