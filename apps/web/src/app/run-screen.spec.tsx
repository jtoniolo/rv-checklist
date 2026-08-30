import type { Run } from '@rv-checklist/domain';
import {
  makeStore,
  resetApiState,
  seedSignedIn,
  seedRun,
} from '@rv-checklist/web-data-access';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  for (const store of stores) store.dispatch(resetApiState());
  stores.length = 0;
}

/**
 * The step-ops write among the screen's requests — the screen's reads are GETs, so the
 * one POST is the write under test, whenever RTK Query gets round to dispatching it.
 */
async function stepOpRequestOf(fetchSpy: jest.SpyInstance): Promise<Request> {
  let found: Request | undefined;
  await waitFor(() => {
    found = (fetchSpy.mock.calls as [Request][])
      .map(([request]) => request)
      .find((request) => request.method === 'POST');
    expect(found).toBeDefined();
  });
  if (found === undefined) {
    throw new Error('the screen made no step-ops request');
  }
  return found;
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

describe('RunScreen — seeded cache (ADR-0018 Pattern C, issue #135)', () => {
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

  it('renders step rows from the seeded RTK Query cache', async () => {
    renderWithSeededCache();

    expect(await screen.findByLabelText('Close roof vents')).toBeTruthy();
    expect(screen.getByLabelText('Hitch the sway bars')).toBeTruthy();
    expect(screen.getByText(/Check tire pressure/)).toBeTruthy();
  });

  it('shows the progress counter', async () => {
    renderWithSeededCache();

    expect(await screen.findByText('2 of 3')).toBeTruthy();
  });

  it('shows the checklist title', async () => {
    renderWithSeededCache();

    expect(
      await screen.findByRole('heading', { name: 'Pre-departure' }),
    ).toBeTruthy();
  });

  it('shows the started-on date', async () => {
    renderWithSeededCache();

    expect(await screen.findByText(/Jul 20, 2026/)).toBeTruthy();
  });

  it('navigates back when the exit button is clicked', async () => {
    renderWithSeededCache();

    fireEvent.click(
      await screen.findByRole('button', { name: '← Back to checklist' }),
    );

    expect(mockExit).toHaveBeenCalledTimes(1);
  });

  it('renders a completed run as "All done"', async () => {
    const doneRun: Run = {
      ...run,
      steps: run.steps.map((s) => ({ ...s, state: 'complete' as const })),
    };
    renderWithSeededCache(doneRun);

    expect(await screen.findByText('All done ✓')).toBeTruthy();
  });

  it('renders skipped steps with the "skipped" label', async () => {
    renderWithSeededCache();

    expect(
      await screen.findByText(/Check tire pressure — skipped/),
    ).toBeTruthy();
  });

  // ADR-0030, issue #144. The point of the shape is what the request *leaves out*:
  // a tap says "this step, at this moment" and nothing about the other two, so it
  // can never roll back work another device did on them.
  describe('persisting a tap as a step operation', () => {
    it('posts a single-step operation to the step-ops endpoint', async () => {
      renderWithSeededCache();

      fireEvent.click(await screen.findByLabelText('Close roof vents'));

      const request = await stepOpRequestOf(fetchSpy);
      expect(request.url).toMatch(new RegExp(`/runs/${run.id}/step-ops$`));
      await expect(request.json()).resolves.toEqual({
        ops: [
          {
            stepId: run.steps[0]?.id,
            state: 'complete',
            editedAt: expect.any(String) as unknown,
          },
        ],
      });
    });

    it('names only the step the user tapped', async () => {
      renderWithSeededCache();

      // Resolved rows sink below the still-to-do one, so the first Skip control
      // on screen belongs to "Close roof vents".
      const [skip] = await screen.findAllByRole('button', { name: 'Skip' });
      if (skip === undefined) {
        throw new Error('the run rendered no Skip control');
      }
      fireEvent.click(skip);

      const request = await stepOpRequestOf(fetchSpy);
      const body = (await request.json()) as {
        ops: { stepId: string; state: string }[];
      };
      expect(body.ops).toHaveLength(1);
      expect(body.ops[0]).toMatchObject({
        stepId: run.steps[0]?.id,
        state: 'skipped',
      });
    });
  });
});
