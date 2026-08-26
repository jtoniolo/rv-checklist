import { expect, test } from './fixtures.js';
import { goOffline } from './support/offline.js';

/**
 * Charter scenario 1 (issue #156, docs/adr/0028): install the PWA, open it
 * online once with a current trip, go offline, kill and reopen the app —
 * the rig home and current-trip dashboard still render.
 *
 * "Kill the app, reopen" is emulated as a hard reload of a page the service
 * worker has already cached (ADR-0028's cached-pages model: visited routes
 * serve from cache offline, no HTML app-shell precache). Real closed-app /
 * OS-level app-kill on Android is not reachable from a browser context —
 * that half of the scenario, and the campground-map-opens assertion (which
 * needs an offline-cached attachment, i.e. real S3/Garage storage), stay
 * manual (see the checklist comment on issue #156).
 */
test.describe('Scenario 1 — cold boot off grid', () => {
  test('rig home and current-trip dashboard render after going offline and reloading', async ({
    page,
    context,
    owner,
    trip,
  }) => {
    // Online: visit once so the service worker installs and caches this
    // page's HTML/RSC (ADR-0028 "Cached-pages model, no HTML app-shell
    // precache").
    await page.goto(`/rig/${owner.rigId}`);
    await expect(
      page.getByRole('heading', { name: 'Current trip' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(trip.tripName) }),
    ).toBeVisible();

    // Wait for the service worker to finish installing, then reload once
    // more while still online: the very first navigation of a fresh context
    // is never SW-controlled (clientsClaim only takes effect for the *next*
    // navigation, ADR-0028), so this second load is what actually runs the
    // SW's fetch handler and populates its runtime cache for this page.
    await page.evaluate(() => globalThis.navigator.serviceWorker.ready);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Current trip' }),
    ).toBeVisible();

    // Simulate "kill the app, reopen" with no signal: airplane mode, then a
    // fresh navigation (not just an in-page transition).
    await goOffline(page, context);
    await page.reload();

    await expect(
      page.getByRole('heading', { name: 'Current trip' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: new RegExp(trip.tripName) }),
    ).toBeVisible();
  });
});
