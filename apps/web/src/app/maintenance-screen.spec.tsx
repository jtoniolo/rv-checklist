import type { LogEntry, MaintenanceTask, Rig } from '@rv-checklist/domain';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MaintenanceScreen } from './maintenance-screen';
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
    tags: ['engine'],
  },
  {
    id: TIRE_ID,
    rigId: rig.id,
    name: 'Tire rotation',
    description: 'Front-to-back rotation.',
    interval: { km: 10_000 },
    fieldSchema: [],
    tags: ['tires'],
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440052',
    rigId: rig.id,
    name: 'Fix loose trim',
    oneTime: true,
    fieldSchema: [],
    tags: [],
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440053',
    rigId: rig.id,
    name: 'Wax exterior',
    fieldSchema: [],
    tags: ['exterior'],
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
    costCents: 11_240,
    comment: 'Filter was tighter than usual.',
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
  // Second oil change in 2026, with cost — drives "This year" tile.
  {
    id: '550e8400-e29b-41d4-a716-446655440062',
    taskId: OIL_ID,
    rigId: rig.id,
    taskName: 'Oil change',
    performedOn: '2026-02-15',
    distanceKm: 38_000,
    costCents: 10_500,
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
  // Orphaned entry (deleted task) — taskId is null.
  {
    id: '550e8400-e29b-41d4-a716-446655440063',
    // eslint-disable-next-line unicorn/no-null
    taskId: null,
    rigId: rig.id,
    taskName: 'Replace water pump',
    performedOn: '2025-05-30',
    costCents: 9500,
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
  if (request.method === 'PATCH' && url.pathname.startsWith('/log-entries/')) {
    const id = url.pathname.split('/').at(-1);
    const existing = entries.find((e) => e.id === id);
    if (existing) return jsonResponse(existing);
  }

  throw new Error(`Unstubbed request: ${route}${url.search}`);
}

/** The body of the first PATCH /log-entries request the spy saw. */
async function patchedLogEntryBody(
  spy: jest.SpyInstance,
): Promise<{ comment?: string | null }> {
  const patch = await waitFor(() => {
    const request = spy.mock.calls
      .map((call: readonly unknown[]) => call[0] as Request)
      .find((r) => r.method === 'PATCH');
    if (!request) throw new Error('No PATCH request yet');
    return request;
  });
  return (await patch.clone().json()) as { comment?: string | null };
}

function renderScreen(openTaskId?: string, view?: string): void {
  mockPush.mockClear();
  render(
    <StoreProvider>
      <MaintenanceScreen
        activeRig={rig}
        rigId={rig.id}
        openTaskId={openTaskId}
        view={view}
      />
    </StoreProvider>,
  );
}

/** The first link whose visible text includes a given task name. */
function taskRow(name: string): HTMLElement {
  const row = screen
    .getAllByRole('link')
    .find((el) => el.textContent.includes(name));
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

    const links = screen.getAllByRole('link').filter((el) => {
      return TASK_NAMES.some((name) => el.textContent.includes(name));
    });
    const ordered = links.map((el) => el.textContent.trim());
    // Alphabetical: Fix loose trim, Oil change, Tire rotation, Wax exterior
    expect(ordered[0]).toContain('Fix loose trim');
    expect(ordered[1]).toContain('Oil change');
  });

  it('task rows link to the task detail route', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    const row = taskRow('Oil change');
    expect(row.closest('a')?.getAttribute('href')).toBe(
      `/rig/${rig.id}/maintenance/${OIL_ID}`,
    );
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

  it('shows the recorded cost on a log entry row (issue #39)', async () => {
    renderScreen(OIL_ID);

    await waitFor(() => {
      expect(screen.getByText('$112.40')).toBeTruthy();
    });
  });

  it('shows the recorded comment on a log entry row (issue #101)', async () => {
    renderScreen(OIL_ID);

    await waitFor(() => {
      expect(screen.getByText('Filter was tighter than usual.')).toBeTruthy();
    });
  });

  it('offers an optional comment input on the log-entry form, capped at 500 characters (issue #101)', async () => {
    renderScreen(OIL_ID);
    await screen.findByRole('heading', { name: 'Oil change' });

    fireEvent.click(screen.getByRole('button', { name: 'Add log entry' }));

    const comment = screen.getByLabelText(/Comment/);
    expect(comment.tagName).toBe('TEXTAREA');
    expect(comment.getAttribute('maxlength')).toBe('500');
  });

  it('editing an entry submits the changed comment (issue #101)', async () => {
    renderScreen(OIL_ID);
    const commentText = await screen.findByText(
      'Filter was tighter than usual.',
    );
    const row = commentText.closest('li');
    if (!row) throw new Error('No entry row for the commented entry');

    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/Comment/), {
      target: { value: 'Went with the strap wrench this time.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));

    const body = await patchedLogEntryBody(fetchSpy);
    expect(body.comment).toBe('Went with the strap wrench this time.');
  });

  it('editing an entry with a blank comment clears it with null (issue #101)', async () => {
    renderScreen(OIL_ID);
    const commentText = await screen.findByText(
      'Filter was tighter than usual.',
    );
    const row = commentText.closest('li');
    if (!row) throw new Error('No entry row for the commented entry');

    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/Comment/), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));

    const body = await patchedLogEntryBody(fetchSpy);
    expect(body.comment).toBeNull();
  });

  it('navigates to the list route when the back link is clicked from the detail', async () => {
    renderScreen(OIL_ID);
    await screen.findByRole('heading', { name: 'Oil change' });

    fireEvent.click(screen.getByRole('button', { name: /All tasks/ }));

    expect(mockPush).toHaveBeenCalledWith(`/rig/${rig.id}/maintenance`);
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

  it('shows tag chips on task rows and filter toolbar (issue #41)', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    // Tags appear both as filter buttons and on task rows
    expect(screen.getAllByText('engine').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('tires').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('exterior').length).toBeGreaterThanOrEqual(1);
  });

  it('shows tag chips on the detail view (issue #41)', async () => {
    renderScreen(OIL_ID);
    await screen.findByRole('heading', { name: 'Oil change' });

    expect(screen.getByText('engine')).toBeTruthy();
  });

  it('shows tag filter buttons in the toolbar (issue #41)', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    // The tag filter chips appear as buttons (interactive TagChips)
    const engineButtons = screen.getAllByRole('button', { name: 'engine' });
    expect(engineButtons.length).toBeGreaterThan(0);
  });

  it('filters by tag with AND logic (issue #41)', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    // Click the "engine" tag filter
    const engineButtons = screen.getAllByRole('button', { name: 'engine' });
    // The filter button is in the toolbar (the first one found with aria-pressed)
    const filterButton = engineButtons.find(
      (btn) => btn.getAttribute('aria-pressed') !== null,
    );
    expect(filterButton).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    fireEvent.click(filterButton!);

    // Only "Oil change" should remain (it has the "engine" tag)
    expect(screen.getByText('Oil change')).toBeTruthy();
    expect(screen.queryByText('Tire rotation')).toBeNull();
    expect(screen.queryByText('Fix loose trim')).toBeNull();
    expect(screen.queryByText('Wax exterior')).toBeNull();
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

  it('has a History link that points to the history route', async () => {
    renderScreen();
    await screen.findByText('Oil change');

    const historyLink = screen.getByRole('link', { name: 'History' });
    expect(historyLink.getAttribute('href')).toBe(
      `/rig/${rig.id}/maintenance/history`,
    );
  });
});

describe('MaintenanceScreen — History view (issue #43)', () => {
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

  it('shows summary tiles with correct spend totals', async () => {
    renderScreen(undefined, 'history');

    // Total: $112.40 + $105.00 + $95.00 = $312.40 (tire rotation has no cost)
    expect(await screen.findByText('$312.40')).toBeTruthy();
    // The "Total spend" label is visible
    expect(screen.getByText('Total spend')).toBeTruthy();
    expect(screen.getByText('Avg / job')).toBeTruthy();
    expect(screen.getByText('Biggest job')).toBeTruthy();
  });

  it('shows the "This year" tile with only current-year entries', async () => {
    renderScreen(undefined, 'history');

    // Wait for data to load (total spend appears first)
    await screen.findByText('$312.40');
    // 2026 entries with cost: oil change $105.00 only (tire rotation has no cost)
    // The other oil change ($112.40) and orphaned entry ($95.00) are from 2025
    expect(screen.getByText('This year')).toBeTruthy();
    // The "This year" value sits inside the same tile grid — verify it's there.
    // Use a function matcher to find the value in the tile context.
    const thisYearTile = screen.getByText('This year').closest('div');
    expect(thisYearTile?.textContent).toContain('$105');
  });

  it('excludes entries without cost from the average', async () => {
    renderScreen(undefined, 'history');

    // 3 entries have cost: $112.40 + $105.00 + $95.00 = $312.40
    // Average = $312.40 / 3 = $104.13 (rounded from 10413.33 cents → 10413)
    expect(await screen.findByText('$104.13')).toBeTruthy();
  });

  it('groups entries by month, newest first', async () => {
    renderScreen(undefined, 'history');

    // Newest month is July 2026 (tire rotation) — wait for data to load
    expect(await screen.findByText('July 2026')).toBeTruthy();
    // February 2026 (second oil change)
    expect(screen.getByText('February 2026')).toBeTruthy();
  });

  it('shows the entry comment in the timeline (issue #101)', async () => {
    renderScreen(undefined, 'history');

    expect(
      await screen.findByText('Filter was tighter than usual.'),
    ).toBeTruthy();
  });

  it('shows orphaned entries with a "deleted task" label', async () => {
    renderScreen(undefined, 'history');

    expect(await screen.findByText('Replace water pump')).toBeTruthy();
    expect(screen.getByText('deleted task')).toBeTruthy();
  });

  it('has search and tag filters', async () => {
    renderScreen(undefined, 'history');

    await screen.findAllByText('Oil change');
    expect(screen.getByLabelText('Search history')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Costs only' })).toBeTruthy();
  });

  it('filters entries by search text', async () => {
    renderScreen(undefined, 'history');
    await screen.findAllByText('Oil change');

    fireEvent.change(screen.getByLabelText('Search history'), {
      target: { value: 'water pump' },
    });

    expect(screen.getByText('Replace water pump')).toBeTruthy();
    expect(screen.queryByText('Oil change')).toBeNull();
    expect(screen.queryByText('Tire rotation')).toBeNull();
  });

  it('filters to costs-only entries', async () => {
    renderScreen(undefined, 'history');
    await screen.findAllByText('Oil change');

    fireEvent.click(screen.getByRole('button', { name: 'Costs only' }));

    // Tire rotation has no cost — it should disappear
    expect(screen.queryByText('Tire rotation')).toBeNull();
    // Oil change and Replace water pump have costs — they stay
    expect(screen.getAllByText('Oil change').length).toBeGreaterThan(0);
    expect(screen.getByText('Replace water pump')).toBeTruthy();
  });

  it('shows a back link that navigates to the list route', async () => {
    renderScreen(undefined, 'history');
    await screen.findByText('$312.40');

    fireEvent.click(screen.getByRole('button', { name: /All tasks/ }));

    expect(mockPush).toHaveBeenCalledWith(`/rig/${rig.id}/maintenance`);
  });

  it('shows the spend-by-tag breakdown', async () => {
    renderScreen(undefined, 'history');

    expect(await screen.findByText('Spend by tag')).toBeTruthy();
    expect(
      screen.getByRole('complementary', { name: 'Spend by tag' }),
    ).toBeTruthy();
  });

  it('shows "No history matches." when filters exclude everything', async () => {
    renderScreen(undefined, 'history');
    // Wait for data to load
    await screen.findAllByText('Oil change');

    fireEvent.change(screen.getByLabelText('Search history'), {
      target: { value: 'zzz-no-match' },
    });

    expect(screen.getByText('No history matches.')).toBeTruthy();
  });
});
