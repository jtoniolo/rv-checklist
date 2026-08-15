import type { Owner, Rig } from '@rv-checklist/domain';

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

const { cookies } = jest.requireMock<{ cookies: jest.Mock }>('next/headers');

const cookieStore = {
  getAll: () => [
    { name: 'rv.access', value: 'test-access-token' },
    { name: 'rv.refresh', value: 'test-refresh-token' },
  ],
};

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: 'Jeff Owner',
};

const rig: Rig = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  ownerId: owner.id,
  nickname: 'Silver Bullet',
};

describe('server-api', () => {
  let fetchSpy: jest.SpyInstance;

  // Import lazily so the mock of next/headers is in place.
  // eslint-disable-next-line unicorn/consistent-function-scoping
  const load = () => import('./server-api');

  beforeEach(() => {
    cookies.mockResolvedValue(cookieStore);
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(owner));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    cookies.mockReset();
  });

  it('forwards cookies to the API', async () => {
    const { fetchMe } = await load();
    await fetchMe();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/me'),
      expect.objectContaining({
        headers: {
          cookie: 'rv.access=test-access-token; rv.refresh=test-refresh-token',
        },
      }),
    );
  });

  it('parses the response through the schema', async () => {
    const { fetchMe } = await load();
    const result = await fetchMe();
    expect(result.email).toBe('owner@example.com');
  });

  it('throws on a non-OK response', async () => {
    fetchSpy.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const { fetchMe } = await load();
    await expect(fetchMe()).rejects.toThrow('API /me: 401');
  });

  it('fetches rigs at the correct path', async () => {
    fetchSpy.mockResolvedValue(Response.json([rig]));
    const { fetchRigs } = await load();
    const result = await fetchRigs();
    expect(result).toHaveLength(1);
    expect(result[0]?.nickname).toBe('Silver Bullet');
  });

  it('fetches tasks for a rig', async () => {
    fetchSpy.mockResolvedValue(Response.json([]));
    const { fetchTasks } = await load();
    await fetchTasks(rig.id);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(`/tasks?rigId=${rig.id}`),
      expect.anything(),
    );
  });

  it('fetches log entries for a rig', async () => {
    fetchSpy.mockResolvedValue(Response.json([]));
    const { fetchLogEntriesByRig } = await load();
    await fetchLogEntriesByRig(rig.id);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(`/log-entries?rigId=${rig.id}`),
      expect.anything(),
    );
  });

  it('fetches checklists for a rig', async () => {
    fetchSpy.mockResolvedValue(Response.json([]));
    const { fetchChecklists } = await load();
    const result = await fetchChecklists(rig.id);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(`/checklists?rigId=${rig.id}`),
      expect.anything(),
    );
    expect(result).toEqual([]);
  });

  it('fetches runs by rig', async () => {
    fetchSpy.mockResolvedValue(Response.json([]));
    const { fetchRunsByRig } = await load();
    const result = await fetchRunsByRig(rig.id);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(`/runs?rigId=${rig.id}`),
      expect.anything(),
    );
    expect(result).toEqual([]);
  });
});
