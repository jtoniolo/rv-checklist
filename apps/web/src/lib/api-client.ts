import { OwnerSchema, TokenPairSchema } from '@rv-checklist/domain';
import type { Owner, TokenPair } from '@rv-checklist/domain';
import { config } from './config';

/** Thrown when the API rejects a call; carries the HTTP status. */
export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with status ${String(status)}`);
    this.name = 'ApiError';
  }
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new ApiError(res.status);
  }
  return res.status === 204 ? undefined : ((await res.json()) as unknown);
}

/** Exchange a Google One Tap credential for a first-party token pair. */
export async function exchangeGoogleCredential(
  idToken: string,
): Promise<TokenPair> {
  return TokenPairSchema.parse(await postJson('/auth/google', { idToken }));
}

/** Rotate a refresh token for a fresh pair. */
export async function refreshSession(refreshToken: string): Promise<TokenPair> {
  return TokenPairSchema.parse(
    await postJson('/auth/refresh', { refreshToken }),
  );
}

/** Revoke a refresh token (sign out). */
export async function revokeSession(refreshToken: string): Promise<void> {
  await postJson('/auth/logout', { refreshToken });
}

/** Fetch the authenticated owner with a bearer access token. */
export async function fetchMe(accessToken: string): Promise<Owner> {
  const res = await fetch(`${config.apiBaseUrl}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new ApiError(res.status);
  }
  return OwnerSchema.parse(await res.json());
}
