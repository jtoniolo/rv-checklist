import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the nullable **trip_id** column to `runs` (issue #111) — the grouping-
 * of-convenience link from a run to a trip (CONTEXT.md). `ON DELETE SET NULL`:
 * deleting a trip unlinks its runs, never deletes them (a run is a record of
 * work done, the trip was just its occasion). Indexed because the trip screen
 * lists a trip's runs.
 *
 * Reversible: the down-migration drops the column (and its index with it).
 */
export class RunTripLink1721002500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "runs" ADD COLUMN "trip_id" uuid REFERENCES "trips" ("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_runs_trip_id" ON "runs" ("trip_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "runs" DROP COLUMN "trip_id"`);
  }
}
