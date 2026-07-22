import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add an optional free-text description to maintenance tasks (issue #25):
 * why the task needs doing and how to perform it. Purely additive — the
 * column is nullable with no default, so every existing task simply has no
 * description (SQL NULL, absent on the wire). Log entries are untouched:
 * they carry their own field snapshots (ADR-0004) and never mirror the task.
 */
export class TaskDescription1721000600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" ADD COLUMN "description" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" DROP COLUMN "description"`,
    );
  }
}
