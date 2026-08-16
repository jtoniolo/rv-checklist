/**
 * @jest-environment jsdom
 *
 * The store's persistence loop for the client-local preferences (ADR-0011):
 * hydrate the theme from localStorage on boot, mirror every change back.
 * (Active-rig persistence was deleted with the client-state navigation, #60.)
 * Runs under jsdom for a real localStorage (the lib's default is node).
 */
import { makeStore } from './store.js';
import { themeSelected } from './theme.slice.js';

describe('store preference persistence', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('hydrates the persisted theme on boot', () => {
    localStorage.setItem('rv.theme', 'parksign');

    const store = makeStore();

    expect(store.getState().theme.themeKey).toBe('parksign');
  });

  it('mirrors a theme pick back to localStorage', () => {
    const store = makeStore();

    store.dispatch(themeSelected('forest'));

    expect(localStorage.getItem('rv.theme')).toBe('forest');
  });
});
