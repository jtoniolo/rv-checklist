import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module.js';
import type { Env } from './app/config/env.js';
import { mcpStrategy } from './app/mcp/mcp.module.js';

/**
 * API bootstrap (issue #13, ADR-0019, ADR-0021). Opens the app, registers
 * cookie-parser so `req.cookies` is populated for the httpOnly auth flow,
 * enables CORS with credentials so the browser sends cookies cross-origin,
 * mounts the MCP microservice transport (ADR-0021), and listens.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.use(cookieParser());
  app.setGlobalPrefix('api');
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
