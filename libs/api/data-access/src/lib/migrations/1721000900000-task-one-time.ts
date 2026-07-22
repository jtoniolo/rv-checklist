import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the one-time marker to maintenance tasks (issue #29): a task noticed once
 * and done once — due from creation, deleting itself on completion. Purely
 * additive — the column is NOT NULL with a `false` default, so every existing
 * task is simply not one-time. It and `interval_months` are mutually exclusive
 * (a one-time task has no interval); that invariant is enforced in the domain
 * schema, not by a DB constraint. Due/overdue stays computed on read (ADR-0005),
 * so nothing about the due-date persistence changes.
 */
export class TaskOneTime1721000900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" ADD COLUMN "one_time" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" DROP COLUMN "one_time"`,
    );
  }
}
