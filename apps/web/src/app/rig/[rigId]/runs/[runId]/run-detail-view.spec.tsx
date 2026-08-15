import type { Run } from '@rv-checklist/domain';
import { makeStore, seedSignedIn } from '@rv-checklist/web-data-access';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { RunDetailView } from './run-detail-view';

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
  ],
};

function renderView(initialRun: Run = run): void {
  const store = makeStore();
  seedSignedIn(store);
  render(
    <Provider store={store}>
      <RunDetailView
        rigId={RIG_ID}
        runId={run.id}
        checklistId={CHECKLIST_ID}
        title="Pre-departure"
        initialRun={initialRun}
      />
    </Provider>,
  );
}

describe('RunDetailView (issue #58)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No network'));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    localStorage.clear();
    mockPush.mockClear();
  });

  it('renders step rows from the initial run', () => {
    renderView();

    expect(screen.getByLabelText('Close roof vents')).toBeTruthy();
    expect(screen.getByLabelText('Hitch the sway bars')).toBeTruthy();
  });

  it('shows progress and title', () => {
    renderView();

    expect(screen.getByRole('heading', { name: 'Pre-departure' })).toBeTruthy();
    expect(screen.getByText('1 of 2')).toBeTruthy();
  });

  it('navigates to the checklist route when the back button is clicked', () => {
    renderView();

    fireEvent.click(
      screen.getByRole('button', { name: '← Back to checklist' }),
    );

    expect(mockPush).toHaveBeenCalledWith(
      `/rig/${RIG_ID}/checklists/${CHECKLIST_ID}`,
    );
  });

  it('renders a deep-linked run with all step rows visible', () => {
    const deepLinkedRun: Run = {
      ...run,
      steps: [
        ...run.steps,
        {
          id: '550e8400-e29b-41d4-a716-446655440043',
          text: 'Check tire pressure',
          state: 'incomplete',
        },
      ],
    };
    renderView(deepLinkedRun);

    expect(screen.getByLabelText('Close roof vents')).toBeTruthy();
    expect(screen.getByLabelText('Hitch the sway bars')).toBeTruthy();
    expect(screen.getByLabelText('Check tire pressure')).toBeTruthy();
    expect(screen.getByText('1 of 3')).toBeTruthy();
  });
});
