import {
  ChecklistSchema,
  CreateChecklistSchema,
  StepSchema,
  UpdateChecklistSchema,
} from './checklist.js';

const id = (n: number) => `550e8400-e29b-41d4-a716-44665544000${String(n)}`;

const plainStep = { id: id(1), text: 'Close roof vents' };
const taskLinkedStep = {
  id: id(2),
  text: 'Condition slide seals',
  taskId: id(9),
};
const fieldStep = {
  id: id(3),
  text: 'Fresh water level',
  fieldSchema: [{ name: 'Level', type: 'number', required: true, unit: '%' }],
};

describe('StepSchema', () => {
  it('parses a plain text step', () => {
    expect(StepSchema.parse(plainStep)).toEqual(plainStep);
  });

  it('parses a task-linked step', () => {
    expect(StepSchema.safeParse(taskLinkedStep).success).toBe(true);
  });

  it('parses a plain step that defines its own fields', () => {
    expect(StepSchema.safeParse(fieldStep).success).toBe(true);
  });

  it('rejects a task-linked step that also defines its own fields (ADR-0008)', () => {
    expect(
      StepSchema.safeParse({
        ...taskLinkedStep,
        fieldSchema: [{ name: 'Level', type: 'number', required: true }],
      }).success,
    ).toBe(false);
  });

  it('rejects a step whose own fields include a photo', () => {
    expect(
      StepSchema.safeParse({
        id: id(4),
        text: 'Before photo',
        fieldSchema: [{ name: 'Before', type: 'photo', required: false }],
      }).success,
    ).toBe(false);
  });

  it('rejects a blank step text', () => {
    expect(StepSchema.safeParse({ id: id(1), text: '' }).success).toBe(false);
  });
});

describe('ChecklistSchema', () => {
  const checklist = {
    id: id(5),
    rigId: id(6),
    name: 'Pre-departure',
    tags: ['procedure', 'departure'],
    steps: [plainStep, taskLinkedStep],
  };

  it('parses a valid checklist', () => {
    expect(ChecklistSchema.parse(checklist)).toEqual(checklist);
  });

  it('parses a checklist with no steps and no tags', () => {
    expect(
      ChecklistSchema.safeParse({
        id: id(5),
        rigId: id(6),
        name: 'Empty',
        tags: [],
        steps: [],
      }).success,
    ).toBe(true);
  });

  it('rejects a blank name', () => {
    expect(ChecklistSchema.safeParse({ ...checklist, name: '' }).success).toBe(
      false,
    );
  });
});

describe('CreateChecklistSchema', () => {
  it('accepts a create body with steps that carry no ids', () => {
    const parsed = CreateChecklistSchema.parse({
      rigId: id(6),
      name: 'New list',
      tags: ['packing'],
      steps: [{ text: 'Camp chairs' }],
    });
    expect(parsed.steps[0]).toEqual({ text: 'Camp chairs' });
  });

  it('defaults tags and steps to empty', () => {
    const parsed = CreateChecklistSchema.parse({ rigId: id(6), name: 'Bare' });
    expect(parsed.tags).toEqual([]);
    expect(parsed.steps).toEqual([]);
  });
});

describe('UpdateChecklistSchema', () => {
  it('lets an edit body keep existing step ids while adding an id-less new step', () => {
    const parsed = UpdateChecklistSchema.parse({
      steps: [
        { id: id(1), text: 'Close roof vents' },
        { text: 'A newly added step' },
      ],
    });
    expect(parsed.steps).toEqual([
      { id: id(1), text: 'Close roof vents' },
      { text: 'A newly added step' },
    ]);
  });

  it('accepts an empty patch', () => {
    expect(UpdateChecklistSchema.parse({})).toEqual({});
  });
});
