import { syncDeviceId } from './device-id.js';

/** A localStorage stand-in — the lib's specs run under `testEnvironment: node`. */
function installStorage(): Map<string, string> {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null, // eslint-disable-line unicorn/no-null
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    },
  });
  return entries;
}

describe('syncDeviceId', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('mints and persists an id on first use', () => {
    const entries = installStorage();

    const id = syncDeviceId();

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entries.get('rv.sync-device-id')).toBe(id);
  });

  it('returns the same id on every call', () => {
    installStorage();

    expect(syncDeviceId()).toBe(syncDeviceId());
  });

  it('falls back to a fixed value with no localStorage', () => {
    expect(syncDeviceId()).toBe('no-storage');
  });
});
