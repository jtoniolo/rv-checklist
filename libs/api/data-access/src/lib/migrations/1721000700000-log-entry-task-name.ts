import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Snapshot the task's name onto each log entry (issue #27). A Log Entry is a
 * true record of maintenance performed, so it must freeze the task's name the
 * same way it freezes the field snapshot — renaming a task later must never
 * relabel its past entries.
 *
 * Added in three steps so existing rows survive a NOT NULL column: add
 * `task_name` nullable, backfill every entry from its task's *current* name,
 * then tighten to NOT NULL. New entries always carry the name from the service,
 * so after the backfill the column is total.
 */
export class LogEntryTaskName1721000700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "log_entries" ADD COLUMN "task_name" text`,
    );
    await queryRunner.query(
      `UPDATE "log_entries" SET "task_name" = m."name" FROM "maintenance_tasks" m WHERE "log_entries"."task_id" = m."id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "log_entries" ALTER COLUMN "task_name" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "log_entries" DROP COLUMN "task_name"`,
    );
  }
}
