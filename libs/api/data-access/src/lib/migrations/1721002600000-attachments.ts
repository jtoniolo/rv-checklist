import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the **attachments** table (ADR-0026, issue #113) — metadata only;
 * the file bytes live in the Garage bucket under `stops/<stopId>/<id>`.
 * Deleting a stop cascades the delete to its attachment rows (the service
 * deletes the matching objects by prefix — the database cannot reach the
 * bucket). `is_campground_map` flags at most one attachment per stop,
 * enforced by the flag operation, not a constraint.
 *
 * Reversible: the down-migration drops the table.
 */
export class Attachments1721002600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "stop_id" uuid NOT NULL REFERENCES "stops" ("id") ON DELETE CASCADE,
        "filename" text NOT NULL,
        "mime_type" text NOT NULL,
        "size_bytes" int NOT NULL,
        "is_campground_map" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_attachments_stop_id" ON "attachments" ("stop_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "attachments"`);
  }
}
