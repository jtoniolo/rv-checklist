import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Keep a task's log entries when the task is deleted (issue #28). Today
 * `log_entries.task_id` references `maintenance_tasks` `ON DELETE CASCADE`
 * (1721000500000-maintenance.ts), so deleting a task cascades away every entry
 * it produced — and "when did I last do this?" loses its answer forever.
 *
 * The fix is honest referential integrity: `ON DELETE SET NULL`. When a task is
 * deleted its entries' `task_id` becomes NULL — the entry survives, still owned
 * via its `rig_id` and labeled by its snapshotted `task_name` (issue #27), and
 * stays individually editable and deletable. No dangling id is left behind.
 *
 * `up` drops the CASCADE FK, relaxes the NOT NULL so an orphaned entry can hold
 * a NULL `task_id`, then re-adds the FK as SET NULL. The original FK was created
 * inline on the column, so Postgres system-named it — we discover that name at
 * runtime (rather than hard-coding it) and drop whichever FK constrains
 * `task_id`, then re-add it under the conventional name so `down` can undo it.
 */
export class LogEntryKeepOnTaskDelete1721000800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop whatever FK constrains log_entries.task_id (it was inline-created, so
    // its name is system-generated — discover it rather than assume the name).
    await queryRunner.query(`
      DO $$
      DECLARE
        fk_name text;
      BEGIN
        SELECT con.conname INTO fk_name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
        WHERE con.contype = 'f'
          AND rel.relname = 'log_entries'
          AND att.attname = 'task_id';
        IF fk_name IS NOT NULL THEN
          EXECUTE format('ALTER TABLE "log_entries" DROP CONSTRAINT %I', fk_name);
        END IF;
      END $$;
    `);
    // An orphaned entry (its task deleted) holds a NULL task_id.
    await queryRunner.query(
      `ALTER TABLE "log_entries" ALTER COLUMN "task_id" DROP NOT NULL`,
    );
    // Re-add the FK: deleting a task nulls its entries' task_id, keeping them.
    await queryRunner.query(
      `ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "maintenance_tasks" ("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "log_entries" DROP CONSTRAINT "log_entries_task_id_fkey"`,
    );
    // Restoring NOT NULL means no orphaned entries can remain: an entry whose
    // task is already gone has no task to re-attach to, so it is dropped (the
    // CASCADE world had already deleted it anyway).
    await queryRunner.query(
      `DELETE FROM "log_entries" WHERE "task_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "log_entries" ALTER COLUMN "task_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "maintenance_tasks" ("id") ON DELETE CASCADE`,
    );
  }
}
