import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from '@rv-checklist/api-data-access';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ChecklistModule } from './checklist/checklist.module.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { validateEnv, type Env } from './config/env.js';
import { EquipmentModule } from './equipment/equipment.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { MapsModule } from './maps/maps.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { McpOAuthModule } from './mcp-auth/mcp-oauth.module.js';
import { McpTokenModule } from './mcp-token/mcp-token.module.js';
import { OAuthGrantModule } from './oauth-grant/oauth-grant.module.js';
import { RigModule } from './rig/rig.module.js';
import { RunModule } from './run/run.module.js';
import { SessionModule } from './session/session.module.js';
import { TripsModule } from './trips/trips.module.js';

/**
 * Root module (issue #13). Loads and validates the environment globally, opens
 * the Postgres connection (running migrations at startup), and mounts the auth
 * platform and feature modules.
 *
 * The global `ZodValidationPipe` and `ZodSerializerInterceptor` (nestjs-zod,
 * ADR-0009) make the shared Zod schemas the one source of validation truth:
 * every request body is validated against its DTO schema and every `@ZodSerializerDto`
 * response is validated/serialised on the way out.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        buildDataSourceOptions(config.get('DATABASE_URL', { infer: true })),
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    RigModule,
    ChecklistModule,
    EquipmentModule,
    RunModule,
    MaintenanceModule,
    McpOAuthModule,
    McpModule,
    McpTokenModule,
    OAuthGrantModule,
    SessionModule,
    MapsModule,
    TripsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    // Logs the detail behind server-side failures (nestjs-zod serialization
    // errors and other 5xx) that Nest's default filter otherwise swallows.
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
