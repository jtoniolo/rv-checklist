import type { CreateRig, Rig } from '@rv-checklist/domain';
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
