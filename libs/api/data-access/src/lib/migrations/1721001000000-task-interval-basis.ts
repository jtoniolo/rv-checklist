import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Give a maintenance task's Interval a **basis** (ADR-0015, issue #31 — phase A).
 * The Interval becomes a tagged union; `interval_basis` is its discriminant,
 * stored as a typed column alongside `interval_months` (ADR-0015 — typed
 * columns, not JSONB). Today the sole basis is `calendar`, so the data migration
 * is `interval_months IS NOT NULL → interval_basis = 'calendar'`: every existing
 * whole-month interval reads back exactly as it did (zero behaviour change).
 *
 * `interval_months` is retained (the calendar count). The column is nullable —
 * an untracked task has neither basis nor months. The union⊕one-time
 * exclusivity invariant stays enforced in the domain schema, not by the DB.
 * Reversible: the down-migration drops the basis flag, leaving the pre-basis
 * `interval_months` shape intact.
 */
export class TaskIntervalBasis1721001000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" ADD COLUMN "interval_basis" text`,
    );
    await queryRunner.query(
      `UPDATE "maintenance_tasks" SET "interval_basis" = 'calendar' WHERE "interval_months" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" DROP COLUMN "interval_basis"`,
    );
  }
}
