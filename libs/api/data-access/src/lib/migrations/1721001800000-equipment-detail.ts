import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add detail columns to **equipment_items** (issue #80): make, model,
 * purchase_date, notes, cost_cents. All nullable so existing name-only
 * rows stay valid.
 *
 * Reversible: the down-migration drops the added columns.
 */
export class EquipmentDetail1721001800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "equipment_items"
        ADD COLUMN "make" text,
        ADD COLUMN "model" text,
        ADD COLUMN "purchase_date" date,
        ADD COLUMN "notes" text,
        ADD COLUMN "cost_cents" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "equipment_items"
        DROP COLUMN "cost_cents",
        DROP COLUMN "notes",
        DROP COLUMN "purchase_date",
        DROP COLUMN "model",
        DROP COLUMN "make"
    `);
  }
}
