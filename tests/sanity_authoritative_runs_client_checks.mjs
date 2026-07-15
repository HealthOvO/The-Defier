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

function createDeferred() {
  let resolve = null;
  let reject = null;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.window = globalThis;
globalThis.document = {
  addEventListener: () => {},
  removeEventListener: () => {}
};

const { BackendClient } = await import('../js/services/backend-client.js');
const {
  createAuthoritativeRunService
} = await import('../js/services/authoritative-run-service.js');

const originals = {
  requestServer: BackendClient.requestServer,
  createSessionIntegrityFields: BackendClient.createSessionIntegrityFields,
  getCurrentUser: BackendClient.getCurrentUser,
  ensureReady: BackendClient.ensureReady,
  init: BackendClient.init
};

BackendClient.cloudEnabled = true;
BackendClient.ensureReady = () => true;
BackendClient.init = () => ({ success: true });
BackendClient.getServerConfig = () => ({
  baseUrl: 'http://127.0.0.1:9000',
  progressionPathPrefix: '/api/progression'
});

let currentUser = { objectId: 'authrun-user-a', username: '甲' };
BackendClient.getCurrentUser = () => currentUser;
BackendClient.persistServerSession({
  token: 'authoritative-run-session-token-a-32-characters',
  user: currentUser
});

const requestCalls = [];
const signingCalls = [];
BackendClient.requestServer = async (path, options = {}) => {
  requestCalls.push({ path, options });
  if (path.endsWith('/replay')) {
    return {
      success: true,
      replay: {
        runId: 'ar-run-0001',
        events: [{ sequence: 1, eventType: 'started' }]
      }
    };
  }
  return {
    success: true,
    projection: {
      runId: 'ar-run-0001',
      mode: 'pve',
      version: 1,
      phase: 'route'
    },
    receipt: {
      receiptId: 'ar-receipt-0001'
    }
  };
};
BackendClient.createSessionIntegrityFields = async (payload, options = {}) => {
  signingCalls.push({ payload, options });
  return {
    salt: 'authoritative-client-salt',
    signature: 'b'.repeat(64),
    signatureMode: 'session'
  };
};

assert.equal(typeof BackendClient.beginAuthoritativeRun, 'function', 'BackendClient should expose beginAuthoritativeRun');
assert.equal(typeof BackendClient.getCurrentAuthoritativeRun, 'function', 'BackendClient should expose getCurrentAuthoritativeRun');
assert.equal(typeof BackendClient.getAuthoritativeRun, 'function', 'BackendClient should expose getAuthoritativeRun');
assert.equal(typeof BackendClient.submitAuthoritativeRunAction, 'function', 'BackendClient should expose submitAuthoritativeRunAction');
assert.equal(typeof BackendClient.settleAuthoritativeRun, 'function', 'BackendClient should expose settleAuthoritativeRun');
assert.equal(typeof BackendClient.getAuthoritativeRunReplay, 'function', 'BackendClient should expose getAuthoritativeRunReplay');

const beginResult = await BackendClient.beginAuthoritativeRun({
  clientRunId: 'ar-client-api-0001',
  mode: 'pve',
  contentVersion: 'authoritative-trials-v2',
  score: 9999
}, { expectedUserId: 'authrun-user-a' });
assert.equal(beginResult.success, true);
assert.equal(requestCalls.at(-1).path, '/api/progression/authoritative-runs');
assert.equal(requestCalls.at(-1).options.method, 'POST');
assert.equal(requestCalls.at(-1).options.authToken, 'authoritative-run-session-token-a-32-characters');
assert.deepEqual(signingCalls.at(-1).payload, {
  clientRunId: 'ar-client-api-0001',
  mode: 'pve',
  contentVersion: 'authoritative-trials-v2'
}, 'begin signature should cover only the signed business payload');

const defaultBeginResult = await BackendClient.beginAuthoritativeRun({
  clientRunId: 'ar-client-api-default-0001',
  mode: 'pve',
  score: 9999
}, { expectedUserId: 'authrun-user-a' });
assert.equal(defaultBeginResult.success, true);
assert.deepEqual(signingCalls.at(-1).payload, {
  clientRunId: 'ar-client-api-default-0001',
  mode: 'pve',
  contentVersion: 'authoritative-trials-v6'
}, 'begin signature should default to the current v6 content snapshot without changing the signed field set');
assert.deepEqual(requestCalls.at(-1).options.data, {
  clientRunId: 'ar-client-api-default-0001',
  mode: 'pve',
  contentVersion: 'authoritative-trials-v6',
  salt: 'authoritative-client-salt',
  signature: 'b'.repeat(64),
  signatureMode: 'session'
}, 'begin request body should keep the existing signed payload shape when defaulting to v6');

const currentResult = await BackendClient.getCurrentAuthoritativeRun('challenge', { expectedUserId: 'authrun-user-a' });
assert.equal(currentResult.success, true);
assert.equal(requestCalls.at(-1).path, '/api/progression/authoritative-runs/current?mode=challenge');
assert.equal(requestCalls.at(-1).options.method, 'GET');
assert.equal(requestCalls.at(-1).options.authToken, 'authoritative-run-session-token-a-32-characters');

const getResult = await BackendClient.getAuthoritativeRun('ar-run-0001', { expectedUserId: 'authrun-user-a' });
assert.equal(getResult.success, true);
assert.equal(requestCalls.at(-1).path, '/api/progression/authoritative-runs/ar-run-0001');

const actionResult = await BackendClient.submitAuthoritativeRunAction('ar-run-0001', {
  actionId: 'ar-action-api-0001',
  expectedVersion: 7,
  command: 'play_card',
  payload: {
    cardInstanceId: 'card-12',
    rewardId: 'should-not-pass',
    score: 999
  }
}, { expectedUserId: 'authrun-user-a' });
assert.equal(actionResult.success, true);
assert.equal(requestCalls.at(-1).path, '/api/progression/authoritative-runs/ar-run-0001/actions');
assert.deepEqual(signingCalls.at(-1).payload, {
  runId: 'ar-run-0001',
  actionId: 'ar-action-api-0001',
  expectedVersion: 7,
  command: 'play_card',
  payload: {
    cardInstanceId: 'card-12'
  }
}, 'action signature should bind the path runId and the allowlisted payload only');
assert.deepEqual(requestCalls.at(-1).options.data, {
  runId: 'ar-run-0001',
  actionId: 'ar-action-api-0001',
  expectedVersion: 7,
  command: 'play_card',
  payload: {
    cardInstanceId: 'card-12'
  },
  salt: 'authoritative-client-salt',
  signature: 'b'.repeat(64),
  signatureMode: 'session'
});

const invalidActionRequests = requestCalls.length;
const invalidAction = await BackendClient.submitAuthoritativeRunAction('ar-run-0001', {
  actionId: 'ar-action-invalid-0001',
  expectedVersion: 7,
  command: 'choose_reward',
  payload: {
    score: 999
  }
}, { expectedUserId: 'authrun-user-a' });
assert.equal(invalidAction.success, false);
assert.equal(invalidAction.reason, 'authoritative_run_invalid_payload');
assert.equal(requestCalls.length, invalidActionRequests, 'invalid action payload should stop before network submission');

const settleResult = await BackendClient.settleAuthoritativeRun('ar-run-0001', {
  mutationId: 'ar-settle-api-0001',
  expectedVersion: 31,
  outcome: 'completed'
}, { expectedUserId: 'authrun-user-a' });
assert.equal(settleResult.success, true);
assert.equal(requestCalls.at(-1).path, '/api/progression/authoritative-runs/ar-run-0001/settle');
assert.deepEqual(signingCalls.at(-1).payload, {
  runId: 'ar-run-0001',
  mutationId: 'ar-settle-api-0001',
  expectedVersion: 31
}, 'settle signature should bind the path runId and expectedVersion');

const replayResult = await BackendClient.getAuthoritativeRunReplay('ar-run-0001', { expectedUserId: 'authrun-user-a' });
assert.equal(replayResult.success, true);
assert.equal(requestCalls.at(-1).path, '/api/progression/authoritative-runs/ar-run-0001/replay');

const stableSigningStub = BackendClient.createSessionIntegrityFields;
BackendClient.createSessionIntegrityFields = async (payload, options = {}) => {
  const integrity = await stableSigningStub(payload, options);
  currentUser = { objectId: 'authrun-user-b', username: '乙' };
  return integrity;
};
BackendClient.persistServerSession({
  token: 'authoritative-run-session-token-a-32-characters',
  user: { objectId: 'authrun-user-a', username: '甲' }
});
const churnAction = await BackendClient.submitAuthoritativeRunAction('ar-run-0001', {
  actionId: 'ar-action-churn-0001',
  expectedVersion: 8,
  command: 'end_turn',
  payload: {
    score: 999
  }
}, { expectedUserId: 'authrun-user-a' });
assert.equal(requestCalls.at(-1).options.authToken, 'authoritative-run-session-token-a-32-characters', 'account churn after signing must not switch action auth token');
assert.equal(churnAction.success, false);
assert.equal(churnAction.reason, 'authoritative_run_account_changed');
assert.equal(churnAction.actionId, 'ar-action-churn-0001');

BackendClient.createSessionIntegrityFields = async () => ({ signatureMode: 'legacy' });
currentUser = { objectId: 'authrun-user-a', username: '甲' };
BackendClient.persistServerSession({
  token: 'authoritative-run-session-token-a-32-characters',
  user: currentUser
});
const requestCountBeforeUnsigned = requestCalls.length;
const unsignedSettle = await BackendClient.settleAuthoritativeRun('ar-run-0001', {
  mutationId: 'ar-settle-unsigned-0001',
  expectedVersion: 9
}, { expectedUserId: 'authrun-user-a' });
assert.equal(unsignedSettle.success, false);
assert.equal(unsignedSettle.reason, 'authoritative_run_signature_required');
assert.equal(requestCalls.length, requestCountBeforeUnsigned, 'unsupported authoritative signing should stop before settle network submission');
BackendClient.createSessionIntegrityFields = stableSigningStub;

let serviceUserId = 'service-user-a';
let beginCalls = [];
let actionCalls = [];
let settleCalls = [];
let currentCalls = [];
let replayCalls = [];
let generatedIdCounter = 0;
let actionFailCount = 0;
let settleFailCount = 0;
let currentDeferredQueue = [];

const serviceClient = {
  getCurrentUser() {
    return serviceUserId ? { objectId: serviceUserId, username: '试' } : null;
  },
  createAuthoritativeRunRequestId(prefix = 'ar') {
    generatedIdCounter += 1;
    return `${prefix}-generated-${String(generatedIdCounter).padStart(4, '0')}`;
  },
  async beginAuthoritativeRun(payload, options = {}) {
    beginCalls.push({ payload, options });
    return {
      success: true,
      ticket: { ticketId: 'ticket-service-0001' },
      projection: {
        runId: 'ar-service-run-0001',
        mode: payload.mode,
        version: 1,
        phase: 'route'
      }
    };
  },
  async getCurrentAuthoritativeRun(mode, options = {}) {
    currentCalls.push({ mode, options });
    if (currentDeferredQueue.length > 0) {
      return await currentDeferredQueue.shift().promise;
    }
    return {
      success: true,
      projection: {
        runId: 'ar-service-run-0001',
        mode,
        version: 1,
        phase: 'route'
      }
    };
  },
  async getAuthoritativeRun(runId, options = {}) {
    return {
      success: true,
      projection: {
        runId,
        mode: 'pve',
        version: 1,
        phase: 'route'
      }
    };
  },
  async submitAuthoritativeRunAction(runId, payload, options = {}) {
    actionCalls.push({ runId, payload, options });
    actionFailCount += 1;
    if (actionFailCount === 1) {
      return {
        success: false,
        reason: 'network_timeout',
        message: 'timeout'
      };
    }
    return {
      success: true,
      receipt: { receiptId: 'action-receipt-0001' },
      projection: {
        runId,
        mode: 'pve',
        version: payload.expectedVersion + 1,
        phase: 'battle'
      }
    };
  },
  async settleAuthoritativeRun(runId, payload, options = {}) {
    settleCalls.push({ runId, payload, options });
    settleFailCount += 1;
    if (settleFailCount === 1) {
      return {
        success: false,
        reason: 'network_timeout',
        message: 'settle-timeout'
      };
    }
    return {
      success: true,
      receipt: { receiptId: 'settle-receipt-0001' },
      projection: {
        runId,
        mode: 'pve',
        version: payload.expectedVersion + 1,
        phase: 'completed'
      }
    };
  },
  async getAuthoritativeRunReplay(runId, options = {}) {
    replayCalls.push({ runId, options });
    return {
      success: true,
      replay: {
        runId,
        publicEvents: [{ sequence: 2, eventType: 'battle_started' }]
      }
    };
  }
};

const serviceSnapshots = [];
const service = createAuthoritativeRunService({
  client: serviceClient,
  now: (() => {
    let tick = 2000;
    return () => ++tick;
  })()
});
const unsubscribe = service.subscribe(snapshot => {
  serviceSnapshots.push(snapshot);
});

const serviceBegin = await service.begin({ mode: 'pve', expectedUserId: 'service-user-a' });
assert.equal(serviceBegin.success, true);
assert.equal(beginCalls.length, 1);
assert.equal(beginCalls[0].payload.clientRunId, 'ar-client-generated-0001', 'service begin should generate and cache a clientRunId');
assert.equal(beginCalls[0].payload.contentVersion, 'authoritative-trials-v6', 'service begin should pin the current authoritative content snapshot');
assert.equal(service.getState().runId, 'ar-service-run-0001');
assert.equal(service.getState().projection.version, 1);
assert.equal(serviceSnapshots.some(snapshot => snapshot.pending && snapshot.pending.kind === 'begin'), true, 'subscription should observe pending begin state');

await service.begin({ mode: 'pve', expectedUserId: 'service-user-a' });
assert.equal(beginCalls[1].payload.clientRunId, beginCalls[0].payload.clientRunId, 'ordinary begin retry should reuse the cached clientRunId');
await service.begin({ mode: 'pve', forceNew: true, expectedUserId: 'service-user-a' });
assert.notEqual(beginCalls[2].payload.clientRunId, beginCalls[1].payload.clientRunId, 'explicit new run should mint a fresh clientRunId');

const actionFailure = await service.action({
  runId: 'ar-service-run-0001',
  expectedVersion: 1,
  command: 'end_turn',
  payload: {},
  expectedUserId: 'service-user-a'
});
assert.equal(actionFailure.success, false);
assert.equal(actionFailure.reason, 'network_timeout');
assert.equal(service.getState().projection.version, 1, 'failed action must not advance the confirmed projection');
assert.equal(service.getState().lastError.message, 'timeout');

const actionSuccess = await service.action({
  runId: 'ar-service-run-0001',
  expectedVersion: 1,
  command: 'end_turn',
  payload: {},
  expectedUserId: 'service-user-a'
});
assert.equal(actionSuccess.success, true);
assert.equal(actionCalls.length, 2);
assert.equal(actionCalls[0].payload.actionId, actionCalls[1].payload.actionId, 'same action retry should reuse the cached actionId');
assert.equal(service.getState().projection.version, 2, 'successful action should only accept the server projection');

const settleFailure = await service.settle({
  runId: 'ar-service-run-0001',
  expectedVersion: 2,
  expectedUserId: 'service-user-a'
});
assert.equal(settleFailure.success, false);
assert.equal(settleFailure.reason, 'network_timeout');
assert.equal(service.getState().projection.version, 2, 'failed settle must not advance the confirmed projection');

const settleSuccess = await service.settle({
  runId: 'ar-service-run-0001',
  expectedVersion: 2,
  expectedUserId: 'service-user-a'
});
assert.equal(settleSuccess.success, true);
assert.equal(settleCalls.length, 2);
assert.equal(settleCalls[0].payload.mutationId, settleCalls[1].payload.mutationId, 'same settle retry should reuse the cached mutationId');
assert.equal(service.getState().projection.version, 3);
assert.equal(service.getState().projection.phase, 'completed');

const recoveredCurrent = createDeferred();
currentDeferredQueue = [recoveredCurrent];
const recoveredService = createAuthoritativeRunService({ client: serviceClient, now: () => 2500 });
const recoveredCurrentPromise = recoveredService.current({ mode: 'pve', expectedUserId: 'service-user-a' });
recoveredCurrent.resolve({
  success: true,
  run: null,
  recoveryKind: 'settlement_receipt',
  lastSettlement: {
    runId: 'ar-service-run-0001',
    mode: 'pve',
    status: 'settled',
    receipt: { receiptId: 'settle-receipt-recovered-0001', recovered: true },
    projection: {
      runId: 'ar-service-run-0001',
      mode: 'pve',
      version: 3,
      phase: 'completed',
      runStatus: 'settled'
    }
  }
});
const recoveredCurrentResult = await recoveredCurrentPromise;
assert.equal(recoveredCurrentResult.success, true);
assert.equal(recoveredService.getState().runId, 'ar-service-run-0001');
assert.equal(recoveredService.getState().projection.runStatus, 'settled', 'fresh service should recover the durable settlement projection');
assert.equal(recoveredService.getState().lastReceipt.receiptId, 'settle-receipt-recovered-0001', 'fresh service should recover the durable settlement receipt');

const staleFirst = createDeferred();
const staleSecond = createDeferred();
currentDeferredQueue = [staleFirst, staleSecond];
const stalePromiseA = service.current({ mode: 'pve', expectedUserId: 'service-user-a' });
const stalePromiseB = service.current({ mode: 'pve', expectedUserId: 'service-user-a' });
staleSecond.resolve({
  success: true,
  projection: {
    runId: 'ar-service-run-0001',
    mode: 'pve',
    version: 5,
    phase: 'battle'
  }
});
const staleApplied = await stalePromiseB;
assert.equal(staleApplied.success, true);
assert.equal(service.getState().projection.version, 5);
staleFirst.resolve({
  success: true,
  projection: {
    runId: 'ar-service-run-0001',
    mode: 'pve',
    version: 4,
    phase: 'route'
  }
});
const staleSuppressed = await stalePromiseA;
assert.equal(staleSuppressed.suppressed, true, 'older current response should be suppressed once a newer request wins');
assert.equal(service.getState().projection.version, 5, 'stale response must not downgrade the projection');

const churnDeferred = createDeferred();
currentDeferredQueue = [churnDeferred];
const accountChurnPromise = service.current({ mode: 'pve', expectedUserId: 'service-user-a' });
serviceUserId = 'service-user-b';
churnDeferred.resolve({
  success: true,
  projection: {
    runId: 'ar-service-run-0001',
    mode: 'pve',
    version: 6,
    phase: 'battle'
  }
});
const accountChurnResult = await accountChurnPromise;
assert.equal(accountChurnResult.success, false);
assert.equal(accountChurnResult.reason, 'authoritative_run_account_changed');
assert.equal(service.getState().projection.version, 5, 'account churn should suppress late authoritative responses');

serviceUserId = 'service-user-a';
const successfulActionStub = serviceClient.submitAuthoritativeRunAction;
serviceClient.submitAuthoritativeRunAction = async (runId) => ({
  success: false,
  reason: 'stale_run_version',
  message: '权威状态已更新，请同步后重试',
  run: {
    state: {
      runId,
      mode: 'pve',
      version: 6,
      phase: 'battle'
    }
  }
});
const staleVersionResult = await service.action({
  runId: 'ar-service-run-0001',
  expectedVersion: 5,
  command: 'end_turn',
  payload: {},
  expectedUserId: 'service-user-a'
});
assert.equal(staleVersionResult.success, false);
assert.equal(staleVersionResult.reason, 'stale_run_version');
assert.equal(service.getState().projection.version, 6, 'stale-version failure should adopt only the newer server projection');
assert.equal(service.getState().lastError.reason, 'stale_run_version');
serviceClient.submitAuthoritativeRunAction = successfulActionStub;

const replayResultService = await service.replay({
  runId: 'ar-service-run-0001',
  expectedUserId: 'service-user-a'
});
assert.equal(replayResultService.success, true);
assert.equal(replayCalls.length, 1);
assert.equal(service.getState().lastReplayRunId, 'ar-service-run-0001');
assert.equal(service.getState().lastReplay.publicEvents[0].eventType, 'battle_started');

const resetDeferred = createDeferred();
currentDeferredQueue = [resetDeferred];
const preResetPromise = service.current({ mode: 'pve', expectedUserId: 'service-user-a' });
service.reset();
resetDeferred.resolve({
  success: true,
  projection: {
    runId: 'ar-service-run-pre-reset',
    mode: 'pve',
    version: 99,
    phase: 'battle'
  }
});
const preResetResult = await preResetPromise;
assert.equal(preResetResult.suppressed, true, 'reset should invalidate every in-flight projection request');
assert.equal(service.getState().projection, null, 'pre-reset response must not repopulate a cleared projection');
assert.equal(service.getState().lastError, null, 'pre-reset response must not repopulate a cleared error');

unsubscribe();
Object.assign(BackendClient, originals);
console.log('Authoritative run client checks passed.');
