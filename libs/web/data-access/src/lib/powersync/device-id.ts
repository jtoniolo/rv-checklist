import { storage } from '../storage.js';

/**
 * A random id naming this browser installation, persisted in localStorage.
 *
 * PowerSync's per-entry `clientId` (ADR-0028's upload queue) is a small
 * integer that auto-increments from zero inside one local SQLite file, so it
 * repeats across devices and across a store recreated after sign-out/back-in.
 * The Idempotency-Key dedup table is keyed by `(user, key)` (#142) — the same
 * owner can be signed in on two devices at once — so an idempotency key built
 * from `clientId` alone would let device B's first queued write collide with
 * device A's already-recorded one: the server would hand device B back A's
 * stored response instead of applying B's write. Prefixing every key with
 * this id keeps two devices' queues from ever sharing one (`connector.ts`).
 */
const DEVICE_ID_KEY = 'rv.sync-device-id';

/** This installation's id, minting and persisting one on first use. */
export function syncDeviceId(): string {
  const store = storage();
  if (!store) return 'no-storage';

  const existing = store.getItem(DEVICE_ID_KEY);
  if (existing !== null) return existing;

  const created = crypto.randomUUID();
  store.setItem(DEVICE_ID_KEY, created);
  return created;
}
