'use client';

import { useEffect, useState, type JSX } from 'react';

const LAST_RIG_COOKIE = 'rv.last-rig';

interface SavedLink {
  readonly href: string;
  readonly label: string;
}

/**
 * What the precached document is captured with, and what a device with no rig
 * hint shows: the rig manager, which is the same page for everybody.
 */
const RIG_PICKER: readonly SavedLink[] = [
  { href: '/rigs', label: 'Your rigs' },
];

/**
 * `rv.last-rig` out of `document.cookie`. The same non-httpOnly hint cookie the
 * root route redirects on, written by the rig shell on every rig visit and
 * never used for auth.
 */
function readLastRig(): string | undefined {
  for (const pair of document.cookie.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== LAST_RIG_COOKIE) continue;
    const value = decodeURIComponent(pair.slice(separator + 1).trim());
    return value === '' ? undefined : value;
  }
  return undefined;
}

function linksFor(rigId: string | undefined): readonly SavedLink[] {
  if (!rigId) return RIG_PICKER;
  const rig = `/rig/${encodeURIComponent(rigId)}`;
  return [
    // The rig home is the dashboard, and the dashboard is where the current
    // trip is: `dashboard-screen.tsx` leads with the current-trip card (issue
    // #118). There is no separate current-trip route to link to — a trip is
    // opened by id — so this link and the trips list below are between them
    // what the ticket asks for.
    { href: rig, label: 'Rig home' },
    { href: `${rig}/trips`, label: 'Trips' },
    ...RIG_PICKER,
  ];
}

/**
 * The offline fallback's list of somewhere-to-go-instead.
 *
 * The destinations are worked out in the browser, not on the server, because
 * of when the containing page is captured. The worker precaches `/offline`
 * during `install`, which runs on the first page load after a deploy — on a
 * new device that is `/welcome`, before the rig shell has ever written
 * `rv.last-rig`. A server-rendered rig link would therefore be absent from the
 * cached copy in the ordinary case, and frozen there until the next deploy,
 * because a precache entry whose revision has not changed is never re-fetched.
 * Read here instead, the cookie is whatever it is at the moment the owner is
 * actually shown this page.
 *
 * That makes the precached document identical for every device, which is the
 * other reason to do it this way: the worker fetches precache entries with
 * `credentials: "same-origin"`, so a server-rendered copy would be a
 * credentialed capture, and this one has nothing in it to capture.
 *
 * The cookie is read after mount rather than during render so that the
 * server-rendered markup and the first client render agree — a rig link
 * appearing mid-hydration would be a mismatch. It costs one paint of the rig
 * picker, on a page whose whole job is to be a dead end.
 *
 * Plain anchors, not `next/link`. A `Link` would prefetch its target —
 * pointless off grid — and would navigate client-side, which needs an RSC
 * payload this device may not have. A full navigation is exactly right here:
 * it goes back through the service worker, which answers from the cached page.
 */
export function OfflineLinks(): JSX.Element {
  const [links, setLinks] = useState<readonly SavedLink[]>(RIG_PICKER);

  useEffect(() => {
    setLinks(linksFor(readLastRig()));
  }, []);

  return (
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
  );
}
