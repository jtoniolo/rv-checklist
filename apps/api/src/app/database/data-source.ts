import { type DataSourceOptions } from 'typeorm';
import { RefreshTokenEntity } from './entities/refresh-token.entity.js';
import { UserEntity } from './entities/user.entity.js';
import { Baseline1721000000000 } from './migrations/1721000000000-baseline.js';

/**
 * TypeORM wiring (issue #13). One place builds the connection options so the Nest
 * runtime and the TypeORM CLI agree on entities and migrations.
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
    entities: [UserEntity, RefreshTokenEntity],
    migrations: [Baseline1721000000000],
    migrationsRun: true,
    synchronize: false,
  };
}
