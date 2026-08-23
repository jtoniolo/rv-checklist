# PowerSync replication smoke test

Proves the acceptance criterion of issue #145 against the local dev stack: a
row committed to Postgres appears in a connected PowerSync client's local
database, and a row for another user's rig does not. CI cannot run this (no
Docker there); the env/chart contract test and the sync-rules validation test
are the CI-enforced parts.

## Run

```sh
# 1. Dev stack up (Postgres with wal_level=logical + sync service):
docker compose -f tools/dev/docker-compose.yml up -d

# 2. The `powersync` publication comes from the API's migrations — run the API
#    once against this database if you never have (`npx nx serve api`, then
#    stop it), or any earlier run already did it.

# 3. Install and run (standalone package — not part of the workspace):
cd tools/dev/powersync-smoke
npm install
npm run smoke
```

The script seeds two users with one rig + trip each (committed directly to
Postgres), signs a PowerSync JWT per user with the dev
`POWERSYNC_JWT_SECRET`, connects a client as each user, and asserts:

- user A's client syncs A's rig and trip (replication works);
- a trip inserted *while connected* arrives (live streaming works);
- user A's client never sees user B's rig (per-rig bucket isolation works).

It cleans up the seeded rows and its temporary SQLite files, and exits
non-zero on any failed assertion.

Overrides (defaults match `.env.example` / the compose stack):
`DATABASE_URL`, `POWERSYNC_URL`, `POWERSYNC_JWT_SECRET`.
