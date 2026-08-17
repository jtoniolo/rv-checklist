import type {
  Checklist,
  CreateChecklist,
  CreateRig,
  CreateRun,
  Rig,
  Run,
} from '@rv-checklist/domain';
import { api } from './api.js';
import { makeStore } from './store.js';

const rig: Rig = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  ownerId: '550e8400-e29b-41d4-a716-446655440001',
  vin: '1FDXE4FS1234567890',
  make: 'Airstream',
  model: 'Flying Cloud',
  year: 2021,
  nickname: 'Silver Bullet',
};

const newRig: CreateRig = {
  vin: rig.vin,
  make: rig.make,
  model: rig.model,
  year: rig.year,
  nickname: rig.nickname,
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(status === 204 ? undefined : JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type FetchSpy = jest.SpyInstance<
  ReturnType<typeof fetch>,
  Parameters<typeof fetch>
>;

/** The `Request` a mocked `fetch` was called with on a given call. */
function requestOf(spy: FetchSpy, call: number): Request {
  return spy.mock.calls[call]?.[0] as Request;
}

describe('rig endpoints', () => {
  let fetchSpy: FetchSpy;
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    store = makeStore();
  });

  afterEach(() => {
    // Clear RTK Query's 60s cache-eviction timers so Jest exits promptly.
    store.dispatch(api.util.resetApiState());
    fetchSpy.mockRestore();
  });

  it('lists rigs from GET /rigs and validates the response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([rig]));
    const result = await store.dispatch(api.endpoints.listRigs.initiate());

    expect(result.data).toEqual([rig]);
    expect(requestOf(fetchSpy, 0).url).toBe('https://api.test/rigs');
  });

  it('sends credentials: include (cookie transport)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    await store.dispatch(api.endpoints.listRigs.initiate());

    expect(requestOf(fetchSpy, 0).credentials).toBe('include');
  });

  it('creates a rig with POST /rigs', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(rig, 201));
    const result = await store.dispatch(
      api.endpoints.createRig.initiate(newRig),
    );

    expect('data' in result && result.data).toEqual(rig);
    const request = requestOf(fetchSpy, 0);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://api.test/rigs');
  });

  it('refetches the rig list after a create (tag invalidation)', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse([])) // initial list
      .mockResolvedValueOnce(jsonResponse(rig, 201)) // create
      .mockResolvedValueOnce(jsonResponse([rig])); // invalidated refetch
    // An active subscription keeps the list cached, so invalidation refetches it.
    const subscription = store.dispatch(api.endpoints.listRigs.initiate());
    await subscription;

    await store.dispatch(api.endpoints.createRig.initiate(newRig));
    // Let the invalidation-driven refetch settle.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const listState = api.endpoints.listRigs.select()(store.getState());
    expect(listState.data).toEqual([rig]);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    subscription.unsubscribe();
  });
});

const checklist: Checklist = {
  id: '550e8400-e29b-41d4-a716-446655440020',
  rigId: rig.id,
  name: 'Pre-departure',
  tags: ['procedure'],
  steps: [
    { id: '550e8400-e29b-41d4-a716-446655440021', text: 'Close roof vents' },
  ],
};

const newChecklist: CreateChecklist = {
  rigId: rig.id,
  name: checklist.name,
  tags: checklist.tags,
  steps: [{ text: 'Close roof vents' }],
};

describe('checklist endpoints', () => {
  let fetchSpy: FetchSpy;
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    store = makeStore();
  });

  afterEach(() => {
    // Clear RTK Query's 60s cache-eviction timers so Jest exits promptly.
    store.dispatch(api.util.resetApiState());
    fetchSpy.mockRestore();
  });

  it('lists a rig’s checklists from GET /checklists?rigId= and validates the response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([checklist]));
    const result = await store.dispatch(
      api.endpoints.listChecklists.initiate(rig.id),
    );

    expect(result.data).toEqual([checklist]);
    expect(requestOf(fetchSpy, 0).url).toBe(
      `https://api.test/checklists?rigId=${rig.id}`,
    );
  });

  it('creates a checklist with POST /checklists', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(checklist, 201));
    const result = await store.dispatch(
      api.endpoints.createChecklist.initiate(newChecklist),
    );

    expect('data' in result && result.data).toEqual(checklist);
    const request = requestOf(fetchSpy, 0);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://api.test/checklists');
  });

  it('refetches the checklist list after a create (tag invalidation)', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse([])) // initial list
      .mockResolvedValueOnce(jsonResponse(checklist, 201)) // create
      .mockResolvedValueOnce(jsonResponse([checklist])); // invalidated refetch
    const subscription = store.dispatch(
      api.endpoints.listChecklists.initiate(rig.id),
    );
    await subscription;

    await store.dispatch(api.endpoints.createChecklist.initiate(newChecklist));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const listState = api.endpoints.listChecklists.select(rig.id)(
      store.getState(),
    );
    expect(listState.data).toEqual([checklist]);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    subscription.unsubscribe();
  });

  it('updates a checklist with PATCH /checklists/:id', async () => {
    const renamed = { ...checklist, name: 'Departure' };
    fetchSpy.mockResolvedValueOnce(jsonResponse(renamed));
    const result = await store.dispatch(
      api.endpoints.updateChecklist.initiate({
        id: checklist.id,
        changes: { name: 'Departure' },
      }),
    );

    expect('data' in result && result.data).toEqual(renamed);
    const request = requestOf(fetchSpy, 0);
    expect(request.method).toBe('PATCH');
    expect(request.url).toBe(`https://api.test/checklists/${checklist.id}`);
  });

  it('deletes a checklist with DELETE /checklists/:id', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(undefined, 204));
    await store.dispatch(api.endpoints.deleteChecklist.initiate(checklist.id));

    const request = requestOf(fetchSpy, 0);
    expect(request.method).toBe('DELETE');
    expect(request.url).toBe(`https://api.test/checklists/${checklist.id}`);
  });
});

const run: Run = {
  id: '550e8400-e29b-41d4-a716-446655440040',
  checklistId: checklist.id,
  rigId: rig.id,
  startedOn: '2026-07-21',
  steps: [
    {
      id: '550e8400-e29b-41d4-a716-446655440041',
      text: 'Close roof vents',
      state: 'incomplete',
    },
  ],
};

const newRun: CreateRun = { checklistId: checklist.id };

describe('run endpoints', () => {
  let fetchSpy: FetchSpy;
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    store = makeStore();
  });

  afterEach(() => {
    // Clear RTK Query's 60s cache-eviction timers so Jest exits promptly.
    store.dispatch(api.util.resetApiState());
    fetchSpy.mockRestore();
  });

  it('lists a checklist’s runs from GET /runs?checklistId= and validates the response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([run]));
    const result = await store.dispatch(
      api.endpoints.listRuns.initiate(checklist.id),
    );

    expect(result.data).toEqual([run]);
    expect(requestOf(fetchSpy, 0).url).toBe(
      `https://api.test/runs?checklistId=${checklist.id}`,
    );
  });

  it('reads one run from GET /runs/:id', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(run));
    const result = await store.dispatch(api.endpoints.getRun.initiate(run.id));

    expect(result.data).toEqual(run);
    expect(requestOf(fetchSpy, 0).url).toBe(`https://api.test/runs/${run.id}`);
  });

  it('starts a run with POST /runs', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(run, 201));
    const result = await store.dispatch(
      api.endpoints.createRun.initiate(newRun),
    );

    expect('data' in result && result.data).toEqual(run);
    const request = requestOf(fetchSpy, 0);
    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://api.test/runs');
  });

  it('refetches the run list after a create (tag invalidation)', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse([])) // initial list
      .mockResolvedValueOnce(jsonResponse(run, 201)) // create
      .mockResolvedValueOnce(jsonResponse([run])); // invalidated refetch
    const subscription = store.dispatch(
      api.endpoints.listRuns.initiate(checklist.id),
    );
    await subscription;

    await store.dispatch(api.endpoints.createRun.initiate(newRun));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const listState = api.endpoints.listRuns.select(checklist.id)(
      store.getState(),
    );
    expect(listState.data).toEqual([run]);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    subscription.unsubscribe();
  });

  it('edits a run with PATCH /runs/:id', async () => {
    const completed: Run = {
      ...run,
      steps: run.steps.map((s) => ({ ...s, state: 'complete' as const })),
    };
    fetchSpy.mockResolvedValueOnce(jsonResponse(completed));
    const result = await store.dispatch(
      api.endpoints.updateRun.initiate({
        id: run.id,
        changes: { steps: completed.steps },
      }),
    );

    expect('data' in result && result.data).toEqual(completed);
    const request = requestOf(fetchSpy, 0);
    expect(request.method).toBe('PATCH');
    expect(request.url).toBe(`https://api.test/runs/${run.id}`);
  });

  it('deletes a run with DELETE /runs/:id', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(undefined, 204));
    await store.dispatch(api.endpoints.deleteRun.initiate(run.id));

    const request = requestOf(fetchSpy, 0);
    expect(request.method).toBe('DELETE');
    expect(request.url).toBe(`https://api.test/runs/${run.id}`);
  });
});
