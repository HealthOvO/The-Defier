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

const { BackendClient, SESSION_STORAGE_KEY, CLOUD_STATE_PROTOCOL_VERSION } = await import('../js/services/backend-client.js');
const { AuthService } = await import('../js/services/authService.js');
const { ProgressionService } = await import('../js/services/progression-service.js');

const originals = {
  requestServer: BackendClient.requestServer,
  createSessionIntegrityFields: BackendClient.createSessionIntegrityFields,
  getCurrentUser: BackendClient.getCurrentUser,
  ensureReady: BackendClient.ensureReady,
  init: BackendClient.init,
  login: BackendClient.login,
  logout: BackendClient.logout,
  saveCloudData: BackendClient.saveCloudData,
  getCloudData: BackendClient.getCloudData,
  saveGlobalData: BackendClient.saveGlobalData,
  getGlobalData: BackendClient.getGlobalData,
  getCloudSaveHistory: BackendClient.getCloudSaveHistory,
  restoreCloudSaveRevision: BackendClient.restoreCloudSaveRevision,
  getGlobalDataHistory: BackendClient.getGlobalDataHistory,
  restoreGlobalDataRevision: BackendClient.restoreGlobalDataRevision,
  fetch: globalThis.fetch,
  progressionFlush: ProgressionService.flush,
  progressionReset: ProgressionService.resetActiveFlushState
};

const userA = { objectId: 'cloud-user-a', username: '甲' };
const userB = { objectId: 'cloud-user-b', username: '乙' };
let currentUser = userA;

function setServerConfig() {
  localStorage.setItem('theDefierServerConfig', JSON.stringify({ baseUrl: 'http://127.0.0.1:9000' }));
}

function setSession(user, token) {
  currentUser = user;
  BackendClient.persistServerSession({
    token,
    user
  });
}

function resetAuthState(user = currentUser) {
  AuthService.isInitialized = true;
  AuthService.currentUser = user;
  AuthService.resetCloudSaveState();
  AuthService.clearActiveRevisionState();
  AuthService.loadRevisionCacheForUser(user);
}

function revisionStorageKey(user) {
  return `${AuthService.revisionCacheStoragePrefix}:${user.objectId}`;
}

BackendClient.cloudEnabled = true;
BackendClient.ensureReady = () => true;
BackendClient.init = () => ({ success: true });
BackendClient.getCurrentUser = () => currentUser;
ProgressionService.flush = async () => ({ success: true });
ProgressionService.resetActiveFlushState = () => {};
setServerConfig();
setSession(userA, 'session-token-a-32-characters');
resetAuthState(userA);

const signedPayloads = [];
const requestCalls = [];
BackendClient.createSessionIntegrityFields = async (payload, options = {}) => {
  signedPayloads.push({ payload, options });
  return {
    salt: 'signed-salt',
    signature: 'signed-signature',
    signatureMode: 'session'
  };
};
BackendClient.requestServer = async (path, options = {}) => {
  requestCalls.push({ path, options });
  if (path === '/api/saves') {
    return {
      saveTime: 456,
      revisionId: 'slot-rev-1',
      revisionNumber: 1,
      contentHash: 'slot-hash-1',
      headUpdatedAt: 789
    };
  }
  if (path === '/api/user/global') {
    return {
      globalUpdatedAt: 654,
      revisionId: 'global-rev-1',
      revisionNumber: 2,
      contentHash: 'global-hash-1',
      headUpdatedAt: 987
    };
  }
  if (path === '/api/saves/slots/2/history?limit=5') {
    return {
      history: [
        {
          slotIndex: 2,
          saveData: { marker: 'old-slot' },
          saveTime: 111,
          revisionId: 'slot-history-rev-1',
          revisionNumber: 1,
          contentHash: 'slot-history-hash-1',
          headUpdatedAt: 112
        }
      ]
    };
  }
  if (path === '/api/saves/slots/2/restore') {
    return {
      slotIndex: 2,
      saveData: { marker: 'restored-slot' },
      saveTime: 222,
      revisionId: 'slot-restored-rev',
      revisionNumber: 3,
      contentHash: 'slot-restored-hash',
      headUpdatedAt: 223
    };
  }
  if (path === '/api/user/global/history?limit=4') {
    return {
      entries: [
        {
          globalData: { marker: 'old-global' },
          globalUpdatedAt: 333,
          revisionId: 'global-history-rev-1',
          revisionNumber: 4,
          contentHash: 'global-history-hash-1',
          headUpdatedAt: 334
        }
      ]
    };
  }
  if (path === '/api/user/global/restore') {
    return {
      data: { marker: 'restored-global' },
      globalUpdatedAt: 444,
      revisionId: 'global-restored-rev',
      revisionNumber: 5,
      contentHash: 'global-restored-hash',
      headUpdatedAt: 445
    };
  }
  throw new Error(`unexpected request path: ${path}`);
};

const slotSave = await BackendClient.saveCloudData(
  { marker: 'slot-save', timestamp: 123 },
  2,
  { baseRevisionId: 'slot-base-rev', mutationId: 'slot-mutation-0001' }
);
assert.equal(slotSave.success, true, 'slot save should succeed');
assert.deepEqual(
  signedPayloads.at(-1).payload,
  {
    protocolVersion: CLOUD_STATE_PROTOCOL_VERSION,
    slotIndex: 2,
    baseRevisionId: 'slot-base-rev',
    mutationId: 'slot-mutation-0001',
    saveData: { marker: 'slot-save', timestamp: 123 },
    saveTime: 123
  },
  'slot save signature should cover the v2 envelope'
);
assert.deepEqual(
  requestCalls.at(-1),
  {
    path: '/api/saves',
    options: {
      method: 'POST',
      authToken: 'session-token-a-32-characters',
      data: {
        protocolVersion: CLOUD_STATE_PROTOCOL_VERSION,
        slotIndex: 2,
        baseRevisionId: 'slot-base-rev',
        mutationId: 'slot-mutation-0001',
        saveData: { marker: 'slot-save', timestamp: 123 },
        saveTime: 123,
        salt: 'signed-salt',
        signature: 'signed-signature',
        signatureMode: 'session'
      }
    }
  },
  'slot save request should send the signed v2 envelope'
);
const requestCountBeforeAccountMismatch = requestCalls.length;
const mismatchedAccountSave = await BackendClient.saveCloudData(
  { marker: 'wrong-account-save', timestamp: 124 },
  2,
  { baseRevisionId: 'slot-base-rev', mutationId: 'slot-mutation-0002', expectedUserId: userB.objectId }
);
assert.equal(mismatchedAccountSave.success, false, 'BackendClient should reject writes bound to a different account');
assert.equal(mismatchedAccountSave.reason, 'cloud_state_account_changed');
assert.equal(requestCalls.length, requestCountBeforeAccountMismatch, 'account mismatch should fail before the network request');
assert.equal(slotSave.revisionId, 'slot-rev-1');
assert.equal(slotSave.revisionNumber, 1);

const globalSave = await BackendClient.saveGlobalData(
  { marker: 'global-save', updatedAt: 321 },
  { baseRevisionId: 'global-base-rev', mutationId: 'global-mutation-0001' }
);
assert.equal(globalSave.success, true, 'global save should succeed');
assert.deepEqual(
  signedPayloads.at(-1).payload,
  {
    protocolVersion: CLOUD_STATE_PROTOCOL_VERSION,
    baseRevisionId: 'global-base-rev',
    mutationId: 'global-mutation-0001',
    globalData: { marker: 'global-save', updatedAt: 321 },
    globalUpdatedAt: 321
  },
  'global save signature should cover the v2 envelope'
);

let signatureAbortRequests = 0;
BackendClient.requestServer = async () => {
  signatureAbortRequests += 1;
  return { ok: true };
};
BackendClient.createSessionIntegrityFields = async () => ({ signatureMode: 'legacy' });
const signatureAbort = await BackendClient.saveCloudData({ marker: 'unsigned', timestamp: 1 }, 0);
assert.equal(signatureAbort.success, false, 'save should fail when session signing is unavailable');
assert.equal(signatureAbort.reason, 'cloud_state_signature_required');
assert.equal(signatureAbortRequests, 0, 'save should stop before requestServer when session signing is unavailable');

BackendClient.createSessionIntegrityFields = async (payload, options = {}) => {
  signedPayloads.push({ payload, options });
  return {
    salt: 'signed-salt',
    signature: 'signed-signature',
    signatureMode: 'session'
  };
};
BackendClient.requestServer = async (path, options = {}) => {
  requestCalls.push({ path, options });
  if (path === '/api/saves') {
    return {
      data: [
        {
          slotIndex: 1,
          saveData: JSON.stringify({ marker: 'read-slot' }),
          saveTime: 222,
          revisionId: 'slot-read-rev',
          revisionNumber: 6,
          contentHash: 'slot-read-hash',
          headUpdatedAt: 223
        }
      ],
      isEmpty: false
    };
  }
  if (path === '/api/user/global') {
    return {
      data: { marker: 'read-global' },
      globalUpdatedAt: 555,
      revisionId: 'global-read-rev',
      revisionNumber: 7,
      contentHash: 'global-read-hash',
      headUpdatedAt: 556
    };
  }
  throw new Error(`unexpected read request path: ${path}`);
};

const cloudRead = await BackendClient.getCloudData();
assert.equal(cloudRead.success, true, 'cloud read should succeed');
assert.equal(cloudRead.slots[1].marker, 'read-slot');
assert.equal(cloudRead.slotEntries[1].revisionId, 'slot-read-rev');
assert.equal(cloudRead.revisions[1].revisionNumber, 6);

const globalRead = await BackendClient.getGlobalData();
assert.equal(globalRead.success, true, 'global read should succeed');
assert.equal(globalRead.data.marker, 'read-global');
assert.equal(globalRead.revision.revisionId, 'global-read-rev');
assert.equal(globalRead.revisionNumber, 7);

BackendClient.requestServer = async (path, options = {}) => {
  requestCalls.push({ path, options });
  if (path === '/api/saves/slots/2/history?limit=5') {
    return {
      history: [
        {
          slotIndex: 2,
          saveData: { marker: 'old-slot' },
          saveTime: 111,
          revisionId: 'slot-history-rev-1',
          revisionNumber: 1,
          contentHash: 'slot-history-hash-1',
          headUpdatedAt: 112
        }
      ]
    };
  }
  if (path === '/api/saves/slots/2/restore') {
    return {
      slotIndex: 2,
      saveData: { marker: 'restored-slot' },
      saveTime: 222,
      revisionId: 'slot-restored-rev',
      revisionNumber: 3,
      contentHash: 'slot-restored-hash',
      headUpdatedAt: 223
    };
  }
  if (path === '/api/user/global/history?limit=4') {
    return {
      entries: [
        {
          globalData: { marker: 'old-global' },
          globalUpdatedAt: 333,
          revisionId: 'global-history-rev-1',
          revisionNumber: 4,
          contentHash: 'global-history-hash-1',
          headUpdatedAt: 334
        }
      ]
    };
  }
  if (path === '/api/user/global/restore') {
    return {
      data: { marker: 'restored-global' },
      globalUpdatedAt: 444,
      revisionId: 'global-restored-rev',
      revisionNumber: 5,
      contentHash: 'global-restored-hash',
      headUpdatedAt: 445
    };
  }
  throw new Error(`unexpected wrapper request path: ${path}`);
};

const slotHistory = await BackendClient.getCloudSaveHistory(2, { limit: 5 });
assert.equal(slotHistory.success, true, 'slot history should succeed');
assert.equal(slotHistory.history[0].revisionId, 'slot-history-rev-1');

const slotRestore = await BackendClient.restoreCloudSaveRevision(2, 'slot-source-rev', {
  baseRevisionId: 'slot-head-rev',
  mutationId: 'slot-restore-mutation'
});
assert.equal(slotRestore.success, true, 'slot restore should succeed');
assert.deepEqual(
  signedPayloads.at(-1).payload,
  {
    protocolVersion: CLOUD_STATE_PROTOCOL_VERSION,
    slotIndex: 2,
    baseRevisionId: 'slot-head-rev',
    sourceRevisionId: 'slot-source-rev',
    mutationId: 'slot-restore-mutation'
  },
  'slot restore signature should cover the v2 restore envelope'
);
assert.equal(slotRestore.revisionId, 'slot-restored-rev');

const globalHistory = await BackendClient.getGlobalDataHistory({ limit: 4 });
assert.equal(globalHistory.success, true, 'global history should succeed');
assert.equal(globalHistory.history[0].revisionId, 'global-history-rev-1');

const globalRestore = await BackendClient.restoreGlobalDataRevision('global-source-rev', {
  baseRevisionId: 'global-head-rev',
  mutationId: 'global-restore-mutation'
});
assert.equal(globalRestore.success, true, 'global restore should succeed');
assert.deepEqual(
  signedPayloads.at(-1).payload,
  {
    protocolVersion: CLOUD_STATE_PROTOCOL_VERSION,
    baseRevisionId: 'global-head-rev',
    sourceRevisionId: 'global-source-rev',
    mutationId: 'global-restore-mutation'
  },
  'global restore signature should cover the v2 restore envelope'
);
assert.equal(globalRestore.revisionId, 'global-restored-rev');

localStorage.setItem(revisionStorageKey(userA), JSON.stringify({
  slots: [
    { revisionId: 'slot-cache-a-0', revisionNumber: 10, contentHash: 'ha0', headUpdatedAt: 1000 },
    null,
    null,
    null
  ],
  global: { revisionId: 'global-cache-a', revisionNumber: 11, contentHash: 'hga', headUpdatedAt: 1001 }
}));
localStorage.setItem(revisionStorageKey(userB), JSON.stringify({
  slots: [
    { revisionId: 'slot-cache-b-0', revisionNumber: 20, contentHash: 'hb0', headUpdatedAt: 2000 },
    null,
    null,
    null
  ],
  global: { revisionId: 'global-cache-b', revisionNumber: 21, contentHash: 'hgb', headUpdatedAt: 2001 }
}));

setSession(userA, 'session-token-a-32-characters');
AuthService.isInitialized = false;
AuthService.init();
assert.equal(AuthService.getSlotRevision(0).revisionId, 'slot-cache-a-0', 'init should load account A revision cache');
assert.equal(AuthService.getGlobalRevision().revisionId, 'global-cache-a', 'init should load account A global revision cache');

BackendClient.login = async () => {
  setSession(userB, 'session-token-b-32-characters');
  return {
    success: true,
    user: userB
  };
};
const loginB = await AuthService.login('user-b', 'pwd');
assert.equal(loginB.success, true, 'login should succeed');
assert.equal(AuthService.getSlotRevision(0).revisionId, 'slot-cache-b-0', 'login should switch to account B cache');
assert.equal(AuthService.getGlobalRevision().revisionId, 'global-cache-b', 'login should switch global cache with account');
AuthService.logout();
assert.equal(AuthService.getSlotRevision(0), null, 'logout should clear in-memory slot revisions');
assert.equal(AuthService.getGlobalRevision(), null, 'logout should clear in-memory global revisions');
assert.notEqual(localStorage.getItem(revisionStorageKey(userA)), null, 'logout should preserve account A persistent cache');
assert.notEqual(localStorage.getItem(revisionStorageKey(userB)), null, 'logout should preserve account B persistent cache');

setSession(userA, 'session-token-a-32-characters');
resetAuthState(userA);

setSession(userB, 'session-token-b-32-characters');
assert.equal(AuthService.getCurrentUser().objectId, userB.objectId, 'external session changes should be observed immediately');
assert.equal(AuthService.getSlotRevision(0).revisionId, 'slot-cache-b-0', 'external session changes should switch to account B revision cache');
setSession(userA, 'session-token-a-32-characters');
assert.equal(AuthService.getCurrentUser().objectId, userA.objectId, 'switching the external session back should restore account A context');
assert.equal(AuthService.getSlotRevision(0).revisionId, 'slot-cache-a-0', 'external session changes must not persist account B revisions into account A cache');

let resolveDelayedCloudRead;
BackendClient.getCloudData = () => new Promise(resolve => {
  resolveDelayedCloudRead = resolve;
});
const delayedCloudRead = AuthService.getCloudData();
setSession(userB, 'session-token-b-32-characters');
assert.equal(AuthService.getCurrentUser().objectId, userB.objectId, 'delayed response test should switch to account B');
resolveDelayedCloudRead({
  success: true,
  slots: [{ marker: 'late-account-a-slot' }, null, null, null],
  slotEntries: [{
    slotIndex: 0,
    saveData: { marker: 'late-account-a-slot' },
    saveTime: 3000,
    revisionId: 'late-account-a-revision',
    revisionNumber: 30,
    contentHash: 'late-account-a-hash',
    headUpdatedAt: 3001
  }, null, null, null]
});
const delayedCloudReadResult = await delayedCloudRead;
assert.equal(delayedCloudReadResult.success, false, 'a response from the previous account should not be applied');
assert.equal(delayedCloudReadResult.reason, 'cloud_state_account_changed');
assert.equal(AuthService.getSlotRevision(0).revisionId, 'slot-cache-b-0', 'late account A response must not contaminate account B in-memory cache');
assert.equal(
  JSON.parse(localStorage.getItem(revisionStorageKey(userB))).slots[0].revisionId,
  'slot-cache-b-0',
  'late account A response must not contaminate account B persisted cache'
);

setSession(userA, 'session-token-a-32-characters');
assert.equal(AuthService.getCurrentUser().objectId, userA.objectId);

const authSaveCalls = [];
BackendClient.saveCloudData = async (gameData, slotIndex, options = {}) => {
  authSaveCalls.push({ gameData, slotIndex, options });
  return {
    success: true,
    saveTime: 777,
    revisionId: 'slot-save-auth-rev',
    revisionNumber: 12,
    contentHash: 'slot-save-auth-hash',
    headUpdatedAt: 778
  };
};
const authSlotSave = await AuthService.saveCloudData({ marker: 'auth-slot', timestamp: 776 }, 0);
assert.equal(authSlotSave.success, true, 'AuthService slot save should succeed');
assert.equal(authSaveCalls.at(-1).options.baseRevisionId, 'slot-cache-a-0', 'AuthService should default slot baseRevisionId from account cache');
assert.equal(authSaveCalls.at(-1).options.expectedUserId, userA.objectId, 'AuthService should bind the write to the initiating account');
assert.equal(AuthService.getSlotRevision(0).revisionId, 'slot-save-auth-rev', 'successful slot save should refresh the slot revision cache');

let resolveDelayedCloudSave;
let delayedCloudSaveOptions = null;
BackendClient.saveCloudData = async (_gameData, _slotIndex, options = {}) => {
  delayedCloudSaveOptions = options;
  return await new Promise(resolve => {
    resolveDelayedCloudSave = resolve;
  });
};
const delayedCloudSave = AuthService.saveCloudData({ marker: 'late-account-a-write', timestamp: 800 }, 0);
await Promise.resolve();
await Promise.resolve();
assert.equal(typeof resolveDelayedCloudSave, 'function', 'delayed write should reach BackendClient');
assert.equal(delayedCloudSaveOptions.expectedUserId, userA.objectId, 'delayed write should stay bound to account A');
setSession(userB, 'session-token-b-32-characters');
assert.equal(AuthService.getCurrentUser().objectId, userB.objectId);
resolveDelayedCloudSave({
  success: true,
  saveTime: 801,
  revisionId: 'late-account-a-write-revision',
  revisionNumber: 31,
  contentHash: 'late-account-a-write-hash',
  headUpdatedAt: 802
});
const delayedCloudSaveResult = await delayedCloudSave;
assert.equal(delayedCloudSaveResult.success, false, 'a completed write from the previous account should not drive current UI state');
assert.equal(delayedCloudSaveResult.reason, 'cloud_state_account_changed');
assert.equal(AuthService.getSlotRevision(0).revisionId, 'slot-cache-b-0', 'late account A write must not update account B cache');
setSession(userA, 'session-token-a-32-characters');
assert.equal(AuthService.getCurrentUser().objectId, userA.objectId);

BackendClient.getCloudData = async () => ({
  success: true,
  slots: [null, { marker: 'cloud-slot-1' }, null, null],
  slotEntries: [
    null,
    {
      slotIndex: 1,
      saveData: { marker: 'cloud-slot-1' },
      saveTime: 880,
      revisionId: 'slot-read-auth-rev',
      revisionNumber: 13,
      contentHash: 'slot-read-auth-hash',
      headUpdatedAt: 881
    },
    null,
    null
  ],
  revisions: {
    1: {
      revisionId: 'slot-read-auth-rev',
      revisionNumber: 13,
      contentHash: 'slot-read-auth-hash',
      headUpdatedAt: 881
    }
  },
  serverTime: 880,
  isEmpty: false
});
const authCloudRead = await AuthService.getCloudData();
assert.equal(authCloudRead.success, true);
assert.equal(AuthService.getSlotRevision(1).revisionId, 'slot-read-auth-rev', 'cloud read should hydrate slot revisions');

BackendClient.getCloudSaveHistory = async () => ({
  success: true,
  headRevisionId: 'slot-history-head-auth-rev',
  history: [{
    isHead: true,
    revisionId: 'slot-history-head-auth-rev',
    revisionNumber: 14,
    contentHash: 'slot-history-head-auth-hash',
    headUpdatedAt: 900
  }]
});
const authSlotHistory = await AuthService.getCloudSaveHistory(1, { limit: 20 });
assert.equal(authSlotHistory.success, true, 'AuthService slot history should succeed without a prior slot-list read');
assert.equal(AuthService.getSlotRevision(1).revisionId, 'slot-history-head-auth-rev', 'slot history should hydrate the current head revision for restore');

BackendClient.saveGlobalData = async (data, options = {}) => ({
  success: false,
  conflict: true,
  reason: 'global_conflict',
  current: {
    data: { marker: 'global-current' },
    globalUpdatedAt: 990,
    revisionId: 'global-conflict-rev',
    revisionNumber: 14,
    contentHash: 'global-conflict-hash',
    headUpdatedAt: 991
  },
  options
});
const authGlobalConflict = await AuthService.saveGlobalData({ marker: 'global-write', updatedAt: 989 });
assert.equal(authGlobalConflict.conflict, true, 'AuthService global save should surface conflicts');
assert.equal(AuthService.getGlobalRevision().revisionId, 'global-conflict-rev', '409/current should update the global revision cache');

BackendClient.restoreCloudSaveRevision = async (slotIndex, sourceRevisionId, options = {}) => ({
  success: true,
  slotIndex,
  sourceRevisionId,
  options,
  saveTime: 1001,
  revisionId: 'slot-restore-auth-rev',
  revisionNumber: 15,
  contentHash: 'slot-restore-auth-hash',
  headUpdatedAt: 1002
});
const authSlotRestore = await AuthService.restoreCloudSaveRevision(1, 'slot-source-auth-rev');
assert.equal(authSlotRestore.success, true, 'AuthService slot restore should succeed');
assert.equal(authSlotRestore.options.baseRevisionId, 'slot-history-head-auth-rev', 'AuthService restore should default baseRevisionId from the history head cache');
assert.equal(AuthService.getSlotRevision(1).revisionId, 'slot-restore-auth-rev', 'slot restore should refresh the slot revision cache');

BackendClient.getGlobalData = async () => ({
  success: true,
  data: { marker: 'global-read-auth' },
  revisionId: 'global-read-auth-rev',
  revisionNumber: 16,
  contentHash: 'global-read-auth-hash',
  headUpdatedAt: 1003
});
const authGlobalRead = await AuthService.getGlobalData();
assert.equal(authGlobalRead.success, true, 'AuthService global read should succeed');
assert.equal(AuthService.getGlobalRevision().revisionId, 'global-read-auth-rev', 'global read should hydrate the global revision cache');

BackendClient.getGlobalDataHistory = async () => ({
  success: true,
  headRevisionId: 'global-history-head-auth-rev',
  history: [{
    isHead: true,
    revisionId: 'global-history-head-auth-rev',
    revisionNumber: 17,
    contentHash: 'global-history-head-auth-hash',
    headUpdatedAt: 1004
  }]
});
const authGlobalHistory = await AuthService.getGlobalDataHistory({ limit: 20 });
assert.equal(authGlobalHistory.success, true, 'AuthService global history should succeed');
assert.equal(AuthService.getGlobalRevision().revisionId, 'global-history-head-auth-rev', 'global history should hydrate the current head revision for restore');

BackendClient.requestServer = originals.requestServer;
BackendClient.saveCloudData = originals.saveCloudData;
BackendClient.createSessionIntegrityFields = async (payload, options = {}) => {
  signedPayloads.push({ payload, options });
  return {
    salt: 'retry-salt',
    signature: 'retry-signature',
    signatureMode: 'session'
  };
};
setSession(userA, 'session-token-a-32-characters');

const fetchBodies = [];
globalThis.fetch = async (_url, init = {}) => {
  fetchBodies.push(JSON.parse(init.body));
  if (fetchBodies.length === 1) {
    throw BackendClient.createError('network-failure');
  }
  return {
    ok: true,
    json: async () => ({
      saveTime: 1234,
      revisionId: 'slot-retry-rev',
      revisionNumber: 17,
      contentHash: 'slot-retry-hash',
      headUpdatedAt: 1235
    })
  };
};
const retrySave = await BackendClient.saveCloudData(
  { marker: 'retry-save', timestamp: 1234 },
  1,
  { baseRevisionId: 'slot-retry-base' }
);
assert.equal(retrySave.success, true, 'retrying slot save should succeed');
assert.equal(fetchBodies.length, 2, 'requestServer should retry the failed network request');
assert.equal(fetchBodies[0].mutationId, fetchBodies[1].mutationId, 'one logical request should reuse the same mutationId across retries');
assert.equal(fetchBodies[0].protocolVersion, CLOUD_STATE_PROTOCOL_VERSION, 'retry request should send the v2 protocol version');
assert.equal(fetchBodies[0].baseRevisionId, 'slot-retry-base', 'retry request should preserve the slot baseRevisionId');
assert.equal(fetchBodies[0].signature, 'retry-signature', 'retry request should preserve the signed envelope');

globalThis.fetch = originals.fetch;
BackendClient.requestServer = originals.requestServer;
BackendClient.createSessionIntegrityFields = originals.createSessionIntegrityFields;
BackendClient.login = originals.login;
BackendClient.logout = originals.logout;
BackendClient.saveCloudData = originals.saveCloudData;
BackendClient.getCloudData = originals.getCloudData;
BackendClient.saveGlobalData = originals.saveGlobalData;
BackendClient.getGlobalData = originals.getGlobalData;
BackendClient.getCloudSaveHistory = originals.getCloudSaveHistory;
BackendClient.restoreCloudSaveRevision = originals.restoreCloudSaveRevision;
BackendClient.getGlobalDataHistory = originals.getGlobalDataHistory;
BackendClient.restoreGlobalDataRevision = originals.restoreGlobalDataRevision;
ProgressionService.flush = originals.progressionFlush;
ProgressionService.resetActiveFlushState = originals.progressionReset;
localStorage.removeItem(SESSION_STORAGE_KEY);

console.log('Frontend cloud-state v2 sanity checks passed.');
