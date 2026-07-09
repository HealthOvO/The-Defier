const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DB_PATH = path.join(os.tmpdir(), `the-defier-progression-time-${process.pid}.sqlite`);
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
process.env.DEFIER_DB_PATH = DB_PATH;

const { db, initDb } = require('../server/db/database');
const { DAY_MS } = require('../server/progression/catalog');
const { getStatus, recordClientEvents } = require('../server/progression/service');

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: this.changes || 0 });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function closeDb() {
  return new Promise(resolve => db.close(() => resolve()));
}

async function runChecks() {
  const userId = 'progression-time-user';
  const receivedAt = Date.UTC(2026, 6, 13, 0, 0, 1);
  const occurredAt = Date.UTC(2026, 6, 12, 23, 59, 59);
  await initDb();
  await dbRun(
    'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    [userId, 'progression_time_user', 'test-hash', receivedAt]
  );

  const events = Array.from({ length: 3 }, (_, index) => ({
    eventId: `evt-time-boundary-${index}-0001`,
    eventType: 'battle_won',
    mode: 'pve',
    sourceRef: `source-time-boundary-${index}-0001`,
    occurredAt,
    proof: { nodeType: 'enemy' }
  }));
  const report = await recordClientEvents(userId, events, receivedAt);
  assert.strictEqual(report.accepted.length, 3, 'in-window events should be accepted');
  assert(report.accepted.every(entry => entry.occurredAt === occurredAt), 'receipts should expose the validated occurrence time');

  const persisted = await dbGet(
    `SELECT COUNT(*) AS count, MIN(occurred_at) AS min_occurred, MAX(received_at) AS max_received
     FROM progression_events WHERE user_id = ?`,
    [userId]
  );
  assert.strictEqual(Number(persisted.count), 3);
  assert.strictEqual(Number(persisted.min_occurred), occurredAt);
  assert.strictEqual(Number(persisted.max_received), receivedAt);

  const projectionBeforeStatus = await dbGet(
    'SELECT COUNT(*) AS count FROM progression_objective_progress WHERE user_id = ?',
    [userId]
  );
  const status = await getStatus(userId, receivedAt);
  const dailyBattle = status.objectives.find(entry => entry.objectiveId === 'daily_battle_wins');
  assert.strictEqual(dailyBattle.current, 0, 'events before UTC midnight must not roll into the new daily cycle');
  const projectionAfterStatus = await dbGet(
    'SELECT COUNT(*) AS count FROM progression_objective_progress WHERE user_id = ?',
    [userId]
  );
  assert.strictEqual(
    Number(projectionAfterStatus.count),
    Number(projectionBeforeStatus.count),
    'status reads must not mutate active-account projections'
  );

  const stale = await recordClientEvents(userId, [{
    eventId: 'evt-time-stale-0001',
    eventType: 'battle_won',
    mode: 'pve',
    sourceRef: 'source-time-stale-0001',
    occurredAt: receivedAt - DAY_MS - 1,
    proof: { nodeType: 'enemy' }
  }], receivedAt);
  assert.strictEqual(stale.accepted.length, 0);
  assert.strictEqual(stale.rejected[0].reason, 'event_timestamp_out_of_window');

  const future = await recordClientEvents(userId, [{
    eventId: 'evt-time-future-0001',
    eventType: 'battle_won',
    mode: 'pve',
    sourceRef: 'source-time-future-0001',
    occurredAt: receivedAt + 30_001,
    proof: { nodeType: 'enemy' }
  }], receivedAt);
  assert.strictEqual(future.accepted.length, 0);
  assert.strictEqual(future.rejected[0].reason, 'event_timestamp_out_of_window');
}

runChecks()
  .then(async () => {
    await closeDb();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
    console.log('Progression time boundary checks passed.');
  })
  .catch(async error => {
    await closeDb();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
    console.error(error);
    process.exit(1);
  });
