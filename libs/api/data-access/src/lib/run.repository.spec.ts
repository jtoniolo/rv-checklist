import type { Run, RunStep } from '@rv-checklist/domain';
import { FindOperator, type Repository } from 'typeorm';
import type { RunEntity } from './entities/run.entity.js';
import { TypeOrmRunRepository } from './run.repository.js';

const runId = '550e8400-e29b-41d4-a716-446655440040';
const checklistId = '550e8400-e29b-41d4-a716-446655440020';
const rigId = '550e8400-e29b-41d4-a716-446655440010';

const stepA: RunStep = {
  id: '550e8400-e29b-41d4-a716-446655440041',
  text: 'Close roof vents',
  state: 'incomplete',
  editedAt: '2026-08-01T10:00:00.000Z',
};
const stepB: RunStep = {
  id: '550e8400-e29b-41d4-a716-446655440042',
  text: 'Hitch the sway bars',
  state: 'complete',
  editedAt: '2026-08-01T11:00:00.000Z',
};

/** A persisted run row, with its timestamps — the shape `findOneByOrFail` hands back. */
const row = (over: Partial<RunEntity> = {}): RunEntity => ({
  id: runId,
  checklistId,
  rigId,
  // eslint-disable-next-line unicorn/no-null
  tripId: null,
  startedOn: '2026-08-01',
  steps: [stepA, stepB],
  editedAt: new Date('2026-08-01T09:00:00Z'),
  createdAt: new Date('2026-08-01T09:00:00Z'),
  updatedAt: new Date('2026-08-01T09:00:00Z'),
  ...over,
});

const stored = row();

/** The `WHERE` half of the compare-and-set, as the repository builds it. */
interface StepsCriteria {
  id: string;
  steps: FindOperator<unknown>;
}

function buildMockRepo() {
  const update = jest.fn(
    (_criteria: StepsCriteria, _values: Partial<RunEntity>) =>
      Promise.resolve({ affected: 1 }),
  );
  const findOneByOrFail = jest.fn(() => Promise.resolve(stored));
  const repo = { update, findOneByOrFail } as unknown as Repository<RunEntity>;
  return { repo, update, findOneByOrFail };
}

/**
 * The SQL half of the per-step merge (ADR-0030, issue #144) — the part the in-memory
 * double stands in for everywhere else and therefore cannot prove. What matters here is
 * that the merge lands as **one conditional UPDATE** guarded on the steps it merged from,
 * and that it never touches `edited_at`: a per-step merge that moved the record clock
 * would silently veto the `startedOn` edits that clock exists to gate.
 */
describe('TypeOrmRunRepository.saveStepsIfUnchanged', () => {
  let mocks: ReturnType<typeof buildMockRepo>;
  let repository: TypeOrmRunRepository;

  const merged: RunStep[] = [
    { ...stepA, state: 'complete', editedAt: '2026-08-01T12:00:00.000Z' },
    stepB,
  ];

  beforeEach(() => {
    mocks = buildMockRepo();
    repository = new TypeOrmRunRepository(mocks.repo);
  });

  it('writes the merged steps and nothing else', async () => {
    await repository.saveStepsIfUnchanged(runId, merged, stored.steps);

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0]?.[1]).toEqual({ steps: merged });
  });

  it('leaves the record’s LWW edit time alone', async () => {
    await repository.saveStepsIfUnchanged(runId, merged, stored.steps);

    expect(mocks.update.mock.calls[0]?.[1]).not.toHaveProperty('editedAt');
    expect(mocks.update.mock.calls[0]?.[0]).not.toHaveProperty('editedAt');
  });

  it('guards the write on the steps it merged from, compared as jsonb', async () => {
    await repository.saveStepsIfUnchanged(runId, merged, stored.steps);

    const [criteria] = mocks.update.mock.calls[0] ?? [];
    if (criteria === undefined) {
      throw new Error('the repository issued no UPDATE');
    }
    expect(criteria.id).toBe(runId);
    // A raw jsonb comparison, not a text one: `= CAST(... AS jsonb)` is what makes
    // the guard immune to key ordering and whitespace on the round trip.
    const sql = criteria.steps.getSql?.('"RunEntity"."steps"') ?? '';
    expect(sql).toContain('CAST(');
    expect(sql).toContain('AS jsonb');
    expect(criteria.steps.objectLiteralParameters).toEqual({
      expectedSteps: JSON.stringify(stored.steps),
    });
  });

  it('reports the array that actually landed when the guard matches nothing', async () => {
    mocks.update.mockResolvedValueOnce({ affected: 0 });

    const result = await repository.saveStepsIfUnchanged(
      runId,
      merged,
      stored.steps,
    );

    // The caller re-merges against this rather than overwriting it — losing the
    // race must cost the loser its round, never the winner its work.
    expect(result.applied).toBe(false);
    expect(result.record.steps).toEqual(stored.steps);
  });

  it('narrows the stored row to the wire model on a write that landed', async () => {
    const after: Run = {
      id: runId,
      checklistId,
      rigId,
      tripId: undefined,
      startedOn: '2026-08-01',
      steps: merged,
    };
    mocks.findOneByOrFail.mockResolvedValueOnce(row({ steps: merged }));

    const result = await repository.saveStepsIfUnchanged(
      runId,
      merged,
      stored.steps,
    );

    expect(result).toEqual({ applied: true, record: after });
  });
});
