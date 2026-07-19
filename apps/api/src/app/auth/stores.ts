/**
 * Auth persistence ports (issue #13) — the seam that keeps {@link AuthService}
 * unit-testable with no database. Production binds these to the TypeORM-backed
 * stores; tests bind them to in-memory doubles. Expressed in plain domain terms
 * so no TypeORM shape leaks into the service.
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

export abstract class UserStore {
  abstract findById(id: string): Promise<UserRecord | undefined>;
  /** Create the user, or update their profile if the Google subject already exists. */
  abstract upsertByGoogleSub(input: UpsertUserInput): Promise<UserRecord>;
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
