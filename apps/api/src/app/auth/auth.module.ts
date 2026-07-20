import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RefreshTokenEntity,
  RefreshTokenStore,
  TypeOrmRefreshTokenStore,
  TypeOrmUserStore,
  UserEntity,
  UserStore,
} from '@rv-checklist/api-data-access';
import type { Env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Clock, SystemClock } from './clock.js';
import {
  GoogleAuthLibraryVerifier,
  GoogleIdTokenVerifier,
} from './google-verifier.js';
import { MeController } from './me.controller.js';
import { GoogleIdTokenStrategy } from './strategies/google-id-token.strategy.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { TokenService } from './token.service.js';

/**
 * Auth module (ADR-0002) — binds the ports to their production implementations
 * and registers the Passport strategies. The abstract ports ({@link UserStore},
 * {@link RefreshTokenStore}, {@link GoogleIdTokenVerifier}, {@link Clock}) are
 * the seams the unit tests swap out.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
      }),
    }),
    TypeOrmModule.forFeature([UserEntity, RefreshTokenEntity]),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    TokenService,
    JwtStrategy,
    GoogleIdTokenStrategy,
    { provide: Clock, useClass: SystemClock },
    { provide: GoogleIdTokenVerifier, useClass: GoogleAuthLibraryVerifier },
    { provide: UserStore, useClass: TypeOrmUserStore },
    { provide: RefreshTokenStore, useClass: TypeOrmRefreshTokenStore },
  ],
})
export class AuthModule {}
