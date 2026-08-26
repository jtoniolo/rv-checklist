import { expect, test } from './fixtures.js';
import { goOffline } from './support/offline.js';

/**
 * Charter scenario 5 (issue #156, docs/adr/0028): degraded functions offline
 * show their states. This covers the two that are reachable without a real
 * Google Maps key or S3/Garage attachment storage:
 *
 * - the app-wide offline indicator (apps/web/src/app/offline-indicator.tsx)
 * - the manual Distance field's offline warning (apps/web/src/app/rig-form.tsx)
 *
 * Place autocomplete unavailable, the leg field falling back to manual, and
 * an uncached attachment showing "available online" all need either a real
 * Maps API key or a cached/uncached attachment round trip through S3 —
 * those stay manual (see the checklist comment on issue #156).
 */
test.describe('Scenario 5 — degraded functions offline', () => {
  test('the offline indicator appears and the Distance field warns once offline', async ({
    page,
    context,
    owner,
  }) => {
    const settingsUrl = `/rig/${owner.rigId}/settings`;

    // Online: cache the settings page so a later offline reload still
    // renders it (ADR-0028 cached-pages model).
    await page.goto(settingsUrl);
    await expect(page.getByLabel(/Current distance/)).toBeVisible();
    await expect(
      page.getByRole('status', { name: /No connection/ }),
    ).toHaveCount(0);
    // The first navigation of a fresh context is never SW-controlled
    // (clientsClaim only takes effect for the *next* navigation, ADR-0028);
    // reload once more online so the SW's fetch handler actually caches this
    // page before we simulate going offline.
    await page.evaluate(() => globalThis.navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByLabel(/Current distance/)).toBeVisible();

    await goOffline(page, context);
    await page.reload();

    await expect(
      page.getByRole('status', { name: /No connection/ }),
    ).toBeVisible();
    await expect(
      page.getByText(/Offline — this replaces the whole figure/),
    ).toBeVisible();
  });
});
