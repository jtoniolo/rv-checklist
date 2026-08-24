import { Page } from '@rv-checklist/web-ui';
import type { Metadata } from 'next';
import type { JSX } from 'react';
import { OfflineLinks } from './offline-links';

export const metadata: Metadata = {
  title: 'Offline',
};

/**
 * The offline fallback (ADR-0028, issue #150). The service worker precaches
 * this page and serves it for a navigation to a route the device has no cached
 * copy of. Everything the owner has already opened is served from that cache
 * instead, so this is only ever the answer for somewhere they have not been.
 *
 * It renders no data — there is none to render off grid without opening the
 * local store, and this page must be one static document that was captured
 * whole at install time. Nothing on it reads a request either, which is what
 * keeps it statically prerendered: `sw/build.mjs` reads the prerendered HTML to
 * find the assets this page needs and precaches those too, so the one page
 * nobody ever opens online still arrives styled and running.
 *
 * Where its links point is the one thing that cannot be decided here — see
 * `offline-links.tsx`, which works that out in the browser from the same
 * `rv.last-rig` hint cookie the root route redirects on.
 */
export default function OfflinePage(): JSX.Element {
  return (
    <Page>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-brand lg:text-4xl dark:text-ink-inverted">
          You are offline
        </h1>
        <p className="text-base text-brand-muted lg:text-lg">
          This page has not been saved to this device yet.
        </p>
      </header>
      <section
        className="flex flex-col gap-4 rounded-xl border border-dashed border-hairline p-6 text-brand-muted"
        aria-label="Pages saved on this device"
      >
        <p>
          Pages you have already opened still work, and so do your checklists,
          trips and maintenance records — they are stored on the device.
          Anything you change now is sent as soon as you have signal again.
        </p>
        <OfflineLinks />
      </section>
    </Page>
  );
}
