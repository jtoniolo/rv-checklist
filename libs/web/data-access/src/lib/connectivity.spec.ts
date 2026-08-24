import { observeSyncConnection } from './connectivity.js';
import type { LocalDatabase } from './powersync/local-store.js';

/**
 * The sync half of the offline indicator (issue #153). The rule under test is
 * the one that keeps a benign "no local store" or a still-connecting sync
 * client from reading as "off grid": only a connection that existed and was
 * lost counts.
 */

interface FakeDatabase extends LocalDatabase {
  /** Push a connection state to whatever is subscribed. */
  readonly setConnected: (isConnected: boolean) => void;
  readonly disposed: () => number;
}

function noDispose(): void {
  // Nothing to dispose.
}

function fakeDatabase({ connected = false } = {}): FakeDatabase {
  let isConnected = connected;
  const listeners = new Set<(isConnected: boolean) => void>();
  let disposals = 0;

  return {
    store: { getAll: () => Promise.resolve([]) },
    waitForFirstSync: () => Promise.resolve(),
    onChange: () => noDispose,
    onConnectionChange: (notify) => {
      notify(isConnected);
      listeners.add(notify);
      return () => {
        disposals += 1;
        listeners.delete(notify);
      };
    },
    clear: () => Promise.resolve(),
    close: () => Promise.resolve(),
    setConnected: (next) => {
      isConnected = next;
      for (const notify of listeners) notify(next);
    },
    disposed: () => disposals,
  };
}

/** Let the `open()` promise and its `.then` settle. */
const settle = (): Promise<void> => Promise.resolve();

describe('observeSyncConnection', () => {
  it('says nothing while the sync client has never connected', async () => {
    const database = fakeDatabase({ connected: false });
    const notify = jest.fn();

    observeSyncConnection(notify, () => Promise.resolve(database));
    await settle();

    // The sync client starts disconnected on every page load. Reporting that
    // would flash the indicator before the first round trip completes.
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports offline once a connection that existed is lost', async () => {
    const database = fakeDatabase({ connected: true });
    const notify = jest.fn();

    observeSyncConnection(notify, () => Promise.resolve(database));
    await settle();
    database.setConnected(false);

    expect(notify).toHaveBeenLastCalledWith(true);
  });

  it('clears once the connection comes back', async () => {
    const database = fakeDatabase({ connected: true });
    const notify = jest.fn();

    observeSyncConnection(notify, () => Promise.resolve(database));
    await settle();
    database.setConnected(false);
    database.setConnected(true);

    expect(notify).toHaveBeenLastCalledWith(false);
  });

  it('reports nothing when there is no local store', async () => {
    const notify = jest.fn();

    const dispose = observeSyncConnection(notify, () =>
      Promise.resolve(undefined),
    );
    await settle();
    dispose();

    // A signed-out visitor, or a host without IndexedDB, is not offline.
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports nothing when the store cannot be opened', async () => {
    const notify = jest.fn();

    observeSyncConnection(notify, () => Promise.reject(new Error('no worker')));
    await settle();
    await settle();

    expect(notify).not.toHaveBeenCalled();
  });

  it('unsubscribes on dispose', async () => {
    const database = fakeDatabase({ connected: true });
    const notify = jest.fn();

    const dispose = observeSyncConnection(notify, () =>
      Promise.resolve(database),
    );
    await settle();
    dispose();
    database.setConnected(false);

    expect(database.disposed()).toBe(1);
    expect(notify).not.toHaveBeenCalledWith(true);
  });

  it('does not subscribe when disposed before the store opens', async () => {
    const database = fakeDatabase({ connected: true });
    const notify = jest.fn();

    const dispose = observeSyncConnection(notify, () =>
      Promise.resolve(database),
    );
    dispose();
    await settle();
    database.setConnected(false);

    expect(notify).not.toHaveBeenCalled();
  });
});
