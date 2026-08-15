import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStore } from '@rv-checklist/api-data-access';
import type { Owner } from '@rv-checklist/domain';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.js';
import { ACCESS_COOKIE } from '../token.service.js';

/** The verified access-token payload (see {@link TokenService}). */
interface JwtPayload {
  readonly sub: string;
  readonly email: string;
}

function fromAccessCookie(req: Request): string | null {
  return (
    // eslint-disable-next-line unicorn/no-null -- passport-jwt requires null
    (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE] ?? null
  );
}

/**
 * The resource-server guard (ADR-0002, ADR-0019): validate the access JWT on
 * every API call, statelessly. Two extractors: the httpOnly access cookie
 * (browser and SSR) and the Authorization bearer header (future React Native).
 * The cookie extractor runs first so browser requests hit the fast path.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UserStore,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        fromAccessCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
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
