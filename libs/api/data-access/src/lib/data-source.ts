import { type DataSourceOptions } from 'typeorm';
import { ChecklistEntity } from './entities/checklist.entity.js';
import { EquipmentItemEntity } from './entities/equipment-item.entity.js';
import { LogEntryEntity } from './entities/log-entry.entity.js';
import { MaintenanceTaskEntity } from './entities/maintenance-task.entity.js';
import { McpTokenEntity } from './entities/mcp-token.entity.js';
import { RefreshTokenEntity } from './entities/refresh-token.entity.js';
import { RigEntity } from './entities/rig.entity.js';
import { RunEntity } from './entities/run.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { Baseline1721000000000 } from './migrations/1721000000000-baseline.js';
import { Rigs1721000100000 } from './migrations/1721000100000-rigs.js';
import { RigOptionalDetails1721000200000 } from './migrations/1721000200000-rig-optional-details.js';
import { Checklists1721000300000 } from './migrations/1721000300000-checklists.js';
import { Runs1721000400000 } from './migrations/1721000400000-runs.js';
import { Maintenance1721000500000 } from './migrations/1721000500000-maintenance.js';
import { TaskDescription1721000600000 } from './migrations/1721000600000-task-description.js';
import { LogEntryTaskName1721000700000 } from './migrations/1721000700000-log-entry-task-name.js';
import { LogEntryKeepOnTaskDelete1721000800000 } from './migrations/1721000800000-log-entry-keep-on-task-delete.js';
import { TaskOneTime1721000900000 } from './migrations/1721000900000-task-one-time.js';
import { TaskIntervalBasis1721001000000 } from './migrations/1721001000000-task-interval-basis.js';
import { DistanceInterval1721001100000 } from './migrations/1721001100000-distance-interval.js';
import { TaskLastPerformed1721001200000 } from './migrations/1721001200000-task-last-performed.js';
import { IntervalCombinedLimits1721001300000 } from './migrations/1721001300000-interval-combined-limits.js';
import { LogEntryCostCents1721001400000 } from './migrations/1721001400000-log-entry-cost-cents.js';
import { TaskTags1721001500000 } from './migrations/1721001500000-task-tags.js';
import { McpTokens1721001600000 } from './migrations/1721001600000-mcp-tokens.js';
import { EquipmentItems1721001700000 } from './migrations/1721001700000-equipment-items.js';
import { EquipmentDetail1721001800000 } from './migrations/1721001800000-equipment-detail.js';
import { McpOAuthTables1721001900000 } from './migrations/1721001900000-mcp-oauth-tables.js';
import { McpOAuthGrants1721002000000 } from './migrations/1721002000000-mcp-oauth-grants.js';
import { RefreshTokenSessions1721002100000 } from './migrations/1721002100000-refresh-token-sessions.js';

/**
 * TypeORM wiring (issue #13; ADR-0009 — persistence lives in this lib). One
 * place builds the connection options so the Nest runtime and the TypeORM CLI
 * agree on entities and migrations.
 *
 * `synchronize` is off and `migrationsRun` is on: the schema is owned by explicit
 * migrations that apply at startup against the local Postgres, never by
 * schema-diffing. Entities and migrations are listed by value (not glob) so this
 * works the same whether run from source or a bundled build.
 */
export function buildDataSourceOptions(databaseUrl: string): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [
      UserEntity,
      RefreshTokenEntity,
      McpTokenEntity,
      RigEntity,
      ChecklistEntity,
      RunEntity,
      MaintenanceTaskEntity,
      LogEntryEntity,
      EquipmentItemEntity,
    ],
    migrations: [
      Baseline1721000000000,
      Rigs1721000100000,
      RigOptionalDetails1721000200000,
      Checklists1721000300000,
      Runs1721000400000,
      Maintenance1721000500000,
      TaskDescription1721000600000,
      LogEntryTaskName1721000700000,
      LogEntryKeepOnTaskDelete1721000800000,
      TaskOneTime1721000900000,
      TaskIntervalBasis1721001000000,
      DistanceInterval1721001100000,
      TaskLastPerformed1721001200000,
      IntervalCombinedLimits1721001300000,
      LogEntryCostCents1721001400000,
      TaskTags1721001500000,
      McpTokens1721001600000,
      EquipmentItems1721001700000,
      EquipmentDetail1721001800000,
      McpOAuthTables1721001900000,
      McpOAuthGrants1721002000000,
      RefreshTokenSessions1721002100000,
    ],
    migrationsRun: true,
    synchronize: false,
  };
}
