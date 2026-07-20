import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Id } from '@rv-checklist/domain';

/**
 * The active rig (ADR-0011: client-local state — which rig is selected exists
 * nowhere on the server). Everything the owner does is scoped to one rig at a
 * time (ADR-0006); this slice holds that selection so later slices (checklists,
 * tasks) can read it. It is deliberately just an id — the rig itself is server
 * state owned by RTK Query.
 */
export interface ActiveRigState {
  activeRigId: Id | undefined;
}

/** Any store whose state contains the active-rig slice. */
export interface ActiveRigRoot {
  activeRig: ActiveRigState;
}

const initialState: ActiveRigState = { activeRigId: undefined };

const activeRigSlice = createSlice({
  name: 'activeRig',
  initialState,
  reducers: {
    /** Switch the active rig. */
    activeRigSelected(state, action: PayloadAction<Id>) {
      state.activeRigId = action.payload;
    },
    /** No rig is active (e.g. the selected rig was deleted, or none exist yet). */
    activeRigCleared(state) {
      state.activeRigId = undefined;
    },
  },
});

export const activeRigReducer = activeRigSlice.reducer;
export const { activeRigSelected, activeRigCleared } = activeRigSlice.actions;

export const selectActiveRigId = (state: ActiveRigRoot): Id | undefined =>
  state.activeRig.activeRigId;
