import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the **idempotency_keys** table (issue #142, ADR-0028) — the dedup
 * ledger behind the `Idempotency-Key` header. One row per successfully
 * executed keyed request, unique per (user, key) so a replayed key can be
 * answered from the recorded response instead of re-running the handler.
 * `response_body` is nullable for bodiless successes (204). Rows cascade away
 * with their user, and `created_at` is indexed for the retention prune.
 *
 * Reversible: the down-migration drops the table.
 */
export class IdempotencyKeys1721003000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "idempotency_keys" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "key" uuid NOT NULL,
        "method" text NOT NULL,
        "path" text NOT NULL,
        "status" int NOT NULL,
        "response_body" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_idempotency_keys_user_id_key" ON "idempotency_keys" ("user_id", "key")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_idempotency_keys_created_at" ON "idempotency_keys" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "idempotency_keys"`);
  }
}
