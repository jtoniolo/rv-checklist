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

  it('parses a task with a multi-line description', () => {
    const described = {
      ...task,
      description:
        'Seals dry out in the sun.\nWipe down, then apply conditioner.',
    };
    expect(MaintenanceTaskSchema.parse(described)).toEqual(described);
  });

  it('parses a task with no description — absent means absent', () => {
    const parsed = MaintenanceTaskSchema.parse(task);
    expect('description' in parsed).toBe(false);
  });

  it('rejects an empty-string description (no placeholder is stored)', () => {
    expect(
      MaintenanceTaskSchema.safeParse({ ...task, description: '' }).success,
    ).toBe(false);
  });

  it('rejects a whitespace-only description — absent means absent', () => {
    expect(
      MaintenanceTaskSchema.safeParse({ ...task, description: '  \n ' })
        .success,
    ).toBe(false);
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

  it('accepts an optional description', () => {
    const parsed = CreateMaintenanceTaskSchema.parse({
      rigId: id(2),
      name: 'Grease hitch',
      description: 'Prevents hitch squeak on tight turns.',
    });
    expect(parsed.description).toBe('Prevents hitch squeak on tight turns.');
  });
});

describe('UpdateMaintenanceTaskSchema', () => {
  it('accepts editing just the interval', () => {
    expect(
      UpdateMaintenanceTaskSchema.parse({ interval: { months: 6 } }),
    ).toEqual({ interval: { months: 6 } });
  });

  it('accepts editing just the description', () => {
    expect(
      UpdateMaintenanceTaskSchema.parse({ description: 'Why and how.' }),
    ).toEqual({ description: 'Why and how.' });
  });

  it('accepts `description: null` — the removal marker, like `interval: null`', () => {
    // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
    const removal = { description: null };
    expect(UpdateMaintenanceTaskSchema.parse(removal)).toEqual(removal);
  });
});
