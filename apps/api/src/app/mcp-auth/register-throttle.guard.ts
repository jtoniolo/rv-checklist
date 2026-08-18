import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limits only `POST /api/register` (the DCR endpoint). All other
 * routes pass through without a throttle check.
 */
@Injectable()
export class RegisterThrottleGuard extends ThrottlerGuard {
  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      path: string;
    }>();
    return Promise.resolve(
      !(req.method === 'POST' && req.path === '/api/register'),
    );
  }
}
