import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the four tables used by `@rekog/mcp-nest-auth`'s TypeORM store
 * (issue #93, ADR-0024). Table names use the library's `rekog_mcp_auth_`
 * prefix so they coexist cleanly with the application tables.
 *
 * Reversible: the down-migration drops the tables.
 */
export class McpOAuthTables1721001900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rekog_mcp_auth_clients" (
        "client_id"                    text PRIMARY KEY,
        "client_secret"                text,
        "client_name"                  text NOT NULL,
        "client_description"           text,
        "logo_uri"                     text,
        "client_uri"                   text,
        "developer_name"               text,
        "developer_email"              text,
        "redirect_uris"                text NOT NULL,
        "grant_types"                  text NOT NULL,
        "response_types"               text NOT NULL,
        "token_endpoint_auth_method"   text NOT NULL,
        "application_type"             text,
        "created_at"                   timestamptz NOT NULL DEFAULT now(),
        "updated_at"                   timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rekog_mcp_auth_authorization_codes" (
        "code"                  text PRIMARY KEY,
        "user_id"               text NOT NULL,
        "client_id"             text NOT NULL,
        "redirect_uri"          text NOT NULL,
        "code_challenge"        text NOT NULL,
        "code_challenge_method" text NOT NULL,
        "expires_at"            bigint NOT NULL,
        "resource"              text NOT NULL,
        "scope"                 text,
        "used_at"               timestamptz,
        "user_profile_id"       text,
        "client_metadata"       text,
        "created_at"            timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rekog_mcp_auth_sessions" (
        "sessionId"           text PRIMARY KEY,
        "state"               text NOT NULL,
        "clientId"            text,
        "redirectUri"         text,
        "codeChallenge"       text,
        "codeChallengeMethod" text,
        "oauthState"          text,
        "resource"            text,
        "scope"               text,
        "expiresAt"           bigint NOT NULL,
        "consentPending"      boolean,
        "userId"              text,
        "userProfileId"       text,
        "clientMetadata"      text,
        "created_at"          timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rekog_mcp_auth_user_profiles" (
        "profile_id"       text PRIMARY KEY,
        "provider_user_id" text NOT NULL,
        "provider"         text NOT NULL,
        "username"         text NOT NULL,
        "email"            text,
        "displayName"      text,
        "avatarUrl"        text,
        "raw"              text,
        "created_at"       timestamptz NOT NULL DEFAULT now(),
        "updated_at"       timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_provider_user"
        ON "rekog_mcp_auth_user_profiles" ("provider_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "rekog_mcp_auth_user_profiles"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "rekog_mcp_auth_authorization_codes"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "rekog_mcp_auth_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rekog_mcp_auth_clients"`);
  }
}
