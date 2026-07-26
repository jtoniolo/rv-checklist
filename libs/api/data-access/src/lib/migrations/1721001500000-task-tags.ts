import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the **tags** column to `maintenance_tasks` (issue #41, ADR-0017). A
 * nullable text-array column storing canonical (trim + lowercase) tag strings.
 * NULL and `'{}'` both mean "no tags"; the repository maps NULL to `[]`.
 *
 * Reversible: the down-migration drops the column.
 */
export class TaskTags1721001500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" ADD COLUMN "tags" text[]`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "maintenance_tasks" DROP COLUMN "tags"`,
    );
  }
}
