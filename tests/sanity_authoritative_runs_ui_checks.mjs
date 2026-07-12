import assert from "node:assert/strict";

const noop = () => {};

function createServiceStub() {
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
  const beginCalls = [];
  const currentCalls = [];
  const getCalls = [];
  const settleCalls = [];
  let currentHandler = async () => ({ success: true, run: null });
  let getHandler = async () => ({ success: true, run: null });
  let settleHandler = async () => ({ success: true, run: null });
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
    current: async options => {
      currentCalls.push(options);
      return currentHandler(options);
    },
    get: async options => {
      getCalls.push(options);
      return getHandler(options);
    },
    begin: async options => {
      beginCalls.push(options);
      return { success: true, run: null };
    },
    action: async () => ({ success: true, run: null }),
    settle: async options => {
      settleCalls.push(options);
      return settleHandler(options);
    },
    __setState(nextState) {
      state = {
        ...state,
        ...nextState,
        updatedAt: Date.now()
      };
      listeners.forEach(listener => listener(this.getState()));
    },
    __getBeginCalls() {
      return beginCalls.slice();
    },
    __getCurrentCalls() {
      return currentCalls.slice();
    },
    __getGetCalls() {
      return getCalls.slice();
    },
    __getSettleCalls() {
      return settleCalls.slice();
    },
    __setCurrentHandler(handler) {
      currentHandler = handler;
    },
    __setGetHandler(handler) {
      getHandler = handler;
    },
    __setSettleHandler(handler) {
      settleHandler = handler;
    }
  };
}

function createRunEnvelope({ mode = "pve", phase = "route", status = "active", settledAt = 0 } = {}) {
  return {
    runId: `arun-${mode}-${phase}`,
    clientRunId: `client-${mode}-${phase}`,
    mode,
    status,
    protocolVersion: "authoritative-run-v2",
    contentVersion: "authoritative-trials-v1",
    contentHash: "aa18ac01c39d1c1c38d0c26fe3d83d92a3b34035b25305628e00a96a42bdd281",
    authorityLevel: "server",
    trustTier: "server_authoritative",
    stateVersion: 7,
    actionCount: 7,
    startedAt: Date.UTC(2026, 6, 11, 8, 0),
    expiresAt: Date.UTC(2026, 6, 12, 8, 0),
    completedAt: phase === "completed" ? Date.UTC(2026, 6, 11, 8, 30) : 0,
    settledAt,
    abandonedAt: phase === "abandoned" ? Date.UTC(2026, 6, 11, 8, 20) : 0,
    updatedAt: Date.UTC(2026, 6, 11, 8, 35),
    integrity: {
      stateHash: "state-hash-0001-abcdef1234567890",
      chainHead: "chain-head-0001-fedcba0987654321",
      snapshotInterval: 8,
      fullyReplayRequiredForSettlement: true
    },
    recovery: {
      recoveryCount: 1,
      resumable: status === "active" || status === "completed"
    },
    receipt: settledAt ? {
      receiptId: "arreceipt-settled-0001",
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
      schemaVersion: 2,
      protocolVersion: "authoritative-run-v2",
      contentVersion: "authoritative-trials-v1",
      runId: `arun-${mode}-${phase}`,
      mode,
      scenario: {
        scenarioId: `${mode}-scenario`,
        title: `${mode} title`,
        description: `${mode} desc`,
        turnBudget: mode === "challenge" ? 16 : 0,
        betweenEncounterHeal: mode === "expedition" ? 5 : 0
      },
      version: 7,
      phase,
      allowedCommands: phase === "route"
        ? ["select_node", "abandon"]
        : phase === "battle"
          ? ["play_card", "end_turn", "abandon"]
          : phase === "reward"
            ? ["choose_reward", "abandon"]
            : [],
      player: {
        hp: 38,
        maxHp: 50,
        block: 6,
        energy: 2,
        hand: [
          { instanceId: "card-1", cardId: "strike", name: "破势", description: "造成 8 点伤害。", cost: 1 },
          { instanceId: "card-2", cardId: "guard", name: "守心", description: "获得 6 点格挡。", cost: 1 }
        ],
        drawPileCount: 4,
        discardPileCount: 3,
        deckSize: 10,
        deckCounts: { strike: 5, guard: 4, insight: 1 }
      },
      route: {
        stage: 2,
        totalStages: 3,
        choices: [
          { nodeId: "node-a", stage: 2, type: "elite", enemyId: "oath_guard", name: "天契守卫", threat: "精英", maxHp: 35, boss: false },
          { nodeId: "node-b", stage: 2, type: "elite", enemyId: "mirror_seer", name: "照命术士", threat: "精英", maxHp: 34, boss: false }
        ],
        completedNodes: [
          { nodeId: "node-0", nodeType: "enemy", enemyId: "ink_scout", boss: false }
        ]
      },
      battle: phase === "battle" ? {
        nodeId: "node-a",
        nodeType: "elite",
        turn: 3,
        enemy: {
          enemyId: "oath_guard",
          name: "天契守卫",
          hp: 23,
          maxHp: 35,
          block: 5,
          vulnerable: 1,
          intent: {
            type: "attack",
            amount: 10,
            label: "重裁 10"
          }
        }
      } : null,
      reward: phase === "reward" ? {
        choices: [
          { rewardId: "reward-card", kind: "card", name: "纳入「穿云」", description: "造成 13 点伤害。" },
          { rewardId: "reward-heal", kind: "heal", name: "调息", description: "回复 10 点生命。" }
        ]
      } : null,
      stats: {
        turns: 5,
        cardsPlayed: 8,
        damageDealt: 44,
        damageTaken: 12,
        blockGained: 24,
        encountersWon: phase === "completed" || phase === "defeated" || phase === "abandoned" ? 3 : 1,
        bossWins: phase === "completed" ? 1 : 0,
        rewardsChosen: 1
      },
      summary: ["completed", "defeated", "abandoned"].includes(phase) ? {
        result: phase === "completed" ? "completed" : phase,
        reason: phase === "completed" ? "boss_defeated" : phase === "defeated" ? "hp_depleted" : "player_abandoned",
        score: phase === "completed" ? 613 : 0,
        grade: phase === "completed" ? "S" : "未完成",
        mode,
        scenarioId: `${mode}-scenario`,
        encountersWon: 3,
        bossWins: phase === "completed" ? 1 : 0,
        turns: 14,
        cardsPlayed: 21,
        damageDealt: 92,
        damageTaken: 24,
        remainingHp: phase === "completed" ? 26 : 0,
        maxHp: 50
      } : null
    }
  };
}

const service = createServiceStub();
const { AuthoritativeRunPanel } = await import("../js/views/AuthoritativeRunPanel.js");

const panel = new AuthoritativeRunPanel({
  service,
  getCurrentUserId: () => "ui-user-001",
  requestRender: noop,
  requestLogin: noop,
  requestConfirm: async () => true
});

let html = panel.render();
assert.match(html, /权威试炼/);
assert.match(html, /平衡试炼/);
assert.match(html, /开始本模式试炼/);
assert.match(html, /恢复服务器卷面/);

service.__setState({
  pending: { kind: "current" },
  projection: null,
  lastError: null
});
html = panel.render();
assert.match(html, /加载中/);
assert.match(html, /不会本地推演/);

service.__setState({
  pending: null,
  projection: null,
  lastError: { message: "卷面读取失败" }
});
html = panel.render();
assert.match(html, /读取失败/);
assert.match(html, /卷面读取失败/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-route",
  run: createRunEnvelope({ mode: "pve", phase: "route", status: "active" })
});
html = panel.render();
assert.match(html, /路线选择/);
assert.match(html, /内容哈希/);
assert.match(html, /状态哈希/);
assert.match(html, /链首/);
assert.match(html, /选择此路/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-battle",
  action: {
    command: "play_card",
    acceptedAt: Date.UTC(2026, 6, 11, 8, 18),
    events: [{ type: "card_played", cardId: "strike", damage: 8, block: 0 }]
  },
  run: createRunEnvelope({ mode: "pve", phase: "battle", status: "active" })
});
html = panel.render();
assert.match(html, /战斗投影/);
assert.match(html, /敌方下一手意图/);
assert.match(html, /重裁 10/);
assert.match(html, /打出此牌/);
assert.match(html, /结束本回合/);
assert.match(html, /最近服务器回执/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-reward",
  action: {
    command: "choose_reward",
    acceptedAt: Date.UTC(2026, 6, 11, 8, 22),
    events: [{ type: "reward_chosen", rewardKind: "card" }]
  },
  run: createRunEnvelope({ mode: "expedition", phase: "reward", status: "active" })
});
html = panel.render();
assert.match(html, /战后奖励/);
assert.match(html, /领取此项/);
assert.match(html, /整备 5 HP/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-completed",
  run: createRunEnvelope({ mode: "challenge", phase: "completed", status: "completed" })
});
html = panel.render();
assert.match(html, /待提交结算/);
assert.match(html, /提交正式结算/);
assert.match(html, /只有完整重放与状态哈希一致时/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-settled",
  receipt: {
    receiptId: "arreceipt-settled-0001",
    settledAt: Date.UTC(2026, 6, 11, 8, 31),
    progressDelta: { battleWins: 3, bossWins: 1, activityCompletions: 1 },
    integrity: { fullReplayPassed: true }
  },
  run: createRunEnvelope({
    mode: "challenge",
    phase: "completed",
    status: "settled",
    settledAt: Date.UTC(2026, 6, 11, 8, 31)
  })
});
html = panel.render();
assert.match(html, /已结算归档/);
assert.match(html, /结算回执/);
assert.match(html, /战斗胜利 \+3/);
assert.match(html, /再开一局/);

await panel.handleAction({
  disabled: false,
  dataset: { seasonOpsAction: "authoritative-begin-new" }
});
assert.equal(service.__getBeginCalls().at(-1).forceNew, true, "terminal new-run action should bypass the cached begin id");

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-defeated",
  run: createRunEnvelope({ mode: "pve", phase: "defeated", status: "defeated" })
});
html = panel.render();
assert.match(html, /试炼已结束/);
assert.match(html, /重新开始本模式/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-abandoned",
  run: createRunEnvelope({ mode: "pve", phase: "abandoned", status: "abandoned" })
});
html = panel.render();
assert.match(html, /试炼已放弃/);
assert.match(html, /路线留痕/);

const stableRunId = panel.lastRunMeta.runId;
panel.applyResult({
  success: true,
  suppressed: true,
  run: createRunEnvelope({ mode: "challenge", phase: "route", status: "active" })
}, { userId: "ui-user-001" });
assert.equal(panel.getCurrentMode(), "pve", "suppressed response must not switch the visible mode");
assert.equal(panel.lastRunMeta.runId, stableRunId, "suppressed response must not replace panel metadata");

panel.destroy();

const retryService = createServiceStub();
retryService.__setCurrentHandler(async () => ({
  success: false,
  reason: "network_timeout",
  message: "timeout"
}));
const retryPanel = new AuthoritativeRunPanel({
  service: retryService,
  getCurrentUserId: () => "ui-user-retry",
  requestRender: noop
});
await retryPanel.activate();
await retryPanel.activate();
assert.equal(retryService.__getCurrentCalls().length, 2, "failed first load should retry when the tab is re-entered");
retryPanel.destroy();

const modeService = createServiceStub();
modeService.__setCurrentHandler(async () => ({
  success: false,
  reason: "network_timeout",
  message: "timeout"
}));
const modePanel = new AuthoritativeRunPanel({
  service: modeService,
  getCurrentUserId: () => "ui-user-mode",
  requestRender: noop
});
modePanel.applyResult({
  success: true,
  run: createRunEnvelope({ mode: "pve", phase: "route", status: "active" })
}, { userId: "ui-user-mode" });
await modePanel.selectMode("challenge");
await modePanel.refreshProjection();
assert.equal(modeService.__getGetCalls().length, 0, "cross-mode refresh must not fetch the previous mode run id");
assert.equal(modeService.__getCurrentCalls().at(-1).mode, "challenge", "cross-mode refresh should query the selected mode");
assert.equal(modePanel.getCurrentMode(), "challenge", "failed cross-mode refresh must not snap back to the previous mode");
modePanel.destroy();

const ladderService = createServiceStub();
ladderService.__setCurrentHandler(async () => ({ success: true, run: null }));
ladderService.__setSettleHandler(async () => ({
  success: true,
  run: createRunEnvelope({
    mode: "challenge_ladder",
    phase: "completed",
    status: "settled",
    settledAt: Date.UTC(2026, 6, 11, 9, 0)
  })
}));
const ladderCalls = { current: 0, start: 0, submit: 0 };
const ladderState = {
  current: {
    rotation: { rotationId: "acl-2026-w28", title: "衡常试卷", attemptLimit: 3 },
    allowance: { attemptLimit: 3, usedAttempts: 1, remainingAttempts: 2 },
    personalBest: { officialScore: 613 },
    leaderboard: { myRank: { rank: 4 }, entries: [] },
    resumableAttempt: null
  },
  attempt: null,
  pending: null,
  lastError: null
};
const challengeLadderService = {
  getState: () => JSON.parse(JSON.stringify(ladderState)),
  subscribe: () => noop,
  current: async () => {
    ladderCalls.current += 1;
    return { success: true, ...ladderState.current };
  },
  start: async () => {
    ladderCalls.start += 1;
    return {
      success: true,
      run: createRunEnvelope({ mode: "challenge_ladder", phase: "route", status: "active" })
    };
  },
  submit: async () => {
    ladderCalls.submit += 1;
    return { success: true, result: { officialScore: 613 } };
  }
};
const ladderPanel = new AuthoritativeRunPanel({
  service: ladderService,
  challengeLadderService,
  getCurrentUserId: () => "ui-user-ladder",
  requestRender: noop
});
await ladderPanel.selectMode("challenge_ladder");
html = ladderPanel.render();
assert.match(html, /众生试炼/);
assert.match(html, /正式次数 2\/3/);
assert.match(html, /个人最佳 613/);
assert.match(html, /当前第 4 名/);
await ladderPanel.beginRun();
assert.equal(ladderCalls.start, 1, "challenge ladder must start through the ladder quota service");
assert.equal(ladderService.__getBeginCalls().length, 0, "challenge ladder must not bypass quota through generic authoritative start");
assert.equal(ladderCalls.current >= 3, true, "challenge ladder start should refresh the authoritative allowance snapshot");
const ladderSettlement = await ladderPanel.settleRun();
assert.equal(ladderService.__getSettleCalls().length, 1);
assert.equal(ladderCalls.submit, 1, "settled challenge ladder run must be projected into the formal leaderboard");
assert.equal(ladderSettlement.ladderSubmission.success, true);
const ladderCurrentCallsBeforeRecovery = ladderCalls.current;
await ladderPanel.refreshProjection();
assert.equal(ladderCalls.current, ladderCurrentCallsBeforeRecovery + 1, "ladder recovery must trigger current auto-projection before reloading the run");
ladderPanel.destroy();

console.log("Authoritative runs UI checks passed.");
