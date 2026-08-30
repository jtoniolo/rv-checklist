import type {
  PlaceDetails,
  PlaceSuggestion,
  TripRead,
} from '@rv-checklist/domain';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NewTripScreen } from './new-trip-screen';
import { StoreProvider } from './store-provider';

jest.mock('next/link', () => {
  return {
    __esModule: true,
    default: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <a href={href} {...rest}>
        {children}
      </a>
    ),
  };
});

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const RIG_ID = '550e8400-e29b-41d4-a716-446655440010';
const TRIP_ID = '550e8400-e29b-41d4-a716-446655440100';
const STOP_ID = '550e8400-e29b-41d4-a716-446655440101';

const created: TripRead = {
  id: TRIP_ID,
  rigId: RIG_ID,
  name: 'Fall Colours Loop',
  startLocation: 'Home — Newmarket, ON',
  startPlaceId: 'ChIJ-home',
  checklistIds: [],
  stops: [
    {
      id: STOP_ID,
      tripId: TRIP_ID,
      position: 0,
      arrived: false,
      campground: 'Killbear Provincial Park',
      attachments: [],
    },
  ],
  status: 'planned',
};

const suggestions: PlaceSuggestion[] = [
  { placeId: 'ChIJ-home', description: 'Home — Newmarket, ON' },
  { placeId: 'ChIJ-a', description: 'Killbear Provincial Park, Nobel, ON' },
  { placeId: 'ChIJ-b', description: 'Pancake Bay Provincial Park, ON' },
];

const details: PlaceDetails = {
  address: '35 Dillon Rd, Nobel, ON P0G 1G0',
  phone: '(705) 342-5492',
};

/** Road distances by `origin->destination` place IDs (issue #123 recalculation). */
const distances: Record<string, number> = {
  'ChIJ-home->ChIJ-a': 100,
  'ChIJ-a->ChIJ-b': 200,
  'ChIJ-home->ChIJ-b': 45,
  'ChIJ-b->ChIJ-a': 60,
};

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Answer a route-distance request from the {@link distances} table. */
async function routeDistanceResponse(request: Request): Promise<Response> {
  const body = (await request.clone().json()) as {
    originPlaceId: string;
    destinationPlaceId: string;
  };
  return jsonResponse({
    legKm: distances[`${body.originPlaceId}->${body.destinationPlaceId}`],
  });
}

/** Route every request the screen can make to canned data (house style). */
function stubFetch(): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/maps/autocomplete') {
      return Promise.resolve(jsonResponse(suggestions));
    }
    if (request.method === 'GET' && url.pathname.startsWith('/maps/places/')) {
      return Promise.resolve(jsonResponse(details));
    }
    if (request.method === 'POST' && url.pathname === '/maps/route-distance') {
      return routeDistanceResponse(request);
    }
    if (request.method === 'POST' && url.pathname === '/trips') {
      return Promise.resolve(jsonResponse(created, 201));
    }
    throw new Error(`Unstubbed request: ${request.method} ${url.pathname}`);
  });
}

/** The parsed bodies of every route-distance request, in call order. */
async function routeDistanceBodies(
  spy: jest.SpyInstance,
): Promise<Record<string, unknown>[]> {
  const requests = spy.mock.calls
    .map((call: readonly unknown[]) => call[0] as Request)
    .filter(
      (r) =>
        r.method === 'POST' &&
        new URL(r.url).pathname === '/maps/route-distance',
    );
  return Promise.all(
    requests.map((r) => r.clone().json() as Promise<Record<string, unknown>>),
  );
}

/** Every POST request the spy saw, as (pathname, parsed body) pairs. */
function postRequests(spy: jest.SpyInstance): Request[] {
  return spy.mock.calls
    .map((call: readonly unknown[]) => call[0] as Request)
    .filter((r) => r.method === 'POST');
}

function renderScreen(): void {
  render(
    <StoreProvider>
      <NewTripScreen rigId={RIG_ID} />
    </StoreProvider>,
  );
}

function fillName(name: string): void {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: name } });
}

/** Pick the start point through the Places autocomplete. */
async function pickStartPlace(): Promise<void> {
  fireEvent.change(screen.getByLabelText(/Start point/), {
    target: { value: 'Newmarket' },
  });
  const option = await screen.findByRole('option', {
    name: 'Home — Newmarket, ON',
  });
  fireEvent.click(option);
}

/** Add one draft stop with free-text campground through the stop form. */
function addStop(campground: string): void {
  fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));
  fireEvent.change(screen.getByLabelText(/Campground/), {
    target: { value: campground },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));
}

/**
 * Add one draft stop through a Google pick. Waits for the automatic leg fill
 * (`expectedLegKm`) — or, when no leg can fill yet, for the place-details
 * pre-fill — before submitting, so the draft carries the fetched values.
 */
async function addPlacedStop(
  query: string,
  optionName: string,
  expectedLegKm?: number,
): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));
  fireEvent.change(screen.getByLabelText(/Campground/), {
    target: { value: query },
  });
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
  if (expectedLegKm === undefined) {
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>(/Address/).value).toBe(
        details.address,
      );
    });
  } else {
    await waitFor(() => {
      expect(screen.getByLabelText<HTMLInputElement>(/Leg \(km\)/).value).toBe(
        String(expectedLegKm),
      );
    });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));
}

/** Start Home, then Killbear (leg 100, fetched) and Pancake Bay (leg 200, fetched). */
async function setUpTwoPlacedDrafts(): Promise<void> {
  renderScreen();
  fillName('Fall Colours Loop');
  await pickStartPlace();
  await addPlacedStop('killb', 'Killbear Provincial Park, Nobel, ON', 100);
  await addPlacedStop('panca', 'Pancake Bay Provincial Park, ON', 200);
}

describe('NewTripScreen (issues #114, #120)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockClear();
    fetchSpy = stubFetch();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('blocks the save without a Google-picked start place', async () => {
    renderScreen();
    fillName('Fall Colours Loop');
    addStop('Killbear Provincial Park');

    fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/pick the start point/i);
    expect(postRequests(fetchSpy)).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('blocks the save without at least one stop', async () => {
    renderScreen();
    fillName('Fall Colours Loop');
    await pickStartPlace();

    fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/at least one stop/i);
    expect(postRequests(fetchSpy)).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('creates trip and stops in one request and navigates to the trip screen', async () => {
    renderScreen();
    fillName('Fall Colours Loop');
    await pickStartPlace();
    addStop('Killbear Provincial Park');
    addStop('Pancake Bay');

    fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(`/rig/${RIG_ID}/trips/${TRIP_ID}`);
    });

    // One request carries the whole plan — never a POST per stop.
    const posts = postRequests(fetchSpy);
    expect(posts.map((r) => new URL(r.url).pathname)).toEqual(['/trips']);
    const firstPost = posts[0];
    if (!firstPost) throw new Error('No POST request');
    const body = (await firstPost.clone().json()) as Record<string, unknown>;
    expect(body).toEqual({
      rigId: RIG_ID,
      name: 'Fall Colours Loop',
      startLocation: 'Home — Newmarket, ON',
      startPlaceId: 'ChIJ-home',
      checklistIds: [],
      stops: [
        { campground: 'Killbear Provincial Park' },
        { campground: 'Pancake Bay' },
      ],
    });
  });

  it('does not submit without a name', () => {
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));

    expect(postRequests(fetchSpy)).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('deletes a draft stop again before the save', async () => {
    renderScreen();
    fillName('Fall Colours Loop');
    await pickStartPlace();
    addStop('Killbear Provincial Park');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    // With its only stop gone, the save is blocked again.
    fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));
    const blockedAgain = await screen.findByRole('alert');
    expect(blockedAgain.textContent).toMatch(/at least one stop/i);
    expect(postRequests(fetchSpy)).toHaveLength(0);
  });

  it('links back to the trips list', () => {
    renderScreen();

    const back = screen.getByRole('link', { name: /All trips/ });
    expect(back.getAttribute('href')).toBe(`/rig/${RIG_ID}/trips`);
  });

  describe('draft leg recalculation (issue #123, matching the editor’s #121 behavior)', () => {
    it('recalculates both affected draft legs on reorder, and the create body carries them as fetched', async () => {
      await setUpTwoPlacedDrafts();

      fireEvent.click(screen.getByRole('button', { name: 'Move stop 2 up' }));

      // Pancake Bay now starts from Home, Killbear from Pancake Bay.
      await screen.findByText(/45 km leg/);
      await screen.findByText(/60 km leg/);

      fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled();
      });
      const tripPost = postRequests(fetchSpy).find(
        (r) => new URL(r.url).pathname === '/trips',
      );
      if (!tripPost) throw new Error('No POST /trips request');
      const body = (await tripPost.clone().json()) as {
        stops: Record<string, unknown>[];
      };
      expect(body.stops).toMatchObject([
        { placeId: 'ChIJ-b', legKm: 45, legKmManual: false },
        { placeId: 'ChIJ-a', legKm: 60, legKmManual: false },
      ]);
    });

    it('recalculates the leg of the draft that moves up on delete', async () => {
      await setUpTwoPlacedDrafts();

      const buttons = screen.getAllByRole('button', { name: 'Delete' });
      const firstButton = buttons[0];
      if (!firstButton) throw new Error('No Delete button');
      fireEvent.click(firstButton);

      // Pancake Bay moved up: its leg now runs Home -> Pancake Bay.
      await screen.findByText(/45 km leg/);
      const bodies = await routeDistanceBodies(fetchSpy);
      expect(bodies.at(-1)).toEqual({
        originPlaceId: 'ChIJ-home',
        destinationPlaceId: 'ChIJ-b',
      });
    });

    it('never overwrites a manually typed draft leg in recalculation', async () => {
      renderScreen();
      fillName('Fall Colours Loop');
      await pickStartPlace();
      await addPlacedStop('killb', 'Killbear Provincial Park, Nobel, ON', 100);

      // Pancake Bay with a hand-typed leg — typing marks it manual.
      fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));
      fireEvent.change(screen.getByLabelText(/Campground/), {
        target: { value: 'panca' },
      });
      fireEvent.click(
        await screen.findByRole('option', {
          name: 'Pancake Bay Provincial Park, ON',
        }),
      );
      await waitFor(() => {
        expect(
          screen.getByLabelText<HTMLInputElement>(/Leg \(km\)/).value,
        ).toBe('200');
      });
      fireEvent.change(screen.getByLabelText(/Leg \(km\)/), {
        target: { value: '80' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));

      fireEvent.click(screen.getByRole('button', { name: 'Move stop 2 up' }));

      // Killbear's origin changed to Pancake Bay and refetches; the manual
      // Pancake Bay leg survives untouched — no fetch fired for it.
      await screen.findByText(/60 km leg/);
      expect(screen.getByText(/80 km leg/)).toBeTruthy();
      const bodies = await routeDistanceBodies(fetchSpy);
      expect(bodies).toEqual([
        { originPlaceId: 'ChIJ-home', destinationPlaceId: 'ChIJ-a' },
        { originPlaceId: 'ChIJ-a', destinationPlaceId: 'ChIJ-b' },
        { originPlaceId: 'ChIJ-b', destinationPlaceId: 'ChIJ-a' },
      ]);
    });

    it('fills the first draft’s leg when the start place is picked after the draft exists', async () => {
      renderScreen();
      fillName('Fall Colours Loop');
      // The draft comes first — no start place yet, so no leg can fill.
      await addPlacedStop('killb', 'Killbear Provincial Park, Nobel, ON');
      expect(await routeDistanceBodies(fetchSpy)).toEqual([]);

      await pickStartPlace();

      await screen.findByText(/100 km leg/);
      expect(await routeDistanceBodies(fetchSpy)).toEqual([
        { originPlaceId: 'ChIJ-home', destinationPlaceId: 'ChIJ-a' },
      ]);
    });
  });
});
