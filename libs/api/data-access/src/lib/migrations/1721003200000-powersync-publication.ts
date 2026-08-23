import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the **powersync** logical-replication publication (issue #145,
 * ADR-0028). The PowerSync sync service replicates exactly these ten tables
 * into per-client SQLite: the user's own row plus the nine rig-scoped
 * aggregates. Auth/token tables (refresh_tokens, mcp_*, oauth tables) and the
 * idempotency ledger never publish — they are server-only.
 *
 * Living in a migration keeps the publication tracking the schema: migrations
 * run at startup everywhere, so any environment that has the tables also has
 * the publication. The name is fixed — the sync service looks for a
 * publication named exactly `powersync`.
 *
 * `FOR TABLE` (not FOR ALL TABLES) publishes all columns of the listed tables,
 * including columns later migrations add. A `DROP IF EXISTS` first makes the
 * migration safe on a database where the publication was created by hand.
 *
 * Reversible: the down-migration drops the publication.
 */
export class PowersyncPublication1721003200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP PUBLICATION IF EXISTS "powersync"`);
    await queryRunner.query(`
      CREATE PUBLICATION "powersync" FOR TABLE
        "users",
        "rigs",
        "equipment_items",
        "checklists",
        "runs",
        "maintenance_tasks",
        "log_entries",
        "trips",
        "stops",
        "attachments"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP PUBLICATION IF EXISTS "powersync"`);
  }
}
