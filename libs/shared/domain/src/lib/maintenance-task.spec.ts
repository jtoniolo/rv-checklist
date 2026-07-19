import {
  CreateMaintenanceTaskSchema,
  IntervalSchema,
  MaintenanceTaskSchema,
  UpdateMaintenanceTaskSchema,
} from './maintenance-task.js';

const id = (n: number) => `550e8400-e29b-41d4-a716-44665544000${String(n)}`;

describe('IntervalSchema', () => {
  it('parses a whole-month interval', () => {
    expect(IntervalSchema.parse({ months: 12 })).toEqual({ months: 12 });
  });

  it('rejects a zero interval', () => {
    expect(IntervalSchema.safeParse({ months: 0 }).success).toBe(false);
  });

  it('rejects a fractional interval', () => {
    expect(IntervalSchema.safeParse({ months: 1.5 }).success).toBe(false);
  });
});

describe('MaintenanceTaskSchema', () => {
  const task = {
    id: id(1),
    rigId: id(2),
    name: 'Inspect tires',
    interval: { months: 12 },
    fieldSchema: [
      { name: 'Tread depth', type: 'number', required: true, unit: '/32"' },
      { name: 'DOT date', type: 'text', required: false },
    ],
  };

  it('parses a task with an interval and fields', () => {
    expect(MaintenanceTaskSchema.parse(task)).toEqual(task);
  });

  it('parses a task with no interval (untracked for due-status)', () => {
    expect(
      MaintenanceTaskSchema.safeParse({
        id: id(1),
        rigId: id(2),
        name: 'Standalone job',
        fieldSchema: [],
      }).success,
    ).toBe(true);
  });

  it('rejects a photo field', () => {
    expect(
      MaintenanceTaskSchema.safeParse({
        ...task,
        fieldSchema: [{ name: 'Before', type: 'photo', required: false }],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate field names', () => {
    expect(
      MaintenanceTaskSchema.safeParse({
        ...task,
        fieldSchema: [
          { name: 'Dup', type: 'text', required: false },
          { name: 'Dup', type: 'number', required: false },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('CreateMaintenanceTaskSchema', () => {
  it('omits id and defaults an empty field schema', () => {
    const parsed = CreateMaintenanceTaskSchema.parse({
      rigId: id(2),
      name: 'Grease hitch',
    });
    expect(parsed.fieldSchema).toEqual([]);
    expect('id' in parsed).toBe(false);
  });
});

describe('UpdateMaintenanceTaskSchema', () => {
  it('accepts editing just the interval', () => {
    expect(
      UpdateMaintenanceTaskSchema.parse({ interval: { months: 6 } }),
    ).toEqual({ interval: { months: 6 } });
  });
});
