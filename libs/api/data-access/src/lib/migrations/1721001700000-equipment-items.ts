import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the **equipment_items** table (issue #79). Descriptive inventory on a
 * rig — name only in this slice (make/model/cost are #80). Deleting the rig
 * cascades the delete to its equipment.
 *
 * Reversible: the down-migration drops the table.
 */
export class EquipmentItems1721001700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "equipment_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "rig_id" uuid NOT NULL REFERENCES "rigs" ("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_equipment_items_rig_id" ON "equipment_items" ("rig_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "equipment_items"`);
  }
}
