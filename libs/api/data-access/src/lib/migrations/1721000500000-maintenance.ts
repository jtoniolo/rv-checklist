import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Maintenance tasks + log entries (issue #17 — T7). A task is a recurring
 * upkeep job on a rig with an optional interval (`interval_months`, NULL means
 * not tracked for due-status — due/overdue is computed on read, ADR-0005) and
 * its own `field_schema` as JSONB (ADR-0004, app-validated).
 *
 * A log entry is the dated record that a task was performed. Its `fields`
 * JSONB is the entry's own snapshot of the task's field definitions plus the
 * recorded values (ADR-0004), so editing or deleting fields on the task never
 * rewrites past entries — the guarantee is structural. Both tables reference
 * their parents `ON DELETE CASCADE`, and the indexes back the list reads (a
 * rig's tasks, a task's log history, a rig's entries for due-status).
 */
export class Maintenance1721000500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "maintenance_tasks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "rig_id" uuid NOT NULL REFERENCES "rigs" ("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "interval_months" int,
        "field_schema" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_maintenance_tasks_rig_id" ON "maintenance_tasks" ("rig_id")`,
    );
    await queryRunner.query(`
      CREATE TABLE "log_entries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "task_id" uuid NOT NULL REFERENCES "maintenance_tasks" ("id") ON DELETE CASCADE,
        "rig_id" uuid NOT NULL REFERENCES "rigs" ("id") ON DELETE CASCADE,
        "performed_on" date NOT NULL,
        "fields" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_log_entries_task_id" ON "log_entries" ("task_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_log_entries_rig_id" ON "log_entries" ("rig_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "log_entries"`);
    await queryRunner.query(`DROP TABLE "maintenance_tasks"`);
  }
}
