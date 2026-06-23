const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function methodBody(source, name) {
  const pattern = new RegExp(`${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\},`);
  const match = source.match(pattern);
  return match ? match[1] : '';
}

const html = read('index.html');
const scene = read('js/scenes/pvp-scene.js');
const liveSession = read('js/services/pvp-live-session.js');
const game = read('js/game.js');
const challengeHub = read('js/core/challenge_hub.js');
const css = read('css/pvp.css');
const nodeGate = read('tests/run_node_checks.sh');
const browserGate = read('tests/run_browser_release_checks.sh');
const liveBrowserAudit = read('tests/browser_pvp_live_audit.mjs');

[
  {
    label: 'live rune tab should be the default active entry',
    pattern: /<button\b(?=[^>]*\bclass="[^"]*\brune-tab\b[^"]*\bactive\b)(?=[^>]*\bdata-pvp-tab="live")(?=[^>]*\bonclick="PVPScene\.switchTab\('live'\)")/s,
  },
  {
    label: 'live pane should be active by default',
    pattern: /<div\b(?=[^>]*\bid="tab-live")(?=[^>]*\bclass="[^"]*\bpvp-tab-pane\b[^"]*\bpvp-live-shell\b[^"]*\bactive\b)/s,
  },
  {
    label: 'ranking pane should be marked as legacy practice',
    pattern: /<div\b(?=[^>]*\bid="tab-ranking")(?=[^>]*\bclass="[^"]*\bpvp-tab-pane\b[^"]*\bpvp-legacy-ranking-pane\b)/s,
  },
].forEach(({ label, pattern }) => {
  assert.ok(pattern.test(html), `index live PVP default entry contract failed: ${label}`);
});

[
  'data-pvp-legacy-practice',
  "PVPScene.switchTab('live')",
  'data-pvp-tab="live"',
  'data-live-pvp-root',
  'data-live-phase',
  'data-live-action="join-queue"',
  'data-live-action="cancel-queue"',
  'data-live-action="refresh-match"',
  'data-live-action="confirm-mulligan"',
  'data-live-action="ready"',
  'data-live-action="end-turn"',
  'data-live-action="surrender"',
  'data-live-event-log',
  'data-live-self-loadout',
  'data-live-opponent-loadout',
  'data-live-match-quality',
  'data-live-opening-safeguard',
  'data-live-action-receipt',
  'data-live-action-receipt-source',
  'data-live-action-receipt-hidden',
  'data-live-action-receipt-seq',
  'data-live-action-receipt-type',
  'data-live-action-receipt-acting',
  'data-live-action-receipt-next-seat',
  'data-live-duel-momentum',
  'data-live-social-panel',
  'data-live-social-status',
  'data-live-emote="respect"',
  'data-live-emote="thinking"',
  'data-live-action="toggle-social-mute"',
  'data-live-first-guide',
  'data-live-first-match-guide',
  'data-live-waiting-report',
  'data-live-replay-share-viewer-root',
  'data-live-post-match-review',
  'data-live-action="practice-live"',
  'data-live-action="cancel-rematch"',
  'data-live-action="create-invite"',
  'data-live-action="join-invite"',
  'data-live-action="cancel-invite"',
  'data-live-invite-code',
  'data-live-invite-input',
  'data-live-target-username',
  'data-live-invite-inbox',
  'data-live-loadout-presets',
  'data-live-selected-loadout',
  'PVPScene.stopLivePolling(); PVPScene.stopLiveHeartbeat(); game.showScreen',
].forEach((needle) => {
  assert.ok(html.includes(needle), `index live PVP tab should include marker: ${needle}`);
});

[
  'PVPScene.findMatch()',
  '镜像演武',
  '不是真人排位',
].forEach((needle) => {
  assert.ok(html.includes(needle), `legacy ranking practice entry should be clearly demoted: ${needle}`);
});

[
  "from \"../services/pvp-live-session.js\"",
  "activeTab: 'live'",
  "this.switchTab('live')",
  'getLiveSession()',
  'renderLivePanel()',
  'formatLiveRealtimeStatus(',
  'getLiveTurnTimerUrgency(',
  'isLiveOpeningActionConfirmRequired(',
  'isLiveOpeningActionConfirmArmed(',
  'formatLiveOpeningActionConfirmMessage(',
  'armLiveOpeningActionConfirm(',
  'clearLiveOpeningActionConfirm(',
  'buildLiveQueueConnectionHealthProbe(',
  'isLiveSurrenderConfirmArmed(',
  'armLiveSurrenderConfirm(',
  'clearLiveSurrenderConfirm(',
  'joinLiveQueue(options = {})',
  'resolveLivePostReviewLoadoutPreset(',
  'pvp-live-post-review-loadout-resolution-v1',
  'createLiveInvite()',
  'joinLiveInvite()',
  'joinLiveInboxInvite(',
  'cancelLiveInvite()',
  'refreshInviteInbox',
  'cancelLiveQueue()',
  'refreshLiveMatch(',
  'confirmLiveMulligan()',
  'readyLiveMatch()',
  'toggleLiveMulliganCard(',
  'submitLiveCard(',
  'endLiveTurn()',
  'surrenderLiveMatch()',
  'getLiveSnapshot()',
  'getLiveWaitingReport(',
  'getLiveWaitingQualitySafeguard(',
  'renderLiveWaitingReport(',
  'getLiveConnectionHealthError(',
  'isLiveEntrySafeguardBlocked(',
  'hasLiveEntrySafeguardAction(',
  'buildLiveEntrySafeguardPracticeScenario(',
  'commitLiveEntrySafeguardPracticeHandoff(',
  'buildLiveWaitingPracticeScenario(',
  'commitLiveWaitingPracticeHandoff(',
  'getLivePostMatchReview(',
  'renderLivePostMatchReview(',
  'getLiveFriendlySeries(',
  'renderLiveFriendlySeries(',
  'renderLiveInviteReport(',
  'getLiveKeyTurnReplay(',
  'renderLiveKeyTurnReplay(',
  'getLiveExperienceReport(',
  'renderLiveExperienceReport(',
  'handleLiveExperienceCheckFocus(',
  'buildLivePostReviewDrillScenario(',
  'commitLivePostReviewPracticeHandoff(',
  'handleLivePostReviewAction(',
  'friendly_rematch',
  'openLivePracticeHint(',
  'this.liveInlineHint = message',
  'getLiveLoadoutPresets()',
  'getLiveSelectedLoadoutPreset()',
  'setLiveLoadoutPreset(',
  'renderLiveLoadoutPresets(',
  'getLiveQueueLoadoutCandidate(',
  'formatLiveMatchQuality(',
  'shouldLivePoll(',
  'liveLongWaitPollUntil',
  'fromAutoPoll',
  'refreshLiveMatch({ fromAutoPoll: true })',
  'Promise.resolve(this.sendLiveHeartbeat())',
  'getLiveFirstMatchGuide(',
  'renderLiveFirstMatchGuide(',
  'getLiveLoadoutExplorationReport(',
  'renderLiveLoadoutExplorationReport(',
  'getLiveOpeningSafeguardReport(',
  'renderLiveOpeningSafeguardReport(',
  'getLiveActionPreviewReport(',
  'getLiveCardActionPreview(',
  'formatLiveActionPreviewLine(',
  'getLiveActionReceiptReport(',
  'renderLiveActionReceiptReport(',
  'cardDraw',
  'card_cycled',
  '公开抽滤',
  'public_card_cycle',
  'data-live-card-cycle',
  'healing',
  'hp_recovered',
  '公开恢复',
  'public_hp_recovered',
  'data-live-hp-recovered',
  '交权回执',
  'getLiveDuelMomentumReport(',
  'renderLiveDuelMomentumReport(',
  'getLiveIntentSignalReport(',
  'renderLiveIntentSignalReport(',
  'getLivePublicStatuses(',
  'renderLivePublicStatuses(',
  'formatLiveEvent(',
  'formatLiveLoadoutSummary(',
  'getLiveOpponentPublicProfile(',
  'formatLiveOpponentPublicProfile(',
  'getLiveEmoteOptions()',
  'getLiveSocialPreferenceStorageKey()',
  'loadLiveSocialPreferences()',
  'saveLiveSocialPreferences()',
  'ensureLiveSocialPreferencesLoaded()',
  'submitLiveEmote(',
  'toggleLiveSocialMute(',
  'createLiveInvite(',
  'ready: !!view.self.ready',
  'mulliganUsed: !!view.self.mulliganUsed',
  'block: Math.max(0, Math.floor(Number(view.self.block) || 0))',
  'ready: !!view.opponent.ready',
  'mulliganUsed: !!view.opponent.mulliganUsed',
  'block: Math.max(0, Math.floor(Number(view.opponent.block) || 0))',
  'joinLiveInvite(',
  'cancelLiveInvite(',
  'filterLiveEventsForMute(',
  'pvp-live-social-preferences-v1',
  "preferenceScope: 'local_only'",
  "sourceVisibility: 'local_preference'",
  "rankedImpact: 'none'",
  "persistence: 'local_storage'",
  '本地偏好',
].forEach((needle) => {
  assert.ok(scene.includes(needle), `PVPScene should expose live UI marker: ${needle}`);
});

[
  'pvp-live-drill-scenario-v1',
  'pvp-live-key-turn-replay-v1',
  'pvp-live-experience-report-v1',
  'pvp-live-fairness-receipt-v1',
  'linkedEvidence',
  'seatWindowSummary',
  'safeguardSummary',
  'fairnessReceipt',
  'data-live-fairness-receipt',
  'getLiveFairnessReceipt(',
  'renderLiveFairnessReceipt(',
  'review_key_turns',
  'share_replay',
  'data-live-post-review-audit-action',
  'lastReplay: replayMatchId && replayMatchId === activeLiveSourceId ? this.getLiveReplaySummary(state.lastReplay) : null',
  'lastReplayShare: replayShareMatchId && replayShareMatchId === activeLiveSourceId ? state.lastReplayShare : null',
  'getReplay({ visibility: \'replay_self\' })',
  'createReplayShare({ ttlDays: 30 })',
  'copyLiveReplayShareLink(',
  'replay_share_created',
  'revokeLiveReplayShare(',
  'data-live-replay-share-revoke',
  'replay_share_revoked',
  'normalizeLiveReplayShareToken(',
  'openLiveReplayShareViewer(',
  'renderLiveReplayShareViewer(',
  'renderLiveReplayShareViewerMarkup(',
  'PVPService.live.getReplayShare(token)',
  'data-live-replay-share-viewer',
  'data-live-replay-share-viewer-public-only',
  'data-live-key-turn-replay',
  'data-live-experience-report',
  'pvp-live-loadout-exploration-v1',
  'data-live-loadout-exploration',
  'pvp-live-season-goal-v1',
  'data-live-season-goal',
  'data-live-season-goal-action',
  'data-live-season-goal-dismiss',
  'pvp-live-settlement-report-v1',
  'data-live-settlement-report',
  'data-live-settlement-source',
  'data-live-season-honor',
  'pvp-live-season-honor-v1',
  'pvp-live-season-honor-reward-v1',
  'data-live-season-honor-reward',
  'data-live-season-honor-reward-impact',
  'data-live-season-honor-reward-state',
  'data-live-season-honor-reward-collection',
  'cosmeticReward',
  'collectionState',
  'collectionReport',
  'pvp-live-season-honor-collection-v1',
  'pvp-live-duel-momentum-v1',
  'duelMomentumReport',
  'data-live-duel-momentum',
  'pvp-live-intent-signal-v1',
  'intentSignalReport',
  'data-live-intent-signal',
  'data-live-self-statuses',
  'data-live-opponent-statuses',
  'data-live-public-status',
  'status_mitigated',
  'public_status_mitigated',
  'card_cycled',
  'public_card_cycle',
  'data-live-card-cycle',
  'hp_recovered',
  'public_hp_recovered',
  'data-live-hp-recovered',
  'pvp-live-action-receipt-v1',
  'actionReceiptReport',
  'data-live-action-receipt',
  'getLiveSettlementReport(',
  'renderLiveSettlementReport(',
  'getLiveSeasonGoalCard(',
  'syncSeasonGoalFromReview({',
  'badExperienceStreak',
  'recoveryState',
  'recordLiveSeasonGoalAction(',
  'dismissLiveSeasonGoal(',
  'experience_check:',
  'sourceVisibility',
  'usesHiddenInformation',
  'rankedImpact',
  'pvp-live-friendly-series-v1',
  'data-live-friendly-series',
  'scoreBySourceSeat',
  'seriesStatus',
  'canRequestNextRound',
  'setObservatoryTrainingFocus',
  'beginPvpLiveDrillScenario',
].forEach((needle) => {
  assert.ok(scene.includes(needle), `PVPScene live practice handoff should include marker: ${needle}`);
});

[
  'theDefierPvpLiveSeasonGoalV1',
  'getSeasonGoalState: readSeasonGoalState',
  'syncSeasonGoalFromReview',
  'consecutive_low_agency_losses',
  'recordSeasonGoalAction',
  'dismissSeasonGoal',
  'lastReviewAction',
  'dismissedUntilSeason',
].forEach((needle) => {
  assert.ok(liveSession.includes(needle), `PVP live session should persist local season goal marker: ${needle}`);
});

[
  'lastRealtimeIntentResult: null',
  'lastRealtimeIntentResult: intentResult',
  "intentId: String(message.intentId || '')",
  "const result = String(message.result || '').trim()",
].forEach((needle) => {
  assert.ok(liveSession.includes(needle), `PVP live session should expose realtime intent ack marker: ${needle}`);
});

[
  'buildPvpLiveDrillBundle = function',
  'beginPvpLiveDrillScenario = function',
  'pvp-live-drill-scenario-v1',
  'replayOnly: true',
  'practiceOnly: true',
  'archiveEntryId: `pvp_live:',
  '真人 PVP · 问道练习',
].forEach((needle) => {
  assert.ok(challengeHub.includes(needle), `challenge hub should expose playable PVP live drill marker: ${needle}`);
});

  [
    'joinLiveQueue',
    'createLiveInvite',
    'joinLiveInvite',
    'cancelLiveInvite',
    'cancelLiveQueue',
  'refreshLiveMatch',
  'resumeLiveMatch',
  'confirmLiveMulligan',
  'readyLiveMatch',
  'toggleLiveMulliganCard',
  'submitLiveCard',
  'endLiveTurn',
  'surrenderLiveMatch',
  'submitLiveEmote',
  'toggleLiveSocialMute',
].forEach((name) => {
  const body = methodBody(scene, name);
  assert.ok(body, `PVPScene method should exist: ${name}`);
  [
    'findOpponent',
    'reportMatchResult',
    'startPVPBattle',
    'GhostEnemy',
    'pvpMatchTicket',
    'didWin',
  ].forEach((forbidden) => {
    assert.ok(!body.includes(forbidden), `${name} must not use legacy PVP path: ${forbidden}`);
  });
});

const loadLivePanelBody = methodBody(scene, 'loadLivePanel');
assert.ok(loadLivePanelBody.includes('resumeLiveMatch'), 'loadLivePanel should try to resume current live match when opening live tab');

const startLiveHeartbeatBody = methodBody(scene, 'startLiveHeartbeat');
assert.ok(startLiveHeartbeatBody.includes('heartbeatIntervalMs'), 'startLiveHeartbeat should consume authoritative heartbeatIntervalMs from connectionReport');
assert.ok(!startLiveHeartbeatBody.includes('}, 5000)'), 'startLiveHeartbeat must not hard-code 5000ms once server interval is exposed');
assert.ok(startLiveHeartbeatBody.includes('this.stopLiveHeartbeat()'), 'startLiveHeartbeat should rebuild heartbeat timer when authoritative interval changes');
assert.ok(scene.includes('startLiveHeartbeat({ sendImmediately = true } = {})'), 'startLiveHeartbeat should allow timer rebuild without duplicate immediate heartbeat');
assert.ok(scene.includes('this.startLiveHeartbeat({ sendImmediately: false })'), 'sendLiveHeartbeat should rebuild timer without duplicate immediate heartbeat');
assert.ok(scene.includes('startLiveRealtime(state = null, { resume = false } = {})'), 'PVPScene should start live realtime transport from session state');
assert.ok(scene.includes('session.joinRealtimeMatch(sourceState.matchId'), 'PVPScene should join realtime match with the current match id');
assert.ok(scene.includes('lastSeenRevision: this.getLiveLastSeenEventRevision(sourceState)'), 'PVPScene should request missed event replay from the last seen event revision');
assert.ok(scene.includes('Array.isArray(sourceState.lastEvents)'), 'PVPScene should include replay event high-water marks when reconnecting realtime');
assert.ok(scene.includes('this.stopLiveRealtime()'), 'PVPScene should close realtime transport when heartbeat lifecycle stops');
assert.ok(scene.includes('ensureLiveLifecycleBindings()'), 'PVPScene should bind page lifecycle events for live foreground resume');
assert.ok(scene.includes("doc.addEventListener('visibilitychange'"), 'PVPScene should listen for document visibility changes');
assert.ok(scene.includes("win.addEventListener('pageshow'"), 'PVPScene should listen for pageshow foreground resumes');
assert.ok(scene.includes("win.addEventListener('focus'"), 'PVPScene should listen for focus foreground resumes');
assert.ok(scene.includes('queueLiveForegroundResume()'), 'PVPScene should debounce live foreground resume signals');
assert.ok(scene.includes('handleLiveForegroundResume()'), 'PVPScene should expose a live foreground resume handler');
assert.ok(scene.includes('doc && doc.hidden === true'), 'PVPScene should ignore hidden-page lifecycle signals');
assert.ok(scene.includes('sendLiveHeartbeat({ resumeRealtime: true })'), 'PVPScene should immediately heartbeat when live page returns foreground');
assert.ok(scene.includes('onChange: () => this.queueLiveRealtimeRender()'), 'PVPScene should re-render when live session receives realtime state');
assert.ok(scene.includes('queueLiveRealtimeRender()'), 'PVPScene should batch realtime render updates');
assert.ok(scene.includes('liveReviewFocus'), 'PVPScene should persist post-review focus across realtime re-renders');
const sendLiveHeartbeatBody = methodBody(scene, 'sendLiveHeartbeat');
assert.ok(sendLiveHeartbeatBody.includes('session.heartbeatRealtime(state.matchId)'), 'sendLiveHeartbeat should prefer realtime heartbeat when WS is connected');
assert.ok(sendLiveHeartbeatBody.includes('await session.heartbeat()'), 'sendLiveHeartbeat should keep HTTP heartbeat fallback');
assert.ok(scene.includes('sendLiveHeartbeat({ resumeRealtime = false } = {})'), 'sendLiveHeartbeat should expose foreground resume mode without changing interval ticks');
assert.ok(sendLiveHeartbeatBody.includes('usedRealtimeResume'), 'sendLiveHeartbeat should avoid duplicate realtime heartbeat after resumeRealtime succeeds');
const submitLiveIntentBody = methodBody(scene, 'submitLiveIntent');
assert.ok(submitLiveIntentBody.includes('session.submitRealtimeIntent(intentWithVersion'), 'submitLiveIntent should prefer realtime intent when WS is connected');
assert.ok(submitLiveIntentBody.includes('return await session.submitIntent(intentWithVersion)'), 'submitLiveIntent should keep HTTP intent fallback');
assert.ok(scene.includes('liveIntentInFlight'), 'PVPScene should track one live realtime intent in-flight');
assert.ok(scene.includes('resolveLiveIntentInFlight'), 'PVPScene should release live realtime intent locks from authoritative state changes');
assert.ok(scene.includes('markLiveIntentInFlight'), 'PVPScene should mark realtime intents as pending after successful WS send');
assert.ok(scene.includes('clearLiveIntentInFlight'), 'PVPScene should clear live intent lock for HTTP fallback or released realtime state');
assert.ok(scene.includes('getLiveIntentLockKey'), 'PVPScene should split action and social realtime intent locks');
assert.ok(scene.includes('lastRealtimeIntentResult'), 'PVPScene should release realtime intent locks from matching intent_result ack');
assert.ok(scene.includes('getLiveActionReleaseEventTypes'), 'PVPScene should map action intent locks to matching authoritative event types');
assert.ok(scene.includes("'card_cycled'"), 'PVPScene should treat card_cycled as a play-card release event');
assert.ok(scene.includes('hasLiveActionReleaseEvidence'), 'PVPScene should not release action intent locks from social-only stateVersion changes');
const resolveLiveIntentBody = methodBody(scene, 'resolveLiveIntentInFlight');
assert.ok(resolveLiveIntentBody.includes('actionReleasedByEvent'), 'resolveLiveIntentInFlight should require action event evidence before stateVersion unlocks action locks');
assert.ok(scene.includes('lastSeenEventRevision'), 'PVPScene should record event high-water marks when realtime intents become pending');
assert.ok(scene.includes('eventRevision <= pendingEventRevision'), 'PVPScene should ignore stale action events when social stateVersion changes arrive later');
assert.ok(submitLiveIntentBody.includes('上一动作正在等待权威回执，请稍候。'), 'submitLiveIntent should surface a pending-action hint instead of sending duplicate live intents');
assert.ok(scene.includes('getLiveConnectionSubmitBlock'), 'PVPScene should derive live input locks from authoritative connection tempo');
assert.ok(scene.includes('blockLiveConnectionSubmit'), 'PVPScene should expose a shared connection tempo submit guard');
assert.ok(submitLiveIntentBody.includes('this.blockLiveConnectionSubmit(state)'), 'submitLiveIntent should block stale inputs before realtime or HTTP submit');
assert.ok(scene.includes('const connectionSubmitBlocked = !!this.getLiveConnectionSubmitBlock(state)'), 'live controls should share authoritative connection tempo input lock');
assert.ok(scene.includes('const intentLocked = this.isLiveIntentInFlight(state)'), 'live hand rendering should disable card clicks while a realtime intent is pending');
assert.ok(scene.includes('button.disabled = connectionSubmitBlocked || socialIntentLocked || !this.canSendLiveEmote(phase)'), 'live emote buttons should be disabled by authoritative connection tempo or social realtime intent locks');
const refreshLiveMatchBody = methodBody(scene, 'refreshLiveMatch');
assert.ok(refreshLiveMatchBody.includes('if (!fromAutoPoll)'), 'manual live refresh should be distinct from auto polling when clearing pending intents');
assert.ok(refreshLiveMatchBody.includes('this.clearLiveIntentInFlight()'), 'manual live refresh should clear local realtime intent locks after authoritative refresh');

[
  "liveSelectedLoadoutPreset: 'balanced'",
  "id: 'balanced'",
  "id: 'sword'",
  "id: 'shield'",
  "return phase === 'idle' || phase === 'finished' || phase === 'invalidated'",
  'getLiveLoadoutRecommendation(',
  'renderLiveLoadoutRecommendation(',
  'applyLivePostReviewLoadoutRecommendation(',
].forEach((needle) => {
  assert.ok(scene.includes(needle), `PVPScene should pin selectable live loadout preset marker: ${needle}`);
});

const joinLiveQueueBody = methodBody(scene, 'joinLiveQueue');
assert.ok(joinLiveQueueBody.includes('this.getLiveSelectedLoadoutPreset()'), 'joinLiveQueue should resolve the currently selected live loadout preset as fallback');
assert.ok(joinLiveQueueBody.includes('options.loadoutPresetId'), 'joinLiveQueue should accept an explicit post-review loadout preset when provided');
assert.ok(joinLiveQueueBody.includes('loadout: this.getLiveQueueLoadoutCandidate(selectedPreset.id)'), 'joinLiveQueue should submit the selected live loadout candidate for server-side snapshot lock');
assert.ok(joinLiveQueueBody.includes('connectionHealthProbe'), 'joinLiveQueue should send live connection health probe for ranked entry safeguard');
assert.ok(joinLiveQueueBody.includes('buildLiveQueueConnectionHealthProbe'), 'joinLiveQueue should build a pre-queue connection health probe before entering ranked queue');
assert.ok(scene.includes('acceptLiveWideMatch'), 'PVPScene should expose explicit wide match consent action for long waiting live queue');
assert.ok(scene.includes("data-live-waiting-action=\"accept-wide-match\""), 'live waiting report should render an explicit wide match consent action marker');
assert.ok(scene.includes('wideMatchConsent: true'), 'live wide match consent action should submit explicit wideMatchConsent to the server');
assert.ok(scene.includes('recent_opponent_suppression'), 'live waiting report should recognize recent-opponent suppression as a public quality safeguard');
assert.ok(scene.includes('low_sample_protection'), 'live waiting report should recognize low-sample protection as a public quality safeguard');

const submitLiveCardBody = methodBody(scene, 'submitLiveCard');
assert.ok(submitLiveCardBody.includes('view.opponent') && submitLiveCardBody.includes("state.seatId === 'B'"), 'submitLiveCard should target the opponent seat from live state, not hard-code seat B');
assert.ok(!submitLiveCardBody.includes("targetSeat: 'B'"), 'submitLiveCard must not hard-code targetSeat to B');
[
  'isLiveOpeningActionConfirmRequired',
  'isLiveOpeningActionConfirmArmed',
  'formatLiveOpeningActionConfirmMessage',
  'armLiveOpeningActionConfirm',
  "intentType: 'play_card'",
].forEach((needle) => {
  assert.ok(submitLiveCardBody.includes(needle), `submitLiveCard should require opening-window local confirmation before play_card intent: ${needle}`);
});
assert.ok(
  submitLiveCardBody.indexOf('armLiveOpeningActionConfirm') < submitLiveCardBody.indexOf("intentType: 'play_card'"),
  'submitLiveCard should arm opening confirmation before submitting play_card',
);

const openingConfirmMessageBody = methodBody(scene, 'formatLiveOpeningActionConfirmMessage');
[
  'getLiveActionPreviewReport',
  'getLiveCardActionPreview',
  'formatLiveActionPreviewLine',
  '权威预览',
].forEach((needle) => {
  assert.ok(openingConfirmMessageBody.includes(needle), `opening confirmation formatter should consume authoritative action preview: ${needle}`);
});

const endLiveTurnBody = methodBody(scene, 'endLiveTurn');
[
  'isLiveOpeningActionConfirmRequired',
  'isLiveOpeningActionConfirmArmed',
  'formatLiveOpeningActionConfirmMessage',
  'armLiveOpeningActionConfirm',
  "intentType: 'end_turn'",
].forEach((needle) => {
  assert.ok(endLiveTurnBody.includes(needle), `endLiveTurn should require opening-window local confirmation before end_turn intent: ${needle}`);
});
assert.ok(
  endLiveTurnBody.indexOf('armLiveOpeningActionConfirm') < endLiveTurnBody.indexOf("intentType: 'end_turn'"),
  'endLiveTurn should arm opening confirmation before submitting end_turn',
);

const surrenderLiveMatchBody = methodBody(scene, 'surrenderLiveMatch');
[
  'isLiveSurrenderConfirmArmed',
  'armLiveSurrenderConfirm',
  '再次点击确认认输',
  "intentType: 'surrender'",
].forEach((needle) => {
  assert.ok(surrenderLiveMatchBody.includes(needle), `surrenderLiveMatch should require explicit confirm before terminal intent: ${needle}`);
});
assert.ok(
  surrenderLiveMatchBody.indexOf('armLiveSurrenderConfirm') < surrenderLiveMatchBody.indexOf("intentType: 'surrender'"),
  'surrenderLiveMatch should arm confirmation before submitting the terminal surrender intent',
);

const firstGuideBody = methodBody(scene, 'renderLiveFirstMatchGuide');
[
  'guide.exceptionBranches',
  'guide.reviewActions',
  'pvp-live-guide-exceptions',
  'pvp-live-guide-review-actions',
  'pvp-live-guide-review-action',
].forEach((needle) => {
  assert.ok(firstGuideBody.includes(needle), `renderLiveFirstMatchGuide should render public first-match guide detail: ${needle}`);
});
assert.ok(!firstGuideBody.includes('guide.exceptionBranches.slice(0, 3)'), 'renderLiveFirstMatchGuide must not hide later public exception branches such as ready_timeout or refresh_required');
assert.ok(!firstGuideBody.includes('guide.reviewActions.slice(0, 3)'), 'renderLiveFirstMatchGuide must not hide later public review actions');

const openLivePracticeHintBody = methodBody(scene, 'openLivePracticeHint');
[
  'this.commitLiveEntrySafeguardPracticeHandoff()',
  'this.commitLiveWaitingPracticeHandoff()',
  '长等待练习',
  '连接健康练习',
  '不写正式积分',
].forEach((needle) => {
  assert.ok(openLivePracticeHintBody.includes(needle), `openLivePracticeHint should execute live waiting practice handoff: ${needle}`);
});
assert.ok(
  openLivePracticeHintBody.indexOf('this.commitLiveEntrySafeguardPracticeHandoff()') < openLivePracticeHintBody.indexOf('this.commitLiveWaitingPracticeHandoff()'),
  'openLivePracticeHint should try entry-safeguard no-score drill before falling back to long-wait practice',
);

const entrySafeguardPracticeBody = methodBody(scene, 'buildLiveEntrySafeguardPracticeScenario');
[
  "reportVersion: 'pvp-live-drill-scenario-v1'",
  "'entry_safeguard:connection_health_failed'",
  'entry_safeguard:${cooldownScenarioKey}',
  "sourceVisibility: 'replay_self'",
  'usesHiddenInformation: false',
  "rankedImpact: 'none'",
  'connectionHealth',
  'matchmakingGuard',
  "'ready_timeout'",
  "'connection_timeout'",
  '准备超时练习',
  '连接超时练习',
  '连接健康练习',
  '排队冷却练习',
  '入场保障',
].forEach((needle) => {
  assert.ok(entrySafeguardPracticeBody.includes(needle), `buildLiveEntrySafeguardPracticeScenario should create no-score connection drill scenario: ${needle}`);
});

const queueCooldownCountdownBody = methodBody(scene, 'getLiveQueueCooldownCountdown');
[
  'getLiveQueueCooldownError',
  'remainingSeconds',
  'buttonText',
  '后重试',
  '剩余',
  '问道练习'
].forEach((needle) => {
  assert.ok(queueCooldownCountdownBody.includes(needle), `getLiveQueueCooldownCountdown should expose player-visible cooldown timing: ${needle}`);
});

const entrySafeguardPracticeCommitBody = methodBody(scene, 'commitLiveEntrySafeguardPracticeHandoff');
[
  'buildLiveEntrySafeguardPracticeScenario',
  'beginPvpLiveDrillScenario',
  "showChallengeHub('daily')",
  '练习不写正式积分',
  '重试检测',
  '真人 PVP 入场保障',
].forEach((needle) => {
  assert.ok(entrySafeguardPracticeCommitBody.includes(needle), `commitLiveEntrySafeguardPracticeHandoff should open no-score entry safeguard drill: ${needle}`);
});
assert.ok(
  !entrySafeguardPracticeCommitBody.includes('cancelQueue'),
  'commitLiveEntrySafeguardPracticeHandoff must not cancel queue because blocked entry is already idle',
);

const waitingPracticeBody = methodBody(scene, 'buildLiveWaitingPracticeScenario');
[
  "reportVersion: 'pvp-live-drill-scenario-v1'",
  "sourceVisibility: 'replay_self'",
  'usesHiddenInformation: false',
  "rankedImpact: 'none'",
  'waitingReport',
  '等待真人',
].forEach((needle) => {
  assert.ok(waitingPracticeBody.includes(needle), `buildLiveWaitingPracticeScenario should create no-score long-wait drill scenario: ${needle}`);
});

const waitingPracticeCommitBody = methodBody(scene, 'commitLiveWaitingPracticeHandoff');
[
  'buildLiveWaitingPracticeScenario',
  'beginPvpLiveDrillScenario',
  "showChallengeHub('daily')",
  '练习不写正式积分',
  'afterCancelState',
  'await this.refreshLiveMatch({ fromAutoPoll: true })',
].forEach((needle) => {
  assert.ok(waitingPracticeCommitBody.includes(needle), `commitLiveWaitingPracticeHandoff should open playable challenge drill: ${needle}`);
});
assert.ok(
  !/this\.liveDrillScenario\s*=\s*scenario[\s\S]*?session\.cancelQueue/.test(waitingPracticeCommitBody),
  'commitLiveWaitingPracticeHandoff must only store a drill scenario after queue cancel succeeds'
);
assert.ok(
  !/this\.stopLivePolling\(\)[\s\S]*?session\.cancelQueue/.test(waitingPracticeCommitBody),
  'commitLiveWaitingPracticeHandoff must not stop queue polling before cancelQueue resolves'
);

assert.ok(!/\.pvp-live-first-guide\s*\{[\s\S]*?max-height:\s*60px[\s\S]*?overflow:\s*hidden[\s\S]*?\}/.test(css), 'mobile live first-match guide must not hard clip the guide text');

[
  '.pvp-live-shell',
  '.pvp-live-board',
  '.pvp-live-card-row',
  '.pvp-live-action-bar',
  '.pvp-live-loadout',
  '.pvp-live-loadout-selector',
  '.pvp-live-loadout-presets',
  '.pvp-live-loadout-option',
  '.pvp-live-loadout-option.selected',
  '.pvp-live-mode-boundary',
  '.pvp-live-turn-timer',
  '.pvp-live-connection-status',
  '.pvp-live-opening-safeguard',
  '.pvp-live-opening-safeguard-chip',
  '.pvp-live-duel-momentum',
  '.pvp-live-duel-momentum-line',
  '.pvp-live-duel-momentum-chip',
  '.pvp-live-social-panel',
  '.pvp-live-emote-row',
  '.pvp-live-emote-button',
  '.pvp-live-social-status',
  '.pvp-live-replay-share-viewer',
  '.pvp-live-replay-share-card',
  '.pvp-live-replay-share-summary',
  '.pvp-live-first-guide',
  '.pvp-live-guide-step',
  '.pvp-live-guide-loadout',
  '.pvp-live-guide-exceptions',
  '.pvp-live-guide-review-actions',
  '.pvp-live-guide-review-action',
  '.pvp-live-loadout-exploration',
  '.pvp-live-loadout-exploration-card',
    '.pvp-live-waiting-report',
    '.pvp-live-invite-panel',
    '.pvp-live-invite-code',
    '.pvp-live-invite-controls',
    '.pvp-live-waiting-action',
    '.pvp-live-invite-inbox',
    '.pvp-live-invite-inbox-item',
  '.pvp-live-post-review',
  '.pvp-live-key-turns',
  '.pvp-live-key-turn',
  '.pvp-live-key-turn-lesson',
  '.pvp-live-experience-report',
  '.pvp-live-experience-check',
  '.pvp-live-experience-check[data-live-review-focus',
  '.pvp-live-season-goal',
  '.pvp-live-season-goal-actions',
  '.pvp-live-settlement-report',
  '.pvp-live-settlement-grid',
  '.pvp-live-settlement-boundary',
  '.pvp-live-season-honor',
  '.pvp-live-season-honor-reward',
  '.pvp-live-season-honor-reward-collection',
  '.pvp-live-review-evidence',
  '.pvp-live-review-actions',
  '.pvp-live-friendly-series',
  '.pvp-live-event-main',
  '.pvp-live-event-detail',
  '[data-live-phase="waiting"]',
  '[data-live-phase="setup"]',
  '.pvp-live-card.selected',
  '[data-live-phase="finished"]',
  '[data-live-phase="invalidated"]',
].forEach((needle) => {
  assert.ok(css.includes(needle), `live PVP CSS should include marker: ${needle}`);
});

[
  'data-live-mode-boundary',
  '真人排位：入队后由服务端写正式结果',
  '问道练习：不写分',
  '好友约战：邀请码真人局',
  '镜像演武：天道榜练习，不是真人排位',
].forEach((needle) => {
  assert.ok(html.includes(needle), `live PVP default entry should explain mode boundary: ${needle}`);
});

[
  "invalidated: '无效局'",
  "phase === 'invalidated' ? 'VOID'",
  '不计正式积分',
].forEach((needle) => {
  assert.ok(scene.includes(needle), `PVPScene should render invalidated live match marker: ${needle}`);
});

assert.ok(scene.includes('formatLiveFinishReasonLabel(reason = \'\')'), 'PVPScene should centralize finish reason labels for visible live PVP copy');
assert.ok(scene.includes('formatLiveEventTypeLabel(eventType = \'\')'), 'PVPScene should centralize event type labels for visible live PVP copy');
assert.ok(scene.includes('formatLivePolicyLabel(policy = \'\')'), 'PVPScene should centralize policy labels for visible live PVP copy');
assert.ok(scene.includes('formatLiveEventTypeLabel(turn.eventType)'), 'renderLiveKeyTurnReplay should map event types before rendering player-visible text');
assert.ok(!scene.includes('${this.escapeHtml(turn.eventType)}'), 'renderLiveKeyTurnReplay must not render raw eventType protocol strings');
assert.ok(scene.includes('formatLiveFinishReasonLabel(payload.reason)'), 'formatLiveEvent should map public terminal reasons before rendering event details');
assert.ok(scene.includes('formatLivePolicyLabel(report.formalResultPolicy)'), 'renderLiveSettlementReport should map formal result policy before rendering player-visible text');
assert.ok(scene.includes('formatLivePolicyLabel(series.seatPolicy)'), 'renderLiveFriendlySeries should map seat policy before rendering player-visible text');

assert.ok(game.includes('getLiveSnapshot'), 'render_game_to_text should expose live PVP snapshot');
assert.ok(scene.includes('getLiveReplayShareViewerSnapshot()'), 'PVPScene should expose public replay share viewer snapshot without creating live session');
assert.ok(game.includes('getLiveReplayShareViewerSnapshot()'), 'render_game_to_text should prefer public replay share viewer snapshot');
assert.ok(game.includes('!pvpReplayShareViewer &&'), 'render_game_to_text should not create live session while public replay share viewer is active');
assert.ok(game.includes('replayShareViewer: pvpReplayShareViewer'), 'render_game_to_text should expose public replay share viewer state');
assert.ok(game.includes('parsePublicReplayShareConfig()'), 'game boot should parse public replay share query');
assert.ok(game.includes("params.get('pvpReplayShare')"), 'game boot should recognize pvpReplayShare links');
assert.ok(game.includes('runPublicReplayShareBootFlow()'), 'game boot should open the public replay share viewer');
assert.ok(nodeGate.includes('node tests/sanity_pvp_live_ui_contract_checks.cjs'), 'node gate should run live UI contract check');
assert.ok(browserGate.includes('node tests/browser_automation_boot_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/automation-boot"'), 'browser release gate should run automation boot audit');
assert.ok(browserGate.includes('node tests/browser_pvp_live_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-live"'), 'browser release gate should run live PVP audit');

[
  'data-live-action="join-queue"',
  'data-live-action="create-invite"',
  'data-live-action="join-invite"',
  'data-live-invite-code',
  'data-live-invite-input',
  'data-live-target-username',
  'data-live-invite-inbox',
  'data-live-loadout-preset="sword"',
  'data-live-selected-loadout',
  'PVPService.findOpponent',
  'PVPService.reportMatchResult',
  'data-live-state-version',
  'data-live-match-quality',
  'data-live-turn-timer',
  'data-live-turn-timer-urgency',
  'data-live-connection-status',
  'data-live-connection-tempo',
  'data-live-connection-tempo-state',
  'data-live-tempo-action="refresh-match"',
  'pvp-live-connection-tempo-v1',
  'data-live-realtime-status',
  'data-live-realtime-state',
  'data-live-opening-safeguard',
  'data-live-social-panel',
  'data-live-emote',
  'live UI sends preset emote and can locally mute opponent emotes',
  'data-live-first-guide',
  'data-live-waiting-report',
  'data-live-post-match-review',
  'data-live-post-review-action',
  'data-live-loadout-recommendation',
  'data-live-loadout-recommendation-action',
  'data-live-action="cancel-rematch"',
  'live UI renders first-match guide report without reward or rating promises',
  'live UI renders active opening safeguard report without hidden payloads',
  'live UI updates first-match guide next action after setup',
  'secondSeatBuffer',
  '后手护盾发放',
  'B \\+3',
  'live UI renders 120s no-real-player waiting branch without ghost fallback',
  'live UI renders post-match review MVP from public finished state',
  'live UI one-click applies post-match loadout recommendation without queueing',
  'live UI renders post-match key-turn replay from public events',
  'live UI post-match key-turn action fetches authoritative replay and focuses it without hidden payloads',
  'live UI renders post-match experience report from public events',
  'live UI experience check focuses linked public evidence without hidden payloads',
  'live UI renders loadout exploration report without hidden payloads',
  'live UI renders post-match season goal card and can dismiss it locally',
  'live UI dismisses season goal locally without hiding post-match review',
  'live UI reactivates local recovery goal after consecutive low-agency losses',
  '本次不再提示',
  'live UI post-match review actions are clickable safe handoff entries',
  'live UI post-match practice handoff creates no-score drill scenario and opens replay-only playable challenge drill',
  'live UI post-match practice drill can start replay-only no-reward challenge run',
  'pvp-live-drill-scenario-v1',
  'sourceVisibility',
  'usesHiddenInformation',
  'rankedImpact',
  'live UI post-match queue again re-enters live queue without legacy settlement',
  'live UI post-match friendly rematch waits for same opponent without legacy settlement',
  'live UI waiting friendly rematch requester can cancel and restores finished review',
  'live UI private invite creation shows share code without entering public queue',
  'live UI private invite join enters friendly setup without legacy settlement',
  'live UI Bo3 tied friendly review exposes decider and auto-enters G3 with same series id',
  'live UI completed Bo3 hides friendly rematch after source seat reaches two wins',
  'live UI long-wait practice handoff creates no-score playable challenge drill',
  'live UI mobile renders first-match guide without clipping exception or review actions',
  'live UI renders all baseline loadouts with balanced selected by default',
  'live UI renders public match quality report without hidden rating leak',
  'live UI shows matched setup state without opponent hand leak',
  'live UI renders opponent reconnect grace without confusing it with action timeout',
  'live UI renders opening protection public event details',
  'live UI renders opening counterplay cue after protection',
  'live UI mobile renders opening protection event without overflow',
  'live UI selects a baseline loadout before queue join',
  'live UI locks baseline loadout selector after queue join',
  'live UI renders ranked opponent public profile without build reveal',
  'live UI should not call legacy PVP matching or settlement',
  'live UI renders ready_timeout invalidated as no-score terminal state',
].forEach((needle) => {
  assert.ok(liveBrowserAudit.includes(needle), `live PVP browser audit should include marker: ${needle}`);
});

[
  'cancelLiveRematch',
  'data-live-friendly-series-status',
  'data-live-friendly-series-id',
  'data-live-friendly-series-source-match',
  'data-live-friendly-series-confirmations',
  '等待已取消',
  '等待已过期',
].forEach((needle) => {
  assert.ok(scene.includes(needle), `live PVP scene should include rematch lifecycle marker: ${needle}`);
});

[
  'cancelRematch',
  'getRematchStatus',
  'rematch_cancelled',
  'rematch_expired',
].forEach((needle) => {
  assert.ok(liveSession.includes(needle), `live PVP session should include rematch lifecycle marker: ${needle}`);
});

console.log('PVP live UI contract checks passed.');
