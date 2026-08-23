import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add **stops.rig_id** and **attachments.rig_id** (ADR-0028, issue #140) —
 * the owning rig denormalized onto every synced row, because PowerSync
 * sync-rule queries cannot join: each row must carry its per-rig bucket key
 * itself. Set on create and immutable after (stops never change trips,
 * attachments never change stops); invisible to the API contract.
 *
 * Each column is added nullable, backfilled through the ownership chain
 * (stop → trip → rig; attachment → stop → trip → rig), then made NOT NULL —
 * so existing rows are covered before the constraint lands. The columns
 * reference `rigs` with CASCADE delete (redundant with the trip/stop cascades,
 * but it keeps the copy honest) and are indexed as the sync buckets' filter.
 *
 * Reversible: the down-migration drops the indexes and columns.
 */
export class StopAttachmentRigId1721002900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "stops" ADD COLUMN "rig_id" uuid REFERENCES "rigs" ("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(`
      UPDATE "stops" SET "rig_id" = t."rig_id"
      FROM "trips" t WHERE "stops"."trip_id" = t."id"
    `);
    await queryRunner.query(
      `ALTER TABLE "stops" ALTER COLUMN "rig_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_stops_rig_id" ON "stops" ("rig_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "attachments" ADD COLUMN "rig_id" uuid REFERENCES "rigs" ("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(`
      UPDATE "attachments" SET "rig_id" = t."rig_id"
      FROM "stops" s
      JOIN "trips" t ON s."trip_id" = t."id"
      WHERE "attachments"."stop_id" = s."id"
    `);
    await queryRunner.query(
      `ALTER TABLE "attachments" ALTER COLUMN "rig_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_attachments_rig_id" ON "attachments" ("rig_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_attachments_rig_id"`);
    await queryRunner.query(`ALTER TABLE "attachments" DROP COLUMN "rig_id"`);
    await queryRunner.query(`DROP INDEX "idx_stops_rig_id"`);
    await queryRunner.query(`ALTER TABLE "stops" DROP COLUMN "rig_id"`);
  }
}
