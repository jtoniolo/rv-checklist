'use client';

import { useSyncAuthStatus } from '@rv-checklist/web-data-access';
import type { JSX } from 'react';
import { GoogleOneTap } from './google-one-tap';

/**
 * The app-wide "sign in to sync" banner (issue #149; ADR-0028). Background
 * sync has no page navigation in its path, so it owns its own token refresh;
 * when that fails, this is where the app says so and offers the fix.
 *
 * The offline shell keeps rendering local data throughout — no session check
 * offline, no forced sign-out (ADR-0028) — so this renders nothing while sync
 * is authenticated and never blocks the rest of the page either way.
 *
 * Two distinct reasons render two distinct messages, because they need two
 * distinct fixes:
 *
 * - **`signed-out`**: no session the sync layer can use at all — the
 *   refresh token is dead or nobody ever signed in on this device. One Tap
 *   sign-in fixes it, and once the owner does, the queue flushes.
 * - **`owner-mismatch`**: a session exists, but for a different account than
 *   the one this device's held queue belongs to (ADR-0029, decision 10). The
 *   queue is never merged into another account, so this stays blocked even
 *   though *someone* is signed in — the fix is signing in as the right
 *   account, which the same One Tap control offers.
 *
 * `role="status"` (an implicit `aria-live="polite"`) announces the change
 * without interrupting, the same choice `OfflineIndicator` makes.
 */
export function SyncSignInBanner(): JSX.Element | undefined {
  const status = useSyncAuthStatus();

  if (status === 'ok') return undefined;

  const message =
    status === 'owner-mismatch'
      ? "Signed in as a different account. This device's changes belong to another account and won't sync until you sign in as that account."
      : 'Sign in to sync. Changes made on this device are saved and will sync once you sign in.';

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-3 border-b border-hairline bg-brand-muted/10 px-4 py-2 text-sm text-brand-muted"
    >
      <span>{message}</span>
      <GoogleOneTap />
    </div>
  );
}
