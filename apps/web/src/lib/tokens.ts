import { type TokenPair } from '@rv-checklist/domain';

/**
 * Client-side session storage (ADR-0002). The token pair lives in the browser
 * (standard SPA posture) so the browser can call the API directly. We persist
 * the access token, the refresh token, and the moment the access token expires,
 * so a silent refresh can be scheduled to fire before it does — the owner stays
 * signed in for months without a login screen.
 */
export interface StoredSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch ms at which the access token expires. */
  readonly accessExpiresAt: number;
}

const ACCESS_KEY = 'rv.accessToken';
const REFRESH_KEY = 'rv.refreshToken';
const EXPIRES_KEY = 'rv.accessExpiresAt';

/** Persist a freshly-issued pair, computing its absolute expiry from `now`. */
export function storeSession(pair: TokenPair, now: number): StoredSession {
  const session: StoredSession = {
    accessToken: pair.accessToken,
    refreshToken: pair.refreshToken,
    accessExpiresAt: now + pair.expiresIn * 1000,
  };
  localStorage.setItem(ACCESS_KEY, session.accessToken);
  localStorage.setItem(REFRESH_KEY, session.refreshToken);
  localStorage.setItem(EXPIRES_KEY, String(session.accessExpiresAt));
  return session;
}

/** Read the stored session, or `undefined` if none / incomplete. */
export function readSession(): StoredSession | undefined {
  const accessToken = localStorage.getItem(ACCESS_KEY);
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  const expiresAt = localStorage.getItem(EXPIRES_KEY);
  if (!accessToken || !refreshToken || !expiresAt) {
    return undefined;
  }
  return {
    accessToken,
    refreshToken,
    accessExpiresAt: Number(expiresAt),
  };
}

/** Forget the session (sign-out, or an unrecoverable refresh failure). */
export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

/**
 * How long to wait before refreshing: fire `skewMs` before expiry, never
 * negative. A token already within the skew window refreshes immediately.
 */
export function refreshDelayMs(
  accessExpiresAt: number,
  now: number,
  skewMs = 60_000,
): number {
  return Math.max(0, accessExpiresAt - now - skewMs);
}
