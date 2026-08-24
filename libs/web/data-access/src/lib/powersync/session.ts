import type { LocalDatabase } from './local-store.js';

/**
 * Which local store is open, and for whom (ADR-0029, decision 10). The store
 * outlives the session that filled it — it is persisted SQLite, and PowerSync
 * keeps `hasSynced` inside it — so binding it to an owner is what stops the
 * next person to sign in on this browser from reading the previous one's rows.
 *
 * Three rules, and each one holds where the one before it never ran:
 *
 * 1. **Sign-out clears.** `disconnectAndClear()` then `close()`, and the
 *    memoised store is dropped so the next sign-in opens a fresh one and
 *    connects with the new owner's token.
 * 2. **A store belonging to a different owner is never adopted.** Every open
 *    resolves who is signed in first and opens that owner's own store file. A
 *    store left behind by an owner who closed the tab without signing out is
 *    only ever opened again by that same owner.
 * 3. **Any session change forgets who was here.** `reset` drops the remembered
 *    owner whether or not it clears, because the remembered owner is what
 *    `resolveOwner` falls back to when it cannot reach the server. Leaving the
 *    previous owner remembered across a sign-in turns one failed token request
 *    into the previous owner's store being opened for — and connected with the
 *    token of — the new one. A fresh sign-in is online by construction, so the
 *    incoming owner is resolved from the server anyway; the cost of forgetting
 *    is at worst no local store until the next reload.
 *
 * The owner is resolved before the store is handed out, not alongside it: a
 * store that has already synced answers `waitForFirstSync` immediately, so any
 * window between opening and knowing whose it is is a window in which watches
 * emit the wrong owner's rows.
 *
 * This module holds no `@powersync/web` import so the policy is testable
 * without a Worker, wasm or IndexedDB; `client.ts` supplies the real deps.
 */

export interface LocalStoreSessionDeps {
  /** Who is signed in, or `undefined` for "nobody, or cannot be told". */
  readonly resolveOwner: () => Promise<string | undefined>;
  /** Open (creating if absent) the store belonging to `owner`. */
  readonly openStore: (owner: string) => Promise<LocalDatabase>;
  /** Drop the remembered owner. Called on every session change. */
  readonly forgetOwner: () => void;
}

export interface LocalStoreSession {
  /**
   * The signed-in owner's local store, or `undefined` when there is none.
   * Rejects if opening the store fails; the failure is not memoised, so a
   * later subscription retries rather than inheriting a dead store.
   */
  open(): Promise<LocalDatabase | undefined>;
  /**
   * End the session's hold on the store. `clear: true` (sign-out) deletes the
   * rows as well as closing it; `clear: false` (a fresh sign-in) only closes,
   * because the incoming owner's store is a different file anyway. Either way
   * the remembered owner is forgotten — see rule 3 above.
   */
  reset(options: { clear: boolean }): Promise<void>;
}

interface OpenStore {
  readonly owner: string;
  readonly database: Promise<LocalDatabase>;
}

export function createLocalStoreSession(
  deps: LocalStoreSessionDeps,
): LocalStoreSession {
  // The owner is memoised per page: resolving it costs a request, and every
  // watched cache entry opens the store. Both ways the signed-in owner can
  // change while the page lives — sign-out and sign-in — go through `reset`,
  // which drops it.
  let owner: Promise<string | undefined> | undefined;
  let current: OpenStore | undefined;

  const open = async (): Promise<LocalDatabase | undefined> => {
    owner ??= deps.resolveOwner();
    const signedInOwner = await owner;

    // Every branch below decides what `current` is *before* awaiting anything,
    // because concurrent opens (one per watched cache entry) all resume from
    // the line above: an await between the check and the assignment would let
    // two of them each open a store.
    if (signedInOwner === undefined) {
      // Nobody is signed in, or the answer was not trustworthy. Release
      // anything still open — without clearing, since we do not know whose it
      // is — and leave the read path to the network.
      const displaced = current;
      current = undefined;
      await disposeOf(displaced, { clear: false });
      return undefined;
    }

    if (current?.owner !== signedInOwner) {
      const displaced = current;
      current = {
        owner: signedInOwner,
        database: deps.openStore(signedInOwner),
      };
      await disposeOf(displaced, { clear: false });
    }

    const opened = current;
    try {
      return await opened.database;
    } catch (error) {
      // A rejected open must not be memoised: the worker fetch can fail for a
      // reason that passes (an expired access cookie answered with a redirect),
      // and every later subscription would inherit the same dead promise.
      if (current === opened) current = undefined;
      throw error;
    }
  };

  const reset = async ({ clear }: { clear: boolean }): Promise<void> => {
    const opened = current;
    current = undefined;
    owner = undefined;
    // Unconditional, not `if (clear)`: the signed-in identity has changed by
    // the time this runs, so whoever is remembered is the wrong answer for the
    // next offline resolve (rule 3).
    deps.forgetOwner();
    await disposeOf(opened, { clear });
  };

  return { open, reset };
}

async function disposeOf(
  opened: OpenStore | undefined,
  { clear }: { clear: boolean },
): Promise<void> {
  if (opened === undefined) return;
  let database: LocalDatabase;
  try {
    database = await opened.database;
  } catch {
    // An open that never succeeded has nothing to release, and its rejection
    // is the opener's to report, not this path's.
    return;
  }
  try {
    await (clear ? database.clear() : database.close());
  } catch {
    // Best effort. A store that cannot be closed is still unreachable from
    // here — nothing holds a reference to it any more.
  }
}
