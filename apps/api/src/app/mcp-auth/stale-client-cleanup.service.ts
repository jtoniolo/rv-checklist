import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

const STALE_DAYS = 30;

/**
 * Deletes client registrations older than 30 days that show no evidence of
 * a completed OAuth flow (issue #95). Runs daily at 03:00 UTC.
 *
 * "No evidence" means the client_id does not appear in
 * `rekog_mcp_auth_authorization_codes` or `rekog_mcp_auth_sessions`.
 * The library issues stateless JWTs, so there is no tokens table; the
 * authorization-code and session tables are the only persistent proof that
 * a client was ever used.
 */
@Injectable()
export class StaleClientCleanupService {
  private readonly logger = new Logger(StaleClientCleanupService.name);

  constructor(private readonly dataSource: DataSource) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async deleteStaleClients(): Promise<number> {
    const result: [unknown[], number] = await this.dataSource.query(
      `DELETE FROM rekog_mcp_auth_clients
       WHERE created_at < NOW() - INTERVAL '1 day' * $1
         AND client_id NOT IN (
           SELECT DISTINCT client_id
             FROM rekog_mcp_auth_authorization_codes
         )
         AND client_id NOT IN (
           SELECT DISTINCT "clientId"
             FROM rekog_mcp_auth_sessions
            WHERE "clientId" IS NOT NULL
         )`,
      [STALE_DAYS],
    );

    const deleted = result[1];
    if (deleted > 0) {
      this.logger.log(
        `Deleted ${String(deleted)} stale client registration(s)`,
      );
    }
    return deleted;
  }
}
