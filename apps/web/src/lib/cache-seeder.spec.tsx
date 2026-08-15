import type {
  Checklist,
  MaintenanceTask,
  Owner,
  Rig,
  Run,
} from '@rv-checklist/domain';
import { makeStore } from '@rv-checklist/web-data-access';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { CacheSeeder } from './cache-seeder';

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

const task: MaintenanceTask = {
  id: '550e8400-e29b-41d4-a716-446655440050',
  rigId: rig.id,
  name: 'Change oil',
  interval: { months: 6 },
  fieldSchema: [],
  tags: [],
};

function queryData(
  store: ReturnType<typeof makeStore>,
  prefix: string,
): unknown {
  const { api } = store.getState();
  const key = Object.keys(api.queries).find((k) => k.startsWith(prefix));
  if (key === undefined) return undefined;
  return (api.queries[key] as { data?: unknown } | undefined)?.data;
}

describe('CacheSeeder', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No network'));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    localStorage.clear();
  });

  it('seeds the me data into the RTK Query cache', async () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <CacheSeeder me={owner}>
          <span>child</span>
        </CacheSeeder>
      </Provider>,
    );

    await waitFor(() => {
      expect((queryData(store, 'me(') as Owner).email).toBe(
        'owner@example.com',
      );
    });
  });

  it('seeds rigs into the RTK Query cache', async () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <CacheSeeder rigs={[rig]}>
          <span>child</span>
        </CacheSeeder>
      </Provider>,
    );

    await waitFor(() => {
      const data = queryData(store, 'listRigs(') as Rig[];
      expect(data).toHaveLength(1);
      expect(data[0]?.nickname).toBe('Silver Bullet');
    });
  });

  it('seeds tasks keyed by rig id', async () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <CacheSeeder tasks={{ rigId: rig.id, data: [task] }}>
          <span>child</span>
        </CacheSeeder>
      </Provider>,
    );

    await waitFor(() => {
      const data = queryData(store, 'listTasks(') as MaintenanceTask[];
      expect(data).toHaveLength(1);
      expect(data[0]?.name).toBe('Change oil');
    });
  });

  it('seeds log entries keyed by rig id', async () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <CacheSeeder logEntries={{ rigId: rig.id, data: [] }}>
          <span>child</span>
        </CacheSeeder>
      </Provider>,
    );

    await waitFor(() => {
      expect(queryData(store, 'listLogEntriesByRig(')).toEqual([]);
    });
  });

  it('renders its children', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <CacheSeeder me={owner}>
          <span data-testid="child">hello</span>
        </CacheSeeder>
      </Provider>,
    );

    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('dispatches signedIn so downstream auth checks pass', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <CacheSeeder>
          <span>child</span>
        </CacheSeeder>
      </Provider>,
    );

    expect(store.getState().auth.isAuthenticated).toBe(true);
  });

  it('seeds checklists keyed by rig id', async () => {
    const store = makeStore();
    const checklist: Checklist = {
      id: '550e8400-e29b-41d4-a716-446655440020',
      rigId: rig.id,
      name: 'Pre-departure',
      tags: ['procedure'],
      steps: [],
    };
    render(
      <Provider store={store}>
        <CacheSeeder checklists={{ rigId: rig.id, data: [checklist] }}>
          <span>child</span>
        </CacheSeeder>
      </Provider>,
    );

    await waitFor(() => {
      const data = queryData(store, 'listChecklists(') as Checklist[];
      expect(data).toHaveLength(1);
      expect(data[0]?.name).toBe('Pre-departure');
    });
  });

  it('seeds runs by rig', async () => {
    const store = makeStore();
    const run: Run = {
      id: '550e8400-e29b-41d4-a716-446655440040',
      checklistId: '550e8400-e29b-41d4-a716-446655440020',
      rigId: rig.id,
      startedOn: '2026-07-20',
      steps: [],
    };
    render(
      <Provider store={store}>
        <CacheSeeder runsByRig={{ rigId: rig.id, data: [run] }}>
          <span>child</span>
        </CacheSeeder>
      </Provider>,
    );

    await waitFor(() => {
      const data = queryData(store, 'listRunsByRig(') as Run[];
      expect(data).toHaveLength(1);
      expect(data[0]?.startedOn).toBe('2026-07-20');
    });
  });
});
