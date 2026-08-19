import type { TripRead } from '@rv-checklist/domain';
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

const created: TripRead = {
  id: TRIP_ID,
  rigId: RIG_ID,
  name: 'Fall Colours Loop',
  startLocation: 'Home — Newmarket, ON',
  checklistIds: [],
  stops: [],
  status: 'planned',
};

function renderScreen(): void {
  render(
    <StoreProvider>
      <NewTripScreen rigId={RIG_ID} />
    </StoreProvider>,
  );
}

describe('NewTripScreen (issue #114)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockClear();
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const request = input as Request;
      const url = new URL(request.url);
      if (request.method === 'POST' && url.pathname === '/trips') {
        return Promise.resolve(
          Response.json(created, {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      throw new Error(`Unstubbed request: ${request.method} ${url.pathname}`);
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /** The body of the POST /trips request the spy saw. */
  async function postedBody(): Promise<Record<string, unknown>> {
    const request = fetchSpy.mock.calls
      .map((call: readonly unknown[]) => call[0] as Request)
      .find((r) => r.method === 'POST');
    if (!request) throw new Error('No POST request');
    return (await request.clone().json()) as Record<string, unknown>;
  }

  it('creates the trip and navigates to its route', async () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'Fall Colours Loop' },
    });
    fireEvent.change(screen.getByLabelText(/Start point/), {
      target: { value: 'Home — Newmarket, ON' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(`/rig/${RIG_ID}/trips/${TRIP_ID}`);
    });
    expect(await postedBody()).toEqual({
      rigId: RIG_ID,
      name: 'Fall Colours Loop',
      startLocation: 'Home — Newmarket, ON',
      checklistIds: [],
    });
  });

  it('omits a blank start point from the create body', async () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: 'Fall Colours Loop' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
    expect(await postedBody()).toEqual({
      rigId: RIG_ID,
      name: 'Fall Colours Loop',
      checklistIds: [],
    });
  });

  it('does not submit without a name', () => {
    renderScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Create trip' }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('links back to the trips list', () => {
    renderScreen();

    const back = screen.getByRole('link', { name: /All trips/ });
    expect(back.getAttribute('href')).toBe(`/rig/${RIG_ID}/trips`);
  });
});
