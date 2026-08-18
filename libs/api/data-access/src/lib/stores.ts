/**
 * Auth persistence ports (issue #13) — the seam that keeps the auth flow
 * unit-testable with no database. Production binds these to the TypeORM-backed
 * stores in this lib; tests bind them to in-memory doubles. Expressed in plain
 * domain terms so no TypeORM shape leaks into the service.
 */

/** A persisted user (the Owner), as the auth flow needs to see it. */
export interface UserRecord {
  readonly id: string;
  readonly googleSub: string;
  readonly email: string;
  readonly name: string | undefined;
  readonly picture: string | undefined;
}

/** The Google-derived fields written on sign-in. */
export interface UpsertUserInput {
  readonly googleSub: string;
  readonly email: string;
  readonly name: string | undefined;
  readonly picture: string | undefined;
}

/**
 * An upsert's outcome: the user, and whether the call created them. `created`
 * marks the one moment an owner is brand-new — the trigger for first-sign-in
 * work like starter-content seeding (issue #19).
 */
export interface UpsertUserResult {
  readonly user: UserRecord;
  readonly created: boolean;
}

export abstract class UserStore {
  abstract findById(id: string): Promise<UserRecord | undefined>;
  abstract findByEmail(email: string): Promise<UserRecord | undefined>;
  /** Create the user, or update their profile if the Google subject already exists. */
  abstract upsertByGoogleSub(input: UpsertUserInput): Promise<UpsertUserResult>;
}

/** A persisted refresh token, minus the secret (only its hash is stored). */
export interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  /** When the token was revoked, or `undefined` while it is still live. */
  readonly revokedAt: Date | undefined;
}

export interface CreateRefreshTokenInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export abstract class RefreshTokenStore {
  abstract create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;
  abstract findByHash(
    tokenHash: string,
  ): Promise<RefreshTokenRecord | undefined>;
  /** Revoke a token, recording the token that replaced it (rotation), if any. */
  abstract revoke(id: string, replacedById: string | undefined): Promise<void>;
}

/** A persisted MCP token (ADR-0022), minus the secret (only its hash is stored). */
export interface McpTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly createdAt: Date;
  readonly revokedAt: Date | undefined;
  readonly lastUsedAt: Date | undefined;
}

export abstract class McpTokenStore {
  /** Atomically revoke all active tokens for the user and create a new one. */
  abstract replaceForUser(
    userId: string,
    tokenHash: string,
  ): Promise<McpTokenRecord>;
  abstract findActiveByHash(
    tokenHash: string,
  ): Promise<McpTokenRecord | undefined>;
  abstract findActiveByUser(
    userId: string,
  ): Promise<McpTokenRecord | undefined>;
  abstract revokeForUser(userId: string): Promise<void>;
  abstract updateLastUsed(id: string): Promise<void>;
}
