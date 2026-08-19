import {
  CreateRunSchema,
  runProgress,
  RunSchema,
  RunStepSchema,
  StepStateSchema,
  UpdateRunSchema,
} from './run.js';

const id = (n: number) => `550e8400-e29b-41d4-a716-44665544000${String(n)}`;

describe('StepStateSchema', () => {
  it.each(['incomplete', 'complete', 'skipped'])('accepts %s', (state) => {
    expect(StepStateSchema.safeParse(state).success).toBe(true);
  });

  it('rejects a boolean-style state', () => {
    expect(StepStateSchema.safeParse('checked').success).toBe(false);
  });
});

describe('RunStepSchema', () => {
  it('parses an incomplete plain step', () => {
    expect(
      RunStepSchema.safeParse({
        id: id(1),
        text: 'Close roof vents',
        state: 'incomplete',
      }).success,
    ).toBe(true);
  });

  it('parses a completed step with captured values', () => {
    const step = {
      id: id(2),
      text: 'Fresh water level',
      fieldSchema: [
        { name: 'Level', type: 'number', required: true, unit: '%' },
      ],
      state: 'complete',
      values: [{ name: 'Level', value: 80 }],
    };
    expect(RunStepSchema.parse(step)).toEqual(step);
  });

  it('rejects a task-linked run step that defines its own fields (ADR-0008)', () => {
    expect(
      RunStepSchema.safeParse({
        id: id(3),
        text: 'Condition seals',
        taskId: id(9),
        fieldSchema: [{ name: 'Product', type: 'text', required: true }],
        state: 'incomplete',
      }).success,
    ).toBe(false);
  });

  it('parses a completed task-linked step linked to the log entry it wrote (issue #18)', () => {
    const step = {
      id: id(4),
      text: 'Condition seals',
      taskId: id(9),
      state: 'complete',
      values: [{ name: 'Product', value: '303 Protectant' }],
      logEntryId: id(8),
    };
    expect(RunStepSchema.parse(step)).toEqual(step);
  });
});

describe('RunSchema', () => {
  const run = {
    id: id(4),
    checklistId: id(5),
    rigId: id(6),
    startedOn: '2026-07-19',
    steps: [{ id: id(1), text: 'Close roof vents', state: 'incomplete' }],
  };

  it('parses a valid run', () => {
    expect(RunSchema.parse(run)).toEqual(run);
  });

  it('rejects a non-date startedOn', () => {
    expect(
      RunSchema.safeParse({ ...run, startedOn: 'yesterday' }).success,
    ).toBe(false);
  });
});

describe('CreateRunSchema', () => {
  it('needs only the checklist to run — the server copies its steps', () => {
    expect(CreateRunSchema.parse({ checklistId: id(5) })).toEqual({
      checklistId: id(5),
    });
  });

  it('accepts an explicit dated occasion', () => {
    expect(
      CreateRunSchema.safeParse({ checklistId: id(5), startedOn: '2026-07-19' })
        .success,
    ).toBe(true);
  });
});

describe('UpdateRunSchema', () => {
  const steps = [
    { id: id(1), text: 'Close roof vents', state: 'complete' },
    {
      id: id(2),
      text: 'Fresh water level',
      fieldSchema: [
        { name: 'Level', type: 'number', required: true, unit: '%' },
      ],
      state: 'complete',
      values: [{ name: 'Level', value: 80 }],
    },
  ];

  it('edits a run’s step states and captured answers', () => {
    expect(UpdateRunSchema.parse({ steps })).toEqual({ steps });
  });

  it('allows re-dating the occasion', () => {
    expect(UpdateRunSchema.safeParse({ startedOn: '2026-07-20' }).success).toBe(
      true,
    );
  });

  it('accepts an empty edit — nothing changes', () => {
    expect(UpdateRunSchema.parse({})).toEqual({});
  });

  it('rejects an unknown step state', () => {
    expect(
      UpdateRunSchema.safeParse({
        steps: [{ id: id(1), text: 'x', state: 'ticked' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a task-linked step that defines its own fields (ADR-0008)', () => {
    expect(
      UpdateRunSchema.safeParse({
        steps: [
          {
            id: id(1),
            text: 'Condition seals',
            taskId: id(9),
            fieldSchema: [{ name: 'Product', type: 'text', required: true }],
            state: 'incomplete',
          },
        ],
      }).success,
    ).toBe(false);
  });
});

const step = (state: 'incomplete' | 'complete' | 'skipped') => ({ state });

describe('runProgress', () => {
  it('tallies steps by state and flags an in-progress run', () => {
    const progress = runProgress({
      steps: [step('complete'), step('skipped'), step('incomplete')],
    });
    expect(progress).toEqual({
      completed: 1,
      skipped: 1,
      incomplete: 1,
      total: 3,
      inProgress: true,
    });
  });

  it('is done when nothing is incomplete — completed or skipped both count as resolved', () => {
    const progress = runProgress({
      steps: [step('complete'), step('skipped')],
    });
    expect(progress.inProgress).toBe(false);
    expect(progress.completed).toBe(1);
    expect(progress.skipped).toBe(1);
  });

  it('treats an empty run as not in progress', () => {
    expect(runProgress({ steps: [] })).toEqual({
      completed: 0,
      skipped: 0,
      incomplete: 0,
      total: 0,
      inProgress: false,
    });
  });
});

describe('run tripId link (issue #111)', () => {
  const base = {
    id: id(1),
    checklistId: id(2),
    rigId: id(3),
    startedOn: '2026-08-19',
    steps: [],
  };

  it('parses a run linked to a trip', () => {
    const linked = { ...base, tripId: id(4) };
    expect(RunSchema.parse(linked)).toEqual(linked);
  });

  it('parses a run with no trip link', () => {
    expect(RunSchema.parse(base)).toEqual(base);
  });

  it('accepts an optional tripId on the create body', () => {
    const body = { checklistId: id(2), tripId: id(4) };
    expect(CreateRunSchema.parse(body)).toEqual(body);
  });

  it('rejects a non-uuid tripId', () => {
    expect(RunSchema.safeParse({ ...base, tripId: 'nope' }).success).toBe(
      false,
    );
  });
});
