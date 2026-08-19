import {
  TripReadSchema,
  tripStatus,
  type TripRead,
} from '@rv-checklist/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import { StoreProvider } from './store-provider';
import { TripsScreen } from './trips-screen';

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

const RIG_ID = '550e8400-e29b-41d4-a716-446655440010';

function uuid(n: number): string {
  return `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
}

interface StopSeed {
  readonly arrived: boolean;
  readonly arrivalDate?: string;
  readonly legKm?: number;
}

// Fixtures go through the schema so any later defaulted stop fields (e.g.
// issue #113's attachments) are filled in rather than breaking the fixture.
function makeTrip(
  n: number,
  name: string,
  seeds: readonly StopSeed[],
): TripRead {
  const id = uuid(n * 100);
  const stops = seeds.map((seed, index) => ({
    id: uuid(n * 100 + index + 1),
    tripId: id,
    position: index,
    arrived: seed.arrived,
    ...(seed.arrivalDate !== undefined && { arrivalDate: seed.arrivalDate }),
    ...(seed.legKm !== undefined && { legKm: seed.legKm }),
  }));
  return TripReadSchema.parse({
    id,
    rigId: RIG_ID,
    name,
    checklistIds: [],
    stops,
    status: tripStatus(stops),
  });
}

// Underway (one stop arrived) — the current trip, pinned on top.
const fallColours = makeTrip(1, 'Fall Colours Loop', [
  { arrived: true, arrivalDate: '2026-09-18', legKm: 96 },
  { arrived: false, arrivalDate: '2026-09-20', legKm: 174 },
]);
// Planned, earliest start — first of the planned trips.
const eastCoast = makeTrip(2, 'East Coast Swing', [
  { arrived: false, arrivalDate: '2026-10-01', legKm: 300 },
  { arrived: false, arrivalDate: '2026-10-05', legKm: 250 },
]);
const shakedown = makeTrip(3, 'Spring Shakedown', [
  { arrived: false, arrivalDate: '2027-04-10', legKm: 50 },
]);
// Planned with no dates — sorts after every dated planned trip.
const somedayBay = makeTrip(4, 'Someday Bay', [{ arrived: false }]);
// Completed — newest-first under year headings.
const summerLoop = makeTrip(5, 'Summer Loop', [
  { arrived: true, arrivalDate: '2025-08-01', legKm: 120 },
  { arrived: true, arrivalDate: '2025-08-10', legKm: 80 },
]);
const winterEscape = makeTrip(6, 'Winter Escape', [
  { arrived: true, arrivalDate: '2025-01-05', legKm: 400 },
]);
const maritimes = makeTrip(7, 'Maritimes Run', [
  { arrived: true, arrivalDate: '2024-09-01', legKm: 600 },
]);

const TRIP_NAMES = [
  'Fall Colours Loop',
  'East Coast Swing',
  'Spring Shakedown',
  'Someday Bay',
  'Summer Loop',
  'Winter Escape',
  'Maritimes Run',
];

function jsonResponse(data: unknown): Response {
  return Response.json(data, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function renderScreen(): void {
  render(
    <StoreProvider>
      <TripsScreen rigId={RIG_ID} />
    </StoreProvider>,
  );
}

/** The visible trip rows' names, in document order. */
function rowNames(): string[] {
  return screen
    .getAllByRole('link')
    .map((el) => TRIP_NAMES.find((name) => el.textContent.includes(name)))
    .filter((name): name is string => name !== undefined);
}

describe('TripsScreen (issue #114)', () => {
  let fetchSpy: jest.SpyInstance;
  // Deliberately shuffled: the screen owns the fixed order.
  let trips: TripRead[] = [];

  function fakeApi(request: Request): Response {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;
    if (route === 'GET /trips' && url.searchParams.get('rigId') === RIG_ID) {
      return jsonResponse(trips);
    }
    throw new Error(`Unstubbed request: ${route}${url.search}`);
  }

  beforeEach(() => {
    trips = [
      summerLoop,
      shakedown,
      fallColours,
      maritimes,
      somedayBay,
      eastCoast,
      winterEscape,
    ];
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) =>
        Promise.resolve(fakeApi(input as Request)),
      );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders one row per trip, linking to the trip route', async () => {
    renderScreen();

    const name = await screen.findByText('Fall Colours Loop');
    const row = name.closest('a');
    expect(row?.getAttribute('href')).toBe(
      `/rig/${RIG_ID}/trips/${fallColours.id}`,
    );
    expect(rowNames()).toHaveLength(7);
  });

  it('shows the metadata line: status, date range, stops, and km', async () => {
    renderScreen();

    const name = await screen.findByText('Fall Colours Loop');
    const row = name.closest('a');
    expect(row?.textContent).toContain('Underway');
    expect(row?.textContent).toContain('Sep 18 – Sep 20, 2026');
    expect(row?.textContent).toContain('2 stops');
    expect(row?.textContent).toContain('270 km');
  });

  it('shows "Dates TBD" for a trip with no stop dates', async () => {
    renderScreen();

    const name = await screen.findByText('Someday Bay');
    const row = name.closest('a');
    expect(row?.textContent).toContain('Dates TBD');
    expect(row?.textContent).toContain('1 stop');
  });

  it('orders rows: current trip, then planned by start date, then completed newest-first', async () => {
    renderScreen();
    await screen.findByText('Fall Colours Loop');

    expect(rowNames()).toEqual([
      'Fall Colours Loop',
      'East Coast Swing',
      'Spring Shakedown',
      'Someday Bay',
      'Summer Loop',
      'Winter Escape',
      'Maritimes Run',
    ]);
  });

  it('pins the earliest-starting planned trip when nothing is underway', async () => {
    trips = [shakedown, somedayBay, eastCoast, summerLoop];
    renderScreen();
    await screen.findByText('East Coast Swing');

    expect(rowNames()[0]).toBe('East Coast Swing');
  });

  it('groups completed trips under year headings', async () => {
    renderScreen();
    await screen.findByText('Summer Loop');

    expect(screen.getByRole('heading', { name: '2025' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '2024' })).toBeTruthy();
    // Upcoming trips get no year headings.
    expect(screen.queryByRole('heading', { name: '2026' })).toBeNull();
  });

  it('filters by status when a chip is pressed, and unfilters when released', async () => {
    renderScreen();
    await screen.findByText('Fall Colours Loop');

    const completedChip = screen.getByRole('button', { name: 'Completed' });
    fireEvent.click(completedChip);

    expect(rowNames()).toEqual([
      'Summer Loop',
      'Winter Escape',
      'Maritimes Run',
    ]);
    expect(completedChip.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(completedChip);
    expect(rowNames()).toHaveLength(7);
  });

  it('combines status chips additively', async () => {
    renderScreen();
    await screen.findByText('Fall Colours Loop');

    fireEvent.click(screen.getByRole('button', { name: 'Planned' }));
    fireEvent.click(screen.getByRole('button', { name: 'Underway' }));

    expect(rowNames()).toEqual([
      'Fall Colours Loop',
      'East Coast Swing',
      'Spring Shakedown',
      'Someday Bay',
    ]);
  });

  it('shows "No trips match." when the filter excludes everything', async () => {
    trips = [summerLoop];
    renderScreen();
    await screen.findByText('Summer Loop');

    fireEvent.click(screen.getByRole('button', { name: 'Planned' }));

    expect(screen.getByText('No trips match.')).toBeTruthy();
  });

  it('shows an empty state when the rig has no trips', async () => {
    trips = [];
    renderScreen();

    expect(
      await screen.findByText(
        'No trips yet — plan your first one for this rig.',
      ),
    ).toBeTruthy();
  });

  it('has a New trip link to the create route', async () => {
    renderScreen();
    await screen.findByText('Fall Colours Loop');

    const link = screen.getByRole('link', { name: 'New trip' });
    expect(link.getAttribute('href')).toBe(`/rig/${RIG_ID}/trips/new`);
  });
});
