import type { LogEntry, MaintenanceTask, Rig } from '@rv-checklist/domain';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MaintenanceScreen } from './maintenance-screen';
import { StoreProvider } from './store-provider';

/**
 * The maintenance screen, redesigned (issue #38): a single-column searchable
 * task list with sort, filter, and full-page drill-in detail. Tests cover the
 * list interactions (search / sort / filter), the list↔detail navigation, and
 * that the detail shows everything without an Edit click.
 */

const rig: Rig = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  ownerId: '550e8400-e29b-41d4-a716-446655440001',
  nickname: 'Silver Bullet',
  distanceKm: 42_000,
};

const OIL_ID = '550e8400-e29b-41d4-a716-446655440050';
const TIRE_ID = '550e8400-e29b-41d4-a716-446655440051';

const tasks: MaintenanceTask[] = [
  {
    id: OIL_ID,
    rigId: rig.id,
    name: 'Oil change',
    description: 'Full synthetic 5W-30. Warm the engine first.',
    interval: { months: 12 },
    fieldSchema: [
      { name: 'Brand', type: 'text', required: false },
      { name: 'Quantity', type: 'number', unit: 'L', required: false },
    ],
  },
  {
    id: TIRE_ID,
    rigId: rig.id,
    name: 'Tire rotation',
    description: 'Front-to-back rotation.',
    interval: { km: 10_000 },
    fieldSchema: [],
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440052',
    rigId: rig.id,
    name: 'Fix loose trim',
    oneTime: true,
    fieldSchema: [],
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440053',
    rigId: rig.id,
    name: 'Wax exterior',
    fieldSchema: [],
  },
];

const TASK_NAMES = [
  'Oil change',
  'Tire rotation',
  'Fix loose trim',
  'Wax exterior',
];

const entries: LogEntry[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440060',
    taskId: OIL_ID,
    rigId: rig.id,
    taskName: 'Oil change',
    performedOn: '2025-06-01',
    distanceKm: 31_200,
    fields: [
      { name: 'Brand', type: 'text', required: false, value: 'Mobil 1' },
      {
        name: 'Quantity',
        type: 'number',
        unit: 'L',
        required: false,
        value: 5.7,
      },
    ],
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440061',
    taskId: TIRE_ID,
    rigId: rig.id,
    taskName: 'Tire rotation',
    performedOn: '2026-07-01',
    distanceKm: 40_000,
    fields: [],
  },
];

function jsonResponse(data: unknown): Response {
  return Response.json(data, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeApi(request: Request): Response {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;

  if (route === 'GET /tasks') return jsonResponse(tasks);
  if (route === 'GET /log-entries') {
    const taskId = url.searchParams.get('taskId');
    if (taskId) {
      return jsonResponse(entries.filter((e) => e.taskId === taskId));
    }
    return jsonResponse(entries);
  }
  if (route === 'GET /checklists') return jsonResponse([]);

  throw new Error(`Unstubbed request: ${route}${url.search}`);
}

function renderScreen(openTaskId?: string): {
  onOpenTask: jest.Mock;
  onBackToList: jest.Mock;
} {
  const onOpenTask = jest.fn();
  const onBackToList = jest.fn();
  render(
    <StoreProvider>
      <MaintenanceScreen
        activeRig={rig}
        openTaskId={openTaskId}
        onOpenTask={onOpenTask}
        onOpenChecklist={jest.fn()}
        onBackToList={onBackToList}
        onGoRig={jest.fn()}
      />
    </StoreProvider>,
  );
  return { onOpenTask, onBackToList };
}

/** The first button whose visible text includes a given task name. */
function taskRow(name: string): HTMLElement {
  const row = screen
    .getAllByRole('button')
    .find((btn) => btn.textContent.includes(name));
  if (!row) throw new Error(`No task row found for "${name}"`);
  return row;
}

describe('MaintenanceScreen (issue #38)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    localStorage.setItem('rv.accessToken', 'access-1');
    localStorage.setItem('rv.refreshToken', 'refresh-1');
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) =>
        Promise.resolve(fakeApi(input as Request)),
      );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    localStorage.clear();
  });

  it('renders all tasks in a single-column list', async () => {
    renderScreen();

    expect(await screen.findByText('Oil change')).toBeTruthy();
    expect(screen.getByText('Tire rotation')).toBeTruthy();
    expect(screen.getByText('Fix loose trim')).toBeTruthy();
    expect(screen.getByText('Wax exterior')).toBeTruthy();
  });

  it('has a search box, sort controls, and a one-time filter', async () => {
    renderScreen();

    await screen.findByText('Oil change');
    expect(screen.getByLabelText('Search tasks')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Due' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Last performed' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'One-time' })).toBeTruthy();
  });

  it('filters the list by task name when searching', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    fireEvent.change(screen.getByLabelText('Search tasks'), {
      target: { value: 'oil' },
    });

    expect(screen.getByText('Oil change')).toBeTruthy();
    expect(screen.queryByText('Tire rotation')).toBeNull();
    expect(screen.queryByText('Fix loose trim')).toBeNull();
    expect(screen.queryByText('Wax exterior')).toBeNull();
  });

  it('filters the list by description when searching', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    fireEvent.change(screen.getByLabelText('Search tasks'), {
      target: { value: 'synthetic' },
    });

    expect(screen.getByText('Oil change')).toBeTruthy();
    expect(screen.queryByText('Tire rotation')).toBeNull();
  });

  it('shows "No tasks match." when the search yields nothing', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    fireEvent.change(screen.getByLabelText('Search tasks'), {
      target: { value: 'zzz-no-match' },
    });

    expect(screen.getByText('No tasks match.')).toBeTruthy();
  });

  it('filters to one-time tasks only when the toggle is pressed', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    fireEvent.click(screen.getByRole('button', { name: 'One-time' }));

    expect(screen.getByText('Fix loose trim')).toBeTruthy();
    expect(screen.queryByText('Oil change')).toBeNull();
    expect(screen.queryByText('Tire rotation')).toBeNull();
    expect(screen.queryByText('Wax exterior')).toBeNull();
  });

  it('sorts alphabetically by name', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    fireEvent.click(screen.getByRole('button', { name: 'Name' }));

    const buttons = screen
      .getAllByRole('button')
      .filter((btn) =>
        TASK_NAMES.some((name) => btn.textContent.includes(name)),
      );
    const ordered = buttons.map((btn) => btn.textContent.trim());
    // Alphabetical: Fix loose trim, Oil change, Tire rotation, Wax exterior
    expect(ordered[0]).toContain('Fix loose trim');
    expect(ordered[1]).toContain('Oil change');
  });

  it('selects a task and the parent receives the id via onOpenTask', async () => {
    const { onOpenTask } = renderScreen();
    await screen.findByText('Oil change');

    fireEvent.click(taskRow('Oil change'));

    expect(onOpenTask).toHaveBeenCalledWith(OIL_ID);
  });

  it('shows the full-page detail when openTaskId is set', async () => {
    renderScreen(OIL_ID);

    expect(
      await screen.findByRole('heading', { name: 'Oil change' }),
    ).toBeTruthy();
    // Description is visible without an Edit click
    expect(screen.getByText(/Full synthetic 5W-30/)).toBeTruthy();
    // The interval label is visible
    expect(screen.getByText('Every 12 months')).toBeTruthy();
    // Edit and Delete actions are visible
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    // Back link is visible
    expect(screen.getByRole('button', { name: /All tasks/ })).toBeTruthy();
  });

  it('shows the field schema on the detail (the "Fields" section)', async () => {
    renderScreen(OIL_ID);

    // The fields section shows the field names
    expect(await screen.findByText('Brand')).toBeTruthy();
    expect(screen.getByText('Quantity')).toBeTruthy();
    // The last-recorded values from the newest log entry are shown
    await waitFor(() => {
      expect(screen.getByText('Mobil 1')).toBeTruthy();
    });
  });

  it('shows the log entries on the detail', async () => {
    renderScreen(OIL_ID);

    // The log section loads entries for this task
    await waitFor(() => {
      expect(screen.getByText('31,200 km')).toBeTruthy();
    });
  });

  it('calls onBackToList when the back link is clicked from the detail', async () => {
    const { onBackToList } = renderScreen(OIL_ID);
    await screen.findByRole('heading', { name: 'Oil change' });

    fireEvent.click(screen.getByRole('button', { name: /All tasks/ }));

    expect(onBackToList).toHaveBeenCalled();
  });

  it('shows the Add form when the Add button is clicked', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      screen.getByRole('form', { name: 'Add maintenance task' }),
    ).toBeTruthy();
  });

  it('shows the Edit form when Edit is clicked on the detail', async () => {
    renderScreen(OIL_ID);
    await screen.findByRole('heading', { name: 'Oil change' });

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(
      screen.getByRole('form', { name: 'Edit maintenance task' }),
    ).toBeTruthy();
  });

  it('shows the count of shown tasks', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    expect(screen.getByText('4 shown')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search tasks'), {
      target: { value: 'oil' },
    });

    expect(screen.getByText('1 shown')).toBeTruthy();
  });
});
