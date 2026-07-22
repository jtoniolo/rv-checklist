import {
  CreateLogEntrySchema,
  LoggedFieldSchema,
  LogEntrySchema,
  toLoggedFields,
  UpdateLogEntrySchema,
} from './log-entry.js';

const id = (n: number) => `550e8400-e29b-41d4-a716-44665544000${String(n)}`;

describe('LoggedFieldSchema', () => {
  it('parses a snapshotted field with its recorded value', () => {
    const field = {
      name: 'Tire Pressure',
      type: 'number',
      required: true,
      unit: 'psi',
      value: 32,
    };
    expect(LoggedFieldSchema.parse(field)).toEqual(field);
  });

  it('parses a field with no recorded value yet', () => {
    expect(
      LoggedFieldSchema.safeParse({
        name: 'Notes',
        type: 'note',
        required: false,
      }).success,
    ).toBe(true);
  });

  it('rejects a photo field', () => {
    expect(
      LoggedFieldSchema.safeParse({
        name: 'Before',
        type: 'photo',
        required: false,
      }).success,
    ).toBe(false);
  });
});

describe('LogEntrySchema', () => {
  const entry = {
    id: id(1),
    taskId: id(2),
    rigId: id(3),
    taskName: 'Condition slide seals',
    performedOn: '2026-07-19',
    fields: [
      {
        name: 'Tire Pressure',
        type: 'number',
        required: true,
        unit: 'psi',
        value: 32,
      },
    ],
  };

  it('parses a valid log entry', () => {
    expect(LogEntrySchema.parse(entry)).toEqual(entry);
  });

  it('parses a log entry with no fields', () => {
    expect(LogEntrySchema.safeParse({ ...entry, fields: [] }).success).toBe(
      true,
    );
  });

  it('accepts a null taskId — the task was deleted, the entry is kept (issue #28)', () => {
    // eslint-disable-next-line unicorn/no-null
    expect(LogEntrySchema.safeParse({ ...entry, taskId: null }).success).toBe(
      true,
    );
  });

  it('rejects a non-date performedOn', () => {
    expect(
      LogEntrySchema.safeParse({ ...entry, performedOn: 'today' }).success,
    ).toBe(false);
  });

  it('requires a snapshotted taskName', () => {
    const { taskName: _dropped, ...withoutName } = entry;
    expect(LogEntrySchema.safeParse(withoutName).success).toBe(false);
  });

  it('rejects a blank taskName', () => {
    expect(LogEntrySchema.safeParse({ ...entry, taskName: '' }).success).toBe(
      false,
    );
  });

  it('rejects duplicate field names in the snapshot', () => {
    expect(
      LogEntrySchema.safeParse({
        ...entry,
        fields: [
          { name: 'Dup', type: 'text', required: false, value: 'a' },
          { name: 'Dup', type: 'text', required: false, value: 'b' },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('toLoggedFields', () => {
  const schema = [
    { name: 'Product used', type: 'text', required: true },
    { name: 'Notes', type: 'note', required: false },
  ] as const;

  it('snapshots every field definition, attaching each recorded value by name', () => {
    expect(
      toLoggedFields(schema, [{ name: 'Product used', value: '303' }]),
    ).toEqual([
      { name: 'Product used', type: 'text', required: true, value: '303' },
      { name: 'Notes', type: 'note', required: false },
    ]);
  });

  it('snapshots the definitions alone when nothing was recorded', () => {
    expect(toLoggedFields(schema, undefined)).toEqual([
      { name: 'Product used', type: 'text', required: true },
      { name: 'Notes', type: 'note', required: false },
    ]);
  });

  it('ignores a recorded value that names no field in the schema', () => {
    expect(toLoggedFields(schema, [{ name: 'Ghost', value: 1 }])).toEqual([
      { name: 'Product used', type: 'text', required: true },
      { name: 'Notes', type: 'note', required: false },
    ]);
  });
});

describe('CreateLogEntrySchema', () => {
  it('omits the server-assigned id', () => {
    const parsed = CreateLogEntrySchema.parse({
      taskId: id(2),
      rigId: id(3),
      performedOn: '2026-07-19',
      fields: [],
    });
    expect('id' in parsed).toBe(false);
  });

  it('does not carry the taskName — the server snapshots it from the task', () => {
    const parsed = CreateLogEntrySchema.parse({
      taskId: id(2),
      rigId: id(3),
      taskName: 'Client-supplied, must be dropped',
      performedOn: '2026-07-19',
      fields: [],
    });
    expect('taskName' in parsed).toBe(false);
  });

  it('still requires a real, non-null taskId — you always log against a live task (issue #28)', () => {
    expect(
      CreateLogEntrySchema.safeParse({
        // eslint-disable-next-line unicorn/no-null
        taskId: null,
        performedOn: '2026-07-19',
        fields: [],
      }).success,
    ).toBe(false);
  });

  it('rejects an absent taskId', () => {
    expect(
      CreateLogEntrySchema.safeParse({
        performedOn: '2026-07-19',
        fields: [],
      }).success,
    ).toBe(false);
  });
});

describe('UpdateLogEntrySchema', () => {
  it('never lets the frozen taskName be edited through an entry update', () => {
    const parsed = UpdateLogEntrySchema.parse({
      performedOn: '2026-07-19',
      taskName: 'Renamed via the entry — must be dropped',
    });
    expect('taskName' in parsed).toBe(false);
  });
});
