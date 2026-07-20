import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rigs table (issue #14 — the first real feature). A rig is the aggregate root
 * owned by a user (ADR-0006); `owner_id` carries row-level ownership (ADR-0003)
 * and references `users` so a rig is removed when its owner is. The `owner_id`
 * index backs the owner-scoped list read. Child aggregates (checklists, tasks,
 * logs) reference `rigs` in their own later migrations.
 */
export class Rigs1721000100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rigs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "owner_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "vin" text,
        "make" text,
        "model" text,
        "year" integer,
        "nickname" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_rigs_owner_id" ON "rigs" ("owner_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "rigs"`);
  }
}
