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

/** The `WHERE` half of a run statement, as the repository builds it. */
interface RunCriteria {
  id?: string;
  rigId?: string;
  steps?: FindOperator<unknown>;
  editedAt?: FindOperator<unknown>;
}

function buildMockRepo() {
  const update = jest.fn(
    (_criteria: RunCriteria, _values: Partial<RunEntity>) =>
      Promise.resolve({ affected: 1 }),
  );
  const findOneByOrFail = jest.fn(() => Promise.resolve(stored));
  const count = jest.fn((_options: { where: RunCriteria }) =>
    Promise.resolve(0),
  );
  const repo = {
    update,
    findOneByOrFail,
    count,
  } as unknown as Repository<RunEntity>;
  return { repo, update, findOneByOrFail, count };
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
    const sql = criteria.steps?.getSql?.('"RunEntity"."steps"') ?? '';
    expect(sql).toContain('CAST(');
    expect(sql).toContain('AS jsonb');
    expect(criteria.steps?.objectLiteralParameters).toEqual({
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

/**
 * The other half of keeping a run's two editable fields apart (ADR-0030, issue #144).
 * A re-dating must name `started_on` and nothing else: a whole-row write would carry the
 * `steps` its caller read and erase a merge that landed since, and the record clock cannot
 * catch that, because a merge deliberately never moves it.
 */
describe('TypeOrmRunRepository.saveStartedOn', () => {
  let mocks: ReturnType<typeof buildMockRepo>;
  let repository: TypeOrmRunRepository;
  const stamp = new Date('2026-08-02T09:00:00Z');

  beforeEach(() => {
    mocks = buildMockRepo();
    repository = new TypeOrmRunRepository(mocks.repo);
  });

  it('writes started_on and the record clock, never the steps', async () => {
    await repository.saveStartedOn(runId, '2026-08-05', stamp);

    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0]?.[1]).toEqual({
      startedOn: '2026-08-05',
      editedAt: stamp,
    });
    expect(mocks.update.mock.calls[0]?.[1]).not.toHaveProperty('steps');
  });

  it('gates a stamped re-dating on a strictly older record clock', async () => {
    await repository.saveStartedOn(runId, '2026-08-05', stamp);

    const [criteria] = mocks.update.mock.calls[0] ?? [];
    expect(criteria?.id).toBe(runId);
    expect(criteria?.editedAt?.type).toBe('lessThan');
    expect(criteria?.editedAt?.value).toEqual(stamp);
  });

  it('reports a stamp the gate turned away, with the record as it stands', async () => {
    mocks.update.mockResolvedValueOnce({ affected: 0 });

    const result = await repository.saveStartedOn(runId, '2026-08-05', stamp);

    expect(result.applied).toBe(false);
    expect(result.record.startedOn).toBe(stored.startedOn);
  });

  it('applies an un-stamped re-dating unconditionally — the authoritative online edit', async () => {
    await repository.saveStartedOn(runId, '2026-08-05');

    const [criteria, values] = mocks.update.mock.calls[0] ?? [];
    expect(criteria).toEqual({ id: runId });
    expect(values).not.toHaveProperty('steps');
    expect(values?.startedOn).toBe('2026-08-05');
    expect(values?.editedAt).toBeInstanceOf(Date);
  });
});

/**
 * The fourth adoption check (ADR-0030, issue #144), asked in SQL: does any step of any run
 * on this rig already link to the entry a client wants to claim? The link sits inside one
 * element of the steps array with the rest of that element unknown, so the question is
 * jsonb **containment**, not equality — an `=` here would never match anything and would
 * wave every claim through.
 */
describe('TypeOrmRunRepository.anyStepLinksEntry', () => {
  let mocks: ReturnType<typeof buildMockRepo>;
  let repository: TypeOrmRunRepository;
  const entryId = '550e8400-e29b-41d4-a716-446655440088';

  beforeEach(() => {
    mocks = buildMockRepo();
    repository = new TypeOrmRunRepository(mocks.repo);
  });

  it('asks by jsonb containment, scoped to the rig', async () => {
    await repository.anyStepLinksEntry(rigId, entryId);

    const criteria = mocks.count.mock.calls[0]?.[0]?.where;
    expect(criteria?.rigId).toBe(rigId);
    const sql = criteria?.steps?.getSql?.('"RunEntity"."steps"') ?? '';
    expect(sql).toContain('@>');
    expect(sql).toContain('AS jsonb');
    // One-element array carrying the link alone: containment ignores whatever else
    // the stored step holds (its text, state, values).
    expect(criteria?.steps?.objectLiteralParameters).toEqual({
      link: JSON.stringify([{ logEntryId: entryId }]),
    });
  });

  it('is false when nothing holds the entry and true when something does', async () => {
    await expect(repository.anyStepLinksEntry(rigId, entryId)).resolves.toBe(
      false,
    );

    mocks.count.mockResolvedValueOnce(1);
    await expect(repository.anyStepLinksEntry(rigId, entryId)).resolves.toBe(
      true,
    );
  });
});
