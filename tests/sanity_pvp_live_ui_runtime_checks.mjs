import assert from 'node:assert';

const documentListeners = new Map();
const windowListeners = new Map();
const localStorageState = new Map();

function addListener(registry, type, listener) {
  if (!registry.has(type)) registry.set(type, []);
  registry.get(type).push(listener);
}

function dispatchListeners(registry, type, event = {}) {
  const listeners = registry.get(type) || [];
  listeners.forEach(listener => listener({ type, ...event }));
}

const documentStub = {
  hidden: false,
  addEventListener(type, listener) {
    addListener(documentListeners, type, listener);
  },
  createElement() {
    return {
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild() {},
      querySelector() { return null; },
      querySelectorAll() { return []; }
    };
  },
  body: { appendChild() {} },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; }
};

let nextTimerId = 1;
const scheduledIntervals = [];
const clearedTimers = [];

globalThis.document = documentStub;
globalThis.window = {
  addEventListener(type, listener) {
    addListener(windowListeners, type, listener);
  },
  removeEventListener() {},
  setInterval(callback, intervalMs) {
    const id = nextTimerId;
    nextTimerId += 1;
    scheduledIntervals.push({ id, callback, intervalMs });
    return id;
  },
  clearInterval(id) {
    clearedTimers.push(id);
  }
};
globalThis.localStorage = {
  getItem(key) {
    return localStorageState.has(key) ? localStorageState.get(key) : null;
  },
  setItem(key, value) {
    localStorageState.set(key, String(value));
  },
  removeItem(key) {
    localStorageState.delete(key);
  }
};
globalThis.window.localStorage = globalThis.localStorage;

const { PVPScene } = await import('../js/scenes/pvp-scene.js');
const { PVPService } = await import('../js/services/pvp-service.js');
const originalRenderLivePanel = PVPScene.renderLivePanel;

PVPScene.getLiveSession = () => ({
  getState: () => ({
    phase: 'active',
    matchId: 'pvpm-ui-runtime-realtime',
    seatId: 'A',
    realtimeStatus: 'reconnecting',
    lastRealtimeSyncAt: 1781871234567,
    realtimeReport: {
      connectionId: 'ws-runtime-1',
      heartbeatIntervalMs: 1200
    },
    lastError: {
      reason: 'live_ws_reconnecting',
      message: '实时论道 WS 正在重连'
    },
    stateView: {
      matchId: 'pvpm-ui-runtime-realtime',
      status: 'active',
      stateVersion: 8,
      currentSeat: 'A',
      connectionReport: {
        heartbeatIntervalMs: 1200
      }
    }
  })
});

localStorageState.set('the-defier:pvp-live-social-preferences:v1', JSON.stringify({ socialMuted: true }));
PVPScene.liveSocialMuted = false;
PVPScene.liveSocialPreferencesLoaded = false;
PVPScene.loadLiveSocialPreferences();
assert.equal(PVPScene.liveSocialMuted, true, 'live social mute preference should load from local storage');
const persistedMuteSnapshot = PVPScene.getLiveSnapshot();
assert.equal(persistedMuteSnapshot.social.muted, true, 'live snapshot should expose persisted local social mute');
assert.equal(persistedMuteSnapshot.social.preferenceScope, 'local_only', 'live social preference should be scoped to local display only');
assert.equal(persistedMuteSnapshot.social.sourceVisibility, 'local_preference', 'live social preference should be marked as local visibility state');
assert.equal(persistedMuteSnapshot.social.rankedImpact, 'none', 'live social preference should not affect ranked state');
PVPScene.toggleLiveSocialMute();
assert.equal(PVPScene.liveSocialMuted, false, 'toggle should update in-memory social mute preference');
assert.match(
  localStorageState.get('the-defier:pvp-live-social-preferences:v1') || '',
  /"socialMuted":false/,
  'toggle should persist social mute preference for the next session',
);

const realtimeSnapshot = PVPScene.getLiveSnapshot();
assert.equal(realtimeSnapshot.realtimeStatus, 'reconnecting', 'live snapshot should expose local realtime reconnecting status');
assert.equal(realtimeSnapshot.lastRealtimeSyncAt, 1781871234567, 'live snapshot should expose last local realtime sync timestamp');
assert.deepEqual(
  realtimeSnapshot.realtimeReport,
  { connectionId: 'ws-runtime-1', heartbeatIntervalMs: 1200 },
  'live snapshot should expose cloned local realtime report for text renderers',
);
assert.equal(
  realtimeSnapshot.lastError.reason,
  'live_ws_reconnecting',
  'live snapshot should preserve local realtime reconnect reason for UI diagnostics',
);

const normalizedActionReceipt = PVPScene.getLiveActionReceiptReport({
  actionReceiptReport: {
    reportVersion: 'pvp-live-action-receipt-v1',
    sourceVisibility: 'authoritative_public_projection',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    actingSeat: 'A',
    actionType: 'play_card',
    cardName: '破阵爆发',
    summaryLine: 'A 打出破阵爆发：预算后 18，破盾 3，生命伤害 15，B 剩余 35 血。',
    damage: {
      targetSeat: 'B',
      rawDamage: 19,
      budgetedDamage: 18,
      preventedByBudget: 1,
      blockedDamage: 3,
      hpDamage: 15,
      targetHpAfter: 35
    },
    openingProtection: {
      triggered: false,
      protectedSeat: '',
      minimumHp: 1,
      preventedDamage: 0
    },
    safeguards: ['public_events', 'first_action_budget', 'public_block']
  }
});
assert.equal(normalizedActionReceipt.reportVersion, 'pvp-live-action-receipt-v1', 'live UI should normalize action receipt report');
assert.equal(normalizedActionReceipt.damage.hpDamage, 15, 'live UI action receipt should preserve public HP damage');
assert.equal(normalizedActionReceipt.damage.targetHpAfter, 35, 'live UI action receipt should preserve public target HP');
assert.equal(normalizedActionReceipt.sourceVisibility, 'authoritative_public_projection', 'live UI action receipt should preserve authoritative public projection source');
assert.equal(normalizedActionReceipt.usesHiddenInformation, false, 'live UI action receipt should preserve hidden-info boundary');
const renderedActionReceipt = PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: normalizedActionReceipt });
assert.match(renderedActionReceipt, /行动回执/, 'live UI should render action receipt heading');
assert.match(renderedActionReceipt, /预算后 18/, 'live UI action receipt should render budgeted damage');
assert.match(renderedActionReceipt, /破盾 3/, 'live UI action receipt should render block absorption');
assert.match(renderedActionReceipt, /生命伤害 15/, 'live UI action receipt should render HP damage');
assert.match(renderedActionReceipt, /data-live-action-budget-clamp="public_first_action_budget"/, 'live UI action receipt should expose the public first-action budget clamp marker');
assert.match(renderedActionReceipt, /首动预算挡下 1/, 'live UI action receipt should explain how much damage the first-action budget prevented');
assert.match(renderedActionReceipt, /data-live-action-survival="public_damage_survival"/, 'live UI action receipt should expose a stable surviving damage marker');
assert.match(renderedActionReceipt, /data-live-action-survival-target="B"/, 'live UI action receipt should expose the public surviving target seat');
assert.match(renderedActionReceipt, /data-live-action-survival-hp-after="35"/, 'live UI action receipt should expose the public target HP after resolved damage');
assert.match(renderedActionReceipt, /data-live-action-survival-source="authoritative_public_projection"/, 'live UI action survival receipt should expose public source');
assert.match(renderedActionReceipt, /data-live-action-survival-hidden="false"/, 'live UI action survival receipt should mark hidden-info safe');
assert.match(renderedActionReceipt, /data-live-action-survival-impact="none"/, 'live UI action survival receipt should mark no ranked impact');
assert.match(renderedActionReceipt, /承伤回执|B 剩余 35 血|对局继续/, 'live UI action receipt should explain resolved surviving damage as a continuing duel state');
assert.match(renderedActionReceipt, /权威公开投影/, 'live UI action receipt should render accurate projection source');
assert.doesNotMatch(renderedActionReceipt, /payload|cardInstanceId|sourceCardId|\bhand\b|hand":\[|deck|loadoutSnapshot|rating|reward|token/i, 'live UI action receipt rendering must not expose hidden ids, payloads, decks, rewards, or tokens');
const renderedTerminalDamageReceipt = PVPScene.renderLiveActionReceiptReport({
  actionReceiptReport: {
    ...normalizedActionReceipt,
    summaryLine: 'A 打出破阵爆发：预算后 18，破盾 0，生命伤害 18，B 剩余 0 血。',
    damage: {
      ...normalizedActionReceipt.damage,
      blockedDamage: 0,
      hpDamage: 18,
      targetHpAfter: 0
    }
  }
});
assert.match(renderedTerminalDamageReceipt, /data-live-action-terminal="public_terminal_damage"/, 'live UI terminal damage receipt should expose a stable public terminal marker');
assert.match(renderedTerminalDamageReceipt, /data-live-action-terminal-target="B"/, 'live UI terminal damage receipt should expose the public defeated target seat');
assert.match(renderedTerminalDamageReceipt, /data-live-action-terminal-hp-after="0"/, 'live UI terminal damage receipt should expose public zero HP');
assert.match(renderedTerminalDamageReceipt, /data-live-action-terminal-source="authoritative_public_projection"/, 'live UI terminal damage receipt should expose public source');
assert.match(renderedTerminalDamageReceipt, /data-live-action-terminal-hidden="false"/, 'live UI terminal damage receipt should mark hidden-info safe');
assert.match(renderedTerminalDamageReceipt, /data-live-action-terminal-impact="none"/, 'live UI terminal damage receipt should mark no ranked impact');
assert.match(renderedTerminalDamageReceipt, /终局回执|B 归零|公开伤害结算结束本局/, 'live UI terminal damage receipt should explain public lethal damage without hidden information');
assert.doesNotMatch(renderedTerminalDamageReceipt, /data-live-action-survival|public_damage_survival|对局继续/, 'live UI terminal damage receipt must not also render a survival receipt');
assert.doesNotMatch(renderedTerminalDamageReceipt, /payload|cardInstanceId|sourceCardId|\bhand\b|hand":\[|deck|loadoutSnapshot|rating|reward|token/i, 'live UI terminal damage receipt rendering must not expose hidden ids, hands, decks, rewards, or tokens');
const renderedHiddenTerminalDamageReceipt = PVPScene.renderLiveActionReceiptReport({
  actionReceiptReport: {
    ...normalizedActionReceipt,
    usesHiddenInformation: true,
    damage: {
      ...normalizedActionReceipt.damage,
      hpDamage: 18,
      targetHpAfter: 0
    }
  }
});
assert.doesNotMatch(renderedHiddenTerminalDamageReceipt, /data-live-action-terminal|public_terminal_damage|终局回执/, 'live UI must not render terminal damage chip for hidden-info receipts');
const renderedIncompleteTerminalDamageReceipt = PVPScene.renderLiveActionReceiptReport({
  actionReceiptReport: {
    ...normalizedActionReceipt,
    summaryLine: 'A 打出破阵爆发：预算后 18，破盾 0，生命伤害 18。',
    damage: {
      targetSeat: 'B',
      rawDamage: 18,
      budgetedDamage: 18,
      preventedByBudget: 0,
      blockedDamage: 0,
      hpDamage: 18
    }
  }
});
assert.doesNotMatch(renderedIncompleteTerminalDamageReceipt, /data-live-action-terminal|public_terminal_damage|终局回执/, 'live UI must not infer terminal damage from missing target HP evidence');
const renderedNullTerminalDamageReceipt = PVPScene.renderLiveActionReceiptReport({
  actionReceiptReport: {
    ...normalizedActionReceipt,
    summaryLine: 'A 打出破阵爆发：预算后 18，破盾 0，生命伤害 18。',
    damage: {
      ...normalizedActionReceipt.damage,
      blockedDamage: 0,
      hpDamage: 18,
      targetHpAfter: null
    }
  }
});
assert.doesNotMatch(renderedNullTerminalDamageReceipt, /data-live-action-terminal|public_terminal_damage|终局回执/, 'live UI must not infer terminal damage from null target HP evidence');
const renderedInvalidTerminalDamageReceipt = PVPScene.renderLiveActionReceiptReport({
  actionReceiptReport: {
    ...normalizedActionReceipt,
    summaryLine: 'A 打出破阵爆发：预算后 18，破盾 0，生命伤害 18。',
    damage: {
      ...normalizedActionReceipt.damage,
      blockedDamage: 0,
      hpDamage: 18,
      targetHpAfter: 'not-a-number'
    }
  }
});
assert.doesNotMatch(renderedInvalidTerminalDamageReceipt, /data-live-action-terminal|public_terminal_damage|终局回执/, 'live UI must not infer terminal damage from non-finite target HP evidence');
const renderedExplicitlyUnprovenTerminalDamageReceipt = PVPScene.renderLiveActionReceiptReport({
  actionReceiptReport: {
    ...normalizedActionReceipt,
    summaryLine: 'A 打出破阵爆发：预算后 18，破盾 0，生命伤害 18。',
    damage: {
      ...normalizedActionReceipt.damage,
      blockedDamage: 0,
      hpDamage: 18,
      targetHpAfter: 0,
      hasTargetHpAfter: false
    }
  }
});
assert.doesNotMatch(renderedExplicitlyUnprovenTerminalDamageReceipt, /data-live-action-terminal|public_terminal_damage|终局回执/, 'live UI must respect explicit unproven target HP evidence from the server');

const normalizedCardDrawReceipt = PVPScene.getLiveActionReceiptReport({
  actionReceiptReport: {
    reportVersion: 'pvp-live-action-receipt-v1',
    sourceVisibility: 'authoritative_public_projection',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    actingSeat: 'A',
    actionType: 'play_card',
    latestSequence: 12,
    cardName: '疾电步',
    cardDraw: {
      seatId: 'A',
      count: 1,
      handCount: 4,
      deckCount: 9,
      capped: false,
      sourceCardId: 'surgeStep',
      effect: 'draw_tag'
    },
    summaryLine: 'A 打出疾电步：不造成伤害；自身护盾 +6；抽滤 1 张，当前手牌 4。',
    safeguards: ['public_events', 'self_block', 'public_card_cycle']
  }
});
assert.equal(normalizedCardDrawReceipt.cardDraw.count, 1, 'live UI should preserve public card cycle count');
assert.equal(normalizedCardDrawReceipt.cardDraw.handCount, 4, 'live UI should preserve public card cycle hand count');
assert.equal(normalizedCardDrawReceipt.cardDraw.deckCount, 9, 'live UI should preserve public card cycle deck count');
assert.equal(normalizedCardDrawReceipt.cardDraw.capped, false, 'live UI should preserve public card cycle cap state');
assert.equal(Object.prototype.hasOwnProperty.call(normalizedCardDrawReceipt.cardDraw, 'effect'), false, 'live UI card cycle receipt must not retain internal effect tags');
const renderedCardDrawReceipt = PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: normalizedCardDrawReceipt });
assert.match(renderedCardDrawReceipt, /抽滤 1 张/, 'live UI action receipt should render readable card cycle text');
assert.match(renderedCardDrawReceipt, /data-live-card-cycle="public_card_cycle"/, 'live UI card cycle receipt should expose a stable public-card-cycle marker');
assert.doesNotMatch(renderedCardDrawReceipt, /sourceCardId|cardId|instanceId|draw_tag|rating|reward/i, 'live UI card cycle receipt rendering must not expose hidden ids, effect tags, or rewards');

const normalizedGuardStanceReceipt = PVPScene.getLiveActionReceiptReport({
  actionReceiptReport: {
    reportVersion: 'pvp-live-action-receipt-v1',
    sourceVisibility: 'authoritative_public_projection',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    actingSeat: 'A',
    actionType: 'play_card',
    latestSequence: 13,
    cardName: '护体诀',
    statusEffects: {
      applied: [{
        statusId: 'guard_stance',
        label: '守势',
        seatId: 'A',
        sourceSeat: 'A',
        mitigationAmount: 2,
        responseWindow: 'next_incoming_attack'
      }]
    },
    summaryLine: 'A 打出护体诀：不造成伤害；自身护盾 +7；进入守势，下次生命伤害 -2。',
    safeguards: ['public_events', 'self_block', 'public_guard_stance']
  }
});
assert.equal(normalizedGuardStanceReceipt.statusEffects.applied[0].mitigationAmount, 2, 'live UI should preserve public guard stance mitigation amount');
const renderedGuardStanceReceipt = PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: normalizedGuardStanceReceipt });
assert.match(renderedGuardStanceReceipt, /守势|减伤/, 'live UI action receipt should render public guard stance setup');
assert.match(renderedGuardStanceReceipt, /data-live-guard-stance="public_guard_stance"/, 'live UI guard stance receipt should expose a stable marker');
assert.doesNotMatch(renderedGuardStanceReceipt, /sourceCardId|cardId|instanceId|hand|deck|rating|reward/i, 'live UI guard stance receipt rendering must not expose hidden ids or rewards');

const normalizedHealReceipt = PVPScene.getLiveActionReceiptReport({
  actionReceiptReport: {
    reportVersion: 'pvp-live-action-receipt-v1',
    sourceVisibility: 'authoritative_public_projection',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    actingSeat: 'A',
    actionType: 'play_card',
    latestSequence: 14,
    cardName: '内心平和',
    healing: {
      seatId: 'A',
      recoveredHp: 3,
      hp: 41,
      maxHp: 50,
      capped: false,
      sourceCardId: 'innerPeace'
    },
    summaryLine: 'A 打出内心平和：不造成伤害；自身护盾 +4；自身恢复 +3，当前 41/50。',
    safeguards: ['public_events', 'self_block', 'public_heal']
  }
});
assert.equal(normalizedHealReceipt.healing.recoveredHp, 3, 'live UI should preserve public heal amount');
assert.equal(normalizedHealReceipt.healing.hp, 41, 'live UI should preserve public post-heal hp');
assert.equal(Object.prototype.hasOwnProperty.call(normalizedHealReceipt.healing, 'sourceCardId'), false, 'live UI heal receipt must not retain internal card id');
const renderedHealReceipt = PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: normalizedHealReceipt });
assert.match(renderedHealReceipt, /恢复 \+3|回血 \+3/, 'live UI action receipt should render readable public heal feedback');
assert.match(renderedHealReceipt, /data-live-hp-recovered="public_hp_recovered"/, 'live UI heal receipt should expose a stable public-hp-recovered marker');
assert.doesNotMatch(renderedHealReceipt, /sourceCardId|cardId|instanceId|hand|deck|rating|reward/i, 'live UI heal receipt rendering must not expose hidden ids or rewards');
const normalizedHealPreview = PVPScene.getLiveActionPreviewReport({
  actionPreviewReport: {
    reportVersion: 'pvp-live-action-preview-v1',
    sourceVisibility: 'viewer_public_state',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    currentSeat: 'A',
    isViewerTurn: true,
    playableCards: [{
      cardInstanceId: 'A-innerPeace-preview',
      cardName: '内心平和',
      targetSeat: 'B',
      rawDamage: 0,
      damageBudget: 18,
      budgetedDamage: 0,
      blockedDamage: 0,
      hpDamage: 0,
      targetHpAfter: 50,
      blockGain: 4,
      healing: {
        amount: 3,
        recoveredHp: 3,
        hpBefore: 38,
        hpAfter: 41,
        maxHp: 50,
        capped: false,
        sourceCardId: 'innerPeace'
      }
    }]
  }
});
assert.equal(normalizedHealPreview.playableCards[0].healing.recoveredHp, 3, 'live UI preview should preserve public heal amount');
assert.equal(Object.prototype.hasOwnProperty.call(normalizedHealPreview.playableCards[0].healing, 'sourceCardId'), false, 'live UI heal preview must not retain internal card id');
assert.match(PVPScene.formatLiveActionPreviewLine(normalizedHealPreview.playableCards[0]), /自身恢复 3|预计 41\/50/, 'live UI preview fallback should explain public healing before second-click confirm');

const normalizedEndTurnReceipt = PVPScene.getLiveActionReceiptReport({
  actionReceiptReport: {
    reportVersion: 'pvp-live-action-receipt-v1',
    sourceVisibility: 'authoritative_public_projection',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'B',
    actingSeat: 'A',
    actionType: 'end_turn',
    latestSequence: 9,
    nextSeat: 'B',
    completedTurns: 1,
    roundIndex: 1,
    turnIndex: 2,
    draw: { seatId: 'B', count: 3, capped: false },
    counterplay: {
      granted: true,
      seatId: 'B',
      block: 8,
      totalBlock: 8,
      minimumHp: 1
    },
    summaryLine: 'A 结束回合：行动权交给 B，B 抽 3 张；反打缓冲 +8 给 B。',
    safeguards: ['public_events', 'counterplay_granted']
  }
});
const renderedEndTurnReceipt = PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: normalizedEndTurnReceipt });
assert.equal(normalizedEndTurnReceipt.actionType, 'end_turn', 'live UI should preserve end-turn action receipt type');
assert.equal(normalizedEndTurnReceipt.nextSeat, 'B', 'live UI should preserve public next-seat handoff');
assert.equal(normalizedEndTurnReceipt.counterplay.block, 8, 'live UI should preserve public counterplay block on handoff receipt');
assert.match(renderedEndTurnReceipt, /交权回执/, 'live UI should label end-turn receipts as handoff receipts');
assert.match(renderedEndTurnReceipt, /行动权交给 B/, 'live UI end-turn receipt should render handoff seat');
assert.match(renderedEndTurnReceipt, /抽 3 张/, 'live UI end-turn receipt should render public draw count');
assert.match(renderedEndTurnReceipt, /反打缓冲 \+8/, 'live UI end-turn receipt should render public counterplay grant');
assert.match(renderedEndTurnReceipt, /data-live-action-turn-handoff="public_turn_handoff"/, 'live UI end-turn receipt should expose a stable public turn handoff marker');
assert.match(renderedEndTurnReceipt, /data-live-action-turn-handoff-next-seat="B"/, 'live UI end-turn receipt should expose the public next seat in the handoff chip');
assert.match(renderedEndTurnReceipt, /data-live-action-turn-handoff-draw-count="3"/, 'live UI end-turn receipt should expose the public draw count in the handoff chip');
assert.match(renderedEndTurnReceipt, /data-live-action-turn-handoff-counterplay-block="8"/, 'live UI end-turn receipt should expose the public counterplay block in the handoff chip');
assert.match(renderedEndTurnReceipt, /data-live-action-turn-handoff-source="authoritative_public_projection"/, 'live UI end-turn receipt should expose public handoff source');
assert.match(renderedEndTurnReceipt, /data-live-action-turn-handoff-hidden="false"/, 'live UI end-turn receipt should mark the handoff chip hidden-info safe');
assert.match(renderedEndTurnReceipt, /data-live-action-turn-handoff-impact="none"/, 'live UI end-turn receipt should mark the handoff chip no-impact');
assert.match(renderedEndTurnReceipt, /接手回执|B 接手|抽 3|反打缓冲 \+8/, 'live UI end-turn receipt should explain public draw and counterplay resources as the next player takes the turn');
assert.doesNotMatch(renderedEndTurnReceipt, /cardInstanceId|sourceCardId|\bhand\b|hand":\[|deck|loadoutSnapshot|rating|reward|token/i, 'live UI end-turn receipt rendering must not expose hidden ids, hands, decks, rewards, or tokens');
const renderedPlayCardWithNextSeat = PVPScene.renderLiveActionReceiptReport({
  actionReceiptReport: {
    ...normalizedEndTurnReceipt,
    actionType: 'play_card',
    summaryLine: 'A 打出试探斩：生命伤害 5，B 剩余 45 血。',
    damage: { targetSeat: 'B', hpDamage: 5, targetHpAfter: 45 }
  }
});
assert.doesNotMatch(renderedPlayCardWithNextSeat, /data-live-action-turn-handoff|public_turn_handoff|接手回执/, 'live UI must not render public turn handoff chip for play-card receipts even if a nextSeat field is present');
const renderedHiddenEndTurnReceipt = PVPScene.renderLiveActionReceiptReport({
  actionReceiptReport: {
    ...normalizedEndTurnReceipt,
    usesHiddenInformation: true,
    summaryLine: 'A 结束回合：行动权交给 B。'
  }
});
assert.doesNotMatch(renderedHiddenEndTurnReceipt, /data-live-action-turn-handoff|public_turn_handoff|接手回执/, 'live UI must not render public turn handoff chip for hidden-info end-turn receipts');
const normalizedStatusHandoffReceipt = PVPScene.getLiveActionReceiptReport({
  actionReceiptReport: {
    reportVersion: 'pvp-live-action-receipt-v1',
    sourceVisibility: 'authoritative_public_projection',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    actingSeat: 'B',
    actionType: 'end_turn',
    latestSequence: 18,
    nextSeat: 'A',
    draw: { seatId: 'A', count: 3, capped: false },
    counterplay: { granted: false, seatId: '', block: 0, totalBlock: 0, minimumHp: 0 },
    handoffRisk: {
      active: true,
      riskState: 'status_response_handoff',
      seatId: 'B',
      nextSeat: 'A',
      statusCount: 1,
      statuses: [{
        statusId: 'vulnerable_mark',
        label: '破绽',
        seatId: 'B',
        sourceSeat: 'A',
        responseWindow: 'defender_turn_before_payoff',
        cardInstanceId: 'hidden-status-source'
      }],
      summaryLine: 'B 结束回合时破绽仍在；行动权交给 A 后，对手下一轮可能兑现。',
      token: 'hidden-token'
    },
    summaryLine: 'B 结束回合：行动权交给 A，A 抽 3 张；破绽仍在，后续可能被兑现。',
    safeguards: ['public_events', 'public_status_handoff_risk']
  }
});
const renderedStatusHandoffReceipt = PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: normalizedStatusHandoffReceipt });
assert.equal(normalizedStatusHandoffReceipt.handoffRisk.active, true, 'live UI should preserve public handoff risk activity');
assert.equal(normalizedStatusHandoffReceipt.handoffRisk.riskState, 'status_response_handoff', 'live UI should preserve public handoff risk state');
assert.equal(normalizedStatusHandoffReceipt.handoffRisk.statusCount, 1, 'live UI should preserve unresolved public status count');
assert.equal(normalizedStatusHandoffReceipt.handoffRisk.statuses[0].statusId, 'vulnerable_mark', 'live UI should preserve unresolved public status id');
assert.equal(Object.prototype.hasOwnProperty.call(normalizedStatusHandoffReceipt.handoffRisk.statuses[0], 'cardInstanceId'), false, 'live UI handoff risk status must drop hidden card instance ids');
assert.equal(Object.prototype.hasOwnProperty.call(normalizedStatusHandoffReceipt.handoffRisk, 'token'), false, 'live UI handoff risk must drop hidden token fields');
assert.match(renderedStatusHandoffReceipt, /data-live-action-handoff-risk="status_response_handoff"/, 'live UI should render a stable public handoff risk marker');
assert.match(renderedStatusHandoffReceipt, /data-live-action-handoff-risk-state="status_response_handoff"/, 'live UI should render public handoff risk state');
assert.match(renderedStatusHandoffReceipt, /data-live-action-handoff-risk-source="authoritative_public_projection"/, 'live UI should render handoff risk public source');
assert.match(renderedStatusHandoffReceipt, /data-live-action-handoff-risk-hidden="false"/, 'live UI should mark handoff risk as hidden-info safe');
assert.match(renderedStatusHandoffReceipt, /data-live-action-handoff-risk-impact="none"/, 'live UI should mark handoff risk as no ranked impact');
assert.match(renderedStatusHandoffReceipt, /data-live-action-handoff-risk-safeguard="public_status_handoff_risk"/, 'live UI should render handoff risk safeguard marker');
assert.match(renderedStatusHandoffReceipt, /交权风险|破绽仍在|行动权交给 A|后续兑现/, 'live UI should explain the public response-window handoff consequence');
assert.doesNotMatch(renderedStatusHandoffReceipt, /cardInstanceId|sourceCardId|\bhand\b|hand":\[|deck|rating|reward|token/i, 'live UI handoff risk rendering must not expose hidden ids, cards, rewards, or tokens');

assert.equal(
  PVPScene.getLiveLastSeenEventRevision({
    stateView: { recentEvents: [{ eventType: 'battle_started', sequence: 2 }] },
    lastEvents: [{ eventType: 'card_played', sequence: 7 }]
  }),
  7,
  'getLiveLastSeenEventRevision should prefer replay event high-water marks when reconnecting',
);

const localGraceConnectionCopy = PVPScene.formatLiveConnectionStatus({
  connectionReport: {
    reportVersion: 'pvp-live-connection-v1',
    viewerSeat: 'A',
    opponentSeat: 'B',
    heartbeatIntervalMs: 1000,
    heartbeatStaleMs: 1000,
    graceMs: 30000,
    viewer: { seatId: 'A', status: 'grace', isViewer: true, remainingGraceMs: 12700 },
    opponent: { seatId: 'B', status: 'online', isViewer: false, remainingGraceMs: 0 }
  }
});
assert.match(localGraceConnectionCopy, /我方重连宽限 13s/, 'live UI local reconnect grace exposes remaining countdown');
assert.match(localGraceConnectionCopy, /自动恢复|恢复权威连接|切回页面/, 'live UI local reconnect grace should give explicit recovery guidance');
assert.doesNotMatch(localGraceConnectionCopy, /行动倒计时|准备倒计时/, 'live UI local reconnect grace keeps timeout copy off the turn timer');

const localDisconnectedConnectionCopy = PVPScene.formatLiveConnectionStatus({
  connectionReport: {
    reportVersion: 'pvp-live-connection-v1',
    viewerSeat: 'A',
    opponentSeat: 'B',
    heartbeatIntervalMs: 1000,
    heartbeatStaleMs: 1000,
    graceMs: 30000,
    viewer: { seatId: 'A', status: 'disconnected', isViewer: true, remainingGraceMs: 0 },
    opponent: { seatId: 'B', status: 'online', isViewer: false, remainingGraceMs: 0 }
  }
});
assert.match(localDisconnectedConnectionCopy, /我方断线/, 'live UI local disconnected state should name the viewer as disconnected');
assert.match(localDisconnectedConnectionCopy, /刷新同步权威结果|同步权威结果/, 'live UI local disconnected state prefers authoritative sync guidance before connection timeout settlement');
assert.match(localDisconnectedConnectionCopy, /仍在可恢复窗口会自动重连/, 'live UI local disconnected state keeps recovery conditional');
assert.match(localDisconnectedConnectionCopy, /权威|连接超时|超时结算/, 'live UI local disconnected state should explain authoritative terminal boundary in player copy');
assert.doesNotMatch(localDisconnectedConnectionCopy, /connection_timeout|turn_timeout|ranked_authoritative|swap_sides|forfeit_disconnect/, 'live UI local disconnected state should not expose internal protocol codes');

const localDisconnectedTempoMarkup = PVPScene.renderLiveConnectionTempo({
  status: 'active',
  currentSeat: 'A',
  connectionReport: {
    reportVersion: 'pvp-live-connection-v1',
    viewerSeat: 'A',
    opponentSeat: 'B',
    heartbeatIntervalMs: 1000,
    heartbeatStaleMs: 1000,
    graceMs: 30000,
    viewer: { seatId: 'A', status: 'disconnected', isViewer: true, remainingGraceMs: 0 },
    opponent: { seatId: 'B', status: 'online', isViewer: false, remainingGraceMs: 0 }
  }
});
assert.match(localDisconnectedTempoMarkup, /data-live-tempo-action="refresh-match"/, 'connection tempo CTA should expose a dedicated tempo action hook');
assert.doesNotMatch(localDisconnectedTempoMarkup, /data-live-action="refresh-match"/, 'connection tempo CTA must not duplicate the global refresh action hook');

const setupLocalDisconnectedConnectionCopy = PVPScene.formatLiveConnectionStatus({
  status: 'setup',
  currentSeat: 'A',
  connectionReport: {
    reportVersion: 'pvp-live-connection-v1',
    viewerSeat: 'A',
    opponentSeat: 'B',
    heartbeatIntervalMs: 1000,
    heartbeatStaleMs: 1000,
    graceMs: 30000,
    viewer: { seatId: 'A', status: 'disconnected', isViewer: true, remainingGraceMs: 0 },
    opponent: { seatId: 'B', status: 'online', isViewer: false, remainingGraceMs: 0 }
  }
});
assert.match(setupLocalDisconnectedConnectionCopy, /我方断线/, 'setup local disconnected copy should name the viewer as disconnected');
assert.match(setupLocalDisconnectedConnectionCopy, /准备阶段|无效局|不计正式积分/, 'setup local disconnected copy should keep pre-battle invalidation separate from active timeout loss');
assert.match(setupLocalDisconnectedConnectionCopy, /刷新|权威/, 'setup local disconnected copy should guide the player to refresh authoritative state');
assert.doesNotMatch(setupLocalDisconnectedConnectionCopy, /按连接超时结算|正式败局|判负/, 'setup local disconnected copy must not imply an active timeout loss before battle starts');

const setupLocalDisconnectedTempoMarkup = PVPScene.renderLiveConnectionTempo({
  status: 'setup',
  currentSeat: 'A',
  connectionReport: {
    reportVersion: 'pvp-live-connection-v1',
    viewerSeat: 'A',
    opponentSeat: 'B',
    heartbeatIntervalMs: 1000,
    heartbeatStaleMs: 1000,
    graceMs: 30000,
    viewer: { seatId: 'A', status: 'disconnected', isViewer: true, remainingGraceMs: 0 },
    opponent: { seatId: 'B', status: 'online', isViewer: false, remainingGraceMs: 0 }
  }
});
assert.match(setupLocalDisconnectedTempoMarkup, /data-live-tempo-action="refresh-match"/, 'setup local disconnected tempo should keep the authoritative refresh CTA');
assert.match(setupLocalDisconnectedTempoMarkup, /准备阶段|无效局|不计正式积分/, 'setup local disconnected tempo should explain pre-battle invalidation instead of active timeout settlement');
assert.doesNotMatch(setupLocalDisconnectedTempoMarkup, /按连接超时结算|正式败局|判负/, 'setup local disconnected tempo must not imply active timeout loss');

const opponentDisconnectedNonTurnCopy = PVPScene.formatLiveConnectionStatus({
  status: 'active',
  currentSeat: 'A',
  connectionReport: {
    reportVersion: 'pvp-live-connection-v1',
    viewerSeat: 'A',
    opponentSeat: 'B',
    heartbeatIntervalMs: 1000,
    heartbeatStaleMs: 1000,
    graceMs: 30000,
    viewer: { seatId: 'A', status: 'online', isViewer: true, remainingGraceMs: 0 },
    opponent: { seatId: 'B', status: 'disconnected', isViewer: false, remainingGraceMs: 0 }
  }
});
assert.match(opponentDisconnectedNonTurnCopy, /对局继续|当前行动仍可提交|轮到对手/, 'live UI should explain that a non-turn opponent disconnect does not immediately end active play');
assert.doesNotMatch(opponentDisconnectedNonTurnCopy, /等待权威超时结算/, 'live UI must not imply immediate timeout settlement when the disconnected opponent is not the current actor');

const opponentDisconnectedCurrentTurnCopy = PVPScene.formatLiveConnectionStatus({
  status: 'active',
  currentSeat: 'B',
  connectionReport: {
    reportVersion: 'pvp-live-connection-v1',
    viewerSeat: 'A',
    opponentSeat: 'B',
    heartbeatIntervalMs: 1000,
    heartbeatStaleMs: 1000,
    graceMs: 30000,
    viewer: { seatId: 'A', status: 'online', isViewer: true, remainingGraceMs: 0 },
    opponent: { seatId: 'B', status: 'disconnected', isViewer: false, remainingGraceMs: 0 }
  }
});
assert.match(opponentDisconnectedCurrentTurnCopy, /当前行动|连接超时|超时结算/, 'live UI should name the authoritative timeout boundary when the disconnected opponent owns the action window');
assert.doesNotMatch(opponentDisconnectedCurrentTurnCopy, /connection_timeout|turn_timeout|ranked_authoritative|swap_sides|forfeit_disconnect/, 'live UI opponent disconnect copy should not expose internal protocol codes');

const rawProtocolPattern = /connection_timeout|turn_timeout|ready_timeout|ranked_authoritative|swap_sides|forfeit_disconnect/;

const protocolLabelReviewMarkup = PVPScene.renderLivePostMatchReview({
  status: 'finished',
  postMatchReview: {
    reportVersion: 'pvp-live-post-match-review-v1',
    title: '连接复盘',
    result: 'loss',
    finishReason: 'connection_timeout',
    summary: '连接中断后进入复盘。',
    evidence: [
      { eventType: 'turn_timeout', sequence: 4, actingSeat: 'A', publicData: { seatId: 'A', finishReason: 'connection_timeout' } },
      { eventType: 'match_invalidated', sequence: 5, actingSeat: 'system', publicData: { reason: 'ready_timeout' } }
    ],
    keyTurnReplay: {
      reportVersion: 'pvp-live-key-turn-replay-v1',
      sourceVisibility: 'public_events',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      turns: [
        { id: 'terminal', label: '终局窗口', sequence: 4, eventType: 'turn_timeout', lesson: '重连宽限结束。' }
      ]
    },
    settlementReport: {
      reportVersion: 'pvp-live-settlement-report-v1',
      result: 'loss',
      formalResultPolicy: 'ranked_authoritative',
      ratingDelta: -10,
      coinsAwarded: 0,
      oldScore: 1000,
      scoreAfter: 990,
      summaryLine: '正式积分 -10 · 当前 990 · 天道币 +0'
    },
    friendlySeries: {
      reportVersion: 'pvp-live-friendly-series-v1',
      sourceMatchId: 'pvpm-ui-runtime-raw-labels',
      seriesId: 'series-raw-labels',
      status: 'waiting_rematch',
      roundLabel: 'Bo3 第 2 局',
      rankedImpact: 'none',
      seatPolicy: 'swap_sides',
      sourceParticipants: { A: { displayName: '甲' }, B: { displayName: '乙' } },
      scoreBySourceSeat: { A: 1, B: 0 }
    },
    nextActions: []
  }
});
assert.match(protocolLabelReviewMarkup, /连接超时/, 'post-match review should map connection timeout to player copy');
assert.match(protocolLabelReviewMarkup, /行动超时/, 'key turn replay should map turn timeout to player copy');
assert.match(protocolLabelReviewMarkup, /准备超时/, 'invalidated event reason should map ready timeout to player copy');
assert.match(protocolLabelReviewMarkup, /服务端权威结算/, 'settlement report should map ranked authoritative policy to player copy');
assert.match(protocolLabelReviewMarkup, /换边再战/, 'friendly series should map swap-side policy to player copy');
assert.doesNotMatch(protocolLabelReviewMarkup, rawProtocolPattern, 'post-match visible review should not expose internal protocol codes');

const keyTurnStepperView = {
  status: 'finished',
  postMatchReview: {
    reportVersion: 'pvp-live-post-match-review-v1',
    title: '关键回合复盘',
    result: 'loss',
    finishReason: 'lethal',
    summary: '公开轨迹显示终局。',
    evidence: [
      { eventType: 'battle_started', sequence: 1, actingSeat: 'A', publicData: { firstSeat: 'A' } },
      { eventType: 'damage_applied', sequence: 4, actingSeat: 'A', publicData: { targetSeat: 'B', hpDamage: 8, targetHp: 1 } },
      { eventType: 'match_finished', sequence: 9, actingSeat: 'B', publicData: { winnerSeat: 'B', loserSeat: 'A' } }
    ],
    keyTurnReplay: {
      reportVersion: 'pvp-live-key-turn-replay-v1',
      sourceVisibility: 'public_events',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      turns: [
        { id: 'opening', label: '开局读题', sequence: 1, eventType: 'battle_started', lesson: '确认先后手。' },
        { id: 'counterplay', label: '反打窗口', sequence: 4, eventType: 'damage_applied', lesson: '保留防守后再反打。' },
        { id: 'finish', label: '终局选择', sequence: 9, eventType: 'match_finished', lesson: '确认终局前一拍。' }
      ]
    },
    nextActions: []
  }
};
const keyTurnStepperMarkup = PVPScene.renderLiveKeyTurnReplay(keyTurnStepperView.postMatchReview);
assert.match(
  keyTurnStepperMarkup,
  /data-live-key-turn-focus="counterplay"/,
  'key-turn replay should render each key turn as a clickable focus step',
);
assert.match(
  keyTurnStepperMarkup,
  /onclick="PVPScene\.focusLiveKeyTurn\('counterplay'\)"/,
  'key-turn replay focus step should call the focused key-turn handler',
);
const focusedCounterplayEvents = PVPScene.getLiveReviewFocusedEvents(keyTurnStepperView, 'key_turn:counterplay');
assert.deepEqual(
  focusedCounterplayEvents.map(event => event.eventType),
  ['damage_applied'],
  'key-turn focus should narrow the event log to the selected public turn',
);
assert.equal(
  focusedCounterplayEvents[0]?.sequence,
  4,
  'key-turn focus should preserve selected public evidence sequence',
);
assert.equal(
  focusedCounterplayEvents[0]?.publicData?.targetHp,
  1,
  'key-turn focus should reuse matching public evidence details when available',
);
assert.doesNotMatch(
  JSON.stringify(focusedCounterplayEvents),
  /hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i,
  'key-turn focus should not expose hidden payloads or ranked reward fields',
);

const authoritativeConnectionTempoView = {
  matchId: 'pvpm-ui-runtime-authoritative-tempo',
  status: 'active',
  currentSeat: 'A',
  stateVersion: 12,
  connectionReport: {
    reportVersion: 'pvp-live-connection-v1',
    viewerSeat: 'A',
    opponentSeat: 'B',
    heartbeatIntervalMs: 1000,
    heartbeatStaleMs: 1000,
    graceMs: 30000,
    viewer: { seatId: 'A', status: 'online', isViewer: true, remainingGraceMs: 0 },
    opponent: { seatId: 'B', status: 'online', isViewer: false, remainingGraceMs: 0 }
  },
  connectionTempoReport: {
    reportVersion: 'pvp-live-connection-tempo-v1',
    sourceVisibility: 'server_authoritative_connection_state',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    tempoState: 'opponent_action_timeout_pending',
    severity: 'warning',
    phase: 'active',
    currentSeat: 'B',
    viewerSeat: 'A',
    opponentSeat: 'B',
    affectedSeat: 'B',
    statusLine: '连接：服务端权威判定对方行动超时等待中',
    detailLine: '服务端权威连接节奏优先于客户端本地推导。',
    actionBoundary: 'wait_for_authoritative_timeout',
    canSubmitIntent: false,
    shouldWaitForAuthority: true,
    safeguards: ['server_authoritative_projection']
  }
};
const authoritativeConnectionTempo = PVPScene.getLiveConnectionTempo(authoritativeConnectionTempoView, { phase: 'active' });
assert.equal(authoritativeConnectionTempo.tempoState, 'opponent_action_timeout_pending', 'live UI should prefer server connection tempo over local connectionReport inference');
assert.equal(authoritativeConnectionTempo.sourceVisibility, 'server_authoritative_connection_state', 'live UI should preserve server-authoritative connection tempo source');
assert.equal(authoritativeConnectionTempo.actionBoundary, 'wait_for_authoritative_timeout', 'live UI should preserve authoritative tempo action boundary');
assert.match(PVPScene.formatLiveConnectionStatus(authoritativeConnectionTempoView), /服务端权威判定/, 'live UI connection status should render authoritative tempo copy');
assert.match(PVPScene.renderLiveConnectionTempo(authoritativeConnectionTempoView), /服务端权威连接节奏优先/, 'live UI connection tempo body should render authoritative tempo copy');
const previousGetLiveSessionForTempo = PVPScene.getLiveSession;
PVPScene.getLiveSession = () => ({
  getState: () => ({
    phase: 'active',
    matchId: authoritativeConnectionTempoView.matchId,
    seatId: 'A',
    stateView: authoritativeConnectionTempoView,
    realtimeStatus: 'connected',
    lastRealtimeSyncAt: 1781871234999,
    realtimeReport: null,
    lastEvents: []
  })
});
const authoritativeConnectionSnapshot = PVPScene.getLiveSnapshot();
PVPScene.getLiveSession = previousGetLiveSessionForTempo;
assert.equal(authoritativeConnectionSnapshot.connectionTempoReport.tempoState, 'opponent_action_timeout_pending', 'live snapshot should expose authoritative connection tempo');
assert.equal(authoritativeConnectionSnapshot.connectionTempoReport.sourceVisibility, 'server_authoritative_connection_state', 'live snapshot should keep authoritative connection tempo provenance');

const viewerReconnectBlockedView = {
  matchId: 'pvpm-ui-runtime-viewer-reconnect-blocked',
  status: 'active',
  currentSeat: 'A',
  stateVersion: 18,
  connectionTempoReport: {
    reportVersion: 'pvp-live-connection-tempo-v1',
    sourceVisibility: 'server_authoritative_connection_state',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    tempoState: 'viewer_reconnect_grace',
    severity: 'warning',
    phase: 'active',
    currentSeat: 'A',
    viewerSeat: 'A',
    opponentSeat: 'B',
    affectedSeat: 'A',
    statusLine: '连接：我方重连宽限 12s',
    detailLine: '本地画面可能落后，先刷新权威状态。',
    action: { id: 'refresh_match', label: '刷新权威状态' },
    actionBoundary: 'recover_connection',
    canSubmitIntent: false,
    shouldWaitForAuthority: true,
    remainingGraceMs: 12000,
    safeguards: ['server_authoritative_projection']
  }
};
const viewerReconnectBlockedState = {
  phase: 'active',
  matchId: viewerReconnectBlockedView.matchId,
  seatId: 'A',
  realtimeStatus: 'connected',
  stateView: viewerReconnectBlockedView,
  lastEvents: []
};
const blockedActiveButtons = new Map([
  ['refresh-match', { disabled: true, textContent: '刷新', querySelector() { return null; } }],
  ['end-turn', { disabled: true, textContent: '结束回合', querySelector() { return null; } }],
  ['surrender', { disabled: true, textContent: '认输', querySelector() { return null; } }],
  ['confirm-mulligan', { disabled: true, textContent: '确认调息', querySelector() { return null; } }],
  ['ready', { disabled: true, textContent: '准备就绪', querySelector() { return null; } }],
]);
const blockedActiveRoot = {
  querySelector(selector) {
    const actionMatch = String(selector || '').match(/^\[data-live-action="([^"]+)"\]$/);
    return actionMatch ? blockedActiveButtons.get(actionMatch[1]) || null : null;
  },
  querySelectorAll() { return []; }
};
const previousDocumentQuerySelectorForConnectionTempo = documentStub.querySelector;
documentStub.querySelector = (selector) => selector === '[data-live-pvp-root]' ? blockedActiveRoot : null;
PVPScene.getLiveSession = () => ({ getState: () => viewerReconnectBlockedState });
PVPScene.liveIntentInFlight = null;
PVPScene.updateLiveButtons('active', true, { seatId: 'A', ready: true, mulliganUsed: true });
assert.equal(blockedActiveButtons.get('end-turn').disabled, true, 'viewer reconnect grace should disable active end-turn even when it is my turn');
assert.equal(blockedActiveButtons.get('surrender').disabled, true, 'viewer reconnect grace should disable stale active surrender submits');
assert.equal(blockedActiveButtons.get('refresh-match').disabled, false, 'viewer reconnect grace should keep authoritative refresh enabled');

const viewerReconnectBlockedSetupState = {
  ...viewerReconnectBlockedState,
  phase: 'setup',
  stateView: {
    ...viewerReconnectBlockedView,
    status: 'setup',
    phase: 'setup',
    currentSeat: 'A',
    connectionTempoReport: {
      ...viewerReconnectBlockedView.connectionTempoReport,
      phase: 'setup',
      tempoState: 'viewer_refresh_required',
      severity: 'danger',
      statusLine: '连接：我方断线，需要刷新权威状态'
    }
  }
};
PVPScene.getLiveSession = () => ({ getState: () => viewerReconnectBlockedSetupState });
PVPScene.updateLiveButtons('setup', false, { seatId: 'A', ready: false, mulliganUsed: false });
assert.equal(blockedActiveButtons.get('confirm-mulligan').disabled, true, 'viewer refresh required should disable stale mulligan submit');
assert.equal(blockedActiveButtons.get('ready').disabled, true, 'viewer refresh required should disable stale ready submit');
assert.equal(blockedActiveButtons.get('refresh-match').disabled, false, 'viewer refresh required setup should keep refresh enabled');

const setupRecoveryButtons = new Map([
  ['join-queue', { disabled: false, textContent: '入队', querySelector() { return null; } }],
  ['create-invite', { disabled: false, textContent: '创建邀请', querySelector() { return null; } }],
  ['join-invite', { disabled: false, textContent: '加入邀请', querySelector() { return null; } }],
  ['cancel-invite', { disabled: false, textContent: '取消邀请', querySelector() { return null; } }],
  ['cancel-queue', { disabled: false, textContent: '取消排队', querySelector() { return null; } }],
  ['practice-live', { disabled: false, textContent: '问道练习', querySelector() { return null; } }],
  ['refresh-match', { disabled: true, textContent: '刷新', querySelector() { return null; } }],
  ['end-turn', { disabled: false, textContent: '结束回合', querySelector() { return null; } }],
  ['surrender', { disabled: false, textContent: '认输', querySelector() { return null; } }],
  ['confirm-mulligan', { disabled: true, textContent: '确认调息', querySelector() { return null; } }],
  ['ready', { disabled: true, textContent: '准备就绪', querySelector() { return null; } }],
]);
const setupRecoveryRoot = {
  querySelector(selector) {
    const actionMatch = String(selector || '').match(/^\[data-live-action="([^"]+)"\]$/);
    return actionMatch ? setupRecoveryButtons.get(actionMatch[1]) || null : null;
  },
  querySelectorAll() { return []; }
};
const setupRecoveryState = {
  phase: 'setup',
  matchId: 'pvpm-ui-runtime-setup-recovery',
  seatId: 'B',
  realtimeStatus: 'connected',
  stateView: {
    matchId: 'pvpm-ui-runtime-setup-recovery',
    status: 'setup',
    stateVersion: 2,
    currentSeat: 'B',
    self: { seatId: 'B', ready: false, mulliganUsed: false },
    opponent: { seatId: 'A', ready: true, handCount: 3 }
  },
  lastEvents: []
};
documentStub.querySelector = (selector) => selector === '[data-live-pvp-root]' ? setupRecoveryRoot : null;
PVPScene.getLiveSession = () => ({ getState: () => setupRecoveryState });
PVPScene.liveIntentInFlight = null;
PVPScene.updateLiveButtons('setup', false, { seatId: 'B', ready: false, mulliganUsed: false });
assert.equal(setupRecoveryButtons.get('join-queue').disabled, true, 'setup recovery should keep public queue entry disabled while matched');
assert.equal(setupRecoveryButtons.get('create-invite').disabled, true, 'setup recovery should keep invite creation disabled while matched');
assert.equal(setupRecoveryButtons.get('join-invite').disabled, true, 'setup recovery should keep invite join disabled while matched');
assert.equal(setupRecoveryButtons.get('end-turn').disabled, true, 'setup recovery should keep active turn submit disabled before battle starts');
assert.equal(setupRecoveryButtons.get('surrender').disabled, true, 'setup recovery should keep surrender disabled before battle starts');
assert.equal(setupRecoveryButtons.get('refresh-match').disabled, false, 'setup recovery should still allow manual authoritative refresh');
assert.equal(setupRecoveryButtons.get('confirm-mulligan').disabled, false, 'setup recovery should keep mulligan available before the viewer has used it');
assert.equal(setupRecoveryButtons.get('ready').disabled, false, 'setup recovery should keep ready available before the viewer has confirmed');
PVPScene.updateLiveButtons('setup', false, { seatId: 'B', ready: true, mulliganUsed: true });
assert.equal(setupRecoveryButtons.get('confirm-mulligan').disabled, true, 'setup recovery should disable mulligan after the viewer has used it');
assert.equal(setupRecoveryButtons.get('ready').disabled, true, 'setup recovery should disable ready after the viewer has confirmed');

const setupOpponentGraceView = {
  status: 'setup',
  currentSeat: 'B',
  connectionTempoReport: {
    reportVersion: 'pvp-live-connection-tempo-v1',
    sourceVisibility: 'server_authoritative_connection_state',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    tempoState: 'opponent_setup_grace',
    severity: 'warning',
    phase: 'setup',
    currentSeat: 'B',
    viewerSeat: 'B',
    opponentSeat: 'A',
    affectedSeat: 'A',
    statusLine: '连接：对方重连宽限 18s',
    detailLine: '对手准备阶段重连中。',
    actionBoundary: 'continue_setup_action',
    canSubmitIntent: true,
    shouldWaitForAuthority: false
  }
};
const setupOpponentGraceStatus = PVPScene.formatLiveConnectionStatus(setupOpponentGraceView);
const setupOpponentGraceTempo = PVPScene.renderLiveConnectionTempo(setupOpponentGraceView, { phase: 'setup' });
assert.match(setupOpponentGraceStatus, /对方重连宽限/, 'setup opponent grace should remain visible as reconnect grace');
assert.match(`${setupOpponentGraceStatus} ${setupOpponentGraceTempo}`, /继续|调息|确认准备|准备/, 'setup opponent grace should tell the connected player they can continue setup actions');
assert.match(`${setupOpponentGraceStatus} ${setupOpponentGraceTempo}`, /无效局|不计正式积分/, 'setup opponent grace should explain the no-score invalidation boundary');
assert.doesNotMatch(`${setupOpponentGraceStatus} ${setupOpponentGraceTempo}`, /判负|正式败局|等待连接超时结算/, 'setup opponent grace must not imply active timeout loss');
setupRecoveryButtons.get('confirm-mulligan').disabled = true;
setupRecoveryButtons.get('ready').disabled = true;
PVPScene.getLiveSession = () => ({
  getState: () => ({
    ...setupRecoveryState,
    stateView: {
      ...setupRecoveryState.stateView,
      connectionTempoReport: setupOpponentGraceView.connectionTempoReport
    }
  })
});
PVPScene.updateLiveButtons('setup', false, { seatId: 'B', ready: false, mulliganUsed: false });
assert.equal(setupRecoveryButtons.get('confirm-mulligan').disabled, false, 'setup opponent grace should keep mulligan available when server allows setup actions');
assert.equal(setupRecoveryButtons.get('ready').disabled, false, 'setup opponent grace should keep ready available when server allows setup actions');

const setupOpponentDisconnectedView = {
  ...setupOpponentGraceView,
  connectionTempoReport: {
    ...setupOpponentGraceView.connectionTempoReport,
    tempoState: 'opponent_setup_disconnected',
    severity: 'warning',
    statusLine: '连接：对方断线',
    detailLine: '对手准备阶段断线。',
    actionBoundary: 'continue_setup_action',
    canSubmitIntent: true,
    shouldWaitForAuthority: false
  }
};
const setupOpponentDisconnectedStatus = PVPScene.formatLiveConnectionStatus(setupOpponentDisconnectedView);
const setupOpponentDisconnectedTempo = PVPScene.renderLiveConnectionTempo(setupOpponentDisconnectedView, { phase: 'setup' });
assert.match(setupOpponentDisconnectedStatus, /对方断线/, 'setup opponent disconnected should name the disconnected opponent');
assert.match(`${setupOpponentDisconnectedStatus} ${setupOpponentDisconnectedTempo}`, /继续|调息|确认准备|准备/, 'setup opponent disconnected should tell the connected player they can continue setup actions');
assert.match(`${setupOpponentDisconnectedStatus} ${setupOpponentDisconnectedTempo}`, /无效局|不计正式积分/, 'setup opponent disconnected should explain the no-score invalidation boundary');
assert.doesNotMatch(`${setupOpponentDisconnectedStatus} ${setupOpponentDisconnectedTempo}`, /判负|正式败局|等待连接超时结算/, 'setup opponent disconnected must not imply active timeout loss');
setupRecoveryButtons.get('confirm-mulligan').disabled = true;
setupRecoveryButtons.get('ready').disabled = true;
PVPScene.getLiveSession = () => ({
  getState: () => ({
    ...setupRecoveryState,
    stateView: {
      ...setupRecoveryState.stateView,
      connectionTempoReport: setupOpponentDisconnectedView.connectionTempoReport
    }
  })
});
PVPScene.updateLiveButtons('setup', false, { seatId: 'B', ready: false, mulliganUsed: false });
assert.equal(setupRecoveryButtons.get('confirm-mulligan').disabled, false, 'setup opponent disconnected should keep mulligan available when server allows setup actions');
assert.equal(setupRecoveryButtons.get('ready').disabled, false, 'setup opponent disconnected should keep ready available when server allows setup actions');
documentStub.querySelector = (selector) => selector === '[data-live-pvp-root]' ? blockedActiveRoot : null;
PVPScene.getLiveSession = () => ({ getState: () => viewerReconnectBlockedState });
const blockedIntentCalls = [];
const previousStartLiveRealtimeForConnectionTempo = PVPScene.startLiveRealtime;
const previousRenderLivePanelForConnectionTempo = PVPScene.renderLivePanel;
const previousGetLiveSessionForConnectionTempo = PVPScene.getLiveSession;
PVPScene.startLiveRealtime = () => {};
PVPScene.renderLivePanel = () => {};
PVPScene.getLiveSession = () => ({
  getState: () => viewerReconnectBlockedState,
  submitRealtimeIntent: (intent, matchId) => {
    blockedIntentCalls.push({ type: 'realtime', intent, matchId });
    return true;
  },
  submitIntent: async (intent) => {
    blockedIntentCalls.push({ type: 'http', intent });
    return viewerReconnectBlockedState;
  }
});
await PVPScene.submitLiveIntent({
  intentId: 'blocked-end-turn',
  intentType: 'end_turn',
  payload: {}
});
await PVPScene.submitLiveEmote('respect');
assert.equal(blockedIntentCalls.length, 0, 'submitLiveIntent should not send stale intents while authoritative connection tempo blocks submits');
assert.match(PVPScene.liveInlineHint, /刷新权威状态|连接|权威/, 'blocked connection tempo submit should tell the player to refresh authoritative state');
documentStub.querySelector = previousDocumentQuerySelectorForConnectionTempo;
PVPScene.startLiveRealtime = previousStartLiveRealtimeForConnectionTempo;
PVPScene.renderLivePanel = previousRenderLivePanelForConnectionTempo;
PVPScene.getLiveSession = previousGetLiveSessionForConnectionTempo;

const lowViewerActionTimerCopy = PVPScene.formatLiveTurnTimer({
  turnTimer: {
    reportVersion: 'pvp-live-turn-timer-v1',
    phase: 'active',
    currentSeat: 'A',
    viewerSeat: 'A',
    isViewerTurn: true,
    viewerCanAct: true,
    startedAt: Date.now() - 81000,
    deadlineAt: Date.now() + 9000,
    timeoutMs: 90000,
    remainingMs: 9000
  }
});
assert.match(lowViewerActionTimerCopy, /最后 10 秒，请确认行动/, 'live UI should warn the acting player during the final 10 seconds');
assert.equal(
  PVPScene.getLiveTurnTimerUrgency({
    turnTimer: {
      reportVersion: 'pvp-live-turn-timer-v1',
      phase: 'active',
      currentSeat: 'A',
      viewerSeat: 'A',
      isViewerTurn: true,
      viewerCanAct: true,
      startedAt: Date.now() - 81000,
      deadlineAt: Date.now() + 9000,
      timeoutMs: 90000,
      remainingMs: 9000
    }
  }),
  'low',
  'live UI should expose a low-time urgency state for DOM styling and audits',
);
assert.equal(typeof PVPScene.getLiveTimeoutAutomationForecast, 'function', 'live UI should expose a timeout automation forecast helper');
assert.equal(typeof PVPScene.renderLiveTimeoutAutomationForecast, 'function', 'live UI should expose a timeout automation forecast renderer');
const firstTimeoutForecastView = {
  status: 'active',
  currentSeat: 'A',
  timeoutAutomationReport: {
    reportVersion: 'pvp-live-timeout-automation-state-v1',
    sourceVisibility: 'server_authoritative_public_timeout_state',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    currentSeat: 'A',
    currentSeatAutomationCount: 0,
    countsBySeat: { A: 0, B: 0 }
  },
  turnTimer: {
    reportVersion: 'pvp-live-turn-timer-v1',
    phase: 'active',
    currentSeat: 'A',
    viewerSeat: 'A',
    isViewerTurn: true,
    viewerCanAct: true,
    startedAt: Date.now() - 81000,
    deadlineAt: Date.now() + 9000,
    timeoutMs: 90000,
    remainingMs: 9000
  },
  actionPreviewReport: {
    reportVersion: 'pvp-live-action-preview-v1',
    sourceVisibility: 'viewer_public_state',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    currentSeat: 'A',
    isViewerTurn: true,
    playableCards: [{
      cardInstanceId: 'hidden-guard-instance',
      cardName: '护体诀',
      blockGain: 7,
      hpDamage: 0,
      budgetedDamage: 0,
      summaryLine: '护体诀：自身护盾 +7。'
    }],
    endTurn: {
      nextSeat: 'B',
      summaryLine: '结束回合后行动权交给 B。'
    }
  },
  recentEvents: []
};
const firstTimeoutForecast = PVPScene.getLiveTimeoutAutomationForecast(firstTimeoutForecastView, 'active');
assert.equal(firstTimeoutForecast.reportVersion, 'pvp-live-timeout-automation-forecast-v1', 'timeout forecast should expose a stable report version');
assert.equal(firstTimeoutForecast.sourceVisibility, 'server_authoritative_public_timeout_state', 'timeout forecast should use server-authoritative public timeout state');
assert.equal(firstTimeoutForecast.usesHiddenInformation, false, 'timeout forecast must be hidden-info safe');
assert.equal(firstTimeoutForecast.rankedImpact, 'none', 'timeout forecast must not affect ranked state');
assert.equal(firstTimeoutForecast.advisoryOnly, true, 'timeout forecast should explicitly stay advisory-only');
assert.equal(firstTimeoutForecast.forecastState, 'first_soft_timeout', 'first low-time window should explain the first soft timeout automation path');
assert.equal(firstTimeoutForecast.automationCount, 0, 'first timeout forecast should not invent previous automation counts');
assert.equal(firstTimeoutForecast.defenseCardAvailable, true, 'first timeout forecast should detect a public low-impact defense-card fallback without exposing ids');
assert.match(firstTimeoutForecast.primaryLine, /首次超时|低影响托管|防守牌/, 'first timeout forecast should explain low-impact automation in player language');
const firstTimeoutForecastMarkup = PVPScene.renderLiveTimeoutAutomationForecast(firstTimeoutForecastView, 'active');
assert.match(firstTimeoutForecastMarkup, /data-live-timeout-forecast-line/, 'timeout forecast should render stable readable lines');
assert.match(firstTimeoutForecastMarkup, /首次超时|低影响托管|防守牌/, 'timeout forecast should render first soft-timeout guidance');
assert.match(firstTimeoutForecastMarkup, /只提示不代打|不改变正式积分|奖励|结算/, 'timeout forecast should render advisory and settlement boundaries');
assert.doesNotMatch(firstTimeoutForecastMarkup, /hidden-guard-instance|cardInstanceId|cardId|instanceId|hand|deck|loadoutSnapshot|rewardId|rating|elo|token/i, 'timeout forecast rendering must not expose hidden ids, rewards, or rating payloads');
const repeatTimeoutForecast = PVPScene.getLiveTimeoutAutomationForecast({
  ...firstTimeoutForecastView,
  timeoutAutomationReport: {
    ...firstTimeoutForecastView.timeoutAutomationReport,
    currentSeatAutomationCount: 1,
    countsBySeat: { A: 1, B: 0 }
  },
  recentEvents: [{
    eventType: 'automation_action',
    actingSeat: 'A',
    publicData: {
      seatId: 'A',
      actionType: 'defense_card',
      reason: 'soft_timeout',
      automationCount: 1
    }
  }]
}, 'active');
assert.equal(repeatTimeoutForecast.forecastState, 'repeat_timeout_risk', 'repeat low-time window should explain the authoritative timeout risk');
assert.equal(repeatTimeoutForecast.automationCount, 1, 'repeat timeout forecast should preserve the public prior automation count');
assert.match(repeatTimeoutForecast.primaryLine, /已有 1 次超时托管|再次超时|权威结算/, 'repeat timeout forecast should warn about repeated timeout consequences');
const staleEventRepeatForecast = PVPScene.getLiveTimeoutAutomationForecast({
  ...firstTimeoutForecastView,
  timeoutAutomationReport: {
    ...firstTimeoutForecastView.timeoutAutomationReport,
    currentSeatAutomationCount: 1,
    countsBySeat: { A: 1, B: 0 }
  },
  recentEvents: []
}, 'active');
assert.equal(staleEventRepeatForecast.forecastState, 'repeat_timeout_risk', 'repeat timeout forecast should use server-authoritative public count even after old events roll out of recentEvents');
assert.equal(staleEventRepeatForecast.automationCount, 1, 'repeat timeout forecast should not reset to first timeout when recentEvents no longer contains the first soft timeout');
assert.equal(
  PVPScene.getLiveTimeoutAutomationForecast({
    ...firstTimeoutForecastView,
    timeoutAutomationReport: {
      ...firstTimeoutForecastView.timeoutAutomationReport,
      usesHiddenInformation: true
    }
  }, 'active'),
  null,
  'timeout forecast should reject unsafe timeout automation reports',
);
assert.equal(
  PVPScene.getLiveTimeoutAutomationForecast({
    ...firstTimeoutForecastView,
    turnTimer: {
      ...firstTimeoutForecastView.turnTimer,
      deadlineAt: Date.now() + 30000,
      remainingMs: 30000
    }
  }, 'active'),
  null,
  'timeout forecast should stay hidden outside the final 10 seconds',
);
assert.equal(
  PVPScene.getLiveTimeoutAutomationForecast({
    ...firstTimeoutForecastView,
    actionPreviewReport: {
      ...firstTimeoutForecastView.actionPreviewReport,
      usesHiddenInformation: true
    }
  }, 'active'),
  null,
  'timeout forecast should reject unsafe action preview sources',
);
const lowOpponentActionTimerCopy = PVPScene.formatLiveTurnTimer({
  turnTimer: {
    reportVersion: 'pvp-live-turn-timer-v1',
    phase: 'active',
    currentSeat: 'B',
    viewerSeat: 'A',
    isViewerTurn: false,
    viewerCanAct: false,
    startedAt: Date.now() - 81000,
    deadlineAt: Date.now() + 9000,
    timeoutMs: 90000,
    remainingMs: 9000
  }
});
assert.match(lowOpponentActionTimerCopy, /对手思考中|剩余时间不多/, 'live UI should make opponent low-time thinking readable without asking the viewer to act');

const matchQualityWithConnectionGate = PVPScene.formatLiveMatchQuality({
  matchQuality: {
    reportVersion: 'pvp-live-match-quality-v1',
    tag: 'good',
    expansionStage: 'strict_rating',
    ratingDeltaBucket: 'near_0_99',
    waitMs: { A: 1200, B: 800 },
    candidatePoolSize: 2,
    connectionHealth: 'pass',
    connectionHealthSummary: {
      status: 'pass',
      sampleTag: 'client_preflight'
    },
    safeguards: ['server_authoritative', 'connection_health_gate']
  }
});
assert.match(matchQualityWithConnectionGate, /连接健康通过/, 'live UI match quality should expose passed connection health gate');
assert.match(matchQualityWithConnectionGate, /近分匹配/, 'live UI match quality should map strict rating stage into player copy');
assert.match(matchQualityWithConnectionGate, /近分 0-99/, 'live UI match quality should map near rating bucket into player copy');
assert.match(matchQualityWithConnectionGate, /候选池 2/, 'live UI match quality should expose candidate pool as player-readable context');
assert.doesNotMatch(matchQualityWithConnectionGate, /strict_rating|near_0_99/, 'live UI match quality should not render raw matching enum values');
assert.doesNotMatch(matchQualityWithConnectionGate, /rtt|missed|heartbeat|reconnect|延迟.*\\d/i, 'live UI match quality should not expose raw connection probe details');
const unknownConnectionMatchQualityCopy = PVPScene.formatLiveMatchQuality({
  matchQuality: {
    reportVersion: 'pvp-live-match-quality-v1',
    tag: 'good',
    expansionStage: 'strict_rating',
    ratingDeltaBucket: 'near_0_99',
    waitMs: { A: 1200, B: 800 },
    candidatePoolSize: 2,
    connectionHealth: 'server_probe_lagging',
    connectionHealthSummary: {
      status: 'server_probe_lagging',
      sampleTag: 'server_preflight'
    },
    safeguards: ['server_authoritative', 'connection_health_gate']
  }
});
assert.match(
  unknownConnectionMatchQualityCopy,
  /连接状态待确认/,
  'live UI match quality should map unknown connection health into generic player copy',
);
assert.doesNotMatch(
  unknownConnectionMatchQualityCopy,
  /server_probe_lagging|server_preflight/,
  'live UI match quality should not render raw unknown connection health values',
);

const acceptedWideMatchQualityCopy = PVPScene.formatLiveMatchQuality({
  matchQuality: {
    reportVersion: 'pvp-live-match-quality-v1',
    tag: 'wide_but_accepted',
    expansionStage: 'accepted_200_399',
    ratingDeltaBucket: 'expanded_200_399',
    waitMs: { A: 123000, B: 118000 },
    candidatePoolSize: 2,
    connectionHealth: 'pass',
    wideMatchReason: 'two_sided_explicit_consent',
    safeguards: ['explicit_wide_match_consent']
  }
});
assert.match(acceptedWideMatchQualityCopy, /双方确认宽分差/, 'live UI match quality should explain accepted wide match as mutual consent');
assert.match(acceptedWideMatchQualityCopy, /200-399/, 'live UI match quality should keep wide rating span bucketed for player expectation');
assert.equal(
  (acceptedWideMatchQualityCopy.match(/双方确认宽分差/g) || []).length,
  1,
  'live UI accepted wide-match copy should not repeat the same conclusion twice',
);
assert.doesNotMatch(acceptedWideMatchQualityCopy, /wide_but_accepted|accepted_200_399|expanded_200_399|two_sided_explicit_consent/, 'live UI wide match quality should not render raw matching enum values');

let entrySafeguardState = {
  phase: 'idle',
  queueTicket: '',
  matchId: '',
  lastError: {
    reason: 'connection_health_failed',
    message: '当前连接不适合进入正式真人排位，请重试检测或先进入问道练习。',
    connectionHealth: {
      reportVersion: 'pvp-live-queue-connection-health-v1',
      status: 'blocked',
      sampleTag: 'client_preflight',
      reasons: ['latency_unstable'],
      actions: [
        { id: 'retry_connection_check', label: '重试检测', detail: '重新检测连接后再尝试入队。' },
        { id: 'practice', label: '问道练习', detail: '进入不写正式积分的练习。' }
      ]
    }
  },
  stateView: null,
  lastEvents: []
};
PVPScene.liveSelectedLoadoutPreset = 'sword';
PVPScene.getLiveSession = () => ({ getState: () => entrySafeguardState });
assert.equal(PVPScene.isLiveEntrySafeguardBlocked(), true, 'blocked connection health should mark live entry safeguard as active');
assert.equal(PVPScene.hasLiveEntrySafeguardAction(null, 'retry_connection_check'), true, 'blocked connection health should expose retry action');
assert.equal(PVPScene.hasLiveEntrySafeguardAction(null, 'practice'), true, 'blocked connection health should expose practice action');
assert.equal(PVPScene.getLiveQueueCooldownCountdown(entrySafeguardState), null, 'blocked connection health should not expose queue cooldown countdown');
const entryScenario = PVPScene.buildLiveEntrySafeguardPracticeScenario();
assert.equal(entryScenario.sourceMatchId, 'entry_safeguard:connection_health_failed', 'entry safeguard drill should have a stable source id');
assert.equal(entryScenario.sourceVisibility, 'replay_self', 'entry safeguard drill should use self-visible replay data only');
assert.equal(entryScenario.usesHiddenInformation, false, 'entry safeguard drill must not use hidden opponent information');
assert.equal(entryScenario.rankedImpact, 'none', 'entry safeguard drill must not write ranked score');
assert.ok(entryScenario.trainingTags.includes('连接健康练习'), 'entry safeguard drill should be labeled as connection health practice');
PVPScene.liveDrillScenario = entryScenario;
assert.equal(
  PVPScene.getLiveSnapshot().drillScenario.sourceMatchId,
  'entry_safeguard:connection_health_failed',
  'live snapshot should keep the entry safeguard drill visible while no live match is active',
);
const oldDocumentQuerySelector = documentStub.querySelector;
const liveButtons = new Map([
  ['join-queue', { disabled: true, textContent: '入队', querySelector() { return null; } }],
  ['practice-live', { disabled: true, textContent: '问道练习', querySelector() { return null; } }],
]);
const liveRootStub = {
  querySelector(selector) {
    const actionMatch = String(selector || '').match(/^\[data-live-action="([^"]+)"\]$/);
    return actionMatch ? liveButtons.get(actionMatch[1]) || null : null;
  },
  querySelectorAll() { return []; }
};
documentStub.querySelector = (selector) => selector === '[data-live-pvp-root]' ? liveRootStub : null;
PVPScene.updateLiveButtons('idle', false, null);
assert.equal(liveButtons.get('join-queue').disabled, false, 'blocked entry safeguard should keep retry join button enabled');
assert.equal(liveButtons.get('join-queue').textContent, '重试检测', 'blocked entry safeguard should relabel join button to retry connection check');
assert.equal(liveButtons.get('practice-live').disabled, false, 'blocked entry safeguard should enable no-score practice');
entrySafeguardState = { phase: 'idle', queueTicket: '', matchId: '', lastError: null, stateView: null, lastEvents: [] };
PVPScene.updateLiveButtons('idle', false, null);
assert.equal(liveButtons.get('join-queue').textContent, '入队', 'healthy idle live entry should restore normal queue copy');
assert.equal(liveButtons.get('practice-live').disabled, true, 'healthy idle live entry should not expose practice without a blocked safeguard action');
documentStub.querySelector = oldDocumentQuerySelector;

const queueCooldownState = {
  phase: 'idle',
  queueTicket: '',
  matchId: '',
  lastError: {
    reason: 'queue_cooldown',
    message: '你刚刚多次取消或错过准备，真人排位需要短暂冷却；可先进入问道练习。',
    matchmakingGuard: {
      reportVersion: 'pvp-live-matchmaking-guard-v1',
      status: 'blocked',
      cooldownSource: 'queue_cancel_abuse',
      retryAt: Date.now() + 60000,
      cooldownRemainingMs: 60000,
      rankedImpact: 'none',
      actions: [
        { id: 'retry_queue_later', label: '稍后重试', detail: '冷却结束后重新检测并入队。' },
        { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' }
      ]
    }
  },
  stateView: null,
  lastEvents: []
};
PVPScene.getLiveSession = () => ({ getState: () => queueCooldownState });
assert.equal(PVPScene.isLiveEntrySafeguardBlocked(), true, 'queue cooldown should mark live entry safeguard as active');
assert.equal(PVPScene.hasLiveEntrySafeguardAction(null, 'practice'), true, 'queue cooldown should expose no-score practice action');
const queueCooldownScenario = PVPScene.buildLiveEntrySafeguardPracticeScenario();
assert.equal(queueCooldownScenario?.sourceMatchId, 'entry_safeguard:queue_cooldown', 'queue cooldown drill should use a stable source id');
assert.equal(queueCooldownScenario?.finishReason, 'queue_cooldown', 'queue cooldown drill should expose queue_cooldown finish reason');
assert.equal(queueCooldownScenario?.rankedImpact, 'none', 'queue cooldown practice must not write ranked score');
assert.ok(queueCooldownScenario?.trainingTags?.includes('排队冷却练习'), 'queue cooldown practice should be labeled as queue cooldown practice');
const queueCooldownCountdown = PVPScene.getLiveQueueCooldownCountdown(queueCooldownState);
assert.equal(queueCooldownCountdown?.remainingSeconds, 60, 'queue cooldown countdown should expose rounded remaining seconds');
assert.match(queueCooldownCountdown?.hint || '', /剩余 60 秒/, 'queue cooldown countdown hint should tell the player how long to wait');
assert.equal(queueCooldownCountdown?.buttonText, '60s 后重试', 'queue cooldown countdown should make retry timing visible on the join button');
const localCountdownState = JSON.parse(JSON.stringify(queueCooldownState));
localCountdownState.lastError.matchmakingGuard.retryAt = Date.now() + 45000;
localCountdownState.lastError.matchmakingGuard.cooldownRemainingMs = 60000;
assert.equal(
  PVPScene.getLiveQueueCooldownCountdown(localCountdownState)?.remainingSeconds,
  45,
  'queue cooldown countdown should prefer retryAt over stale server remaining time',
);
const queueCooldownButtons = new Map([
  ['join-queue', { disabled: true, textContent: '入队', querySelector() { return null; } }],
  ['practice-live', { disabled: true, textContent: '问道练习', querySelector() { return null; } }],
]);
const queueCooldownRootStub = {
  querySelector(selector) {
    const actionMatch = String(selector || '').match(/^\[data-live-action="([^"]+)"\]$/);
    return actionMatch ? queueCooldownButtons.get(actionMatch[1]) || null : null;
  },
  querySelectorAll() { return []; }
};
documentStub.querySelector = (selector) => selector === '[data-live-pvp-root]' ? queueCooldownRootStub : null;
PVPScene.updateLiveButtons('idle', false, null);
assert.equal(queueCooldownButtons.get('join-queue').disabled, false, 'queue cooldown should keep retry join button enabled');
assert.equal(queueCooldownButtons.get('join-queue').textContent, '60s 后重试', 'queue cooldown should relabel join button with retry countdown');
assert.equal(queueCooldownButtons.get('practice-live').disabled, false, 'queue cooldown should enable no-score practice');
documentStub.querySelector = oldDocumentQuerySelector;

const expiredQueueCooldownState = JSON.parse(JSON.stringify(queueCooldownState));
expiredQueueCooldownState.lastError.matchmakingGuard.retryAt = Date.now() - 1000;
expiredQueueCooldownState.lastError.matchmakingGuard.cooldownRemainingMs = 0;
PVPScene.getLiveSession = () => ({ getState: () => expiredQueueCooldownState });
const expiredQueueCooldownCountdown = PVPScene.getLiveQueueCooldownCountdown(expiredQueueCooldownState);
assert.equal(expiredQueueCooldownCountdown?.remainingSeconds, 0, 'expired queue cooldown countdown should not keep showing one more second');
assert.equal(expiredQueueCooldownCountdown?.buttonText, '入队', 'expired queue cooldown countdown should restore normal queue copy');
assert.match(expiredQueueCooldownCountdown?.hint || '', /冷却已结束/, 'expired queue cooldown should tell the player they can queue again');
assert.equal(PVPScene.isLiveEntrySafeguardBlocked(expiredQueueCooldownState), false, 'expired queue cooldown should not keep live entry safeguard blocked');
const expiredQueueCooldownButtons = new Map([
  ['join-queue', { disabled: true, textContent: '60s 后重试', querySelector() { return null; } }],
  ['practice-live', { disabled: false, textContent: '问道练习', querySelector() { return null; } }],
]);
const expiredQueueCooldownRootStub = {
  querySelector(selector) {
    const actionMatch = String(selector || '').match(/^\[data-live-action="([^"]+)"\]$/);
    return actionMatch ? expiredQueueCooldownButtons.get(actionMatch[1]) || null : null;
  },
  querySelectorAll() { return []; }
};
documentStub.querySelector = (selector) => selector === '[data-live-pvp-root]' ? expiredQueueCooldownRootStub : null;
PVPScene.updateLiveButtons('idle', false, null);
assert.equal(expiredQueueCooldownButtons.get('join-queue').textContent, '入队', 'expired queue cooldown should relabel retry button back to queue');
assert.equal(expiredQueueCooldownButtons.get('practice-live').disabled, true, 'expired queue cooldown should hide the cooldown-only no-score practice action');
documentStub.querySelector = oldDocumentQuerySelector;

scheduledIntervals.length = 0;
clearedTimers.length = 0;
nextTimerId = 1;
let cooldownTickerRenderCalls = 0;
const previousRenderLivePanelForCooldownTicker = PVPScene.renderLivePanel;
const tickerQueueCooldownState = JSON.parse(JSON.stringify(queueCooldownState));
tickerQueueCooldownState.lastError.matchmakingGuard.retryAt = Date.now() + 3000;
PVPScene.getLiveSession = () => ({ getState: () => tickerQueueCooldownState });
PVPScene.renderLivePanel = () => {
  cooldownTickerRenderCalls += 1;
};
PVPScene.syncLiveQueueCooldownTicker('idle', tickerQueueCooldownState);
PVPScene.syncLiveQueueCooldownTicker('idle', tickerQueueCooldownState);
assert.deepEqual(
  scheduledIntervals.map(entry => entry.intervalMs),
  [1000],
  'queue cooldown ticker should schedule one 1s refresh interval while blocked',
);
scheduledIntervals[0].callback();
assert.equal(cooldownTickerRenderCalls, 1, 'queue cooldown ticker should rerender so visible seconds keep moving');
tickerQueueCooldownState.lastError.matchmakingGuard.retryAt = Date.now() - 1000;
scheduledIntervals[0].callback();
assert.deepEqual(clearedTimers, [1], 'queue cooldown ticker should stop after the retry time has passed');
assert.equal(PVPScene.liveQueueCooldownTimer, null, 'queue cooldown ticker should clear the active timer handle after expiry');
PVPScene.activeTab = 'ranking';
tickerQueueCooldownState.lastError.matchmakingGuard.retryAt = Date.now() + 3000;
PVPScene.syncLiveQueueCooldownTicker('idle', tickerQueueCooldownState);
assert.equal(scheduledIntervals.length, 1, 'queue cooldown ticker should not restart while the live tab is inactive');
PVPScene.activeTab = 'live';
PVPScene.renderLivePanel = previousRenderLivePanelForCooldownTicker;
scheduledIntervals.length = 0;
clearedTimers.length = 0;
nextTimerId = 1;

let cancelLiveQueueRenderCalls = 0;
let cancelLiveQueueState = {
  phase: 'waiting',
  queueTicket: 'pvplq-ui-cancel',
  matchId: '',
  lastError: null,
  stateView: null,
  lastEvents: []
};
PVPScene.liveInlineHint = '';
PVPScene.liveLongWaitPollUntil = 12345;
PVPScene.renderLivePanel = () => {
  cancelLiveQueueRenderCalls += 1;
};
PVPScene.getLiveSession = () => ({
  getState: () => cancelLiveQueueState,
  cancelQueue: async () => {
    cancelLiveQueueState = {
      phase: 'idle',
      queueTicket: '',
      matchId: '',
      lastError: {
        reason: 'queue_cancelled',
        message: '已退出真人排位队列；可稍后重试或先进入问道练习。'
      },
      stateView: null,
      lastEvents: []
    };
    return cancelLiveQueueState;
  }
});
await PVPScene.cancelLiveQueue();
assert.equal(PVPScene.liveLongWaitPollUntil, 0, 'cancel queue should clear long-wait polling window');
assert.equal(cancelLiveQueueRenderCalls, 1, 'cancel queue should rerender after returning to idle');
assert.match(PVPScene.liveInlineHint, /已退出真人排位队列/, 'cancel queue should expose an immediate player-visible cancellation hint');

let cancelCooldownState = {
  phase: 'waiting',
  queueTicket: 'pvplq-ui-cancel-cooldown',
  matchId: '',
  lastError: null,
  stateView: null,
  lastEvents: []
};
PVPScene.liveInlineHint = '旧取消提示';
PVPScene.getLiveSession = () => ({
  getState: () => cancelCooldownState,
  cancelQueue: async () => {
    cancelCooldownState = JSON.parse(JSON.stringify(queueCooldownState));
    cancelCooldownState.lastError.matchmakingGuard.retryAt = Date.now() + 60000;
    cancelCooldownState.lastError.matchmakingGuard.cooldownRemainingMs = 60000;
    cancelCooldownState.lastError.message = '频繁取消冷却触发真人排位短暂冷却；可先进入问道练习，不写正式积分。';
    return cancelCooldownState;
  }
});
await PVPScene.cancelLiveQueue();
assert.equal(PVPScene.liveInlineHint, '', 'cancel-triggered cooldown should let the live countdown hint render instead of freezing static copy');
const cancelCooldownCountdown = PVPScene.getLiveQueueCooldownCountdown(cancelCooldownState);
assert.match(cancelCooldownCountdown?.hint || '', /剩余 60 秒/, 'cancel-triggered cooldown should immediately expose remaining seconds');
assert.equal(PVPScene.isLiveEntrySafeguardBlocked(cancelCooldownState), true, 'cancel-triggered cooldown should activate entry safeguard practice immediately');
PVPScene.renderLivePanel = previousRenderLivePanelForCooldownTicker;

const recentOpponentWaitingState = {
  phase: 'waiting',
  queueTicket: 'pvplq-ui-recent-opponent',
  matchId: '',
  waitingReport: {
    reportVersion: 'pvp-live-waiting-report-v1',
    waitMs: 6000,
    longWaitThresholdMs: 120000,
    longWait: false,
    message: '刚刚交手的近期对手会被暂时跳过，正在为你换一位真人；不会自动切残影。',
    safeguards: ['real_player_only', 'recent_opponent_suppression', 'no_score_change'],
    actions: [
      { id: 'continue_waiting', label: '继续等待', detail: '继续等待真人，不自动切残影。' },
      { id: 'accept_wide_match', label: '接受宽分差', detail: '仅在双方都确认后，才允许 200-399 分差真人局。' },
      { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' },
      { id: 'cancel_queue', label: '取消匹配', detail: '取消本次排队，不影响正式积分。' }
    ]
  },
  stateView: null,
  lastEvents: []
};
const recentOpponentWaitingMarkup = PVPScene.renderLiveWaitingReport(recentOpponentWaitingState);
assert.match(
  recentOpponentWaitingMarkup,
  /匹配质量护栏|近期对手/,
  'live UI should render recent-opponent waiting report before the long-wait threshold',
);
assert.match(
  recentOpponentWaitingMarkup,
  /data-live-waiting-action="accept-wide-match"/,
  'recent-opponent waiting report should preserve explicit wide-match consent action',
);
assert.match(
  recentOpponentWaitingMarkup,
  /<button[^>]*data-live-waiting-action="accept-wide-match"[^>]*onclick="PVPScene\.acceptLiveWideMatch\(\)"/,
  'unaccepted wide-match consent action should remain a clickable accept button',
);
const acceptedWideWaitingState = {
  ...recentOpponentWaitingState,
  queueTicket: 'pvplq-ui-wide-consent',
  waitingReport: {
    ...recentOpponentWaitingState.waitingReport,
    wideMatchConsent: {
      reportVersion: 'pvp-live-wide-match-consent-v1',
      viewerAccepted: true,
      requiresBothPlayers: true,
      requiredAcceptedPlayers: 2,
      acceptedPlayerCount: 1,
      candidatePoolSize: 2,
      matchReady: false,
      status: 'waiting_for_peer',
      detail: '你已确认接受宽分差，仍需对方也确认才会放行 200-399 分差真人局。'
    }
  }
};
const acceptedWideReport = PVPScene.getLiveWaitingReport(acceptedWideWaitingState);
assert.equal(
  acceptedWideReport?.wideMatchConsent?.viewerAccepted,
  true,
  'live UI waiting report should preserve viewer wide-match consent state',
);
const acceptedWideMarkup = PVPScene.renderLiveWaitingReport(acceptedWideWaitingState);
assert.match(
  acceptedWideMarkup,
  /data-live-wide-match-consent-status="waiting_for_peer"/,
  'accepted wide-match waiting report should expose a stable consent status in the DOM',
);
assert.match(
  acceptedWideMarkup,
  /已确认宽分差/,
  'accepted wide-match waiting report should render confirmation instead of another generic CTA',
);
assert.doesNotMatch(
  acceptedWideMarkup,
  /onclick="PVPScene\.acceptLiveWideMatch\(\)"/,
  'accepted wide-match waiting report should not keep a repeated accept button',
);
const ordinaryWideWaitingState = {
  ...acceptedWideWaitingState,
  queueTicket: 'pvplq-ui-wide-only',
  waitingReport: {
    ...acceptedWideWaitingState.waitingReport,
    message: '你已确认接受宽分差，仍需对方也确认才会放行。',
    safeguards: ['real_player_only', 'no_score_change'],
    protectionReason: '',
    releaseMode: '',
    longWait: false
  }
};
const ordinaryWideMarkup = PVPScene.renderLiveWaitingReport(ordinaryWideWaitingState);
assert.match(
  ordinaryWideMarkup,
  /已确认宽分差/,
  'ordinary wide-match waiting_for_peer should render even without long-wait or quality safeguards',
);
assert.match(
  ordinaryWideMarkup,
  /data-live-wide-match-consent-status="waiting_for_peer"/,
  'ordinary wide-match waiting_for_peer should keep the stable consent DOM status',
);
assert.match(
  ordinaryWideMarkup,
  /宽分差确认\s*1\/2/,
  'ordinary wide-match waiting_for_peer should show accepted-player progress',
);
assert.match(
  ordinaryWideMarkup,
  /候选池\s*2/,
  'ordinary wide-match waiting_for_peer should show candidate-pool size',
);
const recentOpponentButtons = new Map([
  ['join-queue', { disabled: true, textContent: '入队', querySelector() { return null; } }],
  ['practice-live', { disabled: true, textContent: '问道练习', querySelector() { return null; } }],
  ['cancel-queue', { disabled: true, textContent: '取消匹配', querySelector() { return null; } }],
]);
const recentOpponentRootStub = {
  querySelector(selector) {
    const actionMatch = String(selector || '').match(/^\[data-live-action="([^"]+)"\]$/);
    return actionMatch ? recentOpponentButtons.get(actionMatch[1]) || null : null;
  },
  querySelectorAll() { return []; }
};
documentStub.querySelector = (selector) => selector === '[data-live-pvp-root]' ? recentOpponentRootStub : null;
PVPScene.getLiveSession = () => ({ getState: () => recentOpponentWaitingState });
PVPScene.updateLiveButtons('waiting', false, null);
assert.equal(recentOpponentButtons.get('practice-live').disabled, false, 'recent-opponent waiting safeguard should keep no-score practice available');
assert.equal(recentOpponentButtons.get('cancel-queue').disabled, false, 'recent-opponent waiting safeguard should keep cancellation available');
const recentOpponentPracticeScenario = PVPScene.buildLiveWaitingPracticeScenario(recentOpponentWaitingState);
assert.equal(
  recentOpponentPracticeScenario?.finishReason,
  'recent_opponent_suppression',
  'recent-opponent waiting safeguard should create a no-score practice handoff scenario',
);
documentStub.querySelector = oldDocumentQuerySelector;

const lowSampleWaitingState = {
  phase: 'waiting',
  queueTicket: 'pvplq-ui-low-sample',
  matchId: '',
  waitingReport: {
    reportVersion: 'pvp-live-waiting-report-v1',
    waitMs: 5000,
    longWaitThresholdMs: 120000,
    longWait: false,
    protectionReason: 'low_sample_protection',
    releaseMode: 'need_third_player',
    releaseAt: Date.now() + 115000,
    releaseInMs: 115000,
    requiresPoolSize: 3,
    candidatePoolSize: 2,
    currentEligibleActions: ['continue_waiting', 'accept_wide_match', 'practice', 'cancel_queue'],
    message: '低样本保护正在优先寻找更稳妥的真人对手；可继续等待、接受宽分差或先进入问道练习，不会自动切残影。',
    safeguards: ['real_player_only', 'low_sample_protection', 'no_score_change'],
    actions: [
      { id: 'continue_waiting', label: '继续等待', detail: '继续等待真人，不自动切残影。' },
      { id: 'accept_wide_match', label: '接受宽分差', detail: '仅在双方都确认后，才允许 200-399 分差真人局。' },
      { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' },
      { id: 'cancel_queue', label: '取消匹配', detail: '取消本次排队，不影响正式积分。' }
    ]
  },
  stateView: null,
  lastEvents: []
};
const lowSampleWaitingMarkup = PVPScene.renderLiveWaitingReport(lowSampleWaitingState);
assert.match(
  lowSampleWaitingMarkup,
  /匹配质量护栏|匹配样本保护|低样本保护/,
  'live UI should render low-sample waiting report before the long-wait threshold',
);
assert.match(
  lowSampleWaitingMarkup,
  /data-live-waiting-action="accept-wide-match"/,
  'low-sample waiting report should preserve explicit wide-match consent action',
);
assert.match(
  lowSampleWaitingMarkup,
  /等待更多真人|放行剩余/,
  'live UI low-sample waiting report should map release mode into player copy',
);
assert.match(
  lowSampleWaitingMarkup,
  /继续等待.*接受宽分差.*问道练习.*取消匹配/s,
  'live UI low-sample waiting report should map eligible actions into player copy',
);
assert.doesNotMatch(
  lowSampleWaitingMarkup,
  /need_third_player|continue_waiting|accept_wide_match|cancel_queue/,
  'live UI low-sample waiting report should not render raw waiting protocol enum values',
);
const lowSamplePracticeScenario = PVPScene.buildLiveWaitingPracticeScenario(lowSampleWaitingState);
assert.equal(
  lowSamplePracticeScenario?.finishReason,
  'low_sample_protection',
  'low-sample waiting safeguard should create a no-score practice handoff scenario',
);

let waitingPracticeState = JSON.parse(JSON.stringify(lowSampleWaitingState));
waitingPracticeState.queueTicket = 'pvplq-ui-waiting-practice-cancelled';
let waitingPracticeDrillScenario = null;
let waitingPracticeFocus = null;
let waitingPracticeRefreshCalls = 0;
const previousGameForWaitingPractice = PVPScene.context.game;
const previousRenderForWaitingPractice = PVPScene.renderLivePanel;
const previousRefreshForWaitingPractice = PVPScene.refreshLiveMatch;
PVPScene.context.game = {
  async ensureChallengeHubLoaded() {},
  setObservatoryTrainingFocus(focus) {
    waitingPracticeFocus = focus;
  },
  beginPvpLiveDrillScenario(scenario) {
    waitingPracticeDrillScenario = scenario;
    return true;
  }
};
PVPScene.renderLivePanel = () => {};
PVPScene.refreshLiveMatch = async () => {
  waitingPracticeRefreshCalls += 1;
  return waitingPracticeState;
};
PVPScene.liveDrillScenario = {
  reportVersion: 'pvp-live-drill-scenario-v1',
  sourceMatchId: 'entry_safeguard:connection_timeout',
  finishReason: 'queue_cooldown'
};
PVPScene.getLiveSession = () => ({
  getState: () => waitingPracticeState,
  cancelQueue: async () => {
    waitingPracticeState = {
      phase: 'idle',
      queueTicket: '',
      matchId: '',
      lastError: {
        reason: 'queue_cancelled',
        message: '已退出真人排位队列；可稍后重试或先进入问道练习。'
      },
      stateView: null,
      lastEvents: []
    };
    return waitingPracticeState;
  }
});
const waitingPracticeCommitted = await PVPScene.commitLiveWaitingPracticeHandoff();
assert.equal(waitingPracticeCommitted?.finishReason, 'low_sample_protection', 'waiting practice handoff should still open after a readable queue_cancelled receipt');
assert.equal(waitingPracticeDrillScenario?.sourceMatchId, 'waiting:pvplq-ui-waiting-practice-cancelled', 'waiting practice should replace stale entry-safeguard drill scenario');
assert.equal(waitingPracticeFocus?.sourceRunId, 'pvp_live:waiting:pvplq-ui-waiting-practice-cancelled', 'waiting practice should replace stale training focus');
assert.equal(waitingPracticeRefreshCalls, 0, 'waiting practice should not treat queue_cancelled as a cancel failure');
PVPScene.context.game = previousGameForWaitingPractice;
PVPScene.renderLivePanel = previousRenderForWaitingPractice;
PVPScene.refreshLiveMatch = previousRefreshForWaitingPractice;

let currentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-heartbeat',
  stateView: {
    connectionReport: {
      heartbeatIntervalMs: 1200
    }
  }
};
let heartbeatCalls = 0;
let renderCalls = 0;

PVPScene.getLiveSession = () => ({
  getState: () => currentState,
  async heartbeat() {
    heartbeatCalls += 1;
    currentState = {
      ...currentState,
      stateView: {
        ...currentState.stateView,
        connectionReport: {
          heartbeatIntervalMs: 2400
        }
      }
    };
  }
});
PVPScene.renderLivePanel = () => {
  renderCalls += 1;
};

const originalSendLiveHeartbeat = PVPScene.sendLiveHeartbeat;
let immediateHeartbeatCalls = 0;
PVPScene.sendLiveHeartbeat = async () => {
  immediateHeartbeatCalls += 1;
};

PVPScene.startLiveHeartbeat();
await Promise.resolve();
assert.deepEqual(
  scheduledIntervals.map(entry => entry.intervalMs),
  [1200],
  'startLiveHeartbeat runtime should schedule the server heartbeat interval',
);
assert.equal(PVPScene.liveHeartbeatIntervalMs, 1200, 'scene should remember the active heartbeat interval');
assert.equal(immediateHeartbeatCalls, 1, 'startLiveHeartbeat should still send one immediate heartbeat');

PVPScene.startLiveHeartbeat();
await Promise.resolve();
assert.equal(scheduledIntervals.length, 1, 'startLiveHeartbeat runtime should not stack duplicate timers for the same interval');
assert.equal(clearedTimers.length, 0, 'same-interval heartbeat start should not clear and rebuild the timer');

currentState = {
  ...currentState,
  stateView: {
    ...currentState.stateView,
    connectionReport: {
      heartbeatIntervalMs: 2400
    }
  }
};
PVPScene.startLiveHeartbeat();
await Promise.resolve();
assert.deepEqual(
  scheduledIntervals.map(entry => entry.intervalMs),
  [1200, 2400],
  'startLiveHeartbeat runtime should rebuild timer when the server interval changes',
);
assert.deepEqual(clearedTimers, [1], 'server interval change should clear the old heartbeat timer');
assert.equal(PVPScene.liveHeartbeatIntervalMs, 2400, 'scene should retain the rebuilt heartbeat interval');

PVPScene.stopLiveHeartbeat();
scheduledIntervals.length = 0;
clearedTimers.length = 0;
nextTimerId = 1;
currentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-heartbeat',
  stateView: {
    connectionReport: {
      heartbeatIntervalMs: 1200
    }
  }
};
PVPScene.sendLiveHeartbeat = async () => {};
PVPScene.startLiveHeartbeat();
await Promise.resolve();

PVPScene.sendLiveHeartbeat = originalSendLiveHeartbeat;
await PVPScene.sendLiveHeartbeat();
assert.equal(heartbeatCalls, 1, 'sendLiveHeartbeat runtime should call session heartbeat');
assert.equal(renderCalls, 1, 'sendLiveHeartbeat runtime should rerender after heartbeat state sync');
assert.deepEqual(
  scheduledIntervals.map(entry => entry.intervalMs),
  [1200, 2400],
  'sendLiveHeartbeat runtime should rebuild heartbeat timer after receiving a new server interval',
);
assert.deepEqual(clearedTimers, [1], 'sendLiveHeartbeat runtime should clear stale timer after server interval changes');

PVPScene.stopLiveHeartbeat();
scheduledIntervals.length = 0;
clearedTimers.length = 0;
nextTimerId = 1;

let foregroundState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-foreground',
  realtimeStatus: 'reconnecting',
  stateView: {
    matchId: 'pvpm-ui-runtime-foreground',
    status: 'active',
    stateVersion: 11,
    currentSeat: 'A',
    connectionReport: {
      heartbeatIntervalMs: 1200
    }
  }
};
let foregroundResumeCalls = 0;
let foregroundHeartbeatCalls = 0;
let foregroundRenderCalls = 0;
PVPScene.liveLifecycleBound = false;
PVPScene.liveForegroundResumeQueued = false;
PVPScene.liveForegroundResumeTimer = null;
PVPScene.liveHeartbeatTimer = null;
PVPScene.liveHeartbeatIntervalMs = 0;
PVPScene.getLiveSession = () => ({
  getState: () => foregroundState,
  connectRealtime: () => true,
  joinRealtimeMatch: () => true,
  resumeRealtime: (matchId) => {
    foregroundResumeCalls += 1;
    assert.equal(matchId, 'pvpm-ui-runtime-foreground', 'foreground resume should target the active live match');
    return true;
  },
  heartbeatRealtime: () => false,
  heartbeat: async () => {
    foregroundHeartbeatCalls += 1;
    foregroundState = {
      ...foregroundState,
      realtimeStatus: 'connected'
    };
  },
  disconnectRealtime: () => {}
});
PVPScene.renderLivePanel = () => {
  foregroundRenderCalls += 1;
};
PVPScene.startLiveHeartbeat({ sendImmediately: false });
assert.ok((documentListeners.get('visibilitychange') || []).length > 0, 'live UI foreground resume should bind document visibilitychange');
assert.ok((windowListeners.get('focus') || []).length > 0, 'live UI foreground resume should bind window focus');
assert.ok((windowListeners.get('pageshow') || []).length > 0, 'live UI foreground resume should bind window pageshow');

documentStub.hidden = true;
dispatchListeners(documentListeners, 'visibilitychange');
await Promise.resolve();
await Promise.resolve();
assert.equal(foregroundResumeCalls, 0, 'live UI foreground resume should ignore hidden visibilitychange');
assert.equal(foregroundHeartbeatCalls, 0, 'live UI foreground resume should not heartbeat while the document is hidden');

documentStub.hidden = false;
dispatchListeners(documentListeners, 'visibilitychange');
dispatchListeners(windowListeners, 'focus');
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
assert.equal(foregroundResumeCalls, 1, 'resume-visible live UI should trigger one immediate realtime resume after hidden-tab throttling');
assert.equal(foregroundHeartbeatCalls, 1, 'live UI foreground resume should send one immediate heartbeat for reconnecting matches');
assert.equal(foregroundRenderCalls, 1, 'live UI foreground resume should rerender after the authority heartbeat');

dispatchListeners(windowListeners, 'focus');
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
assert.equal(foregroundResumeCalls, 1, 'live UI foreground resume should not double-fire focus after the same visibility return');
assert.equal(foregroundHeartbeatCalls, 1, 'live UI foreground resume should not double-heartbeat after a follow-up focus task');

if (PVPScene.liveForegroundResumeTimer) {
  clearTimeout(PVPScene.liveForegroundResumeTimer);
  PVPScene.liveForegroundResumeTimer = null;
}
PVPScene.liveForegroundResumeQueued = false;
PVPScene.activeTab = 'ranking';
dispatchListeners(windowListeners, 'pageshow');
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
assert.equal(foregroundResumeCalls, 1, 'live UI foreground resume should not restart realtime after leaving the live tab');
assert.equal(foregroundHeartbeatCalls, 1, 'live UI foreground resume should not heartbeat after leaving the live tab');
PVPScene.activeTab = 'live';

PVPScene.stopLiveHeartbeat();

let openingActionState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-opening-confirm',
  seatId: 'A',
  realtimeStatus: 'closed',
  stateView: {
    matchId: 'pvpm-ui-runtime-opening-confirm',
    status: 'active',
    stateVersion: 31,
    currentSeat: 'A',
    openingSafeguardReport: {
      reportVersion: 'pvp-live-opening-safeguard-v1',
      status: 'armed',
      currentSeat: 'A',
      viewerSeat: 'A',
      firstSeat: 'A',
      secondSeat: 'B',
      damageBudget: {
        firstSeat: 18,
        secondSeat: 22,
        secondAction: 28,
        currentSeat: 'A',
        currentActionBudget: 18
      },
      openingProtection: {
        minimumHp: 1,
        protectedSeats: ['B'],
        active: true
      },
      secondSeatBuffer: {
        block: 3,
        seatId: 'B',
        active: true
      },
      counterplay: {
        block: 8,
        pendingSeats: ['B'],
        grantedSeats: []
      },
      sourceVisibility: 'public_state',
      usesHiddenInformation: false,
      rankedImpact: 'none'
    },
    openerAssignment: {
      reportVersion: 'pvp-live-opener-assignment-v1',
      sourceVisibility: 'server_authoritative_public_seed',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      firstSeat: 'A',
      secondSeat: 'B',
      viewerSeat: 'A',
      opponentSeat: 'B',
      viewerStarts: true,
      seedTag: 'seed-a',
      queueOrderBinding: false,
      hostBinding: false
    },
    actionPreviewReport: {
      reportVersion: 'pvp-live-action-preview-v1',
      sourceVisibility: 'viewer_public_state',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      viewerSeat: 'A',
      currentSeat: 'A',
      isViewerTurn: true,
      playableCards: [{
        cardInstanceId: 'A-strike-opening',
        cardName: '试探斩',
        targetSeat: 'B',
        rawDamage: 8,
        damageBudget: 18,
        budgetedDamage: 8,
        blockedDamage: 3,
        hpDamage: 5,
        targetHpAfter: 45,
        openingProtection: {
          willTrigger: false,
          minimumHp: 1,
          preventedDamage: 0
        },
        blockGain: 0,
        summaryLine: '试探斩：预算后 8，破盾 3，生命伤害 5，B 预计 45 血。'
      }],
      endTurn: {
        nextSeat: 'B',
        summaryLine: '结束回合后行动权交给 B。'
      }
    },
    duelMomentumReport: {
      reportVersion: 'pvp-live-duel-momentum-v1',
      pressureState: 'opening_window',
      sourceVisibility: 'public_state',
      usesHiddenInformation: false,
      rankedImpact: 'none'
    },
    intentSignalReport: {
      reportVersion: 'pvp-live-intent-signal-v1',
      sourceVisibility: 'public_state_and_public_content',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      viewerSeat: 'A',
      opponentSeat: 'B',
      currentSeat: 'A',
      isViewerTurn: true,
      signalState: 'opening_pressure',
      signalLabel: '公开压迫',
      intentLine: '读牌：A 当前 3 能量，公开牌池上限可造成 15 点生命压力；B 预计保留 35 血。',
      responseLine: '反制窗口：B 仍有开局护体与反打缓冲，先手不能直接终结。',
      threat: {
        actorSeat: 'A',
        targetSeat: 'B',
        actorEnergy: 3,
        publicDamageCeiling: 15,
        targetHpBefore: 50,
        targetHpAfter: 35,
        targetBlock: 3,
        openingProtectionWouldTrigger: false
      },
      responseWindow: {
        defenderSeat: 'B',
        hasOpeningProtection: true,
        hasPendingCounterplay: true,
        counterplayBlock: 8
      },
      safeguards: ['public_card_catalog_only', 'private_card_projection_blocked', 'opening_protection']
    },
    opponent: { seatId: 'B' },
    self: {
      seatId: 'A',
      publicStatuses: [{
        statusId: 'vulnerable_mark',
        label: '破绽',
        sourceSeat: 'B',
        earliestConsumeTurnIndex: 33,
        summary: '破绽已公开；防守方至少拥有一个行动窗口后才可被兑现。'
      }],
      hand: [{ instanceId: 'A-strike-opening', cardId: 'pvp_strike', name: '试探斩' }]
    }
  }
};
const mirroredOpenerText = PVPScene.renderLiveOpeningSafeguardReport({
  openerAssignment: {
    reportVersion: 'pvp-live-opener-assignment-v1',
    sourceVisibility: 'server_authoritative_public_seed',
    firstSeat: 'B',
    secondSeat: 'A',
    viewerSeat: 'A',
    opponentSeat: 'B',
    viewerStarts: false,
    seedTag: 'seed-b',
    queueOrderBinding: false,
    hostBinding: false
  },
  openingSafeguardReport: {
    ...openingActionState.stateView.openingSafeguardReport,
    currentSeat: 'B',
    viewerSeat: 'A',
    firstSeat: 'B',
    secondSeat: 'A',
    damageBudget: {
      ...openingActionState.stateView.openingSafeguardReport.damageBudget,
      currentSeat: 'B',
      currentActionBudget: 18
    },
    secondSeatBuffer: {
      ...openingActionState.stateView.openingSafeguardReport.secondSeatBuffer,
      seatId: 'A'
    }
  }
});
assert.match(mirroredOpenerText, /data-live-opener-assignment/, 'opening safeguard should render the authoritative opener assignment chip');
assert.match(mirroredOpenerText, /对方先手/, 'opening safeguard should translate first seat into viewer/opponent wording');
assert.match(mirroredOpenerText, /服务端种子/, 'opening safeguard should explain that opener assignment is server seeded');
assert.match(mirroredOpenerText, /不绑定排队|不绑定房主/, 'opening safeguard should show opener assignment is not queue or host bound');
assert.match(mirroredOpenerText, /data-live-opening-protection/, 'opening safeguard should expose a dedicated opening-protection marker');
assert.match(mirroredOpenerText, /data-live-opening-counterplay/, 'opening safeguard should expose a dedicated counterplay-window marker');
assert.match(mirroredOpenerText, /防先手秒杀/, 'opening safeguard should tell players the protection prevents first-seat burst kills');
assert.match(mirroredOpenerText, /后手行动窗口/, 'opening safeguard should tell players the counterplay buffer preserves second-seat agency');
const openingActionIntents = [];
PVPScene.liveIntentInFlight = null;
PVPScene.liveOpeningActionConfirm = null;
PVPScene.liveInlineHint = '';
PVPScene.startLiveRealtime = () => {};
PVPScene.getLiveSession = () => ({
  getState: () => openingActionState,
  submitIntent: async (intent) => {
    openingActionIntents.push(intent);
    openingActionState = {
      ...openingActionState,
      stateView: {
        ...openingActionState.stateView,
        stateVersion: openingActionState.stateView.stateVersion + 1,
        currentSeat: intent.intentType === 'end_turn' ? 'B' : openingActionState.stateView.currentSeat,
        duelMomentumReport: {
          ...openingActionState.stateView.duelMomentumReport,
          pressureState: 'reversal_window'
        }
      }
    };
    return openingActionState;
  }
});
const previousDocumentQuerySelectorForOpeningAction = documentStub.querySelector;
const openingHandEl = {
  innerHTML: '',
  textContent: '',
  hidden: false,
  setAttribute() {},
  getAttribute() { return ''; },
  removeAttribute() {},
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const openingEventPanelEl = {
  getAttribute() { return ''; },
  setAttribute() {},
  removeAttribute() {},
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const openingEventLogEl = {
  innerHTML: '',
  textContent: '',
  setAttribute() {},
  getAttribute() { return ''; },
  removeAttribute() {},
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const openingRenderRoot = {
  dataset: {},
  setAttribute() {},
  removeAttribute() {},
  querySelector(selector) {
    if (selector === '[data-live-hand]') return openingHandEl;
    if (selector === '[data-live-event-panel]') return openingEventPanelEl;
    if (selector === '[data-live-event-log]') return openingEventLogEl;
    return null;
  },
  querySelectorAll() { return []; }
};
documentStub.querySelector = (selector) => selector === '[data-live-pvp-root]' ? openingRenderRoot : null;
PVPScene.startLiveHeartbeat = () => {};
PVPScene.renderLivePanel = originalRenderLivePanel;
PVPScene.renderLivePanel();
assert.match(openingHandEl.innerHTML, /data-live-card-preview/, 'active viewer-turn cards should render authoritative preview before the first click');
assert.match(openingHandEl.innerHTML, /预算后\s*8/, 'pre-click card preview should show budgeted damage');
assert.match(openingHandEl.innerHTML, /破盾\s*3/, 'pre-click card preview should show public block absorption');
assert.match(openingHandEl.innerHTML, /生命伤害\s*5/, 'pre-click card preview should show HP damage');
assert.match(openingHandEl.innerHTML, /B\s*预计\s*45\s*血/, 'pre-click card preview should show target HP after the action');
assert.doesNotMatch(openingHandEl.innerHTML, /cardInstanceId|loadoutSnapshot|rating|elo|opponentHand|opponentDeck/i, 'pre-click card preview must not expose hidden payload markers');
const statusMitigationPreviewMarkup = PVPScene.renderLiveCardActionPreview({
  actionPreviewReport: {
    ...openingActionState.stateView.actionPreviewReport,
    playableCards: [{
      cardInstanceId: 'A-guard-response',
      cardName: '护体诀',
      targetSeat: 'A',
      rawDamage: 0,
      damageBudget: 0,
      budgetedDamage: 0,
      blockedDamage: 0,
      hpDamage: 0,
      blockGain: 7,
      selfBlockAfter: 7,
      publicStatusMitigation: {
        statusId: 'vulnerable_mark',
        label: '破绽',
        seatId: 'A',
        sourceSeat: 'B',
        responseWindow: 'status_response_window',
        mitigation: 'cleared'
      },
      summaryLine: '护体诀：自身护盾 +7；清除破绽，阻止后续兑现。'
    }]
  }
}, 'A-guard-response', 'active');
assert.match(statusMitigationPreviewMarkup, /data-live-card-status-mitigation="vulnerable_mark"/, 'status-response mitigation card should carry a direct public mitigation marker');
assert.match(statusMitigationPreviewMarkup, /data-live-card-response-chip/, 'status-response mitigation card should render a dedicated response chip');
assert.match(statusMitigationPreviewMarkup, /响应牌[\s\S]*清除破绽/, 'status-response mitigation card should make the clearable public status visible before click');
assert.doesNotMatch(statusMitigationPreviewMarkup, /cardInstanceId|loadoutSnapshot|rating|elo|opponentHand|opponentDeck|reward/i, 'status-response mitigation marker must not expose hidden payload or reward/rating data');
assert.equal(typeof PVPScene.getLiveCounterplayGuide, 'function', 'live UI should expose a response-window counterplay guide helper');
assert.equal(typeof PVPScene.renderLiveCounterplayGuide, 'function', 'live UI should expose a response-window counterplay guide renderer');
const statusCounterplayGuideView = {
  ...openingActionState.stateView,
  duelMomentumReport: {
    reportVersion: 'pvp-live-duel-momentum-v1',
    sourceVisibility: 'public_state',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    opponentSeat: 'B',
    currentSeat: 'A',
    isViewerTurn: true,
    pressureState: 'status_response_window',
    pressureLabel: '破绽响应窗口',
    agencyLabel: '你的防守响应窗口',
    summaryLine: '局势：你正处于破绽响应窗口，防守牌可阻止后续兑现。',
    counterplayLine: '反制窗口：先清除破绽或补盾，否则下一轮可能被兑现。',
    safeguards: ['status_response_window', 'public_status_mitigation']
  },
  intentSignalReport: {
    reportVersion: 'pvp-live-intent-signal-v1',
    sourceVisibility: 'public_state_and_public_content',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    opponentSeat: 'B',
    currentSeat: 'A',
    isViewerTurn: true,
    signalState: 'status_response_window',
    signalLabel: '破绽响应',
    intentLine: '读牌：对手已给你挂上破绽，下一轮可能兑现。',
    responseLine: '反制窗口：可用防守牌清除破绽；若直接结束回合，后续可能被兑现。',
    safeguards: ['public_card_catalog_only', 'private_card_projection_blocked', 'status_response_window']
  },
  actionPreviewReport: {
    ...openingActionState.stateView.actionPreviewReport,
    viewerSeat: 'A',
    currentSeat: 'A',
    isViewerTurn: true,
    sourceVisibility: 'viewer_public_state',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    playableCards: [{
      cardInstanceId: 'A-guard-response',
      cardName: '护体诀',
      targetSeat: 'A',
      rawDamage: 0,
      damageBudget: 0,
      budgetedDamage: 0,
      blockedDamage: 0,
      hpDamage: 0,
      blockGain: 7,
      selfBlockAfter: 7,
      publicStatusMitigation: {
        statusId: 'vulnerable_mark',
        label: '破绽',
        seatId: 'A',
        sourceSeat: 'B',
        responseWindow: 'status_response_window',
        mitigation: 'cleared'
      },
      summaryLine: '护体诀：自身护盾 +7；清除破绽，阻止后续兑现。'
    }],
    endTurn: {
      nextSeat: 'B',
      summaryLine: '结束回合后行动权交给 B；破绽仍可能被后续兑现。'
    }
  }
};
const statusCounterplayGuide = PVPScene.getLiveCounterplayGuide(statusCounterplayGuideView, 'active');
assert.equal(statusCounterplayGuide.reportVersion, 'pvp-live-counterplay-guide-v1', 'counterplay guide should expose a stable report version');
assert.equal(statusCounterplayGuide.sourceVisibility, 'public_state_and_public_content', 'counterplay guide should aggregate only public state and public card content');
assert.equal(statusCounterplayGuide.usesHiddenInformation, false, 'counterplay guide should be hidden-info safe');
assert.equal(statusCounterplayGuide.rankedImpact, 'none', 'counterplay guide must not affect ranked state');
assert.equal(statusCounterplayGuide.advisoryOnly, true, 'counterplay guide should explicitly stay advisory-only');
assert.equal(statusCounterplayGuide.pressureState, 'status_response_window', 'counterplay guide should preserve the public response-window state');
assert.equal(statusCounterplayGuide.responseCardCount, 1, 'counterplay guide should count public response cards');
assert.deepEqual(statusCounterplayGuide.responseLabels, ['清除破绽', '补盾 +7'], 'counterplay guide should summarize public response choices without exposing ids');
const statusCounterplayGuideMarkup = PVPScene.renderLiveCounterplayGuide(statusCounterplayGuideView, 'active');
assert.match(statusCounterplayGuideMarkup, /data-live-counterplay-guide-line/, 'counterplay guide should render readable guide lines');
assert.match(statusCounterplayGuideMarkup, /反制建议/, 'counterplay guide should label itself as advice');
assert.match(statusCounterplayGuideMarkup, /1\s*张/, 'counterplay guide should show the public response-card count');
assert.match(statusCounterplayGuideMarkup, /清除破绽/, 'counterplay guide should surface the public status mitigation route');
assert.match(statusCounterplayGuideMarkup, /不要直接结束回合|先出响应牌/, 'counterplay guide should warn before giving up the response window');
assert.match(statusCounterplayGuideMarkup, /公开状态和公开卡面|不写正式积分|不代打/, 'counterplay guide should render source, advisory-only, and ranked-impact boundaries');
assert.doesNotMatch(statusCounterplayGuideMarkup, /cardInstanceId|cardId|instanceId|hand|deck|loadoutSnapshot|reward|rating|elo|token/i, 'counterplay guide rendering must not expose hidden ids or rewards');
assert.equal(typeof PVPScene.getLiveActionWindowReceipt, 'function', 'live UI should expose an action-window receipt helper');
assert.equal(typeof PVPScene.renderLiveActionWindowReceipt, 'function', 'live UI should expose an action-window receipt renderer');
const statusActionWindowReceipt = PVPScene.getLiveActionWindowReceipt(statusCounterplayGuideView, 'active');
assert.equal(statusActionWindowReceipt.reportVersion, 'pvp-live-action-window-receipt-v1', 'action-window receipt should expose a stable report version');
assert.equal(statusActionWindowReceipt.sourceVisibility, 'public_state_and_public_content', 'action-window receipt should aggregate only public state and public card content');
assert.equal(statusActionWindowReceipt.usesHiddenInformation, false, 'action-window receipt should be hidden-info safe');
assert.equal(statusActionWindowReceipt.rankedImpact, 'none', 'action-window receipt must not affect ranked state');
assert.equal(statusActionWindowReceipt.advisoryOnly, true, 'action-window receipt should explicitly stay advisory-only');
assert.equal(statusActionWindowReceipt.pressureState, 'status_response_window', 'action-window receipt should preserve the public response-window state');
assert.equal(statusActionWindowReceipt.responseCardCount, 1, 'action-window receipt should count public response cards');
assert.match(statusActionWindowReceipt.primaryLine, /有效行动窗口|响应窗口/, 'action-window receipt should name the active response window');
assert.match(statusActionWindowReceipt.riskLine, /结束回合|放弃|交出/, 'action-window receipt should warn about giving up the response window');
assert.match(statusActionWindowReceipt.boundaryLine, /只提示|不代打|不改变正式积分/, 'action-window receipt should state advisory and ranked boundaries');
const statusActionWindowReceiptMarkup = PVPScene.renderLiveActionWindowReceipt(statusCounterplayGuideView, 'active');
assert.match(statusActionWindowReceiptMarkup, /data-live-action-window-receipt-line/, 'action-window receipt should render readable receipt lines');
assert.match(statusActionWindowReceiptMarkup, /行动窗口回执/, 'action-window receipt should label itself as a receipt');
assert.match(statusActionWindowReceiptMarkup, /有效行动窗口|响应窗口/, 'action-window receipt should surface the active response window');
assert.match(statusActionWindowReceiptMarkup, /1\s*张/, 'action-window receipt should show the public response-card count');
assert.match(statusActionWindowReceiptMarkup, /清除破绽|补盾 \+7/, 'action-window receipt should surface public response choices');
assert.match(statusActionWindowReceiptMarkup, /结束回合|放弃|交出/, 'action-window receipt should warn before giving up the response window');
assert.match(statusActionWindowReceiptMarkup, /不含隐藏信息|不改变正式积分|不代打|只提示/, 'action-window receipt should render source, advisory-only, and ranked-impact boundaries');
assert.doesNotMatch(statusActionWindowReceiptMarkup, /cardInstanceId|cardId|instanceId|hand|deck|loadoutSnapshot|reward|rating|elo|token/i, 'action-window receipt rendering must not expose hidden ids or rewards');
assert.equal(
  PVPScene.getLiveActionWindowReceipt({
    ...statusCounterplayGuideView,
    actionPreviewReport: {
      ...statusCounterplayGuideView.actionPreviewReport,
      usesHiddenInformation: true
    }
  }, 'active'),
  null,
  'action-window receipt must reject unsafe action preview sources',
);
assert.equal(
  PVPScene.getLiveActionWindowReceipt(statusCounterplayGuideView, 'finished'),
  null,
  'action-window receipt must not render outside active live phase',
);
assert.equal(
  PVPScene.getLiveActionWindowReceipt({
    ...statusCounterplayGuideView,
    duelMomentumReport: {
      ...statusCounterplayGuideView.duelMomentumReport,
      currentSeat: 'B',
      isViewerTurn: false
    }
  }, 'active'),
  null,
  'action-window receipt must reject mixed stale reports that disagree on whose turn it is',
);
assert.equal(
  PVPScene.getLiveCounterplayGuide({
    ...statusCounterplayGuideView,
    actionPreviewReport: {
      ...statusCounterplayGuideView.actionPreviewReport,
      usesHiddenInformation: true
    }
  }, 'active'),
  null,
  'counterplay guide must reject unsafe action preview sources',
);
assert.equal(
  PVPScene.getLiveCounterplayGuide(statusCounterplayGuideView, 'finished'),
  null,
  'counterplay guide must not render outside active live phase',
);
assert.equal(
  PVPScene.getLiveCounterplayGuide({
    ...statusCounterplayGuideView,
    actionPreviewReport: {
      ...statusCounterplayGuideView.actionPreviewReport,
      currentSeat: 'B',
      isViewerTurn: false
    },
    duelMomentumReport: {
      ...statusCounterplayGuideView.duelMomentumReport,
      currentSeat: 'B',
      isViewerTurn: false
    },
    intentSignalReport: {
      ...statusCounterplayGuideView.intentSignalReport,
      currentSeat: 'B',
      isViewerTurn: false
    }
  }, 'active'),
  null,
  'counterplay guide must not expose current-player advice when it is not the viewer turn',
);
assert.equal(
  PVPScene.getLiveCounterplayGuide({
    ...statusCounterplayGuideView,
    duelMomentumReport: {
      ...statusCounterplayGuideView.duelMomentumReport,
      pressureState: 'neutral',
      counterplayLine: '行动窗口：常规行动。'
    },
    intentSignalReport: {
      ...statusCounterplayGuideView.intentSignalReport,
      signalState: 'closed'
    }
  }, 'active'),
  null,
  'counterplay guide must not render unsupported pressure states even when response cards exist',
);
assert.equal(
  PVPScene.getLiveCounterplayGuide({
    ...statusCounterplayGuideView,
    duelMomentumReport: {
      ...statusCounterplayGuideView.duelMomentumReport,
      currentSeat: 'B',
      isViewerTurn: false
    }
  }, 'active'),
  null,
  'counterplay guide must reject mixed stale reports that disagree on whose turn it is',
);
const forbiddenCounterplayGuideMarkup = PVPScene.renderLiveCounterplayGuide({
  ...statusCounterplayGuideView,
  duelMomentumReport: {
    ...statusCounterplayGuideView.duelMomentumReport,
    counterplayLine: '隐藏 hand deck cardInstanceId reward rating 不应回显'
  },
  intentSignalReport: {
    ...statusCounterplayGuideView.intentSignalReport,
    responseLine: '隐藏 token opponentDeck 不应回显'
  },
  actionPreviewReport: {
    ...statusCounterplayGuideView.actionPreviewReport,
    endTurn: {
      nextSeat: 'B',
      summaryLine: '隐藏 cardId instanceId elo 不应回显'
    }
  }
}, 'active');
assert.doesNotMatch(
  forbiddenCounterplayGuideMarkup,
  /cardInstanceId|cardId|instanceId|hand|deck|opponentDeck|reward|rating|elo|token/i,
  'counterplay guide must drop unsafe upstream public-summary lines instead of echoing forbidden tokens',
);
const notViewerTurnState = {
  ...openingActionState,
  stateView: {
    ...openingActionState.stateView,
    currentSeat: 'B',
    actionPreviewReport: {
      ...openingActionState.stateView.actionPreviewReport,
      currentSeat: 'B',
      isViewerTurn: false
    }
  }
};
PVPScene.getLiveSession = () => ({ getState: () => notViewerTurnState });
openingHandEl.innerHTML = '';
PVPScene.renderLivePanel();
assert.doesNotMatch(openingHandEl.innerHTML, /data-live-card-preview/, 'cards should not render stale action previews outside the viewer action turn');
const inactiveStalePreviewState = {
  ...openingActionState,
  phase: 'finished',
  stateView: {
    ...openingActionState.stateView,
    status: 'finished',
    currentSeat: 'A',
    actionPreviewReport: {
      ...openingActionState.stateView.actionPreviewReport,
      currentSeat: 'A',
      isViewerTurn: true
    }
  }
};
PVPScene.getLiveSession = () => ({ getState: () => inactiveStalePreviewState });
openingHandEl.innerHTML = '';
PVPScene.renderLivePanel();
assert.doesNotMatch(openingHandEl.innerHTML, /data-live-card-preview/, 'cards should not render stale action previews after the active phase ends');
documentStub.querySelector = previousDocumentQuerySelectorForOpeningAction;
PVPScene.renderLivePanel = () => {};
PVPScene.getLiveSession = () => ({
  getState: () => openingActionState,
  submitIntent: async (intent) => {
    openingActionIntents.push(intent);
    openingActionState = {
      ...openingActionState,
      stateView: {
        ...openingActionState.stateView,
        stateVersion: openingActionState.stateView.stateVersion + 1,
        currentSeat: intent.intentType === 'end_turn' ? 'B' : openingActionState.stateView.currentSeat,
        duelMomentumReport: {
          ...openingActionState.stateView.duelMomentumReport,
          pressureState: 'reversal_window'
        }
      }
    };
    return openingActionState;
  }
});
await PVPScene.submitLiveCard('A-strike-opening');
assert.equal(openingActionIntents.length, 0, 'first opening-window card click should only arm confirmation and must not submit play_card');
assert.match(PVPScene.liveInlineHint, /再次点击确认出牌/, 'opening-window card confirmation should explain the second click before submitting');
assert.match(PVPScene.liveInlineHint, /首动预算\s*18/, 'opening-window card confirmation should name the current public first-action budget');
assert.match(PVPScene.liveInlineHint, /保底\s*1\s*血/, 'opening-window card confirmation should name opening protection minimum HP');
assert.match(PVPScene.liveInlineHint, /后手护盾\s*B\s*\+3/, 'opening-window card confirmation should name the second-seat public shield');
assert.match(PVPScene.liveInlineHint, /反打缓冲\s*\+8/, 'opening-window card confirmation should name the counterplay buffer before commit');
assert.match(PVPScene.liveInlineHint, /预算后\s*8/, 'opening-window card confirmation should use server action preview budgeted damage');
assert.match(PVPScene.liveInlineHint, /破盾\s*3/, 'opening-window card confirmation should use server action preview blocked damage');
assert.match(PVPScene.liveInlineHint, /生命伤害\s*5/, 'opening-window card confirmation should use server action preview HP damage');
assert.match(PVPScene.liveInlineHint, /B\s*预计\s*45\s*血/, 'opening-window card confirmation should use server action preview target HP');
await PVPScene.submitLiveCard('A-strike-opening');
assert.equal(openingActionIntents.length, 1, 'second opening-window card click should submit exactly one play_card intent');
assert.equal(openingActionIntents[0].intentType, 'play_card', 'confirmed opening-window card click should keep the authoritative play_card intent');
const renderedIntentSignal = PVPScene.renderLiveIntentSignalReport(openingActionState.stateView);
assert.match(renderedIntentSignal, /公开压迫/, 'live UI should render public intent signal label');
assert.match(renderedIntentSignal, /公开牌池上限/, 'live UI intent signal should frame pressure as public card catalog information');
assert.match(renderedIntentSignal, /反制窗口/, 'live UI intent signal should show the counterplay window');
assert.match(renderedIntentSignal, /不含隐藏信息/, 'live UI intent signal should expose no-hidden-information boundary');
assert.doesNotMatch(renderedIntentSignal, /cardInstanceId|loadoutSnapshot|rating|elo|reward/i, 'live UI intent signal must not render hidden payload markers');
const renderedPublicStatuses = PVPScene.renderLivePublicStatuses(openingActionState.stateView.self);
assert.match(renderedPublicStatuses, /破绽/, 'live UI should render public tactical status labels');
assert.match(renderedPublicStatuses, /反制窗口|可兑现/, 'live UI public status should explain the response/payoff window');
assert.doesNotMatch(renderedPublicStatuses, /hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo|reward/i, 'live UI public status chips must not render hidden payload markers');
const mitigatedReceipt = PVPScene.getLiveActionReceiptReport({
  actionReceiptReport: {
    reportVersion: 'pvp-live-action-receipt-v1',
    sourceVisibility: 'authoritative_public_projection',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'B',
    actingSeat: 'B',
    actionType: 'play_card',
    latestSequence: 44,
    cardName: '护体诀',
    statusEffects: {
      mitigated: [{
        statusId: 'vulnerable_mark',
        label: '破绽',
        seatId: 'B',
        sourceSeat: 'A',
        mitigatedBySeat: 'B',
        mitigatedTurnIndex: 12,
        responseWindow: 'defender_turn_before_payoff',
        mitigation: 'guard_response',
        cardInstanceId: 'hidden-response-card',
        sourceCardId: 'hidden-source-card',
        payload: { hand: ['hidden-card'], deck: ['hidden-deck'] },
        loadoutSnapshot: { hidden: true },
        token: 'hidden-status-token'
      }]
    },
    summaryLine: 'B 打出护体诀：不造成伤害；自身护盾 +7；稳住破绽，阻止后续兑现。',
    safeguards: ['public_events', 'self_block', 'public_status_mitigated']
  }
});
assert.equal(mitigatedReceipt.statusEffects.mitigated[0].statusId, 'vulnerable_mark', 'live UI should preserve mitigated public status effects in action receipts');
const mitigatedReceiptMarkup = PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: mitigatedReceipt });
assert.match(mitigatedReceiptMarkup, /data-live-action-status-mitigation="vulnerable_mark"/, 'live UI should render a stable per-status mitigation marker');
assert.match(mitigatedReceiptMarkup, /data-live-action-status-mitigation-state="public_status_mitigated"/, 'live UI should render public status mitigation state');
assert.match(mitigatedReceiptMarkup, /data-live-action-status-mitigation-target="B"/, 'live UI should render mitigated status target seat');
assert.match(mitigatedReceiptMarkup, /data-live-action-status-mitigation-by="B"/, 'live UI should render the public mitigating seat');
assert.match(mitigatedReceiptMarkup, /data-live-action-status-mitigation-response-window="defender_turn_before_payoff"/, 'live UI should render the public response window for status mitigation');
assert.match(mitigatedReceiptMarkup, /data-live-action-status-mitigation-source="authoritative_public_projection"/, 'live UI should render status mitigation public source');
assert.match(mitigatedReceiptMarkup, /data-live-action-status-mitigation-hidden="false"/, 'live UI should mark status mitigation as hidden-info safe');
assert.match(mitigatedReceiptMarkup, /data-live-action-status-mitigation-impact="none"/, 'live UI should mark status mitigation as no ranked impact');
assert.match(mitigatedReceiptMarkup, /data-live-action-status-mitigation-safeguard="public_status_mitigated"/, 'live UI should render status mitigation safeguard marker');
assert.match(mitigatedReceiptMarkup, /稳住回执|稳住破绽|阻止后续兑现/, 'live UI action receipt should explain public status mitigation');
assert.equal(Object.prototype.hasOwnProperty.call(mitigatedReceipt.statusEffects.mitigated[0], 'cardInstanceId'), false, 'live UI mitigated status receipt must drop hidden card instance ids');
assert.equal(Object.prototype.hasOwnProperty.call(mitigatedReceipt.statusEffects.mitigated[0], 'sourceCardId'), false, 'live UI mitigated status receipt must drop hidden source card ids');
assert.equal(Object.prototype.hasOwnProperty.call(mitigatedReceipt.statusEffects.mitigated[0], 'payload'), false, 'live UI mitigated status receipt must drop raw payloads');
assert.equal(Object.prototype.hasOwnProperty.call(mitigatedReceipt.statusEffects.mitigated[0], 'loadoutSnapshot'), false, 'live UI mitigated status receipt must drop loadout snapshots');
assert.equal(Object.prototype.hasOwnProperty.call(mitigatedReceipt.statusEffects.mitigated[0], 'token'), false, 'live UI mitigated status receipt must drop hidden tokens');
assert.doesNotMatch(mitigatedReceiptMarkup, /payload|cardInstanceId|sourceCardId|\bhand\b|hand":\[|deck|loadoutSnapshot|rating|reward|token/i, 'live UI status mitigation rendering must not expose hidden ids, cards, payloads, rewards, or tokens');
const consumedReceipt = PVPScene.getLiveActionReceiptReport({
  actionReceiptReport: {
    reportVersion: 'pvp-live-action-receipt-v1',
    sourceVisibility: 'authoritative_public_projection',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    actingSeat: 'A',
    actionType: 'play_card',
    latestSequence: 45,
    cardName: '破绽回路',
    statusEffects: {
      consumed: [{
        statusId: 'vulnerable_mark',
        label: '破绽',
        seatId: 'B',
        sourceSeat: 'A',
        damageBonus: 6,
        consumedTurnIndex: 4,
        cardInstanceId: 'hidden-status-source',
        sourceCardId: 'hidden-card-source',
        payload: { hand: ['hidden-card'], deck: ['hidden-deck'] },
        loadoutSnapshot: { hidden: true },
        token: 'hidden-status-token'
      }]
    },
    summaryLine: 'A 打出破绽回路：对 B 造成 13 点伤害；消耗破绽，额外伤害 +6。',
    safeguards: ['public_events', 'public_status_consumed']
  }
});
const consumedReceiptMarkup = PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: consumedReceipt });
assert.equal(consumedReceipt.statusEffects.consumed[0].statusId, 'vulnerable_mark', 'live UI should preserve consumed public status effects in action receipts');
assert.equal(consumedReceipt.statusEffects.consumed[0].damageBonus, 6, 'live UI should preserve consumed public status bonus in action receipts');
assert.equal(Object.prototype.hasOwnProperty.call(consumedReceipt.statusEffects.consumed[0], 'cardInstanceId'), false, 'live UI consumed status receipt must drop hidden card instance ids');
assert.equal(Object.prototype.hasOwnProperty.call(consumedReceipt.statusEffects.consumed[0], 'sourceCardId'), false, 'live UI consumed status receipt must drop hidden source card ids');
assert.equal(Object.prototype.hasOwnProperty.call(consumedReceipt.statusEffects.consumed[0], 'payload'), false, 'live UI consumed status receipt must drop raw payloads');
assert.equal(Object.prototype.hasOwnProperty.call(consumedReceipt.statusEffects.consumed[0], 'loadoutSnapshot'), false, 'live UI consumed status receipt must drop loadout snapshots');
assert.equal(Object.prototype.hasOwnProperty.call(consumedReceipt.statusEffects.consumed[0], 'token'), false, 'live UI consumed status receipt must drop hidden tokens');
assert.match(consumedReceiptMarkup, /data-live-action-status-payoff="vulnerable_mark"/, 'live UI should render a stable public status payoff marker');
assert.match(consumedReceiptMarkup, /data-live-action-status-payoff-state="public_status_consumed"/, 'live UI should render public status payoff state');
assert.match(consumedReceiptMarkup, /data-live-action-status-payoff-source="authoritative_public_projection"/, 'live UI should render status payoff public source');
assert.match(consumedReceiptMarkup, /data-live-action-status-payoff-hidden="false"/, 'live UI should mark status payoff as hidden-info safe');
assert.match(consumedReceiptMarkup, /data-live-action-status-payoff-impact="none"/, 'live UI should mark status payoff as no ranked impact');
assert.match(consumedReceiptMarkup, /data-live-action-status-payoff-bonus="6"/, 'live UI should expose the public status payoff bonus amount');
assert.match(consumedReceiptMarkup, /data-live-action-status-payoff-safeguard="public_status_consumed"/, 'live UI should render status payoff safeguard marker');
assert.match(consumedReceiptMarkup, /公开兑现|破绽|\+6|额外伤害/, 'live UI action receipt should explain consumed public status payoff');
assert.doesNotMatch(consumedReceiptMarkup, /payload|cardInstanceId|sourceCardId|\bhand\b|hand":\[|deck|loadoutSnapshot|rating|reward|token/i, 'live UI status payoff rendering must not expose hidden ids, cards, payloads, rewards, or tokens');
const mitigatedEvent = PVPScene.formatLiveEvent({
  eventType: 'status_mitigated',
  actingSeat: 'B',
  publicData: {
    statusId: 'vulnerable_mark',
    label: '破绽',
    seatId: 'B',
    mitigatedBySeat: 'B',
    mitigation: 'guard_response'
  }
});
assert.match(mitigatedEvent.detail, /稳住破绽|阻止后续兑现/, 'live UI event log should explain public status mitigation');
const guardStanceMitigatedReceipt = PVPScene.getLiveActionReceiptReport({
  actionReceiptReport: {
    reportVersion: 'pvp-live-action-receipt-v1',
    sourceVisibility: 'authoritative_public_projection',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    actingSeat: 'B',
    actionType: 'play_card',
    latestSequence: 50,
    cardName: '破阵爆发',
    statusEffects: {
      mitigated: [{
        statusId: 'guard_stance',
        label: '守势',
        seatId: 'A',
        sourceSeat: 'A',
        mitigatedBySeat: 'A',
        preventedDamage: 2,
        mitigation: 'guard_stance_damage_reduction'
      }]
    },
    summaryLine: 'B 打出破阵爆发：预算后 19，破盾 7，生命伤害 10，A 剩余 40 血；守势减伤 2。',
    safeguards: ['public_events', 'public_guard_stance_mitigated']
  }
});
assert.equal(guardStanceMitigatedReceipt.statusEffects.mitigated[0].preventedDamage, 2, 'live UI should preserve guard stance prevented damage');
assert.match(PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: guardStanceMitigatedReceipt }), /守势减伤 2|生命伤害 10/, 'live UI damage receipt should explain guard stance damage reduction');
const guardStanceMitigatedEvent = PVPScene.formatLiveEvent({
  eventType: 'status_mitigated',
  actingSeat: 'B',
  publicData: {
    statusId: 'guard_stance',
    label: '守势',
    seatId: 'A',
    mitigatedBySeat: 'A',
    preventedDamage: 2,
    mitigation: 'guard_stance_damage_reduction'
  }
});
assert.match(guardStanceMitigatedEvent.detail, /守势减伤 2|挡下 2/, 'live UI event log should explain public guard stance damage reduction');
const lethalOpeningProtectionReceipt = PVPScene.getLiveActionReceiptReport({
  actionReceiptReport: {
    reportVersion: 'pvp-live-action-receipt-v1',
    sourceVisibility: 'authoritative_public_projection',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'B',
    actingSeat: 'A',
    actionType: 'play_card',
    latestSequence: 6,
    cardName: '试探斩',
    damage: {
      targetSeat: 'B',
      rawDamage: 20,
      budgetedDamage: 8,
      preventedByBudget: 12,
      blockedDamage: 3,
      hpDamage: 5,
      targetHpAfter: 1
    },
    openingProtection: {
      triggered: true,
      protectedSeat: 'B',
      minimumHp: 1,
      preventedDamage: 6,
      wouldHaveHp: -5
    },
    summaryLine: 'A 打出试探斩：预算后 8，破盾 3，生命伤害 5，B 剩余 1 血；开局护体触发，保底 1 血，挡下 6 点致命伤害。',
    safeguards: ['public_events', 'first_action_budget', 'opening_protection']
  }
});
const renderedLethalOpeningProtectionReceipt = PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: lethalOpeningProtectionReceipt });
assert.match(renderedLethalOpeningProtectionReceipt, /data-live-action-budget-clamp="public_first_action_budget"/, 'lethal opening receipt should expose the first-action budget marker');
assert.match(renderedLethalOpeningProtectionReceipt, /首动预算挡下 12/, 'lethal opening receipt should show budget-prevented damage separately from protection');
assert.match(renderedLethalOpeningProtectionReceipt, /data-live-action-opening-protection="public_opening_protection"/, 'lethal opening receipt should expose the opening-protection marker');
assert.match(renderedLethalOpeningProtectionReceipt, /开局护体保底 1 血|挡下 6/, 'lethal opening receipt should show why the defender was not killed');
assert.doesNotMatch(renderedLethalOpeningProtectionReceipt, /cardInstanceId|sourceCardId|hand|deck|loadoutSnapshot|reward|rating|elo/i, 'opening-protection receipt chips must not expose hidden ids or reward/rating data');
const weakFocusReceipt = PVPScene.getLiveActionReceiptReport({
  actionReceiptReport: {
    reportVersion: 'pvp-live-action-receipt-v1',
    sourceVisibility: 'authoritative_public_projection',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    viewerSeat: 'A',
    actingSeat: 'B',
    actionType: 'play_card',
    latestSequence: 54,
    cardName: '破阵爆发',
    statusEffects: {
      mitigated: [{
        statusId: 'weak_focus',
        label: '虚弱',
        seatId: 'B',
        sourceSeat: 'A',
        mitigatedBySeat: 'A',
        preventedDamage: 2,
        mitigation: 'public_weak_damage_reduction'
      }]
    },
    summaryLine: 'B 打出破阵爆发：预算后 19，破盾 8，生命伤害 7，A 剩余 43 血；虚弱削减 2。',
    safeguards: ['public_events', 'public_weak_focus_mitigated']
  }
});
assert.equal(weakFocusReceipt.statusEffects.mitigated[0].preventedDamage, 2, 'live UI should preserve weak_focus prevented damage');
assert.match(PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: weakFocusReceipt }), /虚弱削减 2|生命伤害 7/, 'live UI damage receipt should explain weak_focus damage reduction');
assert.match(PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: weakFocusReceipt }), /data-live-weak-focus="public_weak_focus"/, 'live UI weak focus receipt should expose a stable marker');
const weakFocusEvent = PVPScene.formatLiveEvent({
  eventType: 'status_mitigated',
  actingSeat: 'B',
  publicData: {
    statusId: 'weak_focus',
    label: '虚弱',
    seatId: 'B',
    sourceSeat: 'A',
    mitigatedBySeat: 'A',
    preventedDamage: 2,
    mitigation: 'public_weak_damage_reduction'
  }
});
assert.match(weakFocusEvent.detail, /虚弱削减 2|伤害降低 2/, 'live UI event log should explain public weak_focus damage reduction');
const healEvent = PVPScene.formatLiveEvent({
  eventType: 'hp_recovered',
  actingSeat: 'A',
  publicData: {
    seatId: 'A',
    recoveredHp: 3,
    hp: 41,
    maxHp: 50,
    capped: false,
    sourceCardId: 'innerPeace'
  }
});
assert.match(healEvent.label, /公开恢复/, 'live UI event log should label public hp recovery');
assert.match(healEvent.detail, /恢复 3|当前 41\/50/, 'live UI event log should explain public heal result');
assert.doesNotMatch(healEvent.detail, /sourceCardId|cardId|instanceId|hand|deck|rating|reward/i, 'live UI heal event detail must not expose hidden ids or rewards');
assert.ok(PVPScene.getLiveActionReleaseEventTypes('play_card').includes('hp_recovered'), 'live UI play_card intent release should include standalone public healing events');
assert.equal(
  PVPScene.hasLiveActionReleaseEvidence({
    lastEvents: [{
      eventType: 'hp_recovered',
      actingSeat: 'A',
      sequence: 15,
      publicData: { seatId: 'A', recoveredHp: 3, hp: 41, maxHp: 50, capped: false }
    }]
  }, {
    intentType: 'play_card',
    seatId: 'A',
    lastSeenEventRevision: 14
  }),
  true,
  'live UI should unlock an in-flight play_card intent when the only matching action event is hp_recovered'
);
const cardCycleEvent = PVPScene.formatLiveEvent({
  eventType: 'card_cycled',
  actingSeat: 'A',
  payload: {
    seatId: 'A',
    count: 99,
    handCount: 99,
    deckCount: 99,
    capped: false,
    sourceCardId: 'surgeStep',
    effect: 'draw_tag'
  },
  publicData: {
    seatId: 'A',
    count: 1,
    handCount: 4,
    deckCount: 9,
    capped: false,
    sourceCardId: 'surgeStep',
    effect: 'draw_tag'
  }
});
assert.equal(cardCycleEvent.label, '公开抽滤', 'live UI event log should label public card cycle events');
assert.match(cardCycleEvent.detail, /A.*抽滤 1 张.*当前手牌 4.*牌库 9/, 'live UI event log should render public card cycle counts');
assert.doesNotMatch(`${cardCycleEvent.label} ${cardCycleEvent.detail}`, /sourceCardId|cardId|instanceId|draw_tag|rating|reward/i, 'live UI card cycle event must not render hidden ids, effect tags, or rewards');
const timeoutAutomationEvent = PVPScene.formatLiveEvent({
  eventType: 'automation_action',
  actingSeat: 'B',
  payload: {
    seatId: 'B',
    actionType: 'defense_card',
    reason: 'soft_timeout',
    automationCount: 1,
    cardInstanceId: 'hidden-timeout-card'
  },
  publicData: {
    seatId: 'B',
    actionType: 'defense_card',
    reason: 'soft_timeout',
    automationCount: 1
  }
});
assert.equal(timeoutAutomationEvent.label, '超时托管', 'live UI event log should label timeout automation as player-facing automation');
assert.match(timeoutAutomationEvent.detail, /B.*系统托管.*防守牌.*第 1 次/, 'live UI event log should explain low-impact timeout automation');
assert.doesNotMatch(`${timeoutAutomationEvent.label} ${timeoutAutomationEvent.detail}`, /automation_action|soft_timeout|cardInstanceId|cardId|instanceId|hand|deck|rating|reward/i, 'live UI timeout automation event must not expose protocol codes or hidden ids');

openingActionState = {
  ...openingActionState,
  stateView: {
    ...openingActionState.stateView,
    stateVersion: 41,
    currentSeat: 'A',
    duelMomentumReport: {
      ...openingActionState.stateView.duelMomentumReport,
      pressureState: 'opening_window'
    }
  }
};
openingActionIntents.length = 0;
PVPScene.liveOpeningActionConfirm = null;
PVPScene.liveInlineHint = '';
await PVPScene.endLiveTurn();
assert.equal(openingActionIntents.length, 0, 'first opening-window end-turn click should only arm confirmation and must not submit end_turn');
assert.match(PVPScene.liveInlineHint, /再次点击确认结束回合/, 'opening-window end-turn confirmation should explain the second click before ending the turn');
assert.match(PVPScene.liveInlineHint, /交给\s*B/, 'opening-window end-turn confirmation should name the next public action seat');
assert.match(PVPScene.liveInlineHint, /首动预算\s*18/, 'opening-window end-turn confirmation should keep the public budget visible');
assert.match(PVPScene.liveInlineHint, /后手护盾\s*B\s*\+3/, 'opening-window end-turn confirmation should name the second-seat public shield');
assert.match(PVPScene.liveInlineHint, /反打缓冲\s*\+8/, 'opening-window end-turn confirmation should name the counterplay buffer');
openingActionState = {
  ...openingActionState,
  stateView: {
    ...openingActionState.stateView,
    stateVersion: 42
  }
};
await PVPScene.endLiveTurn();
assert.equal(openingActionIntents.length, 0, 'opening-window confirmation should not survive an authoritative stateVersion advance');
await PVPScene.endLiveTurn();
assert.equal(openingActionIntents.length, 1, 'fresh second opening-window end-turn click should submit exactly one end_turn intent');
assert.equal(openingActionIntents[0].intentType, 'end_turn', 'confirmed opening-window end-turn should keep the authoritative end_turn intent');

openingActionState = {
  ...openingActionState,
  phase: 'active',
  seatId: 'A',
  stateView: {
    ...openingActionState.stateView,
    stateVersion: 51,
    currentSeat: 'A',
    openingSafeguardReport: {
      ...openingActionState.stateView.openingSafeguardReport,
      status: 'closed',
      damageBudget: {
        ...openingActionState.stateView.openingSafeguardReport.damageBudget,
        currentActionBudget: null
      },
      openingProtection: {
        ...openingActionState.stateView.openingSafeguardReport.openingProtection,
        active: false,
        protectedSeats: []
      },
      secondSeatBuffer: {
        ...openingActionState.stateView.openingSafeguardReport.secondSeatBuffer,
        active: false
      },
      counterplay: {
        ...openingActionState.stateView.openingSafeguardReport.counterplay,
        pendingSeats: [],
        grantedSeats: []
      }
    },
    opponent: { seatId: 'B' },
    self: {
      ...openingActionState.stateView.self,
      seatId: 'A',
      publicStatuses: [{
        statusId: 'vulnerable_mark',
        label: '破绽',
        sourceSeat: 'B',
        earliestConsumeTurnIndex: 52,
        summary: '破绽已公开；防守方至少拥有一个行动窗口后才可被兑现。'
      }],
      hand: [{ instanceId: 'A-guard-response', cardId: 'pvp_guard', name: '护体诀' }]
    },
    duelMomentumReport: {
      reportVersion: 'pvp-live-duel-momentum-v1',
      pressureState: 'status_response_window',
      pressureLabel: '破绽响应窗口',
      agencyLabel: '你的防守响应窗口',
      summaryLine: '局势：你正处于破绽响应窗口，防守牌可阻止后续兑现。',
      counterplayLine: '反制窗口：先清除破绽或补盾，否则下一轮可能被兑现。',
      sourceVisibility: 'public_state',
      usesHiddenInformation: false,
      rankedImpact: 'none'
    },
    intentSignalReport: {
      reportVersion: 'pvp-live-intent-signal-v1',
      sourceVisibility: 'public_state_and_public_content',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      signalState: 'status_response_window',
      signalLabel: '破绽响应',
      intentLine: '读牌：对手已给你挂上破绽，下一轮可能兑现。',
      responseLine: '反制窗口：可用防守牌清除破绽；若直接结束回合，后续可能被兑现。',
      safeguards: ['public_card_catalog_only', 'private_card_projection_blocked', 'status_response_window']
    },
    actionPreviewReport: {
      ...openingActionState.stateView.actionPreviewReport,
      playableCards: [{
        cardInstanceId: 'A-guard-response',
        cardName: '护体诀',
        targetSeat: 'A',
        rawDamage: 0,
        damageBudget: 0,
        budgetedDamage: 0,
        blockedDamage: 0,
        hpDamage: 0,
        blockGain: 7,
        selfBlockAfter: 7,
        publicStatusMitigation: {
          statusId: 'vulnerable_mark',
          label: '破绽',
          seatId: 'A',
          sourceSeat: 'B',
          responseWindow: 'status_response_window',
          mitigation: 'cleared'
        },
        summaryLine: '护体诀：自身护盾 +7；清除破绽，阻止后续兑现。'
      }],
      endTurn: {
        nextSeat: 'B',
        summaryLine: '结束回合后行动权交给 B；破绽仍可能被后续兑现。'
      }
    }
  }
};
openingActionIntents.length = 0;
PVPScene.liveOpeningActionConfirm = null;
PVPScene.liveInlineHint = '';
await PVPScene.endLiveTurn();
assert.equal(openingActionIntents.length, 0, 'first status-response end-turn click should only arm confirmation and must not submit end_turn');
assert.match(PVPScene.liveInlineHint, /再次点击确认结束回合/, 'status-response end-turn confirmation should require a second click');
assert.match(PVPScene.liveInlineHint, /破绽|响应窗口|反制窗口/, 'status-response confirmation should name the public response window');
assert.match(PVPScene.liveInlineHint, /清除破绽|防守牌|后续兑现/, 'status-response confirmation should explain why ending now is risky');
assert.doesNotMatch(PVPScene.liveInlineHint, /cardInstanceId|hand|deck|rating|elo|reward/i, 'status-response confirmation must not expose hidden card or reward/rating data');
openingActionState = {
  ...openingActionState,
  stateView: {
    ...openingActionState.stateView,
    stateVersion: 52
  }
};
await PVPScene.endLiveTurn();
assert.equal(openingActionIntents.length, 0, 'status-response confirmation should not survive an authoritative stateVersion advance');
await PVPScene.endLiveTurn();
assert.equal(openingActionIntents.length, 1, 'fresh second status-response end-turn click should submit exactly one end_turn intent');
assert.equal(openingActionIntents[0].intentType, 'end_turn', 'confirmed status-response end-turn should keep the authoritative end_turn intent');

openingActionState = {
  ...openingActionState,
  stateView: {
    ...openingActionState.stateView,
    stateVersion: 53
  }
};
openingActionIntents.length = 0;
PVPScene.liveOpeningActionConfirm = null;
PVPScene.liveInlineHint = '';
await PVPScene.submitLiveCard('A-guard-response');
assert.equal(openingActionIntents.length, 1, 'status-response mitigation card should submit play_card immediately without a second click');
assert.equal(openingActionIntents[0].intentType, 'play_card', 'status-response mitigation card should preserve the authoritative play_card intent');
assert.equal(openingActionIntents[0].payload.cardInstanceId, 'A-guard-response', 'status-response mitigation card should submit the selected public response card');
assert.equal(PVPScene.liveOpeningActionConfirm, null, 'status-response mitigation card should not arm opening confirmation');
assert.doesNotMatch(PVPScene.liveInlineHint, /再次点击确认结束回合|再次点击确认出牌/, 'status-response mitigation card should not ask for a second click before saving the defender');

let intentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-intent-lock',
  seatId: 'A',
  realtimeStatus: 'connected',
  stateView: {
    matchId: 'pvpm-ui-runtime-intent-lock',
    status: 'active',
    stateVersion: 3,
    currentSeat: 'A'
  },
  lastEvents: [
    { eventType: 'turn_ended', actingSeat: 'A', sequence: 3, payload: { nextSeat: 'B' } }
  ]
};
const realtimeIntentCalls = [];
PVPScene.liveIntentSeq = 0;
PVPScene.liveIntentInFlight = null;
PVPScene.startLiveRealtime = () => {};
PVPScene.renderLivePanel = () => {};
PVPScene.getLiveSession = () => ({
  getState: () => intentState,
  submitRealtimeIntent: (intent, matchId) => {
    realtimeIntentCalls.push({ intent, matchId });
    return true;
  },
  submitIntent: async () => {
    throw new Error('HTTP fallback should not run while realtime intent send succeeds');
  }
});

await Promise.all([
  PVPScene.endLiveTurn(),
  PVPScene.endLiveTurn()
]);
assert.equal(realtimeIntentCalls.length, 1, 'live UI should keep one realtime intent in-flight and ignore double-click submits');

intentState = {
  ...intentState,
  stateView: {
    ...intentState.stateView,
    stateVersion: 4
  },
  lastEvents: [
    { eventType: 'turn_ended', actingSeat: 'A', sequence: 3, payload: { nextSeat: 'B' } },
    { eventType: 'emote_sent', actingSeat: 'B', sequence: 4, payload: { seatId: 'B', emoteId: 'thinking', label: '思考' } }
  ]
};
await PVPScene.endLiveTurn();
assert.equal(
  realtimeIntentCalls.length,
  1,
  'live UI should not unlock action intent when social stateVersion advance includes stale action events',
);

intentState = {
  ...intentState,
  stateView: {
    ...intentState.stateView,
    stateVersion: 5
  },
  lastEvents: [
    { eventType: 'turn_ended', actingSeat: 'A', sequence: 5, payload: { nextSeat: 'B' } }
  ]
};
await PVPScene.endLiveTurn();
assert.equal(realtimeIntentCalls.length, 2, 'live UI should unlock realtime action intent after matching authoritative action event advances stateVersion');

intentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-intent-lock',
  seatId: 'A',
  realtimeStatus: 'connected',
  stateView: {
    matchId: 'pvpm-ui-runtime-intent-lock',
    status: 'active',
    stateVersion: 8,
    currentSeat: 'A'
  }
};
PVPScene.liveIntentInFlight = null;
await PVPScene.endLiveTurn();
assert.equal(realtimeIntentCalls.length, 3, 'live UI should send the first action intent before reconnect protection check');
intentState = {
  ...intentState,
  realtimeStatus: 'reconnecting',
  lastError: { reason: 'live_ws_reconnecting', message: '实时论道 WS 正在重连' },
  updatedAt: Date.now() + 1
};
await PVPScene.endLiveTurn();
assert.equal(realtimeIntentCalls.length, 3, 'live UI should keep action intent in-flight during realtime reconnecting');

intentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-intent-lock',
  seatId: 'A',
  realtimeStatus: 'connected',
  stateView: {
    matchId: 'pvpm-ui-runtime-intent-lock',
    status: 'active',
    stateVersion: 12,
    currentSeat: 'A'
  },
  lastRealtimeIntentResult: null
};
PVPScene.liveIntentInFlight = null;
await Promise.all([
  PVPScene.submitLiveEmote('respect'),
  PVPScene.submitLiveEmote('respect')
]);
assert.equal(realtimeIntentCalls.length, 4, 'live UI should keep one social realtime intent in-flight and ignore double-click emotes');
const socialIntentId = realtimeIntentCalls[realtimeIntentCalls.length - 1].intent.intentId;
await PVPScene.endLiveTurn();
assert.equal(realtimeIntentCalls.length, 5, 'live UI should not let a pending social intent block action intents');
intentState = {
  ...intentState,
  lastRealtimeIntentResult: {
    intentId: socialIntentId,
    matchId: 'pvpm-ui-runtime-intent-lock',
    result: 'accepted',
    updatedAt: Date.now() + 2
  }
};
await PVPScene.submitLiveEmote('thinking');
assert.equal(realtimeIntentCalls.length, 6, 'live UI should unlock social intents after the matching intent_result ack');

intentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-intent-lock',
  seatId: 'A',
  realtimeStatus: 'connected',
  stateView: {
    matchId: 'pvpm-ui-runtime-intent-lock',
    status: 'active',
    stateVersion: 14,
    currentSeat: 'A'
  },
  lastRealtimeIntentResult: null
};
let refreshMatchCalls = 0;
PVPScene.liveIntentInFlight = null;
PVPScene.getLiveSession = () => ({
  getState: () => intentState,
  submitRealtimeIntent: (intent, matchId) => {
    realtimeIntentCalls.push({ intent, matchId });
    return true;
  },
  submitIntent: async () => {
    throw new Error('HTTP fallback should not run while realtime intent send succeeds');
  },
  refreshMatch: async () => {
    refreshMatchCalls += 1;
    return intentState;
  }
});
await PVPScene.submitLiveEmote('respect');
await PVPScene.submitLiveEmote('respect');
assert.equal(realtimeIntentCalls.length, 7, 'live UI should keep lost-ack social intent pending before manual refresh');
await PVPScene.refreshLiveMatch();
assert.equal(refreshMatchCalls, 1, 'manual live refresh should read authoritative match state while an intent is pending');
await PVPScene.submitLiveEmote('thinking');
assert.equal(realtimeIntentCalls.length, 8, 'live UI should unlock pending realtime intents after manual authoritative refresh');

let surrenderState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-surrender-confirm',
  seatId: 'A',
  realtimeStatus: 'closed',
  stateView: {
    matchId: 'pvpm-ui-runtime-surrender-confirm',
    status: 'active',
    stateVersion: 21,
    currentSeat: 'A'
  }
};
const surrenderIntents = [];
PVPScene.liveIntentInFlight = null;
PVPScene.liveSurrenderConfirmUntil = 0;
PVPScene.liveInlineHint = '';
PVPScene.startLiveRealtime = () => {};
PVPScene.stopLivePolling = () => {};
PVPScene.renderLivePanel = () => {};
PVPScene.getLiveSession = () => ({
  getState: () => surrenderState,
  submitIntent: async (intent) => {
    surrenderIntents.push(intent);
    surrenderState = {
      ...surrenderState,
      phase: 'finished',
      stateView: {
        ...surrenderState.stateView,
        status: 'finished',
        stateVersion: surrenderState.stateView.stateVersion + 1
      }
    };
    return surrenderState;
  }
});
await PVPScene.surrenderLiveMatch();
assert.equal(surrenderIntents.length, 0, 'first live surrender click should only arm confirmation and must not submit surrender intent');
assert.match(PVPScene.liveInlineHint, /再次点击确认认输/, 'first live surrender click should explain the second confirmation click');
assert.ok(PVPScene.liveSurrenderConfirmUntil > Date.now(), 'first live surrender click should arm a short confirmation window');
await PVPScene.surrenderLiveMatch();
assert.equal(surrenderIntents.length, 1, 'second live surrender click inside confirmation window should submit exactly one surrender intent');
assert.equal(surrenderIntents[0].intentType, 'surrender', 'confirmed live surrender should still use the authoritative surrender intent type');
assert.equal(PVPScene.liveSurrenderConfirmUntil, 0, 'confirmed live surrender should clear the confirmation window');

const fairnessReceiptMarkup = PVPScene.renderLiveFairnessReceipt({
  reportVersion: 'pvp-live-fairness-receipt-v1',
  sourceVisibility: 'public_events',
  usesHiddenInformation: false,
  rankedImpact: 'none',
  receiptState: 'watch',
  agencyLabel: '败方窗口偏短',
  setupVerdict: '开战回执：双方准备公开确认后才进入战斗。',
  fairnessVerdict: '公平回执：公开行动窗口偏短，本局需要先复盘关键回合，再判断是否继续排位。',
  budgetVerdict: '首动预算证据不足，下一局优先观察第一手伤害是否被公开预算约束。',
  counterplayVerdict: '反打回执：护体或反打窗口样本不足，建议先查看公开关键回合。',
  windowVerdict: '行动窗口：公开窗口偏短，先确认是否认输、超时或连接中断导致。',
  effectiveActionVerdict: '有效行动：未看到后手有效行动窗口，本局不能只按“没被秒”判定体验公平。',
  terminalVerdict: '终局边界：终局来自公开伤害或公开长局规则，复盘看终局前一手。',
  nextStepLine: '下一步：先查看权威事件和关键回合复盘，不把短窗口样本直接当成公平结论。',
  evidenceSummary: [
    { id: 'decision_windows', label: '公开决策窗口', passed: false, evidenceSequences: [1, 2] },
    { id: 'second_seat_effective_action', label: '后手有效行动', passed: false, evidenceSequences: [2] }
  ],
  boundary: '公平回执只汇总公开复盘证据，不读取隐藏手牌、牌库或原始事件明细，也不改正式积分或结算。'
});
assert.match(fairnessReceiptMarkup, /data-live-fairness-check="decision_windows"/, 'fairness receipt evidence should be directly focusable from the receipt');
assert.match(fairnessReceiptMarkup, /onclick="PVPScene\.handleLiveExperienceCheckFocus\(&quot;decision_windows&quot;\)"/, 'fairness receipt evidence should reuse public experience-check focusing');
assert.match(fairnessReceiptMarkup, /公开决策窗口 · 观察/, 'fairness receipt focus button should keep the readable evidence label');
assert.doesNotMatch(fairnessReceiptMarkup, /payload|\bhand\b|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i, 'fairness receipt focus controls must not expose hidden or reward/rating data');

const mitigatedExperienceMarkup = PVPScene.renderLiveExperienceReport({
  reportVersion: 'pvp-live-experience-report-v1',
  title: '双方体验诊断',
  sourceVisibility: 'public_events',
  usesHiddenInformation: false,
  rankedImpact: 'none',
  nonGameRisk: 'low',
  agencyLabel: '双方均有可读窗口',
  decisionWindowCount: 3,
  effectiveActionReport: {
    reportVersion: 'pvp-live-effective-action-report-v1',
    sourceVisibility: 'public_events',
    usesHiddenInformation: false,
    rankedImpact: 'none',
    secondSeat: 'B',
    secondSeatState: 'confirmed',
    observedActionKinds: ['status_mitigated'],
    primaryActionLabel: '稳住破绽',
    effectiveActionLine: '后手公开清除了破绽，先手后续无法直接兑现该公开状态。',
    evidence: [
      { eventType: 'status_mitigated', sequence: 14, actingSeat: 'B', publicData: { statusId: 'vulnerable_mark', label: '破绽', mitigatedBySeat: 'B' } }
    ],
    reasons: ['public_defensive_status_mitigation'],
    summary: '公开事件显示后手稳住破绽，先手后续无法直接兑现该公开状态。'
  },
  safeguardSummary: {
    setupReady: 'confirmed',
    firstActionBudget: 'not_triggered',
    openingProtection: 'not_needed',
    effectiveAction: 'confirmed'
  },
  summary: '本局公开轨迹能解释开战、压力和终局，不属于无解释先手秒杀。',
  recommendedAction: 'queue_again',
  fairnessChecks: [
    { id: 'second_seat_effective_action', label: '后手有效行动', passed: true, detail: '公开事件显示后手稳住破绽，先手后续无法直接兑现该公开状态。', linkedEvidence: [
      { eventType: 'status_mitigated', sequence: 14, actingSeat: 'B', publicData: { statusId: 'vulnerable_mark', label: '破绽', mitigatedBySeat: 'B' } }
    ] }
  ]
});
assert.match(mitigatedExperienceMarkup, /data-live-effective-action-proof="status_mitigated"/, 'experience report should expose a stable DOM proof for status mitigation agency');
assert.match(mitigatedExperienceMarkup, /data-live-effective-action-kind="status_mitigated"/, 'experience report should expose the effective action kind for audits');
assert.match(mitigatedExperienceMarkup, /稳住破绽/, 'experience report should visibly credit defensive status mitigation');
assert.doesNotMatch(mitigatedExperienceMarkup, /payload|\bhand\b|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i, 'experience mitigation proof must not expose hidden or reward/rating data');

let recommendationState = {
  phase: 'finished',
  matchId: 'pvpm-ui-runtime-loadout-recommendation',
  seatId: 'A',
  stateView: {
    matchId: 'pvpm-ui-runtime-loadout-recommendation',
    status: 'finished',
    stateVersion: 44,
    postMatchReview: {
      reportVersion: 'pvp-live-post-match-review-v1',
      result: 'loss',
      finishReason: 'lethal',
      summary: '公开轨迹显示血线被压低。',
      evidence: [
        { eventType: 'damage_applied', sequence: 8, actingSeat: 'B' },
        { eventType: 'match_finished', sequence: 12, actingSeat: 'B' }
      ],
      suggestions: ['下一局先稳住前两手。'],
      loadoutRecommendation: {
        reportVersion: 'pvp-live-loadout-recommendation-v1',
        sourceVisibility: 'public_events_and_public_content',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        recommendedPresetId: 'shield',
        recommendedPresetLabel: '守势斗法谱',
        reasonLine: '本局公开轨迹显示血线被压低，下一局先套用守势斗法谱测试低费防御窗口。',
        practiceLine: '配合问道练习复刻开战与反打窗口。',
        boundaryLine: '一键套用只改下一局入队候选，不自动排队、不写正式积分。',
        evidenceRefs: [
          { eventType: 'damage_applied', sequence: 8, actingSeat: 'B' },
          { eventType: 'match_finished', sequence: 12, actingSeat: 'B' }
        ]
      },
      nextActions: [
        { id: 'friendly_rematch', label: '低压力再战' },
        { id: 'queue_again', label: '继续真人排位' }
      ]
    }
  }
};
const baseRecommendationState = JSON.parse(JSON.stringify(recommendationState));
const recommendationCalls = [];
let nextQueueState = null;
let nextRematchState = null;
PVPScene.liveSelectedLoadoutPreset = 'sword';
PVPScene.liveLoadoutReviewFocused = false;
PVPScene.liveInlineHint = '';
PVPScene.renderLivePanel = () => {};
PVPScene.startLivePolling = () => {};
PVPScene.stopLivePolling = () => {};
PVPScene.getGameRef = () => ({ player: { name: '甲' } });
PVPScene.getLiveSession = () => ({
  getState: () => recommendationState,
  joinQueue: async (options) => {
    recommendationCalls.push({ method: 'joinQueue', options });
    if (nextQueueState) {
      recommendationState = nextQueueState;
      nextQueueState = null;
    }
    return recommendationState;
  },
  requestRematch: async (options) => {
    recommendationCalls.push({ method: 'requestRematch', options });
    if (nextRematchState) {
      recommendationState = nextRematchState;
      nextRematchState = null;
    }
    return recommendationState;
  }
});
const normalizedRecommendation = PVPScene.getLiveLoadoutRecommendation({
  ...recommendationState.stateView.postMatchReview.loadoutRecommendation,
  recommendedPresetLabel: '伪造奖励谱',
  boundaryLine: '写入正式积分'
});
assert.equal(normalizedRecommendation.recommendedPresetLabel, '守势斗法谱', 'live UI should render the local preset label for recommendations');
assert.equal(normalizedRecommendation.boundaryLine, '一键套用只改下一局入队候选，不自动排队、不写正式积分。', 'live UI should keep the recommendation boundary local and fixed');
assert.equal(
  PVPScene.getLiveLoadoutRecommendation({
    ...recommendationState.stateView.postMatchReview.loadoutRecommendation,
    sourceVisibility: 'hidden_deck'
  }),
  null,
  'live UI should reject non-public loadout recommendation sources',
);
PVPScene.liveSelectedLoadoutPreset = 'balanced';
const preApplyQueueResolution = PVPScene.resolveLivePostReviewLoadoutPreset('queue_again');
assert.equal(preApplyQueueResolution.presetId, 'balanced', 'formal queue should keep the manual candidate before recommendation apply');
assert.equal(preApplyQueueResolution.source, 'manual_candidate_override', 'formal queue should mark manual candidate override before recommendation apply');
assert.equal(preApplyQueueResolution.sourceVisibility, 'local_candidate', 'manual formal queue override should expose local candidate visibility');
assert.equal(preApplyQueueResolution.recommendationVisibility, 'public_events_and_public_content', 'manual formal queue override should still carry recommendation visibility separately');
assert.equal(preApplyQueueResolution.rankedImpact, 'candidate_only', 'formal queue resolution should only change the next candidate');
const preApplyPracticeResolution = PVPScene.resolveLivePostReviewLoadoutPreset('practice');
assert.equal(preApplyPracticeResolution.presetId, 'shield', 'no-score practice should use the public recommendation before formal apply');
assert.equal(preApplyPracticeResolution.source, 'public_recommendation_practice', 'practice should label the public recommendation source');
assert.equal(preApplyPracticeResolution.sourceVisibility, 'public_events_and_public_content', 'practice recommendation should expose public recommendation visibility');
assert.equal(preApplyPracticeResolution.usesHiddenInformation, false, 'post-review loadout resolution must not use hidden information');

await PVPScene.handleLivePostReviewAction('queue_again');
assert.equal(recommendationCalls.length, 1, 'manual override queue should perform exactly one queue call');
assert.equal(recommendationCalls[0].method, 'joinQueue', 'manual override queue should use live queue');
assert.equal(recommendationCalls[0].options?.loadout?.identitySlot, 'balanced', 'manual override queue should submit the current manual candidate');

recommendationCalls.length = 0;
recommendationState = {
  ...recommendationState,
  phase: 'finished'
};
await PVPScene.handleLivePostReviewAction('friendly_rematch');
assert.equal(recommendationCalls.length, 1, 'manual override rematch should perform exactly one rematch call');
assert.equal(recommendationCalls[0].method, 'requestRematch', 'manual override rematch should use rematch service');
assert.equal(recommendationCalls[0].options?.loadout?.identitySlot, 'balanced', 'manual override rematch should submit the current manual candidate');
const manualOverridePracticeScenario = PVPScene.buildLivePostReviewDrillScenario();
assert.equal(manualOverridePracticeScenario.recommendedLoadoutId, 'shield', 'manual formal override should not stop no-score practice from using the public recommendation');

recommendationCalls.length = 0;
PVPScene.liveSelectedLoadoutPreset = 'sword';
PVPScene.applyLivePostReviewLoadoutRecommendation();
assert.equal(PVPScene.liveSelectedLoadoutPreset, 'shield', 'one-click loadout recommendation should select the recommended preset locally');
assert.equal(recommendationState.phase, 'finished', 'one-click loadout recommendation should keep the post-match review phase');
assert.equal(recommendationCalls.length, 0, 'one-click loadout recommendation must not queue or request rematch by itself');
assert.match(PVPScene.liveInlineHint, /下一局/, 'one-click loadout recommendation should explain the next-game scope');
assert.match(PVPScene.liveInlineHint, /不自动排队/, 'one-click loadout recommendation should not auto queue');
assert.match(PVPScene.liveInlineHint, /不写正式积分/, 'one-click loadout recommendation should not write ranked state');
const postApplyQueueResolution = PVPScene.resolveLivePostReviewLoadoutPreset('queue_again');
assert.equal(postApplyQueueResolution.presetId, 'shield', 'formal queue should resolve to the applied public recommendation');
assert.equal(postApplyQueueResolution.source, 'applied_public_recommendation', 'formal queue should carry an applied recommendation receipt');
assert.equal(postApplyQueueResolution.sourceVisibility, 'public_events_and_public_content', 'applied recommendation should keep public recommendation visibility');

await PVPScene.joinLiveQueue();
assert.equal(recommendationCalls.length, 1, 'queue after applying recommendation should perform exactly one queue call');
assert.equal(recommendationCalls[0].method, 'joinQueue', 'queue after recommendation should use live queue');
assert.equal(recommendationCalls[0].options?.loadout?.identitySlot, 'shield', 'queue after recommendation should submit the recommended loadout preset');

recommendationCalls.length = 0;
recommendationState = {
  ...recommendationState,
  phase: 'finished'
};
await PVPScene.handleLivePostReviewAction('friendly_rematch');
assert.equal(recommendationCalls.length, 1, 'friendly rematch after applying recommendation should perform exactly one rematch call');
assert.equal(recommendationCalls[0].method, 'requestRematch', 'friendly rematch after recommendation should use rematch service');
assert.equal(recommendationCalls[0].options?.loadout?.identitySlot, 'shield', 'friendly rematch after recommendation should submit the recommended loadout preset');

recommendationCalls.length = 0;
PVPScene.liveInlineHint = '旧成功提示';
recommendationState = {
  ...baseRecommendationState,
  phase: 'finished'
};
nextQueueState = {
  phase: 'idle',
  matchId: '',
  stateView: null,
  lastError: {
    reason: 'connection_health_failed',
    message: '当前连接不适合进入正式真人排位'
  }
};
await PVPScene.handleLivePostReviewAction('queue_again');
assert.equal(recommendationCalls.length, 1, 'failed post-review queue should still attempt one queue call');
assert.equal(recommendationCalls[0].options?.loadout?.identitySlot, 'shield', 'failed post-review queue should submit the resolved preset before authority rejects it');
assert.equal(PVPScene.liveInlineHint, '', 'failed post-review queue should not keep or write a success receipt over lastError');
assert.equal(recommendationState.lastError?.reason, 'connection_health_failed', 'failed post-review queue should preserve authoritative failure reason');

recommendationCalls.length = 0;
PVPScene.liveInlineHint = '旧成功提示';
recommendationState = {
  phase: 'finished',
  matchId: 'pvpm-ui-runtime-loadout-recommendation',
  seatId: 'A',
  stateView: JSON.parse(JSON.stringify(baseRecommendationState.stateView))
};
nextRematchState = {
  ...recommendationState,
  phase: 'finished',
  lastError: {
    reason: 'rematch_expired',
    message: '低压力再战等待已过期'
  }
};
await PVPScene.handleLivePostReviewAction('friendly_rematch');
assert.equal(recommendationCalls.length, 1, 'failed post-review rematch should still attempt one rematch call');
assert.equal(recommendationCalls[0].options?.loadout?.identitySlot, 'shield', 'failed post-review rematch should submit the resolved preset before authority rejects it');
assert.equal(PVPScene.liveInlineHint, '', 'failed post-review rematch should not keep or write a success receipt over lastError');
assert.equal(recommendationState.lastError?.reason, 'rematch_expired', 'failed post-review rematch should preserve authoritative failure reason');

const winningRecommendationState = {
  phase: 'finished',
  matchId: 'pvpm-ui-runtime-winning-recommendation-practice',
  seatId: 'A',
  stateView: {
    matchId: 'pvpm-ui-runtime-winning-recommendation-practice',
    status: 'finished',
    stateVersion: 50,
    postMatchReview: {
      ...recommendationState.stateView.postMatchReview,
      result: 'win',
      winnerSeat: 'A',
      loserSeat: 'B',
      finishReason: 'lethal',
      summary: '公开轨迹显示主动压制有效。',
      loadoutRecommendation: {
        ...recommendationState.stateView.postMatchReview.loadoutRecommendation,
        recommendedPresetId: 'sword',
        recommendedPresetLabel: '破阵斗法谱',
        reasonLine: '本局公开轨迹显示主动压制有效，下一局可套用破阵斗法谱继续验证前两手压力。'
      }
    }
  }
};
PVPScene.liveSelectedLoadoutPreset = 'balanced';
PVPScene.getLiveSession = () => ({
  getState: () => winningRecommendationState
});
const winningRecommendationScenario = PVPScene.buildLivePostReviewDrillScenario();
assert.equal(winningRecommendationScenario.recommendedLoadoutId, 'sword', 'post-match practice drill should use the public loadout recommendation instead of the current selected preset');
assert.equal(winningRecommendationScenario.recommendedLoadoutLabel, '破阵斗法谱', 'post-match practice drill should carry the recommended preset label');
assert.match(winningRecommendationScenario.drillObjective, /破阵斗法谱/, 'post-match practice objective should explain the recommended loadout');
assert.equal(winningRecommendationScenario.rankedImpact, 'none', 'post-match practice drill from loadout recommendation must not write ranked state');
const winningNextStepMarkup = PVPScene.renderLivePostMatchReview(winningRecommendationState.stateView, 'finished');
assert.match(winningNextStepMarkup, /data-live-post-review-next-step-primary="queue_again"/, 'low-risk win next-step guide should make queue-again the primary action');
assert.match(winningNextStepMarkup, /data-live-post-review-next-step-action="queue_again"[\s\S]*data-live-post-review-next-step-rank="primary"/, 'winning next-step guide primary CTA should reuse queue-again');

const visiblePracticePlanReview = {
  ...baseRecommendationState.stateView,
  postMatchReview: {
    ...baseRecommendationState.stateView.postMatchReview,
    keyTurnReplay: {
      reportVersion: 'pvp-live-key-turn-replay-v1',
      sourceVisibility: 'public_events',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      turns: [
        { id: 'opening_window', label: '开局窗口', sequence: 4, eventType: 'battle_started', actingSeat: 'A', severity: 'setup', lesson: '确认先后手、护体和第一拍资源。' },
        { id: 'pressure_window', label: '压力窗口', sequence: 8, eventType: 'damage_applied', actingSeat: 'B', severity: 'pressure', lesson: '先保留低费响应，再判断是否抢节奏。' }
      ]
    },
    experienceReport: {
      reportVersion: 'pvp-live-experience-report-v1',
      title: '双方体验诊断',
      sourceVisibility: 'public_events',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      explicitSourceSafety: true,
      nonGameRisk: 'watch',
      agencyLabel: '行动窗口偏短',
      summary: '公开窗口偏短，下一局先练低费响应。',
      recommendedAction: 'practice',
      fairnessChecks: [
        { id: 'decision_windows', label: '公开决策窗口', passed: false, detail: '公开事件只看到一个短窗口。' },
        { id: 'opening_protection', label: '开局护体', passed: true, detail: '未行动方不会被开局直接终结。' }
      ]
    },
    fairnessReceipt: {
      reportVersion: 'pvp-live-fairness-receipt-v1',
      sourceVisibility: 'public_events',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      receiptState: 'watch',
      agencyLabel: '行动窗口偏短',
      nextStepLine: '下一步：先复盘关键回合，再用问道练习复刻公开窗口。',
      evidenceSummary: [
        { id: 'decision_windows', label: '公开决策窗口', passed: false, evidenceSequences: [4, 8] }
      ],
      boundary: '公平回执只汇总公开复盘证据，不读取隐藏手牌、牌库或原始事件明细，也不改正式积分或结算。'
    },
    nextActions: [
      { id: 'review_key_turns', auditActionId: 'key_turn_replay', label: '关键回合复盘', detail: '先定位公开关键回合。' },
      { id: 'practice', auditActionId: 'practice_topic', label: '问道练习', detail: '复刻公开窗口，不写正式积分。' },
      { id: 'queue_again', auditActionId: 'queue_again', label: '继续真人排位', detail: '带着本局结论重新入队。' }
    ]
  }
};
const visiblePracticePlanMarkup = PVPScene.renderLivePostMatchReview(visiblePracticePlanReview, 'finished');
assert.match(visiblePracticePlanMarkup, /data-live-post-review-next-step/, 'post-match review should render a dedicated next-step guide from public recommendations');
assert.match(visiblePracticePlanMarkup, /data-live-post-review-next-step-primary="review_key_turns"/, 'watch-loss next-step guide should make key-turn review the primary action');
assert.match(visiblePracticePlanMarkup, /data-live-post-review-next-step-action="review_key_turns"[\s\S]*data-live-post-review-next-step-rank="primary"/, 'next-step guide primary CTA should reuse the key-turn review action');
assert.match(visiblePracticePlanMarkup, /data-live-post-review-next-step-action="practice"[\s\S]*data-live-post-review-next-step-rank="secondary"/, 'next-step guide should keep no-score practice as the secondary action');
assert.match(visiblePracticePlanMarkup, /下一步建议|先复盘关键回合|问道练习/, 'next-step guide should explain the recovery path in player-facing copy');
assert.match(visiblePracticePlanMarkup, /不写正式积分/, 'next-step guide should keep the no-score boundary visible');
assert.doesNotMatch(visiblePracticePlanMarkup, /payload|\bhand\b|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|token/i, 'next-step guide must not expose hidden or reward/rating data');
assert.match(visiblePracticePlanMarkup, /data-live-practice-plan/, 'post-match review should render the public practice plan before practice handoff');
assert.match(visiblePracticePlanMarkup, /首败练习|公开关键回合复刻节奏/, 'visible practice plan should show the objective line');
assert.match(visiblePracticePlanMarkup, /data-live-practice-plan-key-turn="opening_window"/, 'visible practice plan should expose key-turn focus steps');
assert.match(visiblePracticePlanMarkup, /focusLiveKeyTurn\(&quot;opening_window&quot;\)/, 'visible practice plan key-turn step should reuse key-turn focus handler');
assert.match(visiblePracticePlanMarkup, /data-live-practice-plan-check="decision_windows"/, 'visible practice plan should expose fairness focus checks');
assert.match(visiblePracticePlanMarkup, /handleLiveExperienceCheckFocus\(&quot;decision_windows&quot;\)/, 'visible practice plan fairness step should reuse experience-check focus handler');
assert.match(visiblePracticePlanMarkup, /复刻开局读题|复刻压力窗口/, 'visible practice plan should show at least one tempo drill prompt');
assert.doesNotMatch(visiblePracticePlanMarkup, /payload|\bhand\b|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|token/i, 'visible practice plan must not expose hidden or reward/rating data');
const unsafeNextStepMarkup = PVPScene.renderLivePostMatchReview({
  ...visiblePracticePlanReview,
  postMatchReview: {
    ...visiblePracticePlanReview.postMatchReview,
    experienceReport: {
      ...visiblePracticePlanReview.postMatchReview.experienceReport,
      sourceVisibility: 'private_state',
      usesHiddenInformation: true,
      summary: 'hidden hand reward rating should not be relabeled as public copy'
    },
    fairnessReceipt: {
      ...visiblePracticePlanReview.postMatchReview.fairnessReceipt,
      sourceVisibility: 'private_state',
      usesHiddenInformation: true,
      nextStepLine: 'hidden deck rating reward should not render'
    }
  }
}, 'finished');
assert.doesNotMatch(unsafeNextStepMarkup, /data-live-post-review-next-step/, 'next-step guide should not relabel unsafe subreports as public no-impact advice');
const unsafePracticePlanMarkup = PVPScene.renderLivePostMatchReview({
  ...visiblePracticePlanReview,
  postMatchReview: {
    ...visiblePracticePlanReview.postMatchReview,
    keyTurnReplay: {
      ...visiblePracticePlanReview.postMatchReview.keyTurnReplay,
      usesHiddenInformation: true
    }
  }
}, 'finished');
assert.doesNotMatch(unsafePracticePlanMarkup, /data-live-practice-plan/, 'post-match review should hide practice plan when replay source is not public-safe');

const friendlyNextStepMarkup = PVPScene.renderLivePostMatchReview({
  ...visiblePracticePlanReview,
  postMatchReview: {
    ...visiblePracticePlanReview.postMatchReview,
    result: 'win',
    experienceReport: {
      ...visiblePracticePlanReview.postMatchReview.experienceReport,
      nonGameRisk: 'low',
      recommendedAction: 'queue_again'
    },
    friendlySeries: {
      reportVersion: 'pvp-live-friendly-series-v1',
      sourceVisibility: 'public_review',
      usesHiddenInformation: false,
      rankedImpact: 'none',
      seriesStatus: 'in_progress',
      canRequestNextRound: true,
      requesterSourceSeat: 'A',
      opponentSourceSeat: 'B',
      nextRoundIndex: 2
    },
    nextActions: [
      { id: 'friendly_rematch', auditActionId: 'friendly_rematch', label: '低压力再战', detail: '同对手换边再打一局。' },
      { id: 'practice', auditActionId: 'practice_topic', label: '问道练习', detail: '不写正式积分。' },
      { id: 'queue_again', auditActionId: 'queue_again', label: '继续真人排位', detail: '重新入队。' }
    ]
  }
}, 'finished');
assert.match(friendlyNextStepMarkup, /data-live-post-review-next-step-primary="friendly_rematch"/, 'friendly series next-step guide should prioritize low-pressure rematch over queue-again');
assert.match(friendlyNextStepMarkup, /data-live-post-review-next-step-action="friendly_rematch"[\s\S]*data-live-post-review-next-step-rank="primary"/, 'friendly next-step guide primary CTA should reuse friendly rematch');

const bridgedReview = PVPScene.getLivePostMatchReview({
  postMatchReview: {
    reportVersion: 'pvp-live-post-match-review-v1',
    result: 'loss',
    finishReason: 'lethal',
    summary: '公开轨迹显示血线被压低。',
    nextActions: [
      { id: 'review_key_turns', auditActionId: 'key_turn_replay', label: '关键回合复盘', detail: '按公开事件复盘。' },
      { id: 'share_replay', auditActionId: 'public_replay_share', label: '分享脱敏战报', detail: '生成公开战报。' },
      { id: 'adjust_loadout', auditActionId: 'apply_loadout_recommendation', label: '调整斗法谱', detail: '按公开推荐改谱。' },
      { id: 'practice', auditActionId: 'practice_topic', label: '问道练习', detail: '练习不写正式结果。' },
      { id: 'report_issue', auditActionId: 'report_issue', label: '举报异常', detail: '提交异常反馈。' }
    ]
  }
});
assert.deepEqual(
  bridgedReview.nextActions.map(action => `${action.id}:${action.auditActionId}`),
  ['review_key_turns:key_turn_replay', 'share_replay:public_replay_share', 'adjust_loadout:apply_loadout_recommendation', 'practice:practice_topic', 'report_issue:report_issue'],
  'post-match review normalizer should preserve audit action ids for real UI buttons'
);

let replayReviewState = {
  phase: 'finished',
  matchId: 'pvpm-ui-runtime-replay-fetch',
  seatId: 'A',
  stateView: {
    matchId: 'pvpm-ui-runtime-replay-fetch',
    status: 'finished',
    stateVersion: 77,
    postMatchReview: {
      reportVersion: 'pvp-live-post-match-review-v1',
      result: 'loss',
      finishReason: 'lethal',
      summary: '公开轨迹显示终局。',
      keyTurnReplay: {
        reportVersion: 'pvp-live-key-turn-replay-v1',
        sourceVisibility: 'public_events',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        turns: [
          { id: 'start', label: '开战', sequence: 1, eventType: 'battle_started', lesson: '确认先后手。' },
          { id: 'finish', label: '终局', sequence: 9, eventType: 'match_finished', lesson: '确认终局窗口。' }
        ]
      },
      nextActions: [
        { id: 'review_key_turns', auditActionId: 'key_turn_replay', label: '关键回合复盘', detail: '拉取权威回放并聚焦关键回合。' }
      ]
    }
  },
  lastReplay: null,
  lastReplayMatchId: '',
  lastEvents: []
};
const replayFetchCalls = [];
PVPScene.liveReviewFocus = '';
PVPScene.liveInlineHint = '';
PVPScene.renderLivePanel = () => {};
PVPScene.getLiveSession = () => ({
  getState: () => replayReviewState,
  getReplay: async (options = {}) => {
    replayFetchCalls.push(options);
    replayReviewState = {
      ...replayReviewState,
      lastReplay: {
        reportVersion: 'pvp-live-replay-v1',
        visibilityLayer: options.visibility || 'replay_self',
        publicSummary: { status: 'finished', finishReason: 'lethal', winnerSeat: 'B', loserSeat: 'A' },
        eventCount: 4,
        hiddenScan: { forbiddenTokenCount: 0, forbiddenKeyCount: 0, forbiddenStringCount: 0 }
      },
      lastReplayMatchId: 'pvpm-ui-runtime-replay-fetch',
      lastError: null
    };
    return replayReviewState;
  }
});
await PVPScene.handleLivePostReviewAction('review_key_turns');
const replaySnapshot = PVPScene.getLiveSnapshot();
assert.deepEqual(replayFetchCalls, [{ visibility: 'replay_self' }], 'key-turn review action should fetch the authoritative replay_self layer');
assert.equal(replaySnapshot.lastReplay?.reportVersion, 'pvp-live-replay-v1', 'live snapshot should expose the fetched replay summary');
assert.equal(replaySnapshot.lastReplay?.visibilityLayer, 'replay_self', 'fetched key-turn replay should stay viewer-scoped');
assert.equal(replaySnapshot.lastReplay?.hiddenScan?.forbiddenTokenCount, 0, 'fetched replay summary should preserve the hidden-token scan result');
assert.match(PVPScene.liveInlineHint, /权威回放|关键回合/, 'key-turn replay fetch should explain the authoritative replay focus');

let shareReviewState = {
  phase: 'finished',
  matchId: 'pvpm-ui-runtime-share-replay',
  seatId: 'A',
  stateView: {
    matchId: 'pvpm-ui-runtime-share-replay',
    status: 'finished',
    stateVersion: 79,
    postMatchReview: {
      reportVersion: 'pvp-live-post-match-review-v1',
      result: 'win',
      finishReason: 'lethal',
      summary: '公开轨迹可分享。',
      nextActions: [
        { id: 'share_replay', auditActionId: 'public_replay_share', label: '分享脱敏战报', detail: '生成公开战报链接。' }
      ]
    }
  },
  lastReplayShare: null,
  lastReplayShareMatchId: '',
  lastEvents: []
};
const replayShareCalls = [];
const replayShareCopyCalls = [];
const previousCopyLiveReplayShareLink = PVPScene.copyLiveReplayShareLink;
PVPScene.copyLiveReplayShareLink = async (shareLink = '') => {
  replayShareCopyCalls.push(shareLink);
  return true;
};
PVPScene.renderLivePanel = () => {};
PVPScene.getLiveSession = () => ({
  getState: () => shareReviewState,
  createReplayShare: async (options = {}) => {
    replayShareCalls.push({ method: 'createReplayShare', options });
    shareReviewState = {
      ...shareReviewState,
      lastReplayShare: {
        reportVersion: 'pvp-live-replay-share-v1',
        shareToken: 'pvplrs-ui-runtime-share-123456789012',
        apiPath: '/api/pvp/live/replay-shares/pvplrs-ui-runtime-share-123456789012',
        sharePath: '/?pvpReplayShare=pvplrs-ui-runtime-share-123456789012',
        shareUrl: 'https://080305.xyz/?pvpReplayShare=pvplrs-ui-runtime-share-123456789012',
        visibilityLayer: 'replay_public',
        rankedImpact: 'none',
        rewardImpact: 'none',
        expiresAt: Date.now() + 86400000,
        revoked: false
      },
      lastReplayShareMatchId: 'pvpm-ui-runtime-share-replay',
      lastError: { reason: 'replay_share_created', message: '公开战报链接已生成。' }
    };
    return shareReviewState;
  },
  revokeReplayShare: async () => {
    replayShareCalls.push({ method: 'revokeReplayShare' });
    shareReviewState = {
      ...shareReviewState,
      lastReplayShare: {
        ...shareReviewState.lastReplayShare,
        revoked: true
      },
      lastError: { reason: 'replay_share_revoked', message: '公开战报链接已撤销。' }
    };
    return shareReviewState;
  }
});
await PVPScene.handleLivePostReviewAction('share_replay');
assert.deepEqual(replayShareCalls[0], { method: 'createReplayShare', options: { ttlDays: 30 } }, 'share_replay action should create a 30-day public replay share');
assert.deepEqual(replayShareCopyCalls, ['https://080305.xyz/?pvpReplayShare=pvplrs-ui-runtime-share-123456789012'], 'share_replay action should copy the front-end public replay viewer link');
assert.match(PVPScene.liveInlineHint, /脱敏战报链接已复制/, 'share_replay action should explain copied public replay boundary');
const shareReceiptHtml = PVPScene.renderLiveReplayShareReceipt();
assert.match(shareReceiptHtml, /data-live-replay-share/, 'public replay share receipt should render after creation');
assert.match(shareReceiptHtml, /data-live-replay-share-revoke/, 'public replay share receipt should expose a revoke control');
assert.match(shareReceiptHtml, /不含原始战局 ID/, 'public replay share receipt should explain raw match id boundary');
await PVPScene.revokeLiveReplayShare();
assert.equal(replayShareCalls.at(-1).method, 'revokeReplayShare', 'replay share revoke control should call session revoke API');
assert.match(PVPScene.liveInlineHint, /已撤销/, 'replay share revoke should explain revoked state');
const revokedShareReceiptHtml = PVPScene.renderLiveReplayShareReceipt();
assert.match(revokedShareReceiptHtml, /data-live-replay-share-revoked="true"/, 'revoked replay share receipt should mark the link as revoked');
assert.equal(/data-live-replay-share-revoke(?:\s|>)/.test(revokedShareReceiptHtml), false, 'revoked replay share receipt should hide the revoke control');
PVPScene.copyLiveReplayShareLink = previousCopyLiveReplayShareLink;

const previousPvpServiceGetReplayShare = PVPService.live.getReplayShare;
const previousDocumentQuerySelectorForReplayShare = documentStub.querySelector;
const replayShareViewerCalls = [];
const replayShareViewerHost = {
  hidden: true,
  innerHTML: '',
  dataset: {},
  attributes: {},
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  },
  getAttribute(name) {
    return this.attributes[name] || '';
  }
};
const replayShareViewerRoot = {
  dataset: {},
  attributes: {},
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  },
  querySelector(selector) {
    if (selector === '[data-live-replay-share-viewer-root]') return replayShareViewerHost;
    return null;
  }
};
documentStub.querySelector = (selector) => {
  if (selector === '[data-live-pvp-root]') return replayShareViewerRoot;
  if (selector === '[data-live-replay-share-viewer-root]') return replayShareViewerHost;
  return null;
};
PVPService.live.getReplayShare = async (shareToken = '') => {
  replayShareViewerCalls.push(shareToken);
  return {
    success: true,
    share: {
      reportVersion: 'pvp-live-replay-share-v1',
      shareToken,
      apiPath: `/api/pvp/live/replay-shares/${shareToken}`,
      sharePath: `/?pvpReplayShare=${shareToken}`,
      shareUrl: `https://080305.xyz/?pvpReplayShare=${shareToken}`,
      visibilityLayer: 'replay_public',
      sourceVisibility: 'replay_public',
      matchRef: 'a1b2c3d4e5f67890',
      rankedImpact: 'none',
      rewardImpact: 'none',
      boundary: '公开战报分享只暴露 replay_public 脱敏回放。'
    },
    replay: {
      reportVersion: 'pvp-live-replay-v1',
      visibilityLayer: 'replay_public',
      matchId: 'pvpm-ui-runtime-raw-should-not-render',
      publicSummary: {
        status: 'finished',
        winnerSeat: 'A',
        loserSeat: 'B',
        finishReason: 'lethal'
      },
      eventCount: 4,
      events: [
        { sequence: 1, eventType: 'battle_started', actingSeat: 'A', publicData: { firstSeat: 'A' } },
        { sequence: 2, eventType: 'opening_protection_triggered', actingSeat: 'A', publicData: { protectedSeat: 'B', minimumHp: 1, preventedDamage: 9 } },
        { sequence: 3, eventType: 'damage_applied', actingSeat: 'A', publicData: { targetSeat: 'B', hpDamage: 7, targetHp: 13 } },
        { sequence: 4, eventType: 'match_finished', actingSeat: 'A', publicData: { reason: 'lethal', winnerSeat: 'A', loserSeat: 'B' } }
      ],
      hiddenScan: { forbiddenTokenCount: 0, forbiddenKeyCount: 0, forbiddenStringCount: 0 },
      postMatchReview: { summary: 'SHOULD_NOT_RENDER_POST_MATCH_REVIEW' },
      settlementReport: { summaryLine: 'SHOULD_NOT_RENDER_SETTLEMENT' },
      seasonHonorReport: { summaryLine: 'SHOULD_NOT_RENDER_SEASON_HONOR' }
    }
  };
};
const replayShareViewerState = await PVPScene.openLiveReplayShareViewer(' pvplrs-ui_public_viewer_token_1234567890 ');
assert.equal(replayShareViewerState.status, 'ready', 'public replay viewer should enter ready state after anonymous fetch');
assert.deepEqual(replayShareViewerCalls, ['pvplrs-ui_public_viewer_token_1234567890'], 'public replay viewer should fetch by opaque share token only');
assert.equal(replayShareViewerHost.hidden, false, 'public replay viewer host should become visible');
assert.match(replayShareViewerHost.innerHTML, /data-live-replay-share-viewer/, 'public replay viewer should render a stable host marker');
assert.match(replayShareViewerHost.innerHTML, /replay_public/, 'public replay viewer should label replay_public visibility');
assert.match(replayShareViewerHost.innerHTML, /a1b2c3d4e5f67890/, 'public replay viewer should show the stable match reference');
assert.match(replayShareViewerHost.innerHTML, /伤害终结/, 'public replay viewer should show the public finish reason');
assert.match(replayShareViewerHost.innerHTML, /data-live-replay-share-highlight-list/, 'public replay viewer should render a key-moment highlight list');
assert.match(replayShareViewerHost.innerHTML, /关键节点/, 'public replay viewer should introduce key-moment highlights');
assert.match(replayShareViewerHost.innerHTML, /开局/, 'public replay viewer should highlight the public opening moment');
assert.match(replayShareViewerHost.innerHTML, /反打窗口/, 'public replay viewer should highlight the anti-snowball counterplay moment');
assert.match(replayShareViewerHost.innerHTML, /终局/, 'public replay viewer should highlight the public finish moment');
assert.equal(/pvpm-ui-runtime-raw-should-not-render|SHOULD_NOT_RENDER|postMatchReview|settlementReport|seasonHonorReport/.test(replayShareViewerHost.innerHTML), false, 'public replay viewer should not render raw match ids or seat-specific payload fields');
PVPService.live.getReplayShare = previousPvpServiceGetReplayShare;
documentStub.querySelector = previousDocumentQuerySelectorForReplayShare;

let reportReviewState = {
  phase: 'finished',
  matchId: 'pvpm-ui-runtime-report-issue',
  seatId: 'A',
  stateView: {
    matchId: 'pvpm-ui-runtime-report-issue',
    status: 'finished',
    stateVersion: 88,
    postMatchReview: {
      reportVersion: 'pvp-live-post-match-review-v1',
      result: 'loss',
      finishReason: 'lethal',
      summary: '公开轨迹显示终局。',
      nextActions: [
        { id: 'report_issue', auditActionId: 'report_issue', label: '举报异常', detail: '提交异常反馈；不即时改分。' },
        { id: 'avoid_opponent', auditActionId: 'avoid_opponent', label: '避开此对手', detail: '后续匹配优先避开；不改写本局结算。' }
      ]
    }
  },
  lastDisputeReport: null,
  lastAvoidOpponentReport: null,
  lastEvents: []
};
const disputeCalls = [];
const avoidOpponentCalls = [];
PVPScene.liveReviewFocus = '';
PVPScene.liveInlineHint = '';
PVPScene.renderLivePanel = () => {};
PVPScene.getLiveSession = () => ({
  getState: () => reportReviewState,
  submitReport: async (report = {}) => {
    disputeCalls.push(report);
    reportReviewState = {
      ...reportReviewState,
      lastDisputeReport: {
        reportVersion: 'pvp-live-dispute-report-receipt-v1',
        reportId: 'pvplr-ui-runtime-1',
        status: 'reported',
        reason: report.reason,
        sourceVisibility: 'audit_safe_public_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        nextStepLine: '异常反馈已提交；复核不会立即改写本局结算。',
        evidencePackage: {
          reportVersion: 'pvp-live-dispute-evidence-v1',
          sourceVisibility: 'audit_safe_public_state',
          usesHiddenInformation: false,
          rankedImpact: 'none',
          matchId: 'pvpm-ui-runtime-report-issue',
          reporterSeat: 'A',
          finishReason: 'lethal',
          eventCount: 3,
          riskTags: ['player_reported', 'fairness_review_requested']
        },
        boundary: '提交异常反馈不会即时改变正式积分、奖励或匹配评分。'
      },
      lastError: {
        reason: 'report_issue_submitted',
        message: '异常反馈已提交；复核不会立即改写本局结算。'
      }
    };
    return reportReviewState;
  },
  avoidOpponent: async (request = {}) => {
    avoidOpponentCalls.push(request);
    reportReviewState = {
      ...reportReviewState,
      lastAvoidOpponentReport: {
        reportVersion: 'pvp-live-avoid-opponent-receipt-v1',
        status: 'active',
        reason: request.reason || 'post_match_avoid',
        sourceVisibility: 'account_preference',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        formalResultPolicy: 'no_result_change',
        safeguard: 'player_avoid_opponent',
        sourceMatchId: 'pvpm-ui-runtime-report-issue',
        nextStepLine: '已记录：后续匹配会优先避开此对手；这不会改写本局结算。',
        boundary: '避开对手只影响后续匹配优先级，不保证永久不匹配，不影响积分、奖励或隐藏信息。'
      },
      lastError: {
        reason: 'avoid_opponent_saved',
        message: '已记录：后续匹配会优先避开此对手；这不会改写本局结算。'
      }
    };
    return reportReviewState;
  }
});
await PVPScene.handleLivePostReviewAction('report_issue');
const disputeSnapshot = PVPScene.getLiveSnapshot();
assert.deepEqual(disputeCalls.map(call => call.reason), ['fairness_review'], 'report_issue action should submit a fairness dispute report');
assert.equal(disputeSnapshot.lastDisputeReport?.reportVersion, 'pvp-live-dispute-report-receipt-v1', 'live snapshot should expose the submitted dispute receipt');
assert.equal(disputeSnapshot.lastDisputeReport?.rankedImpact, 'none', 'dispute receipt should not affect ranked state');
assert.equal(disputeSnapshot.lastDisputeReport?.evidencePackage?.usesHiddenInformation, false, 'dispute receipt evidence should stay audit-safe');
assert.equal(disputeSnapshot.lastDisputeReport?.evidencePackage?.eventCount, 3, 'dispute receipt should summarize public evidence count');
assert.match(PVPScene.liveInlineHint, /不会立即改写本局结算/, 'report_issue action should explain non-immediate settlement impact');
assert.match(PVPScene.renderLiveDisputeReportReceipt(), /data-live-dispute-report/, 'dispute receipt should render a stable DOM marker');
assert.doesNotMatch(PVPScene.renderLiveDisputeReportReceipt(), /hand|deck|cardId|instanceId|loadoutSnapshot/i, 'dispute receipt UI should not render hidden card or loadout tokens');

await PVPScene.handleLivePostReviewAction('avoid_opponent');
const avoidOpponentSnapshot = PVPScene.getLiveSnapshot();
assert.deepEqual(avoidOpponentCalls.map(call => call.reason), ['post_match_avoid'], 'avoid_opponent action should submit a post-match avoid preference');
assert.equal(avoidOpponentSnapshot.lastAvoidOpponentReport?.reportVersion, 'pvp-live-avoid-opponent-receipt-v1', 'live snapshot should expose the avoid-opponent receipt');
assert.equal(avoidOpponentSnapshot.lastAvoidOpponentReport?.rankedImpact, 'none', 'avoid-opponent receipt should not affect ranked state');
assert.equal(avoidOpponentSnapshot.lastAvoidOpponentReport?.usesHiddenInformation, false, 'avoid-opponent receipt should stay audit-safe');
assert.equal(avoidOpponentSnapshot.lastAvoidOpponentReport?.safeguard, 'player_avoid_opponent', 'avoid-opponent receipt should expose the future matching safeguard');
assert.match(PVPScene.liveInlineHint, /优先避开此对手/, 'avoid_opponent action should explain future matching impact');
assert.match(PVPScene.renderLiveAvoidOpponentReceipt(), /data-live-avoid-opponent/, 'avoid-opponent receipt should render a stable DOM marker');
assert.doesNotMatch(PVPScene.renderLiveAvoidOpponentReceipt(), /hand|deck|cardId|instanceId|loadoutSnapshot/i, 'avoid-opponent receipt UI should not render hidden card or loadout tokens');

console.log('PVP live UI runtime checks passed.');
