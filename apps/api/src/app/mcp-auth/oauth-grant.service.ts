import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

interface RefreshTokenRow {
  id: string;
  grant_id: string;
  generation: number;
  spent_at: unknown;
}

interface GrantRow {
  id: string;
  revoked_at: unknown;
}

export class UnknownRefreshTokenError extends Error {
  constructor() {
    super('Refresh token not found in grant store');
  }
}

export class RefreshTokenReuseError extends Error {
  constructor(public readonly grantId: string) {
    super(`Refresh token reuse detected for grant ${grantId}`);
  }
}

export class RevokedGrantError extends Error {
  constructor(public readonly grantId: string) {
    super(`Grant ${grantId} has been revoked`);
  }
}

export interface SpendResult {
  grantId: string;
  generation: number;
}

@Injectable()
export class OAuthGrantService {
  private readonly logger = new Logger(OAuthGrantService.name);

  constructor(private readonly dataSource: DataSource) {}

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createGrant(
    userId: string,
    clientId: string,
    scope: string | undefined,
  ): Promise<string> {
    const rows: { id: string }[] = await this.dataSource.query(
      `INSERT INTO "mcp_oauth_grants" ("user_id", "client_id", "scope")
       VALUES ($1, $2, $3) RETURNING "id"`,
      [userId, clientId, scope],
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- INSERT RETURNING always yields one row
    return rows[0]!.id;
  }

  async recordRefreshToken(
    grantId: string,
    rawToken: string,
    generation: number,
  ): Promise<void> {
    const hash = this.hashToken(rawToken);
    await this.dataSource.query(
      `INSERT INTO "mcp_oauth_refresh_tokens" ("grant_id", "token_hash", "generation")
       VALUES ($1, $2, $3)`,
      [grantId, hash, generation],
    );
  }

  async spendRefreshToken(rawToken: string): Promise<SpendResult> {
    const hash = this.hashToken(rawToken);

    const rows: RefreshTokenRow[] = await this.dataSource.query(
      `SELECT "id", "grant_id", "generation", "spent_at"
       FROM "mcp_oauth_refresh_tokens" WHERE "token_hash" = $1`,
      [hash],
    );

    if (rows.length === 0) {
      throw new UnknownRefreshTokenError();
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length check above
    const record = rows[0]!;

    const grantRows: GrantRow[] = await this.dataSource.query(
      `SELECT "id", "revoked_at" FROM "mcp_oauth_grants" WHERE "id" = $1`,
      [record.grant_id],
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length check in condition
    if (grantRows.length === 0 || grantRows[0]!.revoked_at) {
      throw new RevokedGrantError(record.grant_id);
    }

    if (record.spent_at) {
      this.logger.warn(
        `Refresh token reuse detected for grant ${record.grant_id} — revoking`,
      );
      await this.revokeGrant(record.grant_id);
      throw new RefreshTokenReuseError(record.grant_id);
    }

    await this.dataSource.query(
      `UPDATE "mcp_oauth_refresh_tokens" SET "spent_at" = now() WHERE "id" = $1`,
      [record.id],
    );

    await this.dataSource.query(
      `UPDATE "mcp_oauth_grants" SET "last_used_at" = now() WHERE "id" = $1`,
      [record.grant_id],
    );

    return { grantId: record.grant_id, generation: record.generation };
  }

  async isGrantActive(grantId: string): Promise<boolean> {
    const rows: GrantRow[] = await this.dataSource.query(
      `SELECT "id", "revoked_at" FROM "mcp_oauth_grants" WHERE "id" = $1`,
      [grantId],
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length check above
    return rows.length > 0 && !rows[0]!.revoked_at;
  }

  async touchLastUsed(grantId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE "mcp_oauth_grants" SET "last_used_at" = now() WHERE "id" = $1`,
      [grantId],
    );
  }

  async revokeGrant(grantId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE "mcp_oauth_grants" SET "revoked_at" = now() WHERE "id" = $1`,
      [grantId],
    );
  }

  async listActiveByUser(email: string): Promise<ActiveGrantRow[]> {
    const rows: ActiveGrantRow[] = await this.dataSource.query(
      `SELECT g."id",
              COALESCE(c."client_name", '(unknown app)') AS "clientName",
              g."created_at" AS "createdAt", g."last_used_at" AS "lastUsedAt"
       FROM "mcp_oauth_grants" g
       JOIN "rekog_mcp_auth_user_profiles" p ON p."profile_id" = g."user_id"
       LEFT JOIN "rekog_mcp_auth_clients" c ON c."client_id" = g."client_id"
       WHERE p."email" = $1 AND g."revoked_at" IS NULL
       ORDER BY g."created_at" DESC`,
      [email],
    );
    return rows;
  }

  async revokeGrantForUser(grantId: string, email: string): Promise<boolean> {
    const rows: { id: string }[] = await this.dataSource.query(
      `SELECT g."id"
       FROM "mcp_oauth_grants" g
       JOIN "rekog_mcp_auth_user_profiles" p ON p."profile_id" = g."user_id"
       WHERE g."id" = $1 AND p."email" = $2 AND g."revoked_at" IS NULL`,
      [grantId, email],
    );

    if (rows.length === 0) {
      return false;
    }

    await this.dataSource.query(
      `DELETE FROM "mcp_oauth_refresh_tokens" WHERE "grant_id" = $1`,
      [grantId],
    );

    await this.revokeGrant(grantId);
    return true;
  }
}

export interface ActiveGrantRow {
  id: string;
  clientName: string;
  createdAt: string;
  lastUsedAt: string | null;
}
