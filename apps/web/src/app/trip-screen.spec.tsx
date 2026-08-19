import {
  TripReadSchema,
  tripStatus,
  type Checklist,
  type Run,
  type StopRead,
  type TripRead,
} from '@rv-checklist/domain';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { StoreProvider } from './store-provider';
import { TripScreen } from './trip-screen';

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

function uuid(n: number): string {
  return `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
}

const STOP_HOME = uuid(101); // arrived rest stop
const STOP_KILLBEAR = uuid(102); // the next un-arrived stop — the hero
const STOP_MCRAE = uuid(103); // a later stop with only a campground name
const CHECKLIST_DEPARTURE = uuid(201); // linked to the trip
const CHECKLIST_ARRIVAL = uuid(202); // the rig's, not linked
const RUN_ID = uuid(301);
const NEW_RUN_ID = uuid(302);

/** The trip's stops in travel order — deliberately shuffled in the payload. */
function makeStops(arrived: readonly boolean[]): StopRead[] {
  const [home = false, killbear = false, mcrae = false] = arrived;
  return [
    {
      id: STOP_MCRAE,
      tripId: TRIP_ID,
      position: 2,
      arrived: mcrae,
      campground: 'McRae Point PP',
      arrivalDate: '2026-09-24',
      legKm: 96,
      attachments: [],
    },
    {
      id: STOP_HOME,
      tripId: TRIP_ID,
      position: 0,
      arrived: home,
      campground: 'Halfway Rest',
      arrivalDate: '2026-09-18',
      legKm: 120,
      attachments: [],
    },
    {
      id: STOP_KILLBEAR,
      tripId: TRIP_ID,
      position: 1,
      arrived: killbear,
      campground: 'Killbear PP',
      placeId: 'ChIJkillbear',
      campsite: 'Site 402',
      arrivalDate: '2026-09-20',
      nights: 3,
      checkInTime: 'After 2pm',
      bookingNumber: 'ON-12345',
      costCents: 14_250,
      address: '35 Killbear Park Rd, Nobel, ON',
      phone: '705-342-5492',
      notes: 'Gate code 4417',
      legKm: 174,
      attachments: [],
    },
  ];
}

function makeTrip(arrived: readonly boolean[]): TripRead {
  const stops = makeStops(arrived);
  return TripReadSchema.parse({
    id: TRIP_ID,
    rigId: RIG_ID,
    name: 'Fall Colours Loop',
    startLocation: 'Home — Newmarket, ON',
    checklistIds: [CHECKLIST_DEPARTURE],
    stops,
    status: tripStatus(stops),
  });
}

const checklists: Checklist[] = [
  {
    id: CHECKLIST_DEPARTURE,
    rigId: RIG_ID,
    name: 'Departure checklist',
    tags: [],
    steps: [],
  },
  {
    id: CHECKLIST_ARRIVAL,
    rigId: RIG_ID,
    name: 'Arrival checklist',
    tags: [],
    steps: [],
  },
];

const tripRun: Run = {
  id: RUN_ID,
  checklistId: CHECKLIST_DEPARTURE,
  rigId: RIG_ID,
  tripId: TRIP_ID,
  startedOn: '2026-09-18',
  steps: [
    { id: uuid(401), text: 'Hitch up', state: 'complete' },
    { id: uuid(402), text: 'Check lights', state: 'incomplete' },
  ],
};

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderScreen(): void {
  render(
    <StoreProvider>
      <TripScreen rigId={RIG_ID} tripId={TRIP_ID} />
    </StoreProvider>,
  );
}

describe('TripScreen (issue #116)', () => {
  let fetchSpy: jest.SpyInstance;
  let trip: TripRead;
  let runs: Run[];

  async function fakeApi(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    if (route === 'GET /trips' && url.searchParams.get('rigId') === RIG_ID) {
      return jsonResponse([trip]);
    }
    if (
      route === 'GET /checklists' &&
      url.searchParams.get('rigId') === RIG_ID
    ) {
      return jsonResponse(checklists);
    }
    if (route === 'GET /runs' && url.searchParams.get('tripId') === TRIP_ID) {
      return jsonResponse(runs);
    }
    const arrivalMatch = /^POST \/stops\/(?<id>[^/]+)\/arrival$/.exec(route);
    if (arrivalMatch?.groups) {
      const stopId = arrivalMatch.groups['id'];
      const { arrived } = (await request.clone().json()) as {
        arrived: boolean;
      };
      const stops = trip.stops.map((s) =>
        s.id === stopId ? { ...s, arrived } : s,
      );
      trip = { ...trip, stops, status: tripStatus(stops) };
      const stop = stops.find((s) => s.id === stopId);
      return jsonResponse(stop);
    }
    if (route === 'POST /runs') {
      const body = (await request.clone().json()) as {
        checklistId: string;
        tripId?: string;
      };
      const created: Run = {
        id: NEW_RUN_ID,
        checklistId: body.checklistId,
        rigId: RIG_ID,
        ...(body.tripId !== undefined && { tripId: body.tripId }),
        startedOn: '2026-09-20',
        steps: [],
      };
      runs = [...runs, created];
      return jsonResponse(created, 201);
    }
    if (route === `PATCH /trips/${TRIP_ID}`) {
      const changes = (await request.clone().json()) as {
        checklistIds?: string[];
      };
      trip = { ...trip, ...changes };
      return jsonResponse(trip);
    }
    throw new Error(`Unstubbed request: ${route}${url.search}`);
  }

  beforeEach(() => {
    mockPush.mockClear();
    trip = makeTrip([true, false, false]);
    runs = [tripRun];
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => fakeApi(input as Request));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /** The body of the request the spy saw for a method + path. */
  async function sentBody(
    method: string,
    path: string,
  ): Promise<Record<string, unknown>> {
    const request = fetchSpy.mock.calls
      .map((call: readonly unknown[]) => call[0] as Request)
      .find((r) => r.method === method && new URL(r.url).pathname === path);
    if (!request) throw new Error(`No ${method} ${path} request`);
    return (await request.clone().json()) as Record<string, unknown>;
  }

  it('shows the first un-arrived stop as the hero with its populated fields', async () => {
    renderScreen();

    expect(
      await screen.findByRole('heading', { name: 'Killbear PP' }),
    ).toBeTruthy();
    const hero = screen.getByLabelText('Next stop');
    expect(hero.textContent).toContain('Site 402');
    expect(hero.textContent).toContain('After 2pm');
    expect(hero.textContent).toContain('3'); // nights
    expect(hero.textContent).toContain('ON-12345');
    expect(hero.textContent).toContain('$142.50');
    expect(hero.textContent).toContain('35 Killbear Park Rd, Nobel, ON');
    expect(hero.textContent).toContain('705-342-5492');
    expect(hero.textContent).toContain('Gate code 4417');
    // Unset fields are simply absent — Killbear has no check-out time.
    expect(hero.textContent).not.toContain('Check-out');
  });

  it('links navigation to Google Maps directions when the stop has a place ID', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });

    const link = screen.getByRole('link', { name: /Navigate/ });
    expect(link.getAttribute('href')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Killbear%20PP&destination_place_id=ChIJkillbear',
    );
  });

  it('omits the navigation link when the stop has no place ID', async () => {
    trip = makeTrip([true, true, false]); // hero advances to McRae (no placeId)
    renderScreen();

    await screen.findByRole('heading', { name: 'McRae Point PP' });
    expect(screen.queryByRole('link', { name: /Navigate/ })).toBeNull();
  });

  it('links the start point to its Google place when the trip has a start place (issue #122)', async () => {
    trip = { ...trip, startPlaceId: 'ChIJhome' };
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });

    // Both the "From …" header line and the route list's Start row link.
    const links = screen.getAllByRole('link', {
      name: 'Home — Newmarket, ON',
    });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.getAttribute('href')).toBe(
        'https://www.google.com/maps/search/?api=1&query=Home%20%E2%80%94%20Newmarket%2C%20ON&query_place_id=ChIJhome',
      );
      expect(link.getAttribute('target')).toBe('_blank');
    }
  });

  it('renders the start point as plain text when the trip has no start place (issue #122)', async () => {
    renderScreen(); // the default fixture is a legacy text-only start point
    await screen.findByRole('heading', { name: 'Killbear PP' });

    expect(screen.getByText('From Home — Newmarket, ON')).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: 'Home — Newmarket, ON' }),
    ).toBeNull();
  });

  it('marks the hero stop arrived and advances the hero', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Mark arrived (+174 km)' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'McRae Point PP' }),
    ).toBeTruthy();
    expect(await sentBody('POST', `/stops/${STOP_KILLBEAR}/arrival`)).toEqual({
      arrived: true,
    });
  });

  it('undoes an arrival from the route list', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });

    const route = screen.getByLabelText('Route');
    expect(route.textContent).toContain('Home — Newmarket, ON'); // start point on top
    // Undo is offered from the hero too (the last arrival).
    const hero = screen.getByLabelText('Next stop');
    expect(
      within(hero).getByRole('button', { name: /Undo.*Halfway Rest/ }),
    ).toBeTruthy();
    fireEvent.click(
      within(route).getByRole('button', { name: /Undo.*Halfway Rest/ }),
    );

    // The whole trip is un-arrived, so the hero backs up to the first stop.
    expect(
      await screen.findByRole('heading', { name: 'Halfway Rest' }),
    ).toBeTruthy();
    expect(await sentBody('POST', `/stops/${STOP_HOME}/arrival`)).toEqual({
      arrived: false,
    });
  });

  it('replaces the hero with a trip summary when the trip is completed', async () => {
    trip = makeTrip([true, true, true]);
    renderScreen();

    const summary = await screen.findByLabelText('Trip summary');
    expect(summary.textContent).toContain('Sep 18, 2026');
    expect(summary.textContent).toContain('Sep 24, 2026');
    expect(summary.textContent).toContain('390 km');
    expect(screen.queryByRole('button', { name: /Mark arrived/ })).toBeNull();
  });

  it('starts a trip-linked run from a checklist chip and navigates to it', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Departure checklist' }),
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        `/rig/${RIG_ID}/runs/${NEW_RUN_ID}`,
      );
    });
    expect(await sentBody('POST', '/runs')).toEqual({
      checklistId: CHECKLIST_DEPARTURE,
      tripId: TRIP_ID,
    });
  });

  it('manages the trip’s checklist links, replacing the whole set', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });

    fireEvent.click(screen.getByRole('button', { name: 'Manage checklists' }));
    fireEvent.click(screen.getByRole('button', { name: 'Arrival checklist' }));

    await waitFor(async () => {
      expect(await sentBody('PATCH', `/trips/${TRIP_ID}`)).toEqual({
        checklistIds: [CHECKLIST_DEPARTURE, CHECKLIST_ARRIVAL],
      });
    });
  });

  it('lists the trip’s runs as progress cards linking to the run screen', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });

    const card = screen
      .getAllByRole('link')
      .find((el) => el.textContent.includes('Departure checklist'));
    expect(card?.getAttribute('href')).toBe(`/rig/${RIG_ID}/runs/${RUN_ID}`);
    expect(card?.textContent).toContain('1 of 2');
  });

  it('links to the trip editor route', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Killbear PP' });

    const link = screen.getByRole('link', { name: 'Edit trip' });
    expect(link.getAttribute('href')).toBe(
      `/rig/${RIG_ID}/trips/${TRIP_ID}/edit`,
    );
  });
});
