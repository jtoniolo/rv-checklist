import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module.js';
import type { Env } from './app/config/env.js';

/**
 * API bootstrap (issue #13). Opens the app (TypeORM runs migrations against the
 * local Postgres as it initialises), allows the web origin through CORS so the
 * browser can call the API directly with its bearer token (ADR-0002), and
 * listens. Everything it needs is read from the validated environment.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }) });

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`🚀 API running on http://localhost:${String(port)}/api`);
}

void bootstrap();
