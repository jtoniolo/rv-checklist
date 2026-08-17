import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the **mcp_tokens** table (ADR-0022). One active bearer token per user
 * for MCP access. Stores only the SHA-256 hash; no expiry column because the
 * token lives until explicitly revoked or regenerated.
 *
 * Reversible: the down-migration drops the table.
 */
export class McpTokens1721001600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "mcp_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "token_hash" text NOT NULL,
        "revoked_at" timestamptz,
        "last_used_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_mcp_tokens_token_hash" ON "mcp_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_mcp_tokens_user_id" ON "mcp_tokens" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "mcp_tokens"`);
  }
}
