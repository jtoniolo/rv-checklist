import {
  TripReadSchema,
  tripStatus,
  type Owner,
  type Rig,
  type TripRead,
} from '@rv-checklist/domain';
import { render, waitFor } from '@testing-library/react';
import { StoreProvider } from '../../store-provider';
import { RigShell } from './rig-shell';

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

jest.mock('next/navigation', () => ({
  usePathname: () => '/rig/550e8400-e29b-41d4-a716-446655440010',
  useRouter: () => ({ push: jest.fn() }),
}));

const RIG_ID = '550e8400-e29b-41d4-a716-446655440010';
const TRIP_ID = '550e8400-e29b-41d4-a716-446655440100';
const STOP_ID = '550e8400-e29b-41d4-a716-446655440101';
const STOP_B = '550e8400-e29b-41d4-a716-446655440102';

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: 'Jeff Owner',
};

const rig: Rig = {
  id: RIG_ID,
  ownerId: owner.id,
  nickname: 'Silver Bullet',
};

function underwayTrip(): TripRead {
  const stops = [
    {
      id: STOP_ID,
      tripId: TRIP_ID,
      position: 0,
      arrived: true,
      campground: 'Killbear PP',
    },
    {
      id: STOP_B,
      tripId: TRIP_ID,
      position: 1,
      arrived: false,
      campground: 'Bon Echo PP',
    },
  ];
  return TripReadSchema.parse({
    id: TRIP_ID,
    rigId: RIG_ID,
    name: 'Fall Colours Loop',
    checklistIds: [],
    stops,
    status: tripStatus(stops),
  });
}

function jsonResponse(data: unknown): Response {
  return Response.json(data, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * current-trip warming's client trigger (ADR-0028, issue #151): the shell
 * mounts on every rig-scoped route, so it is where triggers (a)/(b) — read
 * off the same trips query the dashboard reads — and (c) — "app open while
 * online", i.e. this component's own mount — all live.
 */
describe('RigShell current-trip warming (issue #151)', () => {
  let fetchSpy: jest.SpyInstance;
  let postMessage: jest.Mock;

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        if (url.pathname === '/me') return Promise.resolve(jsonResponse(owner));
        if (url.pathname === '/rigs')
          return Promise.resolve(jsonResponse([rig]));
        if (url.pathname === '/trips') {
          return Promise.resolve(jsonResponse([underwayTrip()]));
        }
        throw new Error(`Unstubbed request: ${request.method} ${url.pathname}`);
      });

    postMessage = jest.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: { postMessage } },
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('warms the current trip once it loads', async () => {
    render(
      <StoreProvider>
        <RigShell rigId={RIG_ID}>
          <div>content</div>
        </RigShell>
      </StoreProvider>,
    );

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'rv-checklist/cache-trip',
          tripId: TRIP_ID,
        }),
      );
    });
  });
});
