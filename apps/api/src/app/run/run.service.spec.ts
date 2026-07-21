import { NotFoundException } from '@nestjs/common';
import type { Checklist, Rig } from '@rv-checklist/domain';
import {
  InMemoryChecklistRepository,
  InMemoryRigRepository,
  InMemoryRunRepository,
} from '@rv-checklist/domain/testing';
import { Clock } from '../auth/clock.js';
import { RunService } from './run.service.js';

const alice = '550e8400-e29b-41d4-a716-446655440001';
const bob = '550e8400-e29b-41d4-a716-446655440002';
const aliceRigId = '550e8400-e29b-41d4-a716-446655440010';
const bobRigId = '550e8400-e29b-41d4-a716-446655440011';
const aliceChecklistId = '550e8400-e29b-41d4-a716-446655440020';
const bobChecklistId = '550e8400-e29b-41d4-a716-446655440021';
const stepA = '550e8400-e29b-41d4-a716-446655440030';
const stepB = '550e8400-e29b-41d4-a716-446655440031';

const aliceRig: Rig = {
  id: aliceRigId,
  ownerId: alice,
  nickname: 'Silver Bullet',
};
const bobRig: Rig = { id: bobRigId, ownerId: bob, nickname: 'Bob’s Rig' };

const aliceChecklist: Checklist = {
  id: aliceChecklistId,
  rigId: aliceRigId,
  name: 'Pre-departure',
  tags: ['procedure'],
  steps: [
    { id: stepA, text: 'Close roof vents' },
    {
      id: stepB,
      text: 'Fresh water level',
      fieldSchema: [
        { name: 'Level', type: 'number', required: true, unit: '%' },
      ],
    },
  ],
};

const bobChecklist: Checklist = {
  id: bobChecklistId,
  rigId: bobRigId,
  name: 'Bob’s list',
  tags: [],
  steps: [{ id: stepA, text: 'Do a thing' }],
};

/** A clock frozen on a fixed occasion, so a server-dated run is deterministic. */
class FrozenClock extends Clock {
  now(): Date {
    return new Date('2026-07-21T12:00:00.000Z');
  }
}

async function makeService(): Promise<{
  service: RunService;
  runs: InMemoryRunRepository;
  checklists: InMemoryChecklistRepository;
}> {
  const runs = new InMemoryRunRepository();
  const checklists = new InMemoryChecklistRepository();
  const rigs = new InMemoryRigRepository();
  await rigs.save(aliceRig);
  await rigs.save(bobRig);
  await checklists.save(aliceChecklist);
  await checklists.save(bobChecklist);
  return {
    service: new RunService(runs, checklists, rigs, new FrozenClock()),
    runs,
    checklists,
  };
}

describe('RunService', () => {
  describe('create — a run is a dated copy of the checklist’s steps', () => {
    it('copies the steps, minting fresh incomplete step ids and dating the run', async () => {
      const { service } = await makeService();

      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      expect(run).toMatchObject({
        checklistId: aliceChecklistId,
        rigId: aliceRigId,
        startedOn: '2026-07-21',
      });
      expect(run.steps).toHaveLength(2);
      expect(run.steps[0]).toMatchObject({
        text: 'Close roof vents',
        state: 'incomplete',
      });
      // The copy carries the plain step's field schema…
      expect(run.steps[1]?.fieldSchema).toEqual([
        { name: 'Level', type: 'number', required: true, unit: '%' },
      ]);
      // …but no captured values yet, and no state is pre-filled.
      expect(run.steps[1]?.values).toBeUndefined();
      // Fresh, distinct step ids — the run's steps are its own (not the template's).
      const ids = run.steps.map((s) => s.id);
      expect(ids).not.toContain(stepA);
      expect(ids).not.toContain(stepB);
      expect(new Set(ids).size).toBe(2);
    });

    it('accepts an explicit occasion date', async () => {
      const { service } = await makeService();

      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
        startedOn: '2026-01-02',
      });

      expect(run.startedOn).toBe('2026-01-02');
    });

    it('is unaffected by a later edit to the checklist', async () => {
      const { service, checklists } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      // Rewrite the checklist entirely after the run started.
      await checklists.save({
        ...aliceChecklist,
        name: 'Rewritten',
        steps: [{ id: stepA, text: 'Something completely different' }],
      });

      const reloaded = await service.get(alice, run.id);
      expect(reloaded.steps).toHaveLength(2);
      expect(reloaded.steps[0]?.text).toBe('Close roof vents');
    });

    it('refuses to run a checklist on a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, { checklistId: bobChecklistId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound for a checklist that does not exist', async () => {
      const { service } = await makeService();

      await expect(
        service.create(alice, { checklistId: aliceRigId }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update — states transition freely and answers are captured', () => {
    it('moves a step incomplete → complete → skipped → incomplete', async () => {
      const { service } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });
      const setState = async (state: 'incomplete' | 'complete' | 'skipped') => {
        const current = await service.get(alice, run.id);
        return service.update(alice, run.id, {
          steps: current.steps.map((s, i) => (i === 0 ? { ...s, state } : s)),
        });
      };

      const completed = await setState('complete');
      expect(completed.steps[0]?.state).toBe('complete');
      const skipped = await setState('skipped');
      expect(skipped.steps[0]?.state).toBe('skipped');
      const reopened = await setState('incomplete');
      expect(reopened.steps[0]?.state).toBe('incomplete');
    });

    it('captures a plain step’s field values onto the run’s copy when completing it', async () => {
      const { service } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      const updated = await service.update(alice, run.id, {
        steps: run.steps.map((s, i) =>
          i === 1
            ? {
                ...s,
                state: 'complete',
                values: [{ name: 'Level', value: 80 }],
              }
            : s,
        ),
      });

      expect(updated.steps[1]).toMatchObject({
        state: 'complete',
        values: [{ name: 'Level', value: 80 }],
      });
      // The captured answer survives a reload — it's persisted on the run.
      const reloaded = await service.get(alice, run.id);
      expect(reloaded.steps[1]?.values).toEqual([{ name: 'Level', value: 80 }]);
    });

    it('can re-date the occasion after the fact', async () => {
      const { service } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      const updated = await service.update(alice, run.id, {
        startedOn: '2026-08-01',
      });

      expect(updated.startedOn).toBe('2026-08-01');
    });

    it('never changes which checklist or rig a run belongs to', async () => {
      const { service } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      const updated = await service.update(alice, run.id, {
        startedOn: '2026-08-01',
      });

      expect(updated.checklistId).toBe(aliceChecklistId);
      expect(updated.rigId).toBe(aliceRigId);
    });
  });

  describe('list — past runs of a checklist', () => {
    it('returns the runs of the owner’s checklist', async () => {
      const { service } = await makeService();
      await service.create(alice, { checklistId: aliceChecklistId });
      await service.create(alice, { checklistId: aliceChecklistId });

      const runs = await service.listByChecklist(alice, aliceChecklistId);

      expect(runs).toHaveLength(2);
    });

    it('refuses to list runs of a checklist the owner does not own', async () => {
      const { service } = await makeService();

      await expect(
        service.listByChecklist(alice, bobChecklistId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list — runs across a rig (the home summary read, issue #22)', () => {
    it('returns every run on the owner’s rig, across its checklists', async () => {
      const { service, checklists } = await makeService();
      const secondChecklist: Checklist = {
        ...aliceChecklist,
        id: '550e8400-e29b-41d4-a716-446655440022',
        name: 'Spring opening',
      };
      await checklists.save(secondChecklist);
      await service.create(alice, { checklistId: aliceChecklistId });
      await service.create(alice, { checklistId: secondChecklist.id });

      const runs = await service.listByRig(alice, aliceRigId);

      expect(runs).toHaveLength(2);
      expect(new Set(runs.map((run) => run.checklistId))).toEqual(
        new Set([aliceChecklistId, secondChecklist.id]),
      );
    });

    it('refuses to list runs of a rig the owner does not own', async () => {
      const { service } = await makeService();

      await expect(service.listByRig(alice, bobRigId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('removes a run started by mistake', async () => {
      const { service } = await makeService();
      const run = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      await service.remove(alice, run.id);

      await expect(service.get(alice, run.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // The row-level ownership guarantee (ADR-0003), proven at the use-case seam.
  // A run is owned via its rig, so isolation follows rig ownership.
  describe('owner isolation', () => {
    it('never lets another owner read, edit, or delete a run', async () => {
      const { service } = await makeService();
      const aliceRun = await service.create(alice, {
        checklistId: aliceChecklistId,
      });

      await expect(service.get(bob, aliceRun.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.update(bob, aliceRun.id, { startedOn: '2026-08-01' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(bob, aliceRun.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      // Alice's run is untouched by Bob's attempts.
      await expect(service.get(alice, aliceRun.id)).resolves.toEqual(aliceRun);
    });
  });
});
