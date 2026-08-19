import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the **trips** table (issue #111). A named journey of a rig through
 * ordered stops; deleting the rig cascades the delete to its trips. The
 * starting point is free text plus an optional Google place ID (ADR-0025).
 * `checklist_ids` is the denormalized checklist grouping (ADR-0017's
 * reasoning) — no FK, so a deleted checklist needs no trip rewrite; reads
 * drop dangling ids.
 *
 * Reversible: the down-migration drops the table.
 */
export class Trips1721002300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "trips" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "rig_id" uuid NOT NULL REFERENCES "rigs" ("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "start_location" text,
        "start_place_id" text,
        "checklist_ids" uuid[] NOT NULL DEFAULT '{}',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_trips_rig_id" ON "trips" ("rig_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "trips"`);
  }
}
