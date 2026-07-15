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

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.innerHTML = '';
    this.textContent = '';
    this.dataset = {};
    this.disabled = false;
    this.classList = {
      toggle() {},
      add() {},
      remove() {},
    };
  }
  addEventListener() {}
  removeEventListener() {}
  contains() {
    return true;
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

function createDomHarness() {
  const elements = new Map();
  const getElement = id => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  };
  const tabButtons = ['daily', 'weekly', 'global', 'rift'].map(tab => ({
    dataset: { challengeTab: tab },
    classList: {
      toggle() {},
      add() {},
      remove() {},
    },
  }));
  return {
    elements,
    document: {
      addEventListener() {},
      removeEventListener() {},
      getElementById(id) {
        return getElement(id);
      },
      querySelectorAll(selector) {
        if (selector === '#challenge-screen [data-challenge-tab]') {
          return tabButtons;
        }
        return [];
      },
    },
    getElement,
  };
}

function createServiceStub() {
  let state = {
    mode: '',
    runId: '',
    projection: null,
    lastReceipt: null,
    pending: null,
    pendingReplay: false,
    lastError: null,
    expectedUserId: '',
    updatedAt: Date.now(),
  };
  return {
    getState() {
      return JSON.parse(JSON.stringify(state));
    },
    subscribe(listener) {
      return () => listener;
    },
    __setState(nextState) {
      state = {
        ...state,
        ...nextState,
        updatedAt: Date.now(),
      };
    },
  };
}

function normalizeDirectiveScopes(source) {
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source)) return source;
  if (Array.isArray(source.views)) return source.views;
  const scopes = [];
  for (const [key, value] of Object.entries(source)) {
    if (!['personal', 'squad', 'global'].includes(key)) continue;
    if (Array.isArray(value)) {
      scopes.push({ scope: key, directives: value });
    } else if (value && typeof value === 'object') {
      scopes.push({ scope: key, ...value });
    }
  }
  return scopes;
}

async function runCheck(name, fn, failures) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`not ok - ${name}`);
    console.error(error && error.stack ? error.stack : error);
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 0);
globalThis.cancelAnimationFrame = handle => clearTimeout(handle);
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { platform: 'MacIntel' },
});

const dom = createDomHarness();
globalThis.document = dom.document;

const { BackendClient } = await import('../js/services/backend-client.js');
const {
  WorldRiftService,
  createWorldRiftService,
} = await import('../js/services/world-rift-service.js');
const { AuthoritativeRunPanel } = await import('../js/views/AuthoritativeRunPanel.js');
const { attachChallengeHubController } = await import('../js/core/challenge_hub.js');

const failures = [];

await runCheck('BackendClient signs world-rift mutations with session-v2 dynamic routes', async () => {
  const originals = {
    requestServer: BackendClient.requestServer,
    createSessionIntegrityFields: BackendClient.createSessionIntegrityFields,
    getCurrentUser: BackendClient.getCurrentUser,
    ensureReady: BackendClient.ensureReady,
    init: BackendClient.init,
    getServerConfig: BackendClient.getServerConfig,
  };
  try {
    BackendClient.cloudEnabled = true;
    BackendClient.ensureReady = () => true;
    BackendClient.init = () => ({ success: true });
    BackendClient.getServerConfig = () => ({
      baseUrl: 'http://127.0.0.1:9000',
      worldRiftPathPrefix: '/api/world-rift',
    });
    const currentUser = { objectId: 'rift-user-a', username: '甲' };
    BackendClient.getCurrentUser = () => currentUser;
    BackendClient.persistServerSession({
      token: 'world-rift-session-token-a-32-characters',
      user: currentUser,
    });

    const requestCalls = [];
    const signingCalls = [];
    BackendClient.requestServer = async (path, options = {}) => {
      requestCalls.push({ path, options });
      if (path.endsWith('/attempts')) {
        return {
          success: true,
          attempt: { attemptId: 'rift-attempt-1', runId: 'rift-run-1', status: 'active' },
          run: { runId: 'rift-run-1' },
        };
      }
      if (path.endsWith('/contributions')) {
        return {
          success: true,
          current: { rotationId: 'rift-2026-w28' },
          contribution: { contributionId: 'rift-contribution-1' },
        };
      }
      return {
        success: true,
        current: { rotationId: 'rift-2026-w28' },
        claim: { directiveClaimId: 'rift-directive-claim-1' },
      };
    };
    BackendClient.createSessionIntegrityFields = async (payload, options = {}) => {
      signingCalls.push({ payload, options });
      return {
        salt: 'world-rift-client-salt',
        signature: 'a'.repeat(64),
        signatureMode: options.route ? 'session-v2' : 'session',
      };
    };

    const started = await BackendClient.startWorldRiftAttempt({
      rotationId: 'rift-2026-w28',
      clientAttemptId: 'rift-client-attempt-0001',
      mutationId: 'rift-start-0001',
    }, { expectedUserId: 'rift-user-a' });
    assert.equal(started.success, true);
    assert.equal(requestCalls.at(-1).path, '/api/world-rift/attempts');
    assert.equal(signingCalls.at(-1).options.route, 'POST /api/world-rift/attempts');
    assert.equal(requestCalls.at(-1).options.data.signatureMode, 'session-v2');

    const submitted = await BackendClient.submitWorldRiftContribution({
      runId: 'rift-run-1',
      mutationId: 'rift-submit-0001',
    }, { expectedUserId: 'rift-user-a' });
    assert.equal(submitted.success, true);
    assert.equal(requestCalls.at(-1).path, '/api/world-rift/contributions');
    assert.equal(signingCalls.at(-1).options.route, 'POST /api/world-rift/contributions');
    assert.equal(requestCalls.at(-1).options.data.signatureMode, 'session-v2');

    const claimed = await BackendClient.claimWorldRiftReward('personal-steady-1', {
      rotationId: 'rift-2026-w28',
      milestoneId: 'personal-steady-1',
      mutationId: 'rift-claim-0001',
    }, { expectedUserId: 'rift-user-a' });
    assert.equal(claimed.success, true);
    assert.equal(requestCalls.at(-1).path, '/api/world-rift/rewards/personal-steady-1/claim');
    assert.equal(signingCalls.at(-1).options.route, 'POST /api/world-rift/rewards/personal-steady-1/claim');
    assert.equal(requestCalls.at(-1).options.data.signatureMode, 'session-v2');
  } finally {
    BackendClient.requestServer = originals.requestServer;
    BackendClient.createSessionIntegrityFields = originals.createSessionIntegrityFields;
    BackendClient.getCurrentUser = originals.getCurrentUser;
    BackendClient.ensureReady = originals.ensureReady;
    BackendClient.init = originals.init;
    BackendClient.getServerConfig = originals.getServerConfig;
  }
}, failures);

await runCheck('WorldRiftService exposes directive-claim flow with mutation reuse and account-churn suppression', async () => {
  let currentUserId = 'rift-service-a';
  const claimCalls = [];
  let claimFailCount = 0;
  const claimDeferredQueue = [];
  const service = createWorldRiftService({
    client: {
      getCurrentUser() {
        return currentUserId ? { objectId: currentUserId, username: currentUserId } : null;
      },
      createAuthoritativeRunRequestId(prefix = 'rift') {
        return `${prefix}-generated-${String(claimCalls.length + 1).padStart(4, '0')}`;
      },
      async claimWorldRiftDirective(directiveId, payload, options = {}) {
        claimCalls.push({ directiveId, payload, options });
        const deferred = claimDeferredQueue.shift();
        if (deferred) return await deferred.promise;
        claimFailCount += 1;
        if (claimFailCount === 1) {
          return { success: false, reason: 'wallet_busy', message: 'wallet busy' };
        }
        return {
          success: true,
          current: {
            rotationId: 'rift-2026-w28',
            directives: [
              { directiveId: payload.directiveId, scope: 'personal', claimable: false, claimed: true },
              { directiveId: 'squad-a', scope: 'squad', unavailable: true },
              { directiveId: 'global-a', scope: 'global', claimable: false },
            ],
          },
          claim: {
            directiveId: payload.directiveId,
            mutationId: payload.mutationId,
            alreadyClaimed: false,
          },
        };
      },
    },
    now: (() => {
      let tick = 0;
      return () => {
        tick += 1;
        return tick;
      };
    })(),
  });

  assert.equal(typeof service.claimDirective, 'function', 'WorldRiftService should expose claimDirective');

  const failedClaim = await service.claimDirective({
    rotationId: 'rift-2026-w28',
    directiveId: 'personal-steady-1',
    scope: 'personal',
    expectedUserId: 'rift-service-a',
  });
  assert.equal(failedClaim.success, false);
  assert.equal(service.getState().lastError?.reason, 'wallet_busy');
  assert.equal(claimCalls[0].directiveId, 'personal-steady-1', 'directive claim should forward the path directive id');
  assert.equal(claimCalls[0].payload.directiveId, 'personal-steady-1', 'directive claim should bind the body to the same directive id');
  const stableMutationId = claimCalls[0].payload.mutationId;
  assert.match(stableMutationId, /^rift-claim-generated-\d{4}$/);

  const recoveredClaim = await service.claimDirective({
    rotationId: 'rift-2026-w28',
    directiveId: 'personal-steady-1',
    scope: 'personal',
    expectedUserId: 'rift-service-a',
  });
  assert.equal(recoveredClaim.success, true);
  assert.equal(claimCalls[1].payload.mutationId, stableMutationId, 'directive claim retries should preserve the same mutation id');

  const staleDeferred = createDeferred();
  claimDeferredQueue.push(staleDeferred);
  const stalePromise = service.claimDirective({
    rotationId: 'rift-2026-w28',
    directiveId: 'personal-steady-2',
    scope: 'personal',
    expectedUserId: 'rift-service-a',
  });
  currentUserId = 'rift-service-b';
  staleDeferred.resolve({
    success: true,
    current: {
      rotationId: 'rift-2026-w29',
      directiveViews: {
        personal: [{ directiveId: 'personal-steady-2', claimed: true }],
      },
    },
    claim: {
      directiveId: 'personal-steady-2',
      mutationId: claimCalls.at(-1).payload.mutationId,
    },
  });
  const staleResult = await stalePromise;
  assert.equal(staleResult.success, false, 'account churn should suppress stale directive-claim responses');
  assert.equal(staleResult.reason, 'world_rift_account_changed');
}, failures);

await runCheck('WorldRiftService keeps directive deltas scoped to the latest successful submit', async () => {
  const directiveDeltas = [
    { directiveId: 'personal-steady-1', scope: 'personal', title: '稳进', delta: 1 },
  ];
  const current = {
    rotationId: 'rift-2026-w28',
    directives: [
      { directiveId: 'personal-steady-1', scope: 'personal', claimable: true },
    ],
  };
  const service = createWorldRiftService({
    client: {
      getCurrentUser() {
        return { objectId: 'rift-service-a', username: 'rift-service-a' };
      },
      createAuthoritativeRunRequestId(prefix = 'rift') {
        return `${prefix}-generated-0001`;
      },
      async submitWorldRiftContribution() {
        return { success: true, current, directiveDeltas };
      },
      async getWorldRiftCurrent() {
        return { success: true, current };
      },
      async claimWorldRiftDirective(directiveId, payload) {
        return {
          success: true,
          current,
          claim: { directiveId, mutationId: payload.mutationId, alreadyClaimed: false },
        };
      },
    },
  });

  await service.submit({ runId: 'rift-run-1', expectedUserId: 'rift-service-a' });
  assert.deepEqual(service.getState().directiveDeltas, directiveDeltas, 'submit should publish only its own directive deltas');

  await service.current({ expectedUserId: 'rift-service-a', preserveDirectiveDeltas: true });
  assert.deepEqual(service.getState().directiveDeltas, directiveDeltas, 'the immediate settlement refresh should preserve fresh submit deltas');

  await service.current({ expectedUserId: 'rift-service-a' });
  assert.deepEqual(service.getState().directiveDeltas, [], 'a successful current refresh should clear stale submit deltas');

  await service.submit({ runId: 'rift-run-2', forceNew: true, expectedUserId: 'rift-service-a' });
  assert.equal(service.getState().directiveDeltas.length, 1, 'a later submit should publish fresh deltas again');
  await service.claimDirective({
    rotationId: 'rift-2026-w28',
    directiveId: 'personal-steady-1',
    scope: 'personal',
    forceNew: true,
    expectedUserId: 'rift-service-a',
  });
  assert.deepEqual(service.getState().directiveDeltas, [], 'a successful directive claim should clear stale submit deltas');
}, failures);

await runCheck('Challenge hub renders old world-rift payloads and surfaces three directive scopes in the new payload', async () => {
  const originalWorldRiftMethods = {
    getState: WorldRiftService.getState,
    current: WorldRiftService.current,
    claim: WorldRiftService.claim,
    reset: WorldRiftService.reset,
  };
  try {
    const oldPayloadState = {
      current: {
        rotation: {
          rotationId: 'rift-2026-w28',
          title: '天穹裂隙',
          attemptLimit: 5,
          totalHp: 10000,
        },
        world: {
          stateVersion: 3,
          currentPhaseIndex: 2,
          title: '噬界核心',
          appliedDamage: 3200,
          remainingHp: 6800,
          totalHp: 10000,
        },
        allowance: {
          attemptLimit: 5,
          usedAttempts: 1,
          remainingAttempts: 4,
        },
        personal: {
          totalContribution: 1800,
          rankedContribution: 1500,
          completedAttempts: 1,
        },
        leaderboard: {
          entries: [{ userId: 'other', rankedContribution: 2100, rank: 1 }],
          myRank: { rank: 2, rankedContribution: 1500 },
        },
        milestones: [],
      },
      pending: null,
      lastError: null,
    };

    WorldRiftService.getState = () => JSON.parse(JSON.stringify(oldPayloadState));
    const oldGame = {
      map: { registerHook() {} },
      currentScreen: 'challenge-screen',
      challengeHubState: { tab: 'rift' },
      getCurrentProgressionUserId() {
        return 'rift-user-a';
      },
    };
    const oldController = attachChallengeHubController(oldGame);
    assert.doesNotThrow(() => oldController.initWorldRiftHub(), 'old world-rift payloads without directives should still render');
    assert.match(dom.getElement('challenge-hub-summary').innerHTML, /剩余正式次数/);

    const directivePayloadState = {
      current: {
        ...oldPayloadState.current,
        directives: [
          { directiveId: 'personal-steady-1', scope: 'personal', title: '稳进', progress: 2, target: 3, claimable: true, reward: { amount: 15 } },
          { directiveId: 'squad-contested-1', scope: 'squad', title: '争衡', progress: 0, target: 2, unavailable: true, reward: { amount: 20 } },
          { directiveId: 'global-perilous-1', scope: 'global', title: '险锋', progress: 1, target: 2, claimable: false, reward: { amount: 30 } },
        ],
      },
      pending: null,
      lastError: null,
    };
    WorldRiftService.getState = () => JSON.parse(JSON.stringify(directivePayloadState));
    const game = {
      map: { registerHook() {} },
      currentScreen: 'challenge-screen',
      challengeHubState: { tab: 'rift' },
      getCurrentProgressionUserId() {
        return 'rift-user-a';
      },
    };
    const controller = attachChallengeHubController(game);
    const view = controller.getWorldRiftViewModel();
    const directives = Array.isArray(view.directives || view.current?.directives) ? (view.directives || view.current?.directives) : [];
    assert.equal(directives.length, 3, 'challenge hub view model should expose three directive entries');
    assert.deepEqual(
      directives.map(item => item.scope),
      ['personal', 'squad', 'global'],
      'challenge hub directives should carry personal/squad/global scopes',
    );
    controller.initWorldRiftHub();
    const rewardsHtml = dom.getElement('challenge-hub-rewards').innerHTML;
    assert.match(rewardsHtml, /个人指令/);
    assert.match(rewardsHtml, /小队指令/);
    assert.match(rewardsHtml, /全服指令/);
    assert.match(rewardsHtml, /claim-world-rift-directive/, 'directive scopes should surface a directive claim action in the hub');
  } finally {
    WorldRiftService.getState = originalWorldRiftMethods.getState;
    WorldRiftService.current = originalWorldRiftMethods.current;
    WorldRiftService.claim = originalWorldRiftMethods.claim;
    WorldRiftService.reset = originalWorldRiftMethods.reset;
  }
}, failures);

await runCheck('AuthoritativeRunPanel shows directive deltas and still tolerates old world-rift payloads', async () => {
  const panel = new AuthoritativeRunPanel({
    service: createServiceStub(),
    worldRiftService: {
      getState() {
        return {};
      },
      subscribe() {
        return () => {};
      },
    },
    getCurrentUserId: () => 'rift-user-a',
  });
  panel.activeMode = 'world_rift';

  panel.worldRiftState = {
    current: {
      rotation: {
        title: '天穹裂隙',
        attemptLimit: 5,
        totalHp: 10000,
      },
      world: {
        currentPhaseIndex: 2,
        appliedDamage: 2500,
        remainingHp: 7500,
        totalHp: 10000,
      },
      allowance: {
        attemptLimit: 5,
        remainingAttempts: 4,
      },
      personal: {
        rankedContribution: 1300,
      },
      leaderboard: {
        myRank: { rank: 3 },
      },
      directives: [
        { directiveId: 'personal-steady-1', scope: 'personal', title: '稳进', progress: 2, target: 3, claimable: true },
        { directiveId: 'squad-contested-1', scope: 'squad', title: '争衡', progress: 0, target: 2, unavailable: true },
        { directiveId: 'global-perilous-1', scope: 'global', title: '险锋', progress: 1, target: 2, claimable: false },
      ],
    },
    directiveDeltas: [
      { scope: 'personal', directiveId: 'personal-steady-1', title: '稳进', delta: 1 },
    ],
  };
  const contextHtml = panel.renderWorldRiftContext();
  assert.match(contextHtml, /正式次数 4\/5/);
  assert.match(contextHtml, /战役指令：/);
  assert.match(contextHtml, /稳进/);
  assert.match(contextHtml, /data-world-rift-directive-deltas/);
}, failures);

if (failures.length > 0) {
  const summary = failures.map((failure, index) => {
    const message = failure.error && failure.error.message ? failure.error.message : String(failure.error);
    return `${index + 1}. ${failure.name}: ${message}`;
  }).join('\n');
  throw new Error(`World-rift directive client/UI checks failed:\n${summary}`);
}

console.log('World rift directive client/UI checks passed.');
