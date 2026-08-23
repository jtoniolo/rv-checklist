import { type Repository } from 'typeorm';
import { IdempotencyKeyEntity } from './entities/idempotency-key.entity.js';
import { TypeOrmIdempotencyKeyRepository } from './idempotency-key.repository.js';

const userId = '550e8400-e29b-41d4-a716-446655440001';
const key = '550e8400-e29b-41d4-a716-446655440042';

function buildMockRepo() {
  const findOne = jest.fn();
  const query = jest.fn().mockResolvedValue([[], 0]);

  const repo = {
    findOne,
    query,
  } as unknown as Repository<IdempotencyKeyEntity>;

  return { repo, findOne, query };
}

describe('TypeOrmIdempotencyKeyRepository', () => {
  let store: TypeOrmIdempotencyKeyRepository;
  let findOne: jest.Mock;
  let query: jest.Mock;

  beforeEach(() => {
    const mocks = buildMockRepo();
    findOne = mocks.findOne;
    query = mocks.query;
    store = new TypeOrmIdempotencyKeyRepository(mocks.repo);
  });

  describe('find', () => {
    it('returns undefined on first sight of a key', async () => {
      findOne.mockResolvedValue(undefined);

      expect(await store.find(userId, key)).toBeUndefined();
      expect(findOne).toHaveBeenCalledWith({ where: { userId, key } });
    });

    it('returns the recorded status and body on a hit', async () => {
      findOne.mockResolvedValue({
        status: 201,
        responseBody: { id: 'abc', nights: 3 },
      });

      expect(await store.find(userId, key)).toEqual({
        status: 201,
        body: { id: 'abc', nights: 3 },
      });
    });

    it('maps a SQL NULL body (a recorded 204) to undefined', async () => {
      // eslint-disable-next-line unicorn/no-null -- TypeORM maps SQL NULL to JS null
      findOne.mockResolvedValue({ status: 204, responseBody: null });

      expect(await store.find(userId, key)).toEqual({
        status: 204,
        body: undefined,
      });
    });
  });

  describe('record', () => {
    it('inserts the outcome, ignoring a concurrent duplicate (first write wins)', async () => {
      await store.record({
        userId,
        key,
        method: 'PATCH',
        path: '/api/stops/abc',
        status: 200,
        body: { id: 'abc' },
      });

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('INSERT INTO idempotency_keys');
      expect(sql).toContain('ON CONFLICT (user_id, "key") DO NOTHING');
      expect(params).toEqual([
        userId,
        key,
        'PATCH',
        '/api/stops/abc',
        200,
        JSON.stringify({ id: 'abc' }),
      ]);
    });

    it('stores SQL NULL for a bodiless success', async () => {
      await store.record({
        userId,
        key,
        method: 'DELETE',
        path: '/api/stops/abc',
        status: 204,
        body: undefined,
      });

      const [, params] = query.mock.calls[0] as [string, unknown[]];
      expect(params[5]).toBeNull();
    });
  });

  describe('prune', () => {
    it('runs an age-based DELETE with the given day threshold', async () => {
      query.mockResolvedValue([[], 5]);

      const pruned = await store.prune(60);

      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0] as [string, number[]];
      expect(sql).toContain('DELETE FROM idempotency_keys');
      expect(sql).toContain('created_at <');
      expect(params).toEqual([60]);
      expect(pruned).toBe(5);
    });

    it('returns 0 when nothing is old enough', async () => {
      query.mockResolvedValue([[], 0]);
      expect(await store.prune(60)).toBe(0);
    });
  });
});
