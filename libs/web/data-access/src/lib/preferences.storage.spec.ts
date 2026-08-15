/**
 * @jest-environment jsdom
 *
 * The lib's default test environment is node (no browser storage); this spec
 * exercises the localStorage round trip, so it runs under jsdom.
 */
import { loadPersistedTheme, persistTheme } from './preferences.storage.js';

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
});
