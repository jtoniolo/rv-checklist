import type {
  PlaceDetails,
  PlaceSuggestion,
  StopRead,
  TripRead,
} from '@rv-checklist/domain';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StoreProvider } from './store-provider';
import { TripEditorScreen } from './trip-editor-screen';

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

// The explicit `null` a clear-vs-omit PATCH body carries for a cleared field.
// eslint-disable-next-line unicorn/no-null
const CLEARED = null;

const RIG_ID = '550e8400-e29b-41d4-a716-446655440010';
const TRIP_ID = '550e8400-e29b-41d4-a716-446655440100';
const STOP_1_ID = '550e8400-e29b-41d4-a716-446655440101';
const STOP_2_ID = '550e8400-e29b-41d4-a716-446655440102';

const stop1: StopRead = {
  id: STOP_1_ID,
  tripId: TRIP_ID,
  position: 0,
  arrived: false,
  campground: 'Killbear Provincial Park',
  attachments: [],
};

const stop2: StopRead = {
  id: STOP_2_ID,
  tripId: TRIP_ID,
  position: 1,
  arrived: false,
  campground: 'Pancake Bay',
  attachments: [],
};

const trip: TripRead = {
  id: TRIP_ID,
  rigId: RIG_ID,
  name: 'Fall Colours Loop',
  startLocation: 'Home — Newmarket, ON',
  checklistIds: [],
  stops: [stop1, stop2],
  status: 'planned',
};

const suggestions: PlaceSuggestion[] = [
  {
    placeId: 'ChIJ-killbear',
    description: 'Killbear Provincial Park, Nobel, ON',
  },
];

const details: PlaceDetails = {
  address: '35 Dillon Rd, Nobel, ON P0G 1G0',
  phone: '(705) 342-5492',
};

interface StubOptions {
  readonly trips: TripRead[];
  readonly legKm?: number;
  /** What the reorder endpoint returns — the trip's stops in their new order. */
  readonly reordered?: StopRead[];
}

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Route every request the screen can make to canned data (house style). */
function stubFetch({
  trips,
  legKm = 145,
  reordered = [],
}: StubOptions): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/trips') {
      return Promise.resolve(jsonResponse(trips));
    }
    if (request.method === 'POST' && url.pathname.endsWith('/reorder')) {
      return Promise.resolve(jsonResponse(reordered));
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/stops/')) {
      return Promise.resolve(new Response(undefined, { status: 200 }));
    }
    if (request.method === 'GET' && url.pathname === '/maps/autocomplete') {
      return Promise.resolve(jsonResponse(suggestions));
    }
    if (request.method === 'GET' && url.pathname.startsWith('/maps/places/')) {
      return Promise.resolve(jsonResponse(details));
    }
    if (request.method === 'POST' && url.pathname === '/maps/route-distance') {
      return Promise.resolve(jsonResponse({ legKm }));
    }
    if (request.method === 'POST' && url.pathname === '/stops') {
      return Promise.resolve(
        jsonResponse({ ...stop2, id: STOP_2_ID, position: 2 }, 201),
      );
    }
    if (request.method === 'PATCH' && url.pathname.startsWith('/stops/')) {
      return Promise.resolve(jsonResponse(stop1));
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/stops/')) {
      return Promise.resolve(new Response(undefined, { status: 204 }));
    }
    if (request.method === 'PATCH' && url.pathname.startsWith('/trips/')) {
      return Promise.resolve(jsonResponse(trips[0]));
    }
    throw new Error(`Unstubbed request: ${request.method} ${url.pathname}`);
  });
}

/** Every request matching method + path prefix, in call order. */
function requestsOf(
  spy: jest.SpyInstance,
  method: string,
  pathPrefix: string,
): Request[] {
  return spy.mock.calls
    .map((call: readonly unknown[]) => call[0] as Request)
    .filter(
      (r) =>
        r.method === method && new URL(r.url).pathname.startsWith(pathPrefix),
    );
}

/** The parsed body of the first request matching method + path prefix. */
async function bodyOf(
  spy: jest.SpyInstance,
  method: string,
  pathPrefix: string,
): Promise<Record<string, unknown>> {
  const request = spy.mock.calls
    .map((call: readonly unknown[]) => call[0] as Request)
    .find(
      (r) =>
        r.method === method && new URL(r.url).pathname.startsWith(pathPrefix),
    );
  if (!request) throw new Error(`No ${method} ${pathPrefix} request`);
  return (await request.clone().json()) as Record<string, unknown>;
}

function renderScreen(): void {
  render(
    <StoreProvider>
      <TripEditorScreen rigId={RIG_ID} tripId={TRIP_ID} />
    </StoreProvider>,
  );
}

/** Open the edit form of the stop at `index` (trip order). */
async function openStopForm(index: number): Promise<void> {
  const editButtons = await screen.findAllByRole('button', { name: 'Edit' });
  const button = editButtons[index];
  if (!button) throw new Error(`No stop at index ${String(index)}`);
  fireEvent.click(button);
}

/** Open the add-stop form and pick the stubbed suggestion as the campground. */
async function addStopAndPickPlace(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Add stop' }));
  fireEvent.change(screen.getByLabelText(/Campground/), {
    target: { value: 'killb' },
  });
  const option = await screen.findByRole('option', {
    name: 'Killbear Provincial Park, Nobel, ON',
  });
  fireEvent.click(option);
}

/** Click the Delete button of the stop at `index` (trip order). */
async function clickDeleteStop(index: number): Promise<void> {
  const buttons = await screen.findAllByRole('button', { name: 'Delete' });
  const button = buttons[index];
  if (!button) throw new Error(`No stop at index ${String(index)}`);
  fireEvent.click(button);
}

describe('TripEditorScreen (issue #115)', () => {
  let fetchSpy: jest.SpyInstance;

  afterEach(() => {
    fetchSpy.mockRestore();
    mockPush.mockClear();
  });

  describe('fetch-distance gating', () => {
    it('is disabled when the stop carries no place ID', async () => {
      fetchSpy = stubFetch({
        trips: [{ ...trip, startPlaceId: 'ChIJ-home' }],
      });
      renderScreen();
      await openStopForm(0);

      expect(
        screen.getByRole('button', {
          name: 'Fetch distance',
        }).disabled,
      ).toBe(true);
    });

    it('is disabled when the previous stop carries no place ID', async () => {
      fetchSpy = stubFetch({
        trips: [
          {
            ...trip,
            startPlaceId: 'ChIJ-home',
            stops: [stop1, { ...stop2, placeId: 'ChIJ-pancake' }],
          },
        ],
      });
      renderScreen();
      await openStopForm(1);

      expect(
        screen.getByRole('button', {
          name: 'Fetch distance',
        }).disabled,
      ).toBe(true);
    });

    it('uses the trip start as the first stop’s previous end and pre-fills the editable leg', async () => {
      fetchSpy = stubFetch({
        trips: [
          {
            ...trip,
            startPlaceId: 'ChIJ-home',
            stops: [{ ...stop1, placeId: 'ChIJ-killbear' }],
          },
        ],
        legKm: 145,
      });
      renderScreen();
      await openStopForm(0);

      const fetchButton = screen.getByRole('button', {
        name: 'Fetch distance',
      });
      expect(fetchButton.disabled).toBe(false);
      fireEvent.click(fetchButton);

      await waitFor(() => {
        expect(screen.getByLabelText(/Leg \(km\)/).value).toBe('145');
      });
      expect(await bodyOf(fetchSpy, 'POST', '/maps/route-distance')).toEqual({
        originPlaceId: 'ChIJ-home',
        destinationPlaceId: 'ChIJ-killbear',
      });
    });

    it('is disabled for the first stop when the trip start has no place ID', async () => {
      fetchSpy = stubFetch({
        trips: [{ ...trip, stops: [{ ...stop1, placeId: 'ChIJ-killbear' }] }],
      });
      renderScreen();
      await openStopForm(0);

      expect(
        screen.getByRole('button', {
          name: 'Fetch distance',
        }).disabled,
      ).toBe(true);
    });
  });

  describe('pre-fill flows', () => {
    it('sets the free text and place ID from an autocomplete pick, and lands place details in the editable fields', async () => {
      fetchSpy = stubFetch({ trips: [trip] });
      renderScreen();
      await openStopForm(0);

      const campground = screen.getByLabelText(/Campground/);
      fireEvent.change(campground, { target: { value: 'killb' } });

      const option = await screen.findByRole('option', {
        name: 'Killbear Provincial Park, Nobel, ON',
      });
      fireEvent.click(option);

      // The pick set both the text and the place link.
      expect((campground as HTMLInputElement).value).toBe(
        'Killbear Provincial Park, Nobel, ON',
      );
      const autocompleteRequest = fetchSpy.mock.calls
        .map((call: readonly unknown[]) => call[0] as Request)
        .find((r) => new URL(r.url).pathname === '/maps/autocomplete');
      if (!autocompleteRequest) throw new Error('No autocomplete request');
      expect(new URL(autocompleteRequest.url).searchParams.get('input')).toBe(
        'killb',
      );

      // Place details pre-fill the editable owner fields (ADR-0025).
      await waitFor(() => {
        expect(screen.getByLabelText(/Address/).value).toBe(details.address);
      });
      expect(screen.getByLabelText(/Phone/).value).toBe(details.phone);

      // Saving carries the picked place ID and the pre-filled fields.
      fireEvent.click(screen.getByRole('button', { name: 'Save stop' }));
      await waitFor(async () => {
        expect(await bodyOf(fetchSpy, 'PATCH', '/stops/')).toEqual({
          campground: 'Killbear Provincial Park, Nobel, ON',
          placeId: 'ChIJ-killbear',
          address: details.address,
          phone: details.phone,
        });
      });
    });

    it('keeps free text without a pick and unlinks the place when the text is edited', async () => {
      fetchSpy = stubFetch({
        trips: [
          {
            ...trip,
            stops: [{ ...stop1, placeId: 'ChIJ-killbear' }],
          },
        ],
      });
      renderScreen();
      await openStopForm(0);

      // Boondocking: type over the linked place — free text stays, link drops.
      fireEvent.change(screen.getByLabelText(/Campground/), {
        target: { value: 'A friend’s driveway' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save stop' }));

      await waitFor(async () => {
        expect(await bodyOf(fetchSpy, 'PATCH', '/stops/')).toEqual({
          campground: 'A friend’s driveway',
          placeId: CLEARED,
        });
      });
    });
  });

  describe('clear-vs-omit trip updates', () => {
    it('clears the start point with nulls and omits untouched fields', async () => {
      fetchSpy = stubFetch({
        trips: [{ ...trip, startPlaceId: 'ChIJ-home' }],
      });
      renderScreen();
      await screen.findByLabelText(/Start point/);

      fireEvent.change(screen.getByLabelText(/Start point/), {
        target: { value: '' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));

      await waitFor(async () => {
        expect(await bodyOf(fetchSpy, 'PATCH', '/trips/')).toEqual({
          startLocation: CLEARED,
          startPlaceId: CLEARED,
        });
      });
    });
  });

  describe('last-stop delete refusal (issue #120)', () => {
    it('refuses to delete the last remaining stop with a clear message', async () => {
      fetchSpy = stubFetch({ trips: [{ ...trip, stops: [stop1] }] });
      renderScreen();

      fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/last stop.*Delete the trip instead/i);
      const deletionRequests = fetchSpy.mock.calls
        .map((call: readonly unknown[]) => call[0] as Request)
        .filter((r) => r.method === 'DELETE');
      expect(deletionRequests).toHaveLength(0);
    });

    it('still deletes a stop while others remain', async () => {
      fetchSpy = stubFetch({ trips: [trip] });
      renderScreen();

      const buttons = await screen.findAllByRole('button', {
        name: 'Delete',
      });
      const firstDeleteButton = buttons[0];
      if (!firstDeleteButton) throw new Error('No Delete button');
      fireEvent.click(firstDeleteButton);

      await waitFor(() => {
        const deletionRequests = fetchSpy.mock.calls
          .map((call: readonly unknown[]) => call[0] as Request)
          .filter((r) => r.method === 'DELETE');
        expect(deletionRequests).toHaveLength(1);
      });
    });
  });

  describe('start point demands a place pick when edited (issue #120)', () => {
    it('blocks saving an edited start point without a Google pick', async () => {
      fetchSpy = stubFetch({ trips: [trip] });
      renderScreen();
      await screen.findByLabelText(/Start point/);

      fireEvent.change(screen.getByLabelText(/Start point/), {
        target: { value: 'Somewhere typed by hand' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/pick the start point/i);
      const patches = fetchSpy.mock.calls
        .map((call: readonly unknown[]) => call[0] as Request)
        .filter(
          (r) =>
            r.method === 'PATCH' &&
            new URL(r.url).pathname.startsWith('/trips'),
        );
      expect(patches).toHaveLength(0);
    });

    it('blocks a retype-identical edit on a place-linked trip instead of silently clearing the place (issue #123)', async () => {
      fetchSpy = stubFetch({
        trips: [{ ...trip, startPlaceId: 'ChIJ-home' }],
      });
      renderScreen();
      await screen.findByLabelText(/Start point/);

      // Type a character and delete it again — every keystroke unlinks the
      // place, and the final text equals the stored startLocation.
      fireEvent.change(screen.getByLabelText(/Start point/), {
        target: { value: 'Home — Newmarket, ONx' },
      });
      fireEvent.change(screen.getByLabelText(/Start point/), {
        target: { value: 'Home — Newmarket, ON' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/pick the start point/i);
      // `startPlaceId: null` must never reach the PATCH.
      const patches = fetchSpy.mock.calls
        .map((call: readonly unknown[]) => call[0] as Request)
        .filter(
          (r) =>
            r.method === 'PATCH' &&
            new URL(r.url).pathname.startsWith('/trips'),
        );
      expect(patches).toHaveLength(0);
    });

    // Accepted behavior change (issue #123): on a legacy trip without a place,
    // a retype-identical edit now also blocks and demands a pick — the dirty
    // flag replaces the old text comparison, which could not tell an edit
    // that landed on identical text from an untouched field.
    it('blocks a retype-identical edit on a legacy no-place trip too', async () => {
      fetchSpy = stubFetch({ trips: [trip] });
      renderScreen();
      await screen.findByLabelText(/Start point/);

      fireEvent.change(screen.getByLabelText(/Start point/), {
        target: { value: 'Home — Newmarket, ONx' },
      });
      fireEvent.change(screen.getByLabelText(/Start point/), {
        target: { value: 'Home — Newmarket, ON' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toMatch(/pick the start point/i);
    });

    it('sends no startPlaceId on a name-only save of a place-linked trip', async () => {
      fetchSpy = stubFetch({
        trips: [{ ...trip, startPlaceId: 'ChIJ-home' }],
      });
      renderScreen();
      await screen.findByLabelText(/Start point/);

      fireEvent.change(screen.getByLabelText(/^Name/), {
        target: { value: 'Renamed loop' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));

      await waitFor(async () => {
        expect(await bodyOf(fetchSpy, 'PATCH', '/trips/')).toEqual({
          name: 'Renamed loop',
        });
      });
    });

    it('still saves a rename when a legacy text-only start point is untouched', async () => {
      fetchSpy = stubFetch({ trips: [trip] });
      renderScreen();
      await screen.findByLabelText(/Start point/);

      fireEvent.change(screen.getByLabelText(/^Name/), {
        target: { value: 'Renamed loop' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));

      await waitFor(async () => {
        expect(await bodyOf(fetchSpy, 'PATCH', '/trips/')).toEqual({
          name: 'Renamed loop',
        });
      });
    });
  });

  it('says near the leg field that editing an arrived stop adjusts the rig Distance', async () => {
    fetchSpy = stubFetch({
      trips: [{ ...trip, stops: [{ ...stop1, arrived: true, legKm: 250 }] }],
    });
    renderScreen();
    await openStopForm(0);

    expect(
      screen.getByText(/adjusts the rig's\s+Distance by the difference/),
    ).toBeTruthy();
  });

  describe('automatic leg fill (issue #121)', () => {
    it('fills the leg with no extra interaction when a place is picked on a new stop', async () => {
      fetchSpy = stubFetch({
        trips: [{ ...trip, stops: [{ ...stop1, placeId: 'ChIJ-first' }] }],
        legKm: 165,
      });
      renderScreen();
      await addStopAndPickPlace();

      await waitFor(() => {
        expect(screen.getByLabelText(/Leg \(km\)/).value).toBe('165');
      });
      expect(await bodyOf(fetchSpy, 'POST', '/maps/route-distance')).toEqual({
        originPlaceId: 'ChIJ-first',
        destinationPlaceId: 'ChIJ-killbear',
      });

      // Saving carries the fetched leg with fetched (non-manual) provenance.
      fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));
      await waitFor(async () => {
        expect(await bodyOf(fetchSpy, 'POST', '/stops')).toMatchObject({
          legKm: 165,
          legKmManual: false,
        });
      });
    });

    it('fills the first stop’s leg from the trip’s start place', async () => {
      fetchSpy = stubFetch({
        trips: [{ ...trip, startPlaceId: 'ChIJ-home', stops: [] }],
        legKm: 145,
      });
      renderScreen();
      await addStopAndPickPlace();

      await waitFor(() => {
        expect(screen.getByLabelText(/Leg \(km\)/).value).toBe('145');
      });
      expect(await bodyOf(fetchSpy, 'POST', '/maps/route-distance')).toEqual({
        originPlaceId: 'ChIJ-home',
        destinationPlaceId: 'ChIJ-killbear',
      });
    });

    it('never overwrites a manually typed leg with an automatic fetch', async () => {
      fetchSpy = stubFetch({
        trips: [{ ...trip, startPlaceId: 'ChIJ-home', stops: [] }],
      });
      renderScreen();
      fireEvent.click(await screen.findByRole('button', { name: 'Add stop' }));
      fireEvent.change(screen.getByLabelText(/Leg \(km\)/), {
        target: { value: '80' },
      });
      fireEvent.change(screen.getByLabelText(/Campground/), {
        target: { value: 'killb' },
      });
      const option = await screen.findByRole('option', {
        name: 'Killbear Provincial Park, Nobel, ON',
      });
      fireEvent.click(option);

      // The pick still pre-fills place details — once that landed, no
      // route-distance call may have fired and the typed leg stands.
      await waitFor(() => {
        expect(screen.getByLabelText(/Address/).value).toBe(details.address);
      });
      expect(requestsOf(fetchSpy, 'POST', '/maps/route-distance')).toHaveLength(
        0,
      );
      expect(screen.getByLabelText(/Leg \(km\)/).value).toBe('80');

      fireEvent.click(screen.getByRole('button', { name: 'Add stop' }));
      await waitFor(async () => {
        expect(await bodyOf(fetchSpy, 'POST', '/stops')).toMatchObject({
          legKm: 80,
          legKmManual: true,
        });
      });
    });

    it('recalculates affected place-linked stops on reorder, preserving manual legs', async () => {
      const first: StopRead = {
        ...stop1,
        placeId: 'ChIJ-a',
        legKm: 100,
        legKmManual: false,
      };
      const second: StopRead = {
        ...stop2,
        placeId: 'ChIJ-b',
        legKm: 200,
        legKmManual: true,
      };
      fetchSpy = stubFetch({
        trips: [{ ...trip, startPlaceId: 'ChIJ-home', stops: [first, second] }],
        legKm: 145,
        reordered: [
          { ...second, position: 0 },
          { ...first, position: 1 },
        ],
      });
      renderScreen();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Move stop 1 down' }),
      );

      // The moved stop's leg now starts from the other stop's place.
      await waitFor(async () => {
        expect(await bodyOf(fetchSpy, 'PATCH', `/stops/${STOP_1_ID}`)).toEqual({
          legKm: 145,
          legKmManual: false,
        });
      });
      expect(await bodyOf(fetchSpy, 'POST', '/maps/route-distance')).toEqual({
        originPlaceId: 'ChIJ-b',
        destinationPlaceId: 'ChIJ-a',
      });
      // The other stop's previous end changed too, but its leg is manual:
      // exactly one fetch fired and the manual stop was never patched.
      expect(requestsOf(fetchSpy, 'POST', '/maps/route-distance')).toHaveLength(
        1,
      );
      expect(requestsOf(fetchSpy, 'PATCH', `/stops/${STOP_2_ID}`)).toHaveLength(
        0,
      );
    });

    it('recalculates the leg of the stop that moves up on delete', async () => {
      const second: StopRead = {
        ...stop2,
        placeId: 'ChIJ-b',
        legKm: 200,
        legKmManual: false,
      };
      fetchSpy = stubFetch({
        trips: [
          {
            ...trip,
            startPlaceId: 'ChIJ-home',
            stops: [{ ...stop1, placeId: 'ChIJ-a' }, second],
          },
        ],
        legKm: 145,
      });
      renderScreen();
      await clickDeleteStop(0);

      await waitFor(async () => {
        expect(await bodyOf(fetchSpy, 'PATCH', `/stops/${STOP_2_ID}`)).toEqual({
          legKm: 145,
          legKmManual: false,
        });
      });
      expect(await bodyOf(fetchSpy, 'POST', '/maps/route-distance')).toEqual({
        originPlaceId: 'ChIJ-home',
        destinationPlaceId: 'ChIJ-b',
      });
    });

    it('skips arrived stops in automatic recalculation', async () => {
      const second: StopRead = {
        ...stop2,
        placeId: 'ChIJ-b',
        legKm: 200,
        legKmManual: false,
        arrived: true,
      };
      fetchSpy = stubFetch({
        trips: [
          {
            ...trip,
            startPlaceId: 'ChIJ-home',
            stops: [{ ...stop1, placeId: 'ChIJ-a' }, second],
          },
        ],
      });
      renderScreen();
      await clickDeleteStop(0);

      await waitFor(() => {
        expect(requestsOf(fetchSpy, 'DELETE', '/stops/')).toHaveLength(1);
      });
      // Let any (wrong) recalculation fire before asserting there was none.
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(requestsOf(fetchSpy, 'POST', '/maps/route-distance')).toHaveLength(
        0,
      );
    });

    it('refills the first stop’s leg when the trip’s start place changes', async () => {
      fetchSpy = stubFetch({
        trips: [
          {
            ...trip,
            startPlaceId: 'ChIJ-home',
            stops: [{ ...stop1, placeId: 'ChIJ-a' }],
          },
        ],
        legKm: 235,
      });
      renderScreen();
      fireEvent.change(await screen.findByLabelText(/Start point/), {
        target: { value: 'killb' },
      });
      const option = await screen.findByRole('option', {
        name: 'Killbear Provincial Park, Nobel, ON',
      });
      fireEvent.click(option);
      fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));

      await waitFor(async () => {
        expect(await bodyOf(fetchSpy, 'PATCH', `/stops/${STOP_1_ID}`)).toEqual({
          legKm: 235,
          legKmManual: false,
        });
      });
      expect(await bodyOf(fetchSpy, 'POST', '/maps/route-distance')).toEqual({
        originPlaceId: 'ChIJ-killbear',
        destinationPlaceId: 'ChIJ-a',
      });
    });

    it('refills the next stop’s leg when a stop’s place changes', async () => {
      const second: StopRead = {
        ...stop2,
        placeId: 'ChIJ-b',
        legKm: 200,
        legKmManual: false,
      };
      fetchSpy = stubFetch({
        trips: [{ ...trip, stops: [stop1, second] }],
        legKm: 305,
      });
      renderScreen();
      await openStopForm(0);
      fireEvent.change(screen.getByLabelText(/Campground/), {
        target: { value: 'killb' },
      });
      const option = await screen.findByRole('option', {
        name: 'Killbear Provincial Park, Nobel, ON',
      });
      fireEvent.click(option);
      fireEvent.click(screen.getByRole('button', { name: 'Save stop' }));

      await waitFor(async () => {
        expect(await bodyOf(fetchSpy, 'PATCH', `/stops/${STOP_2_ID}`)).toEqual({
          legKm: 305,
          legKmManual: false,
        });
      });
      expect(await bodyOf(fetchSpy, 'POST', '/maps/route-distance')).toEqual({
        originPlaceId: 'ChIJ-killbear',
        destinationPlaceId: 'ChIJ-b',
      });
    });

    describe('missing-place message', () => {
      it('names the stop’s missing place', async () => {
        fetchSpy = stubFetch({
          trips: [{ ...trip, startPlaceId: 'ChIJ-home' }],
        });
        renderScreen();
        await openStopForm(0);

        expect(
          screen.getByText(
            'To fetch the distance, pick this stop’s campground from Google suggestions.',
          ),
        ).toBeTruthy();
      });

      it('names the previous end’s missing place', async () => {
        fetchSpy = stubFetch({
          trips: [{ ...trip, stops: [{ ...stop1, placeId: 'ChIJ-a' }] }],
        });
        renderScreen();
        await openStopForm(0);

        expect(
          screen.getByText(
            'To fetch the distance, pick the previous point (the stop before it, or the trip’s start point) from Google suggestions.',
          ),
        ).toBeTruthy();
      });

      it('names both missing places', async () => {
        fetchSpy = stubFetch({ trips: [trip] });
        renderScreen();
        await openStopForm(0);

        expect(
          screen.getByText(
            'To fetch the distance, pick this stop’s campground and the previous point (the stop before it, or the trip’s start point) from Google suggestions.',
          ),
        ).toBeTruthy();
      });
    });
  });
});
