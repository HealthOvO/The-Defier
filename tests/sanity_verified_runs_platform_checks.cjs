const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sqlite3 = require('../server/node_modules/sqlite3').verbose();

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.VERIFIED_RUNS_TEST_PORT || 9033);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.VERIFIED_RUNS_DB_PATH
  || path.join(os.tmpdir(), `the-defier-verified-runs-${process.pid}.sqlite`);
const JWT_SECRET = 'verified-runs-jwt-secret-32-characters';
const HMAC_SECRET = 'verified-runs-hmac-secret-32-characters';
const OPS_TOKEN = 'verified-runs-ops-token-32-characters';

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
}

function startServer() {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_INTEGRITY_REQUIRED: '1',
      DEFIER_OPS_TOKEN: OPS_TOKEN,
      DEFIER_DB_PATH: DB_PATH,
      DEFIER_GIT_SHA: 'verified-runs-test-sha'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => output += chunk.toString());
  child.stderr.on('data', chunk => output += chunk.toString());
  return { child, getOutput: () => output };
}

function stopServer(server) {
  return new Promise(resolve => {
    if (!server || !server.child || server.child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      server.child.kill('SIGKILL');
      resolve();
    }, 2000);
    server.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    server.child.kill('SIGTERM');
  });
}

async function request(pathname, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {}
  return { status: response.status, ok: response.ok, payload };
}

async function waitForHealth(server) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await request('/api/health');
      if (response.status === 200 && response.payload?.status === 'ok') return;
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`verified runs backend health timed out\n${server.getOutput()}`);
}

function signSessionPayload(data, token) {
  const salt = `verified-${crypto.randomBytes(12).toString('hex')}`;
  const signature = crypto.createHmac('sha256', token)
    .update('session-v1', 'utf8')
    .update('\n', 'utf8')
    .update(salt, 'utf8')
    .update('\n', 'utf8')
    .update(JSON.stringify(data), 'utf8')
    .digest('hex');
  return { salt, signature, signatureMode: 'session' };
}

function signedRequest(pathname, { token, data, method = 'POST' }) {
  return request(pathname, {
    method,
    token,
    body: { ...data, ...signSessionPayload(data, token) }
  });
}

async function registerAndLogin(username) {
  username = `${String(username || 'verified').slice(0, 8)}-${Date.now().toString(36)}`;
  const password = 'pwd123456';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password }
  });
  assert.strictEqual(registered.status, 200, JSON.stringify(registered.payload));
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password }
  });
  assert.strictEqual(login.status, 200, JSON.stringify(login.payload));
  return {
    token: login.payload?.token || login.payload?.user?.sessionToken,
    userId: login.payload?.user?.id || login.payload?.user?.objectId
  };
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.get(sql, params, (error, row) => {
      db.close();
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.run(sql, params, function onRun(error) {
      const result = { changes: this && this.changes || 0 };
      db.close();
      if (error) reject(error);
      else resolve(result);
    });
  });
}

const ticketPath = '/api/progression/verified-runs/tickets';
const startPayload = (clientRunId, mode, context) => ({
  clientRunId,
  mode,
  contentVersion: 'verified-run-v1',
  context
});

async function runChecks() {
  removeDbFiles();
  let server = startServer();
  try {
    await waitForHealth(server);
    const version = await request('/api/version');
    assert.strictEqual(version.payload?.schema?.version, 9);
    assert.strictEqual(version.payload?.schema?.currentMigrationId, '0009_account_social_coop');
    assert.deepStrictEqual(
      version.payload?.schema?.appliedMigrations?.map(entry => entry.id),
      ['0001_startup_schema', '0002_progression_platform', '0003_verified_runs', '0004_cloud_state_v2', '0005_season_ops_economy', '0006_authoritative_runs_v2', '0007_authoritative_challenge_ladder', '0008_authoritative_world_rift', '0009_account_social_coop']
    );
    for (const table of [
      'progression_verified_runs',
      'progression_verified_run_checkpoints',
      'progression_verified_run_receipts'
    ]) {
      const row = await dbGet(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
      assert.strictEqual(row?.name, table, `schema should create ${table}`);
    }

    await stopServer(server);
    await dbRun('DROP TABLE progression_verified_run_receipts');
    await dbRun('DROP TABLE progression_verified_run_checkpoints');
    await dbRun('DROP TABLE progression_verified_runs');
    await dbRun("DELETE FROM schema_migrations WHERE id = '0003_verified_runs'");
    server = startServer();
    await waitForHealth(server);
    const upgradedVersion = await request('/api/version');
    assert.strictEqual(upgradedVersion.payload?.schema?.currentMigrationId, '0009_account_social_coop', 'older databases should advance through verified runs to account social v9 on restart');
    assert.deepStrictEqual(
      upgradedVersion.payload?.schema?.appliedMigrations?.map(entry => entry.id),
      ['0001_startup_schema', '0002_progression_platform', '0003_verified_runs', '0004_cloud_state_v2', '0005_season_ops_economy', '0006_authoritative_runs_v2', '0007_authoritative_challenge_ladder', '0008_authoritative_world_rift', '0009_account_social_coop'],
      'older databases should record the complete additive migration chain'
    );
    for (const table of [
      'progression_verified_runs',
      'progression_verified_run_checkpoints',
      'progression_verified_run_receipts'
    ]) {
      const row = await dbGet(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
      assert.strictEqual(row?.name, table, `v2 upgrade should add ${table}`);
    }

    const primary = await registerAndLogin(`verified_primary_${Date.now()}`);
    const secondary = await registerAndLogin(`verified_secondary_${Date.now()}`);

    const pveRunId = 'run-pve-verified-0001';
    const pveContext = {
      saveSlot: 0,
      realm: 1,
      characterId: 'linFeng',
      runPathId: 'foldedEdge',
      runDestinyId: 'rebelScale',
      spiritCompanionId: 'swordWraith',
      mapSnapshotHash: 'map-1234567890abcdef'
    };
    const pveStartData = startPayload(pveRunId, 'pve', pveContext);
    const unauthenticated = await request(ticketPath, { method: 'POST', body: pveStartData });
    assert.strictEqual(unauthenticated.status, 401);
    const unsigned = await request(ticketPath, { method: 'POST', token: primary.token, body: pveStartData });
    assert.strictEqual(unsigned.status, 400, 'verified tickets must require session integrity');

    const started = await signedRequest(ticketPath, { token: primary.token, data: pveStartData });
    assert.strictEqual(started.status, 200, JSON.stringify(started.payload));
    assert.strictEqual(started.payload?.ticket?.authorityLevel, 'verified_envelope');
    assert.match(started.payload?.ticket?.settlementNonce || '', /^[0-9a-f]{64}$/);
    const pveTicket = started.payload.ticket;

    const restarted = await signedRequest(ticketPath, { token: primary.token, data: pveStartData });
    assert.strictEqual(restarted.status, 200);
    assert.strictEqual(restarted.payload?.ticket?.ticketId, pveTicket.ticketId);
    assert.strictEqual(restarted.payload?.ticket?.settlementNonce, pveTicket.settlementNonce);
    assert.strictEqual(restarted.payload?.ticket?.idempotent, true);

    const conflictingStart = await signedRequest(ticketPath, {
      token: primary.token,
      data: startPayload(pveRunId, 'pve', { ...pveContext, realm: 2 })
    });
    assert.strictEqual(conflictingStart.status, 409);
    assert.strictEqual(conflictingStart.payload?.reason, 'client_run_conflict');

    const unobservedRunId = 'run-pve-unobserved-0001';
    const unobservedStart = await signedRequest(ticketPath, {
      token: primary.token,
      data: startPayload(unobservedRunId, 'pve', { ...pveContext, mapSnapshotHash: 'map-unobserved-0001' })
    });
    const unobservedTicket = unobservedStart.payload.ticket;
    const unobservedBattleSource = `${unobservedRunId}:r1:battle_won:node-a`;
    const unobservedCheckpoint = await signedRequest(`/api/progression/verified-runs/${unobservedTicket.ticketId}/checkpoints`, {
      token: primary.token,
      data: {
        ticketId: unobservedTicket.ticketId,
        sourceRef: unobservedBattleSource,
        eventType: 'battle_won',
        proof: { nodeType: 'boss', realm: 1, runId: unobservedRunId }
      }
    });
    assert.strictEqual(unobservedCheckpoint.status, 409);
    assert.strictEqual(unobservedCheckpoint.payload?.reason, 'observed_event_required', 'server_verified must only upgrade an observed event');
    const rolledBackUnobserved = await dbGet('SELECT COUNT(*) AS count FROM progression_verified_run_checkpoints WHERE ticket_id = ?', [unobservedTicket.ticketId]);
    assert.strictEqual(Number(rolledBackUnobserved.count), 0, 'rejected unobserved checkpoints must roll back atomically');
    const lateObservedBattle = await signedRequest('/api/progression/events', {
      token: primary.token,
      data: {
        events: [{
          eventId: 'evt-pve-late-observed-battle-0001',
          eventType: 'battle_won',
          mode: 'pve',
          sourceRef: unobservedBattleSource,
          proof: { nodeType: 'boss', realm: 1, runId: unobservedRunId }
        }]
      }
    });
    assert.strictEqual(lateObservedBattle.payload?.accepted?.length, 1);
    const retriedObservedCheckpoint = await signedRequest(`/api/progression/verified-runs/${unobservedTicket.ticketId}/checkpoints`, {
      token: primary.token,
      data: {
        ticketId: unobservedTicket.ticketId,
        sourceRef: unobservedBattleSource,
        eventType: 'battle_won',
        proof: { nodeType: 'boss', realm: 1, runId: unobservedRunId }
      }
    });
    assert.strictEqual(retriedObservedCheckpoint.status, 200);
    const unobservedSettlement = await signedRequest(`/api/progression/verified-runs/${unobservedTicket.ticketId}/settle`, {
      token: primary.token,
      data: {
        ticketId: unobservedTicket.ticketId,
        settlementNonce: unobservedTicket.settlementNonce,
        sourceRef: `${unobservedRunId}:r1:activity_completed:completion`,
        outcome: 'completed',
        proof: { realm: 1, reason: 'realm_clear', runId: unobservedRunId }
      }
    });
    assert.strictEqual(unobservedSettlement.status, 409);
    assert.strictEqual(unobservedSettlement.payload?.reason, 'observed_event_required', 'verified settlement must not mint a missing completion event');
    const rolledBackReceipt = await dbGet('SELECT COUNT(*) AS count FROM progression_verified_run_receipts WHERE ticket_id = ?', [unobservedTicket.ticketId]);
    assert.strictEqual(Number(rolledBackReceipt.count), 0, 'rejected unobserved settlements must not create a receipt');

    const battleSourceRef = `${pveRunId}:r1:battle_won:boss-node-0001`;
    const observedEvent = {
      events: [{
        eventId: 'evt-pve-observed-upgrade-0001',
        eventType: 'battle_won',
        mode: 'pve',
        sourceRef: battleSourceRef,
        occurredAt: Date.now(),
        proof: { nodeType: 'boss', realm: 1, runId: pveRunId }
      }]
    };
    const observed = await signedRequest('/api/progression/events', { token: primary.token, data: observedEvent });
    assert.strictEqual(observed.status, 200);
    assert.strictEqual(observed.payload?.accepted?.length, 1);

    const checkpointData = {
      ticketId: pveTicket.ticketId,
      sourceRef: battleSourceRef,
      eventType: 'battle_won',
      proof: { nodeType: 'boss', realm: 1, runId: pveRunId }
    };
    const crossAccount = await signedRequest(`/api/progression/verified-runs/${pveTicket.ticketId}/checkpoints`, {
      token: secondary.token,
      data: checkpointData
    });
    assert.strictEqual(crossAccount.status, 404, 'ticket ownership should not leak across accounts');

    const checkpoint = await signedRequest(`/api/progression/verified-runs/${pveTicket.ticketId}/checkpoints`, {
      token: primary.token,
      data: checkpointData
    });
    assert.strictEqual(checkpoint.status, 200, JSON.stringify(checkpoint.payload));
    assert.strictEqual(checkpoint.payload?.checkpoint?.upgradedObservedEvent, true);
    assert.strictEqual(checkpoint.payload?.checkpoint?.trustTier, 'server_verified');
    const duplicateCheckpoint = await signedRequest(`/api/progression/verified-runs/${pveTicket.ticketId}/checkpoints`, {
      token: primary.token,
      data: checkpointData
    });
    assert.strictEqual(duplicateCheckpoint.status, 200);
    assert.strictEqual(duplicateCheckpoint.payload?.checkpoint?.idempotent, true);
    assert.strictEqual(duplicateCheckpoint.payload?.checkpoint?.sequence, 1);

    const upgradedEvent = await dbGet(
      `SELECT COUNT(*) AS count, MAX(trust_tier) AS trust_tier
       FROM progression_events WHERE user_id = ? AND event_type = 'battle_won' AND source_ref = ?`,
      [primary.userId, battleSourceRef]
    );
    assert.strictEqual(Number(upgradedEvent.count), 1, 'verified checkpoint must upgrade instead of double-counting observed events');
    assert.strictEqual(upgradedEvent.trust_tier, 'server_verified');

    const completionSourceRef = `${pveRunId}:r1:activity_completed:completion`;
    const settleData = {
      ticketId: pveTicket.ticketId,
      settlementNonce: pveTicket.settlementNonce,
      sourceRef: completionSourceRef,
      outcome: 'completed',
      proof: { nodeType: 'boss', realm: 1, reason: 'realm_clear', runId: pveRunId }
    };
    const observedCompletion = await signedRequest('/api/progression/events', {
      token: primary.token,
      data: {
        events: [{
          eventId: 'evt-pve-observed-completion-0001',
          eventType: 'activity_completed',
          mode: 'pve',
          sourceRef: completionSourceRef,
          occurredAt: Date.now(),
          proof: { realm: 1, reason: 'realm_clear', runId: pveRunId }
        }]
      }
    });
    assert.strictEqual(observedCompletion.payload?.accepted?.length, 1);
    const wrongNonce = await signedRequest(`/api/progression/verified-runs/${pveTicket.ticketId}/settle`, {
      token: primary.token,
      data: { ...settleData, settlementNonce: '0'.repeat(64) }
    });
    assert.strictEqual(wrongNonce.status, 403);
    assert.strictEqual(wrongNonce.payload?.reason, 'settlement_nonce_mismatch');

    const settled = await signedRequest(`/api/progression/verified-runs/${pveTicket.ticketId}/settle`, {
      token: primary.token,
      data: settleData
    });
    assert.strictEqual(settled.status, 200, JSON.stringify(settled.payload));
    assert.strictEqual(settled.payload?.receipt?.authorityLevel, 'verified_envelope');
    assert.strictEqual(settled.payload?.receipt?.trustTier, 'server_verified');
    const verifiedSeasonStatus = await request('/api/progression/status', { token: primary.token });
    const verifiedSeasonCompletion = verifiedSeasonStatus.payload?.objectives?.find(entry => entry.objectiveId === 'season_verified_activity_completions');
    const verifiedSeasonVariety = verifiedSeasonStatus.payload?.objectives?.find(entry => entry.objectiveId === 'season_verified_mode_variety');
    assert.strictEqual(verifiedSeasonCompletion?.current, 1, 'verified run settlement should advance the trusted season completion objective');
    assert.strictEqual(verifiedSeasonCompletion?.trustRequirement, 'server_verified');
    assert.strictEqual(verifiedSeasonVariety?.current, 1, 'verified PVE should count as one trusted season mode');
    const firstReceiptId = settled.payload?.receipt?.receiptId;
    const duplicateSettlement = await signedRequest(`/api/progression/verified-runs/${pveTicket.ticketId}/settle`, {
      token: primary.token,
      data: settleData
    });
    assert.strictEqual(duplicateSettlement.status, 200);
    assert.strictEqual(duplicateSettlement.payload?.receipt?.receiptId, firstReceiptId);
    assert.strictEqual(duplicateSettlement.payload?.receipt?.idempotent, true);
    const conflictingSettlement = await signedRequest(`/api/progression/verified-runs/${pveTicket.ticketId}/settle`, {
      token: primary.token,
      data: { ...settleData, sourceRef: `${pveRunId}:r1:activity_completed:other` }
    });
    assert.strictEqual(conflictingSettlement.status, 409);
    assert.strictEqual(conflictingSettlement.payload?.reason, 'run_already_settled');

    const replayRunId = 'run-pve-replay-target-0001';
    const replayStart = await signedRequest(ticketPath, {
      token: primary.token,
      data: startPayload(replayRunId, 'pve', { ...pveContext, mapSnapshotHash: 'map-replay-target-0001' })
    });
    const replayedSource = await signedRequest(`/api/progression/verified-runs/${replayStart.payload.ticket.ticketId}/checkpoints`, {
      token: primary.token,
      data: {
        ticketId: replayStart.payload.ticket.ticketId,
        sourceRef: battleSourceRef,
        eventType: 'battle_won',
        proof: { nodeType: 'boss', realm: 1, runId: replayRunId }
      }
    });
    assert.strictEqual(replayedSource.status, 409);
    assert.strictEqual(replayedSource.payload?.reason, 'verified_source_replay', 'a checkpoint source must not move across tickets');

    const receiptCount = await dbGet('SELECT COUNT(*) AS count FROM progression_verified_run_receipts WHERE ticket_id = ?', [pveTicket.ticketId]);
    assert.strictEqual(Number(receiptCount.count), 1);
    const postSettleCheckpoint = await signedRequest(`/api/progression/verified-runs/${pveTicket.ticketId}/checkpoints`, {
      token: primary.token,
      data: { ...checkpointData, sourceRef: `${pveRunId}:r1:battle_won:late-node` }
    });
    assert.strictEqual(postSettleCheckpoint.status, 409);
    assert.strictEqual(postSettleCheckpoint.payload?.reason, 'run_not_active');

    const incompleteRunData = startPayload('run-pve-incomplete-0001', 'pve', { ...pveContext, mapSnapshotHash: 'map-incomplete-0001' });
    const incompleteStart = await signedRequest(ticketPath, { token: primary.token, data: incompleteRunData });
    const incompleteTicket = incompleteStart.payload.ticket;
    const incompleteSettle = await signedRequest(`/api/progression/verified-runs/${incompleteTicket.ticketId}/settle`, {
      token: primary.token,
      data: {
        ticketId: incompleteTicket.ticketId,
        settlementNonce: incompleteTicket.settlementNonce,
        sourceRef: 'run-pve-incomplete-0001:r1:activity_completed:completion',
        outcome: 'completed',
        proof: { nodeType: 'boss', realm: 1, reason: 'realm_clear', runId: 'run-pve-incomplete-0001' }
      }
    });
    assert.strictEqual(incompleteSettle.status, 409);
    assert.strictEqual(incompleteSettle.payload?.reason, 'insufficient_run_checkpoints');

    const challengeRunId = 'run-challenge-verified-0001';
    const challengeStartData = startPayload(challengeRunId, 'challenge', {
      saveSlot: 1,
      challengeMode: 'weekly',
      rotationKey: 'weekly-2026-07-13',
      ruleId: 'challenge-rule-alpha',
      goalRealm: 3,
      seedSignature: 'SEED-ALPHA-0001'
    });
    const challengeStart = await signedRequest(ticketPath, { token: primary.token, data: challengeStartData });
    assert.strictEqual(challengeStart.status, 200);
    const challengeTicket = challengeStart.payload.ticket;
    const challengeSources = ['node-a', 'node-b'].map((node, index) => `${challengeRunId}:r${index + 1}:battle_won:${node}`);
    const challengeCompletionSource = `${challengeRunId}:r3:activity_completed:completion`;
    const challengeObserved = await signedRequest('/api/progression/events', {
      token: primary.token,
      data: {
        events: [
          ...challengeSources.map((sourceRef, index) => ({
            eventId: `evt-challenge-observed-${index + 1}-0001`,
            eventType: 'battle_won',
            mode: 'challenge',
            sourceRef,
            proof: { nodeType: index ? 'elite' : 'enemy', realm: index + 1, runId: challengeRunId }
          })),
          {
            eventId: 'evt-challenge-completion-0001',
            eventType: 'activity_completed',
            mode: 'challenge',
            sourceRef: challengeCompletionSource,
            proof: {
              realm: 3,
              challengeMode: 'weekly',
              rotationKey: 'weekly-2026-07-13',
              ruleId: 'challenge-rule-alpha',
              runId: challengeRunId
            }
          }
        ]
      }
    });
    assert.strictEqual(challengeObserved.payload?.accepted?.length, 3);
    const challengeCheckpoints = await Promise.all(['node-a', 'node-b'].map((node, index) => signedRequest(
      `/api/progression/verified-runs/${challengeTicket.ticketId}/checkpoints`,
      {
        token: primary.token,
        data: {
          ticketId: challengeTicket.ticketId,
          sourceRef: challengeSources[index],
          eventType: 'battle_won',
          proof: { nodeType: index ? 'elite' : 'enemy', realm: index + 1, runId: challengeRunId }
        }
      }
    )));
    assert(challengeCheckpoints.every(entry => entry.status === 200), JSON.stringify(challengeCheckpoints));
    assert.deepStrictEqual(
      challengeCheckpoints.map(entry => entry.payload?.checkpoint?.sequence).sort((a, b) => a - b),
      [1, 2],
      'concurrent checkpoints should receive unique monotonic sequences'
    );
    const challengeSettleData = {
      ticketId: challengeTicket.ticketId,
      settlementNonce: challengeTicket.settlementNonce,
      sourceRef: challengeCompletionSource,
      outcome: 'completed',
      proof: {
        realm: 3,
        challengeMode: 'weekly',
        rotationKey: 'weekly-2026-07-13',
        ruleId: 'challenge-rule-alpha',
        runId: challengeRunId
      }
    };
    const challengeSettled = await signedRequest(`/api/progression/verified-runs/${challengeTicket.ticketId}/settle`, {
      token: primary.token,
      data: challengeSettleData
    });
    assert.strictEqual(challengeSettled.status, 200, JSON.stringify(challengeSettled.payload));

    const expeditionRunId = 'run-expedition-verified-0001';
    const expeditionStart = await signedRequest(ticketPath, {
      token: primary.token,
      data: startPayload(expeditionRunId, 'expedition', { saveSlot: 2, realm: 4, chapterIndex: 2 })
    });
    const expeditionTicket = expeditionStart.payload.ticket;
    const expeditionBattleSource = `${expeditionRunId}:r4:battle_won:boss-node`;
    const expeditionCompletionSource = `${expeditionRunId}:r4:activity_completed:completion`;
    const expeditionObserved = await signedRequest('/api/progression/events', {
      token: primary.token,
      data: {
        events: [
          {
            eventId: 'evt-expedition-battle-0001',
            eventType: 'battle_won',
            mode: 'expedition',
            sourceRef: expeditionBattleSource,
            proof: { nodeType: 'boss', realm: 4, runId: expeditionRunId }
          },
          {
            eventId: 'evt-expedition-completion-0001',
            eventType: 'activity_completed',
            mode: 'expedition',
            sourceRef: expeditionCompletionSource,
            proof: { realm: 4, chapterIndex: 2, reason: 'realm_clear', runId: expeditionRunId }
          }
        ]
      }
    });
    assert.strictEqual(expeditionObserved.payload?.accepted?.length, 2);
    const expeditionCheckpoint = await signedRequest(`/api/progression/verified-runs/${expeditionTicket.ticketId}/checkpoints`, {
      token: primary.token,
      data: {
        ticketId: expeditionTicket.ticketId,
        sourceRef: expeditionBattleSource,
        eventType: 'battle_won',
        proof: { nodeType: 'boss', realm: 4, runId: expeditionRunId }
      }
    });
    assert.strictEqual(expeditionCheckpoint.status, 200);
    const expeditionSettled = await signedRequest(`/api/progression/verified-runs/${expeditionTicket.ticketId}/settle`, {
      token: primary.token,
      data: {
        ticketId: expeditionTicket.ticketId,
        settlementNonce: expeditionTicket.settlementNonce,
        sourceRef: expeditionCompletionSource,
        outcome: 'completed',
        proof: { realm: 4, chapterIndex: 2, reason: 'realm_clear', runId: expeditionRunId }
      }
    });
    assert.strictEqual(expeditionSettled.status, 200, JSON.stringify(expeditionSettled.payload));

    const expiredRunId = 'run-pve-expired-0001';
    const expiredStart = await signedRequest(ticketPath, {
      token: primary.token,
      data: startPayload(expiredRunId, 'pve', { ...pveContext, mapSnapshotHash: 'map-expired-0001' })
    });
    await dbRun('UPDATE progression_verified_runs SET expires_at = ? WHERE ticket_id = ?', [Date.now() - 1, expiredStart.payload.ticket.ticketId]);
    const expiredCheckpoint = await signedRequest(`/api/progression/verified-runs/${expiredStart.payload.ticket.ticketId}/checkpoints`, {
      token: primary.token,
      data: {
        ticketId: expiredStart.payload.ticket.ticketId,
        sourceRef: `${expiredRunId}:r1:battle_won:node-expired`,
        eventType: 'battle_won',
        proof: { nodeType: 'enemy', realm: 1, runId: expiredRunId }
      }
    });
    assert.strictEqual(expiredCheckpoint.status, 410);
    assert.strictEqual(expiredCheckpoint.payload?.reason, 'run_ticket_expired');
    const expiredStatus = await dbGet('SELECT status FROM progression_verified_runs WHERE ticket_id = ?', [expiredStart.payload.ticket.ticketId]);
    assert.strictEqual(expiredStatus.status, 'expired');

    const overview = await request('/api/progression/ops/overview', {
      headers: { 'x-defier-ops-token': OPS_TOKEN }
    });
    assert.strictEqual(overview.status, 200);
    assert(Number(overview.payload?.activity?.byTrust?.server_verified) >= 1);
    assert(Number(overview.payload?.verifiedRuns?.receipts) >= 3);
    assert(Number(overview.payload?.verifiedRuns?.byMode?.pve) >= 1);
    const overviewJson = JSON.stringify(overview.payload);
    [primary.userId, secondary.userId, pveRunId, battleSourceRef, pveTicket.ticketId].forEach(secret => {
      assert(!overviewJson.includes(secret), `verified ops overview must not leak ${secret}`);
    });

    await stopServer(server);
    server = startServer();
    await waitForHealth(server);
    const restartTicket = await signedRequest(ticketPath, { token: primary.token, data: pveStartData });
    assert.strictEqual(restartTicket.status, 200);
    assert.strictEqual(restartTicket.payload?.ticket?.ticketId, pveTicket.ticketId);
    assert.strictEqual(restartTicket.payload?.ticket?.status, 'settled');
    const restartSettlement = await signedRequest(`/api/progression/verified-runs/${pveTicket.ticketId}/settle`, {
      token: primary.token,
      data: settleData
    });
    assert.strictEqual(restartSettlement.status, 200);
    assert.strictEqual(restartSettlement.payload?.receipt?.receiptId, firstReceiptId);
    assert.strictEqual(restartSettlement.payload?.receipt?.idempotent, true);

    console.log('Verified run platform checks passed.');
  } catch (error) {
    error.message = `${error.message}\nServer output:\n${server?.getOutput() || ''}`;
    throw error;
  } finally {
    await stopServer(server);
    removeDbFiles();
  }
}

runChecks().catch(error => {
  console.error(error);
  process.exit(1);
});
