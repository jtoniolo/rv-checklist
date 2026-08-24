import { NotFoundException } from '@nestjs/common';
import { adoptCreated } from './adopt-created.js';

interface Row {
  readonly id: string;
  readonly rigId: string;
}

const mine: Row = { id: 'row-1', rigId: 'my-rig' };
const theirs: Row = { id: 'row-1', rigId: 'their-rig' };
const isMine = (row: Row) => row.rigId === 'my-rig';

/**
 * The client-generated-id conflict rule (ADR-0028, issue #143) in isolation —
 * every create endpoint funnels through here, so this is where the
 * "never hand back a row the caller could not have read" guarantee is pinned.
 */
describe('adoptCreated', () => {
  it('returns a row this call created without consulting the scope check', () => {
    const neverCalled = jest.fn(() => false);

    expect(
      adoptCreated({ created: true, record: mine }, neverCalled, 'gone'),
    ).toBe(mine);
    expect(neverCalled).not.toHaveBeenCalled();
  });

  it('returns an existing row the request would have created — the replay path', () => {
    expect(adoptCreated({ created: false, record: mine }, isMine, 'gone')).toBe(
      mine,
    );
  });

  it('hides a row outside the request scope behind the ordinary not-found', () => {
    expect(() =>
      adoptCreated({ created: false, record: theirs }, isMine, 'Rig not found'),
    ).toThrow(NotFoundException);
  });

  it('leaks nothing of the foreign row — only the read path’s own message', () => {
    try {
      adoptCreated({ created: false, record: theirs }, isMine, 'Rig not found');
      throw new Error('expected a rejection');
    } catch (error) {
      expect((error as NotFoundException).message).toBe('Rig not found');
      expect(JSON.stringify(error)).not.toContain('their-rig');
    }
  });
});
