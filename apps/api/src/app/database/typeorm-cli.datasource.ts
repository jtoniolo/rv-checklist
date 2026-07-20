import { buildDataSourceOptions } from '@rv-checklist/api-data-access';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.js';

/**
 * DataSource for the TypeORM CLI only (generating / inspecting migrations). It
 * validates `process.env` at import, so it is deliberately kept out of the app's
 * import graph — the running app configures TypeORM through `ConfigService`
 * (which loads `.env`), never this module.
 */
export default new DataSource(
  buildDataSourceOptions(validateEnv(process.env).DATABASE_URL),
);
