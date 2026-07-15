const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(os.tmpdir(), `the-defier-fate-chronicle-bootstrap-${process.pid}.sqlite`);
const LEGACY_CATALOG_HASH = 'fedf4ecb07da4a5acabced56b0e8aa3a6941bb920595e5b670bb76e26b70896c';
const LEGACY_DESCRIPTION = '三章双誓约的服务端主线篇章，同章无限重试，同账号同一时刻仅一条 active run。';
const LEGACY_DUAL_TITLES = {
  'chapter-1-dual': '照火双誓',
  'chapter-2-dual': '镜命双誓',
  'chapter-3-dual': '裂天双誓',
};

const { hashCanonical, stableStringify } = require('../server/progression/authoritative-runs/canonical');
const {
  CATALOG_VERSION,
  ROTATION_RULE_VERSION,
  WEEK_MS,
  buildRotationSnapshot,
} = require('../server/fate-chronicle/catalog');
const { bootstrapFateChronicleSchema } = require('../server/fate-chronicle/bootstrap');

function resolveSqlite3() {
  for (const candidate of [
    'sqlite3',
    path.join(ROOT, 'node_modules', 'sqlite3'),
    path.join(ROOT, 'server', 'node_modules', 'sqlite3'),
  ]) {
    try {
      return require(candidate).verbose();
    } catch (error) {}
  }
  throw new Error('sqlite3 module is not available in this worktree');
}

const sqlite3 = resolveSqlite3();

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function openDb() {
  const db = new sqlite3.Database(DB_PATH);
  db.configure('busyTimeout', 5000);
  return db;
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: this && this.changes || 0 });
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function buildLegacyV1Snapshot(snapshot, { catalogHash = LEGACY_CATALOG_HASH } = {}) {
  const legacy = JSON.parse(stableStringify(snapshot));
  legacy.catalogVersion = 'fate-chronicle-catalog-v1';
  legacy.rotationRuleVersion = 'fate-chronicle-rotation-v1';
  legacy.catalogHash = String(catalogHash || '');
  legacy.description = LEGACY_DESCRIPTION;
  legacy.chapters = legacy.chapters.map(chapter => ({
    ...chapter,
    oaths: Array.isArray(chapter.oaths) ? chapter.oaths.slice(0, 2) : [],
  }));
  legacy.milestones = legacy.milestones.map(milestone => ({
    ...milestone,
    title: LEGACY_DUAL_TITLES[milestone.milestoneId] || milestone.title,
  }));
  delete legacy.versions;
  delete legacy.snapshotHash;
  legacy.snapshotHash = hashCanonical(legacy);
  return legacy;
}

async function rewriteRotationRow(db, snapshot) {
  await dbRun(
    db,
    `UPDATE fate_chronicle_rotations
     SET protocol_version = ?,
         catalog_version = ?,
         rule_version = ?,
         catalog_hash = ?,
         title = ?,
         description = ?,
         starts_at = ?,
         ends_at = ?,
         grace_ends_at = ?,
         claim_ends_at = ?,
         run_ttl_ms = ?,
         reward_currency = ?,
         reward_impact = ?,
         power_impact = ?,
         chapters_json = ?,
         milestones_json = ?,
         snapshot_hash = ?,
         snapshot_json = ?
     WHERE rotation_id = ?`,
    [
      snapshot.protocolVersion,
      snapshot.catalogVersion,
      snapshot.rotationRuleVersion,
      snapshot.catalogHash,
      snapshot.title,
      snapshot.description,
      snapshot.startsAt,
      snapshot.endsAt,
      snapshot.graceEndsAt,
      snapshot.claimEndsAt,
      snapshot.runTtlMs,
      snapshot.rewardCurrency,
      snapshot.rewardImpact,
      snapshot.powerImpact,
      stableStringify(snapshot.chapters),
      stableStringify(snapshot.milestones),
      snapshot.snapshotHash,
      stableStringify(snapshot),
      snapshot.rotationId,
    ],
  );
}

async function insertRotationRow(db, snapshot) {
  await dbRun(
    db,
    `INSERT INTO fate_chronicle_rotations (
       rotation_id,
       protocol_version,
       catalog_version,
       rule_version,
       catalog_hash,
       title,
       description,
       starts_at,
       ends_at,
       grace_ends_at,
       claim_ends_at,
       run_ttl_ms,
       reward_currency,
       reward_impact,
       power_impact,
       chapters_json,
       milestones_json,
       snapshot_hash,
       snapshot_json,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.rotationId,
      snapshot.protocolVersion,
      snapshot.catalogVersion,
      snapshot.rotationRuleVersion,
      snapshot.catalogHash,
      snapshot.title,
      snapshot.description,
      snapshot.startsAt,
      snapshot.endsAt,
      snapshot.graceEndsAt,
      snapshot.claimEndsAt,
      snapshot.runTtlMs,
      snapshot.rewardCurrency,
      snapshot.rewardImpact,
      snapshot.powerImpact,
      stableStringify(snapshot.chapters),
      stableStringify(snapshot.milestones),
      snapshot.snapshotHash,
      stableStringify(snapshot),
      Date.now(),
    ],
  );
}

(async () => {
  removeDbFiles();
  const db = openDb();
  try {
    const now = Date.UTC(2026, 6, 15, 12, 0, 0);
    const previousNow = now - WEEK_MS;
    const nextNow = now + WEEK_MS;

    await bootstrapFateChronicleSchema(db, previousNow);
    await bootstrapFateChronicleSchema(db, now);

    const previousSnapshot = buildRotationSnapshot(previousNow);
    const currentSnapshot = buildRotationSnapshot(now);
    const legacyPrevious = buildLegacyV1Snapshot(previousSnapshot);
    const legacyCurrent = buildLegacyV1Snapshot(currentSnapshot);
    await rewriteRotationRow(db, legacyPrevious);
    await rewriteRotationRow(db, legacyCurrent);
    const legacyRowsBeforeBootstrap = new Map();
    for (const legacySnapshot of [legacyPrevious, legacyCurrent]) {
      legacyRowsBeforeBootstrap.set(
        legacySnapshot.rotationId,
        await dbGet(db, 'SELECT * FROM fate_chronicle_rotations WHERE rotation_id = ?', [legacySnapshot.rotationId]),
      );
    }

    await bootstrapFateChronicleSchema(db, now);
    for (const legacySnapshot of [legacyPrevious, legacyCurrent]) {
      const preservedFullRow = await dbGet(
        db,
        'SELECT * FROM fate_chronicle_rotations WHERE rotation_id = ?',
        [legacySnapshot.rotationId],
      );
      assert.deepEqual(
        preservedFullRow,
        legacyRowsBeforeBootstrap.get(legacySnapshot.rotationId),
        `${legacySnapshot.rotationId} should remain byte-identical across every persisted column`,
      );
      const preserved = await dbGet(
        db,
        `SELECT catalog_version, rule_version, catalog_hash, snapshot_hash, snapshot_json
         FROM fate_chronicle_rotations
         WHERE rotation_id = ?`,
        [legacySnapshot.rotationId],
      );
      assert(preserved, `missing preserved rotation row ${legacySnapshot.rotationId}`);
      assert.equal(preserved.catalog_version, 'fate-chronicle-catalog-v1', `${legacySnapshot.rotationId} should remain on the legacy catalog version`);
      assert.equal(preserved.rule_version, 'fate-chronicle-rotation-v1', `${legacySnapshot.rotationId} should remain on the legacy rotation rule version`);
      assert.equal(preserved.catalog_hash, LEGACY_CATALOG_HASH, `${legacySnapshot.rotationId} should keep the known legacy catalog hash`);
      assert.equal(preserved.snapshot_hash, legacySnapshot.snapshotHash, `${legacySnapshot.rotationId} should keep its legacy snapshot hash`);
      assert.equal(preserved.snapshot_json, stableStringify(legacySnapshot), `${legacySnapshot.rotationId} should stay byte-identical after bootstrap`);
    }

    await bootstrapFateChronicleSchema(db, nextNow);
    for (const legacySnapshot of [legacyPrevious, legacyCurrent]) {
      const preservedFullRow = await dbGet(
        db,
        'SELECT * FROM fate_chronicle_rotations WHERE rotation_id = ?',
        [legacySnapshot.rotationId],
      );
      assert.deepEqual(
        preservedFullRow,
        legacyRowsBeforeBootstrap.get(legacySnapshot.rotationId),
        `rolling into the next week must preserve every column for ${legacySnapshot.rotationId}`,
      );
      const preservedAfterWeekRoll = await dbGet(
        db,
        `SELECT catalog_version, rule_version, catalog_hash, snapshot_hash, snapshot_json
         FROM fate_chronicle_rotations
         WHERE rotation_id = ?`,
        [legacySnapshot.rotationId],
      );
      assert.deepEqual(
        preservedAfterWeekRoll,
        {
          catalog_version: 'fate-chronicle-catalog-v1',
          rule_version: 'fate-chronicle-rotation-v1',
          catalog_hash: LEGACY_CATALOG_HASH,
          snapshot_hash: legacySnapshot.snapshotHash,
          snapshot_json: stableStringify(legacySnapshot),
        },
        `rolling into the next week must not rewrite ${legacySnapshot.rotationId}`,
      );
    }

    const freshV2Snapshot = buildRotationSnapshot(nextNow);
    const freshV2Row = await dbGet(
      db,
      `SELECT catalog_version, rule_version, snapshot_hash, snapshot_json
       FROM fate_chronicle_rotations
       WHERE rotation_id = ?`,
      [freshV2Snapshot.rotationId],
    );
    assert(freshV2Row, `missing fresh v2 rotation row ${freshV2Snapshot.rotationId}`);
    assert.equal(freshV2Row.catalog_version, CATALOG_VERSION, 'fresh future rotation should use the current v2 catalog version');
    assert.equal(freshV2Row.rule_version, ROTATION_RULE_VERSION, 'fresh future rotation should use the current v2 rotation rule version');
    assert.equal(freshV2Row.snapshot_hash, freshV2Snapshot.snapshotHash, 'fresh future rotation should keep the canonical v2 snapshot hash');

    const freshV2Json = JSON.parse(String(freshV2Row.snapshot_json || '{}'));
    assert(Array.isArray(freshV2Json.chapters) && freshV2Json.chapters.length === 3, 'fresh v2 rotation should keep three chapters');
    assert(freshV2Json.chapters.every(chapter => Array.isArray(chapter.oaths) && chapter.oaths.length === 3), 'fresh v2 rotation should keep three oaths per chapter');
    assert.deepEqual(
      freshV2Json.chapters.map(chapter => chapter.oaths[2].scenarioId),
      ['chronicle-ember-proof', 'chronicle-mirror-audit', 'chronicle-rift-seal'],
      'fresh v2 rotation should keep the three branch-oath scenario ids',
    );
    await dbRun(
      db,
      'UPDATE fate_chronicle_rotations SET title = ? WHERE rotation_id = ?',
      ['tampered-v2-title', freshV2Snapshot.rotationId],
    );
    await assert.rejects(
      () => bootstrapFateChronicleSchema(db, nextNow),
      error => error?.code === 'FATE_CHRONICLE_ROTATION_DRIFT',
      'v2 scalar-column drift must fail closed even when snapshot_json and snapshot_hash remain canonical',
    );

    await new Promise(resolve => db.close(resolve));
    removeDbFiles();

    const driftDb = openDb();
    try {
      await bootstrapFateChronicleSchema(driftDb, now);
      const fakeLegacyCurrent = buildLegacyV1Snapshot(currentSnapshot, {
        catalogHash: '00000000000000000000000000000000000000000000000000000000000000f1',
      });
      await rewriteRotationRow(driftDb, fakeLegacyCurrent);

      await assert.rejects(
        () => bootstrapFateChronicleSchema(driftDb, now),
        error => error?.code === 'FATE_CHRONICLE_ROTATION_DRIFT',
        'unknown legacy-like snapshots must still trigger rotation drift',
      );
      const tamperedLegacyCurrent = buildLegacyV1Snapshot(currentSnapshot);
      tamperedLegacyCurrent.chapters[0].oaths[0].scenarioId = 'tampered-scenario-id';
      delete tamperedLegacyCurrent.snapshotHash;
      tamperedLegacyCurrent.snapshotHash = hashCanonical(tamperedLegacyCurrent);
      await rewriteRotationRow(driftDb, tamperedLegacyCurrent);
      await assert.rejects(
        () => bootstrapFateChronicleSchema(driftDb, now),
        error => error?.code === 'FATE_CHRONICLE_ROTATION_DRIFT',
        'self-consistent legacy snapshots with altered oath content must still fail closed',
      );
      await rewriteRotationRow(driftDb, legacyCurrent);
      await dbRun(
        driftDb,
        'UPDATE fate_chronicle_rotations SET description = ? WHERE rotation_id = ?',
        ['tampered-v1-description', legacyCurrent.rotationId],
      );
      await assert.rejects(
        () => bootstrapFateChronicleSchema(driftDb, now),
        error => error?.code === 'FATE_CHRONICLE_ROTATION_DRIFT',
        'known v1 snapshot_json must not excuse scalar-column drift',
      );
    } finally {
      await new Promise(resolve => driftDb.close(resolve));
    }

    console.log('Fate chronicle catalog/bootstrap compatibility checks passed.');
  } finally {
    try {
      await new Promise(resolve => db.close(resolve));
    } catch (error) {}
    removeDbFiles();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
