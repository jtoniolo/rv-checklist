import {
  DuplicateIdError,
  type StoredStop,
  type Trip,
} from '@rv-checklist/domain';
import { QueryFailedError, type EntityManager, type Repository } from 'typeorm';
import { TripEntity } from './entities/trip.entity.js';
import { TypeOrmTripRepository } from './trip.repository.js';

const rigId = '550e8400-e29b-41d4-a716-446655440010';
const tripId = '550e8400-e29b-41d4-a716-446655440077';
const stopId = '550e8400-e29b-41d4-a716-446655440078';

const trip: Trip = {
  id: tripId,
  rigId,
  name: 'Fall colours loop',
  checklistIds: [],
};
const stop: StoredStop = {
  id: stopId,
  tripId,
  rigId,
  position: 0,
  arrived: false,
};

/** The error Postgres raises when an INSERT hits a primary-key index. */
function duplicateKey(constraint: string): QueryFailedError {
  const error = new QueryFailedError('INSERT ...', [], new Error('dup'));
  return Object.assign(error, { code: '23505', constraint });
}

/**
 * A `Repository<TripEntity>` whose `manager.transaction` really runs the
 * callback against per-entity mock repositories — so the spec drives the
 * transaction body production writes, and can fail exactly the statement
 * Postgres would.
 */
function buildMockRepo() {
  const tripInsert = jest.fn((_row: unknown): Promise<unknown> =>
    Promise.resolve({}),
  );
  const stopInsert = jest.fn((_row: unknown): Promise<unknown> =>
    Promise.resolve({}),
  );
  const findOne = jest.fn((_options: unknown): Promise<unknown> =>
    Promise.resolve(undefined),
  );
  const manager = {
    getRepository: (entity: unknown) =>
      entity === TripEntity ? { insert: tripInsert } : { insert: stopInsert },
    transaction: (run: (m: EntityManager) => Promise<unknown>) =>
      run(manager as unknown as EntityManager),
  };
  const repo = { manager, findOne } as unknown as Repository<TripEntity>;
  return { repo, tripInsert, stopInsert, findOne };
}

/**
 * The SQL half of the trip create-with-stops contract (ADR-0028, issue #143):
 * which unique violation is a replay and which is a client reusing an id. The
 * in-memory double stands in for this everywhere else and so cannot prove it.
 */
describe('TypeOrmTripRepository.createWithStops', () => {
  let mocks: ReturnType<typeof buildMockRepo>;
  let repository: TypeOrmTripRepository;

  beforeEach(() => {
    mocks = buildMockRepo();
    repository = new TypeOrmTripRepository(mocks.repo);
  });

  it('writes the trip and its stops under one stamp', async () => {
    const editedAt = new Date('2026-08-01T10:00:00Z');

    const result = await repository.createWithStops(trip, [stop], editedAt);

    expect(mocks.tripInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: tripId, editedAt }),
    );
    expect(mocks.stopInsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: stopId, editedAt }),
    );
    expect(result).toEqual({ created: true, record: trip });
  });

  it('reports the stored trip when the trip id collided — a replay', async () => {
    mocks.tripInsert.mockRejectedValueOnce(duplicateKey('trips_pkey'));
    mocks.findOne.mockResolvedValueOnce({
      ...trip,
      name: 'Renamed since',
      checklistIds: [],
    });

    const result = await repository.createWithStops(trip, [stop]);

    expect(result).toMatchObject({
      created: false,
      record: { id: tripId, name: 'Renamed since' },
    });
  });

  /**
   * The trip id was free, so the collision was a *stop* id: not a replay, and
   * no retry of it can ever succeed. It reaches the caller as a domain error it
   * can map to a 4xx — the raw QueryFailedError would leave the handler at 500,
   * which the offline upload queue retries without cap (ADR-0028).
   */
  it('rejects a reused stop id as DuplicateIdError, not the driver failure', async () => {
    mocks.stopInsert.mockRejectedValueOnce(duplicateKey('stops_pkey'));

    await expect(
      repository.createWithStops(trip, [stop]),
    ).rejects.toBeInstanceOf(DuplicateIdError);
  });

  it('names no id in the rejection — which row is taken stays undisclosed', async () => {
    mocks.stopInsert.mockRejectedValueOnce(duplicateKey('stops_pkey'));

    let message = '';
    try {
      await repository.createWithStops(trip, [stop]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('already in use');
    expect(message).not.toContain(stopId);
  });

  it('rethrows any other failure rather than calling it a duplicate id', async () => {
    const other = new QueryFailedError('INSERT ...', [], new Error('fk'));
    Object.assign(other, { code: '23503' });
    mocks.stopInsert.mockRejectedValueOnce(other);

    await expect(repository.createWithStops(trip, [stop])).rejects.toBe(other);
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
});
