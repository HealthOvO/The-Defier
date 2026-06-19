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
const game = read('js/game.js');
const challengeHub = read('js/core/challenge_hub.js');
const css = read('css/pvp.css');
const nodeGate = read('tests/run_node_checks.sh');
const browserGate = read('tests/run_browser_release_checks.sh');
const liveBrowserAudit = read('tests/browser_pvp_live_audit.mjs');

[
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
  'data-live-social-panel',
  'data-live-social-status',
  'data-live-emote="respect"',
  'data-live-emote="thinking"',
  'data-live-action="toggle-social-mute"',
  'data-live-first-guide',
  'data-live-first-match-guide',
  'data-live-waiting-report',
  'data-live-post-match-review',
  'data-live-action="practice-live"',
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
  "from \"../services/pvp-live-session.js\"",
  'getLiveSession()',
  'renderLivePanel()',
  'joinLiveQueue()',
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
  'renderLiveWaitingReport(',
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
  'getLiveOpeningSafeguardReport(',
  'renderLiveOpeningSafeguardReport(',
  'formatLiveEvent(',
  'formatLiveLoadoutSummary(',
  'getLiveEmoteOptions()',
  'submitLiveEmote(',
  'toggleLiveSocialMute(',
  'createLiveInvite(',
  'joinLiveInvite(',
  'cancelLiveInvite(',
  'filterLiveEventsForMute(',
].forEach((needle) => {
  assert.ok(scene.includes(needle), `PVPScene should expose live UI marker: ${needle}`);
});

[
  'pvp-live-drill-scenario-v1',
  'pvp-live-key-turn-replay-v1',
  'pvp-live-experience-report-v1',
  'linkedEvidence',
  'seatWindowSummary',
  'safeguardSummary',
  'review_key_turns',
  'data-live-key-turn-replay',
  'data-live-experience-report',
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

[
  "liveSelectedLoadoutPreset: 'balanced'",
  "id: 'balanced'",
  "id: 'sword'",
  "id: 'shield'",
  "return phase === 'idle' || phase === 'finished' || phase === 'invalidated'",
].forEach((needle) => {
  assert.ok(scene.includes(needle), `PVPScene should pin selectable live loadout preset marker: ${needle}`);
});

const joinLiveQueueBody = methodBody(scene, 'joinLiveQueue');
assert.ok(joinLiveQueueBody.includes('const selectedPreset = this.getLiveSelectedLoadoutPreset()'), 'joinLiveQueue should resolve the currently selected live loadout preset');
assert.ok(joinLiveQueueBody.includes('loadout: this.getLiveQueueLoadoutCandidate(selectedPreset.id)'), 'joinLiveQueue should submit the selected live loadout candidate for server-side snapshot lock');

const submitLiveCardBody = methodBody(scene, 'submitLiveCard');
assert.ok(submitLiveCardBody.includes('view.opponent') && submitLiveCardBody.includes("state.seatId === 'B'"), 'submitLiveCard should target the opponent seat from live state, not hard-code seat B');
assert.ok(!submitLiveCardBody.includes("targetSeat: 'B'"), 'submitLiveCard must not hard-code targetSeat to B');

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
  '.pvp-live-turn-timer',
  '.pvp-live-connection-status',
  '.pvp-live-opening-safeguard',
  '.pvp-live-opening-safeguard-chip',
  '.pvp-live-social-panel',
  '.pvp-live-emote-row',
  '.pvp-live-emote-button',
  '.pvp-live-social-status',
  '.pvp-live-first-guide',
  '.pvp-live-guide-step',
  '.pvp-live-guide-loadout',
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
  "invalidated: '无效局'",
  "phase === 'invalidated' ? 'VOID'",
  '不计正式积分',
].forEach((needle) => {
  assert.ok(scene.includes(needle), `PVPScene should render invalidated live match marker: ${needle}`);
});

assert.ok(game.includes('getLiveSnapshot'), 'render_game_to_text should expose live PVP snapshot');
assert.ok(nodeGate.includes('node tests/sanity_pvp_live_ui_contract_checks.cjs'), 'node gate should run live UI contract check');
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
  'data-live-connection-status',
  'data-live-opening-safeguard',
  'data-live-social-panel',
  'data-live-emote',
  'live UI sends preset emote and can locally mute opponent emotes',
  'data-live-first-guide',
  'data-live-waiting-report',
  'data-live-post-match-review',
  'data-live-post-review-action',
  'live UI renders first-match guide report without reward or rating promises',
  'live UI renders active opening safeguard report without hidden payloads',
  'live UI updates first-match guide next action after setup',
  'secondSeatBuffer',
  '后手护盾发放',
  'B \\+3',
  'live UI renders 120s no-real-player waiting branch without ghost fallback',
  'live UI renders post-match review MVP from public finished state',
  'live UI renders post-match key-turn replay from public events',
  'live UI post-match key-turn action focuses replay without hidden payloads',
  'live UI renders post-match experience report from public events',
  'live UI experience check focuses linked public evidence without hidden payloads',
  'live UI post-match review actions are clickable safe handoff entries',
  'live UI post-match practice handoff creates no-score drill scenario and opens replay-only playable challenge drill',
  'live UI post-match practice drill can start replay-only no-reward challenge run',
  'pvp-live-drill-scenario-v1',
  'sourceVisibility',
  'usesHiddenInformation',
  'rankedImpact',
  'live UI post-match queue again re-enters live queue without legacy settlement',
  'live UI post-match friendly rematch waits for same opponent without legacy settlement',
  'live UI private invite creation shows share code without entering public queue',
  'live UI private invite join enters friendly setup without legacy settlement',
  'live UI Bo3 tied friendly review exposes decider and auto-enters G3 with same series id',
  'live UI completed Bo3 hides friendly rematch after source seat reaches two wins',
  'live UI practice hint does not call legacy ghost fallback or settlement',
  'live UI renders all baseline loadouts with balanced selected by default',
  'live UI renders public match quality report without hidden rating leak',
  'live UI shows matched setup state without opponent hand leak',
  'live UI renders opponent reconnect grace without confusing it with action timeout',
  'live UI renders opening protection public event details',
  'live UI renders opening counterplay cue after protection',
  'live UI mobile renders opening protection event without overflow',
  'live UI selects a baseline loadout before queue join',
  'live UI locks baseline loadout selector after queue join',
  'live UI renders snapshot_locked loadout summaries without opponent deck leak',
  'live UI should not call legacy PVP matching or settlement',
  'live UI renders ready_timeout invalidated as no-score terminal state',
].forEach((needle) => {
  assert.ok(liveBrowserAudit.includes(needle), `live PVP browser audit should include marker: ${needle}`);
});

console.log('PVP live UI contract checks passed.');
