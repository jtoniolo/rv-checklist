import {
  selectThemeKey,
  themeReducer,
  themeSelected,
  type ThemeState,
} from './theme.slice.js';

describe('theme slice', () => {
  it('starts on the default theme', () => {
    const state = themeReducer(undefined, { type: '@@init' });
    expect(state).toEqual<ThemeState>({ themeKey: 'algonquin' });
  });

  it('switches the theme', () => {
    const state = themeReducer(undefined, themeSelected('campfire'));
    expect(state.themeKey).toBe('campfire');
  });

  it('selects the theme key from the store', () => {
    expect(selectThemeKey({ theme: { themeKey: 'navy' } })).toBe('navy');
  });
});
