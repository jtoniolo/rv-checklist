import { type DataSourceOptions } from 'typeorm';
import { ChecklistEntity } from './entities/checklist.entity.js';
import { LogEntryEntity } from './entities/log-entry.entity.js';
import { MaintenanceTaskEntity } from './entities/maintenance-task.entity.js';
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
      RigEntity,
      ChecklistEntity,
      RunEntity,
      MaintenanceTaskEntity,
      LogEntryEntity,
    ],
    migrations: [
      Baseline1721000000000,
      Rigs1721000100000,
      RigOptionalDetails1721000200000,
      Checklists1721000300000,
      Runs1721000400000,
      Maintenance1721000500000,
    ],
    migrationsRun: true,
    synchronize: false,
  };
}
