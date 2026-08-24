'use client';

import { useIsOffline } from '@rv-checklist/web-data-access';
import type { JSX } from 'react';

/**
 * The app-wide offline signal in the rig shell's header (issue #153;
 * CONTEXT.md, "Offline indicator"). Driven by the sync engine's connection
 * state with the browser's online/offline events as fallback — see
 * `useIsOffline`.
 *
 * Offline is a mode, not a failure, so this is a quiet neutral pill rather than
 * an error banner: nothing is broken, the app is reading and writing locally.
 * It renders nothing at all while online, which keeps the header unchanged in
 * the ordinary case and keeps the server HTML identical to what it was.
 *
 * `role="status"` (an implicit `aria-live="polite"`) announces the change to a
 * screen reader without interrupting, which is exactly the tone wanted: the
 * label is the whole message, so the dot beside it is decorative.
 */
export function OfflineIndicator(): JSX.Element | undefined {
  const isOffline = useIsOffline();
  if (!isOffline) return undefined;

  return (
    <span
      role="status"
      title="No connection. Your changes are saved on this device and sync when you are back online."
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-xs font-medium text-brand-muted"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-brand-muted" />
      Offline
    </span>
  );
}
