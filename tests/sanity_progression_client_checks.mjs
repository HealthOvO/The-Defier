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
  removeEventListener: () => {},
  createElement: () => ({
    style: {},
    classList: { add: () => {}, remove: () => {} },
    appendChild: () => {},
    remove: () => {},
    setAttribute: () => {},
    getContext: () => null
  }),
  body: {
    appendChild: () => {}
  }
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const { BackendClient } = await import('../js/services/backend-client.js');
const { ProgressionService } = await import('../js/services/progression-service.js');
const { AuthService } = await import('../js/services/authService.js');

function queueFor(userId) {
  return JSON.parse(localStorage.getItem(ProgressionService.getQueueStorageKey(userId)) || '[]');
}

const originalRequestServer = BackendClient.requestServer;
const originalCreateSessionIntegrityFields = BackendClient.createSessionIntegrityFields;
const originalGetCurrentUser = BackendClient.getCurrentUser;
const originalLogin = BackendClient.login;
const originalRegister = BackendClient.register;
const originalLogout = BackendClient.logout;
const originalSubmitProgressionEvents = BackendClient.submitProgressionEvents;
const originalEnsureReady = BackendClient.ensureReady;
const originalInit = BackendClient.init;

BackendClient.cloudEnabled = true;
BackendClient.ensureReady = () => true;
BackendClient.init = () => ({ success: true });
BackendClient.getServerConfig = () => ({
  baseUrl: 'http://127.0.0.1:9000',
  authPathPrefix: '/api/auth',
  savePathPrefix: '/api/saves',
  userPathPrefix: '/api/user',
  ghostPathPrefix: '/api/ghosts',
  pvpPathPrefix: '/api/pvp',
  progressionPathPrefix: '/api/progression'
});

const requestCalls = [];
const signedPayloads = [];
const signingOptions = [];
BackendClient.requestServer = async (path, options = {}) => {
  requestCalls.push({ path, options });
  return {
    success: true,
    path,
    echoed: options.data || null
  };
};
BackendClient.createSessionIntegrityFields = async (payload, options = {}) => {
  signedPayloads.push(payload);
  signingOptions.push(options);
  return {
    salt: 'signed-salt',
    signature: 'signed-signature',
    signatureMode: 'session'
  };
};
BackendClient.getCurrentUser = () => ({
  objectId: 'progress-user-a',
  username: '甲'
});

assert.equal(typeof BackendClient.getProgressionStatus, 'function', 'BackendClient should expose getProgressionStatus');
assert.equal(typeof BackendClient.submitProgressionEvents, 'function', 'BackendClient should expose submitProgressionEvents');
assert.equal(typeof BackendClient.claimProgressionReward, 'function', 'BackendClient should expose claimProgressionReward');
assert.equal(typeof BackendClient.getProgressionLedger, 'function', 'BackendClient should expose getProgressionLedger');

const sampleEvents = [
  {
    eventId: 'evt-pve-battle-0001',
    eventType: 'battle_won',
    mode: 'pve',
    sourceRef: 'run-alpha-node-0001'
  }
];
const status = await BackendClient.getProgressionStatus();
assert.equal(status.success, true, 'progression status should forward success payload');
assert.equal(requestCalls.at(-1).path, '/api/progression/status', 'progression status should use status endpoint');
assert.equal(requestCalls.at(-1).options.method, 'GET', 'progression status should GET');

const submitted = await BackendClient.submitProgressionEvents(sampleEvents);
assert.equal(submitted.success, true, 'progression event submit should forward success payload');
assert.equal(requestCalls.at(-1).path, '/api/progression/events', 'progression events should use event endpoint');
assert.equal(requestCalls.at(-1).options.method, 'POST', 'progression events should POST');
assert.deepEqual(signedPayloads.at(-1), { events: sampleEvents }, 'progression event signature should be computed from {events}');
assert.deepEqual(
  requestCalls.at(-1).options.data,
  {
    events: sampleEvents,
    salt: 'signed-salt',
    signature: 'signed-signature',
    signatureMode: 'session'
  },
  'progression events should send signed event batches'
);

BackendClient.persistServerSession({
  token: 'bound-session-token-32-characters',
  user: { objectId: 'progress-user-a', username: '甲' }
});
const boundSubmit = await BackendClient.submitProgressionEvents(sampleEvents, { expectedUserId: 'progress-user-a' });
assert.equal(boundSubmit.success, true, 'account-bound progression submit should succeed for the captured session');
assert.equal(signingOptions.at(-1).sessionToken, 'bound-session-token-32-characters', 'progression submit should sign with the captured account token');
assert.equal(requestCalls.at(-1).options.authToken, 'bound-session-token-32-characters', 'progression submit should send with the same captured account token');
const requestsBeforeMismatch = requestCalls.length;
const mismatchedSubmit = await BackendClient.submitProgressionEvents(sampleEvents, { expectedUserId: 'progress-user-b' });
assert.equal(mismatchedSubmit.success, false, 'account-bound progression submit should reject a changed account');
assert.equal(mismatchedSubmit.reason, 'progression_account_changed');
assert.equal(requestCalls.length, requestsBeforeMismatch, 'account mismatch should stop before network submission');
BackendClient.persistServerSession(null);

BackendClient.persistServerSession({
  token: 'claim-session-token-a-32-characters',
  user: { objectId: 'progress-user-a', username: '甲' }
});
const claim = await BackendClient.claimProgressionReward('daily_battle_wins', 'daily:2026-07-10');
assert.equal(claim.success, true, 'progression reward claim should forward success payload');
assert.equal(requestCalls.at(-1).path, '/api/progression/rewards/daily_battle_wins/claim', 'progression claim should use reward endpoint');
assert.equal(requestCalls.at(-1).options.method, 'POST', 'progression claim should POST');
assert.deepEqual(
  signedPayloads.at(-1),
  {
    objectiveId: 'daily_battle_wins',
    cycleId: 'daily:2026-07-10'
  },
  'progression claim signature should be computed from {objectiveId, cycleId}'
);
assert.deepEqual(
  requestCalls.at(-1).options.data,
  {
    objectiveId: 'daily_battle_wins',
    cycleId: 'daily:2026-07-10',
    salt: 'signed-salt',
    signature: 'signed-signature',
    signatureMode: 'session'
  },
  'progression claim should send signed objective + cycle payload'
);
assert.equal(signingOptions.at(-1).sessionToken, 'claim-session-token-a-32-characters', 'progression claim should sign with one captured token');
assert.equal(requestCalls.at(-1).options.authToken, 'claim-session-token-a-32-characters', 'progression claim should send the same captured token');

const stableIntegrityStub = BackendClient.createSessionIntegrityFields;
BackendClient.createSessionIntegrityFields = async (payload, options = {}) => {
  const integrity = await stableIntegrityStub(payload, options);
  BackendClient.persistServerSession({
    token: 'claim-session-token-b-32-characters',
    user: { objectId: 'progress-user-b', username: '乙' }
  });
  return integrity;
};
BackendClient.persistServerSession({
  token: 'claim-session-token-a-32-characters',
  user: { objectId: 'progress-user-a', username: '甲' }
});
const churnClaim = await BackendClient.claimProgressionReward('daily_battle_wins', 'daily:2026-07-10');
assert.equal(churnClaim.success, true, 'session churn after signing should not corrupt a progression claim');
assert.equal(signingOptions.at(-1).sessionToken, 'claim-session-token-a-32-characters');
assert.equal(requestCalls.at(-1).options.authToken, 'claim-session-token-a-32-characters', 'session churn must not switch the Bearer token after signing');
BackendClient.createSessionIntegrityFields = stableIntegrityStub;
BackendClient.persistServerSession({
  token: 'claim-session-token-a-32-characters',
  user: { objectId: 'progress-user-a', username: '甲' }
});

const ledger = await BackendClient.getProgressionLedger({ limit: 77, cursor: '345:progression-ledger-cursor-0001' });
assert.equal(ledger.success, true, 'progression ledger should forward success payload');
assert.equal(requestCalls.at(-1).path, '/api/progression/ledger?limit=50&cursor=345%3Aprogression-ledger-cursor-0001', 'progression ledger should clamp and encode the composite cursor');
assert.equal(requestCalls.at(-1).options.method, 'GET', 'progression ledger should GET');

BackendClient.requestServer = originalRequestServer;
BackendClient.createSessionIntegrityFields = originalCreateSessionIntegrityFields;

localStorage.clear();
ProgressionService.activeFlushByKey = {};
ProgressionService.memoryQueueByKey = {};

let currentUser = { objectId: 'progress-user-a', username: '甲' };
BackendClient.getCurrentUser = () => currentUser;

const queuedA = ProgressionService.recordBattleWin({
  eventId: 'evt-battle-aa-0001',
  mode: 'pve',
  sourceRef: 'run-alpha-node-0001',
  proof: { nodeType: 'boss', runId: 'run-alpha' }
});
assert.equal(queuedA.success, true, 'recordBattleWin should enqueue a logged-in event');
assert.equal(queueFor('progress-user-a').length, 1, 'user A queue should persist in localStorage');

currentUser = { objectId: 'progress-user-b', username: '乙' };
const queuedB = ProgressionService.recordActivityCompleted({
  eventId: 'evt-activity-bb-0001',
  mode: 'challenge',
  sourceRef: 'challenge-alpha-complete-0001',
  proof: { challengeMode: 'weekly', rotationKey: 'rotation-0001' }
});
assert.equal(queuedB.success, true, 'recordActivityCompleted should enqueue for the current user');
assert.equal(queueFor('progress-user-a').length, 1, 'user A queue should stay isolated');
assert.equal(queueFor('progress-user-b').length, 1, 'user B queue should stay isolated');

currentUser = null;
const anonymous = ProgressionService.recordBattleWin({
  eventId: 'evt-battle-zz-0001',
  mode: 'pve',
  sourceRef: 'run-anon-node-0001'
});
assert.equal(anonymous.success, false, 'logged-out progression events should not enqueue');
assert.equal(localStorage.getItem(`${ProgressionService.storagePrefix}:`), null, 'logged-out progression events should not create a shared queue bucket');

currentUser = { objectId: 'progress-user-generated', username: '自动' };
const generatedIdentity = ProgressionService.recordBattleWin({
  mode: 'pve',
  proof: { nodeType: 'boss', realm: 4, runId: 'generated-run-0001', secretProbe: 'must-not-stay-local' }
});
assert.equal(generatedIdentity.success, true, 'gameplay hooks should be able to rely on generated event identity');
assert.match(generatedIdentity.event.eventId, /^[A-Za-z0-9._:-]{8,128}$/);
assert.match(generatedIdentity.event.sourceRef, /^[A-Za-z0-9._:-]{8,128}$/);
assert.equal(generatedIdentity.event.proof.secretProbe, undefined, 'local progression proof should use the same whitelist as the server');
ProgressionService.saveQueueForUser('progress-user-generated', []);

currentUser = { objectId: 'progress-user-b', username: '乙' };
const invalidEventId = ProgressionService.recordBattleWin({
  eventId: 'short',
  mode: 'pve',
  sourceRef: 'run-invalid-node-0001'
});
assert.equal(invalidEventId.success, false, 'unsafe progression event ids should be rejected locally');
const invalidSourceRef = ProgressionService.recordActivityCompleted({
  eventId: 'evt-activity-bb-0002',
  mode: 'challenge',
  sourceRef: 'short'
});
assert.equal(invalidSourceRef.success, false, 'unsafe progression source refs should be rejected locally');
const queuedB2 = ProgressionService.recordBattleWin({
  eventId: 'evt-battle-bb-0002',
  mode: 'challenge',
  sourceRef: 'challenge-beta-node-0002'
});
assert.equal(queuedB2.success, true, 'second user B event should enqueue');
assert.equal(queueFor('progress-user-b').length, 2, 'user B queue should retain only valid events');

BackendClient.submitProgressionEvents = async () => ({
  success: true,
  accepted: [],
  duplicates: [{ eventId: 'evt-activity-bb-0001' }],
  rejected: [{ eventId: 'evt-battle-bb-0002', reason: 'daily_event_limit' }]
});
const mixedReceiptFlush = await ProgressionService.flush();
assert.equal(mixedReceiptFlush.success, true, 'duplicate and rejected receipts should still clear the queue');
assert.equal(queueFor('progress-user-b').length, 0, 'duplicate and rejected receipts should remove queued events');

currentUser = { objectId: 'progress-user-a', username: '甲' };
let flushAttempt = 0;
const submittedBatches = [];
BackendClient.submitProgressionEvents = async (events) => {
  flushAttempt += 1;
  submittedBatches.push(events.map(event => event.eventId));
  if (flushAttempt === 1) {
    return {
      success: false,
      message: 'network-timeout'
    };
  }
  return {
    success: true,
    accepted: [],
    duplicates: [{ eventId: 'evt-battle-aa-0001' }],
    rejected: []
  };
};

const failedFlush = await ProgressionService.flush();
assert.equal(failedFlush.success, false, 'network failure should not report flush success');
assert.equal(queueFor('progress-user-a').length, 1, 'network failure should preserve queued events');

const replayFlush = await ProgressionService.flush();
assert.equal(replayFlush.success, true, 'duplicate receipts should still produce a successful flush');
assert.equal(queueFor('progress-user-a').length, 0, 'duplicate receipts should clear matching queued events');
assert.deepEqual(submittedBatches, [['evt-battle-aa-0001'], ['evt-battle-aa-0001']], 'retry should resend the same preserved batch');

currentUser = { objectId: 'progress-user-c', username: '丙' };
for (let index = 0; index < 25; index += 1) {
  const suffix = String(index).padStart(4, '0');
  const result = ProgressionService.recordBattleWin({
    eventId: `evt-batch-limit-${suffix}-x`,
    mode: index % 2 === 0 ? 'pve' : 'expedition',
    sourceRef: `source-batch-limit-${suffix}`,
    proof: { runId: `run-batch-limit-${suffix}` }
  });
  assert.equal(result.success, true, `batch event ${index} should enqueue`);
}

let releaseFirstBatch = null;
const firstBatchReleased = new Promise(resolve => {
  releaseFirstBatch = resolve;
});
const batchedSizes = [];
let inFlightCount = 0;
BackendClient.submitProgressionEvents = async (events) => {
  inFlightCount += 1;
  batchedSizes.push(events.length);
  assert.equal(inFlightCount, 1, 'progression flush should serialize concurrent submissions');
  if (batchedSizes.length === 1) {
    await firstBatchReleased;
  }
  inFlightCount -= 1;
  return {
    success: true,
    accepted: events.map(event => ({ eventId: event.eventId })),
    duplicates: [],
    rejected: []
  };
};

const flushA = ProgressionService.flush();
const flushB = ProgressionService.flush();
assert.strictEqual(flushA, flushB, 'concurrent flush calls should share the same in-flight promise');
await Promise.resolve();
assert.deepEqual(batchedSizes, [20], 'flush should cap each submitted batch at 20 events');
releaseFirstBatch();
const batchFlushResult = await flushA;
assert.equal(batchFlushResult.success, true, 'multi-batch flush should succeed');
assert.deepEqual(batchedSizes, [20, 5], 'flush should drain the queue in bounded batches');
assert.equal(queueFor('progress-user-c').length, 0, 'successful receipts should clear the full queue');

currentUser = { objectId: 'progress-user-relogin', username: '重登' };
ProgressionService.recordBattleWin({
  eventId: 'evt-relogin-lock-0001',
  mode: 'pve',
  sourceRef: 'source-relogin-lock-0001'
});
let releaseReloginSubmit = null;
const reloginSubmitGate = new Promise(resolve => {
  releaseReloginSubmit = resolve;
});
let reloginSubmitCalls = 0;
BackendClient.submitProgressionEvents = async (events) => {
  reloginSubmitCalls += 1;
  await reloginSubmitGate;
  return {
    success: true,
    accepted: events.map(event => ({ eventId: event.eventId })),
    duplicates: [],
    rejected: []
  };
};
const reloginFlushA = ProgressionService.flush();
await Promise.resolve();
assert.equal(reloginSubmitCalls, 1, 'first same-account flush should start one request');
assert.equal(ProgressionService.resetActiveFlushState('progress-user-relogin'), false, 'logout must not discard an in-flight same-account lock');
const reloginFlushB = ProgressionService.flush();
assert.strictEqual(reloginFlushA, reloginFlushB, 'same-account relogin should reuse the in-flight flush promise');
releaseReloginSubmit();
const reloginResult = await reloginFlushA;
assert.equal(reloginResult.success, true);
assert.equal(reloginSubmitCalls, 1, 'same-account relogin must not duplicate submissions');
assert.equal(queueFor('progress-user-relogin').length, 0);

currentUser = { objectId: 'progress-user-cross-context', username: '跨上下文' };
ProgressionService.recordBattleWin({
  eventId: 'evt-cross-context-0001',
  mode: 'pve',
  sourceRef: 'source-cross-context-0001'
});
BackendClient.submitProgressionEvents = async (events) => {
  ProgressionService.saveQueueForUser('progress-user-cross-context', []);
  return {
    success: true,
    accepted: events.map(event => ({ eventId: event.eventId })),
    duplicates: [],
    rejected: []
  };
};
const crossContextFlush = await ProgressionService.flush();
assert.equal(crossContextFlush.success, true, 'a matching receipt already consumed by another context should converge successfully');
assert.equal(queueFor('progress-user-cross-context').length, 0);

let progressionFlushCalls = 0;
let resetCalls = 0;
ProgressionService.flush = async () => {
  progressionFlushCalls += 1;
  return { success: true };
};
ProgressionService.resetActiveFlushState = (userId) => {
  resetCalls += 1;
  return !!userId;
};

let authUser = { objectId: 'auth-user-a', username: 'authA' };
BackendClient.getCurrentUser = () => authUser;
BackendClient.login = async () => ({ success: true, user: authUser });
BackendClient.register = async () => ({ success: true, user: authUser });
BackendClient.logout = () => {};
AuthService.isInitialized = true;
AuthService.currentUser = { objectId: 'auth-user-prev', username: 'prev' };
AuthService.saveQueueBySlot = {};
AuthService.latestSaveTimeBySlot = {};

await AuthService.login('userA', 'pwd');
await Promise.resolve();
assert.equal(progressionFlushCalls, 1, 'AuthService login should trigger progression flush');

await AuthService.register('userB', 'pwd');
await Promise.resolve();
assert.equal(progressionFlushCalls, 2, 'AuthService register should trigger progression flush');

const preservedQueueKey = ProgressionService.getQueueStorageKey('auth-user-a');
localStorage.setItem(preservedQueueKey, JSON.stringify([
  {
    eventId: 'evt-preserved-aa',
    eventType: 'battle_won',
    mode: 'pve',
    sourceRef: 'source-preserved-aa'
  }
]));
AuthService.currentUser = { objectId: 'auth-user-a', username: 'authA' };
AuthService.logout();
assert.equal(resetCalls, 1, 'AuthService logout should reset active progression flush state for the current user');
assert.equal(JSON.parse(localStorage.getItem(preservedQueueKey) || '[]').length, 1, 'AuthService logout should not delete persisted queues for other accounts');

BackendClient.requestServer = originalRequestServer;
BackendClient.createSessionIntegrityFields = originalCreateSessionIntegrityFields;
BackendClient.getCurrentUser = originalGetCurrentUser;
BackendClient.login = originalLogin;
BackendClient.register = originalRegister;
BackendClient.logout = originalLogout;
BackendClient.submitProgressionEvents = originalSubmitProgressionEvents;
BackendClient.ensureReady = originalEnsureReady;
BackendClient.init = originalInit;

console.log('Progression client sanity checks passed.');
