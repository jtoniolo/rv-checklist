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
import { GoogleOneTap } from './google-one-tap';
import { themeFor } from './themes';

/**
 * The client root (issue #22): the theme surface wrapping either the signed-in
 * app shell or the signed-out welcome. Both the session and the picked theme
 * are restored from localStorage, which the server cannot see, so both are
 * gated on {@link useHasHydrated}: server and first client render agree on a
 * neutral default-themed placeholder, then the real session and palette are
 * revealed. Without the gate the sign-in surface (and Google One Tap) would
 * flash on every reload, re-authenticating an already signed-in owner.
 */
export function AppRoot(): JSX.Element {
  const isHydrated = useHasHydrated();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  if (!isHydrated) {
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
      {isAuthenticated ? <AppShell /> : <Welcome />}
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

/** The signed-out surface: the brand header and the Google sign-in card. */
function Welcome(): JSX.Element {
  return (
    <Page>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-brand lg:text-4xl dark:text-ink-inverted">
          RV Checklist
        </h1>
        <p className="text-base text-brand-muted lg:text-lg">
          Maintenance &amp; packing, one rig at a time.
        </p>
      </header>
      <section
        className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-hairline p-8 text-center text-brand-muted"
        aria-label="Sign in"
      >
        <p>Sign in with Google to continue.</p>
        <GoogleOneTap />
      </section>
    </Page>
  );
}
