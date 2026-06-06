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
const { AuthService } = await import('../js/services/authService.js');
const { SaveManager } = await import('../js/managers/SaveManager.js');
const { Utils } = await import('../js/core/utils.js');

BackendClient.init = () => ({ success: true });
BackendClient.cloudEnabled = true;
BackendClient.getCurrentUser = () => ({ objectId: 'sync-user', sessionToken: 'sync-token' });
AuthService.isInitialized = true;
AuthService.currentUser = BackendClient.getCurrentUser();
AuthService.latestSaveTimeBySlot = {};
AuthService.saveQueueBySlot = {};

let backendSaveCalls = 0;
BackendClient.saveCloudData = async (gameData, slotIndex) => {
  backendSaveCalls += 1;
  if (backendSaveCalls === 1) {
    return { success: true, skipped: false, saveTime: 1000 };
  }
  return { success: true, skipped: false, saveTime: gameData.timestamp };
};

const futureSave = await AuthService.saveCloudData({ marker: 'future', timestamp: 999999999 }, 0);
assert.equal(futureSave.success, true, 'future save should succeed after server normalization');
assert.equal(futureSave.saveTime, 1000, 'AuthService should receive canonical server save time');
assert.equal(AuthService.latestSaveTimeBySlot[0], 1000, 'AuthService stale gate should store canonical server time');

const normalAfterFuture = await AuthService.saveCloudData({ marker: 'normal', timestamp: 1100 }, 0);
assert.equal(normalAfterFuture.success, true, 'normal save after canonicalized future timestamp should not be locally skipped');
assert.equal(normalAfterFuture.skipped, false, 'normal save after canonicalized future timestamp should reach the server');
assert.equal(backendSaveCalls, 2, 'AuthService should call BackendClient for the normal save');

const staleLocal = await AuthService.saveCloudData({ marker: 'old', timestamp: 1099 }, 0);
assert.equal(staleLocal.success, true, 'locally stale save should resolve as a skipped success');
assert.equal(staleLocal.skipped, true, 'locally stale save should be marked skipped');
assert.equal(backendSaveCalls, 2, 'locally stale save should not call BackendClient');

AuthService.latestSaveTimeBySlot = { 0: 1100 };
AuthService.saveQueueBySlot = { 0: Promise.resolve() };
AuthService.logout();
assert.deepEqual(AuthService.latestSaveTimeBySlot, {}, 'AuthService logout should clear per-slot stale save times');
assert.deepEqual(AuthService.saveQueueBySlot, {}, 'AuthService logout should clear pending save queues');

const battleLog = [];
Utils.showBattleLog = (message) => {
  battleLog.push(message);
};

AuthService.isLoggedIn = () => true;
AuthService.saveCloudData = async () => ({
  success: true,
  skipped: true,
  saveTime: Date.now() - 1000,
  message: 'stale-save-ignored'
});

const fakeGame = {
  automationBootConfig: null,
  player: {
    getState: () => ({ hp: 88, maxHp: 120 })
  },
  map: {
    nodes: [],
    currentNodeIndex: 0,
    completedNodes: []
  },
  unlockedRealms: [1],
  currentScreen: 'map-screen',
  currentSaveSlot: 1,
  performanceStats: { battleUIUpdates: 0 },
  legacyProgress: {},
  featureFlags: {},
  ensureEndlessState: () => ({}),
  ensureEncounterState: () => ({}),
  getSanctumAgendaSaveState: () => ({}),
  createDefaultSanctumAgendaState: () => ({}),
  getHeavenlyMandateSaveState: () => ({}),
  createDefaultHeavenlyMandateState: () => ({}),
  getSeasonVerificationSaveState: () => ({}),
  createDefaultSeasonVerificationState: () => ({}),
  getFateAftereffectSaveState: () => ({}),
  createDefaultFateAftereffectState: () => ({}),
  getChapterEventLedgerSaveState: () => ({}),
  cachedSlots: {}
};

const saveManager = new SaveManager(fakeGame);
const saveResult = saveManager.saveGame();
assert.equal(saveResult.success, true, 'SaveManager local save should succeed');
assert.equal(saveResult.cloudPending, true, 'SaveManager should return pending cloud result');
const cloudResult = await saveResult.cloudPromise;
assert.equal(cloudResult.cloud, false, 'SaveManager should not treat skipped cloud writes as synced');
assert.equal(cloudResult.cloudSkipped, true, 'SaveManager should expose skipped cloud writes');
assert.equal(fakeGame.cachedSlots[1], undefined, 'SaveManager should not cache skipped local state as cloud state');
assert(battleLog.includes('云端已有更新，本次仅保存本地'), 'SaveManager should show a skipped cloud message');

console.log('Frontend cloud sync sanity checks passed.');
