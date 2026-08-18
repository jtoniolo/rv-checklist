import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the MCP OAuth grant and refresh-token-family tables (issue #94,
 * ADR-0024). Each authorization-code exchange creates a grant; each
 * refresh uses a new token in the same family. Reuse of a spent refresh
 * token revokes the entire grant.
 *
 * Reversible: the down-migration drops both tables.
 */
export class McpOAuthGrants1721002000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "mcp_oauth_grants" (
        "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"      text NOT NULL,
        "client_id"    text NOT NULL,
        "scope"        text,
        "created_at"   timestamptz NOT NULL DEFAULT now(),
        "last_used_at" timestamptz,
        "revoked_at"   timestamptz
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_mcp_oauth_grants_user_client"
        ON "mcp_oauth_grants" ("user_id", "client_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "mcp_oauth_refresh_tokens" (
        "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "grant_id"   uuid NOT NULL
                       REFERENCES "mcp_oauth_grants" ("id") ON DELETE CASCADE,
        "token_hash" text NOT NULL,
        "generation" integer NOT NULL DEFAULT 1,
        "spent_at"   timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_mcp_oauth_refresh_token_hash"
        ON "mcp_oauth_refresh_tokens" ("token_hash")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_mcp_oauth_refresh_tokens_grant"
        ON "mcp_oauth_refresh_tokens" ("grant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_oauth_refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_oauth_grants"`);
  }
}
