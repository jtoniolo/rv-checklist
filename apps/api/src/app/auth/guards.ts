import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Requires a valid bearer access JWT; populates the request with the {@link Owner}. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

/** Requires a valid Google One Tap credential in the request body. */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google-id-token') {}
