const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const prodReadScript = read('scripts/check-production-read-only.sh');
const pagesWorkflow = read('.github/workflows/pages.yml');
const browserReleaseScript = read('tests/run_browser_release_checks.sh');
const backendSecurityChecks = read('tests/backend_security_checks.cjs');
const backendClientSmoke = read('tests/browser_backend_client_smoke.mjs');
const browserAudit = read('tests/browser_audit.mjs');
const browserPvpAudit = read('tests/browser_pvp_audit.mjs');
const browserPvpLiveAudit = read('tests/browser_pvp_live_audit.mjs');
const browserPvpLiveRealSmoke = read('tests/browser_pvp_live_real_backend_smoke.mjs');
const browserFeatureAudit = read('tests/browser_feature_audit.mjs');
const browserMetaAudit = read('tests/browser_meta_screen_audit.mjs');
const browserEventBranchAudit = read('tests/browser_event_branch_audit.mjs');
const browserRunPathEventAudit = read('tests/browser_run_path_event_audit.mjs');
const browserMobileAudit = read('tests/browser_mobile_layout_audit.mjs');
const challengeMobileAudit = read('tests/browser_challenge_mobile_flow_audit.mjs');
const browserChapterFlowAudit = read('tests/browser_chapter_flow_audit.mjs');
const browserRunPathRewardAudit = read('tests/browser_run_path_reward_audit.mjs');
const mapPathSynergyChecks = read('tests/sanity_map_path_synergy_checks.cjs');
const codexSanctumChecks = read('tests/sanity_codex_sanctum_checks.cjs');
const seasonBoardChecks = read('tests/sanity_season_board_system_checks.cjs');
const strategicNodeChecks = read('tests/sanity_strategic_node_system_checks.cjs');
const runVowChecks = read('tests/sanity_run_vow_system_checks.cjs');
const trialChallengeChecks = read('tests/sanity_trial_challenge_checks.cjs');
const pvpService = read('js/services/pvp-service.js');
const pvpServiceChecks = read('tests/sanity_pvp_service_checks.cjs');
const pvpLegacySeasonIsolationChecks = read('tests/sanity_pvp_legacy_season_isolation_checks.cjs');
const pvpLiveEngineChecks = read('tests/sanity_pvp_live_engine_checks.cjs');
const pvpLiveBalanceSimulationChecks = read('tests/sanity_pvp_live_balance_simulation_checks.cjs');
const pvpLiveFullGateChecks = read('tests/sanity_pvp_live_full_gate_balance_checks.cjs');
const pvpLiveBalanceArtifactChecks = read('tests/sanity_pvp_live_balance_artifact_checks.cjs');
const pvpLiveGoldenReplayChecks = read('tests/sanity_pvp_live_golden_replay_checks.cjs');
const pvpLiveGoldenReplayRunner = read('server/pvp-live/golden-replay-runner.js');
const pvpLiveReplayChecks = read('tests/sanity_pvp_live_replay_checks.cjs');
const pvpLiveReplaySource = read('server/pvp-live/replay.js');
const pvpLiveWsChecks = read('tests/sanity_pvp_live_ws_checks.cjs');
const pvpLiveWsSource = read('server/pvp-live/live-ws.js');
const serverApp = read('server/app.js');
const pvpLiveRouteChecks = read('tests/sanity_pvp_live_route_checks.cjs');
const pvpLivePersistenceChecks = read('tests/sanity_pvp_live_persistence_checks.cjs');
const pvpLiveDatabase = read('server/db/database.js');
const pvpLivePersistence = read('server/pvp-live/live-persistence.js');
const pvpLiveSettlementChecks = read('tests/sanity_pvp_live_settlement_checks.cjs');
const pvpLiveClientChecks = read('tests/sanity_pvp_live_client_checks.mjs');
const pvpLiveServiceBridgeChecks = read('tests/sanity_pvp_live_service_bridge_checks.cjs');
const pvpLiveSessionChecks = read('tests/sanity_pvp_live_session_checks.mjs');
const pvpLiveUiContractChecks = read('tests/sanity_pvp_live_ui_contract_checks.cjs');
const pvpLiveUiRuntimeChecks = read('tests/sanity_pvp_live_ui_runtime_checks.mjs');
const runNodeChecks = read('tests/run_node_checks.sh');
const shopManager = read('js/managers/ShopManager.js');
const coreUtils = read('js/core/utils.js');
const gameSource = read('js/game.js');
const shopView = read('js/views/ShopView.js');
[
  'routes/pvp.js',
  'routes/ghosts.js',
  'The Defier Backend',
  'isClientReportedSettlementEnabled',
  'POST /api/ghosts/current',
  'require_backend_marker "$REMOTE_BACKEND_DIR/routes/pvp.js" "verifyRequestIntegrity"',
  'require_backend_marker "$REMOTE_BACKEND_DIR/routes/ghosts.js" "verifyRequestIntegrity"',
].forEach((needle) => {
  assert.ok(
    prodReadScript.includes(needle),
    `production read-only check should cover backend marker: ${needle}`,
  );
});

const layoutAudit = read('tests/browser_frontend_layout_audit.mjs');
[
  "id: 'endless-paranoia-modal'",
  'activateEndlessParanoiaModal',
  'showEndlessParanoiaSelection(26)',
  '.event-choice.endless-paranoia-choice',
  'endlessParanoiaModalProbe',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should cover endless paranoia modal marker: ${needle}`,
  );
});

[
  "id: 'auth-modal'",
  'authModalProbe',
  '#auth-username',
  '#auth-password',
  'login-btn-modal',
  'register-btn-modal',
  'usernameTopHit',
  'passwordTopHit',
  'loginTopHit',
  'registerTopHit',
  'closeTopHit',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should cover auth modal marker: ${needle}`,
  );
});

[
  "id: 'confirm-modal'",
  'confirmModalProbe',
  '#generic-confirm-modal',
  'generic-confirm-btn',
  'generic-cancel-btn',
  'confirmTopHit',
  'cancelTopHit',
  'closeTopHit',
  'zIndex < 10000',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should cover confirm modal marker: ${needle}`,
  );
});

[
  "id: 'reward-screen'",
  'rewardExpeditionCtaProbe',
  'data-season-board-handoff-cta',
  'data-season-board-lane-reward-claim',
  'laneRewardTopHit',
  'handoffTopHit',
  'laneRewardRectFitsViewport',
  'handoffRectFitsViewport',
  'rect.left >= -tolerance',
  'rect.bottom <= viewport.height + tolerance',
  '!rewardExpeditionCtaProbe.laneRewardRectFitsViewport',
  '!rewardExpeditionCtaProbe.handoffRectFitsViewport',
  'reward-expedition-cta-invalid',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should cover reward CTA marker: ${needle}`,
  );
});

[
  "id: 'save-slots-modal'",
  "id: 'save-conflict-modal'",
  'showSaveConflictModal(localData, cloudData, cloudTime)',
  'real-show-save-conflict-modal',
  'saveSlotsModalProbe',
  'saveConflictModalProbe',
  '[data-slot-mode="overwrite"]',
  '#local-save-info',
  '#cloud-save-info',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should cover save modal marker: ${needle}`,
  );
});

[
  "id: 'treasure-bag-alert-modal'",
  'treasureBagAlertProbe',
  'dismissChain',
  'afterOk',
  'afterClose',
  'closeButtonTopHit',
  'treasure-bag-alert-stack-invalid',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should cover treasure bag alert stack marker: ${needle}`,
  );
});

[
  "id: 'dynamic-card-detail-modal'",
  'dynamicCardDetailProbe',
  'dynamic-card-detail-clipped-content',
  'dynamic-card-detail-unreachable-content',
  'closeButtonTopHit',
  'summaryRowTopHit',
  'text-may-be-clipped',
  'non-scrollable-content-clipped',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should fail clipped dynamic card detail marker: ${needle}`,
  );
});

[
  "id: 'shop-service-detail-modal'",
  'activateShopServiceDetailModal',
  'shopServiceDetailProbe',
  'service-detail-main',
  'service-detail-side',
  'shop-service-detail-modal-missing-content',
  'shop-service-detail-modal-unreachable-content',
  'shop-service-detail-modal-clipped-content',
  'hasEconomyText',
  '买后剩余',
  '储备线',
  '建议单次',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should cover shop service detail marker: ${needle}`,
  );
});

[
  "id: 'skill-confirm-modal'",
  'skillConfirmModalProbe',
  'skill-confirm-modal-actions-invalid',
  'releaseTopHit',
  'cancelTopHit',
  'closeTopHit',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should cover skill confirm modal marker: ${needle}`,
  );
});

[
  "id: 'treasure-detail-modal'",
  'treasureDetailModalProbe',
  'treasure-detail-modal-actions-invalid',
  'footerCloseTopHit',
  'titleTopHit',
  'contentRectFitsViewport',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should cover treasure detail modal marker: ${needle}`,
  );
});

[
  "id: 'law-detail-modal'",
  'lawDetailModalProbe',
  'law-detail-modal-actions-invalid',
  'readinessLength',
  'footerCloseTopHit',
  'contentRectFitsViewport',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should cover law detail modal marker: ${needle}`,
  );
});

[
  "id: 'reward-modal'",
  'rewardModalProbe',
  'reward-modal-actions-invalid',
  'reward-confirm-btn',
  'confirmTopHit',
  'zIndex < 10000',
].forEach((needle) => {
  assert.ok(
    layoutAudit.includes(needle),
    `frontend layout audit should cover reward popup modal marker: ${needle}`,
  );
});

[
  'concurrentMatch',
  'pvp-testmode-report-concurrent-a',
  'pvp-testmode-report-concurrent-b',
  'concurrentSuccesses.length',
  'concurrentConflicts.length',
  'pvp_match_history WHERE ticket_id',
  'pvp-match-empty-opponent',
  '未设置防御快照',
  '暂无对手数据',
  'emptyMatchTickets.count, 0',
  'PVP match empty opponent state should not create a match ticket',
].forEach((needle) => {
  assert.ok(
    backendSecurityChecks.includes(needle),
    `backend security checks should cover PVP concurrent settlement marker: ${needle}`,
  );
});

[
  'battle HUD surfaces active vow readable status',
  'data-system-id="vows"',
  '.battle-system-card-detail',
  'vowReadable',
  'vowSystemsReadable',
  'vowStrip',
  'vowChip',
  'vowCard',
  'battle.systemsHud',
  'frostSeal:2',
  '霜封誓',
  '封契 · 1\\/2',
  'enemy.weak >= 2',
  '收益：',
  '赌注：',
  '对策：',
  '路线：',
].forEach((needle) => {
  assert.ok(
    browserAudit.includes(needle),
    `browser audit should cover battle vow readable marker: ${needle}`,
  );
});

[
  'realm break vow adds a clickable dedicated battle command',
  'realm_break_order',
  '破界裂令',
  'realm_break_browser_draw',
  'durabilityAfter < realmBreakCommandProbe.durabilityBefore',
  'pointsAfter === realmBreakCommandProbe.pointsBefore - 1',
].forEach((needle) => {
  assert.ok(
    browserAudit.includes(needle),
    `browser audit should cover realm break command marker: ${needle}`,
  );
});

[
  'plain battle should not leak realmBreak dedicated command',
  'non-realmBreak vow should not unlock realmBreak dedicated command',
  'realmBreak + endless should preserve forced endless command',
  'endlessCommandIds[0] === \'realm_break_order\'',
].forEach((needle) => {
  assert.ok(
    runVowChecks.includes(needle),
    `run vow sanity should cover realm break command exclusivity marker: ${needle}`,
  );
});

[
  'node tests/browser_feature_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/feature"',
  'node tests/browser_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/core"',
  'node tests/browser_backend_client_smoke.mjs "$BASE_URL" "$OUTPUT_ROOT/backend-client"',
  'node tests/browser_pvp_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp"',
  'node tests/browser_pvp_live_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-live"',
  'node tests/browser_pvp_live_real_backend_smoke.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-live-real"',
  'node tests/browser_pvp_mobile_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-mobile"',
  'node tests/browser_pvp_mobile_result_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-mobile-result"',
  'node tests/browser_chapter_flow_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/chapter-flow"',
  'node tests/browser_run_path_event_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/run-path-events"',
  'node tests/browser_run_path_reward_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/run-path-reward"',
  'node tests/browser_event_branch_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/events"',
].forEach((needle) => {
  assert.ok(
    browserReleaseScript.includes(needle),
    `browser release gate should run required audit script: ${needle}`,
  );
});

[
  'audits: expedition,events,vow-choice,guide,inheritance,pvp,pvp-live,pvp-live-real,pvp-mobile,pvp-mobile-result,challenge-mobile-flow',
  "if: contains(matrix.audits, 'backend-client') || contains(matrix.audits, 'auth-ui-cloud') || contains(matrix.audits, 'pvp-live-real')",
].forEach((needle) => {
  assert.ok(
    pagesWorkflow.includes(needle),
    `GitHub Pages browser-release workflow should include live PVP audit marker: ${needle}`,
  );
});

[
  'trial node upgrades into selectable challenge碑 and chosen affix package enters battle state',
  '剑心限令',
  '秘宝回响',
  '护心证道',
  'cardLimitConditionVisible',
  'card-limit trial fails after seven real browser card plays and clears trial state',
  'treasureHuntRewardVisible',
  'treasure trial grants a real treasure reward after browser victory and clears trial state',
  'vitalSealConditionVisible',
  'vital-seal trial succeeds above the HP threshold and fails below it in browser victory flow',
  'maxCardsPlayed',
  'minHpPercent',
  'trialChallengeProbe.choiceCount >= 6',
].forEach((needle) => {
  assert.ok(
    browserFeatureAudit.includes(needle),
    `browser feature audit should cover trial card-limit marker: ${needle}`,
  );
});

[
  'trial catalog should include vitalSeal',
  'vitalSeal should require at least 70% HP at victory',
  'vitalSeal should persist minHpPercent condition',
  'vitalSeal should allow damage when remaining HP stays above threshold',
  'vitalSeal should fail when remaining HP falls below threshold',
].forEach((needle) => {
  assert.ok(
    trialChallengeChecks.includes(needle),
    `trial challenge checks should cover vital-seal hp threshold marker: ${needle}`,
  );
});

[
  'node tests/sanity_event_flow_checks.cjs',
  'node tests/sanity_event_bias_distribution_checks.cjs',
  'node tests/sanity_engineering_event_surface_checks.cjs',
  'node tests/sanity_fate_lineage_system_checks.cjs',
  'node tests/sanity_fate_aftereffect_system_checks.cjs',
  'node tests/sanity_trial_challenge_checks.cjs',
  'node tests/sanity_strategic_node_system_checks.cjs',
  'node tests/sanity_codex_sanctum_checks.cjs',
  'node tests/sanity_intro_progress_sync_checks.cjs',
  'node tests/sanity_pvp_service_checks.cjs',
  'node tests/sanity_pvp_legacy_season_isolation_checks.cjs',
  'node tests/sanity_pvp_live_engine_checks.cjs',
  'node tests/sanity_pvp_live_balance_simulation_checks.cjs',
  'node tests/sanity_pvp_live_full_gate_balance_checks.cjs',
  'node tests/sanity_pvp_live_balance_artifact_checks.cjs',
  'node tests/sanity_pvp_live_golden_replay_checks.cjs',
  'node tests/sanity_pvp_live_replay_checks.cjs',
  'node tests/sanity_pvp_live_ws_checks.cjs',
  'node tests/sanity_pvp_live_route_checks.cjs',
  'node tests/sanity_pvp_live_persistence_checks.cjs',
  'node tests/sanity_pvp_live_settlement_checks.cjs',
  'node tests/sanity_pvp_live_client_checks.mjs',
  'node tests/sanity_pvp_live_service_bridge_checks.cjs',
  'node tests/sanity_pvp_live_session_checks.mjs',
  'node tests/sanity_pvp_live_ui_contract_checks.cjs',
  'node tests/sanity_pvp_live_ui_runtime_checks.mjs',
  'node tests/test_e2e_backend.cjs',
].forEach((needle) => {
  assert.ok(
    runNodeChecks.includes(needle),
    `node release checks should include strategic gameplay sanity marker: ${needle}`,
  );
});

[
  'shouldRecordPVPSeasonVerification',
  "settlementSource: 'local_practice'",
  "settlementSource: 'server_authoritative'",
  "settlementSource: 'live_ranked'",
  'formalSeasonVerification: true',
].forEach((needle) => {
  assert.ok(
    pvpLegacySeasonIsolationChecks.includes(needle),
    `legacy PVP season isolation check should pin marker: ${needle}`,
  );
});

[
  'data-live-action="join-queue"',
  'data-live-loadout-preset="sword"',
  'data-live-selected-loadout',
  'data-live-state-version',
  'data-live-match-quality',
  'data-live-connection-status',
  'data-live-social-panel',
  'data-live-emote',
  'data-live-first-guide',
  'data-live-waiting-report',
  'data-live-post-match-review',
  'data-live-post-review-action',
  'live UI renders all baseline loadouts with balanced selected by default',
  'live UI renders public match quality report without hidden rating leak',
  'live UI renders first-match guide report without reward or rating promises',
  'live UI updates first-match guide next action after setup',
  'live UI renders 120s no-real-player waiting branch without ghost fallback',
  'live UI renders post-match review MVP from public finished state',
  'live UI renders post-match experience report from public events',
  'live UI experience check focuses linked public evidence without hidden payloads',
  'reviewParity',
  'live UI post-match review actions are clickable safe handoff entries',
  'live UI post-match practice handoff creates no-score drill scenario and opens replay-only playable challenge drill',
  'live UI post-match practice drill can start replay-only no-reward challenge run',
  'live UI post-match friendly rematch waits for same opponent without legacy settlement',
  'live UI private invite creation shows share code without entering public queue',
  'live UI private invite cancel returns to idle without public queue',
  'live UI refresh resumes pending private invite with cancel action',
  'live UI renders targeted private invite inbox while idle',
  'live UI idle panel auto-refreshes targeted private invite inbox',
  'live UI joins targeted private invite from inbox without manual code copy',
  'live UI private invite join enters friendly setup without legacy settlement',
  'inviteInboxProbe.snapshot?.inviteInbox?.length === 1',
  'inviteInboxJoinProbe.snapshot.inviteInbox.length === 0',
  'live UI mobile keeps reconnect grace text readable',
  'inviteCreateProbe.snapshot?.inviteReport?.reportVersion === \'pvp-live-invite-v1\'',
  "call.options?.targetUsername === '乙'",
  'inviteResumeProbe.calls.some(call => call.method === \'getCurrentInvite\'',
  'inviteJoinProbe.snapshot?.matchQuality?.expansionStage === \'friend_invite\'',
  'mobileConnectionProbe.whiteSpace !== \'nowrap\'',
  'live UI waiting friendly rematch auto-enters accepted friendly setup for the requester',
  'live UI Bo3 tied friendly review exposes decider and auto-enters G3 with same series id',
  'live UI completed Bo3 hides friendly rematch after source seat reaches two wins',
  'friendlyRematchProbe.actionDisabled?.queue_again === true',
  'friendlyRematchProbe.actionDisabled?.friendly_rematch === true',
  'friendlyDeciderRecoveryProbe.snapshot?.seriesId === friendlyDeciderCtaProbe.snapshot?.seriesId',
  'friendlyDeciderRecoveryProbe.snapshot?.roundIndex === 3',
  "friendlyCompleteProbe.snapshot?.winnerSourceSeat === 'A'",
  "!friendlyCompleteProbe.actionIds.includes('friendly_rematch')",
  'pvp-live-drill-scenario-v1',
  'practiceOnly',
  'sourceVisibility',
  'usesHiddenInformation',
  'rankedImpact',
  'pvp-live-friendly-series-v1',
  'data-live-friendly-series',
  'scoreBySourceSeat',
  'Bo3 第 2 局',
  '甲 1 : 0 乙',
  'friendly_rematch',
  'focusedEvents',
  '开战',
  '调息完成',
  '对局结束',
  'live UI post-match queue again re-enters live queue without legacy settlement',
  "postReviewRequeueProbe.eventsPanelFocused === ''",
  'live UI practice hint does not call legacy ghost fallback or settlement',
  'live UI renders opening protection public event details',
  'live UI renders active opening safeguard report without hidden payloads',
  'live UI renders opening counterplay cue after protection',
  'live UI mobile renders opening protection event without overflow',
  'pvp screen opens on live ranked entry by default on mobile',
  'data-live-mode-boundary',
  '不是真人排位',
  'live UI selects a baseline loadout before queue join',
  'live UI locks baseline loadout selector after queue join',
  'live UI submits card intent through live service',
  'live UI sends preset emote and can locally mute opponent emotes',
  'pvp-live-turn-timer-v1',
  'pvp-live-connection-v1',
  'data-live-turn-timer',
  '准备倒计时',
  '行动倒计时',
  '对方重连宽限',
  'live UI renders opponent reconnect grace without confusing it with action timeout',
  'live UI renders connection_timeout as reconnect grace terminal review',
  '重连宽限结束',
  'connection_timeout',
  'live UI renders snapshot_locked loadout summaries without opponent deck leak',
  'live UI should not call legacy PVP matching or settlement',
  'live UI renders ready_timeout invalidated as no-score terminal state',
  'postReviewHidden',
  'PVPService.findOpponent',
  'PVPService.reportMatchResult',
].forEach((needle) => {
  assert.ok(
    browserPvpLiveAudit.includes(needle),
    `live PVP browser audit should pin UI wiring marker: ${needle}`,
  );
});

[
  'real browser user A joins live queue with locked loadout',
  'real browser user A selects live loadout preset through UI',
  'real browser repeated join cannot overwrite locked loadout hash',
  'real browser user B selects live loadout preset through UI',
  'real browser user B joins and receives matched setup state',
  'real browser both seats agree on match id and public loadout hashes',
  'real browser live match exposes public match quality report',
  'real browser live match renders authoritative setup countdown',
  'real browser live match exposes authoritative connection report',
  'real browser opponent connection report stays readable without ending setup',
  'real browser opponent heartbeat recovers reconnect grace to online',
  'real browser live match exposes and renders first-match guide report',
  'real browser render_game_to_text exposes first-match guide report',
  'real browser live match updates first-match guide after setup',
  'real browser state exposes snapshot_locked without leaking opponent hidden data',
  'real browser setup ready flow reaches active on both seats',
  'real browser live match renders authoritative active action countdown',
  'real browser accepted card intent auto-pushes opponent state without manual refresh',
  'waitForLiveSnapshot(seatB.page, previousHp',
  'waitForLiveSnapshot(seatB.page, expectedVersion',
  'real browser end turn switches authoritative action countdown to opponent',
  'real browser live match renders public post-match review after surrender',
  'real browser live match renders experience report from public post-match events',
  'real browser experience check focuses linked public evidence without hidden payloads',
  'postMatchParity',
  'real browser post-match review actions focus events, unlock loadout, and create replay-only no-score drill handoff',
  'real browser post-match friendly rematch waits for same opponent without formal settlement',
  'real browser waiting friendly rematch auto-enters accepted friendly setup for requester',
  'pvp-live-drill-scenario-v1',
  'practiceOnly',
  'sourceVisibility',
  'usesHiddenInformation',
  'rankedImpact',
  'real browser post-match review survives full page refresh through stored terminal match id',
  "window.PVPScene.activeTab = 'live'",
  'theDefierPvpLiveLastTerminalMatchV1',
  "startsWith('theDefierPvpLiveLastTerminalMatchV1:')",
  'focusedEvents',
  '开战',
  '对局结束',
  'real browser post-match queue again re-enters real live waiting queue',
  'real browser live PVP smoke has no console errors',
].forEach((needle) => {
  assert.ok(
    browserPvpLiveRealSmoke.includes(needle),
    `live PVP real-backend browser smoke should pin two-account marker: ${needle}`,
  );
});
assert.ok(
  !browserPvpLiveRealSmoke.includes('await window.PVPScene.refreshLiveMatch();\n      await window.PVPScene.readyLiveMatch();'),
  'live PVP real-backend browser smoke must not require manual refresh before ready auto-push checks',
);

[
  'seat A should start with a server-locked loadout snapshot',
  'self view should expose own locked loadout hash',
  'opponent view should expose only public locked loadout hash',
  'opponent public view must not expose full loadout snapshot',
  'initial setup view should include public snapshot_locked event',
  'initial state should include live match quality report version',
  'initial state should include first-match guide report version',
  'first-match guide should explain live ranked mode boundary',
  'first-match guide should include balanced recommended loadout weakness',
  'first-match guide should explain ready timeout exception',
  'state view first-match guide should expose three MVP recommended loadouts',
  'finished view should expose live post-match review report version',
  'post-match review should include a public event trail instead of only the final event pair',
  'post-match review event trail should include battle start',
  'post-match review event trail should include match finish',
  'post-match review evidence should not expose hidden event payloads',
  'experience report should expose public non-game risk reasons',
  'each experience fairness check should link back to public evidence',
  'linked evidence should remain sanitized public event refs',
  'post-match review must not imply reward or exact rating compensation',
  'state view should expose public match quality tag',
  'state view should expose active opening safeguard report',
  'opening safeguard report should expose current first-action budget',
  'opening safeguard report should expose public second-seat buffer',
  'second seat should start active combat with public opening buffer block',
  'battle start should emit public second-seat buffer event',
  'opening protection should leave the defender at 1 hp',
  'opening protection should emit a public event',
  'opening protection event should expose minimum hp',
  'opening protection event should expose prevented lethal damage',
  'same-turn follow-up cannot bypass opening protection',
  'opening protection should grant first-turn counterplay block',
  'protected seat first turn should expose public counterplay event',
  'mirrored budget setup should allow seat B to act first in simulations',
  'mirrored first seat should receive first-seat budget instead of seat-B budget',
  'mirrored first-seat damage should clamp to 18 actual damage',
  'setup phase should accept preset emote as non-combat social intent',
  'emote should not advance combat state version',
  'emote should be rate limited without changing combat state',
  'live PVP should reject non-whitelisted emotes',
].forEach((needle) => {
  assert.ok(
    pvpLiveEngineChecks.includes(needle),
    `live PVP engine sanity should pin snapshot lock marker: ${needle}`,
  );
});

[
  'V10-S2 content pack should expose eight baseline loadouts',
  'V10-S2 baseline loadout ids should match the frozen content-pack archetype list',
  'content pack should not admit 0-cost cards into ranked V10-S2 baseline loadouts',
  'content pack should cap every baseline card at two copies',
  'baseline archetypes should not collapse into the same main-deck shell',
  'quick gate should run at least 10,000 simulated matches across the ordered baseline matrix',
  'quick gate should run the required 10,000 opening pressure probes',
  'quick gate should show zero second-seat deaths before first real action',
  'quick gate should show zero second-seat dead action lines',
  'quick gate should show zero unreadable mid-burst samples',
  'quick gate should include real budget prevention samples',
  'resource_draw regression seed should finish by shared resource exhaustion',
  'resource_draw should count as 0.5 in first-seat win-rate scoring',
  'resource_draw should count as 0.5 in archetype win-rate scoring',
].forEach((needle) => {
  assert.ok(
    pvpLiveBalanceSimulationChecks.includes(needle),
    `live PVP balance simulation sanity should pin V10-S2 marker: ${needle}`,
  );
});

[
  'S2-B balance artifacts should expose a frozen contract version',
  'S2-B fixture paths should be frozen now that implementation files are locked',
  'S2-B golden replay manifest should include response-window and public-loss-explanation cases',
  'artifact generator should materialize 10,000 opening scripts',
  'opening scripts should materially cover every frozen opening pressure category',
  'golden replay artifact should cover every required golden case',
  'golden replays should declare public/audit-safe visibility instead of hidden-state fixtures',
  'committed opening script fixture should contain exactly 10,000 JSONL rows',
  'committed golden replay fixture ids should match the required manifest',
  'committed opening scripts should match deterministic artifact generator output',
  'committed golden replays should match deterministic artifact generator output',
  'local simulation report snapshot should match deterministic artifact generator output when present',
  'artifact report should include derived staple pressure rows',
  'artifact quick report should keep the stabilized quick-gate archetype spread; full helper owns the S2-C pass gate',
  'full gate helper should run the required 32,000-match matrix',
  'S2-C full gate helper should pass the 32,000-match balance gate',
  'full gate reports should keep full-mode validation even when requested through quick mode',
].forEach((needle) => {
  assert.ok(
    pvpLiveBalanceArtifactChecks.includes(needle),
    `live PVP balance artifact sanity should pin V10-S2B marker: ${needle}`,
  );
});

[
  'S2-C full gate should run in full mode',
  'S2-C full gate should keep the 32,000-match matrix',
  'S2-C full gate should pass full validation',
  'S2-C full gate pair first-seat rates should stay within 45%-55%',
].forEach((needle) => {
  assert.ok(
    pvpLiveFullGateChecks.includes(needle),
    `live PVP full gate sanity should pin S2-C pass marker: ${needle}`,
  );
});

[
  'golden replay runner should load every required replay fixture',
  'golden replay runner should read the committed fixture without re-synthesizing it',
  'reducer-backed golden manifest should cover both replay_public and audit_safe replay layers',
  'should declare reducer execution layer',
  'must exercise the replay_public branch',
  'must exercise the audit_safe branch',
  'event sequence should remain contiguous',
  'should expose a stable replay hash',
  'public replay must not leak hidden hand data',
  'post-match reviews must not leak hidden tokens',
  'replay_public payload must not leak hidden tokens',
  'audit_safe payload must not leak hidden tokens',
  'public replay text must not include hidden token strings',
  'should execute its declared visibility branch',
  'audit_safe payload should expose field paths',
  'budget-prevention review marker should match public evidence',
  'idempotent golden replay should return duplicate for repeated intent',
  'store-backed golden manifest should cover reconnect, soft timeout, forfeit timeout, and invalidated setup',
  'simulation-backed golden manifest should be empty after round14 draw enters reducer runtime',
  'round14 golden should declare reducer runtime scenario',
  'round14 runtime golden should finish with reducer-backed draw',
  'round14 draw golden should not invent loser advice',
  'reconnect golden should resume without advancing state version',
  'reconnect golden should not expose post-match review on active resume',
  'soft-timeout golden should execute low-risk automation on first timeout',
  'soft-timeout golden should continue without post-match review',
  'forfeit-timeout golden should finish after repeated or severe timeout',
  'forfeit-timeout golden should expose post-match review after terminal timeout',
  'invalid golden should not expose post-match review',
  'invalid golden should not require post-match hidden review data',
].forEach((needle) => {
  assert.ok(
    pvpLiveGoldenReplayChecks.includes(needle),
    `live PVP golden replay sanity should pin S2-D/S2-E replay marker: ${needle}`,
  );
});

[
  'forceStoreActiveTurnStartedAt',
  'pvp-live-turn-timing-v1',
  'deadlineAt: safeStartedAt + store.turnTimeoutMs',
].forEach((needle) => {
  assert.ok(
    pvpLiveGoldenReplayRunner.includes(needle),
    `live PVP golden replay runner should pin S4A turnTiming timeout marker: ${needle}`,
  );
});

[
  'active match should not expose post-match replay',
  'active replay rejection should be stable',
  'participant should fetch replay_self',
  'winner self replay should include own authoritative settlement report',
  'winner self replay settlement report should stay seat-scoped',
  'winner self replay should include own season honor progress',
  'winner self replay season honor should not grant combat power',
  'participant should fetch replay_public',
  'replay_public should not expose seat-specific settlement report',
  'replay_public should not expose seat-specific season honor progress',
  'participant should fetch audit_safe replay',
  'non-participant should not fetch replay',
  'browser replay route should reject server_full visibility',
  'replay should not expose raw match id',
  'replay hidden scan should be clean',
  'should not expose hidden card or raw payload fields',
  'replay_public should not expose requester seat',
  'audit_safe replay should derive from replay_public',
  'partial persisted event source should fall back to complete state events',
  'terminal replay should reject incomplete persisted events when state events are also incomplete',
].forEach((needle) => {
  assert.ok(
    pvpLiveReplayChecks.includes(needle),
    `live PVP replay sanity should pin V10-S5 replay API marker: ${needle}`,
  );
});

[
  'isCompleteReplayEventSource',
  'hasSequenceCoverage',
  'hasTerminalEvent',
  'isTerminalReplayState(match && match.state)',
  '!Array.isArray(replayEvents)',
  'getEventMaxSequence(stateEvents) > getEventMaxSequence(persistedEvents)',
].forEach((needle) => {
  assert.ok(
    pvpLiveReplaySource.includes(needle),
    `live PVP replay source should pin partial event stream fallback marker: ${needle}`,
  );
});

[
  'attachLivePvpWebSocket',
  'makeEventReplay',
  'PUBLIC_EVENT_DATA_KEYS',
  "type: 'connected'",
  "type: 'state_sync'",
  "type: 'events_replay'",
  "type: 'presence'",
  "type: 'intent_result'",
  "message.type === 'join_match'",
  "message.type === 'heartbeat'",
  "message.type === 'intent'",
  'livePvpStore.recordHeartbeat',
  'livePvpStore.submitIntent',
  'jwt.verify(token, getJwtSecret())',
  "socket.write('HTTP/1.1 401 Unauthorized",
].forEach((needle) => {
  assert.ok(
    pvpLiveWsSource.includes(needle),
    `live PVP WS source should pin S6A authoritative realtime marker: ${needle}`,
  );
});

[
  'attachLivePvpWebSocket(server, { livePvpStore: pvpLiveRoutes.__livePvpStore })',
  'WS /api/pvp/live/ws',
].forEach((needle) => {
  assert.ok(
    serverApp.includes(needle),
    `backend app should mount live PVP WS marker: ${needle}`,
  );
});

[
  'WS connected should expose stable connection id',
  'WS connected should expose authoritative heartbeat interval',
  'WS state_sync should be seat scoped for A',
  'WS join_match should send missed events replay array',
  'WS events_replay should not expose hidden deck data',
  'WS heartbeat should return presence connection report',
  'WS intent should return accepted intent_result',
  'WS accepted intent should push state_sync to the opponent seat',
].forEach((needle) => {
  assert.ok(
    pvpLiveWsChecks.includes(needle),
    `live PVP WS sanity should pin S6A realtime behavior marker: ${needle}`,
  );
});

[
  'first queue join should reject illegal loadout',
  'illegal loadout response should expose validation reason',
  'first queue join should return locked loadout hash',
  'repeated join with changed loadout should keep original locked loadout hash',
  'illegal repeated join should not overwrite locked loadout hash',
  'active illegal rejoin should preserve locked loadout hash',
  'near-rated queue player should wait instead of instantly matching far player',
  'rated requester should prefer the closest rating candidate over first queued far candidate',
  'matched view should expose near rating delta bucket',
  'matched view should expose strict rating expansion stage',
  'matched quality should explain closest rating safeguard',
  'matched quality should not expose exact player ratings',
  'far-rated first queue player should remain waiting after closer match is selected',
  'long-wait wide rating gap should not auto-match without explicit acceptance',
  'matched opponent view must not expose full loadout snapshot',
  'matched view should expose match quality report version',
  'matched view should bucket rating delta instead of exposing exact hidden rating',
  'matched view should expose first-match guide report version',
  'should expose turn timer report version',
  'should expose connection report version',
  'heartbeat route should accept a participant heartbeat',
  'participant should be able to submit a preset emote',
  'preset emote should not advance combat state version',
  'opponent should see preset emote in public event feed',
  'repeat emote should be rate limited',
  'non-whitelisted emote should be rejected',
  'stale opponent should enter reconnect grace instead of immediate loss',
  'stale participant should be able to reconnect with heartbeat',
  'timer phase',
  'accepted play_card should keep current turn timer start',
  'accepted play_card should not extend current turn deadline',
  'end turn timer should switch to next seat',
  'end turn should start a fresh timer for next seat',
  'matched view first-match guide should explain opening protection',
  'matched view first-match guide should not imply hidden reward or rating compensation',
  'long waiting queue ticket should stay waiting instead of matching a ghost',
  'long waiting report should offer no-score practice',
  'long waiting report should explicitly forbid ghost fallback',
  'opening protected burst should leave unacted defender at 1 hp',
  'opening protected burst should return public protection event',
  'opening protected burst should expose minimum hp',
  'opening protected burst should expose prevented lethal damage',
  'opening protected defender should receive counterplay buffer on first turn',
  'opening protected defender should expose public counterplay buffer event',
  'opening protected defender should read own counterplay block through route state view',
  'normal lethal after opponent turn should finish',
  'live surrender should expose post-match review version',
  'surrender review should include friendly rematch next action',
  'winner should be able to request a friendly rematch from the finished live match',
  'second friendly rematch request should create a new live match',
  'friendly rematch state view should mark low-pressure friendly mode',
  'friendly rematch match should expose Bo3 target wins',
  'friendly rematch match should carry source score into Bo3',
  'friendly rematch requester should recover accepted rematch through current match',
  'accepted friendly rematch should become the current live match instead of opening a parallel queue',
  'friendly Bo3 round 2 should update tied source score',
  'tied Bo3 should allow a decider rematch',
  'Bo3 decider should keep the original series id',
  'Bo3 decider should be round 3',
  'Bo3 decider should close at 2-1',
  'completed Bo3 should reject another friendly rematch',
  'private invite creator should receive 200',
  'private invite creator should wait for invited opponent',
  'private invite host should not enter public queue while invite waits',
  'pending private invite should block public queue with stable reason',
  'private invite host should recover pending invite through current invite endpoint',
  'current private invite should expose original invite code',
  'non-host without pending invite should not recover another private invite',
  'public queue player should not match a private invite host',
  'private invite host should cancel waiting invite',
  'cancelled private invite should not be joinable',
  'private invite host should enter public queue after cancelling invite',
  'expired private invite should expose stable expiry reason',
  'expired current private invite should not keep host waiting',
  'targeted private invite should reject an unknown target username',
  'targeted private invite should reject targeting self',
  'targeted invite recipient should read private invite inbox',
  'non-target player should not join a targeted private invite even with code',
  'targeted invite recipient should join their private invite',
  'accepted targeted invite should disappear from recipient inbox',
  'failed invite join should keep host invite recoverable',
  'failed invite join should not leave an unpersisted current match',
  'private invite match should be friendly no-score mode',
  'private invite match should expose invite match quality stage',
  'private invite host should recover accepted invite through current match',
  'consumed private invite should not be reusable',
  'normal lethal should expose post-match review version',
  'normal lethal loser should receive a loss review',
  'another user should not cancel an owner queue ticket',
  'matched queue ticket should not be cancellable as a waiting ticket',
  'matched queue ticket should be consumed after first successful matched poll',
  'finished match should clear unpolled matched queue ticket',
  'setup disconnect after grace should invalidate instead of awarding a win',
  'setup disconnect should emit public connection_timeout event for stale seat',
  'setup disconnect should invalidate with connection_timeout reason',
  'non-current disconnected seat should not auto-finish before becoming the action owner',
  'both seats disconnected after grace should invalidate instead of awarding a win',
  'double-disconnect invalidation should not expose post-match review',
  'double disconnect should emit public connection_timeout event for both seats',
  'double-disconnect invalidation should release player without settlement',
  'current actor disconnected after grace should finish the active match',
  'connection timeout should emit public turn_timeout evidence with connection source',
  'connection timeout should finish with connection_timeout reason',
  'connection timeout review should expose connection timeout reason',
  'connection timeout loser review should include reconnect learning suggestions',
  'participant should recover current live match without queue ticket',
  'stale active live match should finish by timeout',
  'timeout finish should emit public timeout event',
  'timeout finish should expose post-match review version',
  'timeout loser should receive a loss review',
  'timed-out live match should release player for a new queue',
  'round14 draw route should emit match_finished round14_draw',
  'round14 draw route should expose draw review',
  'round14 draw route should not invent a loser',
  'round14 draw other seat should also receive draw review',
  'round14 draw should release player for a fresh queue',
  'round14 score route should emit match_finished round14_score',
  'round14 score winner should receive win review',
  'stale setup live match should invalidate instead of finishing as a win/loss',
  'invalidated setup timeout should not expose post-match review',
  'setup timeout should emit match_invalidated ready_timeout reason',
  'invalidated setup timeout should release player for a new queue without settlement',
].forEach((needle) => {
  assert.ok(
    pvpLiveRouteChecks.includes(needle),
    `live PVP route sanity should pin queue ticket lifecycle marker: ${needle}`,
  );
});

[
  'restarted server should recover persisted current live match',
  'restarted waiting queue ticket should remain readable',
  'restarted waiting queue status should preserve locked loadout hash',
  'restarted waiting queue rejoin should not overwrite locked loadout hash',
  'restarted waiting queue should match second user after backend restart',
  'restarted waiting queue matched ticket should be consumed after first read',
  'restarted initial rating stage should not match outside the base rating bucket',
  'restarted candidate search should honor persisted rating bucket before older wider-gap rows',
  'restarted candidate search should prefer the closest persisted rating snapshot',
  'restarted ranked match quality should derive rating delta bucket from joined ratings',
  'restarted ranked match quality should expose strict rating stage',
  'restarted ranked match quality should not expose exact player ratings',
  'older wider-gap persisted candidate should remain waiting after closest candidate is selected',
  'restarted saturated candidate search should restore beyond 32 candidates',
  'restarted saturated candidate search should prefer candidate after the first 32 waiting rows',
  'restarted saturated match quality should count more than 32 queued candidates',
  'restarted active live match join should return matched',
  'restarted active match should take precedence over any stale waiting row',
  'restarted current match should keep latest state version',
  'restarted active live match join should preserve locked loadout hash',
  'restarted current match should keep locked identity slot',
  'heartbeat connection timeline should be persisted with the live match row',
  'persisted connection timeline should keep report version',
  'restarted current match should restore connection report',
  'restarted current match should preserve recently heartbeated opponent as online',
  'restarted active match with missing turnTiming must not derive turn start from updated_at',
  'restarted active match with missing turnTiming should fall back to match createdAt',
  'connection_json',
  'pending friendly rematch request should be persisted before restart',
  'restarted pending rematch should create the friendly match instead of waiting again',
  'restarted pending rematch should keep original series id',
  'accepted pending rematch should be cleared after friendly match creation',
  'pvp_live_rematch_requests',
  'pending private invite should be persisted before restart',
  'persisted targeted private invite should keep target user id',
  'restarted targeted private invite recipient should read inbox',
  'restarted targeted private invite should appear in recipient inbox',
  'restarted private invite should create a live match',
  'restarted targeted private invite join should keep target report',
  'restarted private invite should preserve host locked loadout hash',
  'accepted private invite should be cleared after match creation',
  'expired persisted private invite should expose stable expiry reason',
  'expired persisted private invite should be cleared after rejected join',
  'event table should persist public replay source events',
  'replay should recover public timeline from persisted event table when state events are corrupted',
  'event table replay recovery should include battle_started',
  'event table replay recovery should include match_finished',
  'pvp_live_match_events',
  'pvp_live_invites',
  'target_user_id',
  'target_user_name',
  'restarted server should not recover invalidated setup timeout as current live match',
  'restarted invalidated match should not block fresh queue',
  'same DB path',
  'DEFIER_DB_PATH',
].forEach((needle) => {
  assert.ok(
    pvpLivePersistenceChecks.includes(needle),
    `live PVP persistence sanity should pin SQLite restart-recovery marker: ${needle}`,
  );
});

[
  'CREATE TABLE IF NOT EXISTS pvp_live_match_events',
  'UNIQUE(match_id, event_id)',
  'UNIQUE(match_id, event_sequence)',
  'idx_pvp_live_match_events_match_sequence',
].forEach((needle) => {
  assert.ok(
    pvpLiveDatabase.includes(needle),
    `live PVP database schema should pin append-only event table marker: ${needle}`,
  );
});

[
  'async saveMatchEvents(matchId, events = [])',
  'INSERT OR IGNORE INTO pvp_live_match_events',
  'async loadMatchEvents(matchId)',
  'ORDER BY event_sequence ASC',
].forEach((needle) => {
  assert.ok(
    pvpLivePersistence.includes(needle),
    `live PVP persistence should pin append-only event stream marker: ${needle}`,
  );
});

[
  'server-authoritative live settlement should add winner rank win',
  'transient settlement failure should surface instead of silently releasing an unsettled match',
  'finished-but-unsettled live match should retry settlement on current match recovery',
  'duplicate live settlement must not pay winner twice',
  'timeout winner should receive authoritative live rank win',
  'timeout live settlement should write the settlement gate',
  'setup timeout invalidated match should not write settlement gate',
  'setup timeout invalidated match should not append live match history',
  'pvp_live_match_settlements should record the live settlement gate',
  'live settlement should append both player history rows exactly once',
  'friendly rematch must not change player A score',
  'friendly rematch should declare Bo3 target wins',
  'finished first friendly round should update Bo3 score to 1-1',
  'unfinished Bo3 friendly review should expose the decider rematch action',
  'Bo3 decider should close the series at 2-1',
  'completed Bo3 review should not expose another friendly rematch action',
  'friendly rematch should not write live settlement gate',
  'Bo3 decider should not write live settlement gate',
  'friendly rematch should not append live match history',
  'Bo3 decider should not append live match history',
  'private invite friendly match must not change invite player A score',
  'private invite friendly should not write live settlement gate',
  'private invite friendly should not append live match history',
  'round14 draw settlement should not write ranked settlement',
  'round14 draw should be treated as no ranked impact instead of invalid finished seats',
  'round14 score settlement should write ranked settlement',
  'round14 score settlement should append both player history rows',
  'round14 score winner should receive rank win',
  'round14 score loser should receive rank loss',
  'winner reward should exceed loser reward',
  'loser state view should expose settlement report after live settlement',
  'loser settlement report should match authoritative rank score',
  'loser settlement report should match wallet reward delta',
  'loser settlement report should expose season honor progress',
  'season honor progress should match authoritative ranked games',
  'season honor progress should state the non-power boundary',
].forEach((needle) => {
  assert.ok(
    pvpLiveSettlementChecks.includes(needle),
    `live PVP settlement sanity should pin server-authoritative rank/economy/history marker: ${needle}`,
  );
});

[
  'ranked surrender review should expose authoritative settlement report',
  'ranked surrender settlement report should be formal authoritative',
  'friendly review must not expose formal ranked settlement report',
  'normal lethal winner should receive settlement report',
  'ranked surrender settlement report should include season honor progress',
  'ranked season honor progress should not grant combat power',
  'pvp-live-settlement-report-v1',
  'pvp-live-season-honor-v1',
  'server_authoritative_settlement',
  "formalResultPolicy, 'ranked_authoritative'",
].forEach((needle) => {
  assert.ok(
    pvpLiveRouteChecks.includes(needle),
    `live PVP route sanity should pin authoritative settlement report marker: ${needle}`,
  );
});

[
  'data-live-settlement-report',
  'data-live-settlement-source',
  'data-live-season-honor',
  'pvp-live-settlement-report-v1',
  'pvp-live-season-honor-v1',
  'getLiveSettlementReport(',
  'renderLiveSettlementReport(',
  '.pvp-live-settlement-report',
  '.pvp-live-season-honor',
].forEach((needle) => {
  assert.ok(
    pvpLiveUiContractChecks.includes(needle),
    `live PVP UI contract should pin settlement report marker: ${needle}`,
  );
});

[
  'settlementText',
  'settlementSource',
  'settlementHidden',
  'seasonHonorText',
  'seasonHonorPower',
  '正式积分',
  '天道币',
  '赛季荣誉',
  "settlementSource === 'server_authoritative_settlement'",
  "settlementReport?.reportVersion === 'pvp-live-settlement-report-v1'",
  "seasonHonorReport?.reportVersion === 'pvp-live-season-honor-v1'",
].forEach((needle) => {
  assert.ok(
    browserPvpLiveRealSmoke.includes(needle),
    `real browser live PVP smoke should pin visible authoritative settlement marker: ${needle}`,
  );
});

[
  '/api/pvp/live/queue/join',
  '/api/pvp/live/queue/cancel',
  '/api/pvp/live/queue/status/pvplq%20test%2F1',
  '/api/pvp/live/matches/pvplm%20test%2F1',
  '/api/pvp/live/matches/pvplm%20test%2F1/rematch',
  '/api/pvp/live/invites',
  '/api/pvp/live/invites/current',
  '/api/pvp/live/invites/inbox',
  '/api/pvp/live/invites/TD%20AB%2F12/join',
  '/api/pvp/live/invites/TD%20AB%2F12/cancel',
  '/api/pvp/live/matches/pvplm%20test%2F1/heartbeat',
  '/api/pvp/live/matches/current',
  '/api/pvp/live/matches/pvplm-test/intents',
  'BackendClient should expose requestLivePvpRematch',
  'BackendClient should expose createLivePvpInvite',
  'BackendClient should expose joinLivePvpInvite',
  'BackendClient should expose cancelLivePvpInvite',
  'BackendClient should expose getCurrentLivePvpInvite',
  'BackendClient should expose getLivePvpInviteInbox',
  'BackendClient should expose heartbeatLivePvpMatch',
  'BackendClient should expose getLivePvpWebSocketUrl',
  'BackendClient should expose connectLivePvpWebSocket',
  'live WebSocket URL should reuse server base URL, live path, and encoded session token',
  'live private invite creation should clone loadout before sending',
  'live targeted private invite should forward trimmed target username',
  'live invite inbox should use inbox endpoint',
  'live private invite join should encode invite code',
  'live private invite cancel should encode invite code',
  'live private invite cancel should preserve server expiry reason',
  'live current private invite should use current invite endpoint',
  'empty live invite code should not call requestServer',
  'empty live invite cancel code should not call requestServer',
  'live friendly rematch should clone loadout before sending',
  'live heartbeat should POST',
  'live pvp client must not call legacy settlement path',
  'live queue join should forward display name and loadout snapshot candidate',
  'live queue join should clone loadout before sending',
  'live intent should not add legacy didWin or matchTicket fields',
  'live intent stale failure should preserve server reason',
  'empty live queue ticket should not call requestServer',
].forEach((needle) => {
  assert.ok(
    pvpLiveClientChecks.includes(needle),
    `live PVP client sanity should pin live route isolation marker: ${needle}`,
  );
});

[
  'PVPService.live must not expose client-reported result API',
  'live bridge should not call legacy result reporting',
  'joinLivePvpQueue',
  'cancelLivePvpQueue',
  'getCurrentLivePvpMatch',
  'requestLivePvpRematch',
  'createLivePvpInvite',
  'joinLivePvpInvite',
  'cancelLivePvpInvite',
  'getCurrentLivePvpInvite',
  'getLivePvpInviteInbox',
  'heartbeatLivePvpMatch',
  'live invite bridge should call BackendClient.createLivePvpInvite',
  'live invite join bridge should call BackendClient.joinLivePvpInvite',
  'live invite cancel bridge should call BackendClient.cancelLivePvpInvite',
  'live current invite bridge should call BackendClient.getCurrentLivePvpInvite',
  'live invite inbox bridge should call BackendClient.getLivePvpInviteInbox',
  'live heartbeat bridge should call BackendClient.heartbeatLivePvpMatch',
  'live rematch bridge should call BackendClient.requestLivePvpRematch',
  'live realtime bridge should call BackendClient.connectLivePvpWebSocket',
  'submitLivePvpIntent',
  'connectRealtime',
].forEach((needle) => {
  assert.ok(
    pvpLiveServiceBridgeChecks.includes(needle),
    `live PVP service bridge sanity should pin legacy settlement isolation marker: ${needle}`,
  );
});

[
  'live session should not expose client-reported result API',
  'live session should expose friendly rematch request API',
  'live session should expose friendly rematch polling API',
  'live session should expose heartbeat API',
  'live session should expose private invite creation API',
  'live session should expose private invite cancel API',
  'live session should expose private invite resume API',
  'live session should expose targeted private invite inbox refresh API',
  'private invite creation should enter waiting invite phase',
  'resumeCurrentInvite should recover pending private invite',
  'refreshInviteInbox should store targeted private invite notifications',
  'failed refreshInviteInbox should keep previous invite notifications instead of showing empty',
  'failed refreshInviteInbox should expose stable inbox failure reason',
  'successful refreshInviteInbox should clear stale idle inbox errors',
  'joining a private invite should clear invite inbox notifications',
  'private invite cancel should return session to idle',
  'private invite cancel should expose stable cancelled reason',
  'private invite polling should enter accepted invite setup',
  'private invite polling should recover non-invite current match instead of staying stuck',
  'expired host private invite polling should leave waiting invite phase',
  'expired host private invite polling should expose stable expiry reason',
  'recovered current match should expose stable invite recovery reason',
  'joining a private invite should enter matched setup',
  'heartbeat should store authoritative connection report',
  'heartbeat should preserve opponent grace status for UI',
  'live session should not use legacy PVP paths',
  'session should inject latest heartbeat-refreshed stateVersion into live intent',
  'live session state must not expose opponent hand',
  'cancel queue should return session to idle',
  'sync_required should retain latest authoritative state view',
  'expired queue ticket should leave waiting phase',
  'long wait queue poll should keep waiting phase',
  'session should retain no ghost fallback safeguard',
  'surrender should move session into finished phase',
  'failed queue again after finished should clear stale match id',
  'failed queue again should preserve terminal recovery anchor for refresh retry',
  'successful queue again should clear old terminal recovery anchor',
  'finished terminal match should persist last reviewable match id for refresh recovery',
  'resumeCurrentMatch should restore finished terminal review from stored match id when current match is gone',
  'terminal review refresh should try current match before stored terminal match',
  'terminal fallback should only run after explicit no-current response',
  'transient terminal-match failure should preserve recovery anchor for retry',
  'missing terminal match should clear stale recovery anchor',
  'terminal recovery anchor should be scoped to current user',
  'different logged-in user should not restore another user terminal review',
  'same logged-in user should restore scoped terminal review',
  'waiting friendly rematch should enter a polling phase instead of freezing as finished',
  'waiting friendly rematch should retain Bo3 score report',
  'waiting friendly rematch should poll current match and enter accepted friendly setup',
  'waiting friendly rematch recovery should retain Bo3 score',
  'waiting friendly rematch should ignore unrelated friendly current matches',
  'matched friendly rematch should enter setup phase',
  'matched friendly rematch should retain friendly mode view',
  'matched friendly rematch should retain Bo3 decider round index',
  'resumeCurrentMatch should enter active when server has current match',
  'resumeCurrentMatch should stay idle when server has no current match',
  'heartbeat should retain authoritative heartbeat interval for scene scheduling',
  'live session should expose connectRealtime',
  'live session should expose joinRealtimeMatch',
  'live session should expose submitRealtimeIntent',
  'live session should expose heartbeatRealtime',
  'live session should expose disconnectRealtime',
  'connectRealtime should mark realtime connecting',
  'connectRealtime should register message handler',
  'connected WS message should mark realtime connected',
  'state_sync WS message should update live phase',
  'events_replay WS message should replace last events with missed public events',
  'presence WS message should update connection report',
  'intent_result WS message should update state view',
  'live session realtime helpers should send stable WS message envelopes',
  'disconnectRealtime should mark realtime closed',
  'onOpen should replay pending join_match after the socket becomes writable',
  'stale state_sync WS message should not downgrade authoritative stateVersion',
  'stale intent_result WS message should not downgrade authoritative stateVersion',
  'stale HTTP refresh should not downgrade authoritative stateVersion',
  'stale HTTP heartbeat should not downgrade authoritative stateVersion',
  'stale HTTP intent result should not downgrade authoritative stateVersion',
].forEach((needle) => {
  assert.ok(
    pvpLiveSessionChecks.includes(needle),
    `live PVP session sanity should pin playable-session isolation marker: ${needle}`,
  );
});

[
  'startLiveHeartbeat should consume authoritative heartbeatIntervalMs from connectionReport',
  'startLiveHeartbeat must not hard-code 5000ms once server interval is exposed',
  'startLiveHeartbeat should rebuild heartbeat timer when authoritative interval changes',
  'startLiveHeartbeat should allow timer rebuild without duplicate immediate heartbeat',
  'startLiveRealtime(state = null)',
  'session.joinRealtimeMatch(sourceState.matchId',
  'lastSeenRevision: this.getLiveLastSeenEventRevision(sourceState)',
  'this.stopLiveRealtime()',
  'PVPScene should re-render when live session receives realtime state',
  'PVPScene should batch realtime render updates',
  'PVPScene should persist post-review focus across realtime re-renders',
  'sendLiveHeartbeat should prefer realtime heartbeat when WS is connected',
  'sendLiveHeartbeat should keep HTTP heartbeat fallback',
  'submitLiveIntent should prefer realtime intent when WS is connected',
  'submitLiveIntent should keep HTTP intent fallback',
].forEach((needle) => {
  assert.ok(
    pvpLiveUiContractChecks.includes(needle),
    `live PVP UI contract should pin authoritative heartbeat scheduling marker: ${needle}`,
  );
});

[
  'startLiveHeartbeat runtime should schedule the server heartbeat interval',
  'startLiveHeartbeat runtime should not stack duplicate timers for the same interval',
  'sendLiveHeartbeat runtime should rebuild heartbeat timer after receiving a new server interval',
  'sendLiveHeartbeat runtime should clear stale timer after server interval changes',
].forEach((needle) => {
  assert.ok(
    pvpLiveUiRuntimeChecks.includes(needle),
    `live PVP UI runtime should pin authoritative heartbeat scheduling marker: ${needle}`,
  );
});

[
  "settlementSource: 'local_authority_gate'",
  "settlementSource: 'local_online_fallback'",
  "settlementSource: 'local_practice'",
  "settlementSource: 'server_authoritative'",
  "settlementSource: 'bmob_online'",
  "settlementSource: 'rejected'",
].forEach((needle) => {
  assert.ok(
    pvpService.includes(needle),
    `PVP service should preserve settlement receipt marker: ${needle}`,
  );
});

[
  "settleRes.settlementSource === 'local_practice'",
  "fallbackReport.settlementSource === 'local_online_fallback'",
  "bmobReport.settlementSource === 'bmob_online'",
  "duplicateSettle.settlementSource === 'rejected'",
  "staleReport.settlementSource === 'rejected'",
  "mismatchReport.settlementSource === 'rejected'",
].forEach((needle) => {
  assert.ok(
    pvpServiceChecks.includes(needle),
    `PVP service sanity should pin settlement receipt marker: ${needle}`,
  );
});

[
  'runPathProgress should force event-side progression',
  'upgradeCard should interrupt flow',
  'trial should start battle with enemy array',
  'fateRingEcho should not interrupt flow',
  'resonance fateRingEcho should grant opening block buff',
  'endless fateRingEcho should include ringExpFlat',
  'endless wisdom fateRingEcho should include extra buff charges',
  'defiance fateRingEcho should use defiance profile',
  'defiance fateRingEcho should not fall back to awakened copy',
  '命环回执',
  '回响之环',
].forEach((needle) => {
  assert.ok(
    read('tests/sanity_event_flow_checks.cjs').includes(needle),
    `event flow sanity should cover event/fate marker: ${needle}`,
  );
});

[
  'FATE_PATH_EVENT_POOLS',
  'pathId: \'resonance\'',
  'pathId: \'wisdom\'',
  'pathId: \'destruction\'',
  'pathId: \'convergence\'',
  'targetEventId: \'convergenceMatrixAccord\'',
  'targetEventId: \'ruinBountyWrit\'',
  'targetEventId: \'wisdomStarScriptorium\'',
  'targetEventId: \'resonanceWardCanticle\'',
  'fateRingEchoShrine bias too weak',
  '${targetEventId} bias too weak',
  'echoRate',
  'targetRate',
].forEach((needle) => {
  assert.ok(
    read('tests/sanity_event_bias_distribution_checks.cjs').includes(needle),
    `event bias sanity should cover fate-path echo marker: ${needle}`,
  );
});

[
  "convergence: ['convergenceRelay', 'harmonicAnvil', 'artifactConfluxBazaar', 'convergenceMatrixAccord']",
  'EVENTS.convergenceMatrixAccord',
  'tuning choice should grant ring exp',
  'firstTurnEnergyBoostBattles',
  'tuning choice should grant first-turn draw prep',
].forEach((needle) => {
  assert.ok(
    read('tests/sanity_content_archetype_checks.cjs').includes(needle),
    `content archetype sanity should cover convergence matrix event marker: ${needle}`,
  );
});

[
  "resonance: ['fateRingEchoShrine', 'stormchaserCamp', 'thunderConductTrial', 'fulgurMarket', 'resonanceWardCanticle']",
  'EVENTS.resonanceWardCanticle',
  'ward choice should grant ring exp',
  'openingBlockBoostBattles',
  'ward choice should grant echoWard',
].forEach((needle) => {
  assert.ok(
    read('tests/sanity_content_archetype_checks.cjs').includes(needle),
    `content archetype sanity should cover resonance ward event marker: ${needle}`,
  );
});

[
  "wisdom: ['fateRingEchoShrine', 'lifestringClinic', 'artifactConfluxBazaar', 'ancientLibrary', 'wisdomStarScriptorium']",
  'EVENTS.wisdomStarScriptorium',
  'study choice should grant heavenly insight',
  'study choice should grant ring exp',
  'firstTurnDrawBoostBattles',
].forEach((needle) => {
  assert.ok(
    read('tests/sanity_content_archetype_checks.cjs').includes(needle),
    `content archetype sanity should cover wisdom scriptorium event marker: ${needle}`,
  );
});

[
  "destruction: ['overclockSigil', 'bloodForgeCovenant', 'bloodloomGarden', 'ruinBountyWrit']",
  'EVENTS.ruinBountyWrit',
  'bounty choice should cost HP',
  'bounty choice should grant gold',
  'bounty choice should grant ring exp',
  'victoryGoldBoostBattles',
].forEach((needle) => {
  assert.ok(
    read('tests/sanity_content_archetype_checks.cjs').includes(needle),
    `content archetype sanity should cover destruction bounty event marker: ${needle}`,
  );
});

[
  'forbidden-altar engineering event overlay + reward uplift',
  'blackbannerExecution',
  'memory-rift engineering event overlay + reward uplift',
  'floatingMarketRift',
  'artifactConfluxBazaar',
  'after.ringExp > before.ringExp',
  'after.karma > before.karma',
  'choiceTexts.every((text) => !INTERNAL_EFFECT_LABEL_PATTERN.test(text))',
].forEach((needle) => {
  assert.ok(
    browserEventBranchAudit.includes(needle),
    `browser event branch audit should cover event/fate marker: ${needle}`,
  );
});

[
  'runPathInsightAstrolabe',
  'runPathBulwarkSanctuary',
  'runPathShatterBounty',
  'phaseProgress === 1',
  '/命途推进/.test',
].forEach((needle) => {
  assert.ok(
    browserRunPathEventAudit.includes(needle),
    `browser run path event audit should cover run path event marker: ${needle}`,
  );
});

[
  'fate ring echo event applies path-based resonance reward and mirrors result text',
  'fateRingEchoShrine',
  'fateRingEcho',
  'openingBlockBoostBattles',
].forEach((needle) => {
  assert.ok(
    browserFeatureAudit.includes(needle),
    `browser feature audit should cover fate ring echo marker: ${needle}`,
  );
});

[
  'wisdom observatory should grant heavenly insight',
  'wisdom combo should stack insight from strategic hits',
  'wisdom combo stage-2 should grant first-turn draw prep',
  "['observatory', 'memory_rift', 'event', 'shop']",
].forEach((needle) => {
  assert.ok(
    mapPathSynergyChecks.includes(needle),
    `map path synergy sanity should cover wisdom node reward marker: ${needle}`,
  );
});

[
  'wisdom path node synergy converts observatory and rift hits into insight and staged draw prep',
  "['observatory', 'memory_rift', 'event', 'shop']",
  'Number(wisdomPathNodeProbe.insight || 0) >= 3',
  'Number(wisdomPathNodeProbe.drawBuff || 0) >= 1',
].forEach((needle) => {
  assert.ok(
    browserFeatureAudit.includes(needle),
    `browser feature audit should cover wisdom node reward marker: ${needle}`,
  );
});

[
  'convergence path matrix accord turns tuning into ring exp first-turn energy and draw prep',
  "window.__debugEventQueue = ['convergenceMatrixAccord']",
  '归一阵枢约',
  'firstTurnEnergyBoostBattles',
  'firstTurnDrawBoostBattles',
].forEach((needle) => {
  assert.ok(
    browserFeatureAudit.includes(needle),
    `browser feature audit should cover convergence matrix event marker: ${needle}`,
  );
});

[
  'resonance path ward canticle turns echo study into ring exp opening block prep and echoWard',
  "window.__debugEventQueue = ['resonanceWardCanticle']",
  '护阵回响谱',
  'openingBlockBoostBattles',
  "deckIds.includes('echoWard')",
].forEach((needle) => {
  assert.ok(
    browserFeatureAudit.includes(needle),
    `browser feature audit should cover resonance ward event marker: ${needle}`,
  );
});

[
  'wisdom path scriptorium converts insight study into ring exp and first-turn draw prep',
  "window.__debugEventQueue = ['wisdomStarScriptorium']",
  '星盘旁注阁',
  'firstTurnDrawBoostBattles',
  'heavenlyInsight = 0',
].forEach((needle) => {
  assert.ok(
    browserFeatureAudit.includes(needle),
    `browser feature audit should cover wisdom scriptorium event marker: ${needle}`,
  );
});

[
  'destruction path bounty writ trades HP for loot and victory bounty buff',
  "window.__debugEventQueue = ['ruinBountyWrit']",
  '烬途追赏令',
  'victoryGoldBoostBattles',
  'game.player.block = 0',
].forEach((needle) => {
  assert.ok(
    browserFeatureAudit.includes(needle),
    `browser feature audit should cover destruction bounty event marker: ${needle}`,
  );
});

[
  'buildObservatoryRouteForecast',
  '星轨预报',
  'visibleNodeCount === 4',
  'focusNodeTypes.includes(\'trial\')',
  'forecast.topRisk && forecast.topRisk.type === \'trial\'',
  'rememberedRift',
  '裂隙回响线',
].forEach((needle) => {
  assert.ok(
    strategicNodeChecks.includes(needle),
    `strategic node sanity should cover observatory route forecast marker: ${needle}`,
  );
});

[
  'data-observatory-route-forecast="true"',
  'payloadForecast',
  'observatoryProbe.payloadForecast?.selectedRoute === \'utility\'',
  'observatoryProbe.hasRift',
  'observatoryProbe.riftPayloadForecast?.selectedRoute === \'rift\'',
  'observatory node previews future realm and can lock a route forecast',
  '星轨预报',
  '裂隙回响线',
].forEach((needle) => {
  assert.ok(
    browserFeatureAudit.includes(needle),
    `browser feature audit should cover observatory forecast marker: ${needle}`,
  );
});

[
  'mobile trial challenge modal stays within viewport and keeps all challenge packages reachable',
  '剑心限令',
  '秘宝回响',
  '护心证道',
  'hasCardLimit',
  'hasTreasureHunt',
  'hasVitalSeal',
  'cardLimitConditionVisible',
  'treasureHuntConditionVisible',
  'vitalSealConditionVisible',
  'choices.length >= 6',
].forEach((needle) => {
  assert.ok(
    browserMobileAudit.includes(needle),
    `mobile layout audit should cover trial treasure marker: ${needle}`,
  );
});

[
  'AnonymousReadableGhost',
  'anonymous ghost lookup should return a seeded ghost without token',
  'anonymous ghost lookup should return parsed ghost data',
  '/api/ghosts/random?realm=77',
].forEach((needle) => {
  assert.ok(
    backendSecurityChecks.includes(needle),
    `backend security checks should cover anonymous ghost success marker: ${needle}`,
  );
});

[
  'browser PVPService completes authoritative Node settlement when local test server allows client result',
  'DEFIER_PVP_ALLOW_CLIENT_REPORTED_RESULT',
  'DEFIER_PVP_TEST_MODE',
  'authority PVPService server settlement failed',
  'authority server rank did not match PVPService settlement',
  'authority local PVP economy snapshot diverged from server wallet',
  'browser online pvp screen drives authoritative settlement end-to-end',
  'settlementSource === \'server_authoritative\'',
  'settlementSource === \'local_authority_gate\'',
  'authority UI challenge did not enter a server PVP battle',
  'authority UI pre-settlement backend reads failed',
  'fallbackCompensationAvoided',
].forEach((needle) => {
  assert.ok(
    backendClientSmoke.includes(needle),
    `browser backend smoke should cover authoritative PVP settlement marker: ${needle}`,
  );
});

[
  'settlementSource',
  'settlementLine',
  "resultProbe.payloadReview.settlementSource === 'local_practice'",
  '/本地演武回执/.test(resultProbe.reviewFoot || \'\')',
  '/不占用服务端权威榜单/.test(resultProbe.payloadReview.settlementLine || \'\')',
].forEach((needle) => {
  assert.ok(
    browserPvpAudit.includes(needle),
    `browser pvp audit should expose settlement receipt marker: ${needle}`,
  );
});

[
  'challenge mobile active banner keeps shared danger axis and training focus visible after launch',
  'challenge mobile replay banner preserves replay-only state and sample focus without overflow',
  'rectFitsViewport(activeBannerProbe.bannerRect',
  'rectFitsViewport(replayBannerProbe.bannerRect',
].forEach((needle) => {
  assert.ok(
    challengeMobileAudit.includes(needle),
    `challenge mobile audit should enforce vertical banner viewport marker: ${needle}`,
  );
});

[
  'chapter drill CTA stores a chapter training focus and opens daily challenge hub',
  'chapter drill mode buttons can route the same chapter focus into weekly and global challenge hubs',
  'apply-chapter-drill-focus',
  "['daily', 'weekly', 'global'].every((mode) => drillModes.includes(mode))",
  '七日劫数',
  '众生试炼',
  'focus?.sourceRunId === `chapter_codex:${before.selectedChapter}`',
  "focus?.sourceRunId === 'chapter_codex:final_court'",
  'data-observatory-training-focus',
  'trainingTags',
].forEach((needle) => {
  assert.ok(
    browserChapterFlowAudit.includes(needle),
    `browser chapter flow audit should cover chapter drill focus marker: ${needle}`,
  );
});

[
  'reward chapter-arc drill CTAs route chapter training focus into daily/weekly/global challenge hubs',
  "const EXPECTED_CHAPTER_ARC_DRILL_MODES = ['daily', 'weekly', 'global']",
  'data-season-board-chapter-drill-cta',
  "seasonBoardChapterDrillMode === 'daily'",
  "seasonBoardChapterDrillMode === 'weekly'",
  "seasonBoardChapterDrillMode === 'global'",
  "seasonBoardChapterDrillSource === 'chapter_arc'",
  'seasonBoardChapterDrillFocusId',
  'focus?.sourceRunId === expectedFocusId',
  'window.game?.challengeHubState?.tab === mode',
  'three chapter-drill CTAs remain reachable on 360px reward rail',
].forEach((needle) => {
  assert.ok(
    browserRunPathRewardAudit.includes(needle),
    `browser run path reward audit should cover chapter arc drill handoff marker: ${needle}`,
  );
});

[
  "getRewardChapterArcDrillTarget(mode)",
  "['daily', 'weekly', 'global'].map((mode) => chapterArcGame.rewardView.getRewardChapterArcDrillTarget(mode))",
  "followRewardChapterArcDrill(chapterArcDrillTarget.chapterId, mode)",
  "chapterArcGame.challengeHubState?.tab === mode",
  "chapterArcGame.lastRewardSeasonBoardHandoff?.value === mode",
].forEach((needle) => {
  assert.ok(
    seasonBoardChecks.includes(needle),
    `season board sanity should cover chapter arc reward drill multi-mode marker: ${needle}`,
  );
});

[
  "game.applyChapterCodexDrillFocus(chapters[5].id, 'weekly')",
  "game.applyChapterCodexDrillFocus(chapters[5].id, 'global')",
  "game.challengeHubState.tab === 'weekly'",
  "game.challengeHubState.tab === 'global'",
  "`chapter_codex:${chapters[5].id}`",
].forEach((needle) => {
  assert.ok(
    codexSanctumChecks.includes(needle),
    `codex sanctum checks should cover chapter drill direct routing marker: ${needle}`,
  );
});

[
  'buildShopServiceDetailMeta',
  'evaluateShopServiceFit(service)',
  'getShopEconomyOutlook()',
  '买后剩余',
  '储备线',
  '建议单次',
  '当前血线',
].forEach((needle) => {
  assert.ok(
    shopManager.includes(needle),
    `shop manager should build service detail economy marker: ${needle}`,
  );
});

[
  'showShopServiceDetail',
  'service-detail-main',
  'service-detail-side',
  '服务详情',
  '服务主舞台',
  '购买判断',
  '点击价格按钮才会购买',
].forEach((needle) => {
  assert.ok(
    coreUtils.includes(needle),
    `core utils should render service detail modal marker: ${needle}`,
  );
});

[
  'shop service row opens detail without purchasing and buy button remains purchase-only',
  'shopServiceDetailClickProbe',
  'hasEconomyText',
  'afterInfo?.gold === shopServiceDetailClickProbe.before?.gold',
  'afterBuy?.sold === true',
].forEach((needle) => {
  assert.ok(
    browserFeatureAudit.includes(needle),
    `browser feature audit should cover shop service detail click marker: ${needle}`,
  );
});

[
  'Utils.showShopServiceDetail(service, this.buildShopServiceDetailMeta(service, activeTab))',
  "event.target.closest('.buy-btn')",
].forEach((needle) => {
  assert.ok(
    gameSource.includes(needle),
    `game shop renderer should open service detail without hijacking buy button marker: ${needle}`,
  );
  assert.ok(
    shopView.includes(needle.replace('this.buildShopServiceDetailMeta', 'this.game.buildShopServiceDetailMeta')),
    `shop view should open service detail without hijacking buy button marker: ${needle}`,
  );
});

[
  'rewardSeasonBoardChapterArcDrills.length === 3',
  "rewardSeasonBoardChapterArcDrillModes.includes('daily')",
  "rewardSeasonBoardChapterArcDrillModes.includes('weekly')",
  "rewardSeasonBoardChapterArcDrillModes.includes('global')",
  'rewardSeasonBoardChapterArcDrillTexts.some(text => /今日天机/.test(text))',
  'rewardSeasonBoardChapterArcDrillTexts.some(text => /众生试炼/.test(text))',
].forEach((needle) => {
  assert.ok(
    browserMetaAudit.includes(needle),
    `browser meta audit should cover reward chapter arc drill multi-mode marker: ${needle}`,
  );
});

[
  'shop service detail modal opens from service row and shows economy reserve cues',
  '.service-detail-main',
  '.service-detail-side',
  '买后剩余',
  '储备线',
  '建议单次',
  '高适配|中适配|低适配',
].forEach((needle) => {
  assert.ok(
    browserMetaAudit.includes(needle),
    `browser meta audit should cover shop service detail marker: ${needle}`,
  );
});

console.log('Release gate coverage checks passed.');
