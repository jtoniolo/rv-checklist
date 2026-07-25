import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drop the Interval's `basis` discriminant (ADR-0016, issue #35). The two limits
 * are no longer mutually exclusive: an interval carries an optional calendar
 * cadence (`interval_months`) and an optional distance cadence (`interval_km`),
 * with at least one present. `interval_basis` — the tagged-union discriminant
 * from ADR-0015 — no longer earns its place.
 *
 * The data already lives in the right columns: a former `'calendar'` row has its
 * count in `interval_months` (and `interval_km` NULL), a former `'distance'` row
 * in `interval_km` (and `interval_months` NULL). So dropping the discriminant is
 * lossless — every existing interval reads back exactly as before, now keyed off
 * which column is non-NULL rather than the basis flag. `interval_months` and
 * `interval_km` are unchanged (both nullable).
 *
 * Reversible: the down-migration re-adds `interval_basis` and repopulates it from
 * whichever column is set, restoring ADR-0015's discriminated shape.
 */
export class IntervalCombinedLimits1721001300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" DROP COLUMN "interval_basis"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" ADD COLUMN "interval_basis" text`,
    );
    await queryRunner.query(
      `UPDATE "maintenance_tasks" SET "interval_basis" = 'calendar' WHERE "interval_months" IS NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "maintenance_tasks" SET "interval_basis" = 'distance' WHERE "interval_km" IS NOT NULL`,
    );
  }
}
