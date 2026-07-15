import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

globalThis.window = globalThis;
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.document = {
  addEventListener() {},
  removeEventListener() {}
};

const socialViewSource = read("js/views/SocialView.js");
const panelSource = read("js/views/AuthoritativeRunPanel.js");
const seasonOpsViewSource = read("js/views/SeasonOpsView.js");
const socialCss = read("css/account-social.css");
const seasonOpsCss = read("css/season-ops.css");

[
  "import { RelayExpeditionService }",
  "renderRelayExpeditionWorkspace(context)",
  "getRelayPreviousSessions()",
  "previousSessions",
  "只共享路线、棒次与权威摘要，不转移战斗状态。",
  "接棒并进入权威试炼",
  "RelayExpeditionService.createSession",
  "RelayExpeditionService.claimLeg",
  "RelayExpeditionService.passBaton",
  "RelayExpeditionService.projectLeg",
  "RelayExpeditionService.claimReward",
  "data-session-id",
  "data-rotation-id",
  "leg?.allowedTactics",
  "leg?.canClaim === true",
  "leg?.canPass === true",
  "sourceSquad?.sourceSquadId",
  "openRelayExpeditionOps()",
  "showSeasonOps('authoritative')",
  "openRelayExpeditionMode({ render: false })"
].forEach(marker => {
  assert.ok(socialViewSource.includes(marker), `social relay workspace should include ${marker}`);
});

[
  'relay_expedition',
  'loadRelayExpedition({ force = false, expectedUserId',
  'relay_expedition_start_from_social',
  'renderRelayExpeditionNoRunCard()',
  'projectLeg({ runId, expectedUserId })',
  'onRelayExpeditionProjected',
  '返回同道远征工作区'
].forEach(marker => {
  assert.ok(panelSource.includes(marker), `authoritative relay mode should include ${marker}`);
});

[
  'relayExpeditionService: RelayExpeditionService',
  'openRelayExpeditionMode(options = {})',
  'showSocialHub("squad")',
  'handleRelayExpeditionProjected()'
].forEach(marker => {
  assert.ok(seasonOpsViewSource.includes(marker), `season ops view should include ${marker}`);
});

[
  '.social-relay-workspace',
  '.social-relay-route-grid',
  '.social-relay-tactic-grid',
  '@media (max-width: 430px)'
].forEach(marker => {
  assert.ok(socialCss.includes(marker), `social relay CSS should include ${marker}`);
});

[
  'overflow-wrap: anywhere',
  '.season-ops-authoritative-mode-copy',
  '@media (max-width: 430px)'
].forEach(marker => {
  assert.ok(seasonOpsCss.includes(marker), `season ops relay CSS should include ${marker}`);
});

function createAuthoritativeServiceStub() {
  let state = {
    mode: "",
    runId: "",
    projection: null,
    lastReceipt: null,
    pending: null,
    pendingReplay: false,
    lastError: null,
    expectedUserId: "",
    updatedAt: Date.now()
  };
  const listeners = new Set();
  const calls = {
    current: 0,
    begin: 0,
    settle: 0
  };
  let settleResult = { success: true, run: null };
  return {
    getState() {
      return JSON.parse(JSON.stringify(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      state = {
        mode: "",
        runId: "",
        projection: null,
        lastReceipt: null,
        pending: null,
        pendingReplay: false,
        lastError: null,
        expectedUserId: "",
        updatedAt: Date.now()
      };
      listeners.forEach(listener => listener(this.getState()));
      return this.getState();
    },
    current: async () => {
      calls.current += 1;
      return { success: true, run: null };
    },
    begin: async () => {
      calls.begin += 1;
      return { success: true, run: null };
    },
    action: async () => ({ success: true, run: null }),
    settle: async () => {
      calls.settle += 1;
      return settleResult;
    },
    __setState(next) {
      state = { ...state, ...next, updatedAt: Date.now() };
      listeners.forEach(listener => listener(this.getState()));
    },
    __setSettleResult(next) {
      settleResult = next;
    },
    __calls: calls
  };
}

function createRelayServiceStub() {
  let state = {
    current: null,
    session: null,
    currentLeg: null,
    authoritativeRun: null,
    pending: null,
    lastError: null,
    updatedAt: Date.now()
  };
  const listeners = new Set();
  const calls = {
    current: 0,
    refreshRelayRun: 0,
    projectLeg: 0
  };
  let currentResult = { success: true };
  let refreshResult = { success: true, run: null };
  let projectResult = { success: true };
  return {
    getState() {
      return JSON.parse(JSON.stringify(state));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      state = {
        current: null,
        session: null,
        currentLeg: null,
        authoritativeRun: null,
        pending: null,
        lastError: null,
        updatedAt: Date.now()
      };
      listeners.forEach(listener => listener(this.getState()));
      return this.getState();
    },
    current: async () => {
      calls.current += 1;
      return currentResult;
    },
    refreshRelayRun: async () => {
      calls.refreshRelayRun += 1;
      return refreshResult;
    },
    projectLeg: async () => {
      calls.projectLeg += 1;
      return projectResult;
    },
    __setState(next) {
      state = { ...state, ...next, updatedAt: Date.now() };
      listeners.forEach(listener => listener(this.getState()));
    },
    __setCurrentResult(next) {
      currentResult = next;
    },
    __setRefreshResult(next) {
      refreshResult = next;
    },
    __setProjectResult(next) {
      projectResult = next;
    },
    __calls: calls
  };
}

function createRelayRunEnvelope({ phase = "route", status = "active", settledAt = 0 } = {}) {
  return {
    runId: "relay-run-ui-check-0001",
    clientRunId: "relay-client-ui-check-0001",
    mode: "relay_expedition",
    status,
    protocolVersion: "authoritative-run-v2",
    contentVersion: "authoritative-trials-v2",
    contentHash: "relay-content-hash-0001",
    authorityLevel: "server",
    trustTier: "server_authoritative",
    stateVersion: 5,
    actionCount: 7,
    startedAt: Date.UTC(2026, 6, 13, 4, 0),
    expiresAt: Date.UTC(2026, 6, 13, 6, 0),
    completedAt: phase === "completed" ? Date.UTC(2026, 6, 13, 4, 24) : 0,
    settledAt,
    updatedAt: Date.UTC(2026, 6, 13, 4, 25),
    integrity: {
      stateHash: "relay-state-hash-0001",
      chainHead: "relay-chain-head-0001"
    },
    recovery: {
      recoveryCount: 1
    },
    receipt: settledAt ? {
      receiptId: "relay-receipt-0001",
      settledAt,
      progressDelta: {
        battleWins: 3,
        bossWins: 1,
        activityCompletions: 1
      },
      integrity: {
        fullReplayPassed: true
      }
    } : null,
    projection: {
      runId: "relay-run-ui-check-0001",
      mode: "relay_expedition",
      version: 5,
      phase,
      allowedCommands: phase === "route" ? ["select_node", "abandon"] : [],
      player: {
        hp: 40,
        maxHp: 50,
        block: 5,
        energy: 3,
        hand: [],
        drawPileCount: 5,
        discardPileCount: 2
      },
      route: {
        stage: 1,
        totalStages: 3,
        choices: [{ nodeId: "relay-node-a", enemyId: "oath_guard", name: "天契守卫", type: "elite", threat: "精英", maxHp: 35 }],
        completedNodes: []
      },
      summary: phase === "completed" ? {
        score: 612,
        grade: "S",
        encountersWon: 3,
        bossWins: 1,
        turns: 12,
        cardsPlayed: 18,
        damageDealt: 96,
        damageTaken: 21,
        remainingHp: 29,
        maxHp: 50
      } : null
    }
  };
}

const { AuthoritativeRunPanel } = await import("../js/views/AuthoritativeRunPanel.js");
const { SocialView } = await import("../js/views/SocialView.js");
const { RelayExpeditionService } = await import("../js/services/relay-expedition-service.js");
const { AuthService } = await import("../js/services/authService.js");

const social = new SocialView({});
social.dashboard = {
  riftSquad: {
    current: {
      rotation: { rotationId: "world-rift-rotation-ui-check" },
      squad: { squadId: "world-rift-squad-ui-check" }
    }
  }
};
social.relayState = {
  current: {
    rotation: { rotationId: "relay-rotation-ui-check", title: "同道远征·契路" },
    sourceSquad: {
      sourceSquadId: "world-rift-squad-ui-check",
      eligible: true,
      isLeader: true
    }
  },
  session: null,
  currentLeg: null,
  pending: null,
  lastError: null
};
let socialHtml = social.renderRelayExpeditionWorkspace(social.getSquadContext());
assert.match(socialHtml, /开始同道远征/, "eligible leader should see the relay start action");
assert.equal(social.getRelayRotation().rotationId, "relay-rotation-ui-check", "relay create must use the relay rotation instead of the source world-rift rotation");

const backendShapeLegs = Array.from({ length: 4 }, (_, offset) => ({
  legId: `relay-leg-ui-check-000${offset + 1}`,
  legIndex: offset + 1,
  status: offset === 0 ? "queued" : "queued",
  current: offset === 0,
  priorityMember: offset === 0 ? { profileId: "relay-profile-a", displayName: "甲", seat: 0 } : null,
  runner: null,
  allowedTactics: offset === 0 ? [
    { tacticId: "vanguard", description: "主动压缩战线" },
    { tacticId: "insight", description: "调整抽滤节奏" }
  ] : [],
  routeScore: 0,
  canClaim: offset === 0,
  canPass: offset === 0
}));
social.relayState = {
  current: {
    rotation: { rotationId: "relay-rotation-ui-check", title: "同道远征·契路" },
    sourceSquad: {
      sourceSquadId: "world-rift-squad-ui-check",
      eligible: true,
      isLeader: true
    }
  },
  session: {
    sessionId: "relay-session-ui-check-0001",
    rotationId: "relay-rotation-ui-check",
    routeScore: 0,
    processedLegs: 0,
    projectedLegs: 0,
    members: [{ profileId: "relay-profile-a", displayName: "甲", seat: 0 }],
    legs: backendShapeLegs,
    currentLeg: backendShapeLegs[0],
    milestones: []
  },
  currentLeg: backendShapeLegs[0],
  pending: null,
  lastError: null
};
assert.deepEqual(social.getRelayLegs().map(leg => leg.legIndex), [1, 2, 3, 4], "relay route must preserve the backend's one-based four-leg contract");
socialHtml = social.renderRelayExpeditionWorkspace(social.getSquadContext());
assert.match(socialHtml, /第 1 棒/);
assert.match(socialHtml, /第 4 棒/, "the fourth backend leg must not be dropped by zero-based rendering");
assert.match(socialHtml, /破阵谱/);
assert.match(socialHtml, /甲 · 1 棒位/);
assert.match(socialHtml, /接棒并进入权威试炼/);
assert.match(socialHtml, /让棒/);

social.relayState = {
  current: {
    rotation: { rotationId: "relay-rotation-ui-check", title: "同道远征·契路" },
    previousSession: {
      sessionId: "relay-session-history-0001",
      rotationId: "relay-2026-w28",
      status: "completed",
      routeScore: 1880,
      rewardMilestones: [{ milestoneId: "relay-history-a", amount: 20, claimable: true, claimed: false }]
    },
    previousSessions: [
      {
        sessionId: "relay-session-history-0001",
        rotationId: "relay-2026-w28",
        status: "completed",
        routeScore: 1880,
        rewardMilestones: [{ milestoneId: "relay-history-a", amount: 20, claimable: true, claimed: false }]
      },
      {
        sessionId: "relay-session-history-0002",
        rotationId: "relay-2026-w27",
        status: "completed",
        routeScore: 1660,
        rewardMilestones: [{ milestoneId: "relay-history-b", amount: 30, claimable: true, claimed: false }]
      }
    ]
  },
  session: {
    sessionId: "relay-session-ui-check-0001",
    rotationId: "relay-rotation-ui-check",
    routeScore: 960,
    processedLegs: 1,
    projectedLegs: 1,
    currentLeg: backendShapeLegs[0],
    milestones: [{ milestoneId: "relay-current-a", amount: 10, claimable: true, claimed: false }]
  },
  currentLeg: backendShapeLegs[0],
  pending: null,
  lastError: null
};
assert.deepEqual(
  social.getRelayPreviousSessions().map(entry => entry.sessionId),
  ["relay-session-history-0001", "relay-session-history-0002"],
  "reward workspace should preserve every historical session without duplicating legacy previousSession"
);
social.relayState.session = social.relayState.current.previousSessions[0];
assert.deepEqual(
  social.getRelayRewardSessions().map(bundle => bundle.session.sessionId),
  ["relay-session-history-0001", "relay-session-history-0002"],
  "a historical active session promoted to the primary workspace must not duplicate its reward panel"
);
social.relayState.session = {
  sessionId: "relay-session-ui-check-0001",
  rotationId: "relay-rotation-ui-check",
  routeScore: 960,
  processedLegs: 1,
  projectedLegs: 1,
  currentLeg: backendShapeLegs[0],
  milestones: [{ milestoneId: "relay-current-a", amount: 10, claimable: true, claimed: false }]
};
socialHtml = social.renderRelayExpeditionWorkspace(social.getSquadContext());
assert.match(socialHtml, /data-session-id="relay-session-ui-check-0001"[^>]*data-rotation-id="relay-rotation-ui-check"[^>]*data-milestone-id="relay-current-a"/);
assert.match(socialHtml, /data-session-id="relay-session-history-0001"[^>]*data-rotation-id="relay-2026-w28"[^>]*data-milestone-id="relay-history-a"/);
assert.match(socialHtml, /data-session-id="relay-session-history-0002"[^>]*data-rotation-id="relay-2026-w27"[^>]*data-milestone-id="relay-history-b"/);
assert.match(socialHtml, /历史路线待领奖/);

let rewardPayload = null;
const originalClaimReward = RelayExpeditionService.claimReward;
const originalGetCurrentUser = AuthService.getCurrentUser;
const originalGetUserIdentity = AuthService.getUserIdentity;
RelayExpeditionService.claimReward = async payload => {
  rewardPayload = payload;
  return { success: true };
};
AuthService.getCurrentUser = () => ({ objectId: "relay-user-a" });
AuthService.getUserIdentity = user => user?.objectId || "";
social.mutate = async task => await task();
await social.handleAction("relay-claim-reward", {
  sessionId: "relay-session-history-0002",
  rotationId: "relay-2026-w27",
  milestoneId: "relay-history-b"
});
assert.deepEqual(rewardPayload, {
  sessionId: "relay-session-history-0002",
  rotationId: "relay-2026-w27",
  milestoneId: "relay-history-b",
  expectedUserId: "relay-user-a"
}, "reward claims must use the button's historical session context instead of the current relay session");
RelayExpeditionService.claimReward = originalClaimReward;
AuthService.getCurrentUser = originalGetCurrentUser;
AuthService.getUserIdentity = originalGetUserIdentity;

const service = createAuthoritativeServiceStub();
const relay = createRelayServiceStub();
relay.__setState({
  session: {
    sessionId: "relay-session-ui-check-0001",
    rotationId: "relay-2026-w29",
    totalScore: 1820,
    processedLegs: 1,
    rewardMilestones: [{ milestoneId: "relay-first-handoff", claimed: false }]
  },
  currentLeg: {
    legId: "relay-leg-ui-check-0002",
    sessionId: "relay-session-ui-check-0001",
    legIndex: 1,
    status: "queued",
    priorityMember: { profileId: "relay-profile-b", displayName: "乙", seat: 1 },
    allowedTactics: [{ tacticId: "vanguard" }, { tacticId: "insight" }]
  }
});
relay.__setCurrentResult({ success: true, current: { currentSession: relay.getState().session } });

let projectedCount = 0;
let returnCount = 0;
const panel = new AuthoritativeRunPanel({
  service,
  relayExpeditionService: relay,
  getCurrentUserId: () => "relay-user-a",
  requestRender: () => {},
  requestLogin: () => {},
  requestConfirm: async () => true,
  onRelayExpeditionProjected: () => { projectedCount += 1; },
  onRelayExpeditionReturn: () => { returnCount += 1; }
});

await panel.selectMode("relay_expedition");
assert.equal(relay.__calls.current, 1, "relay mode should hydrate through RelayExpeditionService.current");
assert.equal(service.__calls.current, 0, "relay mode must not query the generic current endpoint");

let html = panel.render();
assert.match(html, /同道远征共享态/);
assert.match(html, /返回同道远征工作区/);
assert.match(html, /第 1 \/ 4 棒/, "relay no-run card must preserve the backend's one-based leg index");
assert.doesNotMatch(html, /开始本模式试炼/, "relay mode without a run must not expose the generic start CTA");

relay.__setState({
  session: {
    ...relay.getState().session,
    status: "completed",
    currentLegIndex: 5,
    processedLegs: 4
  },
  currentLeg: null
});
html = panel.render();
assert.match(html, /第 4 \/ 4 棒/, "completed relay sessions must clamp the terminal cursor to the fourth displayed leg");

relay.__setState({
  session: {
    ...relay.getState().session,
    status: "active",
    currentLegIndex: 1,
    processedLegs: 1
  },
  currentLeg: {
    legId: "relay-leg-ui-check-0002",
    sessionId: "relay-session-ui-check-0001",
    legIndex: 1,
    status: "queued",
    priorityMember: { profileId: "relay-profile-b", displayName: "乙", seat: 1 },
    allowedTactics: [{ tacticId: "vanguard" }, { tacticId: "insight" }]
  }
});

await panel.handleAction({
  disabled: false,
  dataset: { seasonOpsAction: "authoritative-return-relay" }
});
assert.equal(returnCount, 1, "relay return action should use the dedicated callback");

relay.__setState({
  currentLeg: {
    legId: "relay-leg-ui-check-0002",
    sessionId: "relay-session-ui-check-0001",
    legIndex: 1,
    status: "active",
    tacticId: "vanguard",
    runId: "relay-run-ui-check-0001"
  },
  authoritativeRun: {
    runId: "relay-run-ui-check-0001",
    status: "completed",
    projection: createRelayRunEnvelope({ phase: "completed", status: "completed" }).projection
  }
});
relay.__setRefreshResult({
  success: true,
  run: createRelayRunEnvelope({ phase: "completed", status: "completed" })
});
service.__setSettleResult({
  success: true,
  run: createRelayRunEnvelope({ phase: "completed", status: "completed", settledAt: Date.UTC(2026, 6, 13, 4, 31) })
});
relay.__setProjectResult({ success: true, current: { currentSession: relay.getState().session } });

await panel.loadRelayExpedition({ force: true, expectedUserId: "relay-user-a" });
html = panel.render();
assert.match(html, /结算并投影到共享路线/);
assert.match(html, /第 1 棒/, "authoritative relay panel must display the backend's one-based leg index unchanged");

await panel.settleRun();
assert.equal(service.__calls.settle, 1, "relay mode should still settle through the authoritative run service");
assert.equal(relay.__calls.projectLeg, 1, "relay settle must project the settled run back into the shared route");
assert.equal(projectedCount, 1, "successful relay project should trigger the shared-state callback");

panel.destroy();

console.log("Relay expedition UI checks passed.");
