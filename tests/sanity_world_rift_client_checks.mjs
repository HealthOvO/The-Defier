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
  createWorldRiftService
} = await import('../js/services/world-rift-service.js');

let currentUserId = 'rift-user-a';
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
    rotationId: 'rift-2026-w28',
    attemptLimit: 5,
    remainingAttempts: 4,
    world: {
      rotationId: 'rift-2026-w28',
      phase: 'phase_2',
      remainingHp: 2800,
      totalContribution: 4120,
      stateVersion: 9
    },
    leaderboard: {
      entries: [
        { userId: 'rift-rival-a', rankedContribution: 3300, rank: 1 }
      ],
      myRank: { rank: 2, rankedContribution: 2950 },
      self: { userId: 'rift-user-a', rankedContribution: 2950 }
    },
    recoverableAttempt: {
      attemptId: 'rift-attempt-live-0001',
      runId: 'rift-run-live-0001',
      status: 'active'
    },
    personalContribution: {
      totalContribution: 2950,
      rankedContribution: 2600,
      completedRuns: 2
    },
    previousClaim: {
      rotationId: 'rift-2026-w27',
      milestoneId: 'global-phase-2',
      claimable: true
    },
    ...overrides
  };
}

const serviceClient = {
  getCurrentUser() {
    return currentUserId ? { objectId: currentUserId, username: currentUserId } : null;
  },
  createAuthoritativeRunRequestId(prefix = 'rift') {
    requestIdCounter += 1;
    return `${prefix}-generated-${String(requestIdCounter).padStart(4, '0')}`;
  },
  async getWorldRiftCurrent(options = {}) {
    currentCalls.push({ options });
    const deferred = currentDeferredQueue.shift();
    if (deferred) return await deferred.promise;
    return {
      success: true,
      current: buildCurrentSnapshot()
    };
  },
  async startWorldRiftAttempt(payload, options = {}) {
    startCalls.push({ payload, options });
    return {
      success: true,
      rotation: {
        rotationId: payload.rotationId,
        attemptLimit: 5
      },
      attempt: {
        attemptId: 'rift-attempt-live-0002',
        runId: 'rift-run-live-0002',
        status: 'active',
        clientAttemptId: payload.clientAttemptId,
        mutationId: payload.mutationId
      },
      run: {
        runId: 'rift-run-live-0002'
      }
    };
  },
  async submitWorldRiftContribution(payload, options = {}) {
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
        remainingAttempts: 3,
        recoverableAttempt: null,
        world: {
          rotationId: 'rift-2026-w28',
          phase: 'phase_3',
          remainingHp: 1900,
          totalContribution: 5300,
          stateVersion: 10
        },
        leaderboard: {
          entries: [
            { userId: 'rift-user-a', rankedContribution: 4130, rank: 1 }
          ],
          myRank: { rank: 1, rankedContribution: 4130 },
          self: { userId: 'rift-user-a', rankedContribution: 4130 }
        },
        personalContribution: {
          totalContribution: 4130,
          rankedContribution: 4130,
          completedRuns: 3
        }
      }),
      contribution: {
        contributionId: 'rift-contribution-0001',
        runId: payload.runId,
        mutationId: payload.mutationId,
        contribution: 1180,
        appliedDamage: 1180,
        stateVersion: 10
      }
    };
  },
  async claimWorldRiftReward(milestoneId, payload, options = {}) {
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
        recoverableAttempt: null,
        previousClaim: {
          rotationId: 'rift-2026-w27',
          milestoneId: 'global-phase-3',
          claimable: true
        }
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
const service = createWorldRiftService({
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

const initialCurrent = await service.current({ expectedUserId: 'rift-user-a' });
assert.equal(initialCurrent.success, true, 'current should read the world-rift snapshot');
assert.equal(currentCalls.at(-1).options.expectedUserId, 'rift-user-a');
assert.equal(service.getState().current.rotationId, 'rift-2026-w28');
assert.equal(service.getState().attempt.runId, 'rift-run-live-0001');
assert.equal(service.getState().contribution.totalContribution, 2950);
assert.equal(service.getState().world.phase, 'phase_2');
assert.equal(service.getState().leaderboard.myRank.rank, 2);
assert.equal(service.getState().previousClaim.milestoneId, 'global-phase-2');
assert.equal(service.getState().lastError, null);

const started = await service.start({
  rotationId: 'rift-2026-w28',
  expectedUserId: 'rift-user-a'
});
assert.equal(started.success, true, 'start should create a world-rift attempt');
assert.equal(startCalls.length, 1);
assert.equal(startCalls[0].payload.protocolVersion, 'authoritative-world-rift-v1');
assert.match(startCalls[0].payload.clientAttemptId, /^rift-attempt-generated-\d{4}$/);
assert.match(startCalls[0].payload.mutationId, /^rift-start-generated-\d{4}$/);
assert.equal(service.getState().attempt.runId, 'rift-run-live-0002');
assert.equal(service.getState().current.remainingAttempts, 4, 'start envelope must not replace the last complete current snapshot');

const staleCurrent = createDeferred();
currentDeferredQueue.push(staleCurrent);
const stalePromise = service.current({ expectedUserId: 'rift-user-a' });
currentUserId = 'rift-user-b';
staleCurrent.resolve({
  success: true,
  current: buildCurrentSnapshot({
    rotationId: 'rift-2026-w29',
    world: {
      rotationId: 'rift-2026-w29',
      phase: 'phase_1',
      remainingHp: 4400,
      totalContribution: 0,
      stateVersion: 1
    },
    recoverableAttempt: {
      attemptId: 'rift-attempt-stale-0001',
      runId: 'rift-run-stale-0001',
      status: 'active'
    }
  })
});
const staleResult = await stalePromise;
assert.equal(staleResult.success, false, 'account churn should suppress the stale world-rift response');
assert.equal(staleResult.reason, 'world_rift_account_changed');
assert.equal(service.getState().current.rotationId, 'rift-2026-w28', 'stale current response must not overwrite the active account snapshot');
assert.equal(service.getState().attempt.runId, 'rift-run-live-0002', 'stale current response must not overwrite the active attempt');
assert.equal(service.getState().world.phase, 'phase_2', 'stale current response must not overwrite the active world state');
assert.equal(service.getState().lastError.reason, 'world_rift_account_changed');

currentUserId = 'rift-user-a';
const failedSubmit = await service.submit({
  runId: 'rift-run-live-0002',
  expectedUserId: 'rift-user-a'
});
assert.equal(failedSubmit.success, false, 'submit should surface the first failure');
assert.equal(service.getState().lastError.message, 'timeout');
assert.equal(service.getState().current.rotationId, 'rift-2026-w28', 'submit failure should retain the last known snapshot');
assert.equal(submitCalls.length, 1);
const stableSubmitMutationId = submitCalls[0].payload.mutationId;
assert.match(stableSubmitMutationId, /^rift-submit-generated-\d{4}$/);

const retrySubmit = await service.submit({
  runId: 'rift-run-live-0002',
  expectedUserId: 'rift-user-a'
});
assert.equal(retrySubmit.success, true, 'submit retry should recover after a transient failure');
assert.equal(submitCalls.length, 2);
assert.equal(submitCalls[1].payload.mutationId, stableSubmitMutationId, 'one logical submit retry must reuse the same mutation id');
assert.equal(service.getState().lastError, null, 'successful submit should clear the last error');
assert.equal(service.getState().contribution.contributionId, 'rift-contribution-0001');
assert.equal(service.getState().world.phase, 'phase_3');
assert.equal(service.getState().world.stateVersion, 10);
assert.equal(service.getState().leaderboard.myRank.rank, 1);
assert.equal(service.getState().attempt, null, 'successful submit should accept the cleared recoverable attempt snapshot');

const secondStart = await service.start({
  rotationId: 'rift-2026-w28',
  expectedUserId: 'rift-user-a'
});
assert.equal(secondStart.success, true);
assert.equal(startCalls.length, 2);
assert.notEqual(startCalls[1].payload.clientAttemptId, startCalls[0].payload.clientAttemptId, 'a completed logical start must not reuse the previous attempt id');
assert.notEqual(startCalls[1].payload.mutationId, startCalls[0].payload.mutationId, 'a completed logical start must not replay the previous mutation');

const failedClaim = await service.claim({
  rotationId: 'rift-2026-w28',
  milestoneId: 'global-phase-3',
  expectedUserId: 'rift-user-a'
});
assert.equal(failedClaim.success, false, 'claim should surface reward failures');
assert.equal(service.getState().lastError.reason, 'wallet_busy');
assert.equal(service.getState().current.rotationId, 'rift-2026-w28', 'claim failure should preserve the world-rift snapshot');
const stableClaimMutationId = claimCalls[0].payload.mutationId;

const recoveredClaim = await service.claim({
  rotationId: 'rift-2026-w28',
  milestoneId: 'global-phase-3',
  expectedUserId: 'rift-user-a'
});
assert.equal(recoveredClaim.success, true, 'claim should recover on the next successful attempt');
assert.equal(claimCalls.length, 2);
assert.equal(claimCalls[1].payload.mutationId, stableClaimMutationId, 'reward claim retries should preserve the same mutation id');
assert.equal(service.getState().lastError, null, 'successful claim should clear the last error');
assert.equal(claimCalls[0].milestoneId, 'global-phase-3', 'world-rift milestone ids must remain valid');
assert.equal(service.getState().claim.milestoneId, 'global-phase-3');
assert.equal(service.getState().previousClaim.milestoneId, 'global-phase-3');
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
const partialRetryService = createWorldRiftService({
  client: {
    getCurrentUser: () => ({ objectId: 'rift-user-partial' }),
    createAuthoritativeRunRequestId: prefix => `${prefix}-partial-${String(partialStartCalls.length + 1).padStart(4, '0')}`,
    async startWorldRiftAttempt(payload) {
      partialStartCalls.push(payload);
      partialStartAttempt += 1;
      return partialStartAttempt === 1
        ? { success: false, reason: 'timeout', message: 'timeout' }
        : { success: true, attempt: { attemptId: payload.clientAttemptId, runId: 'rift-run-partial-0001' } };
    }
  }
});
await partialRetryService.start({
  rotationId: 'rift-2026-w28',
  clientAttemptId: 'rift-attempt-partial-0001',
  expectedUserId: 'rift-user-partial'
});
await partialRetryService.start({
  rotationId: 'rift-2026-w28',
  clientAttemptId: 'rift-attempt-partial-0001',
  expectedUserId: 'rift-user-partial'
});
assert.equal(partialStartCalls.length, 2);
assert.equal(partialStartCalls[1].clientAttemptId, partialStartCalls[0].clientAttemptId);
assert.equal(partialStartCalls[1].mutationId, partialStartCalls[0].mutationId, 'partial-id retries must preserve the generated companion mutation id');

console.log('World rift client checks passed.');
