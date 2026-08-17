import type { Run } from '@rv-checklist/domain';
import {
  api,
  makeStore,
  seedSignedIn,
  seedRun,
} from '@rv-checklist/web-data-access';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { RunScreen } from './run-screen';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const RIG_ID = '550e8400-e29b-41d4-a716-446655440010';
const CHECKLIST_ID = '550e8400-e29b-41d4-a716-446655440020';

const run: Run = {
  id: '550e8400-e29b-41d4-a716-446655440040',
  checklistId: CHECKLIST_ID,
  rigId: RIG_ID,
  startedOn: '2026-07-20',
  steps: [
    {
      id: '550e8400-e29b-41d4-a716-446655440041',
      text: 'Close roof vents',
      state: 'incomplete',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440042',
      text: 'Hitch the sway bars',
      state: 'complete',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440043',
      text: 'Check tire pressure',
      state: 'skipped',
    },
  ],
};

const mockExit = jest.fn();

// Every unsubscribe on unmount arms RTK Query's 60s keepUnusedDataFor
// eviction timer; resetting each store in afterEach clears them so in-band
// Jest can exit.
const stores: ReturnType<typeof makeStore>[] = [];

function trackedStore(): ReturnType<typeof makeStore> {
  const store = makeStore();
  stores.push(store);
  return store;
}

function resetStores(): void {
  for (const store of stores) store.dispatch(api.util.resetApiState());
  stores.length = 0;
}

function renderWithInitialRun(initialRun: Run = run): void {
  const store = trackedStore();
  seedSignedIn(store);
  render(
    <Provider store={store}>
      <RunScreen
        runId={initialRun.id}
        title="Pre-departure"
        initialRun={initialRun}
        onExit={mockExit}
      />
    </Provider>,
  );
}

function renderWithSeededCache(seedData: Run = run): void {
  const store = trackedStore();
  seedSignedIn(store);
  seedRun(store, seedData.id, seedData);
  render(
    <Provider store={store}>
      <RunScreen runId={seedData.id} title="Pre-departure" onExit={mockExit} />
    </Provider>,
  );
}

describe('RunScreen — initialRun (SSR path)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No network'));
  });

  afterEach(() => {
    resetStores();
    fetchSpy.mockRestore();
    localStorage.clear();
    mockExit.mockClear();
  });

  it('renders step rows from the server-provided initialRun', () => {
    renderWithInitialRun();

    expect(screen.getByLabelText('Close roof vents')).toBeTruthy();
    expect(screen.getByLabelText('Hitch the sway bars')).toBeTruthy();
    expect(screen.getByText(/Check tire pressure/)).toBeTruthy();
  });

  it('shows the progress counter', () => {
    renderWithInitialRun();

    expect(screen.getByText('2 of 3')).toBeTruthy();
  });

  it('shows the checklist title', () => {
    renderWithInitialRun();

    expect(screen.getByRole('heading', { name: 'Pre-departure' })).toBeTruthy();
  });

  it('shows the started-on date', () => {
    renderWithInitialRun();

    expect(screen.getByText(/Jul 20, 2026/)).toBeTruthy();
  });

  it('does not show the loading message when initialRun is provided', () => {
    renderWithInitialRun();

    expect(screen.queryByText('Loading run…')).toBeNull();
  });

  it('navigates back when the exit button is clicked', () => {
    renderWithInitialRun();

    fireEvent.click(
      screen.getByRole('button', { name: '← Back to checklist' }),
    );

    expect(mockExit).toHaveBeenCalledTimes(1);
  });

  it('renders a completed run as "All done"', () => {
    const doneRun: Run = {
      ...run,
      steps: run.steps.map((s) => ({ ...s, state: 'complete' as const })),
    };
    renderWithInitialRun(doneRun);

    expect(screen.getByText('All done ✓')).toBeTruthy();
  });

  it('renders skipped steps with the "skipped" label', () => {
    renderWithInitialRun();

    expect(screen.getByText(/Check tire pressure — skipped/)).toBeTruthy();
  });
});

describe('RunScreen — seeded cache (no initialRun)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No network'));
  });

  afterEach(() => {
    resetStores();
    fetchSpy.mockRestore();
    localStorage.clear();
    mockExit.mockClear();
  });

  it('renders steps from the seeded RTK Query cache', async () => {
    renderWithSeededCache();

    expect(await screen.findByLabelText('Close roof vents')).toBeTruthy();
    expect(screen.getByLabelText('Hitch the sway bars')).toBeTruthy();
    expect(screen.getByText(/Check tire pressure/)).toBeTruthy();
  });

  it('shows progress from the seeded cache', async () => {
    renderWithSeededCache();

    expect(await screen.findByText('2 of 3')).toBeTruthy();
  });
});
