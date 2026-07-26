import { act, renderHook } from '@testing-library/react';
import {
  locationToParams,
  paramsToLocation,
  useAppNavigation,
  type AppLocation,
} from './use-app-navigation';

// ── Serialisation unit tests ─────────────────────────────────────────────────

describe('paramsToLocation', () => {
  it('returns home with no params', () => {
    expect(paramsToLocation(new URLSearchParams())).toEqual({ route: 'home' });
  });

  it('parses a valid screen', () => {
    expect(paramsToLocation(new URLSearchParams('screen=maintenance'))).toEqual(
      {
        route: 'maintenance',
      },
    );
  });

  it('defaults to home for an unknown screen', () => {
    expect(paramsToLocation(new URLSearchParams('screen=bogus'))).toEqual({
      route: 'home',
    });
  });

  it('parses checklist and run ids', () => {
    const params = new URLSearchParams(
      'screen=checklists&checklist=cl-1&run=run-2',
    );
    expect(paramsToLocation(params)).toEqual({
      route: 'checklists',
      openChecklistId: 'cl-1',
      openRunId: 'run-2',
    });
  });

  it('parses a maintenance task id', () => {
    const params = new URLSearchParams('screen=maintenance&task=t-3');
    expect(paramsToLocation(params)).toEqual({
      route: 'maintenance',
      openTaskId: 't-3',
    });
  });
});

describe('locationToParams', () => {
  it('returns empty params for home', () => {
    expect(locationToParams({ route: 'home' }).toString()).toBe('');
  });

  it('encodes a non-home screen', () => {
    expect(locationToParams({ route: 'rig' }).toString()).toBe('screen=rig');
  });

  it('encodes checklist + run', () => {
    const params = locationToParams({
      route: 'checklists',
      openChecklistId: 'cl-1',
      openRunId: 'run-2',
    });
    expect(params.get('screen')).toBe('checklists');
    expect(params.get('checklist')).toBe('cl-1');
    expect(params.get('run')).toBe('run-2');
  });

  it('encodes a maintenance task', () => {
    const params = locationToParams({
      route: 'maintenance',
      openTaskId: 't-3',
    });
    expect(params.get('screen')).toBe('maintenance');
    expect(params.get('task')).toBe('t-3');
  });
});

// ── Hook integration tests ───────────────────────────────────────────────────

/** Helper: the state argument from the last call to the given spy. */
function lastStateOf(
  spy: jest.SpyInstance,
): Record<string, unknown> | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return spy.mock.calls.at(-1)?.[0];
}

/** Helper: the URL argument from the first pushState call. */
function firstPushedUrl(spy: jest.SpyInstance): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  return spy.mock.calls[0]?.[2];
}

describe('useAppNavigation', () => {
  let pushStateSpy: jest.SpyInstance;
  let replaceStateSpy: jest.SpyInstance;

  beforeEach(() => {
    // Start with a clean URL for every test.
    // eslint-disable-next-line unicorn/no-null
    globalThis.history.replaceState(null, '', '/');
    pushStateSpy = jest.spyOn(globalThis.history, 'pushState');
    replaceStateSpy = jest.spyOn(globalThis.history, 'replaceState');
  });

  afterEach(() => {
    pushStateSpy.mockRestore();
    replaceStateSpy.mockRestore();
    // eslint-disable-next-line unicorn/no-null
    globalThis.history.replaceState(null, '', '/');
  });

  it('initialises from the current URL', () => {
    // eslint-disable-next-line unicorn/no-null
    globalThis.history.replaceState(null, '', '/?screen=maintenance&task=t-1');

    const { result } = renderHook(() => useAppNavigation());

    expect(result.current.location).toEqual({
      route: 'maintenance',
      openTaskId: 't-1',
    });
  });

  it('defaults to home when the URL has no params', () => {
    const { result } = renderHook(() => useAppNavigation());

    expect(result.current.location).toEqual({ route: 'home' });
  });

  it('seeds the initial history entry with the parsed location', () => {
    // eslint-disable-next-line unicorn/no-null
    globalThis.history.replaceState(null, '', '/?screen=rig');

    renderHook(() => useAppNavigation());

    // The replaceState call from the hook (the last one) should carry the
    // parsed location as its state.
    expect(lastStateOf(replaceStateSpy)).toEqual({ route: 'rig' });
  });

  it('pushes a history entry on navigate', () => {
    const { result } = renderHook(() => useAppNavigation());

    act(() => {
      result.current.navigate({ route: 'maintenance' });
    });

    expect(result.current.location).toEqual({ route: 'maintenance' });
    expect(pushStateSpy).toHaveBeenCalledWith(
      { route: 'maintenance' },
      '',
      '/?screen=maintenance',
    );
  });

  it('replaces the current entry on navigate with replace: true', () => {
    const { result } = renderHook(() => useAppNavigation());

    act(() => {
      result.current.navigate({ route: 'rig' }, { replace: true });
    });

    expect(result.current.location).toEqual({ route: 'rig' });
    // The last replaceState should be the navigate call (after the initial seed).
    expect(lastStateOf(replaceStateSpy)).toEqual({ route: 'rig' });
  });

  it('updates state when popstate fires (browser Back)', () => {
    const { result } = renderHook(() => useAppNavigation());

    // Navigate forward so there is something to go back to.
    act(() => {
      result.current.navigate({ route: 'maintenance', openTaskId: 'task-1' });
    });
    expect(result.current.location.route).toBe('maintenance');

    // Simulate browser Back: popstate with the home entry's state.
    act(() => {
      const event = new PopStateEvent('popstate', { state: { route: 'home' } });
      globalThis.dispatchEvent(event);
    });

    expect(result.current.location).toEqual({ route: 'home' });
  });

  it('falls back to home when popstate has no state', () => {
    const { result } = renderHook(() => useAppNavigation());

    act(() => {
      result.current.navigate({ route: 'rig' });
    });

    act(() => {
      // eslint-disable-next-line unicorn/no-null
      const event = new PopStateEvent('popstate', { state: null });
      globalThis.dispatchEvent(event);
    });

    expect(result.current.location).toEqual({ route: 'home' });
  });

  it('sets the URL to the pathname only for the home route', () => {
    const { result } = renderHook(() => useAppNavigation());

    act(() => {
      result.current.navigate({ route: 'home' });
    });

    const url = firstPushedUrl(pushStateSpy);
    expect(url).toBe('/');
    expect(url).not.toContain('?');
  });

  it('encodes drill-in ids in the URL', () => {
    const { result } = renderHook(() => useAppNavigation());
    const loc: AppLocation = {
      route: 'checklists',
      openChecklistId: 'cl-1',
      openRunId: 'run-2',
    };

    act(() => {
      result.current.navigate(loc);
    });

    const url = firstPushedUrl(pushStateSpy);
    expect(url).toContain('screen=checklists');
    expect(url).toContain('checklist=cl-1');
    expect(url).toContain('run=run-2');
  });

  it('cleans up the popstate listener on unmount', () => {
    const spy = jest.spyOn(globalThis, 'removeEventListener');
    const { unmount } = renderHook(() => useAppNavigation());

    unmount();

    expect(spy).toHaveBeenCalledWith('popstate', expect.any(Function));
    spy.mockRestore();
  });
});
