import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the **cost_cents** column to `log_entries` (issue #39). A single nullable
 * integer column — whole cents, no fractional currency — recording what the
 * task cost. NULL when no cost was entered; the repository maps that to the
 * domain's `undefined`.
 *
 * Reversible: the down-migration drops the column.
 */
export class LogEntryCostCents1721001400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "log_entries" ADD COLUMN "cost_cents" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "log_entries" DROP COLUMN "cost_cents"`,
    );
  }
}
