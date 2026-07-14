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

function createRunEnvelope({
  mode = "pve",
  phase = "route",
  status = "active",
  settledAt = 0,
  contentVersion = "authoritative-trials-v5",
  includeRouteContracts = true,
  playerHand = null,
  rewardChoices = null
} = {}) {
  const routeContracts = includeRouteContracts ? {
    steady: {
      version: 1,
      contractId: "steady",
      label: "稳进",
      riskTier: "low",
      riskLabel: "低风险",
      difficultyTier: "steady",
      difficultyLabel: "稳压",
      difficultyRating: 1,
      rewardTier: "standard",
      rewardLabel: "标准回报",
      difficultySummary: "敌方 24 HP · 招式不额外增压",
      rewardSummary: "标准构筑候选 · 不追加路线分",
      scoreBonus: 0
    },
    contested: {
      version: 1,
      contractId: "contested",
      label: "争衡",
      riskTier: "medium",
      riskLabel: "中风险",
      difficultyTier: "pressured",
      difficultyLabel: "增压",
      difficultyRating: 2,
      rewardTier: "enhanced",
      rewardLabel: "加码回报",
      difficultySummary: "敌方 39 HP · 攻击意图 +1 · 格挡意图 +1",
      rewardSummary: "标准构筑候选 · 调息 +1 / 固本 +1 · 通关路线分 +25",
      scoreBonus: 25
    },
    perilous: {
      version: 1,
      contractId: "perilous",
      label: "险锋",
      riskTier: "high",
      riskLabel: "高风险",
      difficultyTier: "severe",
      difficultyLabel: "高压",
      difficultyRating: 3,
      rewardTier: "premium",
      rewardLabel: "丰厚回报",
      difficultySummary: "敌方 44 HP · 攻击意图 +2 · 格挡意图 +2",
      rewardSummary: "额外 1 个卡牌候选 · 调息 +3 / 固本 +2 · 通关路线分 +55",
      scoreBonus: 55
    }
  } : null;
  const hand = Array.isArray(playerHand) ? playerHand : [
    { instanceId: "card-1", cardId: "strike", name: "破势", description: "造成 8 点伤害。", cost: 1 },
    { instanceId: "card-2", cardId: "guard", name: "守心", description: "获得 6 点格挡。", cost: 1 }
  ];
  const rewardChoiceList = Array.isArray(rewardChoices) ? rewardChoices : [
    { rewardId: "reward-card", kind: "card", name: "纳入「穿云」", description: "造成 13 点伤害。" },
    { rewardId: "reward-heal", kind: "heal", name: "调息", description: "回复 10 点生命。" }
  ];
  return {
    runId: `arun-${mode}-${phase}`,
    clientRunId: `client-${mode}-${phase}`,
    mode,
    status,
    protocolVersion: "authoritative-run-v2",
    contentVersion,
    contentHash: "ec26095949bfadf81a322f454b092ec96dbfe09199c607513ea3e2f44501b301",
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
      contentVersion: "authoritative-trials-v4",
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
        hand,
        drawPileCount: 4,
        discardPileCount: 3,
        deckSize: 9,
        deckCounts: { strike: 4, guard: 4, insight: 1 },
        upgradedDeckCounts: { guard: 1 },
        deckCrafting: {
          upgradedCount: 1,
          cardsRemoved: 1,
          minDeckSize: 8
        }
      },
      route: {
        stage: 2,
        totalStages: 3,
        choices: [
          {
            nodeId: "node-a",
            stage: 2,
            type: "elite",
            enemyId: "oath_guard",
            name: "天契守卫",
            threat: "精英",
            maxHp: 35,
            boss: false,
            routeContract: routeContracts ? routeContracts.contested : undefined
          },
          {
            nodeId: "node-b",
            stage: 2,
            type: "elite",
            enemyId: "mirror_seer",
            name: "照命术士",
            threat: "精英",
            maxHp: 34,
            boss: false,
            routeContract: routeContracts ? routeContracts.perilous : undefined
          }
        ],
        completedNodes: [
          {
            nodeId: "node-0",
            nodeType: "enemy",
            enemyId: "ink_scout",
            boss: false,
            routeContract: routeContracts ? routeContracts.steady : undefined
          }
        ]
      },
      battle: phase === "battle" ? {
        nodeId: "node-a",
        nodeType: "elite",
        routeContract: routeContracts ? routeContracts.contested : undefined,
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
        routeContract: routeContracts ? routeContracts.perilous : undefined,
        choices: rewardChoiceList
      } : null,
      stats: {
        turns: 5,
        cardsPlayed: 8,
        damageDealt: 44,
        damageTaken: 12,
        blockGained: 24,
        encountersWon: phase === "completed" || phase === "defeated" || phase === "abandoned" ? 3 : 1,
        bossWins: phase === "completed" ? 1 : 0,
        rewardsChosen: 1,
        cardsUpgraded: 1,
        cardsRemoved: 1
      },
      summary: ["completed", "defeated", "abandoned"].includes(phase) ? {
        result: phase === "completed" ? "completed" : phase,
        reason: phase === "completed" ? "boss_defeated" : phase === "defeated" ? "hp_depleted" : "player_abandoned",
        score: phase === "completed" ? 672 : 0,
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
        maxHp: 50,
        deckSize: 9,
        upgradedCards: 1,
        cardsRemoved: 1,
        scoreBreakdown: phase === "completed" && routeContracts ? {
          baseScore: 560,
          routeBonus: 80,
          scenarioMultiplierBps: 10500,
          finalScore: 672
        } : null,
        routeResolution: phase === "completed" && routeContracts ? {
          version: 1,
          totalBonus: 80,
          selections: [routeContracts.steady, routeContracts.contested, routeContracts.perilous]
        } : null
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
assert.match(html, /天道试炼/);
assert.match(html, /平衡试炼/);
assert.match(html, /开始本模式试炼/);
assert.match(html, /恢复本次历练/);

service.__setState({
  pending: { kind: "current" },
  projection: null,
  lastError: null
});
html = panel.render();
assert.match(html, /加载中/);
assert.match(html, /路线、战斗与奖励会保持原样/);

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
assert.match(html, /本轮规则已锁定/);
assert.match(html, /天道校验 已通过/);
assert.match(html, /常规战 · 墨痕斥候/);
assert.match(html, /路线合同/);
assert.match(html, /争衡/);
assert.match(html, /中风险/);
assert.match(html, /增压/);
assert.match(html, /烈度 2\/5/);
assert.match(html, /加码回报/);
assert.match(html, /敌方 39 HP · 攻击意图 \+1 · 格挡意图 \+1/);
assert.match(html, /路线分 \+25/);
assert.match(html, /选择此路/);
assert.match(html, /牌组 9 张/);
assert.match(html, /已精修 1 张/);
assert.match(html, /已裁牌 1 张/);
[
  "authoritative-runs-ui-test-route",
  "authoritative-run-v2",
  "state-hash-0001",
  "chain-head-0001",
  "ink_scout",
  "arun-pve-route",
  "contractId",
  "contested"
].forEach(value => assert.doesNotMatch(html, new RegExp(value), `player UI must not render internal value: ${value}`));

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-battle",
  action: {
    command: "play_card",
    acceptedAt: Date.UTC(2026, 6, 11, 8, 18),
    events: [{ type: "card_played", cardId: "strike", damage: 8, block: 0 }]
  },
  run: createRunEnvelope({
    mode: "pve",
    phase: "battle",
    status: "active",
    playerHand: [
      { instanceId: "card-1", cardId: "strike", name: "破势", description: "造成 8 点伤害。", cost: 1 },
      { instanceId: "card-2", cardId: "guard", name: "守心·极", description: "获得 8 点格挡。", cost: 1, upgraded: true }
    ]
  })
});
html = panel.render();
assert.match(html, /战斗投影/);
assert.match(html, /已选路线合同/);
assert.match(html, /争衡/);
assert.match(html, /敌方下一手意图/);
assert.match(html, /重裁 10/);
assert.match(html, /打出此牌/);
assert.match(html, /结束本回合/);
assert.match(html, /最近战况/);
assert.match(html, /卡牌已打出/);
assert.match(html, /已打出「破势」/);
assert.match(html, /守心·极/);
assert.match(html, /已精修/);
assert.match(html, /data-card-instance-id="card-2"/);
assert.match(html, /data-card-upgraded="true"/);
assert.doesNotMatch(html, /play_card|strike/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-reward",
  action: {
    command: "choose_reward",
    acceptedAt: Date.UTC(2026, 6, 11, 8, 22),
    events: [{ type: "reward_chosen", rewardKind: "upgrade_card", cardId: "strike", targetCardInstanceId: "card-17" }]
  },
  run: createRunEnvelope({
    mode: "expedition",
    phase: "reward",
    status: "active",
    rewardChoices: [
      {
        rewardId: "reward-upgrade-card-17",
        kind: "upgrade_card",
        cardId: "strike",
        targetCardInstanceId: "card-17",
        name: "精修「破势」",
        description: "造成 8 点伤害。 精修后：造成 10 点伤害。"
      },
      {
        rewardId: "reward-remove-card-29",
        kind: "remove_card",
        cardId: "guard",
        targetCardInstanceId: "card-29",
        name: "裁去「守心」",
        description: "从本次牌组永久移除此牌，牌组不会低于 8 张。"
      },
      {
        rewardId: "reward-heal",
        kind: "heal",
        name: "调息",
        description: "回复 10 点生命。"
      }
    ]
  })
});
html = panel.render();
assert.match(html, /战后奖励/);
assert.match(html, /已选路线合同/);
assert.match(html, /险锋/);
assert.match(html, /高风险/);
assert.match(html, /高压/);
assert.match(html, /丰厚回报/);
assert.match(html, /精修卡牌/);
assert.match(html, /裁去卡牌/);
assert.match(html, /精修目标：破势/);
assert.match(html, /裁牌目标：守心/);
assert.match(html, /精修这张牌/);
assert.match(html, /裁去这张牌/);
assert.match(html, /整备 5 HP/);
assert.match(html, /领取调息/);
assert.match(html, /已领取：精修「破势」/);
assert.match(html, /data-reward-kind="upgrade_card"/);
assert.match(html, /data-reward-kind="remove_card"/);
assert.match(html, /data-target-card-instance-id="card-17"/);
assert.match(html, /data-target-card-instance-id="card-29"/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-reward-remove-receipt",
  action: {
    command: "choose_reward",
    acceptedAt: Date.UTC(2026, 6, 11, 8, 23),
    events: [{ type: "reward_chosen", rewardKind: "remove_card", cardId: "guard", targetCardInstanceId: "card-29" }]
  },
  run: createRunEnvelope({
    mode: "expedition",
    phase: "reward",
    status: "active",
    rewardChoices: [
      {
        rewardId: "reward-upgrade-card-17",
        kind: "upgrade_card",
        cardId: "strike",
        targetCardInstanceId: "card-17",
        name: "精修「破势」",
        description: "造成 8 点伤害。 精修后：造成 10 点伤害。"
      },
      {
        rewardId: "reward-remove-card-29",
        kind: "remove_card",
        cardId: "guard",
        targetCardInstanceId: "card-29",
        name: "裁去「守心」",
        description: "从本次牌组永久移除此牌，牌组不会低于 8 张。"
      }
    ]
  })
});
html = panel.render();
assert.match(html, /已领取：裁去「守心」/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-legacy-card-receipt",
  action: {
    command: "choose_reward",
    acceptedAt: Date.UTC(2026, 6, 11, 8, 24),
    events: [{ type: "reward_chosen", rewardKind: "card" }]
  },
  run: createRunEnvelope({ mode: "pve", phase: "reward", status: "active" })
});
html = panel.render();
assert.match(html, /已领取：新卡牌/);
assert.doesNotMatch(html, /已领取：未知牌/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-completed",
  run: createRunEnvelope({ mode: "challenge", phase: "completed", status: "completed" })
});
html = panel.render();
assert.match(html, /待提交结算/);
assert.match(html, /路线分拆解/);
assert.match(html, /路线总分 \+80/);
assert.match(html, /基础分/);
assert.match(html, /路线分/);
assert.match(html, /场景系数/);
assert.match(html, /x1\.05/);
assert.match(html, /终局分/);
assert.match(html, /第 1 站路线合同/);
assert.match(html, /第 2 站路线合同/);
assert.match(html, /第 3 站路线合同/);
assert.match(html, /提交正式结算/);
assert.match(html, /只有全程校验通过时/);
assert.match(html, /终局牌组 9 张/);
assert.match(html, /精修 1 张/);
assert.match(html, /裁牌 1 张/);
assert.match(html, /data-deck-crafting-summary="true"/);
assert.match(html, /第 1 站 · 常规战 · 墨痕斥候/);
assert.match(html, /稳进/);
assert.doesNotMatch(html, /状态哈希|完整重放|arun-challenge-completed/);

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
assert.match(html, /天道校验/);
assert.match(html, /再开一局/);
assert.doesNotMatch(html, /arreceipt-settled-0001|这条 run/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-recovered-settlement",
  run: null,
  recoveryKind: "settlement_receipt",
  lastSettlement: createRunEnvelope({
    mode: "challenge",
    phase: "completed",
    status: "settled",
    settledAt: Date.UTC(2026, 6, 11, 8, 31)
  })
});
html = panel.render();
assert.match(html, /已结算归档/, "current recovery should preserve the settled run instead of clearing the panel");
assert.match(html, /结算回执/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-legacy-route",
  run: createRunEnvelope({
    mode: "pve",
    phase: "route",
    status: "active",
    contentVersion: "authoritative-trials-v4",
    includeRouteContracts: false
  })
});
html = panel.render();
assert.match(html, /路线选择/);
assert.match(html, /精英战 · 敌人上限 35 HP/);
assert.doesNotMatch(html, /路线合同|路线分拆解|第 1 站路线合同/);

const escapedRun = createRunEnvelope({ mode: "pve", phase: "route", status: "active" });
escapedRun.projection.route.choices[0].routeContract = {
  version: 1,
  contractId: "unsafe-contract",
  label: '<img src=x onerror=alert(1)>',
  riskLabel: '<script>alert("risk")</script>',
  difficultyTier: "unsafe",
  difficultyLabel: '高压 & "增伤"',
  difficultyRating: 5,
  rewardTier: "unsafe",
  rewardLabel: "</strong>奖励",
  difficultySummary: '敌方 <b>999 HP</b>',
  rewardSummary: '奖励 </div><script>alert("reward")</script>',
  scoreBonus: 99
};
panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-escape",
  run: escapedRun
});
html = panel.render();
assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.match(html, /&lt;script&gt;alert\(&quot;risk&quot;\)&lt;\/script&gt;/);
assert.match(html, /高压 &amp; &quot;增伤&quot;/);
assert.match(html, /敌方 &lt;b&gt;999 HP&lt;\/b&gt;/);
assert.match(html, /奖励 &lt;\/div&gt;&lt;script&gt;alert\(&quot;reward&quot;\)&lt;\/script&gt;/);
assert.doesNotMatch(html, /<img|<script|<\/div><script>/);

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
assert.match(html, /生命耗尽/);
assert.match(html, /重新开始本模式/);

panel.applyResult({
  success: true,
  reportVersion: "authoritative-runs-ui-test-abandoned",
  run: createRunEnvelope({ mode: "pve", phase: "abandoned", status: "abandoned" })
});
html = panel.render();
assert.match(html, /试炼已放弃/);
assert.match(html, /路线留痕/);
assert.match(html, /常规战 · 墨痕斥候/);

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

const riftRunService = createServiceStub();
riftRunService.__setCurrentHandler(async () => ({ success: true, run: null }));
riftRunService.__setSettleHandler(async () => ({
  success: true,
  run: createRunEnvelope({
    mode: "world_rift",
    phase: "completed",
    status: "settled",
    settledAt: Date.UTC(2026, 6, 11, 10, 0)
  })
}));
const riftCalls = { current: 0, start: 0, submit: 0 };
const riftState = {
  current: {
    rotation: { rotationId: "rift-2026-w28", title: "天穹灾潮", attemptLimit: 5, totalHp: 10000 },
    allowance: { attemptLimit: 5, usedAttempts: 1, remainingAttempts: 4 },
    world: { currentPhaseIndex: 1, phaseTitle: "噬界核心", totalHp: 10000, appliedDamage: 3200, remainingHp: 6800, stateVersion: 8 },
    personal: { rankedContribution: 1870 },
    resumableAttempt: null
  },
  world: null,
  contribution: null,
  leaderboard: { myRank: { rank: 6 }, entries: [] },
  attempt: null,
  pending: null,
  lastError: null
};
const worldRiftService = {
  getState: () => JSON.parse(JSON.stringify(riftState)),
  subscribe: () => noop,
  current: async () => {
    riftCalls.current += 1;
    return { success: true, ...riftState.current };
  },
  start: async () => {
    riftCalls.start += 1;
    return {
      success: true,
      run: createRunEnvelope({ mode: "world_rift", phase: "route", status: "active" })
    };
  },
  submit: async () => {
    riftCalls.submit += 1;
    return { success: true, contribution: { contribution: 1870, appliedDamage: 1870, stateVersion: 9 } };
  }
};
const riftPanel = new AuthoritativeRunPanel({
  service: riftRunService,
  worldRiftService,
  getCurrentUserId: () => "ui-user-rift",
  requestRender: noop
});
await riftPanel.selectMode("world_rift");
html = riftPanel.render();
assert.match(html, /天穹裂隙/);
assert.match(html, /正式次数 4\/5/);
assert.match(html, /噬界核心 · 剩余 6800\/10000/);
assert.match(html, /最佳三次 1870/);
await riftPanel.beginRun();
assert.equal(riftCalls.start, 1, "world rift must start through the shared-world quota service");
assert.equal(riftRunService.__getBeginCalls().length, 0, "world rift must not bypass quota through generic authoritative start");
const riftSettlement = await riftPanel.settleRun();
assert.equal(riftRunService.__getSettleCalls().length, 1);
assert.equal(riftCalls.submit, 1, "settled world-rift run must be projected into shared world state");
assert.equal(riftSettlement.riftSubmission.success, true);
const riftCurrentCallsBeforeRecovery = riftCalls.current;
await riftPanel.refreshProjection();
assert.equal(riftCalls.current, riftCurrentCallsBeforeRecovery + 1, "world-rift recovery must auto-project before reloading the run");
riftPanel.destroy();

console.log("Authoritative runs UI checks passed.");
