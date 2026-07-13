import assert from 'node:assert/strict';

function createDeferred() {
  let resolve = null;
  let reject = null;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

globalThis.window = globalThis;
globalThis.document = {
  addEventListener() {},
  removeEventListener() {}
};

const {
  createChallengeLadderService
} = await import('../js/services/challenge-ladder-service.js');

let currentUserId = 'ladder-user-a';
let requestIdCounter = 0;
let submitFailCount = 0;
let claimFailCount = 0;
const currentDeferredQueue = [];
const currentCalls = [];
const startCalls = [];
const submitCalls = [];
const claimCalls = [];

function buildCurrentSnapshot(overrides = {}) {
  return {
    rotationId: 'acl-2026-w28',
    attemptLimit: 3,
    remainingAttempts: 2,
    leaderboard: [
      { userId: 'ladder-rival-a', officialScore: 2180, rank: 1 }
    ],
    recoverableAttempt: {
      attemptId: 'acl-attempt-live-0001',
      runId: 'acl-run-live-0001',
      status: 'active'
    },
    personalBest: {
      resultId: 'acl-result-best-0001',
      officialScore: 1880,
      rank: 3
    },
    ...overrides
  };
}

const serviceClient = {
  getCurrentUser() {
    return currentUserId ? { objectId: currentUserId, username: currentUserId } : null;
  },
  createAuthoritativeRunRequestId(prefix = 'acl') {
    requestIdCounter += 1;
    return `${prefix}-generated-${String(requestIdCounter).padStart(4, '0')}`;
  },
  async getChallengeLadderCurrent(options = {}) {
    currentCalls.push({ options });
    const deferred = currentDeferredQueue.shift();
    if (deferred) return await deferred.promise;
    return {
      success: true,
      current: buildCurrentSnapshot()
    };
  },
  async startChallengeLadderAttempt(payload, options = {}) {
    startCalls.push({ payload, options });
    return {
      success: true,
      rotation: {
        rotationId: payload.rotationId,
        attemptLimit: 3
      },
      attempt: {
        attemptId: 'acl-attempt-live-0002',
        runId: 'acl-run-live-0002',
        status: 'active',
        clientAttemptId: payload.clientAttemptId,
        mutationId: payload.mutationId
      },
      run: {
        runId: 'acl-run-live-0002'
      }
    };
  },
  async submitChallengeLadderResult(payload, options = {}) {
    submitCalls.push({ payload, options });
    submitFailCount += 1;
    if (submitFailCount === 1) {
      return {
        success: false,
        reason: 'timeout',
        message: 'timeout'
      };
    }
    return {
      success: true,
      current: buildCurrentSnapshot({
        remainingAttempts: 1,
        recoverableAttempt: null,
        personalBest: {
          resultId: 'acl-result-best-0002',
          officialScore: 2330,
          rank: 2
        }
      }),
      result: {
        resultId: 'acl-result-best-0002',
        runId: payload.runId,
        mutationId: payload.mutationId,
        officialScore: 2330
      }
    };
  },
  async claimChallengeLadderReward(milestoneId, payload, options = {}) {
    claimCalls.push({ milestoneId, payload, options });
    claimFailCount += 1;
    if (claimFailCount === 1) {
      return {
        success: false,
        reason: 'wallet_busy',
        message: 'wallet busy'
      };
    }
    return {
      success: true,
      current: buildCurrentSnapshot({
        rewardMilestones: [
          { milestoneId, claimed: true }
        ],
        recoverableAttempt: null
      }),
      claim: {
        milestoneId,
        mutationId: payload.mutationId,
        grantedRenown: 50
      }
    };
  }
};

let nowTick = 0;
const service = createChallengeLadderService({
  client: serviceClient,
  now: () => {
    nowTick += 1;
    return nowTick;
  }
});

const observedSnapshots = [];
const unsubscribe = service.subscribe(snapshot => {
  observedSnapshots.push(snapshot);
});

assert.equal(observedSnapshots.length, 1, 'subscribe should emit the initial snapshot');
assert.equal(service.getState().current, null);

const initialCurrent = await service.current({ expectedUserId: 'ladder-user-a' });
assert.equal(initialCurrent.success, true, 'current should read the ladder snapshot');
assert.equal(currentCalls.at(-1).options.expectedUserId, 'ladder-user-a');
assert.equal(service.getState().current.rotationId, 'acl-2026-w28');
assert.equal(service.getState().attempt.runId, 'acl-run-live-0001');
assert.equal(service.getState().lastError, null);

const started = await service.start({
  rotationId: 'acl-2026-w28',
  expectedUserId: 'ladder-user-a'
});
assert.equal(started.success, true, 'start should create a challenge ladder attempt');
assert.equal(startCalls.length, 1);
assert.equal(startCalls[0].payload.protocolVersion, 'authoritative-challenge-ladder-v1');
assert.match(startCalls[0].payload.clientAttemptId, /^acl-attempt-generated-\d{4}$/);
assert.match(startCalls[0].payload.mutationId, /^acl-start-generated-\d{4}$/);
assert.equal(service.getState().attempt.runId, 'acl-run-live-0002');
assert.equal(service.getState().current.remainingAttempts, 2, 'start envelope must not replace the last complete current snapshot');

const staleCurrent = createDeferred();
currentDeferredQueue.push(staleCurrent);
const stalePromise = service.current({ expectedUserId: 'ladder-user-a' });
currentUserId = 'ladder-user-b';
staleCurrent.resolve({
  success: true,
  current: buildCurrentSnapshot({
    rotationId: 'acl-2026-w29',
    recoverableAttempt: {
      attemptId: 'acl-attempt-stale-0001',
      runId: 'acl-run-stale-0001',
      status: 'active'
    }
  })
});
const staleResult = await stalePromise;
assert.equal(staleResult.success, false, 'account churn should suppress the stale ladder response');
assert.equal(staleResult.reason, 'challenge_ladder_account_changed');
assert.equal(service.getState().current.rotationId, 'acl-2026-w28', 'stale current response must not overwrite the active account snapshot');
assert.equal(service.getState().attempt.runId, 'acl-run-live-0002', 'stale current response must not overwrite the active attempt');
assert.equal(service.getState().lastError.reason, 'challenge_ladder_account_changed');

currentUserId = 'ladder-user-a';
const failedSubmit = await service.submit({
  runId: 'acl-run-live-0002',
  expectedUserId: 'ladder-user-a'
});
assert.equal(failedSubmit.success, false, 'submit should surface the first failure');
assert.equal(service.getState().lastError.message, 'timeout');
assert.equal(service.getState().current.rotationId, 'acl-2026-w28', 'submit failure should retain the last known snapshot');
assert.equal(submitCalls.length, 1);
const stableSubmitMutationId = submitCalls[0].payload.mutationId;
assert.match(stableSubmitMutationId, /^acl-submit-generated-\d{4}$/);

const retrySubmit = await service.submit({
  runId: 'acl-run-live-0002',
  expectedUserId: 'ladder-user-a'
});
assert.equal(retrySubmit.success, true, 'submit retry should recover after a transient failure');
assert.equal(submitCalls.length, 2);
assert.equal(submitCalls[1].payload.mutationId, stableSubmitMutationId, 'one logical submit retry must reuse the same mutation id');
assert.equal(service.getState().lastError, null, 'successful submit should clear the last error');
assert.equal(service.getState().lastResult.resultId, 'acl-result-best-0002');
assert.equal(service.getState().attempt, null, 'successful submit should accept the cleared recoverable attempt snapshot');

const secondStart = await service.start({
  rotationId: 'acl-2026-w28',
  expectedUserId: 'ladder-user-a'
});
assert.equal(secondStart.success, true);
assert.equal(startCalls.length, 2);
assert.notEqual(startCalls[1].payload.clientAttemptId, startCalls[0].payload.clientAttemptId, 'a completed logical start must not reuse the previous attempt id');
assert.notEqual(startCalls[1].payload.mutationId, startCalls[0].payload.mutationId, 'a completed logical start must not replay the previous mutation');

const failedClaim = await service.claim({
  rotationId: 'acl-2026-w28',
  milestoneId: 'clear',
  expectedUserId: 'ladder-user-a'
});
assert.equal(failedClaim.success, false, 'claim should surface reward failures');
assert.equal(service.getState().lastError.reason, 'wallet_busy');
assert.equal(service.getState().current.rotationId, 'acl-2026-w28', 'claim failure should preserve the ladder snapshot');
const stableClaimMutationId = claimCalls[0].payload.mutationId;

const recoveredClaim = await service.claim({
  rotationId: 'acl-2026-w28',
  milestoneId: 'clear',
  expectedUserId: 'ladder-user-a'
});
assert.equal(recoveredClaim.success, true, 'claim should recover on the next successful attempt');
assert.equal(claimCalls.length, 2);
assert.equal(claimCalls[1].payload.mutationId, stableClaimMutationId, 'reward claim retries should preserve the same mutation id');
assert.equal(service.getState().lastError, null, 'successful claim should clear the last error');
assert.equal(claimCalls[0].milestoneId, 'clear', 'catalog milestone ids shorter than generic request ids must remain valid');
assert.equal(service.getState().lastClaim.milestoneId, 'clear');
assert.equal(service.getState().current.rewardMilestones[0].claimed, true);

assert.equal(
  observedSnapshots.some(snapshot => snapshot.pending && snapshot.pending.kind === 'start'),
  true,
  'subscription should observe pending start state'
);
assert.equal(
  observedSnapshots.some(snapshot => snapshot.lastError && snapshot.lastError.reason === 'wallet_busy'),
  true,
  'subscription should observe claim failures before recovery'
);

unsubscribe();

const partialStartCalls = [];
let partialStartAttempt = 0;
const partialRetryService = createChallengeLadderService({
  client: {
    getCurrentUser: () => ({ objectId: 'ladder-user-partial' }),
    createAuthoritativeRunRequestId: prefix => `${prefix}-partial-${String(partialStartCalls.length + 1).padStart(4, '0')}`,
    async startChallengeLadderAttempt(payload) {
      partialStartCalls.push(payload);
      partialStartAttempt += 1;
      return partialStartAttempt === 1
        ? { success: false, reason: 'timeout', message: 'timeout' }
        : { success: true, attempt: { attemptId: payload.clientAttemptId, runId: 'acl-run-partial-0001' } };
    }
  }
});
await partialRetryService.start({
  rotationId: 'acl-2026-w28',
  clientAttemptId: 'acl-attempt-partial-0001',
  expectedUserId: 'ladder-user-partial'
});
await partialRetryService.start({
  rotationId: 'acl-2026-w28',
  clientAttemptId: 'acl-attempt-partial-0001',
  expectedUserId: 'ladder-user-partial'
});
assert.equal(partialStartCalls.length, 2);
assert.equal(partialStartCalls[1].clientAttemptId, partialStartCalls[0].clientAttemptId);
assert.equal(partialStartCalls[1].mutationId, partialStartCalls[0].mutationId, 'partial-id retries must preserve the generated companion mutation id');

console.log('Challenge ladder client checks passed.');
