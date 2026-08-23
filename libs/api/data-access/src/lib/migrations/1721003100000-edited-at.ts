import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add **edited_at** to the nine synced domain tables (ADR-0028, issue #141) —
 * the per-record LWW stamp. Update endpoints apply a write only when its
 * (clamped) client edit timestamp is strictly newer than this column; it is
 * distinct from `updated_at`, which auto-touches on every save and can never
 * gate a write. `NOT NULL DEFAULT now()` covers inserts; existing rows are
 * backfilled from `updated_at` so their last known write time seeds the
 * comparison. Persistence-side only — never wire data; PowerSync replicates
 * the column straight from Postgres.
 *
 * Reversible: the down-migration drops the columns.
 */
export class EditedAt1721003100000 implements MigrationInterface {
  private readonly tables = [
    'rigs',
    'equipment_items',
    'checklists',
    'runs',
    'maintenance_tasks',
    'log_entries',
    'trips',
    'stops',
    'attachments',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "edited_at" timestamptz NOT NULL DEFAULT now()`,
      );
      await queryRunner.query(
        `UPDATE "${table}" SET "edited_at" = "updated_at"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "edited_at"`);
    }
  }
}
