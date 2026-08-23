import {
  BadRequestException,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyKeyRepository } from '@rv-checklist/api-data-access';
import type { Owner } from '@rv-checklist/domain';
import { concatMap, of, type Observable } from 'rxjs';

/** How long a recorded outcome answers replays — comfortably longer than any plausible offline stretch. */
export const IDEMPOTENCY_RETENTION_DAYS = 60;

/** The methods with side effects — the only ones a queued offline operation replays. */
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Routes that must never land in the dedup ledger: the app's own auth surface,
 * the MCP OAuth library's endpoints (`/api/register`, `/api/token`,
 * `/api/authorize`, the root discovery documents), and the MCP token rotation —
 * every one of them can carry a credential in its response body. The leading
 * `/api` is optional because tests mount controllers without the global prefix.
 */
const EXCLUDED_PATHS =
  /^(?:\/api)?\/(?:auth(?:\/|$)|mcp-token(?:\/|$)|register$|token$|authorize(?:\/|$)|\.well-known\/)/;

/** Nest's `@HttpCode` metadata key — how the reply status is derived before it is sent. */
const HTTP_CODE_METADATA = '__httpCode__';

/** The slice of the Express request this interceptor reads. */
interface IdempotentRequest {
  method: string;
  path: string;
  url: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | undefined>;
  /** The authenticated owner, put on the request by the JWT guard. */
  user?: Owner;
}

interface StatusSettableResponse {
  status(code: number): unknown;
}

/**
 * Offline replay safety (issue #142, ADR-0028): one mechanism for every
 * mutating endpoint instead of per-endpoint fixes. The offline queue stamps
 * each queued operation with a client-generated uuid in the `Idempotency-Key`
 * header; the first successful (2xx) execution records the wire response in
 * the dedup ledger, and a replay of the same (user, key) returns that recorded
 * outcome without reaching the handler. That is what makes the traps safe: a
 * replayed arrived-leg edit cannot move the rig's Distance twice, and a
 * replayed completion of a one-time task (whose first call deleted the task)
 * gets its original 201 back instead of a 404.
 *
 * Registered as the **first** global interceptor, so it sits outside the Zod
 * serializer: it records the serialized wire body (plain JSON — round-trips
 * through jsonb, dates and multipart-upload metadata included), and a replay
 * bypasses serialization entirely. Requests without the header, non-mutating
 * methods, unauthenticated requests, and the credential-bearing routes in
 * {@link EXCLUDED_PATHS} take the untouched pass-through path. A malformed
 * (non-uuid) key is a 400 — a client bug, not a missing header.
 *
 * Failures are deliberately not recorded: only a 2xx outcome lands in the
 * ledger, so a genuine retry after a transient error can still succeed.
 * Concurrent requests with the same key can race the lookup-then-record
 * window and both execute; the offline queue replays serially (ADR-0028), so
 * this groundwork accepts that and lets the unique (user_id, key) row keep
 * first-write-wins on the record itself.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly keys: IdempotencyKeyRepository,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<IdempotentRequest>();

    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }
    const header = request.headers['idempotency-key'];
    if (header === undefined) {
      return next.handle();
    }
    if (EXCLUDED_PATHS.test(request.path)) {
      return next.handle();
    }
    const userId = request.user?.id;
    if (userId === undefined) {
      return next.handle();
    }
    if (typeof header !== 'string' || !UUID_PATTERN.test(header)) {
      throw new BadRequestException('Idempotency-Key must be a single uuid');
    }
    const key = header.toLowerCase();

    const recorded = await this.keys.find(userId, key);
    if (recorded) {
      // Belt and braces: Nest re-applies the route's status metadata on reply,
      // which matches the recorded status for any given route. A recorded
      // `undefined` body replays a bodiless 204 faithfully.
      http.getResponse<StatusSettableResponse>().status(recorded.status);
      return of(recorded.body);
    }

    return next.handle().pipe(
      concatMap(async (body: unknown) => {
        // The response object's statusCode is not final until Nest replies, so
        // derive the status the way Nest will: @HttpCode metadata, else the
        // method default. An emitted value means the handler succeeded — errors
        // take the exception path and are never recorded.
        const status =
          this.reflector.get<number | undefined>(
            HTTP_CODE_METADATA,
            context.getHandler(),
          ) ?? (request.method === 'POST' ? 201 : 200);
        try {
          await this.keys.record({
            userId,
            key,
            method: request.method,
            path: request.originalUrl ?? request.url,
            status,
            body,
          });
          // Opportunistic retention: each successful record sweeps expired
          // rows, off the response's critical path.
          void this.keys.prune(IDEMPOTENCY_RETENTION_DAYS).catch(() => {
            this.logger.warn('idempotency-key prune failed');
          });
        } catch (error) {
          // The side effects already happened; failing the response now would
          // make the client retry and apply them again. Answer with the real
          // outcome and lose only the replay protection for this key.
          this.logger.error('failed to record idempotency key', error);
        }
        return body;
      }),
    );
  }
}
