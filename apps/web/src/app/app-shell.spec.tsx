import type { Checklist, Owner, Rig, Run } from '@rv-checklist/domain';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Index from './page';
import { StoreProvider } from './store-provider';

/**
 * The signed-in shell, end to end against a mocked API (issue #22): the home
 * summary clicks through into a real run (copy-on-start wiring, not local
 * state), the run screen's checkbox rows persist step state, and the theme
 * picked in the avatar menu re-tokens the surface and survives in
 * localStorage.
 */
const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: 'Jeff Owner',
  picture: undefined,
};

const rig: Rig = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  ownerId: owner.id,
  nickname: 'Silver Bullet',
  make: 'Airstream',
  model: 'Flying Cloud',
  year: 2021,
};

const checklist: Checklist = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  rigId: rig.id,
  name: 'Pre-departure',
  tags: ['procedure'],
  steps: [
    { id: '550e8400-e29b-41d4-a716-446655440030', text: 'Close roof vents' },
    { id: '550e8400-e29b-41d4-a716-446655440031', text: 'Hitch the sway bars' },
  ],
};

/** A second checklist with no runs, for switching away from an open run. */
const otherChecklist: Checklist = {
  id: '550e8400-e29b-41d4-a716-446655440021',
  rigId: rig.id,
  name: 'Spring opening',
  tags: [],
  steps: [
    { id: '550e8400-e29b-41d4-a716-446655440032', text: 'De-winterize lines' },
  ],
};

/** An in-progress run over the checklist: one step done, one still to do. */
const run: Run = {
  id: '550e8400-e29b-41d4-a716-446655440040',
  checklistId: checklist.id,
  rigId: rig.id,
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

function jsonResponse(data: unknown): Response {
  return Response.json(data, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** Each PATCHed run body, in call order (the mock consumes the request). */
const patchedRuns: { url: string; body: Partial<Run> }[] = [];

/** Route the app's API calls to canned data, echoing PATCHed run steps back. */
async function fakeApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;
  if (route === 'GET /me') {
    return jsonResponse(owner);
  }
  if (route === 'GET /rigs') {
    return jsonResponse([rig]);
  }
  if (route === 'GET /checklists') {
    return jsonResponse([checklist, otherChecklist]);
  }
  if (route === 'GET /runs') {
    const byChecklist = url.searchParams.get('checklistId');
    return jsonResponse(
      [run].filter((r) => !byChecklist || r.checklistId === byChecklist),
    );
  }
  if (route === `GET /runs/${run.id}`) {
    return jsonResponse(run);
  }
  if (route === `PATCH /runs/${run.id}`) {
    const changes = (await request.json()) as Partial<Run>;
    patchedRuns.push({ url: request.url, body: changes });
    return jsonResponse({ ...run, ...changes });
  }
  // Maintenance screen requests (issue #40 deep-link tests).
  if (route === 'GET /tasks') {
    return jsonResponse([]);
  }
  if (route === 'GET /log-entries') {
    return jsonResponse([]);
  }
  throw new Error(`Unstubbed request: ${route}${url.search}`);
}

function renderShell(): void {
  render(
    <StoreProvider>
      <Index />
    </StoreProvider>,
  );
}

describe('web shell, signed in', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    patchedRuns.length = 0;
    // The persisted session the browser carries into the reload.
    localStorage.setItem('rv.accessToken', 'access-1');
    localStorage.setItem('rv.refreshToken', 'refresh-1');
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => fakeApi(input as Request));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    localStorage.clear();
    // Reset the URL so the navigation hook initialises on home in each test.
    // eslint-disable-next-line unicorn/no-null
    globalThis.history.replaceState(null, '', '/');
  });

  it('shows the home summary: greeting, click-through tiles, and the continue card', async () => {
    renderShell();

    expect(await screen.findByText(/hi jeff/i)).toBeTruthy();
    // Tab bar and stat tiles are up (the counts settle once the rig's
    // checklists and runs load, behind the active-rig selection).
    expect(
      screen.getAllByRole('button', { name: /checklists/i }).length,
    ).toBeGreaterThan(0);
    expect(await screen.findByRole('button', { name: /1 rig\b/ })).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: /1 in progress/ }),
    ).toBeTruthy();
    // The in-progress run surfaces as a continue card under its checklist name.
    expect(
      await screen.findByRole('button', { name: /pre-departure.*1\/2/is }),
    ).toBeTruthy();
  });

  it('jumps from the continue card into the run and persists a checked step', async () => {
    renderShell();

    fireEvent.click(
      await screen.findByRole('button', { name: /pre-departure.*1\/2/is }),
    );

    // The run screen loads the server's copy of the steps (copy-on-start).
    const checkbox = await screen.findByRole('checkbox', {
      name: 'Close roof vents',
    });
    fireEvent.click(checkbox);

    // The change was persisted straight away: PATCH /runs/:id with the whole
    // steps array, the tapped step now complete.
    await waitFor(() => {
      expect(patchedRuns.length).toBeGreaterThan(0);
    });
    const patch = patchedRuns[0];
    expect(patch?.url).toBe(`https://api.test/runs/${run.id}`);
    expect(
      patch?.body.steps?.find((s) => s.text === 'Close roof vents')?.state,
    ).toBe('complete');
  });

  it('closes an open run when another checklist is selected', async () => {
    renderShell();

    fireEvent.click(
      await screen.findByRole('button', { name: /pre-departure.*1\/2/is }),
    );
    await screen.findByRole('checkbox', { name: 'Close roof vents' });

    // Picking a different checklist in the sidebar must swap the whole detail
    // pane — not leave the old run rendered under the new checklist's name.
    fireEvent.click(screen.getByRole('button', { name: /spring opening/i }));

    expect(
      await screen.findByRole('heading', { name: 'Spring opening' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('checkbox', { name: 'Close roof vents' }),
    ).toBeNull();
  });

  it('re-tokens the surface from the avatar menu and persists the theme', async () => {
    renderShell();

    fireEvent.click(await screen.findByRole('button', { name: 'Account' }));
    const picker = await screen.findByRole('button', {
      name: 'Theme: Campfire',
    });
    fireEvent.click(picker);

    expect(localStorage.getItem('rv.theme')).toBe('campfire');
    expect(
      screen
        .getByRole('button', { name: 'Theme: Campfire' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('pushes history when navigating between screens (issue #40)', async () => {
    const pushSpy = jest.spyOn(globalThis.history, 'pushState');
    renderShell();

    await screen.findByText(/hi jeff/i);

    // Navigate to the Checklists tab (the stat tile also matches the name).
    const buttons = screen.getAllByRole('button', { name: /checklists/i });
    fireEvent.click(buttons[0]);

    expect(pushSpy).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'checklists' }),
      '',
      expect.stringContaining('screen=checklists'),
    );

    pushSpy.mockRestore();
  });

  it('restores screen from the URL on reload (deep-link, issue #40)', async () => {
    // Seed the URL as if the user reloaded on the Maintenance screen.
    // eslint-disable-next-line unicorn/no-null
    globalThis.history.replaceState(null, '', '/?screen=maintenance');

    renderShell();

    // The maintenance screen should be visible (showing its search box).
    expect(await screen.findByLabelText('Search tasks')).toBeTruthy();
  });

  it('shows the add form without navigating back when a run is open (issue #40 regression)', async () => {
    const backSpy = jest.spyOn(globalThis.history, 'back');
    renderShell();

    // Open a run via the continue card.
    fireEvent.click(
      await screen.findByRole('button', { name: /pre-departure.*1\/2/is }),
    );
    await screen.findByRole('checkbox', { name: 'Close roof vents' });
    backSpy.mockClear();

    // Click the Add button — the form must appear and no back() must fire.
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('form', { name: 'Add checklist' })).toBeTruthy();
    // The handler must not call history.back(): doing so fires an async
    // popstate that resets the adding flag, making the form flash and vanish.
    expect(backSpy).not.toHaveBeenCalled();

    backSpy.mockRestore();
  });

  it('reverses navigation on browser Back (popstate, issue #40)', async () => {
    renderShell();

    await screen.findByText(/hi jeff/i);

    // Navigate to the Maintenance tab (pushes history).
    const buttons = screen.getAllByRole('button', { name: /maintenance/i });
    fireEvent.click(buttons[0]);
    expect(await screen.findByLabelText('Search tasks')).toBeTruthy();

    // Simulate browser Back to the home screen.
    fireEvent(
      globalThis,
      new PopStateEvent('popstate', { state: { route: 'home' } }),
    );

    expect(await screen.findByText(/hi jeff/i)).toBeTruthy();
  });
});
