import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the **distance** basis end to end (ADR-0015, issue #32). Three typed
 * columns (ADR-0015 — typed columns, not JSONB), all nullable and all new, so
 * there is no data to migrate:
 *
 * - `maintenance_tasks.interval_km` — the distance Interval's whole-kilometre
 *   count, the sibling of `interval_months`; NULL unless `interval_basis` is
 *   `'distance'`. The union⊕one-time exclusivity stays enforced in the domain
 *   schema, not the DB.
 * - `rigs.distance_km` — the rig's current Distance (km), owner-maintained; NULL
 *   when unset.
 * - `log_entries.at_distance_km` — the rig's Distance reading (km) at the time
 *   performed, the anchor a distance Interval measures from; NULL when the
 *   completion recorded none.
 *
 * Reversible: the down-migration drops all three columns, leaving the
 * calendar-only shape intact.
 */
export class DistanceInterval1721001100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" ADD COLUMN "interval_km" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "rigs" ADD COLUMN "distance_km" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "log_entries" ADD COLUMN "at_distance_km" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "log_entries" DROP COLUMN "at_distance_km"`,
    );
    await queryRunner.query(`ALTER TABLE "rigs" DROP COLUMN "distance_km"`);
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" DROP COLUMN "interval_km"`,
    );
  }
}
