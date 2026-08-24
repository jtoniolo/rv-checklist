import { Page } from '@rv-checklist/web-ui';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { JSX } from 'react';

const LAST_RIG_COOKIE = 'rv.last-rig';

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
 * whole at install time. The one exception is the destination of its links:
 * `rv.last-rig` is the same non-httpOnly hint cookie the root route redirects
 * on (never used for auth), read here on the server so the precached HTML
 * points at the owner's rig rather than at a rig picker.
 *
 * The links are plain anchors, not `next/link`. A `Link` would prefetch its
 * target — pointless off grid — and would navigate client-side, which needs an
 * RSC payload this device may not have. A full navigation is exactly right
 * here: it goes back through the service worker, which answers from the cached
 * page.
 *
 * Nothing here needs to hydrate, and that is deliberate. This is the one page
 * nobody ever opens online, so its own JavaScript chunk may not be on the
 * device — the worker precaches the stylesheet for exactly this reason, but
 * not the whole build. With static markup and plain anchors, a chunk that
 * fails to load costs nothing: the server-rendered page is the whole page.
 */
export default async function OfflinePage(): Promise<JSX.Element> {
  const cookieStore = await cookies();
  const lastRig = cookieStore.get(LAST_RIG_COOKIE)?.value;

  const links = lastRig
    ? [
        { href: `/rig/${lastRig}`, label: 'Rig home' },
        { href: `/rig/${lastRig}/trips`, label: 'Trips' },
        { href: '/rigs', label: 'Your rigs' },
      ]
    : [{ href: '/rigs', label: 'Your rigs' }];

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
        <nav aria-label="Saved pages">
          <ul className="flex flex-col gap-2">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="font-medium text-brand underline underline-offset-4 dark:text-ink-inverted"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </section>
    </Page>
  );
}
