import {
  CreateLogEntrySchema,
  LoggedFieldSchema,
  LogEntrySchema,
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

  it('rejects a non-date performedOn', () => {
    expect(
      LogEntrySchema.safeParse({ ...entry, performedOn: 'today' }).success,
    ).toBe(false);
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
});
