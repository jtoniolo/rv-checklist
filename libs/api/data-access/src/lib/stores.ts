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
  /** The session this token belongs to, or `undefined` for pre-session legacy tokens. */
  readonly sessionId: string | undefined;
}

export interface CreateRefreshTokenInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly sessionId: string | undefined;
  readonly userAgent: string | undefined;
}

/** A web session as shown on the connected-apps page — one row per rotation chain. */
export interface WebSessionRecord {
  readonly sessionId: string;
  readonly userAgent: string | undefined;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | undefined;
}

export abstract class RefreshTokenStore {
  abstract create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;
  abstract findByHash(
    tokenHash: string,
  ): Promise<RefreshTokenRecord | undefined>;
  /** Revoke a token, recording the token that replaced it (rotation), if any. */
  abstract revoke(id: string, replacedById: string | undefined): Promise<void>;
  /** Touch `last_used_at` on the token row. */
  abstract updateLastUsed(id: string): Promise<void>;
  /** List active sessions for a user, grouped by session_id. */
  abstract findActiveSessionsByUser(
    userId: string,
  ): Promise<WebSessionRecord[]>;
  /** Revoke every token in the given session. */
  abstract revokeBySessionId(sessionId: string): Promise<void>;
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
