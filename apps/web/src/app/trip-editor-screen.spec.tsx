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
}

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Route every request the screen can make to canned data (house style). */
function stubFetch({ trips, legKm = 145 }: StubOptions): jest.SpyInstance {
  return jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const request = input as Request;
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/trips') {
      return Promise.resolve(jsonResponse(trips));
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

      expect((await screen.findByRole('alert')).textContent).toMatch(
        /last stop.*Delete the trip instead/i,
      );
      const deleteRequests = fetchSpy.mock.calls
        .map((call: readonly unknown[]) => call[0] as Request)
        .filter((r) => r.method === 'DELETE');
      expect(deleteRequests).toHaveLength(0);
    });

    it('still deletes a stop while others remain', async () => {
      fetchSpy = stubFetch({ trips: [trip] });
      renderScreen();

      const deleteButtons = await screen.findAllByRole('button', {
        name: 'Delete',
      });
      fireEvent.click(deleteButtons[0] as HTMLElement);

      await waitFor(() => {
        const deleteRequests = fetchSpy.mock.calls
          .map((call: readonly unknown[]) => call[0] as Request)
          .filter((r) => r.method === 'DELETE');
        expect(deleteRequests).toHaveLength(1);
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

      expect((await screen.findByRole('alert')).textContent).toMatch(
        /pick the start point/i,
      );
      const patches = fetchSpy.mock.calls
        .map((call: readonly unknown[]) => call[0] as Request)
        .filter(
          (r) =>
            r.method === 'PATCH' && new URL(r.url).pathname.startsWith('/trips'),
        );
      expect(patches).toHaveLength(0);
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
});
