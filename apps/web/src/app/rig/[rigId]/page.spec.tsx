import {
  TripReadSchema,
  tripStatus,
  type Owner,
  type Rig,
  type TripRead,
} from '@rv-checklist/domain';
import { render, screen, within } from '@testing-library/react';
import { formatIsoDate } from '../../dates';
import { StoreProvider } from '../../store-provider';
import RigHomePage from './page';
import {
  fetchLogEntriesByRig,
  fetchMe,
  fetchRigs,
  fetchTasks,
  fetchTripsByRig,
} from '@/lib/server-api';

jest.mock('@/lib/server-api');

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

const mockFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;
const mockFetchRigs = fetchRigs as jest.MockedFunction<typeof fetchRigs>;
const mockFetchTasks = fetchTasks as jest.MockedFunction<typeof fetchTasks>;
const mockFetchLogEntriesByRig = fetchLogEntriesByRig as jest.MockedFunction<
  typeof fetchLogEntriesByRig
>;
const mockFetchTripsByRig = fetchTripsByRig as jest.MockedFunction<
  typeof fetchTripsByRig
>;

const RIG_ID = '550e8400-e29b-41d4-a716-446655440010';

function uuid(n: number): string {
  return `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
}

const owner: Owner = {
  id: uuid(1),
  email: 'owner@example.com',
  name: 'Jeff Owner',
};

const rig: Rig = {
  id: RIG_ID,
  ownerId: owner.id,
  nickname: 'Silver Bullet',
};

interface StopSeed {
  readonly position: number;
  readonly arrived: boolean;
  readonly campground?: string;
  readonly arrivalDate?: string;
}

/** A TripRead through the schema (attachments default, status derived). */
function makeTrip(
  base: number,
  name: string,
  stops: readonly StopSeed[],
): TripRead {
  const tripId = uuid(base);
  const fullStops = stops.map((s, index) => ({
    id: uuid(base + index + 1),
    tripId,
    ...s,
  }));
  return TripReadSchema.parse({
    id: tripId,
    rigId: RIG_ID,
    name,
    checklistIds: [],
    stops: fullStops,
    status: tripStatus(fullStops),
  });
}

async function renderPage(trips: readonly TripRead[]): Promise<void> {
  mockFetchTripsByRig.mockResolvedValue([...trips]);
  render(
    <StoreProvider>
      {await RigHomePage({ params: Promise.resolve({ rigId: RIG_ID }) })}
    </StoreProvider>,
  );
}

describe('RigHomePage current-trip card (issue #118)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchMe.mockResolvedValue(owner);
    mockFetchRigs.mockResolvedValue([rig]);
    mockFetchTasks.mockResolvedValue([]);
    mockFetchLogEntriesByRig.mockResolvedValue([]);
  });

  it('shows the underway trip with its next stop and arrival date', async () => {
    const planned = makeTrip(600, 'Spring Shakedown', [
      {
        position: 0,
        arrived: false,
        campground: 'Early Camp',
        arrivalDate: '2026-05-01',
      },
    ]);
    // Stops deliberately out of travel order in the payload — the next stop
    // is the first un-arrived one by position, not by array order.
    const underway = makeTrip(500, 'Fall Colours Loop', [
      {
        position: 1,
        arrived: false,
        campground: 'Killbear PP',
        arrivalDate: '2026-09-20',
      },
      {
        position: 0,
        arrived: true,
        campground: 'Halfway Rest',
        arrivalDate: '2026-09-18',
      },
    ]);
    await renderPage([planned, underway]);

    const card = screen.getByRole('link', { name: /fall colours loop/i });
    expect(card.getAttribute('href')).toBe(
      `/rig/${RIG_ID}/trips/${underway.id}`,
    );
    expect(within(card).getByText('Underway')).toBeTruthy();
    expect(within(card).getByText(/Killbear PP/)).toBeTruthy();
    const arrivalLabel = new RegExp(formatIsoDate('2026-09-20'));
    expect(within(card).getByText(arrivalLabel)).toBeTruthy();
    expect(mockFetchTripsByRig).toHaveBeenCalledWith(RIG_ID);
  });

  it('shows the earliest-start planned trip when nothing is underway', async () => {
    const later = makeTrip(600, 'Later Trip', [
      {
        position: 0,
        arrived: false,
        campground: 'October Camp',
        arrivalDate: '2026-10-01',
      },
    ]);
    const sooner = makeTrip(700, 'Sooner Trip', [
      {
        position: 0,
        arrived: false,
        campground: 'September Camp',
        arrivalDate: '2026-09-01',
      },
    ]);
    await renderPage([later, sooner]);

    const card = screen.getByRole('link', { name: /sooner trip/i });
    expect(card.getAttribute('href')).toBe(`/rig/${RIG_ID}/trips/${sooner.id}`);
    expect(within(card).getByText('Planned')).toBeTruthy();
    expect(within(card).getByText(/September Camp/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /later trip/i })).toBeNull();
  });

  it('renders no current-trip section when every trip is completed', async () => {
    const completed = makeTrip(500, 'Last Summer', [
      {
        position: 0,
        arrived: true,
        campground: 'Sandbanks PP',
        arrivalDate: '2025-07-10',
      },
    ]);
    await renderPage([completed]);

    expect(screen.queryByRole('region', { name: /current trip/i })).toBeNull();
    expect(screen.queryByText('Last Summer')).toBeNull();
  });

  it('renders no current-trip section when the rig has no trips', async () => {
    await renderPage([]);

    expect(screen.queryByRole('region', { name: /current trip/i })).toBeNull();
  });
});
