import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Owner } from '@rv-checklist/domain';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.js';
import { UserStore } from '../stores.js';

/** The verified access-token payload (see {@link TokenService}). */
interface JwtPayload {
  readonly sub: string;
  readonly email: string;
}

/**
 * The resource-server guard (ADR-0002): validate the bearer access JWT on every
 * API call, statelessly. The token's signature and expiry are checked by
 * passport-jwt; `validate` then loads the owner it names so downstream handlers
 * receive a real {@link Owner}, and a token for a since-deleted user is rejected.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UserStore,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  async validate(payload: JwtPayload): Promise<Owner> {
    const user = await this.users.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    };
  }
}
