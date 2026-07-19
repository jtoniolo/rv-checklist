import type { Id } from '@rv-checklist/domain';

/** Anything owned carries the owner it belongs to (ADR-0003: row-level ownership). */
export interface Owned {
  readonly ownerId: Id;
}

/**
 * Ownership scoping (ADR-0003) — the single place the row-level ownership rule
 * lives. Every read of an owned aggregate is scoped to the authenticated owner
 * so a query can never return, and a by-id lookup can never resolve, another
 * owner's rows. It is unit-tested here with no database; the owner-scoped
 * aggregate repositories that land in later slices (Rig, Checklist, …) route
 * their reads through it, so the guarantee is proven once, in one place.
 */

/** Keep only the rows that belong to `ownerId`. Used to scope list reads. */
export function ownedBy<T extends Owned>(rows: readonly T[], ownerId: Id): T[] {
  return rows.filter((row) => row.ownerId === ownerId);
}

/**
 * Narrow a single fetched row to the owner: return it only when it belongs to
 * them, otherwise `undefined`. A by-id lookup of another owner's row is thus
 * indistinguishable from "not found" — the row's existence never leaks.
 */
export function ownedOrUndefined<T extends Owned>(
  row: T | undefined,
  ownerId: Id,
): T | undefined {
  return row?.ownerId === ownerId ? row : undefined;
}

/**
 * The owner predicate as a filter fragment, for building owner-scoped queries
 * (e.g. merged into a TypeORM `where`). Expressed in domain terms so no SQL
 * leaks into callers.
 */
export function ownerWhere(ownerId: Id): { ownerId: Id } {
  return { ownerId };
}
