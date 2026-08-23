import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SqlSyncRules } from '@powersync/service-sync-rules';

/**
 * Pins the PowerSync sync-rule contract (issue #145, ADR-0028). The rules in
 * charts/api/files/sync-rules.yaml are the one copy both the chart and the dev
 * compose stack use; this test parses them with the real sync-rules engine
 * (`SqlSyncRules.fromYaml` throws on any invalid query), and locks the synced
 * set to exactly the ten tables — the user's own row plus the nine rig-scoped
 * aggregates. Auth/token tables and the idempotency ledger must never appear.
 *
 * The `powersync` publication migration must list the same ten tables: the
 * publication is what Postgres replicates to the service, the sync rules are
 * what the service fans out to clients — drift between them silently drops
 * data, so the migration source is checked here too.
 */
describe('powersync sync rules', () => {
  const SYNCED_TABLES = new Set([
    'users',
    'rigs',
    'equipment_items',
    'checklists',
    'runs',
    'maintenance_tasks',
    'log_entries',
    'trips',
    'stops',
    'attachments',
  ]);

  const rulesPath = path.join(
    __dirname,
    '../../../../../charts/api/files/sync-rules.yaml',
  );
  const rulesYaml = readFileSync(rulesPath, 'utf8');

  it('validates against the sync-rules engine', () => {
    expect(() =>
      SqlSyncRules.fromYaml(rulesYaml, { defaultSchema: 'public' }),
    ).not.toThrow();
  });

  it('syncs exactly the ten tables', () => {
    const rules = SqlSyncRules.fromYaml(rulesYaml, {
      defaultSchema: 'public',
    });
    const tables = rules.config.getSourceTables().map((t) => t.tablePattern);
    expect(tables).toHaveLength(SYNCED_TABLES.size);
    expect(new Set(tables)).toEqual(SYNCED_TABLES);
  });

  it('publishes the same ten tables in the publication migration', () => {
    const migrationPath = path.join(
      __dirname,
      '../../../../../libs/api/data-access/src/lib/migrations/1721003200000-powersync-publication.ts',
    );
    const source = readFileSync(migrationPath, 'utf8');
    const statement = /CREATE PUBLICATION "powersync" FOR TABLE([^`]+)/.exec(
      source,
    );
    expect(statement).not.toBeNull();
    const published =
      statement?.[1]?.match(/"([a-z_]+)"/g)?.map((m) => m.slice(1, -1)) ?? [];
    expect(published).toHaveLength(SYNCED_TABLES.size);
    expect(new Set(published)).toEqual(SYNCED_TABLES);
  });
});
