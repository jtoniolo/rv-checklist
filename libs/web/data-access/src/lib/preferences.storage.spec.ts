/**
 * @jest-environment jsdom
 *
 * The lib's default test environment is node (no browser storage); this spec
 * exercises the localStorage round trip, so it runs under jsdom.
 */
import {
  loadPersistedActiveRig,
  loadPersistedTheme,
  persistActiveRig,
  persistTheme,
} from './preferences.storage.js';

const rigId = '550e8400-e29b-41d4-a716-446655440001';

describe('preferences storage', () => {
  afterEach(() => {
    localStorage.clear();
  });

  describe('theme', () => {
    it('reads the default when nothing is persisted', () => {
      expect(loadPersistedTheme()).toEqual({ themeKey: 'algonquin' });
    });

    it('round-trips the picked theme', () => {
      persistTheme({ themeKey: 'campfire' });
      expect(loadPersistedTheme()).toEqual({ themeKey: 'campfire' });
    });

    it('falls back to the default for an unknown persisted value', () => {
      localStorage.setItem('rv.theme', 'hotdog-stand');
      expect(loadPersistedTheme()).toEqual({ themeKey: 'algonquin' });
    });
  });

  describe('active rig', () => {
    it('reads no selection when nothing is persisted', () => {
      expect(loadPersistedActiveRig()).toEqual({ activeRigId: undefined });
    });

    it('round-trips the selected rig', () => {
      persistActiveRig({ activeRigId: rigId });
      expect(loadPersistedActiveRig()).toEqual({ activeRigId: rigId });
    });

    it('clears the persisted rig when the selection is cleared', () => {
      persistActiveRig({ activeRigId: rigId });
      persistActiveRig({ activeRigId: undefined });
      expect(localStorage.getItem('rv.activeRigId')).toBeNull();
    });
  });
});
