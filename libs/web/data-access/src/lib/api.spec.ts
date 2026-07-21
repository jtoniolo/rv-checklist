import type {
  Checklist,
  CreateChecklist,
  CreateRig,
  Rig,
} from '@rv-checklist/domain';
import { api } from './api.js';
import { tokensReceived } from './auth.slice.js';
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

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('lists rigs from GET /rigs and validates the response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([rig]));
    const store = makeStore();

    const result = await store.dispatch(api.endpoints.listRigs.initiate());

    expect(result.data).toEqual([rig]);
    expect(requestOf(fetchSpy, 0).url).toBe('https://api.test/rigs');
  });

  it('attaches the bearer access token from the auth slice', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    const store = makeStore();
    store.dispatch(
      tokensReceived({
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresIn: 900,
      }),
    );

    await store.dispatch(api.endpoints.listRigs.initiate());

    expect(requestOf(fetchSpy, 0).headers.get('authorization')).toBe(
      'Bearer access-1',
    );
  });

  it('creates a rig with POST /rigs', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(rig, 201));
    const store = makeStore();

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
    const store = makeStore();

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

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('lists a rig’s checklists from GET /checklists?rigId= and validates the response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse([checklist]));
    const store = makeStore();

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
    const store = makeStore();

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
    const store = makeStore();

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
    const store = makeStore();

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
    const store = makeStore();

    await store.dispatch(api.endpoints.deleteChecklist.initiate(checklist.id));

    const request = requestOf(fetchSpy, 0);
    expect(request.method).toBe('DELETE');
    expect(request.url).toBe(`https://api.test/checklists/${checklist.id}`);
  });
});
