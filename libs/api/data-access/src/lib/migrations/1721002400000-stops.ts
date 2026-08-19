import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create the **stops** table (issue #111) — a real table, not JSONB on the
 * trip, because attachments (ADR-0026) will FK stops and their S3 keys are
 * stop-scoped. Deleting the trip cascades the delete to its stops. Everything
 * beyond identity, order, and the arrived flag is a nullable detail column;
 * `leg_km` is the owner's own figure (ADR-0025), stored permanently.
 *
 * Reversible: the down-migration drops the table.
 */
export class Stops1721002400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stops" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "trip_id" uuid NOT NULL REFERENCES "trips" ("id") ON DELETE CASCADE,
        "position" int NOT NULL,
        "arrived" boolean NOT NULL DEFAULT false,
        "campground" text,
        "place_id" text,
        "campsite" text,
        "arrival_date" date,
        "nights" int,
        "check_in_time" text,
        "check_out_time" text,
        "booking_number" text,
        "cost_cents" int,
        "address" text,
        "phone" text,
        "notes" text,
        "leg_km" int,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_stops_trip_id" ON "stops" ("trip_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "stops"`);
  }
}
