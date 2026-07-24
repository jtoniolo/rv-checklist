import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the **manual last-performed anchor** (ADR-0015, issue #33): one typed
 * column (ADR-0015 — typed, not JSONB), nullable and new, so there is no data to
 * migrate.
 *
 * - `maintenance_tasks.last_performed` — an owner's hand-set last-performed date
 *   for a *calendar* interval, needing no Log Entry. NULL unless the owner set
 *   one. The calendar-only invariant (it never rides with a distance interval or
 *   the one-time marker) stays enforced in the domain schema and the API service,
 *   not the DB.
 *
 * Reversible: the down-migration drops the column, leaving the completion-only
 * anchoring intact.
 */
export class TaskLastPerformed1721001200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" ADD COLUMN "last_performed" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" DROP COLUMN "last_performed"`,
    );
  }
}
