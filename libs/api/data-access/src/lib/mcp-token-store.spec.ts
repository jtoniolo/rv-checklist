import { IsNull, type Repository } from 'typeorm';
import { McpTokenEntity } from './entities/mcp-token.entity.js';
import { TypeOrmMcpTokenStore } from './typeorm-stores.js';

const userId = '550e8400-e29b-41d4-a716-446655440001';
const tokenHash = 'abc123hash';
const tokenId = '550e8400-e29b-41d4-a716-446655440099';
const now = new Date('2026-01-15T12:00:00Z');

function fakeEntity(overrides: Partial<McpTokenEntity> = {}): McpTokenEntity {
  return {
    id: tokenId,
    userId,
    tokenHash,
    /* eslint-disable unicorn/no-null -- TypeORM maps SQL NULL to JS null */
    revokedAt: null as unknown as Date | undefined,
    lastUsedAt: null as unknown as Date | undefined,
    /* eslint-enable unicorn/no-null */
    createdAt: now,
    ...overrides,
  };
}

function buildMockRepo() {
  const txUpdate = jest.fn().mockResolvedValue({ affected: 1 });
  const txSave = jest
    .fn()
    .mockImplementation((e: McpTokenEntity) => Promise.resolve(e));
  const txCreate = jest
    .fn()
    .mockImplementation((data: Partial<McpTokenEntity>) => fakeEntity(data));

  const manager = {
    getRepository: jest.fn().mockReturnValue({
      update: txUpdate,
      save: txSave,
      create: txCreate,
    }),
  };

  const findOne = jest.fn();
  const update = jest.fn().mockResolvedValue({ affected: 1 });
  const transaction = jest
    .fn()
    .mockImplementation((cb: (m: typeof manager) => Promise<unknown>) =>
      cb(manager),
    );

  const repo = {
    findOne,
    update,
    manager: { transaction },
  } as unknown as Repository<McpTokenEntity>;

  return { repo, findOne, update, transaction, txUpdate, txSave, txCreate };
}

describe('TypeOrmMcpTokenStore', () => {
  let store: TypeOrmMcpTokenStore;
  let findOne: jest.Mock;
  let update: jest.Mock;
  let transaction: jest.Mock;
  let txUpdate: jest.Mock;
  let txSave: jest.Mock;

  beforeEach(() => {
    const mocks = buildMockRepo();
    findOne = mocks.findOne;
    update = mocks.update;
    transaction = mocks.transaction;
    txUpdate = mocks.txUpdate;
    txSave = mocks.txSave;
    store = new TypeOrmMcpTokenStore(mocks.repo);
  });

  describe('findActiveByHash', () => {
    it('maps SQL NULL to undefined for nullable fields', async () => {
      findOne.mockResolvedValue(fakeEntity());

      const result = await store.findActiveByHash(tokenHash);

      expect(result).toEqual(
        expect.objectContaining({
          revokedAt: undefined,
          lastUsedAt: undefined,
        }),
      );
    });

    it('preserves populated dates', async () => {
      const usedAt = new Date('2026-01-10');
      findOne.mockResolvedValue(fakeEntity({ lastUsedAt: usedAt }));

      const result = await store.findActiveByHash(tokenHash);

      expect(result).toEqual(expect.objectContaining({ lastUsedAt: usedAt }));
    });

    it('returns undefined when no active token exists', async () => {
      // eslint-disable-next-line unicorn/no-null -- TypeORM findOne returns null
      findOne.mockResolvedValue(null);

      expect(await store.findActiveByHash('nope')).toBeUndefined();
    });

    it('queries only active tokens', async () => {
      // eslint-disable-next-line unicorn/no-null -- TypeORM findOne returns null
      findOne.mockResolvedValue(null);

      await store.findActiveByHash(tokenHash);

      expect(findOne).toHaveBeenCalledWith({
        where: { tokenHash, revokedAt: IsNull() },
      });
    });
  });

  describe('findActiveByUser', () => {
    it('queries only active tokens for the user', async () => {
      findOne.mockResolvedValue(fakeEntity());

      const result = await store.findActiveByUser(userId);

      expect(findOne).toHaveBeenCalledWith({
        where: { userId, revokedAt: IsNull() },
      });
      expect(result).toEqual(expect.objectContaining({ id: tokenId }));
    });
  });

  describe('replaceForUser', () => {
    it('runs inside a transaction', async () => {
      await store.replaceForUser(userId, tokenHash);

      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it('revokes existing active tokens before creating the new one', async () => {
      const callOrder: string[] = [];
      txUpdate.mockImplementation(() => {
        callOrder.push('revoke');
        return Promise.resolve({ affected: 1 });
      });
      txSave.mockImplementation((e: McpTokenEntity) => {
        callOrder.push('create');
        return Promise.resolve(e);
      });

      await store.replaceForUser(userId, tokenHash);

      expect(callOrder).toEqual(['revoke', 'create']);
    });

    it('returns the newly created token record', async () => {
      const result = await store.replaceForUser(userId, 'new-hash');

      expect(result.userId).toBe(userId);
      expect(result.tokenHash).toBe('new-hash');
    });
  });

  describe('revokeForUser', () => {
    it('revokes only active tokens for the user', async () => {
      await store.revokeForUser(userId);

      expect(update).toHaveBeenCalledWith(
        { userId, revokedAt: IsNull() },
        expect.objectContaining({
          revokedAt: expect.any(Date) as Date,
        }),
      );
    });
  });

  describe('updateLastUsed', () => {
    it('sets lastUsedAt on the token', async () => {
      await store.updateLastUsed(tokenId);

      expect(update).toHaveBeenCalledWith(
        tokenId,
        expect.objectContaining({
          lastUsedAt: expect.any(Date) as Date,
        }),
      );
    });
  });
});
