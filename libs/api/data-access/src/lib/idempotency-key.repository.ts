import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyKeyEntity } from './entities/idempotency-key.entity.js';

/** A recorded outcome, as the replay path needs it: the status to set and the body to emit. */
export interface RecordedResponse {
  readonly status: number;
  /** The response body as sent on the wire, or `undefined` for a bodiless success (204). */
  readonly body: unknown;
}

/** Everything the first successful execution of a keyed request leaves behind. */
export interface RecordResponseInput {
  readonly userId: string;
  readonly key: string;
  readonly method: string;
  /** Stored for debuggability only — dedup matches on (userId, key) alone. */
  readonly path: string;
  readonly status: number;
  readonly body: unknown;
}

/**
 * The dedup ledger behind the `Idempotency-Key` header (issue #142,
 * ADR-0028), as a concrete Nest DI token (an abstract class, so it survives
 * type erasure). The global idempotency interceptor injects this; production
 * binds it to {@link TypeOrmIdempotencyKeyRepository} and the interceptor
 * tests bind an in-memory double. Purely infrastructure — no domain model,
 * so the port lives here rather than in `@rv-checklist/domain`.
 */
export abstract class IdempotencyKeyRepository {
  /** The recorded outcome for this (user, key), or `undefined` on first sight. */
  abstract find(
    userId: string,
    key: string,
  ): Promise<RecordedResponse | undefined>;
  /**
   * Record a successful outcome. First write wins: a concurrent duplicate is
   * silently ignored (unique (user_id, key)), never an error.
   */
  abstract record(input: RecordResponseInput): Promise<void>;
  /** Delete rows older than `olderThanDays` days; returns how many went. */
  abstract prune(olderThanDays: number): Promise<number>;
}

/**
 * TypeORM-backed {@link IdempotencyKeyRepository} (ADR-0009). A stored SQL
 * NULL body comes back as `undefined` — the replay emits no body, exactly as
 * the original 204 did. Pruning is a raw age-based DELETE (the
 * {@link StaleClientCleanupService} shape) so it can be run from anywhere.
 */
@Injectable()
export class TypeOrmIdempotencyKeyRepository extends IdempotencyKeyRepository {
  constructor(
    @InjectRepository(IdempotencyKeyEntity)
    private readonly repo: Repository<IdempotencyKeyEntity>,
  ) {
    super();
  }

  async find(
    userId: string,
    key: string,
  ): Promise<RecordedResponse | undefined> {
    const found = await this.repo.findOne({ where: { userId, key } });
    return found
      ? { status: found.status, body: found.responseBody ?? undefined }
      : undefined;
  }

  async record(input: RecordResponseInput): Promise<void> {
    // Raw SQL (the StaleClientCleanupService shape): ON CONFLICT DO NOTHING
    // keeps first-write-wins under a concurrent duplicate, and sidesteps the
    // query builder's typing of the `unknown` jsonb column.
    await this.repo.query(
      `INSERT INTO idempotency_keys
         (user_id, "key", method, path, status, response_body)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, "key") DO NOTHING`,
      [
        input.userId,
        input.key,
        input.method,
        input.path,
        input.status,
        // eslint-disable-next-line unicorn/no-null -- SQL NULL marks a bodiless success
        input.body === undefined ? null : JSON.stringify(input.body),
      ],
    );
  }

  async prune(olderThanDays: number): Promise<number> {
    const result: [unknown[], number] = await this.repo.query(
      `DELETE FROM idempotency_keys
       WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [olderThanDays],
    );
    return result[1];
  }
}
