import {
  CreateMaintenanceTaskSchema,
  IntervalSchema,
  MaintenanceTaskSchema,
  UpdateMaintenanceTaskSchema,
} from './maintenance-task.js';

const id = (n: number) => `550e8400-e29b-41d4-a716-44665544000${String(n)}`;

describe('IntervalSchema', () => {
  it('parses a calendar interval', () => {
    expect(IntervalSchema.parse({ basis: 'calendar', months: 12 })).toEqual({
      basis: 'calendar',
      months: 12,
    });
  });

  it('parses a distance interval (issue #32)', () => {
    expect(IntervalSchema.parse({ basis: 'distance', km: 20_000 })).toEqual({
      basis: 'distance',
      km: 20_000,
    });
  });

  it('rejects an untagged { months } interval — a basis is required (ADR-0015)', () => {
    expect(IntervalSchema.safeParse({ months: 12 }).success).toBe(false);
  });

  it('rejects an unknown basis', () => {
    expect(
      IntervalSchema.safeParse({ basis: 'runtime', hours: 100 }).success,
    ).toBe(false);
  });

  it('rejects a zero interval', () => {
    expect(
      IntervalSchema.safeParse({ basis: 'calendar', months: 0 }).success,
    ).toBe(false);
    expect(IntervalSchema.safeParse({ basis: 'distance', km: 0 }).success).toBe(
      false,
    );
  });

  it('rejects a fractional interval', () => {
    expect(
      IntervalSchema.safeParse({ basis: 'calendar', months: 1.5 }).success,
    ).toBe(false);
    expect(
      IntervalSchema.safeParse({ basis: 'distance', km: 500.5 }).success,
    ).toBe(false);
  });
});

describe('MaintenanceTaskSchema', () => {
  const task = {
    id: id(1),
    rigId: id(2),
    name: 'Inspect tires',
    interval: { basis: 'calendar', months: 12 },
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

  it('parses a one-time task (due from creation, done once — issue #29)', () => {
    const oneTime = {
      id: id(1),
      rigId: id(2),
      name: 'Re-glue loose trim',
      oneTime: true as const,
      fieldSchema: [],
    };
    expect(MaintenanceTaskSchema.parse(oneTime)).toEqual(oneTime);
  });

  it('rejects a task that is both one-time and recurring — they are exclusive', () => {
    expect(
      MaintenanceTaskSchema.safeParse({
        id: id(1),
        rigId: id(2),
        name: 'Confused task',
        interval: { basis: 'calendar', months: 12 },
        oneTime: true,
        fieldSchema: [],
      }).success,
    ).toBe(false);
  });

  it('rejects `oneTime: false` — absent means not one-time, no false is stored', () => {
    expect(
      MaintenanceTaskSchema.safeParse({
        id: id(1),
        rigId: id(2),
        name: 'Recurring',
        oneTime: false,
        fieldSchema: [],
      }).success,
    ).toBe(false);
  });

  it('parses a manual last-performed anchor on a calendar task (issue #33)', () => {
    const anchored = { ...task, lastPerformed: '2025-07-21' };
    expect(MaintenanceTaskSchema.parse(anchored)).toEqual(anchored);
  });

  it('parses a task with no last-performed — absent means absent', () => {
    const parsed = MaintenanceTaskSchema.parse(task);
    expect('lastPerformed' in parsed).toBe(false);
  });

  it('rejects last-performed on a distance task — the anchor is calendar-only', () => {
    expect(
      MaintenanceTaskSchema.safeParse({
        ...task,
        interval: { basis: 'distance', km: 20_000 },
        lastPerformed: '2025-07-21',
      }).success,
    ).toBe(false);
  });

  it('rejects last-performed on an untracked task — no calendar interval to anchor', () => {
    expect(
      MaintenanceTaskSchema.safeParse({
        id: id(1),
        rigId: id(2),
        name: 'Untracked',
        lastPerformed: '2025-07-21',
        fieldSchema: [],
      }).success,
    ).toBe(false);
  });

  it('rejects last-performed on a one-time task — the two never combine', () => {
    expect(
      MaintenanceTaskSchema.safeParse({
        id: id(1),
        rigId: id(2),
        name: 'One-time',
        oneTime: true,
        lastPerformed: '2025-07-21',
        fieldSchema: [],
      }).success,
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

  it('accepts a one-time create (issue #29)', () => {
    const parsed = CreateMaintenanceTaskSchema.parse({
      rigId: id(2),
      name: 'Replenish first-aid kit',
      oneTime: true,
    });
    expect(parsed.oneTime).toBe(true);
    expect(parsed.interval).toBeUndefined();
  });

  it('rejects a create that is both one-time and recurring', () => {
    expect(
      CreateMaintenanceTaskSchema.safeParse({
        rigId: id(2),
        name: 'Confused',
        interval: { basis: 'calendar', months: 6 },
        oneTime: true,
      }).success,
    ).toBe(false);
  });

  it('accepts a manual last-performed anchor on a calendar create (issue #33)', () => {
    const parsed = CreateMaintenanceTaskSchema.parse({
      rigId: id(2),
      name: 'Repack bearings',
      interval: { basis: 'calendar', months: 12 },
      lastPerformed: '2025-07-21',
    });
    expect(parsed.lastPerformed).toBe('2025-07-21');
  });

  it('rejects a create with last-performed but no calendar interval', () => {
    expect(
      CreateMaintenanceTaskSchema.safeParse({
        rigId: id(2),
        name: 'Untracked',
        lastPerformed: '2025-07-21',
      }).success,
    ).toBe(false);
  });
});

describe('UpdateMaintenanceTaskSchema', () => {
  it('accepts editing just the interval', () => {
    expect(
      UpdateMaintenanceTaskSchema.parse({
        interval: { basis: 'calendar', months: 6 },
      }),
    ).toEqual({ interval: { basis: 'calendar', months: 6 } });
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

  it('accepts marking a task one-time (issue #29)', () => {
    expect(UpdateMaintenanceTaskSchema.parse({ oneTime: true })).toEqual({
      oneTime: true,
    });
  });

  it('accepts `oneTime: null` — the removal marker for the one-time flag', () => {
    // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
    const removal = { oneTime: null };
    expect(UpdateMaintenanceTaskSchema.parse(removal)).toEqual(removal);
  });

  it('accepts setting a manual last-performed anchor (issue #33)', () => {
    expect(
      UpdateMaintenanceTaskSchema.parse({ lastPerformed: '2025-07-21' }),
    ).toEqual({ lastPerformed: '2025-07-21' });
  });

  it('accepts `lastPerformed: null` — the removal marker for the manual anchor', () => {
    // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
    const removal = { lastPerformed: null };
    expect(UpdateMaintenanceTaskSchema.parse(removal)).toEqual(removal);
  });
});
