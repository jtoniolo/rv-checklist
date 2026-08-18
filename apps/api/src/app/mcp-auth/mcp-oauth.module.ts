import {
  type DynamicModule,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  McpAuthModule,
  GoogleOAuthProvider,
  type IOAuthStore,
} from '@rekog/mcp-nest-auth';
import { DataSource } from 'typeorm';
import type { Env } from '../config/env.js';
import { GatedOAuthStore } from './gated-oauth-store.js';
import { OAuthGrantService } from './oauth-grant.service.js';
import {
  MCP_REDIRECT_ALLOWLIST,
  RedirectAllowlistMiddleware,
} from './redirect-allowlist.middleware.js';
import { RegisterThrottleGuard } from './register-throttle.guard.js';
import { StaleClientCleanupService } from './stale-client-cleanup.service.js';
import { TokenGrantInterceptor } from './token-grant.interceptor.js';
import { UnknownOAuthUserFilter } from './unknown-user.filter.js';

const issuerUrl = process.env['MCP_ISSUER_URL'] ?? 'http://localhost:3000';
const resourceUrl = process.env['MCP_RESOURCE_URL'] ?? `${issuerUrl}/api/mcp`;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Internal store token the library's controller injects. This is
 * `IOAuthStore_<authModuleId>` where the ID is auto-incremented from 0.
 * Since this is the only `McpAuthModule.forRoot` call in the app, the ID
 * is always `mcp-auth-module-0`.
 */
const LIBRARY_STORE_TOKEN = 'IOAuthStore_mcp-auth-module-0';

/**
 * Token under which the original (un-gated) TypeOrmStore lives after we
 * rename it. The {@link GatedOAuthStore} factory injects from here.
 */
const DELEGATE_TOKEN = 'IOAuthStore_delegate';

/**
 * Build the `McpAuthModule` dynamic module and patch its provider list so
 * the library's `TypeOrmStore` is wrapped by {@link GatedOAuthStore}.
 *
 * The gated store checks the app's `users` table before allowing a profile
 * upsert — unknown Google accounts get `error=access_denied` instead of a
 * new profile row.
 */
function buildAuthModule(): DynamicModule {
  const dynamicModule = McpAuthModule.forRoot({
    provider: GoogleOAuthProvider,
    clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
    clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
    jwtSecret: process.env['MCP_JWT_SECRET'] ?? '',

    serverUrl: issuerUrl,
    resource: resourceUrl,

    jwtAccessTokenExpiresIn: '30d',
    jwtRefreshTokenExpiresIn: '3650d',
    enableRefreshTokens: true,

    requirePkce: true,
    apiPrefix: 'api',

    consent: {
      enabled: true,
      rememberForMs: THIRTY_DAYS_MS,
    },

    storeConfiguration: {
      type: 'typeorm',
      options: {
        type: 'postgres',
        url: process.env['DATABASE_URL'] ?? '',
        synchronize: false,
        migrationsRun: false,
      },
    },

    protectedResourceMetadata: {
      scopesSupported: ['mcp', 'offline_access'],
    },
    authorizationServerMetadata: {
      tokenEndpointAuthMethodsSupported: ['none', 'client_secret_post'],
      scopesSupported: ['mcp', 'offline_access'],
      codeChallengeMethodsSupported: ['S256'],
    },
  });

  const providers = dynamicModule.providers ?? [];

  // Rename the original TypeOrmStore provider to a delegate token.
  for (const p of providers) {
    if (
      typeof p === 'object' &&
      'provide' in p &&
      p.provide === LIBRARY_STORE_TOKEN
    ) {
      (p as { provide: string }).provide = DELEGATE_TOKEN;
      break;
    }
  }

  // Insert the gated store under the original token. The library's
  // controller injects LIBRARY_STORE_TOKEN, so it gets our wrapper.
  // DataSource (the app's default connection) is globally available from
  // AppModule's TypeOrmModule.forRootAsync.
  providers.push({
    provide: LIBRARY_STORE_TOKEN,
    useFactory: (delegate: IOAuthStore, ds: DataSource) =>
      new GatedOAuthStore(delegate, ds),
    inject: [DELEGATE_TOKEN, DataSource],
  });

  // Update the IOAuthStore alias to point through the gated store.
  for (const p of providers) {
    if (
      typeof p === 'object' &&
      'provide' in p &&
      p.provide === 'IOAuthStore' &&
      'useExisting' in p
    ) {
      (p as { useExisting: string }).useExisting = LIBRARY_STORE_TOKEN;
      break;
    }
  }

  return dynamicModule;
}

/**
 * MCP OAuth 2.1 authorization server (ADR-0024, issues #93, #94, #95).
 * Wraps `McpAuthModule.forRoot` with the project-specific configuration:
 * issuer URL, HS256 signing, 30-day access token TTL, Google federation,
 * consent screen, TypeORM store on the existing Postgres, and the
 * redirect-URI allowlist middleware on the DCR endpoint.
 *
 * Token-level security (refresh-token rotation, reuse detection, grant_id
 * claims, and redirect_uri validation) is enforced by the
 * {@link TokenGrantInterceptor}, which wraps the library's token endpoint.
 *
 * Unknown Google accounts (no matching row in the app's `users` table) are
 * rejected with `error=access_denied` via {@link GatedOAuthStore} and the
 * {@link UnknownOAuthUserFilter}.
 *
 * Rate-limits the DCR registration endpoint per IP (issue #95) and runs a
 * daily cleanup job that removes stale client registrations.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    buildAuthModule(),
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: UnknownOAuthUserFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TokenGrantInterceptor,
    },
    OAuthGrantService,
    {
      provide: MCP_REDIRECT_ALLOWLIST,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config
          .get('MCP_REDIRECT_ALLOWLIST', { infer: true })
          .split(',')
          .map((u: string) => u.trim())
          .filter(Boolean),
    },
    RedirectAllowlistMiddleware,
    { provide: APP_GUARD, useClass: RegisterThrottleGuard },
    StaleClientCleanupService,
  ],
  exports: [MCP_REDIRECT_ALLOWLIST],
})
export class McpOAuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RedirectAllowlistMiddleware)
      .forRoutes({ path: 'api/register', method: RequestMethod.POST });
  }
}
