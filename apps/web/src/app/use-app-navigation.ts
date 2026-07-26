import type { Id } from '@rv-checklist/domain';
import { useCallback, useEffect, useState } from 'react';

/**
 * The four top-level screens the app shell can show. Matches the tab bar /
 * desktop nav items in {@link AppShell}.
 */
export type Route = 'home' | 'checklists' | 'maintenance' | 'rig';

const VALID_ROUTES: ReadonlySet<string> = new Set<Route>([
  'home',
  'checklists',
  'maintenance',
  'rig',
]);

/**
 * A snapshot of in-app navigation state: the current screen plus any open
 * drill-in (checklist, run, maintenance task). Serialised to/from URL search
 * params and stored as browser history state so Back reverses the last
 * navigation and reload/deep-link restores the position.
 */
export interface AppLocation {
  readonly route: Route;
  readonly openChecklistId?: Id;
  readonly openRunId?: Id;
  readonly openTaskId?: Id;
}

// ── Serialisation ────────────────────────────────────────────────────────────

/** Encode a location as URL search params. Home with nothing open → empty. */
export function locationToParams(loc: AppLocation): URLSearchParams {
  const params = new URLSearchParams();
  if (loc.route !== 'home') params.set('screen', loc.route);
  if (loc.openChecklistId) params.set('checklist', loc.openChecklistId);
  if (loc.openRunId) params.set('run', loc.openRunId);
  if (loc.openTaskId) params.set('task', loc.openTaskId);
  return params;
}

/** Decode URL search params into a location. Unknown/missing screen → home. */
export function paramsToLocation(params: URLSearchParams): AppLocation {
  const raw = params.get('screen');
  const route: Route =
    raw !== null && VALID_ROUTES.has(raw) ? (raw as Route) : 'home';

  const checklist = params.get('checklist');
  const run = params.get('run');
  const task = params.get('task');

  return {
    route,
    ...(checklist !== null && { openChecklistId: checklist }),
    ...(run !== null && { openRunId: run }),
    ...(task !== null && { openTaskId: task }),
  };
}

// ── URL helpers ──────────────────────────────────────────────────────────────

/** Build a same-origin URL string from a location. */
function locationUrl(loc: AppLocation): string {
  const params = locationToParams(loc);
  const qs = params.toString();
  return qs
    ? `${globalThis.location.pathname}?${qs}`
    : globalThis.location.pathname;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface AppNavigation {
  /** The current in-app location. */
  readonly location: AppLocation;
  /**
   * Navigate to a new location. Pushes a browser history entry by default;
   * pass `{ replace: true }` to replace the current entry instead (e.g. when
   * a rig switch invalidates the current drill-in).
   */
  readonly navigate: (
    next: AppLocation,
    opts?: { readonly replace?: boolean },
  ) => void;
  /** Go back one history entry — the programmatic equivalent of browser Back. */
  readonly back: () => void;
}

/**
 * Owns the app's navigation state and keeps it in sync with browser history.
 *
 * Forward navigation ({@link navigate}) pushes (or replaces) a history entry
 * whose state and URL encode the new location. The browser Back button fires
 * `popstate`, which updates React state from the history entry's payload.
 * On mount the URL is parsed to support deep-links and reloads.
 *
 * Pattern reference: the `pushState` / `popstate` approach validated in the
 * maintenance-list prototype (`apps/web/src/app/maintenance-prototype/`).
 */
export function useAppNavigation(): AppNavigation {
  const [location, setLocation] = useState<AppLocation>(() =>
    paramsToLocation(new URLSearchParams(globalThis.location.search)),
  );

  // Seed the initial history entry with the parsed location so the first
  // browser-Back fires a popstate with a usable state payload.
  useEffect(() => {
    const initial = paramsToLocation(
      new URLSearchParams(globalThis.location.search),
    );
    globalThis.history.replaceState(initial, '', globalThis.location.href);
  }, []);

  // Sync React state whenever the browser navigates (Back / Forward buttons).
  useEffect(() => {
    const onPop = (e: PopStateEvent): void => {
      const state = e.state as AppLocation | null;
      setLocation(state ?? { route: 'home' });
    };
    globalThis.addEventListener('popstate', onPop);
    return () => {
      globalThis.removeEventListener('popstate', onPop);
    };
  }, []);

  const navigate = useCallback(
    (next: AppLocation, opts?: { readonly replace?: boolean }): void => {
      setLocation(next);
      const url = locationUrl(next);
      if (opts?.replace) {
        globalThis.history.replaceState(next, '', url);
      } else {
        globalThis.history.pushState(next, '', url);
      }
    },
    [],
  );

  const back = useCallback((): void => {
    globalThis.history.back();
  }, []);

  return { location, navigate, back };
}
