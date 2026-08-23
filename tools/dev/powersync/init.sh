#!/bin/sh
# Idempotent PowerSync bootstrap for the dev Postgres (issue #145, ADR-0028).
# Creates the logical-replication role the sync service connects as, and the
# separate database its Postgres bucket storage writes to. Dev-only
# credentials, matching PS_DATA_SOURCE_URI / PS_STORAGE_SOURCE_URI in
# docker-compose.yml. The `powersync` publication itself is NOT created here —
# the API's migrations own it, so it always tracks the schema.
set -eu

psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'powersync_role') THEN
    CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD 'powersync';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'powersync_storage') THEN
    CREATE ROLE powersync_storage WITH LOGIN PASSWORD 'powersync';
  END IF;
END
$$;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;
SQL

# CREATE DATABASE cannot run inside a DO block / transaction.
if [ "$(psql -tAc "SELECT 1 FROM pg_database WHERE datname = 'powersync_storage'")" != "1" ]; then
  psql -v ON_ERROR_STOP=1 -c 'CREATE DATABASE powersync_storage OWNER powersync_storage'
fi

echo 'powersync-init: done'
