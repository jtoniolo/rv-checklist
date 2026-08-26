import { test as base } from '@playwright/test';
import {
  seedOwnerWithRig,
  seedUnderwayTrip,
  type SeededOwner,
  type SeededTrip,
} from './support/seed.js';

/**
 * A signed-in owner with an underway trip, already applied to the browser
 * context as cookies (issue #156). Each test gets its own owner — cheap
 * (one first-login seed + one trip create) and collision-free under
 * parallel workers, unlike sharing one seeded account across the file.
 */
export const test = base.extend<{
  owner: SeededOwner;
  trip: SeededTrip;
}>({
  owner: async ({ context }, use, testInfo) => {
    const owner = await seedOwnerWithRig(
      testInfo.titlePath.join('-').replaceAll(/[^a-z0-9-]/gi, '-'),
    );
    await context.addCookies([
      ...owner.cookies,
      // Non-httpOnly hint the root page reads to skip the rig picker
      // (apps/web/src/app/page.tsx) — set the same way the rig switcher does.
      {
        name: 'rv.last-rig',
        value: owner.rigId,
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      },
    ]);
    await use(owner);
  },
  trip: async ({ owner }, use) => {
    const trip = await seedUnderwayTrip(owner);
    await use(trip);
  },
});

export { expect } from '@playwright/test';
