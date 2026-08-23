import type { Rig } from '@rv-checklist/domain';
import { LessThan, QueryFailedError, type Repository } from 'typeorm';
import type { RigEntity } from './entities/rig.entity.js';
import { TypeOrmRigRepository } from './rig.repository.js';

const rigId = '550e8400-e29b-41d4-a716-446655440010';
const alice = '550e8400-e29b-41d4-a716-446655440001';
const rig: Rig = { id: rigId, ownerId: alice, nickname: 'Silver Bullet' };

function duplicateKey(): QueryFailedError {
  const error = new QueryFailedError('INSERT ...', [], new Error('dup'));
  return Object.assign(error, { code: '23505' });
}

function buildMockRepo() {
  const save = jest.fn((entity: unknown) => Promise.resolve(entity));
  const create = jest.fn((entity: unknown) => entity);
  const insert = jest.fn((_row: { editedAt: Date }) => Promise.resolve({}));
  const update = jest.fn(() => Promise.resolve({ affected: 1 }));
  const findOneByOrFail = jest.fn();
  const repo = {
    save,
    create,
    insert,
    update,
    findOneByOrFail,
  } as unknown as Repository<RigEntity>;
  return { repo, save, insert, update, findOneByOrFail };
}

/**
 * The SQL half of the write contract (ADR-0028, issues #141 and #143) — the
 * part the in-memory double stands in for everywhere else and therefore cannot
 * prove. The rig repository is the one the other eight are written against, so
 * the statements it issues are pinned here.
 */
describe('TypeOrmRigRepository writes', () => {
  let mocks: ReturnType<typeof buildMockRepo>;
  let repository: TypeOrmRigRepository;

  beforeEach(() => {
    mocks = buildMockRepo();
    repository = new TypeOrmRigRepository(mocks.repo);
  });

  describe('save', () => {
    it('re-stamps the edit time server now when no stamp is given', async () => {
      const before = Date.now();

      await repository.save(rig);

      const written = mocks.save.mock.calls[0]?.[0] as { editedAt: Date };
      expect(written.editedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('leaves the edit time out of the row write when a stamp is given', async () => {
      await repository.save(rig, new Date('2026-08-01T10:00:00Z'));

      const written = mocks.save.mock.calls[0]?.[0];
      expect(written).not.toHaveProperty('editedAt');
    });

    it('moves the clock forward only — a conditional UPDATE, never an overwrite', async () => {
      const editedAt = new Date('2026-08-01T10:00:00Z');

      await repository.save(rig, editedAt);

      // `LessThan` is what makes this max(stored, editedAt): a stored stamp
      // that is already newer matches nothing, so the row keeps it.
      expect(mocks.update).toHaveBeenCalledWith(
        { id: rigId, editedAt: LessThan(editedAt) },
        { editedAt },
      );
    });

    it('writes the row unconditionally — exemption is from the gate, not the write', async () => {
      await repository.save(rig, new Date('2026-08-01T10:00:00Z'));

      expect(mocks.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('insert', () => {
    it('initialises the edit time from the supplied stamp', async () => {
      const editedAt = new Date('2026-08-01T10:00:00Z');

      const result = await repository.insert(rig, editedAt);

      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({ id: rigId, editedAt }),
      );
      expect(result).toEqual({ created: true, record: rig });
    });

    it('stamps server now when no stamp is given', async () => {
      const before = Date.now();

      await repository.insert(rig);

      const written = mocks.insert.mock.calls[0]?.[0];
      expect(written?.editedAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('reports the stored row on a unique violation, writing nothing', async () => {
      const stored = { ...rig, nickname: 'Renamed since' };
      mocks.insert.mockRejectedValueOnce(duplicateKey());
      mocks.findOneByOrFail.mockResolvedValueOnce(stored);

      const result = await repository.insert(rig);

      expect(result).toEqual({ created: false, record: stored });
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    });

    it('rethrows any other failure rather than reporting a phantom replay', async () => {
      const other = new QueryFailedError('INSERT ...', [], new Error('fk'));
      Object.assign(other, { code: '23503' });
      mocks.insert.mockRejectedValueOnce(other);

      await expect(repository.insert(rig)).rejects.toBe(other);
      expect(mocks.findOneByOrFail).not.toHaveBeenCalled();
    });
  });
});
