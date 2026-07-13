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
  createAuthoritativeRunService
} = await import('../js/services/authoritative-run-service.js');
const {
  createRelayExpeditionService
} = await import('../js/services/relay-expedition-service.js');

let currentUserId = 'relay-user-a';
let requestIdCounter = 0;
let createSessionAttempts = 0;
let claimLegAttempts = 0;
let passAttempts = 0;
let projectAttempts = 0;
let rewardAttempts = 0;

const currentDeferredQueue = [];
const authoritativeGetCalls = [];
const currentCalls = [];
const createSessionCalls = [];
const claimLegCalls = [];
const passCalls = [];
const projectCalls = [];
const rewardCalls = [];

const authoritativeProjectionByRunId = new Map([
  ['relay-run-live-0001', { runId: 'relay-run-live-0001', mode: 'relay_expedition', version: 3, phase: 'battle' }],
  ['relay-run-live-0002', { runId: 'relay-run-live-0002', mode: 'relay_expedition', version: 1, phase: 'route' }]
]);

function buildActiveLeg({
  legId = 'relay-leg-live-0001',
  legIndex = 1,
  sessionId = 'relay-session-live-0001',
  tacticId = 'vanguard',
  runId = 'relay-run-live-0001',
  status = 'active'
} = {}) {
  return {
    legId,
    legIndex,
    sessionId,
    tacticId,
    status,
    runId,
    run: {
      runId,
      projection: authoritativeProjectionByRunId.get(runId)
    },
    allowedTactics: [
      { tacticId: 'vanguard' },
      { tacticId: 'bulwark' }
    ]
  };
}

function buildQueuedLeg({
  legId = 'relay-leg-queued-0001',
  legIndex = 1,
  sessionId = 'relay-session-live-0002',
  priorityMemberId = 'relay-user-a'
} = {}) {
  return {
    legId,
    legIndex,
    sessionId,
    status: 'queued',
    priorityMemberId,
    allowedTactics: [
      { tacticId: 'vanguard' },
      { tacticId: 'insight' }
    ]
  };
}

function buildSession({
  sessionId = 'relay-session-live-0001',
  rotationId = 'relay-2026-w28',
  currentLeg = buildActiveLeg(),
  currentLegIndex = currentLeg ? currentLeg.legIndex : 1,
  routeScore = 1200,
  milestones = [
    { milestoneId: 'relay-first-handoff', claimed: false }
  ]
} = {}) {
  return {
    sessionId,
    rotationId,
    status: 'active',
    currentLegIndex,
    routeScore,
    milestones,
    currentLeg
  };
}

function buildCurrentSnapshot({
  rotationId = 'relay-2026-w28',
  currentSession = buildSession(),
  previousSessions = [
    {
      sessionId: 'relay-session-prev-0001',
      rotationId: 'relay-2026-w27',
      status: 'completed',
      routeScore: 4880
    },
    {
      sessionId: 'relay-session-prev-0002',
      rotationId: 'relay-2026-w26',
      status: 'completed',
      routeScore: 4520
    }
  ],
  previousSession = {
    sessionId: 'relay-session-prev-0001',
    rotationId: 'relay-2026-w27',
    status: 'completed',
    routeScore: 4880
  }
} = {}) {
  return {
    rotationId,
    currentSession,
    previousSessions,
    previousSession
  };
}

const sharedClient = {
  getCurrentUser() {
    return currentUserId ? { objectId: currentUserId, username: currentUserId } : null;
  },
  createAuthoritativeRunRequestId(prefix = 'relay') {
    requestIdCounter += 1;
    return `${prefix}-generated-${String(requestIdCounter).padStart(4, '0')}`;
  },
  async getAuthoritativeRun(runId, options = {}) {
    authoritativeGetCalls.push({ runId, options });
    return {
      success: true,
      projection: authoritativeProjectionByRunId.get(runId) || {
        runId,
        mode: 'relay_expedition',
        version: 1,
        phase: 'route'
      }
    };
  },
  async getRelayExpeditionCurrent(options = {}) {
    currentCalls.push({ options });
    const deferred = currentDeferredQueue.shift();
    if (deferred) return await deferred.promise;
    return {
      success: true,
      current: buildCurrentSnapshot()
    };
  },
  async createRelayExpeditionSession(payload, options = {}) {
    createSessionCalls.push({ payload, options });
    createSessionAttempts += 1;
    if (createSessionAttempts === 1) {
      return {
        success: false,
        reason: 'timeout',
        message: 'timeout'
      };
    }
    return {
      success: true,
      current: buildCurrentSnapshot({
        currentSession: buildSession({
          sessionId: 'relay-session-live-0002',
          currentLeg: buildQueuedLeg({
            legId: 'relay-leg-queued-0001',
            legIndex: 1,
            sessionId: 'relay-session-live-0002'
          }),
          currentLegIndex: 1,
          routeScore: 0
        })
      }),
      session: {
        sessionId: 'relay-session-live-0002',
        clientSessionId: payload.clientSessionId,
        mutationId: payload.mutationId
      }
    };
  },
  async claimRelayExpeditionLeg(payload, options = {}) {
    claimLegCalls.push({ payload, options });
    claimLegAttempts += 1;
    if (claimLegAttempts === 1) {
      return {
        success: false,
        reason: 'lease_busy',
        message: 'lease busy'
      };
    }
    return {
      success: true,
      current: buildCurrentSnapshot({
        currentSession: buildSession({
          sessionId: payload.sessionId,
          currentLeg: buildActiveLeg({
            legId: 'relay-leg-live-0002',
            legIndex: payload.legIndex,
            sessionId: payload.sessionId,
            tacticId: payload.tacticId,
            runId: 'relay-run-live-0002'
          }),
          currentLegIndex: payload.legIndex,
          routeScore: 0
        })
      }),
      legClaim: {
        legId: 'relay-leg-live-0002',
        legIndex: payload.legIndex,
        clientLegId: payload.clientLegId,
        mutationId: payload.mutationId
      }
    };
  },
  async passRelayExpeditionBaton(payload, options = {}) {
    passCalls.push({ payload, options });
    passAttempts += 1;
    if (passAttempts === 1) {
      return {
        success: false,
        reason: 'seat_locked',
        message: 'seat locked'
      };
    }
    return {
      success: true,
      current: buildCurrentSnapshot({
        currentSession: buildSession({
          sessionId: payload.sessionId,
          currentLeg: buildQueuedLeg({
            legId: 'relay-leg-queued-0002',
            legIndex: payload.legIndex,
            sessionId: payload.sessionId,
            priorityMemberId: 'relay-user-b'
          }),
          currentLegIndex: payload.legIndex,
          routeScore: 1360
        })
      }),
      pass: {
        sessionId: payload.sessionId,
        legIndex: payload.legIndex,
        mutationId: payload.mutationId,
        nextPriorityMemberId: 'relay-user-b'
      }
    };
  },
  async projectRelayExpeditionLeg(legId, payload, options = {}) {
    projectCalls.push({ legId, payload, options });
    projectAttempts += 1;
    if (projectAttempts === 1) {
      return {
        success: false,
        reason: 'projection_pending',
        message: 'projection pending'
      };
    }
    return {
      success: true,
      current: buildCurrentSnapshot({
        currentSession: buildSession({
          sessionId: payload.sessionId,
          currentLeg: buildQueuedLeg({
            legId: 'relay-leg-queued-0002',
            legIndex: 1,
            sessionId: payload.sessionId,
            priorityMemberId: 'relay-user-a'
          }),
          currentLegIndex: 1,
          routeScore: 1360,
          milestones: [
            { milestoneId: 'relay-first-handoff', claimed: false, claimable: true }
          ]
        })
      }),
      project: {
        legId,
        runId: payload.runId,
        mutationId: payload.mutationId,
        legScore: 1360
      }
    };
  },
  async claimRelayExpeditionReward(milestoneId, payload, options = {}) {
    rewardCalls.push({ milestoneId, payload, options });
    rewardAttempts += 1;
    if (rewardAttempts === 1) {
      return {
        success: false,
        reason: 'wallet_busy',
        message: 'wallet busy'
      };
    }
    return {
      success: true,
      current: buildCurrentSnapshot({
        currentSession: buildSession({
          sessionId: payload.sessionId,
          currentLeg: buildQueuedLeg({
            legId: 'relay-leg-queued-0002',
            legIndex: 1,
            sessionId: payload.sessionId,
            priorityMemberId: 'relay-user-a'
          }),
          currentLegIndex: 1,
          routeScore: 1360,
          milestones: [
            { milestoneId, claimed: true, claimable: false }
          ]
        })
      }),
      claim: {
        milestoneId,
        mutationId: payload.mutationId,
        grantedRenown: 30
      }
    };
  }
};

const authoritativeRunService = createAuthoritativeRunService({
  client: sharedClient,
  now: (() => {
    let tick = 1000;
    return () => ++tick;
  })()
});

const relayService = createRelayExpeditionService({
  client: sharedClient,
  authoritativeRunService,
  now: (() => {
    let tick = 2000;
    return () => ++tick;
  })()
});

const observedSnapshots = [];
const unsubscribe = relayService.subscribe(snapshot => {
  observedSnapshots.push(snapshot);
});

assert.equal(observedSnapshots.length, 1, 'subscribe should emit the initial relay snapshot');
assert.equal(relayService.getState().current, null);

const initialCurrent = await relayService.current({ expectedUserId: 'relay-user-a' });
assert.equal(initialCurrent.success, true, 'current should read the relay snapshot');
assert.equal(currentCalls.at(-1).options.expectedUserId, 'relay-user-a');
assert.equal(relayService.getState().session.sessionId, 'relay-session-live-0001');
assert.equal(relayService.getState().currentLeg.legId, 'relay-leg-live-0001');
assert.equal(relayService.getState().current.previousSessions.length, 2, 'current snapshots must preserve every historical reward-window session');
assert.equal(relayService.getState().current.previousSession.sessionId, 'relay-session-prev-0001');
assert.equal(relayService.getState().authoritativeRun.runId, 'relay-run-live-0001');
assert.equal(authoritativeRunService.getState().projection.mode, 'relay_expedition');
assert.equal(authoritativeGetCalls.length, 1, 'current should hand off the active relay run');

const createFailure = await relayService.createSession({
  rotationId: 'relay-2026-w28',
  sourceSquadId: 'relay-squad-live-0001',
  clientSessionId: 'relay-session-partial-0001',
  expectedUserId: 'relay-user-a'
});
assert.equal(createFailure.success, false, 'create session should surface the first failure');
assert.equal(relayService.getState().lastError.message, 'timeout');
assert.equal(createSessionCalls.length, 1);
const stableCreateMutationId = createSessionCalls[0].payload.mutationId;
assert.equal(createSessionCalls[0].payload.clientSessionId, 'relay-session-partial-0001');
assert.match(stableCreateMutationId, /^relay-create-generated-\d{4}$/);

const createRecovered = await relayService.createSession({
  rotationId: 'relay-2026-w28',
  sourceSquadId: 'relay-squad-live-0001',
  clientSessionId: 'relay-session-partial-0001',
  expectedUserId: 'relay-user-a'
});
assert.equal(createRecovered.success, true, 'create session should recover on retry');
assert.equal(createSessionCalls.length, 2);
assert.equal(createSessionCalls[1].payload.clientSessionId, createSessionCalls[0].payload.clientSessionId);
assert.equal(createSessionCalls[1].payload.mutationId, stableCreateMutationId, 'create session retries must reuse the generated companion mutation id');
assert.equal(relayService.getState().session.sessionId, 'relay-session-live-0002');
assert.equal(relayService.getState().currentLeg.status, 'queued');
assert.equal(relayService.getState().authoritativeRun, null, 'queue-only current should clear the relay run handoff');

const invalidClaimCallCount = claimLegCalls.length;
const invalidClaim = await relayService.claimLeg({
  sessionId: 'relay-session-live-0002',
  legIndex: 0,
  tacticId: 'vanguard',
  expectedUserId: 'relay-user-a'
});
assert.equal(invalidClaim.success, false, 'explicit out-of-range claim legIndex should fail locally');
assert.equal(invalidClaim.reason, 'relay_expedition_invalid_leg_index');
assert.equal(claimLegCalls.length, invalidClaimCallCount, 'invalid claim legIndex must not hit the API');

const invalidPassCallCount = passCalls.length;
const invalidPass = await relayService.passBaton({
  sessionId: 'relay-session-live-0002',
  legIndex: 9,
  expectedUserId: 'relay-user-a'
});
assert.equal(invalidPass.success, false, 'explicit out-of-range pass legIndex should fail locally');
assert.equal(invalidPass.reason, 'relay_expedition_invalid_leg_index');
assert.equal(passCalls.length, invalidPassCallCount, 'invalid pass legIndex must not hit the API');

const claimFailure = await relayService.claimLeg({
  sessionId: 'relay-session-live-0002',
  legIndex: 1,
  tacticId: 'vanguard',
  expectedUserId: 'relay-user-a'
});
assert.equal(claimFailure.success, false, 'claim leg should surface the first failure');
assert.equal(relayService.getState().lastError.reason, 'lease_busy');
assert.equal(claimLegCalls.length, 1);
const stableClientLegId = claimLegCalls[0].payload.clientLegId;
const stableClaimMutationId = claimLegCalls[0].payload.mutationId;
assert.match(stableClientLegId, /^relay-leg-generated-\d{4}$/);
assert.match(stableClaimMutationId, /^relay-claim-generated-\d{4}$/);

const claimRecovered = await relayService.claimLeg({
  sessionId: 'relay-session-live-0002',
  legIndex: 1,
  tacticId: 'vanguard',
  expectedUserId: 'relay-user-a'
});
assert.equal(claimRecovered.success, true, 'claim leg should recover on retry');
assert.equal(claimLegCalls.length, 2);
assert.equal(claimLegCalls[1].payload.clientLegId, stableClientLegId, 'claim leg retries must preserve clientLegId');
assert.equal(claimLegCalls[1].payload.mutationId, stableClaimMutationId, 'claim leg retries must preserve mutationId');
assert.equal(relayService.getState().legClaim.clientLegId, stableClientLegId);
assert.equal(relayService.getState().currentLeg.runId, 'relay-run-live-0002');
assert.equal(relayService.getState().authoritativeRun.runId, 'relay-run-live-0002');
assert.equal(authoritativeGetCalls.at(-1).runId, 'relay-run-live-0002', 'claim leg should hand off the claimed relay run');

const projectFailure = await relayService.projectLeg({
  sessionId: 'relay-session-live-0002',
  legId: 'relay-leg-live-0002',
  runId: 'relay-run-live-0002',
  expectedUserId: 'relay-user-a'
});
assert.equal(projectFailure.success, false, 'project leg should surface the first failure');
assert.equal(relayService.getState().lastError.reason, 'projection_pending');
const stableProjectMutationId = projectCalls[0].payload.mutationId;
assert.match(stableProjectMutationId, /^relay-project-generated-\d{4}$/);

const projectRecovered = await relayService.projectLeg({
  sessionId: 'relay-session-live-0002',
  legId: 'relay-leg-live-0002',
  runId: 'relay-run-live-0002',
  expectedUserId: 'relay-user-a'
});
assert.equal(projectRecovered.success, true, 'project leg should recover on retry');
assert.equal(projectCalls.length, 2);
assert.equal(projectCalls[1].payload.mutationId, stableProjectMutationId, 'project leg retries must preserve mutationId');
assert.equal(relayService.getState().lastProjection.legScore, 1360);
assert.equal(relayService.getState().currentLeg.status, 'queued');
assert.equal(relayService.getState().authoritativeRun, null, 'projecting a completed leg should clear the relay run handoff');

const staleCurrent = createDeferred();
currentDeferredQueue.push(staleCurrent);
const stalePromise = relayService.current({ expectedUserId: 'relay-user-a' });
currentUserId = 'relay-user-b';
staleCurrent.resolve({
  success: true,
  current: buildCurrentSnapshot({
    rotationId: 'relay-2026-w29',
    currentSession: buildSession({
      sessionId: 'relay-session-stale-0001',
      currentLeg: buildActiveLeg({
        legId: 'relay-leg-stale-0001',
        legIndex: 1,
        sessionId: 'relay-session-stale-0001',
        runId: 'relay-run-stale-0001'
      }),
      currentLegIndex: 1
    })
  })
});
const staleResult = await stalePromise;
assert.equal(staleResult.success, false, 'account churn should suppress stale relay responses');
assert.equal(staleResult.reason, 'relay_expedition_account_changed');
assert.equal(relayService.getState().session.sessionId, 'relay-session-live-0002', 'stale current response must not overwrite the active relay session');
assert.equal(relayService.getState().currentLeg.legId, 'relay-leg-queued-0002', 'stale current response must not overwrite the queued relay leg');
assert.equal(relayService.getState().lastError.reason, 'relay_expedition_account_changed');

currentUserId = 'relay-user-a';
const passFailure = await relayService.passBaton({
  sessionId: 'relay-session-live-0002',
  legIndex: 1,
  expectedUserId: 'relay-user-a'
});
assert.equal(passFailure.success, false, 'pass baton should surface the first failure');
assert.equal(relayService.getState().lastError.reason, 'seat_locked');
const stablePassMutationId = passCalls[0].payload.mutationId;
assert.match(stablePassMutationId, /^relay-pass-generated-\d{4}$/);

const passRecovered = await relayService.passBaton({
  sessionId: 'relay-session-live-0002',
  legIndex: 1,
  expectedUserId: 'relay-user-a'
});
assert.equal(passRecovered.success, true, 'pass baton should recover on retry');
assert.equal(passCalls.length, 2);
assert.equal(passCalls[1].payload.mutationId, stablePassMutationId, 'pass baton retries must preserve mutationId');
assert.equal(relayService.getState().lastPass.nextPriorityMemberId, 'relay-user-b');
assert.equal(relayService.getState().currentLeg.priorityMemberId, 'relay-user-b');

const rewardFailure = await relayService.claimReward({
  sessionId: 'relay-session-live-0002',
  rotationId: 'relay-2026-w28',
  milestoneId: 'relay-first-handoff',
  expectedUserId: 'relay-user-a'
});
assert.equal(rewardFailure.success, false, 'claim reward should surface the first failure');
assert.equal(relayService.getState().lastError.reason, 'wallet_busy');
const stableRewardMutationId = rewardCalls[0].payload.mutationId;
assert.match(stableRewardMutationId, /^relay-reward-generated-\d{4}$/);

const rewardRecovered = await relayService.claimReward({
  sessionId: 'relay-session-live-0002',
  rotationId: 'relay-2026-w28',
  milestoneId: 'relay-first-handoff',
  expectedUserId: 'relay-user-a'
});
assert.equal(rewardRecovered.success, true, 'claim reward should recover on retry');
assert.equal(rewardCalls.length, 2);
assert.equal(rewardCalls[1].payload.mutationId, stableRewardMutationId, 'claim reward retries must preserve mutationId');
assert.equal(relayService.getState().rewardClaim.milestoneId, 'relay-first-handoff');
assert.equal(relayService.getState().session.milestones[0].claimed, true);

assert.equal(
  observedSnapshots.some(snapshot => snapshot.pending && snapshot.pending.kind === 'claimLeg'),
  true,
  'subscription should observe pending relay claim state'
);
assert.equal(
  observedSnapshots.some(snapshot => snapshot.lastError && snapshot.lastError.reason === 'wallet_busy'),
  true,
  'subscription should observe relay reward failures before recovery'
);

unsubscribe();

console.log('Relay expedition client checks passed.');
