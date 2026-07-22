import { FieldSchemaSchema } from '@rv-checklist/domain';
import {
  SEED_CHECKLISTS,
  SEED_RIG_NICKNAME,
  SEED_TASKS,
} from './seed-content.js';

/**
 * The seed data transcribed from `docs/seed-content.md` (issue #19). These
 * tests pin the transcription to the doc's own counts and invariants, so a
 * drift between the doc and the constant is caught here, not in production.
 */
describe('seed content (docs/seed-content.md)', () => {
  describe('maintenance tasks', () => {
    it('defines the 16 tasks, every one on a 12-month interval', () => {
      expect(SEED_TASKS).toHaveLength(16);
      for (const task of SEED_TASKS) {
        expect(task.name).not.toBe('');
        expect(task.intervalMonths).toBe(12);
      }
    });

    it('task names are unique (steps reference tasks by name)', () => {
      const names = SEED_TASKS.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('every field schema is valid (no photo, unique names, units on numbers only)', () => {
      for (const task of SEED_TASKS) {
        expect(() => FieldSchemaSchema.parse(task.fieldSchema)).not.toThrow();
      }
    });

    it('every task ships with a non-blank description (issue #26)', () => {
      for (const task of SEED_TASKS) {
        expect(task.description.trim()).not.toBe('');
      }
    });

    it('transcribes the doc’s wheel-bearing description verbatim, make/model-agnostic', () => {
      const byName = new Map(SEED_TASKS.map((t) => [t.name, t.description]));
      expect(byName.get('Repack / inspect wheel bearings')).toBe(
        'Worn or dry wheel bearings can seize or fail at speed, risking a wheel coming off the trailer. How: 1) Raise and support the axle so the wheel spins free; 2) Pull the hub and check the bearings and races for pitting, discoloration, or roughness; 3) Clean and repack (or replace) the bearings with fresh grease; 4) Reassemble, set the bearing preload, and confirm the wheel spins smoothly with no play.',
      );
      expect(byName.get('Test smoke / CO / propane alarms')).toBe(
        'Smoke, CO, and propane alarms are life-safety devices that fail silently, so they must be tested and dated. How: 1) Press the test button on each alarm to confirm it sounds; 2) Check the manufacture or expiration date and replace expired units; 3) Replace batteries where applicable; 4) Confirm each detector is securely mounted and unobstructed.',
      );
    });

    it('carries the doc’s measured fields with their units', () => {
      const byName = new Map(SEED_TASKS.map((t) => [t.name, t.fieldSchema]));
      expect(byName.get('Inspect tires — pressure, tread, age')).toEqual([
        { name: 'tread depth', type: 'number', required: false, unit: '/32"' },
        { name: 'DOT date', type: 'text', required: false },
        { name: 'set pressure', type: 'number', required: false, unit: 'psi' },
      ]);
      expect(byName.get('Battery service — charge & terminals')).toEqual([
        { name: 'resting voltage', type: 'number', required: false, unit: 'V' },
      ]);
    });
  });

  describe('checklists', () => {
    it('defines 9 checklists: 4 packing + 5 procedures', () => {
      expect(SEED_CHECKLISTS).toHaveLength(9);
      const packing = SEED_CHECKLISTS.filter((c) => c.tags.includes('packing'));
      const procedures = SEED_CHECKLISTS.filter((c) =>
        c.tags.includes('procedure'),
      );
      expect(packing).toHaveLength(4);
      expect(procedures).toHaveLength(5);
    });

    it('has no campsite-setup checklist (setup is self-evident)', () => {
      for (const checklist of SEED_CHECKLISTS) {
        expect(checklist.name.toLowerCase()).not.toContain('setup');
      }
    });

    it('every ⚙︎ task reference resolves to a seed task', () => {
      const taskNames = new Set(SEED_TASKS.map((t) => t.name));
      for (const checklist of SEED_CHECKLISTS) {
        for (const step of checklist.steps) {
          if (step.task !== undefined) {
            expect(taskNames).toContain(step.task);
          }
        }
      }
    });

    it('a task-linked step never defines its own fields (ADR-0008)', () => {
      for (const checklist of SEED_CHECKLISTS) {
        for (const step of checklist.steps) {
          if (step.task !== undefined) {
            expect(step.fieldSchema).toBeUndefined();
          }
        }
      }
    });

    it('pre-links the doc’s 16 ⚙︎ markers: 12 on Spring opening, 4 on Fall closing', () => {
      const linksOf = (name: string): number => {
        const checklist = SEED_CHECKLISTS.find((c) => c.name === name);
        expect(checklist).toBeDefined();
        return (checklist?.steps ?? []).filter((s) => s.task !== undefined)
          .length;
      };
      expect(linksOf('Spring opening')).toBe(12);
      expect(linksOf('Fall closing / winterization')).toBe(4);
      const total = SEED_CHECKLISTS.flatMap((c) => c.steps).filter(
        (s) => s.task !== undefined,
      ).length;
      expect(total).toBe(16);
    });

    it('puts the usage readings on Departure as ✎ custom fields', () => {
      const departure = SEED_CHECKLISTS.find((c) => c.name === 'Departure');
      const fieldSteps = (departure?.steps ?? []).filter(
        (s) => s.fieldSchema !== undefined,
      );
      expect(fieldSteps.map((s) => s.fieldSchema)).toEqual([
        [
          {
            name: 'Fresh water on board',
            type: 'number',
            required: false,
            unit: '%',
          },
        ],
        [{ name: 'Gray / black tank levels', type: 'text', required: false }],
        [{ name: 'Odometer', type: 'number', required: false, unit: 'mi' }],
      ]);
    });

    it('every plain-step field schema is valid', () => {
      for (const checklist of SEED_CHECKLISTS) {
        for (const step of checklist.steps) {
          if (step.fieldSchema !== undefined) {
            expect(() =>
              FieldSchemaSchema.parse(step.fieldSchema),
            ).not.toThrow();
          }
        }
      }
    });
  });

  it('names the starter rig', () => {
    expect(SEED_RIG_NICKNAME).not.toBe('');
  });
});
