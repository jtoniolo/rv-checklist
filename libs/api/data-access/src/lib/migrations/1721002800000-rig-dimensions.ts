import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the rig's **Dimensions** (issue #139) — five integer millimetre columns:
 * travel height, length (the rig alone), combined length (measured hitched),
 * and the passenger/driver side clearances (slide/awning deployment reach).
 * Millimetres so one integer unit serves metre- and centimetre-entered values
 * alike, with no fractional storage. All nullable with no default and no
 * backfill: a dimension is simply unset until the owner measures it.
 *
 * Reversible: the down-migration drops the columns.
 */
export class RigDimensions1721002800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rigs"
        ADD COLUMN "travel_height_mm" integer,
        ADD COLUMN "length_mm" integer,
        ADD COLUMN "combined_length_mm" integer,
        ADD COLUMN "clearance_passenger_mm" integer,
        ADD COLUMN "clearance_driver_mm" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rigs"
        DROP COLUMN "travel_height_mm",
        DROP COLUMN "length_mm",
        DROP COLUMN "combined_length_mm",
        DROP COLUMN "clearance_passenger_mm",
        DROP COLUMN "clearance_driver_mm"`,
    );
  }
}
