import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add session tracking to refresh tokens (issue #98). A session groups a
 * rotation chain under one UUID so the owner can list and revoke web sessions
 * from the connected-apps page. Existing rows keep NULL session_id — they
 * predate sessions and expire naturally.
 *
 * Reversible: the down-migration drops the three new columns.
 */
export class RefreshTokenSessions1721002100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        ADD COLUMN "session_id"    uuid,
        ADD COLUMN "user_agent"    text,
        ADD COLUMN "last_used_at"  timestamptz
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_refresh_tokens_session"
        ON "refresh_tokens" ("session_id")
        WHERE "session_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_refresh_tokens_session"
    `);
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
        DROP COLUMN IF EXISTS "last_used_at",
        DROP COLUMN IF EXISTS "user_agent",
        DROP COLUMN IF EXISTS "session_id"
    `);
  }
}
