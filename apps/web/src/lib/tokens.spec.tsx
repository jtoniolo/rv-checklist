import type { TokenPair } from '@rv-checklist/domain';
import {
  clearSession,
  readSession,
  refreshDelayMs,
  storeSession,
} from './tokens';

const pair: TokenPair = {
  accessToken: 'a.b.c',
  refreshToken: 'refresh-opaque',
  expiresIn: 900,
};

describe('session storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips a stored session with an absolute expiry', () => {
    const now = 1_000_000;
    const stored = storeSession(pair, now);
    expect(stored.accessExpiresAt).toBe(now + 900 * 1000);
    expect(readSession()).toEqual(stored);
  });

  it('reads undefined when nothing is stored', () => {
    expect(readSession()).toBeUndefined();
  });

  it('clears the session', () => {
    storeSession(pair, 0);
    clearSession();
    expect(readSession()).toBeUndefined();
  });
});

describe('refreshDelayMs', () => {
  it('fires one skew-window before expiry', () => {
    expect(refreshDelayMs(100_000, 0, 60_000)).toBe(40_000);
  });

  it('never goes negative — refresh immediately if already inside the window', () => {
    expect(refreshDelayMs(10_000, 9000, 60_000)).toBe(0);
    expect(refreshDelayMs(0, 100_000)).toBe(0);
  });
});
