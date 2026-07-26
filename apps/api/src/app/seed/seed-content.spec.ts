import {
  FieldSchemaSchema,
  IntervalSchema,
  TagsSchema,
} from '@rv-checklist/domain';
import {
  SEED_CHECKLISTS,
  SEED_RIG_NICKNAME,
  SEED_TASKS,
} from './seed-content.js';

/**
 * The seed data transcribed from `docs/seed-content.md` (issue #19, rewritten
 * from the maintenance research in #34). These tests pin the transcription to
 * the doc's own counts and invariants, so a drift between the doc and the
 * constant is caught here, not in production.
 */
describe('seed content (docs/seed-content.md)', () => {
  describe('maintenance tasks', () => {
    it('defines the 35 research-derived tasks', () => {
      expect(SEED_TASKS).toHaveLength(35);
      for (const task of SEED_TASKS) {
        expect(task.name).not.toBe('');
      }
    });

    it('every task carries a valid per-task interval (#34)', () => {
      for (const task of SEED_TASKS) {
        // Parses as a real Interval (a months and/or km limit, at least one).
        expect(() => IntervalSchema.parse(task.interval)).not.toThrow();
        expect(
          task.interval.months !== undefined || task.interval.km !== undefined,
        ).toBe(true);
      }
    });

    it('the axle jobs carry BOTH a calendar and a distance limit (ADR-0016, #36)', () => {
      // Their real-world spec is "X or Y, whichever comes first": wheel bearings
      // 12 months OR 12,000 mi (→ 20,000 km); brakes annual inspect OR 3,000 mi
      // (→ 5,000 km) adjust. Both limits present so the calendar leg catches the
      // rig that sits and the distance leg catches the rig that travels.
      const byName = new Map(SEED_TASKS.map((t) => [t.name, t.interval]));
      expect(byName.get('Repack / inspect wheel bearings')).toEqual({
        months: 12,
        km: 20_000,
      });
      expect(byName.get('Inspect & adjust brakes')).toEqual({
        months: 12,
        km: 5000,
      });
    });

    it('leaves single-cadence tasks on one limit — the other stays absent (#36)', () => {
      const byName = new Map(SEED_TASKS.map((t) => [t.name, t.interval]));
      // A calendar-only task carries no km leg…
      expect(byName.get('Check tire pressure & tread')).toEqual({ months: 1 });
      expect(byName.get('Inspect suspension & grease wet bolts')).toEqual({
        months: 12,
      });
      // …and only the two axle jobs carry a distance leg at all.
      const withKm = SEED_TASKS.filter((t) => t.interval.km !== undefined).map(
        (t) => t.name,
      );
      expect(withKm).toEqual([
        'Repack / inspect wheel bearings',
        'Inspect & adjust brakes',
      ]);
    });

    it('splits the multi-cadence alarm chore: monthly test vs multi-year replacements', () => {
      const byName = new Map(SEED_TASKS.map((t) => [t.name, t.interval]));
      expect(byName.get('Test smoke / CO / LP alarms')).toEqual({ months: 1 });
      expect(byName.get('Replace smoke alarm')).toEqual({ months: 120 });
      expect(byName.get('Replace CO alarm')).toEqual({ months: 60 });
      expect(byName.get('Replace LP gas detector')).toEqual({ months: 60 });
    });

    it('ships no onboard-generator task (cut in #34)', () => {
      for (const task of SEED_TASKS) {
        expect(task.name.toLowerCase()).not.toContain('generator');
      }
    });

    it('sets no seed last-performed or one-time marker — the owner anchors age-based tasks in-app', () => {
      for (const task of SEED_TASKS) {
        expect(task).not.toHaveProperty('lastPerformed');
        expect(task).not.toHaveProperty('oneTime');
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

    it('every task carries valid tags (issue #41)', () => {
      for (const task of SEED_TASKS) {
        expect(() => TagsSchema.parse(task.tags)).not.toThrow();
        expect(task.tags.length).toBeGreaterThan(0);
      }
    });

    it('carries only metric units — no imperial mi and no odometer field', () => {
      for (const task of SEED_TASKS) {
        for (const field of task.fieldSchema) {
          expect(field.unit).not.toBe('mi');
          expect(field.name.toLowerCase()).not.toBe('odometer');
        }
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
      expect(byName.get('Test smoke / CO / LP alarms')).toBe(
        'Smoke, CO, and propane alarms are life-safety devices that fail silently, so they must be tested regularly. How: 1) Press the test button on each alarm to confirm it sounds; 2) Replace batteries where applicable; 3) Confirm each detector is securely mounted and unobstructed; 4) Note any unit that fails to sound for replacement.',
      );
    });

    it('carries the doc’s measured fields with their metric units', () => {
      const byName = new Map(SEED_TASKS.map((t) => [t.name, t.fieldSchema]));
      expect(byName.get('Check tire pressure & tread')).toEqual([
        { name: 'tread depth', type: 'number', required: false, unit: 'mm' },
        { name: 'set pressure', type: 'number', required: false, unit: 'kPa' },
      ]);
      expect(byName.get('Battery service — charge & terminals')).toEqual([
        { name: 'resting voltage', type: 'number', required: false, unit: 'V' },
      ]);
      expect(byName.get('Winterize water system')).toEqual([
        { name: 'antifreeze used', type: 'number', required: false, unit: 'L' },
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

    it('pre-links the doc’s ⚙︎ markers: 16 on Spring opening, 5 on Fall closing', () => {
      const linksOf = (name: string): number => {
        const checklist = SEED_CHECKLISTS.find((c) => c.name === name);
        expect(checklist).toBeDefined();
        return (checklist?.steps ?? []).filter((s) => s.task !== undefined)
          .length;
      };
      expect(linksOf('Spring opening')).toBe(16);
      expect(linksOf('Fall closing / winterization')).toBe(5);
      const total = SEED_CHECKLISTS.flatMap((c) => c.steps).filter(
        (s) => s.task !== undefined,
      ).length;
      expect(total).toBe(21);
    });

    it('carries the event-driven checks as Departure/Pre-trip steps, not tracked tasks (#34)', () => {
      const taskNames = new Set(SEED_TASKS.map((t) => t.name));
      // None of these live as maintenance tasks.
      expect(taskNames).not.toContain('Re-torque lug nuts');
      const stepText = SEED_CHECKLISTS.flatMap((c) => c.steps).map(
        (s) => s.text,
      );
      const joined = stepText.join('\n').toLowerCase();
      expect(joined).toContain('breakaway');
      expect(joined).toContain('safety chains');
      expect(joined).toContain('re-torque lug nuts');
    });

    it('puts the usage readings on Departure as ✎ custom fields — no odometer', () => {
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
