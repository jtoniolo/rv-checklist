'use client';

import type { Owner } from '@rv-checklist/domain';
import {
  selectRefreshToken,
  selectThemeKey,
  themeSelected,
  useAppDispatch,
  useAppSelector,
  useLogoutMutation,
} from '@rv-checklist/web-data-access';
import { useState, type JSX } from 'react';
import { disableGoogleAutoSelect } from './google-one-tap';
import { themeFor, THEMES } from './themes';

/**
 * The initials shown in the avatar circle: first + last name initials, or the
 * first two characters of the email when there is no usable name.
 */
function initialsOf(owner: Owner): string {
  const parts = (owner.name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0];
  const last = parts.length > 1 ? parts.at(-1)?.[0] : undefined;
  if (first) {
    return (first + (last ?? '')).toUpperCase();
  }
  return owner.email.slice(0, 2).toUpperCase();
}

/**
 * The avatar control (issue #22) — replaces the "signed in as…" block: an
 * initials circle opening a small menu with the account, the theme picker
 * (themes are a user preference, ADR-0011, persisted like the active rig), and
 * sign-out. The picker's selected swatch reads as fill / surface gap / ink
 * ring — a brand-coloured ring would vanish on its own swatch.
 */
export function AvatarMenu({ owner }: { readonly owner: Owner }): JSX.Element {
  const [open, setOpen] = useState(false);
  const dispatch = useAppDispatch();
  const themeKey = useAppSelector(selectThemeKey);
  const refreshToken = useAppSelector(selectRefreshToken);
  const [logout] = useLogoutMutation();

  const signOut = (): void => {
    disableGoogleAutoSelect();
    if (refreshToken) {
      void logout(refreshToken);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
      >
        {initialsOf(owner)}
      </button>
      {open ? (
        <>
          {/* Click-away backdrop. */}
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => {
              setOpen(false);
            }}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-hairline bg-surface p-3 shadow-lg dark:bg-surface-dark">
            {owner.name ? (
              <p className="truncate text-sm font-semibold text-brand dark:text-ink-inverted">
                {owner.name}
              </p>
            ) : undefined}
            <p className="truncate text-xs text-brand-muted">{owner.email}</p>
            <div className="mt-3 border-t border-hairline pt-3">
              <p className="text-xs font-semibold tracking-wide text-brand-muted uppercase">
                Theme
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                {THEMES.map((theme) => (
                  <button
                    key={theme.key}
                    type="button"
                    title={theme.name}
                    aria-label={`Theme: ${theme.name}`}
                    aria-pressed={theme.key === themeKey}
                    onClick={() => {
                      dispatch(themeSelected(theme.key));
                    }}
                    className={`size-5 rounded-full border-2 transition-transform ${
                      theme.key === themeKey
                        ? 'scale-110 border-surface ring-2 ring-ink dark:border-surface-dark dark:ring-ink-inverted'
                        : 'border-transparent hover:scale-110'
                    }`}
                    style={{ background: theme.swatch }}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-brand-muted">
                {themeFor(themeKey).name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                signOut();
              }}
              className="mt-3 w-full rounded-md border border-hairline px-3 py-1.5 text-left text-sm font-medium text-brand hover:border-brand dark:text-ink-inverted"
            >
              Sign out
            </button>
          </div>
        </>
      ) : undefined}
    </div>
  );
}
