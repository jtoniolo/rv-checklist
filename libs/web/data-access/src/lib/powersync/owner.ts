import { config } from '../config.js';
import { storage } from '../storage.js';

/**
 * Which owner the local store belongs to (ADR-0029). The store holds one
 * owner's replicated rows and survives sign-out, so every open has to be told
 * whose store to open — a store belonging to a different owner must never be
 * adopted, or the next person to sign in on this browser reads the previous
 * one's data.
 *
 * The answer comes from the sync token itself: `GET /auth/powersync-token`
 * mints an HS256 JWT whose `sub` is the user the sync rules scope to, so the
 * store is keyed by exactly the identity that filled it. The connector already
 * reads that token into JS (it has to hand it to the SDK); reading its own
 * `sub` claim adds no exposure, and the httpOnly session cookies stay
 * invisible either way (ADR-0019).
 */

const OWNER_KEY = 'rv.sync-owner';

/**
 * The owner whose local store may be opened now, or `undefined` for "nobody,
 * or cannot be told" — in which case there is no local store and the read path
 * falls back to the network.
 *
 * Only a transport failure (genuinely offline) falls back to the remembered
 * owner. That fallback is safe only because the remembered value is dropped on
 * every session change — sign-out, a fresh sign-in and a 401 all forget it
 * (`LocalStoreSession`, rule 3) — so it names the owner this browser resolved
 * from a token under the cookies it still holds, or nobody.
 *
 * Any answer the server did give that is not a readable token — 401, 5xx, a
 * middleware redirect to `/welcome`, an unparseable body — resolves to
 * `undefined` rather than to whoever was here last: the server was reachable,
 * so a remembered value that disagrees with it is exactly the stale value that
 * would leak a previous owner's rows.
 */
export async function resolveStoreOwner(): Promise<string | undefined> {
  let response: Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/auth/powersync-token`, {
      credentials: 'include',
    });
  } catch {
    // Offline, or the request never reached the API. Nothing has signed in on
    // this browser since the remembered owner did, so reading their persisted
    // store is both safe and the whole point of the offline path.
    return rememberedStoreOwner();
  }

  if (response.status === 401) {
    // Signed out. Forget the owner too, so an offline reload after sign-out
    // does not re-open the store this browser last held.
    forgetStoreOwner();
    return undefined;
  }

  const owner = await subjectOfResponse(response);
  if (owner === undefined) return undefined;

  rememberStoreOwner(owner);
  return owner;
}

/** Drop the remembered owner. Called on every session change. */
export function forgetStoreOwner(): void {
  storage()?.removeItem(OWNER_KEY);
}

/** The owner this browser last synced as, if any. */
export function rememberedStoreOwner(): string | undefined {
  return storage()?.getItem(OWNER_KEY) ?? undefined;
}

function rememberStoreOwner(owner: string): void {
  storage()?.setItem(OWNER_KEY, owner);
}

async function subjectOfResponse(
  response: Response,
): Promise<string | undefined> {
  if (!response.ok) return undefined;
  try {
    const body = (await response.json()) as { token?: unknown };
    return typeof body.token === 'string' ? subjectOf(body.token) : undefined;
  } catch {
    // Not JSON — a redirect to an HTML page, or a truncated body.
    return undefined;
  }
}

/** The `sub` claim of a JWT, without verifying it — the API already did. */
export function subjectOf(token: string): string | undefined {
  const payload = token.split('.', 2)[1];
  if (payload === undefined) return undefined;
  try {
    const claims = JSON.parse(
      atob(payload.replaceAll('-', '+').replaceAll('_', '/')),
    ) as { sub?: unknown };
    return typeof claims.sub === 'string' && claims.sub.length > 0
      ? claims.sub
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The store file an owner's rows live in. Owner-scoped rather than one shared
 * `rv-checklist.sqlite`: two owners on the same browser then cannot see the
 * same file at all, which holds even when sign-out never ran.
 */
export function storeFilenameFor(owner: string): string {
  return `rv-checklist-${owner.replaceAll(/[^\w-]/g, '_')}.sqlite`;
}
