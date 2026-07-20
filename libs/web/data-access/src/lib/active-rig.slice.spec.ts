import {
  activeRigCleared,
  activeRigReducer,
  activeRigSelected,
  selectActiveRigId,
  type ActiveRigState,
} from './active-rig.slice.js';

const rigA = '550e8400-e29b-41d4-a716-446655440001';
const rigB = '550e8400-e29b-41d4-a716-446655440002';

describe('activeRig slice', () => {
  it('starts with no rig selected', () => {
    const state = activeRigReducer(undefined, { type: '@@init' });
    expect(state).toEqual<ActiveRigState>({ activeRigId: undefined });
  });

  it('selects a rig', () => {
    const state = activeRigReducer(undefined, activeRigSelected(rigA));
    expect(state.activeRigId).toBe(rigA);
  });

  it('switches the active rig', () => {
    const first = activeRigReducer(undefined, activeRigSelected(rigA));
    const second = activeRigReducer(first, activeRigSelected(rigB));
    expect(second.activeRigId).toBe(rigB);
  });

  it('clears the selection', () => {
    const selected = activeRigReducer(undefined, activeRigSelected(rigA));
    const cleared = activeRigReducer(selected, activeRigCleared());
    expect(cleared.activeRigId).toBeUndefined();
  });

  it('selects the active rig id from the store', () => {
    expect(selectActiveRigId({ activeRig: { activeRigId: rigA } })).toBe(rigA);
  });
});
