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
assert.match(renderedActionReceipt, /权威公开投影/, 'live UI action receipt should render accurate projection source');
assert.doesNotMatch(renderedActionReceipt, /cardInstanceId|sourceCardId|deck|rating|reward/i, 'live UI action receipt rendering must not expose hidden ids or rewards');

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
assert.doesNotMatch(renderedEndTurnReceipt, /cardInstanceId|sourceCardId|deck|rating|reward/i, 'live UI end-turn receipt rendering must not expose hidden ids or rewards');

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
assert.match(localDisconnectedConnectionCopy, /刷新同步权威结果|同步权威结果/, 'live UI local disconnected state prefers authoritative sync guidance before connection_timeout');
assert.match(localDisconnectedConnectionCopy, /仍在可恢复窗口会自动重连/, 'live UI local disconnected state keeps recovery conditional');
assert.match(localDisconnectedConnectionCopy, /权威|connection_timeout|超时结算/, 'live UI local disconnected state should explain authoritative terminal boundary');

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
assert.match(opponentDisconnectedCurrentTurnCopy, /当前行动|connection_timeout|超时结算/, 'live UI should name the authoritative timeout boundary when the disconnected opponent owns the action window');

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
assert.doesNotMatch(matchQualityWithConnectionGate, /rtt|missed|heartbeat|reconnect|延迟.*\\d/i, 'live UI match quality should not expose raw connection probe details');

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
const lowSamplePracticeScenario = PVPScene.buildLiveWaitingPracticeScenario(lowSampleWaitingState);
assert.equal(
  lowSamplePracticeScenario?.finishReason,
  'low_sample_protection',
  'low-sample waiting safeguard should create a no-score practice handoff scenario',
);

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
const openingActionIntents = [];
PVPScene.liveIntentInFlight = null;
PVPScene.liveOpeningActionConfirm = null;
PVPScene.liveInlineHint = '';
PVPScene.startLiveRealtime = () => {};
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
        mitigation: 'guard_response'
      }]
    },
    summaryLine: 'B 打出护体诀：不造成伤害；自身护盾 +7；稳住破绽，阻止后续兑现。',
    safeguards: ['public_events', 'self_block', 'public_status_mitigated']
  }
});
assert.equal(mitigatedReceipt.statusEffects.mitigated[0].statusId, 'vulnerable_mark', 'live UI should preserve mitigated public status effects in action receipts');
assert.match(PVPScene.renderLiveActionReceiptReport({ actionReceiptReport: mitigatedReceipt }), /稳住破绽|阻止后续兑现/, 'live UI action receipt should explain public status mitigation');
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

const bridgedReview = PVPScene.getLivePostMatchReview({
  postMatchReview: {
    reportVersion: 'pvp-live-post-match-review-v1',
    result: 'loss',
    finishReason: 'lethal',
    summary: '公开轨迹显示血线被压低。',
    nextActions: [
      { id: 'review_key_turns', auditActionId: 'key_turn_replay', label: '关键回合复盘', detail: '按公开事件复盘。' },
      { id: 'adjust_loadout', auditActionId: 'apply_loadout_recommendation', label: '调整斗法谱', detail: '按公开推荐改谱。' },
      { id: 'practice', auditActionId: 'practice_topic', label: '问道练习', detail: '练习不写正式结果。' },
      { id: 'report_issue', auditActionId: 'report_issue', label: '举报异常', detail: '提交异常反馈。' }
    ]
  }
});
assert.deepEqual(
  bridgedReview.nextActions.map(action => `${action.id}:${action.auditActionId}`),
  ['review_key_turns:key_turn_replay', 'adjust_loadout:apply_loadout_recommendation', 'practice:practice_topic', 'report_issue:report_issue'],
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
        { id: 'report_issue', auditActionId: 'report_issue', label: '举报异常', detail: '提交异常反馈；不即时改分。' }
      ]
    }
  },
  lastDisputeReport: null,
  lastEvents: []
};
const disputeCalls = [];
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

console.log('PVP live UI runtime checks passed.');
