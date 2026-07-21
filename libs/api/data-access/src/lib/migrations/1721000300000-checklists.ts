import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Checklists table (issue #15 — T5 checklist authoring). A checklist is a
 * reusable template belonging to a rig (ADR-0006); `rig_id` references `rigs`
 * so a checklist is removed when its rig is, and its index backs the rig-scoped
 * list read.
 *
 * `tags` and `steps` are JSONB (ADR-0004's embedded-owned-data reasoning
 * extended to steps): steps are owned by and read with exactly one checklist,
 * their order is the array position, and a step may carry its own `field_schema`
 * (ADR-0008) which rides inside the same JSONB. Runs keep their own copy of the
 * steps in a separate aggregate, so editing or deleting a checklist never
 * touches a past run — the "runs unaffected" guarantee is structural, not
 * enforced here.
 */
export class Checklists1721000300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "checklists" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "rig_id" uuid NOT NULL REFERENCES "rigs" ("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "tags" jsonb NOT NULL DEFAULT '[]',
        "steps" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_checklists_rig_id" ON "checklists" ("rig_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "checklists"`);
  }
}
