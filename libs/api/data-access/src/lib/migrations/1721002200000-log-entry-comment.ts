import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the **comment** column to `log_entries` (issue #101). A single nullable
 * text column — a short free-text note about the completion (findings, an
 * observation, the method used); the 500-character cap is enforced by the
 * domain schema. NULL when no comment was written; the repository maps that to
 * the domain's `undefined`. Existing entries are untouched — no backfill.
 *
 * Reversible: the down-migration drops the column.
 */
export class LogEntryComment1721002200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "log_entries" ADD COLUMN "comment" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "log_entries" DROP COLUMN "comment"`);
  }
}
