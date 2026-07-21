/**
 * @jest-environment jsdom
 *
 * The store's persistence loop for the client-local preferences (ADR-0011):
 * hydrate theme + active rig from localStorage on boot, mirror every change
 * back. Runs under jsdom for a real localStorage (the lib's default is node).
 */
import { activeRigCleared, activeRigSelected } from './active-rig.slice.js';
import { makeStore } from './store.js';
import { themeSelected } from './theme.slice.js';

const rigId = '550e8400-e29b-41d4-a716-446655440001';

describe('store preference persistence', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('hydrates the persisted theme and active rig on boot', () => {
    localStorage.setItem('rv.theme', 'parksign');
    localStorage.setItem('rv.activeRigId', rigId);

    const store = makeStore();

    expect(store.getState().theme.themeKey).toBe('parksign');
    expect(store.getState().activeRig.activeRigId).toBe(rigId);
  });

  it('mirrors a theme pick and a rig switch back to localStorage', () => {
    const store = makeStore();

    store.dispatch(themeSelected('forest'));
    store.dispatch(activeRigSelected(rigId));

    expect(localStorage.getItem('rv.theme')).toBe('forest');
    expect(localStorage.getItem('rv.activeRigId')).toBe(rigId);
  });

  it('clears the persisted rig when the selection is cleared', () => {
    const store = makeStore();
    store.dispatch(activeRigSelected(rigId));

    store.dispatch(activeRigCleared());

    expect(localStorage.getItem('rv.activeRigId')).toBeNull();
  });
});
