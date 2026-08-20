import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add **stops.leg_km_manual** (issue #121) — the leg's provenance: true means
 * the owner typed the current `leg_km` (an automatic fetch must never
 * overwrite it), false means a maps fetch filled it. Nullable with no default
 * and no backfill: existing rows keep NULL, meaning the provenance is unknown
 * — an existing leg of unknown provenance is treated as manual, because
 * arrived legs feed the rig's Distance and guessing is unsafe.
 *
 * Reversible: the down-migration drops the column.
 */
export class StopLegKmManual1721002700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stops" ADD COLUMN "leg_km_manual" boolean`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "stops" DROP COLUMN "leg_km_manual"`);
  }
}
