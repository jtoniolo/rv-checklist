import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpAuthModule, GoogleOAuthProvider } from '@rekog/mcp-nest-auth';
import type { Env } from '../config/env.js';
import {
  MCP_REDIRECT_ALLOWLIST,
  RedirectAllowlistMiddleware,
} from './redirect-allowlist.middleware.js';

const issuerUrl = process.env['MCP_ISSUER_URL'] ?? 'http://localhost:3000';
const resourceUrl = process.env['MCP_RESOURCE_URL'] ?? `${issuerUrl}/api/mcp`;

/**
 * MCP OAuth 2.1 authorization server (ADR-0024, issue #93). Wraps
 * `McpAuthModule.forRoot` with the project-specific configuration: issuer
 * URL, HS256 signing, 30-day access token TTL, Google federation, TypeORM
 * store on the existing Postgres, and the redirect-URI allowlist middleware
 * on the DCR endpoint.
 *
 * The library's `apiPrefix: 'api'` makes the metadata documents advertise
 * endpoints under `/api` (matching the NestJS global prefix). The well-known
 * discovery paths are served at the root — the global prefix excludes them
 * (see `main.ts`).
 */
@Module({
  imports: [
    McpAuthModule.forRoot({
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
    }),
  ],
  providers: [
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
