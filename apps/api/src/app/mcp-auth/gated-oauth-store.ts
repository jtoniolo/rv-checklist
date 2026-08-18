import { ForbiddenException, Logger } from '@nestjs/common';
import type {
  IOAuthStore,
  OAuthClient,
  AuthorizationCode,
} from '@rekog/mcp-nest-auth';
import { UserEntity } from '@rv-checklist/api-data-access';
import { type Repository, DataSource } from 'typeorm';

/**
 * Thrown when a Google-authenticated user has no matching row in the app's
 * `users` table. The {@link UnknownOAuthUserFilter} catches this and redirects
 * with `error=access_denied`.
 */
export class UnknownOAuthUserException extends ForbiddenException {
  constructor(email: string | undefined) {
    super(`No app account for OAuth email: ${email ?? '(unknown)'}`);
  }
}

interface OAuthUserProfile {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  raw?: unknown;
}

interface OAuthSession {
  sessionId: string;
  state: string;
  clientId?: string;
  redirectUri?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  oauthState?: string;
  scope?: string;
  resource?: string;
  expiresAt: number;
  consentPending?: boolean;
  userId?: string;
  userProfileId?: string;
  clientMetadata?: OAuthClient;
}

/**
 * Wraps the library's `IOAuthStore` and gates `upsertUserProfile` on the
 * app's users table. If the Google-authenticated email does not match an
 * existing user, the store throws {@link UnknownOAuthUserException} instead
 * of creating a profile row.
 *
 * Created by factory in `McpOAuthModule` — not decorated `@Injectable`
 * because it receives the delegate store and `DataSource` from the factory's
 * inject list.
 */
export class GatedOAuthStore implements IOAuthStore {
  private readonly logger = new Logger(GatedOAuthStore.name);
  private readonly userRepo: Repository<UserEntity>;

  constructor(
    private readonly delegate: IOAuthStore,
    dataSource: DataSource,
  ) {
    this.userRepo = dataSource.getRepository(UserEntity);
  }

  async upsertUserProfile(
    profile: OAuthUserProfile,
    provider: string,
  ): Promise<string> {
    const email = profile.email;
    if (!email) {
      throw new UnknownOAuthUserException(undefined);
    }

    const appUser = await this.userRepo.findOne({ where: { email } });
    if (!appUser) {
      this.logger.warn(
        `Rejected OAuth sign-in: no app user for email ${email}`,
      );
      throw new UnknownOAuthUserException(email);
    }

    return this.delegate.upsertUserProfile(profile, provider);
  }

  storeClient(client: OAuthClient): Promise<OAuthClient> {
    return this.delegate.storeClient(client);
  }

  getClient(clientId: string): Promise<OAuthClient | undefined> {
    return this.delegate.getClient(clientId);
  }

  findClient(clientName: string): Promise<OAuthClient | undefined> {
    return this.delegate.findClient(clientName);
  }

  generateClientId(client: OAuthClient): string {
    return this.delegate.generateClientId(client);
  }

  storeAuthCode(code: AuthorizationCode): Promise<void> {
    return this.delegate.storeAuthCode(code);
  }

  getAuthCode(code: string): Promise<AuthorizationCode | undefined> {
    return this.delegate.getAuthCode(code);
  }

  removeAuthCode(code: string): Promise<void> {
    return this.delegate.removeAuthCode(code);
  }

  storeOAuthSession(sessionId: string, session: OAuthSession): Promise<void> {
    return this.delegate.storeOAuthSession(sessionId, session);
  }

  getOAuthSession(sessionId: string): Promise<OAuthSession | undefined> {
    return this.delegate.getOAuthSession(sessionId);
  }

  removeOAuthSession(sessionId: string): Promise<void> {
    return this.delegate.removeOAuthSession(sessionId);
  }

  getUserProfileById(
    profileId: string,
  ): Promise<
    (OAuthUserProfile & { profile_id: string; provider: string }) | undefined
  > {
    return this.delegate.getUserProfileById(profileId);
  }
}
