import type { PlaceSuggestion, TripRead } from '@rv-checklist/domain';
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
];

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'content-type': 'application/json' },
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
    if (request.method === 'POST' && url.pathname === '/trips') {
      return Promise.resolve(jsonResponse(created, 201));
    }
    throw new Error(`Unstubbed request: ${request.method} ${url.pathname}`);
  });
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
});
