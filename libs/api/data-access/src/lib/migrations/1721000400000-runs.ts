import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Runs table (issue #16 — T6 runs over plain checklists). A run is a dated copy
 * of a checklist's steps, created when the owner works through it for a real
 * occasion (CONTEXT.md). `checklist_id` records which checklist it came from and
 * `rig_id` carries the rig membership (ADR-0006); both reference their parent
 * `ON DELETE CASCADE`, and their indexes back the list reads (past runs of a
 * checklist, runs of a rig).
 *
 * `steps` is JSONB — the run's own copy of the steps (ADR-0004's embedded-owned
 * reasoning): owned by and read with exactly one run, order is the array
 * position, and each step carries its per-step `state`, any captured `values`,
 * and possibly its own `field_schema` (ADR-0008), all inside the same JSONB.
 * Because the run holds its own copy, editing or deleting the source checklist
 * never touches a past run — the "runs unaffected" guarantee is structural.
 */
export class Runs1721000400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "checklist_id" uuid NOT NULL REFERENCES "checklists" ("id") ON DELETE CASCADE,
        "rig_id" uuid NOT NULL REFERENCES "rigs" ("id") ON DELETE CASCADE,
        "started_on" date NOT NULL,
        "steps" jsonb NOT NULL DEFAULT '[]',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_runs_checklist_id" ON "runs" ("checklist_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_runs_rig_id" ON "runs" ("rig_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "runs"`);
  }
}
