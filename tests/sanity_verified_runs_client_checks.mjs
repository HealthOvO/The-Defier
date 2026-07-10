import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(String(key)) ? this.store.get(String(key)) : null;
  }
  setItem(key, value) {
    this.store.set(String(key), String(value));
  }
  removeItem(key) {
    this.store.delete(String(key));
  }
  clear() {
    this.store.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.window = globalThis;
globalThis.document = {
  addEventListener: () => {},
  removeEventListener: () => {}
};

const { BackendClient } = await import('../js/services/backend-client.js');
const { ProgressionService } = await import('../js/services/progression-service.js');

const originals = {
  requestServer: BackendClient.requestServer,
  createSessionIntegrityFields: BackendClient.createSessionIntegrityFields,
  getCurrentUser: BackendClient.getCurrentUser,
  ensureReady: BackendClient.ensureReady,
  init: BackendClient.init,
  submitProgressionEvents: BackendClient.submitProgressionEvents,
  startVerifiedProgressionRun: BackendClient.startVerifiedProgressionRun,
  submitVerifiedRunCheckpoint: BackendClient.submitVerifiedRunCheckpoint,
  settleVerifiedProgressionRun: BackendClient.settleVerifiedProgressionRun
};

BackendClient.cloudEnabled = true;
BackendClient.ensureReady = () => true;
BackendClient.init = () => ({ success: true });
BackendClient.getServerConfig = () => ({
  baseUrl: 'http://127.0.0.1:9000',
  progressionPathPrefix: '/api/progression'
});

let currentUser = { objectId: 'verified-user-a', username: '甲' };
BackendClient.getCurrentUser = () => currentUser;
BackendClient.persistServerSession({
  token: 'verified-session-token-a-32-characters',
  user: currentUser
});

const requestCalls = [];
const signingCalls = [];
BackendClient.requestServer = async (path, options = {}) => {
  requestCalls.push({ path, options });
  return { success: true, path };
};
BackendClient.createSessionIntegrityFields = async (payload, options = {}) => {
  signingCalls.push({ payload, options });
  return {
    salt: 'verified-client-salt',
    signature: 'a'.repeat(64),
    signatureMode: 'session'
  };
};

const startPayload = {
  clientRunId: 'run-client-api-0001',
  mode: 'pve',
  contentVersion: 'verified-run-v1',
  context: { realm: 1, saveSlot: 0, mapSnapshotHash: 'map-client-api-0001' }
};
const started = await BackendClient.startVerifiedProgressionRun(startPayload, { expectedUserId: 'verified-user-a' });
assert.equal(started.success, true);
assert.equal(requestCalls.at(-1).path, '/api/progression/verified-runs/tickets');
assert.equal(requestCalls.at(-1).options.authToken, 'verified-session-token-a-32-characters');
assert.deepEqual(signingCalls.at(-1).payload, startPayload, 'ticket signature should cover the unsigned business payload');
assert.equal(signingCalls.at(-1).options.sessionToken, 'verified-session-token-a-32-characters');

const checkpointPayload = {
  ticketId: 'vrun-client-api-0001',
  sourceRef: 'source-client-api-checkpoint-0001',
  eventType: 'battle_won',
  proof: { nodeType: 'enemy', realm: 1 }
};
const checkpoint = await BackendClient.submitVerifiedRunCheckpoint('vrun-client-api-0001', checkpointPayload, {
  expectedUserId: 'verified-user-a'
});
assert.equal(checkpoint.success, true);
assert.equal(requestCalls.at(-1).path, '/api/progression/verified-runs/vrun-client-api-0001/checkpoints');
assert.equal(requestCalls.at(-1).options.authToken, 'verified-session-token-a-32-characters');
assert.deepEqual(signingCalls.at(-1).payload, checkpointPayload);

const requestsBeforeMismatch = requestCalls.length;
const ticketMismatch = await BackendClient.submitVerifiedRunCheckpoint('vrun-client-api-0001', {
  ...checkpointPayload,
  ticketId: 'vrun-client-api-other-0001'
});
assert.equal(ticketMismatch.success, false);
assert.equal(ticketMismatch.reason, 'verified_run_ticket_mismatch');
assert.equal(requestCalls.length, requestsBeforeMismatch, 'ticket mismatch should stop before network submission');

const settlePayload = {
  ticketId: 'vrun-client-api-0001',
  settlementNonce: 'b'.repeat(64),
  sourceRef: 'source-client-api-settle-0001',
  outcome: 'completed',
  proof: { realm: 1, reason: 'realm_clear' }
};
const settled = await BackendClient.settleVerifiedProgressionRun('vrun-client-api-0001', settlePayload, {
  expectedUserId: 'verified-user-a'
});
assert.equal(settled.success, true);
assert.equal(requestCalls.at(-1).path, '/api/progression/verified-runs/vrun-client-api-0001/settle');
assert.deepEqual(signingCalls.at(-1).payload, settlePayload);

const requestsBeforeAccountMismatch = requestCalls.length;
const accountMismatch = await BackendClient.startVerifiedProgressionRun(startPayload, { expectedUserId: 'verified-user-b' });
assert.equal(accountMismatch.success, false);
assert.equal(accountMismatch.reason, 'progression_account_changed');
assert.equal(requestCalls.length, requestsBeforeAccountMismatch);

const stableIntegrityStub = BackendClient.createSessionIntegrityFields;
BackendClient.createSessionIntegrityFields = async (payload, options) => {
  const integrity = await stableIntegrityStub(payload, options);
  BackendClient.persistServerSession({
    token: 'verified-session-token-b-32-characters',
    user: { objectId: 'verified-user-b', username: '乙' }
  });
  return integrity;
};
BackendClient.persistServerSession({
  token: 'verified-session-token-a-32-characters',
  user: currentUser
});
await BackendClient.startVerifiedProgressionRun(startPayload, { expectedUserId: 'verified-user-a' });
assert.equal(requestCalls.at(-1).options.authToken, 'verified-session-token-a-32-characters', 'session churn must not switch verified run bearer token after signing');
BackendClient.createSessionIntegrityFields = stableIntegrityStub;

const requestsBeforeUnsupportedSignature = requestCalls.length;
BackendClient.persistServerSession({
  token: 'verified-session-token-a-32-characters',
  user: currentUser
});
BackendClient.createSessionIntegrityFields = async () => ({ signatureMode: 'legacy' });
const unsupportedSignature = await BackendClient.startVerifiedProgressionRun(startPayload, { expectedUserId: 'verified-user-a' });
assert.equal(unsupportedSignature.success, false);
assert.equal(unsupportedSignature.reason, 'verified_run_signature_required');
assert.equal(requestCalls.length, requestsBeforeUnsupportedSignature, 'unsupported session signing should stop before verified network submission');
BackendClient.createSessionIntegrityFields = stableIntegrityStub;

localStorage.clear();
ProgressionService.activeFlushByKey = {};
ProgressionService.memoryQueueByKey = {};
BackendClient.getCurrentUser = () => currentUser;

const nestedMapHash = ProgressionService.buildMapSnapshotHash([
  [{ id: 'node-a', row: 0, type: 'enemy' }],
  [{ id: 'node-b', row: 1, type: 'boss', polluted: true }]
]);
const changedMapHash = ProgressionService.buildMapSnapshotHash([
  [{ id: 'node-a', row: 0, type: 'enemy' }],
  [{ id: 'node-b', row: 1, type: 'boss', polluted: false }]
]);
assert.match(nestedMapHash, /^map-[0-9a-f]{16}$/);
assert.notEqual(nestedMapHash, changedMapHash, 'map snapshot hash should include nested node state');

const runId = 'run-client-verified-0001';
const battleSourceRef = ProgressionService.createStableSourceRef({
  runId,
  eventType: 'battle_won',
  realm: 1,
  checkpointKey: 'node-a'
});
const battleOptions = {
  mode: 'pve',
  runId,
  ownerUserId: 'verified-user-a',
  sourceRef: battleSourceRef,
  verificationContext: { realm: 1, saveSlot: 0, mapSnapshotHash: nestedMapHash },
  proof: { nodeType: 'enemy', realm: 1, runId }
};
const queuedBattle = ProgressionService.recordBattleWin(battleOptions);
assert.equal(queuedBattle.success, true);
assert.equal(queuedBattle.verificationQueued, true);
assert.equal(ProgressionService.loadQueueForUser('verified-user-a').length, 1);
assert.equal(ProgressionService.loadVerifiedQueueForUser('verified-user-a').length, 1);
ProgressionService.recordBattleWin(battleOptions);
assert.equal(ProgressionService.loadQueueForUser('verified-user-a').length, 1, 'stable observed source should deduplicate locally');
assert.equal(ProgressionService.loadVerifiedQueueForUser('verified-user-a').length, 1, 'stable verified source should deduplicate locally');

const completionSourceRef = ProgressionService.createStableSourceRef({
  runId,
  eventType: 'activity_completed',
  realm: 1,
  checkpointKey: 'completion'
});
const queuedCompletion = ProgressionService.recordActivityCompleted({
  mode: 'pve',
  runId,
  ownerUserId: 'verified-user-a',
  sourceRef: completionSourceRef,
  verificationContext: battleOptions.verificationContext,
  proof: { nodeType: 'boss', realm: 1, reason: 'realm_clear', runId }
});
assert.equal(queuedCompletion.verificationQueued, true);
assert.equal(ProgressionService.loadVerifiedQueueForUser('verified-user-a').length, 2);

const observedBatches = [];
const verifiedCalls = [];
BackendClient.submitProgressionEvents = async (events, options) => {
  observedBatches.push({ events, options });
  return {
    success: true,
    accepted: events.map(event => ({ eventId: event.eventId })),
    duplicates: [],
    rejected: []
  };
};
BackendClient.startVerifiedProgressionRun = async (payload, options) => {
  verifiedCalls.push({ kind: 'start', payload, options });
  return {
    success: true,
    ticket: {
      ticketId: `vrun-${payload.clientRunId}`,
      settlementNonce: 'c'.repeat(64),
      status: 'active'
    }
  };
};
BackendClient.submitVerifiedRunCheckpoint = async (ticketId, payload, options) => {
  verifiedCalls.push({ kind: 'checkpoint', ticketId, payload, options });
  return { success: true, checkpoint: { ticketId, sourceRef: payload.sourceRef } };
};
BackendClient.settleVerifiedProgressionRun = async (ticketId, payload, options) => {
  verifiedCalls.push({ kind: 'settle', ticketId, payload, options });
  return { success: true, receipt: { ticketId, sourceRef: payload.sourceRef } };
};

const flushResult = await ProgressionService.flush();
assert.equal(flushResult.success, true);
assert.equal(flushResult.verification.success, true);
assert.equal(ProgressionService.loadQueueForUser('verified-user-a').length, 0);
assert.equal(ProgressionService.loadVerifiedQueueForUser('verified-user-a').length, 0);
assert.equal(observedBatches.length, 1, 'observed fallback should still submit first');
assert.deepEqual(verifiedCalls.map(entry => entry.kind), ['start', 'checkpoint', 'start', 'settle']);
assert.equal(verifiedCalls.find(entry => entry.kind === 'checkpoint').payload.sourceRef, battleSourceRef);
assert.equal(verifiedCalls.find(entry => entry.kind === 'settle').payload.sourceRef, completionSourceRef);
assert.equal(verifiedCalls.find(entry => entry.kind === 'settle').payload.settlementNonce, 'c'.repeat(64));

const queueCountBeforeOwnerMismatch = ProgressionService.loadQueueForUser('verified-user-a').length;
const ownerMismatch = ProgressionService.recordBattleWin({
  ...battleOptions,
  sourceRef: 'source-owner-mismatch-0001',
  ownerUserId: 'verified-user-b'
});
assert.equal(ownerMismatch.success, false);
assert.equal(ownerMismatch.reason, 'progression_run_account_changed');
assert.equal(ProgressionService.loadQueueForUser('verified-user-a').length, queueCountBeforeOwnerMismatch, 'cross-account run must not enter observed queue');

const retryRunId = 'run-client-retry-0001';
ProgressionService.recordBattleWin({
  ...battleOptions,
  runId: retryRunId,
  sourceRef: 'source-client-retry-0001',
  proof: { nodeType: 'enemy', realm: 1, runId: retryRunId }
});
BackendClient.startVerifiedProgressionRun = async () => ({ success: false, message: 'network-timeout' });
const pendingVerification = await ProgressionService.flush();
assert.equal(pendingVerification.success, true, 'verified network failure must not invalidate observed fallback success');
assert.equal(pendingVerification.verification.success, false);
assert.equal(pendingVerification.verificationPending, true);
assert.equal(ProgressionService.loadQueueForUser('verified-user-a').length, 0);
assert.equal(ProgressionService.loadVerifiedQueueForUser('verified-user-a').length, 1, 'verified network failure should retain operation');

BackendClient.startVerifiedProgressionRun = async payload => ({
  success: true,
  ticket: { ticketId: `vrun-${payload.clientRunId}`, settlementNonce: 'd'.repeat(64), status: 'active' }
});
BackendClient.submitVerifiedRunCheckpoint = async () => ({ success: true });
const retriedVerification = await ProgressionService.flush();
assert.equal(retriedVerification.success, true);
assert.equal(retriedVerification.verification.success, true);
assert.equal(ProgressionService.loadVerifiedQueueForUser('verified-user-a').length, 0);

const terminalRunId = 'run-client-terminal-0001';
ProgressionService.recordActivityCompleted({
  mode: 'expedition',
  runId: terminalRunId,
  ownerUserId: 'verified-user-a',
  sourceRef: 'source-client-terminal-0001',
  verificationContext: { realm: 4, chapterIndex: 2, saveSlot: 1 },
  proof: { realm: 4, chapterIndex: 2, reason: 'realm_clear', runId: terminalRunId }
});
BackendClient.settleVerifiedProgressionRun = async () => ({
  success: false,
  reason: 'run_context_mismatch',
  message: 'terminal'
});
const terminalFlush = await ProgressionService.flush();
assert.equal(terminalFlush.success, true);
assert.equal(terminalFlush.verification.droppedOperations, 1, 'terminal verification rejection should fall back without retry loop');
assert.equal(ProgressionService.loadVerifiedQueueForUser('verified-user-a').length, 0);

const unsignedRunId = 'run-client-unsigned-0001';
ProgressionService.recordBattleWin({
  ...battleOptions,
  runId: unsignedRunId,
  sourceRef: 'source-client-unsigned-0001',
  proof: { nodeType: 'enemy', realm: 1, runId: unsignedRunId }
});
BackendClient.startVerifiedProgressionRun = async () => ({
  success: false,
  reason: 'verified_run_signature_required',
  message: 'session signing unavailable'
});
const unsignedFlush = await ProgressionService.flush();
assert.equal(unsignedFlush.success, true, 'missing verified signing must not invalidate observed fallback');
assert.equal(unsignedFlush.verification.droppedOperations, 1, 'verified_run_signature_required should be a terminal one-way fallback');
assert.equal(ProgressionService.loadVerifiedQueueForUser('verified-user-a').length, 0, 'unsupported verified signing must not retry forever');

currentUser = { objectId: 'verified-user-b', username: '乙' };
assert.equal(ProgressionService.loadVerifiedQueueForUser('verified-user-a').length, 0);
assert.equal(ProgressionService.loadVerifiedQueueForUser('verified-user-b').length, 0, 'verified queues should remain partitioned by account');

Object.assign(BackendClient, originals);
console.log('Verified run client checks passed.');
