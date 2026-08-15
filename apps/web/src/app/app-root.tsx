'use client';

import {
  selectIsAuthenticated,
  selectThemeKey,
  useAppSelector,
  useHasHydrated,
} from '@rv-checklist/web-data-access';
import { Page } from '@rv-checklist/web-ui';
import { useEffect, useMemo, type JSX, type ReactNode } from 'react';
import { AppShell } from './app-shell';
import { themeFor } from './themes';

/**
 * The client root (issue #22): the theme surface wrapping the signed-in app
 * shell. Edge middleware guards this route and redirects unauthenticated
 * requests to `/welcome`, so the `isAuthenticated` check here is
 * defense-in-depth, not the primary gate.
 */
export function AppRoot(): JSX.Element {
  const isHydrated = useHasHydrated();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      globalThis.location.replace('/welcome');
    }
  }, [isHydrated, isAuthenticated]);

  if (!isHydrated || !isAuthenticated) {
    return (
      <ThemeSurface themed={false}>
        <Page>
          <p className="text-brand-muted" aria-label="Loading">
            Loading…
          </p>
        </Page>
      </ThemeSurface>
    );
  }

  return (
    <ThemeSurface themed>
      <AppShell />
    </ThemeSurface>
  );
}

/**
 * Applies the picked palette as inline token overrides — every brand /
 * surface / hairline utility inside re-resolves (see `themes.ts`) — and
 * repaints the surface the body would otherwise provide. Until hydration
 * (`themed=false`) it stays on the default tokens so server and first client
 * render agree.
 */
function ThemeSurface({
  themed,
  children,
}: {
  readonly themed: boolean;
  readonly children: ReactNode;
}): JSX.Element {
  const themeKey = useAppSelector(selectThemeKey);
  const vars = useMemo(
    () => (themed ? themeFor(themeKey).vars : {}),
    [themed, themeKey],
  );
  // Radix overlays (dialog, select) portal to document.body — outside this
  // div — so the picked palette is mirrored onto :root for them to inherit
  // (issue #23). Client-only by construction: vars is {} until hydration.
  useEffect(() => {
    for (const [name, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(name, value);
    }
    return (): void => {
      for (const name of Object.keys(vars)) {
        document.documentElement.style.removeProperty(name);
      }
    };
  }, [vars]);
  return (
    <div
      style={vars}
      data-theme-surface
      className="min-h-dvh bg-surface text-ink dark:bg-surface-dark dark:text-ink-inverted"
    >
      {children}
    </div>
  );
}
