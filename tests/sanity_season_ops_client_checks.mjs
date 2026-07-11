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
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({
    style: {},
    classList: { add() {}, remove() {} },
    appendChild() {},
    remove() {},
    setAttribute() {},
    getContext: () => null,
  }),
  body: { appendChild() {} },
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const { BackendClient } = await import('../js/services/backend-client.js');

const original = {
  requestServer: BackendClient.requestServer,
  createSessionIntegrityFields: BackendClient.createSessionIntegrityFields,
  getCurrentUser: BackendClient.getCurrentUser,
  getServerConfig: BackendClient.getServerConfig,
  ensureReady: BackendClient.ensureReady,
  init: BackendClient.init,
  fetch: globalThis.fetch,
};

let currentUser = { objectId: 'season-client-user-a', username: '甲' };
const requestCalls = [];
const signedPayloads = [];
const signingOptions = [];
let churnOnRequest = false;

function persistSessionFor(user, token) {
  currentUser = user;
  BackendClient.persistServerSession({ token, user });
}

function restoreUserA() {
  persistSessionFor(
    { objectId: 'season-client-user-a', username: '甲' },
    'season-client-token-a-32-characters',
  );
}

BackendClient.cloudEnabled = true;
BackendClient.ensureReady = () => true;
BackendClient.init = () => ({ success: true });
BackendClient.getCurrentUser = () => currentUser;
BackendClient.getServerConfig = () => ({
  baseUrl: 'http://127.0.0.1:9000',
  authPathPrefix: '/api/auth',
  savePathPrefix: '/api/saves',
  userPathPrefix: '/api/user',
  ghostPathPrefix: '/api/ghosts',
  pvpPathPrefix: '/api/pvp',
  progressionPathPrefix: '/api/progression',
  seasonOpsPathPrefix: '/api/season-ops',
});
BackendClient.createSessionIntegrityFields = async (payload, options = {}) => {
  signedPayloads.push(payload);
  signingOptions.push(options);
  return {
    salt: 'season-client-signed-salt',
    signature: 'a'.repeat(64),
    signatureMode: 'session',
  };
};
BackendClient.requestServer = async (pathname, options = {}) => {
  requestCalls.push({ pathname, options });
  if (churnOnRequest) {
    persistSessionFor(
      { objectId: 'season-client-user-b', username: '乙' },
      'season-client-token-b-32-characters',
    );
  }
  return {
    success: true,
    reportVersion: 'season-ops-test-response-v1',
    pathname,
    entries: [],
    nextCursor: null,
    echoed: options.data || null,
  };
};

try {
  restoreUserA();
  assert.equal(BackendClient.getSeasonOpsPathPrefix(), '/api/season-ops');
  assert.equal(typeof BackendClient.getSeasonOpsDashboard, 'function');
  assert.equal(typeof BackendClient.getSeasonOpsLeaderboard, 'function');
  assert.equal(typeof BackendClient.getSeasonOpsLedger, 'function');
  assert.equal(typeof BackendClient.purchaseSeasonOpsOffer, 'function');

  const dashboard = await BackendClient.getSeasonOpsDashboard({ expectedUserId: 'season-client-user-a' });
  assert.equal(dashboard.success, true);
  assert.equal(requestCalls.at(-1).pathname, '/api/season-ops/current');
  assert.equal(requestCalls.at(-1).options.method, 'GET');
  assert.equal(requestCalls.at(-1).options.authToken, 'season-client-token-a-32-characters');

  const leaderboard = await BackendClient.getSeasonOpsLeaderboard({
    expectedUserId: 'season-client-user-a',
    limit: 500,
  });
  assert.equal(leaderboard.success, true);
  assert.equal(requestCalls.at(-1).pathname, '/api/season-ops/leaderboard?limit=50');
  assert.equal(requestCalls.at(-1).options.authToken, 'season-client-token-a-32-characters');

  const ledger = await BackendClient.getSeasonOpsLedger({
    expectedUserId: 'season-client-user-a',
    limit: 20,
    cursor: '345:season-ledger-cursor-0001',
  });
  assert.equal(ledger.success, true);
  assert.equal(requestCalls.at(-1).pathname, '/api/season-ops/ledger?limit=20&cursor=345%3Aseason-ledger-cursor-0001');
  assert.equal(requestCalls.at(-1).options.authToken, 'season-client-token-a-32-characters');

  const purchase = await BackendClient.purchaseSeasonOpsOffer(
    'offer-genesis-badge',
    's1-genesis',
    {
      expectedUserId: 'season-client-user-a',
      mutationId: 'season-client-mutation-0001',
    },
  );
  assert.equal(purchase.success, true);
  assert.equal(purchase.mutationId, 'season-client-mutation-0001');
  assert.equal(requestCalls.at(-1).pathname, '/api/season-ops/store/purchases');
  assert.equal(requestCalls.at(-1).options.method, 'POST');
  assert.equal(requestCalls.at(-1).options.authToken, 'season-client-token-a-32-characters');
  assert.deepEqual(signedPayloads.at(-1), {
    protocolVersion: 'season-ops-v1',
    seasonId: 's1-genesis',
    offerId: 'offer-genesis-badge',
    mutationId: 'season-client-mutation-0001',
  });
  assert.equal(signingOptions.at(-1).sessionToken, 'season-client-token-a-32-characters');
  assert.deepEqual(requestCalls.at(-1).options.data, {
    protocolVersion: 'season-ops-v1',
    seasonId: 's1-genesis',
    offerId: 'offer-genesis-badge',
    mutationId: 'season-client-mutation-0001',
    salt: 'season-client-signed-salt',
    signature: 'a'.repeat(64),
    signatureMode: 'session',
  });

  const requestsBeforeMismatch = requestCalls.length;
  const mismatched = await BackendClient.getSeasonOpsDashboard({ expectedUserId: 'season-client-user-b' });
  assert.equal(mismatched.success, false);
  assert.equal(mismatched.reason, 'progression_account_changed');
  assert.equal(requestCalls.length, requestsBeforeMismatch, 'account mismatch should stop before the network request');

  for (const [name, invoke] of [
    ['dashboard', () => BackendClient.getSeasonOpsDashboard({ expectedUserId: 'season-client-user-a' })],
    ['leaderboard', () => BackendClient.getSeasonOpsLeaderboard({ expectedUserId: 'season-client-user-a' })],
    ['ledger', () => BackendClient.getSeasonOpsLedger({ expectedUserId: 'season-client-user-a' })],
  ]) {
    restoreUserA();
    churnOnRequest = true;
    const result = await invoke();
    churnOnRequest = false;
    assert.equal(result.success, false, `${name} should reject a response after account churn`);
    assert.equal(result.reason, 'season_ops_account_changed');
  }

  restoreUserA();
  churnOnRequest = true;
  const churnPurchase = await BackendClient.purchaseSeasonOpsOffer(
    'offer-path-walker-title',
    's1-genesis',
    {
      expectedUserId: 'season-client-user-a',
      mutationId: 'season-client-mutation-churn-0002',
    },
  );
  churnOnRequest = false;
  assert.equal(churnPurchase.success, false, 'purchase response must not apply after account churn');
  assert.equal(churnPurchase.reason, 'season_ops_account_changed');
  assert.equal(churnPurchase.mutationId, 'season-client-mutation-churn-0002', 'uncertain purchase should preserve its mutation id for reconciliation');
  assert.equal(requestCalls.at(-1).options.authToken, 'season-client-token-a-32-characters', 'purchase must keep the captured account bearer token');

  BackendClient.requestServer = original.requestServer;
  BackendClient.createSessionIntegrityFields = async () => ({
    salt: 'season-client-retry-salt',
    signature: 'b'.repeat(64),
    signatureMode: 'session',
  });
  restoreUserA();
  const retryBodies = [];
  globalThis.fetch = async (_url, init = {}) => {
    retryBodies.push(JSON.parse(init.body));
    if (retryBodies.length === 1) throw BackendClient.createError('simulated-network-failure');
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, purchaseId: 'season-client-retry-purchase-0003' }),
    };
  };
  const retryPurchase = await BackendClient.purchaseSeasonOpsOffer(
    'offer-dao-seeker-frame',
    's1-genesis',
    {
      expectedUserId: 'season-client-user-a',
      mutationId: 'season-client-fixed-mutation-0003',
    },
  );
  assert.equal(retryPurchase.success, true);
  assert.equal(retryBodies.length, 2, 'purchase request should retry once after a network failure');
  assert.equal(retryBodies[0].mutationId, retryBodies[1].mutationId, 'one logical purchase must reuse the fixed mutation id across retries');
  assert.equal(retryBodies[0].signature, retryBodies[1].signature, 'one logical purchase must reuse the same signed business body across retries');

  BackendClient.createSessionIntegrityFields = async () => ({ signatureMode: 'legacy' });
  const unsupportedSignature = await BackendClient.purchaseSeasonOpsOffer(
    'offer-genesis-badge',
    's1-genesis',
    {
      expectedUserId: 'season-client-user-a',
      mutationId: 'season-client-unsupported-signature-0004',
    },
  );
  assert.equal(unsupportedSignature.success, false);
  assert.equal(unsupportedSignature.reason, 'season_ops_signature_required');

  console.log('Season ops client checks passed.');
} finally {
  BackendClient.requestServer = original.requestServer;
  BackendClient.createSessionIntegrityFields = original.createSessionIntegrityFields;
  BackendClient.getCurrentUser = original.getCurrentUser;
  BackendClient.getServerConfig = original.getServerConfig;
  BackendClient.ensureReady = original.ensureReady;
  BackendClient.init = original.init;
  globalThis.fetch = original.fetch;
  BackendClient.persistServerSession(null);
}
