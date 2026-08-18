import { Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module.js';
import type { Env } from './app/config/env.js';
import { mcpStrategy } from './app/mcp/mcp.module.js';

/**
 * API bootstrap (issue #13, ADR-0019, ADR-0021, ADR-0024). Opens the app,
 * registers cookie-parser so `req.cookies` is populated for both the
 * httpOnly auth flow and the MCP OAuth consent flow, enables CORS with
 * credentials so the browser sends cookies cross-origin, mounts the MCP
 * microservice transport (ADR-0021), and listens.
 *
 * The global prefix excludes:
 * - `.well-known/*` — RFC 8414/9728 discovery documents must be served at
 *   the root, not under `/api` (ADR-0024).
 * - `api/*` — the MCP OAuth library (`@rekog/mcp-nest-auth`) already
 *   prefixes its own routes with `apiPrefix: 'api'`; without this exclusion
 *   they would get double-prefixed.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.use(cookieParser());
  app.setGlobalPrefix('api', {
    exclude: [
      { path: '.well-known/(.*)', method: RequestMethod.ALL },
      { path: 'api/(.*)', method: RequestMethod.ALL },
    ],
  });
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });

  mcpStrategy.setHttpAdapter(app.getHttpAdapter());
  app.connectMicroservice({ strategy: mcpStrategy });
  await app.startAllMicroservices();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`🚀 API running on http://localhost:${String(port)}/api`);
}

void bootstrap();
