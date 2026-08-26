/**
 * HTTP seeding for the offline-charter Playwright suite (issue #156). Talks
 * to the real API — the same endpoints the app itself calls — rather than
 * touching Postgres directly, so a seeded fixture is exactly as valid as
 * anything a real owner created. Auth rides `POST /auth/e2e-login`
 * (apps/api/src/app/auth/auth.controller.ts), a Google-verification-free
 * sign-in gated behind `E2E_TEST_AUTH=true`; `nx run web-e2e:e2e` only makes
 * sense against a server booted with that flag set (in the repo root's
 * `.env` — see `playwright.config.mts`'s doc comment).
 */

const API_BASE_URL =
  process.env['E2E_API_BASE_URL'] ?? 'http://localhost:3000/api';

export interface SeededOwner {
  readonly email: string;
  /** `rv.access` + `rv.refresh` cookie values, ready for `context.addCookies`. */
  readonly cookies: readonly {
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Lax';
  }[];
  readonly rigId: string;
}

export interface SeededTrip {
  readonly tripId: string;
  readonly tripName: string;
  readonly firstStopName: string;
  readonly secondStopName: string;
}

function parseSetCookie(header: string): { name: string; value: string } {
  const [pair = ''] = header.split(';', 1);
  const eq = pair.indexOf('=');
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1) };
}

/**
 * Signs in as a fresh, uniquely-emailed owner (so parallel/rerun test runs
 * never collide on seeded content) and returns the cookies plus the rig id
 * that `SeedService.seedStarterContent` creates on first login.
 */
export async function seedOwnerWithRig(
  label: string,
  host = 'localhost',
): Promise<SeededOwner> {
  const email = `e2e-${label}-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const res = await fetch(`${API_BASE_URL}/auth/e2e-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new Error(
      `seedOwnerWithRig: /auth/e2e-login failed (${String(res.status)}). Is the server running with E2E_TEST_AUTH=true?`,
    );
  }
  const cookieHeaders = res.headers.getSetCookie();
  const cookies = cookieHeaders.map((raw) => {
    const { name, value } = parseSetCookie(raw);
    return {
      name,
      value,
      domain: host,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
    };
  });
  const accessCookie = cookies.find((c) => c.name === 'rv.access');
  if (!accessCookie) {
    throw new Error('seedOwnerWithRig: no rv.access cookie in the response');
  }

  const rigsRes = await fetch(`${API_BASE_URL}/rigs`, {
    headers: { cookie: `rv.access=${accessCookie.value}` },
  });
  if (!rigsRes.ok) {
    throw new Error(
      `seedOwnerWithRig: GET /rigs failed (${String(rigsRes.status)})`,
    );
  }
  const rigs = (await rigsRes.json()) as { id: string }[];
  const rig = rigs[0];
  if (!rig) {
    throw new Error('seedOwnerWithRig: first login did not seed a rig');
  }

  return { email, cookies, rigId: rig.id };
}

/**
 * Creates a two-stop trip on the owner's rig and marks the first stop
 * arrived, so `findCurrentTrip` (libs/shared/domain) picks it up as
 * "underway" — the dashboard's current-trip card.
 */
export async function seedUnderwayTrip(
  owner: SeededOwner,
): Promise<SeededTrip> {
  const accessCookie = owner.cookies.find((c) => c.name === 'rv.access');
  if (!accessCookie)
    throw new Error('seedUnderwayTrip: owner has no access cookie');
  const cookie = `rv.access=${accessCookie.value}`;
  const tripName = 'Fall Loop';
  const firstStopName = 'Lakeview Campground';
  const secondStopName = 'Riverside RV Park';

  const tripRes = await fetch(`${API_BASE_URL}/trips`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      rigId: owner.rigId,
      name: tripName,
      stops: [
        { campground: firstStopName, legKm: 120 },
        { campground: secondStopName, legKm: 80 },
      ],
    }),
  });
  if (!tripRes.ok) {
    throw new Error(
      `seedUnderwayTrip: POST /trips failed (${String(tripRes.status)})`,
    );
  }
  const trip = (await tripRes.json()) as {
    id: string;
    stops: { id: string; position: number }[];
  };
  const firstStop = trip.stops.find((s) => s.position === 0);
  if (!firstStop)
    throw new Error('seedUnderwayTrip: created trip has no first stop');

  const arriveRes = await fetch(
    `${API_BASE_URL}/stops/${firstStop.id}/arrival`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ arrived: true }),
    },
  );
  if (!arriveRes.ok) {
    throw new Error(
      `seedUnderwayTrip: POST /stops/:id/arrival failed (${String(arriveRes.status)})`,
    );
  }

  return { tripId: trip.id, tripName, firstStopName, secondStopName };
}
