// PowerSync replication smoke test (issue #145, ADR-0028) — see README.md.
// Asserts against the local dev stack: committed rows reach the right user's
// client, live inserts stream in, and another user's rig never syncs.
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PowerSyncDatabase, Schema, Table, column } from '@powersync/node';
import pg from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://rv:rv@localhost:5432/rv_checklist';
const POWERSYNC_URL = process.env.POWERSYNC_URL ?? 'http://localhost:8080';
const POWERSYNC_JWT_SECRET =
  process.env.POWERSYNC_JWT_SECRET ??
  'local-dev-powersync-jwt-secret-not-for-production-000000';

const SYNC_TIMEOUT_MS = 30_000;

// Same shape the API mints in GET /auth/powersync-token: HS256 with the
// base64url-decoded shared key, kid+aud pinned to `powersync`, sub = user id.
function signToken(userId) {
  const b64 = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT', kid: 'powersync' });
  const body = b64({
    sub: userId,
    aud: 'powersync',
    iat: now,
    exp: now + 300,
  });
  const sig = createHmac(
    'sha256',
    Buffer.from(POWERSYNC_JWT_SECRET, 'base64url'),
  )
    .update(head + '.' + body)
    .digest('base64url');
  return head + '.' + body + '.' + sig;
}

// Client-side schema: only the tables this smoke test asserts on.
const schema = new Schema({
  rigs: new Table({ owner_id: column.text, nickname: column.text }),
  trips: new Table({ rig_id: column.text, name: column.text }),
  users: new Table({ email: column.text }),
});

function connectClient(userId, dir, name) {
  const db = new PowerSyncDatabase({
    schema,
    database: { dbFilename: `${name}.sqlite`, dbLocation: dir },
  });
  return db
    .connect({
      fetchCredentials: async () => ({
        endpoint: POWERSYNC_URL,
        token: signToken(userId),
      }),
      uploadData: async () => {},
    })
    .then(() => db);
}

async function waitFor(label, probe) {
  const deadline = Date.now() + SYNC_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await probe()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

const sql = new pg.Client({ connectionString: DATABASE_URL });
await sql.connect();

const tag = randomUUID().slice(0, 8);
const seeded = { users: [], rigs: [], trips: [] };

async function seedUserWithRig(label) {
  const { rows: userRows } = await sql.query(
    `INSERT INTO users (google_sub, email) VALUES ($1, $2) RETURNING id`,
    [`smoke-${tag}-${label}`, `smoke-${tag}-${label}@example.com`],
  );
  const userId = userRows[0].id;
  const { rows: rigRows } = await sql.query(
    `INSERT INTO rigs (owner_id, vin, make, model, year, nickname)
     VALUES ($1, $2, 'Smoke', 'Test', 2024, $3) RETURNING id`,
    [userId, `VIN-${tag}-${label}`, `smoke-rig-${label}`],
  );
  const rigId = rigRows[0].id;
  const { rows: tripRows } = await sql.query(
    `INSERT INTO trips (rig_id, name) VALUES ($1, $2) RETURNING id`,
    [rigId, `smoke-trip-${label}`],
  );
  seeded.users.push(userId);
  seeded.rigs.push(rigId);
  seeded.trips.push(tripRows[0].id);
  return { userId, rigId };
}

const workDir = mkdtempSync(path.join(tmpdir(), 'powersync-smoke-'));
let clientA;
let clientB;
let failed = false;

try {
  const a = await seedUserWithRig('a');
  const b = await seedUserWithRig('b');

  console.log('connecting client A (user', a.userId, ')');
  clientA = await connectClient(a.userId, workDir, 'a');

  // 1. Pre-existing committed rows replicate to their owner.
  await waitFor('rig A on client A', async () => {
    const rows = await clientA.getAll('SELECT id FROM rigs WHERE id = ?', [
      a.rigId,
    ]);
    return rows.length === 1;
  });
  await waitFor('trip A on client A', async () => {
    const rows = await clientA.getAll(
      'SELECT id FROM trips WHERE rig_id = ?',
      [a.rigId],
    );
    return rows.length >= 1;
  });
  console.log('PASS: committed rows replicated to their owner');

  // 2. A row committed while the client is connected streams in live.
  const { rows: liveRows } = await sql.query(
    `INSERT INTO trips (rig_id, name) VALUES ($1, $2) RETURNING id`,
    [a.rigId, `smoke-live-${tag}`],
  );
  seeded.trips.push(liveRows[0].id);
  await waitFor('live-inserted trip on client A', async () => {
    const rows = await clientA.getAll('SELECT id FROM trips WHERE id = ?', [
      liveRows[0].id,
    ]);
    return rows.length === 1;
  });
  console.log('PASS: live insert streamed to the connected client');

  // 3. Another user's rig never lands in this client's local db. Client B
  //    must sync its own rig first, so "absent" means filtered, not "slow".
  clientB = await connectClient(b.userId, workDir, 'b');
  await waitFor('rig B on client B', async () => {
    const rows = await clientB.getAll('SELECT id FROM rigs WHERE id = ?', [
      b.rigId,
    ]);
    return rows.length === 1;
  });
  const crossRig = await clientA.getAll('SELECT id FROM rigs WHERE id = ?', [
    b.rigId,
  ]);
  const crossOnB = await clientB.getAll('SELECT id FROM rigs WHERE id = ?', [
    a.rigId,
  ]);
  if (crossRig.length !== 0 || crossOnB.length !== 0) {
    throw new Error('bucket isolation failed: a client saw a foreign rig');
  }
  console.log("PASS: another user's rig did not sync");

  console.log('SMOKE OK');
} catch (err) {
  failed = true;
  console.error('SMOKE FAILED:', err);
} finally {
  await clientA?.disconnectAndClear().catch(() => {});
  await clientB?.disconnectAndClear().catch(() => {});
  await clientA?.close().catch(() => {});
  await clientB?.close().catch(() => {});
  // Users cascade to rigs/trips.
  for (const id of seeded.users) {
    await sql.query('DELETE FROM users WHERE id = $1', [id]).catch(() => {});
  }
  await sql.end();
  rmSync(workDir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
