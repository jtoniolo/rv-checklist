import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Make a rig's detail columns optional (issue #14 follow-up). Only the
 * `nickname` is required — how the owner refers to the rig; VIN, make, model,
 * and year are details the owner may not have on hand, so they drop `NOT NULL`.
 *
 * This is a separate migration rather than an edit to the create-table migration
 * (which is immutable once applied): a database that already ran the original
 * migration keeps its `NOT NULL` columns until this `ALTER` runs.
 */
export class RigOptionalDetails1721000200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rigs" ALTER COLUMN "vin" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rigs" ALTER COLUMN "make" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rigs" ALTER COLUMN "model" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rigs" ALTER COLUMN "year" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reinstating NOT NULL requires the columns to hold no NULLs; a rig added
    // with only a nickname would have some, so this down migration can fail —
    // acceptable, as it only reverses an optionality relaxation.
    await queryRunner.query(
      `ALTER TABLE "rigs" ALTER COLUMN "year" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rigs" ALTER COLUMN "model" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rigs" ALTER COLUMN "make" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rigs" ALTER COLUMN "vin" SET NOT NULL`,
    );
  }
}
