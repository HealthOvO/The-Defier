const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const prodReadScript = read('scripts/check-production-read-only.sh');
const prodApiSmoke = read('tests/prod_api_smoke.cjs');
const pagesWorkflow = read('.github/workflows/pages.yml');
const browserReleaseScript = read('tests/run_browser_release_checks.sh');
const browserReleaseSummary = read('tests/summarize_browser_release_reports.cjs');
const backendSecurityChecks = read('tests/backend_security_checks.cjs');
const backendClientSmoke = read('tests/browser_backend_client_smoke.mjs');
const backendClientSource = read('js/services/backend-client.js');
const browserAudit = read('tests/browser_audit.mjs');
const browserPvpAudit = read('tests/browser_pvp_audit.mjs');
const browserPvpLiveAudit = read('tests/browser_pvp_live_audit.mjs');
const browserPvpLiveRealSmoke = read('tests/browser_pvp_live_real_backend_smoke.mjs');
const browserFeatureAudit = read('tests/browser_feature_audit.mjs');
const browserMetaAudit = read('tests/browser_meta_screen_audit.mjs');
const browserDongfuAudit = read('tests/browser_dongfu_audit.mjs');
const browserEventBranchAudit = read('tests/browser_event_branch_audit.mjs');
const browserRunPathEventAudit = read('tests/browser_run_path_event_audit.mjs');
const browserMobileAudit = read('tests/browser_mobile_layout_audit.mjs');
const browserChallengeAudit = read('tests/browser_challenge_audit.mjs');
const challengeMobileAudit = read('tests/browser_challenge_mobile_flow_audit.mjs');
const browserChapterFlowAudit = read('tests/browser_chapter_flow_audit.mjs');
const browserRunPathRewardAudit = read('tests/browser_run_path_reward_audit.mjs');
const challengeHub = read('js/core/challenge_hub.js');
const observatoryArchiveChecks = read('tests/sanity_observatory_archive_checks.cjs');
const mapPathSynergyChecks = read('tests/sanity_map_path_synergy_checks.cjs');
const codexSanctumChecks = read('tests/sanity_codex_sanctum_checks.cjs');
const seasonBoardChecks = read('tests/sanity_season_board_system_checks.cjs');
const strategicNodeChecks = read('tests/sanity_strategic_node_system_checks.cjs');
const runVowChecks = read('tests/sanity_run_vow_system_checks.cjs');
const trialChallengeChecks = read('tests/sanity_trial_challenge_checks.cjs');
const pvpService = read('js/services/pvp-service.js');
const pvpServiceChecks = read('tests/sanity_pvp_service_checks.cjs');
const collectionHub = read('js/core/collection_hub.js');
const pvpLegacySeasonIsolationChecks = read('tests/sanity_pvp_legacy_season_isolation_checks.cjs');
const pvpLiveEngineChecks = read('tests/sanity_pvp_live_engine_checks.cjs');
const pvpLiveBalanceSimulationChecks = read('tests/sanity_pvp_live_balance_simulation_checks.cjs');
const pvpLiveFullGateChecks = read('tests/sanity_pvp_live_full_gate_balance_checks.cjs');
const pvpLiveBalanceArtifactChecks = read('tests/sanity_pvp_live_balance_artifact_checks.cjs');
const pvpLiveStateView = read('server/pvp-live/engine/state-view.js');
const pvpLiveGoldenReplayChecks = read('tests/sanity_pvp_live_golden_replay_checks.cjs');
const pvpLiveGoldenReplayRunner = read('server/pvp-live/golden-replay-runner.js');
const pvpLiveReplayChecks = read('tests/sanity_pvp_live_replay_checks.cjs');
const pvpLiveReplaySource = read('server/pvp-live/replay.js');
const pvpLiveWsChecks = read('tests/sanity_pvp_live_ws_checks.cjs');
const pvpLiveCrossProcessWsFanoutChecks = read('tests/sanity_pvp_live_cross_process_ws_fanout_checks.cjs');
const pvpLiveWsSource = read('server/pvp-live/live-ws.js');
const pvpLiveStore = read('server/pvp-live/live-store.js');
const pvpLiveCrossProcessQueueChecks = read('tests/sanity_pvp_live_cross_process_queue_checks.cjs');
const serverApp = read('server/app.js');
const pvpLiveRouteChecks = read('tests/sanity_pvp_live_route_checks.cjs');
const pvpLiveRoute = read('server/routes/pvp-live.js');
const pvpLivePersistenceChecks = read('tests/sanity_pvp_live_persistence_checks.cjs');
const pvpLiveDatabase = read('server/db/database.js');
const pvpLivePersistence = read('server/pvp-live/live-persistence.js');
const pvpLiveSettlementChecks = read('tests/sanity_pvp_live_settlement_checks.cjs');
const pvpLiveClientChecks = read('tests/sanity_pvp_live_client_checks.mjs');
const pvpLiveServiceBridgeChecks = read('tests/sanity_pvp_live_service_bridge_checks.cjs');
const pvpLiveSessionChecks = read('tests/sanity_pvp_live_session_checks.mjs');
const pvpLiveSessionSource = read('js/services/pvp-live-session.js');
const pvpSceneSource = read('js/scenes/pvp-scene.js');
const pvpCss = read('css/pvp.css');
const pvpLiveUiContractChecks = read('tests/sanity_pvp_live_ui_contract_checks.cjs');
const pvpLiveUiRuntimeChecks = read('tests/sanity_pvp_live_ui_runtime_checks.mjs');
const runNodeChecks = read('tests/run_node_checks.sh');
const shopManager = read('js/managers/ShopManager.js');
const coreUtils = read('js/core/utils.js');
const gameSource = read('js/game.js');
const shopView = read('js/views/ShopView.js');
const openerAssignmentSource = pvpLiveStore.slice(
  pvpLiveStore.indexOf('function makeAuthoritativeOpenerAssignment'),
  pvpLiveStore.indexOf('function normalizeInviteCode')
);
const friendlySeriesSource = pvpLiveStore.slice(
  pvpLiveStore.indexOf('function makeFriendlySeriesReport'),
  pvpLiveStore.indexOf('class LivePvpStore')
);
const waitingReportSource = pvpLiveStore.slice(
  pvpLiveStore.indexOf('function makeWaitingReport'),
  pvpLiveStore.indexOf('const FRIENDLY_SERIES_TARGET_WINS')
);
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

[
  'assertLivePvpInviteSmoke',
  '/api/pvp/live/invites',
  '/api/pvp/live/invites/inbox',
  '/api/pvp/live/invites/current',
  '/api/pvp/live/invites/${encodeURIComponent(inviteCode)}/join',
  '/api/pvp/live/matches/current',
  '/api/pvp/live/matches/${encodeURIComponent(matchId)}/intents',
  '/api/pvp/live/matches/${encodeURIComponent(matchId)}/replay',
  'prod live invite should create no-ranked invite',
  'prod live invite target inbox should list invite',
  'prod live invite join should create friendly setup',
  'prod live invite both ready should enter active',
  'prod live invite surrender should finish friendly match',
  'prod live invite replay should expose finished public replay',
  'prod live invite smoke should not change rank scores',
  'prod live invite smoke should not change wallet coins',
  'prod live invite smoke should not expose settlement report',
].forEach((needle) => {
  assert.ok(
    prodApiSmoke.includes(needle),
    `production API smoke should cover live PVP invite marker: ${needle}`,
  );
});

[
  'assertLivePvpRankedQueueSmoke',
  '/api/pvp/live/queue/join',
  '/api/pvp/live/queue/status/${encodeURIComponent(queueTicket)}',
  '/api/pvp/live/matches/${encodeURIComponent(matchId)}/intents',
  '/api/pvp/live/matches/${encodeURIComponent(matchId)}/replay',
  '/api/pvp/live/matches/${encodeURIComponent(matchId)}/heartbeat',
  'prod live ranked should match through public queue',
  'prod live ranked both ready should enter active',
  'prod live ranked active current match should recover same ranked match',
  'prod live ranked current recovery should keep terminal review hidden before grace',
  'prod live ranked silent opponent should enter reconnect grace through current match recovery',
  'prod live ranked reconnect grace current recovery should keep terminal review hidden',
  'prod live ranked reconnect grace should preserve active turn deadline',
  'prod live ranked reconnect grace recovery should not emit terminal events',
  'prod live ranked heartbeat recovery should keep active ranked match',
  'prod live ranked heartbeat recovery should keep terminal review hidden',
  'prod live ranked real card lethal should finish authoritative match',
  'prod live ranked lethal should not use surrender shortcut',
  'prod live ranked replay should record lethal finish reason',
  'prod live ranked loser should expose settlement report',
  'prod live ranked settlement should be formal authoritative',
  'prod live ranked season honor should remain cosmetic only',
  'prod live ranked winner score should increase',
  'prod live ranked loser score should decrease',
  'prod live ranked winner wallet should gain live reward',
  'prod live ranked loser wallet should gain participation reward',
  'prod live ranked should append winner live match history',
  'prod live ranked replay should expose finished public replay',
].forEach((needle) => {
  assert.ok(
    prodApiSmoke.includes(needle),
    `production API smoke should cover live PVP ranked marker: ${needle}`,
  );
});

const layoutAudit = read('tests/browser_frontend_layout_audit.mjs');
const browserAutomationBootAudit = read('tests/browser_automation_boot_audit.mjs');
[
  "id: 'public-replay-share-viewer'",
  '?autotest=guest-map&pvpReplayShare=',
  'mockReplayShare',
  'public replay share mobile viewer keeps key moments readable before auth or automation boot',
  'viewport: { width: 390, height: 844 }',
  'probe.publicReplayViewerMetrics?.highlightVisible',
  '!probe.publicReplayViewerMetrics?.documentOverflowsX',
  'probe.authModalActive',
  'probe.saveSlotsModalActive',
  'probe.publicReplayViewerVisible',
  'payload?.pvp?.live === null',
  'payload?.pvp?.replayShareViewer?.status === \'ready\'',
  'pvpm-browser-raw-should-not-render',
  'SHOULD_NOT_RENDER_POST_MATCH_REVIEW',
].forEach((needle) => {
  assert.ok(
    browserAutomationBootAudit.includes(needle),
    `automation boot browser audit should cover public replay share viewer marker: ${needle}`,
  );
});

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
  'env BROWSER_PVP_LIVE_REAL_VIEWPORT=mobile BROWSER_PVP_LIVE_REAL_REQUIRE_MOBILE=1 node tests/browser_pvp_live_real_backend_smoke.mjs "$BASE_URL" "$OUTPUT_ROOT/pvp-live-mobile-real"',
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
  'audits: expedition,events,vow-choice,guide,inheritance,pvp,pvp-live,pvp-live-real,pvp-live-mobile-real,pvp-mobile,pvp-mobile-result,challenge-mobile-flow',
  "if: contains(matrix.audits, 'backend-client') || contains(matrix.audits, 'auth-ui-cloud') || contains(matrix.audits, 'pvp-live-real') || contains(matrix.audits, 'pvp-live-mobile-real')",
].forEach((needle) => {
  assert.ok(
    pagesWorkflow.includes(needle),
    `GitHub Pages browser-release workflow should include live PVP audit marker: ${needle}`,
  );
});

[
  "'pvp-live'",
  "'pvp-live-real'",
  "'pvp-live-mobile-real'",
].forEach((needle) => {
  assert.ok(
    browserReleaseSummary.includes(needle),
    `browser release summary should expect live PVP audit module: ${needle}`,
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
  'node tests/sanity_pvp_live_cross_process_ws_fanout_checks.cjs',
  'node tests/sanity_pvp_live_cross_process_queue_checks.cjs',
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
  'data-live-connection-tempo',
  'data-live-connection-tempo-state',
  'data-live-tempo-action="refresh-match"',
  'pvp-live-connection-tempo-v1',
  'data-live-social-panel',
  'data-live-emote',
  'data-live-first-guide',
  'data-live-waiting-report',
  'data-live-post-match-review',
  'data-live-post-review-action',
  'data-live-post-review-audit-action',
  'live UI renders all baseline loadouts with balanced selected by default',
  'live UI renders public match quality report without hidden rating leak',
  'live UI sends ranked entry connection health preflight with queue join',
  'live UI blocks risky ranked entry and keeps connection health retry practice actions',
  'live UI blocked connection practice opens no-score entry safeguard drill without queue cancellation',
  'entry_safeguard:connection_health_failed',
  'live UI queue cooldown keeps retry practice actions without reward or rating promise',
  'live UI queue cooldown practice opens no-score entry safeguard drill without queue cancellation',
  'entry_safeguard:queue_cooldown',
  'pvp-live-matchmaking-guard-v1',
  '剩余 60 秒',
  '60s 后重试',
  '排队冷却练习',
  '重试检测',
  '连接健康练习',
  'live UI renders first-match guide report without reward or rating promises',
  '查看权威事件',
  '调整斗法谱',
  '继续真人排位',
  '举报异常',
  '避开此对手',
  'live UI updates first-match guide next action after setup',
  'live UI renders recent-opponent waiting safeguard before long-wait threshold',
  'live UI renders low-sample waiting safeguard before long-wait threshold',
  'recent_opponent_suppression',
  'low_sample_protection',
  'protectionReason',
  'releaseMode',
  'need_third_player',
  'requiresPoolSize',
  'currentEligibleActions',
  '匹配样本保护',
  '匹配质量护栏',
  'live UI renders 120s no-real-player waiting branch without ghost fallback',
  'live UI long-wait practice handoff creates no-score playable challenge drill',
  'live UI long-wait practice handoff recovers authoritative match when cancel races matchmaking',
  'matched-race',
  'accept_wide_match',
  '接受宽分差',
  'live UI renders post-match review MVP from public finished state',
  'review_key_turns:key_turn_replay',
  'report_issue:report_issue',
  'avoid_opponent:avoid_opponent',
  'live UI renders post-match experience report from public events',
  'live UI reactivates local recovery goal after consecutive low-agency losses',
  'consecutive_low_agency_losses',
  'badExperienceStreak',
  'live UI experience check focuses linked public evidence without hidden payloads',
  'reviewParity',
  'live UI post-match review actions are clickable safe handoff entries',
  'live UI post-match key-turn action fetches authoritative replay and focuses it without hidden payloads',
  'live UI key-turn stepper focuses one public evidence window without hidden payloads',
  'live UI post-match report_issue submits audit-safe dispute receipt without changing ranked state',
  'live UI post-match avoid_opponent records no-score no-reward opponent avoidance',
  'live UI requires a second click before surrender submits terminal intent',
  '再次点击确认认输',
  'live UI requires a second click before opening-window card intent submits',
  'live UI requires a second click before opening-window end turn submits',
  '再次点击确认出牌',
  '再次点击确认结束回合',
  '首动预算\\s*18',
  '保底\\s*1\\s*血',
  '后手护盾\\s*B\\s*\\+3',
  '反打缓冲\\s*\\+8',
  'pvp-live-action-preview-v1',
  'live UI exposes authoritative action preview report for opening card without hidden opponent payloads',
  '预算后\\s*8',
  '生命伤害\\s*5',
  'B\\s*预计\\s*45\\s*血',
  'pvp-live-action-receipt-v1',
  'pvp-live-opener-assignment-v1',
  'data-live-opener-assignment',
  '服务端种子',
  '不绑定排队',
  '不绑定房主',
  'data-live-action-receipt',
  'data-live-action-receipt-type',
  'data-live-action-receipt-acting',
  'data-live-action-receipt-next-seat',
  'authoritative_public_projection',
  '交权回执',
  'live UI renders authoritative action receipt after opening card resolves',
  'B\\s*剩余\\s*45\\s*血',
  'live UI warns the acting player during the final 10 seconds without hiding action controls',
  'data-live-turn-timer-urgency',
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
  'live UI mobile keeps opening fairness explanation fully readable',
  'mobileOpeningSafeguardProbe',
  "chip.display !== 'none' && chip.visibility !== 'hidden' && chip.width > 0 && chip.height > 0",
  'mobileOpeningSafeguardProbe.scrollWidth <= mobileOpeningSafeguardProbe.clientWidth + 2',
  '先手 A 18',
  '后手 B 24',
  'live UI mobile renders first-match guide without clipping exception or review actions',
  'inviteCreateProbe.snapshot?.inviteReport?.reportVersion === \'pvp-live-invite-v1\'',
  "call.options?.targetUsername === '乙'",
  'inviteResumeProbe.calls.some(call => call.method === \'getCurrentInvite\'',
  'inviteJoinProbe.snapshot?.matchQuality?.expansionStage === \'friend_invite\'',
  'mobileConnectionProbe.whiteSpace !== \'nowrap\'',
  'live UI waiting friendly rematch auto-enters accepted friendly setup for the requester',
  'live UI waiting friendly rematch exposes requester cancel control',
  'live UI waiting friendly rematch requester can cancel and restores finished review',
  '等待已取消',
  'data-live-action="cancel-rematch"',
  '[data-live-action="cancel-rematch"]:not([hidden])',
  'data-live-friendly-series-status',
  'live UI Bo3 tied friendly review exposes decider and auto-enters G3 with same series id',
  'live UI completed Bo3 hides friendly rematch after source seat reaches two wins',
  'friendlyRematchProbe.actionDisabled?.queue_again === true',
  'friendlyRematchProbe.actionDisabled?.friendly_rematch === true',
  'friendlyDeciderRecoveryProbe.snapshot?.seriesId === friendlyDeciderCtaProbe.snapshot?.seriesId',
  'friendlyDeciderRecoveryProbe.snapshot?.roundIndex === 3',
  "friendlyCompleteProbe.snapshot?.winnerSourceSeat === 'A'",
  "!friendlyCompleteProbe.actionIds.includes('friendly_rematch')",
  'pvp-live-drill-scenario-v1',
  'pvp-live-practice-plan-v1',
  'pvp-live-fairness-receipt-v1',
  "postReviewPracticeProbe.drillScenario?.practicePlan?.reportVersion === 'pvp-live-practice-plan-v1'",
  "postReviewPracticeProbe.drillScenario?.practicePlan?.sourceVisibility === 'public_events'",
  'postReviewPracticeProbe.drillScenario?.practicePlan?.usesHiddenInformation === false',
  "postReviewPracticeProbe.drillScenario?.practicePlan?.rankedImpact === 'none'",
  'live UI post-match practice plan rejects unsafe source reports',
  'unsafePracticePlanProbe.unsafeScenario === null',
  'unsafePracticePlanProbe.missingMetadataScenario === null',
  '!/payload|hand|deck|cardId|instanceId|cardInstanceId|loadoutSnapshot|rawPayload|token/i.test(JSON.stringify(postReviewPracticeProbe.drillScenario?.practicePlan || {}))',
  "!Object.prototype.hasOwnProperty.call(practiceHintProbe.drillScenario || {}, 'practicePlan')",
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
  'live UI renders opening protection public event details',
  'live UI renders active opening safeguard report without hidden payloads',
  'live UI renders opening counterplay cue after protection',
  'live UI renders post-match fairness receipt from public experience checks',
  'live UI renders public duel momentum report without hidden payloads',
  'live UI renders active duel momentum opening window without hidden payloads',
  'live UI keeps duel momentum counterplay window readable after protection',
  'data-live-fairness-receipt',
  'fairnessReceipt',
  'pvp-live-duel-momentum-v1',
  'data-live-duel-momentum',
  'duelMomentumReport',
  'pvp-live-intent-signal-v1',
  'data-live-intent-signal',
  'intentSignalReport',
  'status_mitigated',
  'public_status_mitigated',
  'card_cycled',
  'public_card_cycle',
  'data-live-card-cycle',
  'data-live-card-preview',
  'live UI renders authoritative card preview before opening-window card click',
  'live UI mobile renders pre-click authoritative card preview without overflow',
  'automation_action',
  '超时托管',
  'live UI formats timeout automation event as low-impact public handoff',
  'guard_stance',
  'public_guard_stance',
  'data-live-guard-stance',
  'weak_focus',
  'public_weak_focus',
  'data-live-weak-focus',
  'hp_recovered',
  'public_hp_recovered',
  'data-live-hp-recovered',
  'live UI formats public heal event and receipt',
  'live UI formats public card cycle event and receipt',
  'live UI formats public weak focus event and receipt',
  'live UI mobile renders opening protection event without overflow',
  'pvp screen opens on live ranked entry by default on mobile',
  'data-live-mode-boundary',
  '不是真人排位',
  'live UI selects a baseline loadout before queue join',
  'live UI locks baseline loadout selector after queue join',
  'live UI submits opening-window card intent through live service only after confirmation',
  'live UI sends preset emote and can locally mute opponent emotes',
  'live UI persists local social mute preference without affecting ranked state',
  "mutedPersistProbe.payload?.preferenceScope === 'local_only'",
  "mutedPersistProbe.payload?.sourceVisibility === 'local_preference'",
  "mutedPersistProbe.payload?.rankedImpact === 'none'",
  'live UI realtime intent lock keeps double-click pending and manual refresh unlocks lost ack',
  'pvp-live-turn-timer-v1',
  'pvp-live-connection-v1',
  'data-live-turn-timer',
  '准备倒计时',
  '行动倒计时',
  '最后 10 秒，请确认行动',
  '对方重连宽限',
  'data-live-realtime-status',
  'data-live-realtime-state',
  '^传输：',
  '传输：实时通道已连接',
  "matchedProbe.payload?.realtimeStatus === 'connected'",
  "matchedProbe.payload?.realtimeReport?.connectionId === 'audit-live-ws-1'",
  'live UI renders opponent reconnect grace without confusing it with action timeout',
  'live UI local reconnect grace exposes resume guidance without confusing it with turn timeout',
  'live UI local disconnected state names authoritative sync path before timeout',
  'live UI explains active non-turn opponent disconnect without pre-announcing timeout settlement',
  'live UI explains active current-turn opponent disconnect as authoritative timeout pending',
  'live UI prefers server connection tempo over local online inference',
  'live UI blocks stale inputs when server connection tempo requires authoritative recovery',
  'pvp-live-connection-tempo-v1',
  'server_authoritative_connection_state',
  'connectionTempoReport',
  'data-live-connection-tempo-state',
  'data-live-connection-tempo-boundary',
  'data-live-connection-tempo-can-submit',
  "authoritativeSubmitBlockProbe.textTempo?.canSubmitIntent === false",
  'tempoDuplicateGlobalRefreshCount',
  'live UI foreground resume catches up reconnecting match without manual refresh',
  'live UI foreground resume preserves active turn window without terminal fallout',
  'live UI reopening live tab recovers the same active current match',
  'reopenCurrentMatchProbe',
  "reopenCurrentMatchProbe.payload?.matchId === reopenCurrentMatchProbe.beforePayload?.matchId",
  "reopenCurrentMatchProbe.payload?.currentSeat === reopenCurrentMatchProbe.beforePayload?.currentSeat",
  "reopenCurrentMatchProbe.payload?.turnTimer?.startedAt === reopenCurrentMatchProbe.beforePayload?.turnTimer?.startedAt",
  "reopenCurrentMatchProbe.payload?.turnTimer?.deadlineAt === reopenCurrentMatchProbe.beforePayload?.turnTimer?.deadlineAt",
  "reopenCurrentMatchProbe.payload?.postMatchReview == null",
  "!(reopenCurrentMatchProbe.payload?.lastEvents || []).some(event => ['connection_timeout', 'turn_timeout', 'match_finished'].includes(event.eventType))",
  "call.method === 'getCurrentMatch' && call.reopenLiveTab === true",
  "foregroundResumeProbe.beforePayload?.phase === 'active'",
  "foregroundResumeProbe.payload?.phase === 'active'",
  "foregroundResumeProbe.payload?.currentSeat === foregroundResumeProbe.beforePayload?.currentSeat",
  "foregroundResumeProbe.payload?.turnTimer?.startedAt === foregroundResumeProbe.beforePayload?.turnTimer?.startedAt",
  "foregroundResumeProbe.payload?.turnTimer?.deadlineAt === foregroundResumeProbe.beforePayload?.turnTimer?.deadlineAt",
  "foregroundResumeProbe.payload?.postMatchReview == null",
  "foregroundResumeProbe.payload?.lastEvents || []",
  "'connection_timeout', 'turn_timeout', 'match_finished'",
  "foregroundResumeProbe.realtimeState === 'connected'",
  "foregroundResumeProbe.payload?.realtimeStatus === 'connected'",
  "call.payload?.type === 'join_match'",
  "call.payload?.type === 'heartbeat'",
  'live UI renders connection_timeout as reconnect grace terminal review',
  '重连宽限结束',
  'connection_timeout',
  'live UI renders ranked opponent public profile without build reveal',
  'data-live-loadout-recommendation',
  'data-live-loadout-recommendation-action',
  'data-live-loadout-recommendation-locked',
  'resolveLivePostReviewLoadoutPreset',
  'recommendationVisibility',
  'live UI one-click applies post-match loadout recommendation without queueing',
  'live UI post-match loadout resolution carries apply receipt across next actions',
  'live UI post-match loadout resolution lets manual candidate override formal carryover while practice stays no-score',
  'live UI post-match actions submit manual formal loadout while practice keeps public recommendation',
  'live UI post-match loadout receipts do not mask queue or rematch failures',
  'live UI post-match practice drill follows public loadout recommendation over current preset',
  'live UI mobile renders post-match loadout recommendation card readably',
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

assert.ok(
  !/pvp-live-opening-safeguard-chip:nth-child\(2\)[^{]*\{[^}]*display:\s*none/i.test(pvpCss),
  'PVP CSS must not hide the mobile opening fairness budget chip',
);

[
  'buildLivePostReviewPracticePlan(',
  'getLiveLoadoutRecommendation(',
  'renderLiveLoadoutRecommendation(',
  'applyLivePostReviewLoadoutRecommendation(',
  'pvp-live-loadout-recommendation-v1',
  'hasUnsafeLivePostReviewPracticeSource(',
  'isExplicitLivePublicNoImpactReport(',
  'Object.prototype.hasOwnProperty.call(source, \'sourceVisibility\')',
  'pvp-live-practice-plan-v1',
  'pvp-live-social-preferences-v1',
  'pvp-live-duel-momentum-v1',
  'getLiveDuelMomentumReport(',
  'renderLiveDuelMomentumReport(',
  'pvp-live-intent-signal-v1',
  'getLiveIntentSignalReport(',
  'renderLiveIntentSignalReport(',
  'getLiveSocialPreferenceStorageKey(',
  'loadLiveSocialPreferences(',
  'saveLiveSocialPreferences(',
  'ensureLiveSocialPreferencesLoaded(',
  'sourceVisibility: \'local_preference\'',
  'persistence: \'local_storage\'',
  'sourceVisibility: \'public_events\'',
  'usesHiddenInformation: false',
  'rankedImpact: \'none\'',
  'setHidden(\'cancel-rematch\'',
  'tempoScript',
  'fairnessFocus',
].forEach((needle) => {
  assert.ok(
    pvpSceneSource.includes(needle),
    `PVPScene should pin post-match practice plan marker: ${needle}`,
  );
});

[
  'normalizePracticePlan',
  'hasPracticePlan',
  'if (hasPracticePlan && !practicePlan) return null;',
  'pvp-live-practice-plan-v1',
  'pvp-live-practice-return-v1',
  '节奏脚本',
  '体验复查',
  'data-pvp-live-practice-return',
  'open-pvp-live-practice-return',
  'practicePlan: clone(practicePlan)',
].forEach((needle) => {
  assert.ok(
    challengeHub.includes(needle),
    `challenge hub should pin PVP live practice plan marker: ${needle}`,
  );
});

[
  "reportVersion: 'pvp-live-practice-plan-v1'",
  "sourceVisibility: 'public_events'",
  'tempoScript',
  'fairnessFocus',
  'pending PVP drill should carry a structured practice plan',
  'beginPvpLiveDrillScenario must reject invalid supplied practice plans',
  'PVP drill archive insight should surface the tempo script',
  'practiceOnly finalize should expose a PVP return receipt',
  'PVP practice return action should navigate back to live PVP',
].forEach((needle) => {
  assert.ok(
    observatoryArchiveChecks.includes(needle),
    `observatory archive sanity should pin PVP live practice plan marker: ${needle}`,
  );
});

[
  'real browser user A joins live queue with locked loadout',
  'real browser user A selects live loadout preset through UI',
  'real browser repeated join cannot overwrite locked loadout hash',
  'real browser user B selects live loadout preset through UI',
  'real browser user B joins and receives matched setup state',
  'real browser both seats agree on match id while ranked opponent build stays hidden',
  'real browser live match exposes public match quality report',
  'connection_health_gate',
  'real browser live match renders authoritative setup countdown',
  'real browser live match exposes authoritative connection report',
  'real browser opponent connection report stays readable without ending setup',
  'real browser opponent heartbeat recovers reconnect grace to online',
  'real browser local reconnect grace shows resume guidance before timeout',
  'real browser foreground resume recovers local reconnect grace to online',
  'real browser live match exposes and renders first-match guide report',
  'real browser render_game_to_text exposes first-match guide report',
  'real browser live match updates first-match guide after setup',
  'real browser state exposes snapshot_locked without leaking opponent hidden data',
  'real browser setup ready flow reaches active on both seats',
  'real browser setup match survives full page refresh before both seats ready',
  'setupReloadBefore',
  'setupReloadProbe',
  "setupReloadProbe.payload?.phase === 'setup'",
  "setupReloadProbe.payload?.matchId === setupReloadBefore.matchId",
  "setupReloadProbe.payload?.seatId === setupReloadBefore.seatId",
  "setupReloadProbe.payload?.turnTimer?.deadlineAt === setupReloadBefore.turnTimer?.deadlineAt",
  "setupReloadProbe.payload?.opponent?.ready === true",
  "setupReloadProbe.payload?.self?.ready === false",
  "setupReloadProbe.payload?.postMatchReview == null",
  'real browser active match survives full page refresh through current match recovery',
  'activeReloadBefore',
  'activeReloadProbe',
  "reloadProbe.payload?.phase === 'active'",
  "reloadProbe.payload?.matchId === activeReloadBefore.matchId",
  "reloadProbe.payload?.currentSeat === activeReloadBefore.currentSeat",
  "reloadProbe.payload?.turnTimer?.startedAt === activeReloadBefore.turnTimer?.startedAt",
  "reloadProbe.payload?.turnTimer?.deadlineAt === activeReloadBefore.turnTimer?.deadlineAt",
  "reloadProbe.payload?.postMatchReview == null",
  'real browser creates targeted live invite through backend without entering public queue',
  'real browser targeted invite recipient sees backend inbox without manual code',
  'real browser targeted invite recipient joins backend friendly setup from inbox',
  'realInviteCreateProbe.snapshot?.inviteReport?.reportVersion === \'pvp-live-invite-v1\'',
  'realInviteInboxProbe.snapshot?.inviteInbox?.length === 1',
  'realInviteJoinProbe.snapshot?.matchQuality?.expansionStage === \'friend_invite\'',
  'realInviteJoinProbe.snapshot?.inviteInbox?.length === 0',
  'real browser host recovers targeted invite after reopening live panel',
  'real browser already-open invite recipient receives backend inbox through idle polling',
  'real browser invite recipient sees backend inbox through idle panel refresh',
  'real browser recipient joins refreshed inbox invite into friendly setup',
  'realInviteResumeProbe.snapshot?.phase === \'waiting_invite\'',
  'realInviteResumeProbe.cancelActionable === true',
  'realInviteIdlePollProbe.snapshot?.inviteInbox?.length === 1',
  'realInviteIdlePollProbe.openedBeforeInvite === true',
  'realInvitePassiveInboxProbe.snapshot?.inviteInbox?.length === 1',
  'realInvitePassiveJoinProbe.snapshot?.matchQuality?.expansionStage === \'friend_invite\'',
  'real browser host cancels recovered targeted invite without entering public queue',
  'real browser recipient clears cancelled backend invite through idle polling',
  'realInviteCancelProbe.snapshot?.lastError?.reason === \'invite_cancelled\'',
  'realInviteCancelledInboxProbe.snapshot?.inviteInbox?.length === 0',
  'real browser exposes server-authoritative opener assignment without queue or host binding',
  'real browser mirrors opener assignment on the second seat without queue or host binding',
  'activeFirstSeat',
  'activeSecondSeat',
  'secondSeatClient.page',
  'real browser live match renders authoritative active action countdown',
  'real browser active non-turn opponent disconnect keeps current actor actionable',
  "data: { heartbeatElapsedMs",
  "tempoState === 'opponent_non_turn_disconnected'",
  '当前行动仍可提交',
  '!/connection_timeout|turn_timeout/.test(`${activeNonTurnDisconnectProbe.connectionText} ${activeNonTurnDisconnectProbe.connectionTempo}`)',
  'real browser test-mode match can enter protected lethal opening state',
  "data: { hp: 10, heartbeatElapsedMs: 0",
  'TEST_MATCH_SCOPE',
  'testMatchScope: window.__DEFIER_PVP_REAL_TEST_SCOPE',
  "event.eventType === 'test_state_forced'",
  'real browser live match previews protected lethal opening without hidden opponent payloads',
  'real browser non-acting seat receives no playable action preview payload',
  'real browser live match renders active duel momentum report',
  'real browser opening-window end turn confirmation blocks authoritative submit until second click',
  'real browser opening-window card confirmation blocks authoritative submit until second click',
  'real browser opponent sees authoritative action receipt after accepted card',
  'real browser end turn renders authoritative handoff receipt',
  'real browser accepted card intent keeps public duel momentum readable without refresh',
  'real browser persists local social mute without ranked impact',
  "realSocialMutedProbe.payload?.preferenceScope === 'local_only'",
  "realSocialMutedProbe.payload?.sourceVisibility === 'local_preference'",
  "realSocialMutedProbe.payload?.rankedImpact === 'none'",
  "realSocialMutedProbe.textPayload?.rankedImpact === 'none'",
  'real browser accepted card intent auto-pushes opponent state without manual refresh',
  'waitForLiveSnapshot(secondSeatClient.page, previousVersion',
  'waitForLiveSnapshot(secondSeatClient.page, ({ expectedSeat, expectedVersion })',
  'real browser end turn switches authoritative action countdown to opponent',
  'real browser protected defender can spend the +8 counterplay window on a real action',
  "protectedCounterplayActionProbe.after?.actionReceiptReport?.actionType === 'play_card'",
  'real browser protected defender ends the match with a real lethal card after counterplay',
  'real browser surrender confirmation blocks terminal submit until second click',
  'real browser live match renders public post-match review after real lethal',
  'real browser live match renders fairness receipt from public post-match checks',
  'real browser live match renders experience report from public post-match events',
  'real browser experience check focuses linked public evidence without hidden payloads',
  'real browser post-match loadout resolution keeps manual formal candidate while practice uses public recommendation',
  'postMatchParity',
  'real browser post-match review actions focus events, unlock loadout, and create replay-only no-score drill handoff',
  'real browser post-match friendly rematch waits for same opponent without formal settlement',
  'real browser waiting friendly rematch survives full page refresh before opponent accepts',
  'waitingRematchReloadProbe',
  "waitingRematchReloadProbe.snapshot?.phase === 'waiting_rematch'",
  "waitingRematchReloadProbe.snapshot?.friendlySeries?.rankedImpact === 'none'",
  'waitingRematchReloadProbe.cancelVisible === true',
  'waitingRematchReloadProbe.actions?.queue_again === true',
  'real browser waiting friendly rematch requester can cancel and restore finished review',
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
  'BROWSER_PVP_LIVE_REAL_VIEWPORT',
  'BROWSER_PVP_LIVE_REAL_REQUIRE_MOBILE',
  'assertMobileActionable',
  'clickLiveControl',
  'page.touchscreen.tap',
  'tapPoint',
  'isMobile: true',
  'hasTouch: true',
  'mobileRealLayoutProbe',
  'real mobile browser live post-match settlement and honor collection stay readable and tappable',
  'real mobile browser setup ready uses touch-tap controls before active phase',
  'real mobile browser protected counterplay battle controls use touch-tap chain',
  'seatAReadyTouchActionable',
  'seatBReadyTouchActionable',
  'openingEndTurnTouchActionable',
  'openingCardConfirmTouchActionable',
  'acceptedCardTouchActionable',
  'endTurnAfterPlayTouchActionable',
  'protectedCounterplayFirstTouchActionable',
  'protectedCounterplaySecondTouchActionable',
  'surrenderTouchActionable',
  'data-live-fairness-receipt',
  'horizontallyInside?.fairness === true',
  'fairnessText',
  'noVerticalClip',
  'textBlocksDoNotOverflow',
  'elementFromPoint',
  'data-live-post-review-action',
  'window.innerWidth',
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
  'crypto.randomBytes(16).toString(\'hex\')',
  'normalizeLivePvpTestOpenerSeed',
  'pvp-live-test-opener-v1',
  'safeTestOpenerSeed || crypto.randomBytes(16).toString(\'hex\')',
  'pvp-live-opener-v1',
  'server_seeded_fair_opener',
  'friendly_series_rotating_opener',
  'queueOrderBinding: false',
  'hostBinding: false',
].forEach((needle) => {
  assert.ok(
    openerAssignmentSource.includes(needle),
    `live PVP opener assignment should pin public-seed source marker: ${needle}`,
  );
});
[
  'testOpenerSeed: isLivePvpTestModeEnabled() ? req.body && req.body.testOpenerSeed : \'\'',
].forEach((needle) => {
  assert.ok(
    pvpLiveRoute.includes(needle),
    `live PVP route should keep test opener seed test-mode gated: ${needle}`,
  );
});
[
  'expectedTestOpenerAssignment',
  'route-opener-seed-a',
  'route-opener-seed-b',
  'ranked opener anti-bias deterministic seed should set expected first seat',
  'ranked opener anti-bias deterministic seeds should cover both first seats with the same queue order',
  'ranked opener anti-bias must not expose raw test seed',
  'ranked opener anti-bias must not bind first seat to queue order',
  'ranked opener anti-bias must not bind first seat to host identity',
].forEach((needle) => {
  assert.ok(
    pvpLiveRouteChecks.includes(needle),
    `live PVP route checks should pin ranked opener anti-bias marker: ${needle}`,
  );
});
[
  'openerPolicy',
  'openingFirstSourceSeat',
  'roundFirstSourceSeat',
  'alternating_opener',
].forEach((needle) => {
  assert.ok(
    friendlySeriesSource.includes(needle),
    `live PVP friendly series should pin alternating opener marker: ${needle}`,
  );
});
[
  'protectionReason',
  'releaseMode',
  'releaseAt',
  'releaseInMs',
  'requiresPoolSize',
  'candidatePoolSize',
  'currentEligibleActions',
  'need_third_player',
  'long_wait_release',
].forEach((needle) => {
  assert.ok(
    waitingReportSource.includes(needle),
    `live PVP waiting report should pin structured low-sample marker: ${needle}`,
  );
});
[
  'playerA.userId',
  'playerB.userId',
  'loadoutSnapshot',
  'rating',
  'elo',
].forEach((needle) => {
  assert.ok(
    !openerAssignmentSource.includes(needle),
    `live PVP opener assignment seed source must not depend on hidden/private marker: ${needle}`,
  );
});

[
  'challenge hub browser renders PVP live practice-return card with no-score boundary',
  'challenge hub practice-return CTA opens the live PVP tab without auto-queueing',
  'data-pvp-live-practice-return',
  'data-pvp-live-practice-return-action="true"',
  'pvp-live-practice-return-v1',
  '正式积分不变',
  "window.PVPScene?.activeTab || ''",
].forEach((needle) => {
  assert.ok(
    browserChallengeAudit.includes(needle),
    `challenge browser audit should pin PVP practice-return marker: ${needle}`,
  );
});

[
  'seat A should start with a server-locked loadout snapshot',
  'self view should expose own locked loadout hash',
  'ranked opponent view must not expose locked loadout hash',
  'ranked opponent view should expose a coarse public profile',
  'raw snapshot_locked event must not carry either player loadout identity',
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
  'post-match review should expose an audit-to-UI action bridge',
  'every post-match next action should expose its audit action id',
  'post-game action bridge should map key_turn_replay to the real key-turn UI action',
  'post-game action bridge should map loadout recommendation to the real adjust-loadout UI action',
  'state view should expose public match quality tag',
  'state view should expose active opening safeguard report',
  'opening safeguard report should expose current first-action budget',
  'opening safeguard report should expose public second-seat buffer',
  'createInitialLiveState should accept authoritative firstSeat B without test-only mutation',
  'state view should expose public duel momentum report',
  'duel momentum report should come from public state',
  'duel momentum report must not use hidden information',
  'duel momentum report should not write ranked result',
  'active duel momentum should identify opening window at battle start',
  'protected defender should see an explicit reversal window',
  'protected defender duel momentum should expose granted counterplay safeguard',
  'second seat should start active combat with public opening buffer block',
  'battle start should emit public second-seat buffer event',
  'draw-tag card should spend its normal card cost',
  'public card draw event should expose only public count fields',
  'card draw receipt must not leak drawn card identity, effect tags, or ranked/reward data',
  'paid guard card should emit public guard_stance setup evidence',
  'guard stance should emit public damage reduction evidence',
  'guard stance should reduce only post-block life damage by two',
  'guard stance should be consumed after reducing incoming life damage',
  'innerPeace should expose a small public self-heal amount',
  'paid heal card should emit public hp_recovered evidence',
  'public heal event should expose only public hp fields',
  'transfuseStrike should not self-heal in the first public heal slice',
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
  'emote should advance public state version for persistence without starting combat',
  'emote should be rate limited without changing combat state',
  'live PVP should reject non-whitelisted emotes',
].forEach((needle) => {
  assert.ok(
    pvpLiveEngineChecks.includes(needle),
    `live PVP engine sanity should pin snapshot lock marker: ${needle}`,
  );
});

[
  ['state-view', pvpLiveStateView],
  ['replay', pvpLiveReplaySource],
  ['live-ws', pvpLiveWsSource],
  ['persistence', pvpLivePersistence],
  ['golden-replay-runner', pvpLiveGoldenReplayRunner],
].forEach(([label, source]) => {
  assert.ok(
    source.includes("card_cycled: ['seatId', 'count', 'handCount', 'deckCount', 'capped']"),
    `live PVP ${label} public event whitelist should expose only public card cycle counts`,
  );
  assert.ok(
    !source.includes("card_cycled: ['seatId', 'count', 'handCount', 'deckCount', 'capped', 'effect']"),
    `live PVP ${label} public event whitelist must not expose card cycle effect tags`,
  );
  assert.ok(
    source.includes("hp_recovered: ['seatId', 'recoveredHp', 'hp', 'maxHp', 'capped']"),
    `live PVP ${label} public event whitelist should expose only public hp recovery fields`,
  );
  assert.ok(
    !source.includes("hp_recovered: ['seatId', 'recoveredHp', 'hp', 'maxHp', 'capped', 'sourceCardId']"),
    `live PVP ${label} public event whitelist must not expose heal source card ids`,
  );
  assert.ok(
    source.includes("status_mitigated: ['statusId', 'label', 'seatId', 'sourceSeat', 'mitigatedBySeat', 'mitigatedTurnIndex', 'responseWindow', 'mitigation', 'preventedDamage']"),
    `live PVP ${label} public status mitigation whitelist should expose public prevented damage`,
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
  'quick gate should expose a live PVP entertainment audit report',
  'entertainment audit stompRate should stay below the live PVP ceiling',
  'entertainment audit closeGameRate should prove enough late-game suspense',
  'entertainment audit should prove mid-game lead or threat shifts',
  'entertainment audit should cover every observed common finish reason with next actions',
  'entertainment audit should include at least one observed finish reason next-action row',
  'entertainment audit should prove deck-edit follow-through is instrumented through recommendation and practice actions',
  'entertainment audit should track rematch intent as observation-only without manipulating matchmaking',
  'entertainment audit should expose a post-game audit-to-UI action bridge',
  'post-game action bridge should map key_turn_replay to the real review_key_turns UI button',
  'every entertainment audit post-game action should be covered by the audit-to-UI action bridge',
  'post-game action coverage should include the implemented dispute report handoff',
  'post-game action coverage should include the implemented avoid-opponent handoff',
  'post-game action bridge should map report_issue to the real dispute report UI button',
  'post-game action bridge should map avoid_opponent to the real avoid-opponent UI button',
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
  'artifact quick report should include the live PVP entertainment audit report',
  'artifact entertainment audit stompRate should stay below the live PVP ceiling',
  'artifact entertainment audit closeGameRate should preserve enough late-game suspense',
  'artifact entertainment audit should preserve enough lead or threat shifts',
  'artifact entertainment audit should cover observed finish reasons with post-game next actions',
  'artifact entertainment audit should include observed finish reason next-action rows',
  'artifact entertainment audit should include the post-game audit-to-UI action bridge',
  'artifact action bridge should map key_turn_replay to the real review_key_turns UI button',
  'artifact action bridge should include the real dispute report handoff',
  'artifact action bridge should include the real avoid-opponent handoff',
  'artifact post-game action coverage should include report_issue',
  'artifact post-game action coverage should include avoid_opponent',
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
  'S2-C full gate should include the live PVP entertainment audit report',
  'S2-C full gate entertainment audit stompRate should stay below the live PVP ceiling',
  'S2-C full gate entertainment audit should preserve enough late-game suspense',
  'S2-C full gate entertainment audit should preserve enough lead or threat shifts',
  'S2-C full gate entertainment audit should cover observed finish reasons with post-game next actions',
  'S2-C full gate entertainment audit should include observed finish reason next-action rows',
  'S2-C full gate entertainment audit should include the post-game audit-to-UI action bridge',
  'S2-C full gate action bridge should map key_turn_replay to the real review_key_turns UI button',
  'S2-C full gate action bridge should include the real dispute report handoff',
  'S2-C full gate action bridge should include the real avoid-opponent handoff',
  'S2-C full gate post-game action coverage should include report_issue',
  'S2-C full gate post-game action coverage should include avoid_opponent',
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
  "connection_timeout: ['seatId', 'disconnectedSeats', 'phase', 'elapsedMs']",
  "ready_timeout: ['unreadySeats', 'readyDeadlineAt', 'elapsedMs']",
  'Array.isArray(value)',
].forEach((needle) => {
  assert.ok(
    pvpLiveGoldenReplayRunner.includes(needle),
    `live PVP golden replay runner should pin S4A turnTiming timeout marker: ${needle}`,
  );
});

[
  'active match should not expose post-match replay',
  'active replay rejection should be stable',
  'active match should not create public replay share',
  'active replay share rejection should be stable',
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
  'participant should create a public replay share after terminal match',
  'share receipt should not expose raw match id',
  'public replay share token should be readable without participant auth',
  'shared replay response should not expose raw match id',
  'raw match id should not work as a public replay share token',
  'non-participant should not create public replay share',
  'non-participant should not revoke public replay share',
  'participant should create a second public replay share token',
  'repeated replay share creation should mint a distinct opaque token',
  'share creator should revoke public replay share',
  'revoked replay share token should no longer expose replay',
  'revoke should invalidate every active public replay share token for the match',
  'partial persisted event source should fall back to complete state events',
  'terminal replay should reject incomplete persisted events when state events are also incomplete',
  'public replay should preserve public disconnected seat arrays',
  'public replay should preserve public ready-timeout seat arrays',
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
  "connection_timeout: ['seatId', 'disconnectedSeats', 'phase', 'elapsedMs']",
  "ready_timeout: ['unreadySeats', 'readyDeadlineAt', 'elapsedMs']",
  'Array.isArray(value)',
].forEach((needle) => {
  assert.ok(
    pvpLiveReplaySource.includes(needle),
    `live PVP replay source should pin partial event stream fallback marker: ${needle}`,
  );
});

[
  "router.post('/matches/:matchId/replay-share'",
  "router.get('/replay-shares/:shareToken'",
  "router.post('/matches/:matchId/replay-share/revoke'",
  'makeReplayShareToken',
  'makeReplayShareEnvelope',
  'makeReplayShareApiPath',
  'apiPath',
  '?pvpReplayShare=',
  'replay_share_not_ready',
  'replay_share_not_found',
  'replay_share_revoked',
  'rankedImpact: \'none\'',
  'rewardImpact: \'none\'',
  "visibilityLayer: 'replay_public'",
].forEach((needle) => {
  assert.ok(
    pvpLiveRoute.includes(needle),
    `live PVP route should pin public replay share marker: ${needle}`,
  );
});

[
  'attachLivePvpWebSocket',
  'makeEventReplay',
  'PUBLIC_EVENT_DATA_KEYS',
  "type: 'connected'",
  "type: 'state_sync'",
  "type: 'events_replay'",
  "connection_timeout: ['seatId', 'disconnectedSeats', 'phase', 'elapsedMs']",
  "ready_timeout: ['unreadySeats', 'readyDeadlineAt', 'elapsedMs']",
  'Array.isArray(value)',
  "type: 'presence'",
  "type: 'intent_result'",
  "message.type === 'join_match'",
  "message.type === 'heartbeat'",
  "message.type === 'intent'",
  "Object.prototype.hasOwnProperty.call(message || {}, 'lastSeenRevision')",
  'await sendEventsReplay(client, matchAccess, message.lastSeenRevision)',
  'livePvpStore.recordHeartbeat',
  'livePvpStore.submitIntent',
  'const shouldFanoutState = result.result === \'accepted\'',
  "|| (result.result === 'duplicate' && result.reason === 'duplicate_action' && result.stateView)",
  "result.result === 'duplicate' ? 'duplicate_action' : 'intent_accepted'",
  'liveWsSignalStore',
  'startLiveWsSignalPolling',
  'loadLiveWsSignalsSince',
  'getLiveWsLatestSignalId',
  'signalDedupWindowMs',
  'shouldSkipDuplicateSignal',
  'markClientSignalSeen',
  'snapshotLiveWsSignalCursor',
  'syncClientSignalCursor',
  'broadcastStateForSignal',
  'client.liveWsSignalCursor',
  'appendLiveWsSignal(matchId, result',
  'sourceInstanceId: instanceId',
  'liveWsSourceInstanceId: instanceId',
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
  'WS heartbeat replay should still return presence before replay',
  'WS heartbeat should replay missed public events after lastSeenRevision',
  'WS heartbeat replay should only include missed public events',
  'WS public replay should preserve public disconnected seat arrays',
  'WS public replay should preserve public ready-timeout seat arrays',
  'legacy WS heartbeat without lastSeenRevision should not request events replay',
  'WS intent should return accepted intent_result',
  'WS accepted intent should push state_sync to the opponent seat',
  'WS sync_required intent should report sync_required to the sender',
  'WS sync_required intent should also refresh the sender with authoritative state_sync',
  'WS sync_required sender state_sync should match intent_result authoritative turn',
  'WS sync_required intent should broadcast authoritative sync to the opponent seat',
  'WS duplicate intent should report duplicate to the sender',
  'WS duplicate intent should preserve the idempotent duplicate reason',
  'WS duplicate intent should also refresh the sender with authoritative state_sync',
  'WS duplicate intent should broadcast authoritative sync to the opponent seat',
  'WS duplicate fanout should throttle repeated same-version signals',
  'cross-process heartbeat should catch up opponent state from authoritative store',
  'cross-process heartbeat catch-up should keep the remote seat scope',
  'cross-process state advance should happen on process A',
  'passive cross-process fanout should not rely on opponent heartbeat',
  'passive cross-process fanout should keep the remote seat scope',
  'passive cross-process fanout should read the remote authoritative state',
  'passive cross-process remote state_sync B',
  'passive cross-process accepted save should receive the origin WS instance id',
  'passive cross-process origin should not echo its own persisted signal',
  'WS sync_required fanout should throttle repeated same-version signals',
  'join_match cursor baseline should not skip a signal created during join',
  'makeSharedLiveWsSignalStore',
  'attachLivePvpWebSocket(serverA, { livePvpStore: makeStore',
].forEach((needle) => {
  assert.ok(
    pvpLiveWsChecks.includes(needle),
    `live PVP WS sanity should pin S6A realtime behavior marker: ${needle}`,
  );
});

[
  'shared DEFIER_DB_PATH first backend process should persist waiting player',
  'shared DEFIER_DB_PATH second backend process should create a shared live match',
  'shared DEFIER_DB_PATH should let two backend processes observe the same live match',
  'different backend process should not need local submitIntent to observe state advance',
  'remote process socket should receive authoritative state_sync after opponent intent',
  'cross-process proactive WS fanout should not require heartbeat catch-up',
  'origin process should not echo its own SQLite state_sync signal',
  'second backend process should be able to start the shared live battle',
  'cross-process duplicate replay should keep reducer duplicate reason',
  'cross-process duplicate fanout should refresh the remote opponent seat scope',
  'cross-process duplicate replay should write one durable duplicate_action signal',
  'second-process duplicate replay should keep reducer duplicate reason',
  'cross-process duplicate fanout should throttle repeated same-version duplicate_action signals across backend processes',
  'cross-process terminal fanout should keep remote winner seat scope',
  'remote terminal fanout should deliver winner post-match review without heartbeat',
  'remote terminal fanout should include official ranked settlement projection',
  'cross-process terminal heartbeat replay should include player_surrendered',
  'cross-process terminal heartbeat replay should include match_finished',
  'PVP_LIVE_WS_SIGNAL_POLL_INTERVAL_MS',
  'DEFIER_DB_PATH',
].forEach((needle) => {
  assert.ok(
    pvpLiveCrossProcessWsFanoutChecks.includes(needle),
    `live PVP cross-process WS fanout sanity should pin SQLite-backed fanout marker: ${needle}`,
  );
});

[
  'process A waiting player should recover the cross-process match from persistence instead of receiving 404/waiting',
  'stateless process should recover the cross-process match even after the queue row was consumed',
  'stateless process should consume the recovered queue ticket after the first matched poll',
  'stateless process should not recover a match for a queue ticket that never belonged to the player',
  'queue ticket should still hand off once after current-match recovery clears local waiting state',
  'stateless process should use the persisted handoff even when queue-row deletion lags behind match creation',
  'stale local queue candidate should not create a duplicate match after atomic claim fails',
  'stale local queue candidate should not reuse the consumed opponent ticket for a second match',
  'pair claim hook should interleave the third process before match creation',
  'existing waiting ticket should be claimed atomically before match creation',
  'existing waiting ticket should not appear in two live matches after pair claim',
  'recent opponent should not be rematched immediately after a finished match',
  'recent opponent suppression should survive process boundaries through persistence',
  'avoid-opponent should return a stable receipt',
  'avoided opponent should not be immediately rematched while the preference is active',
  'avoid-opponent waiting report should expose the player_avoid_opponent safeguard',
  'a third player should still release the avoided-opponent waiting pool',
  'two-player low-sample open pool should wait instead of instantly starting a fragile first match',
  'third low-sample open-pool player should release the low-sample pool into a real match',
  'low-sample requester should be the requester side of the resolved match',
  'low-sample resolved ranked opponent view',
  'low_sample_pairing',
  'saveRecentOpponentPair(pair)',
  'loadRecentOpponentPair(userIdA, userIdB)',
  'recent_opponent_suppression',
  'saveAvoidedOpponentPair(pair)',
  'loadAvoidedOpponentPair(userIdA, userIdB)',
  'player_avoid_opponent',
  'process B second player should create a shared live match',
  'cross-process match handoff should consume both public queue tickets',
  'claimQueueEntry(queueTicket, userId)',
  'claimQueueEntries(queueClaims)',
  'saveQueueHandoff(handoff)',
  'loadQueueHandoff(queueTicket, userId)',
  'loadActiveMatchForUser(userId)',
].forEach((needle) => {
  assert.ok(
    pvpLiveCrossProcessQueueChecks.includes(needle),
    `live PVP cross-process queue sanity should pin shared queue handoff marker: ${needle}`,
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
  'rated requester closest-candidate opponent view',
  'near-rated candidate should be the consumed matched ticket',
  'matched view should expose near rating delta bucket',
  'matched view should expose strict rating expansion stage',
  'matched quality should explain closest rating safeguard',
  'matched quality should not expose exact player ratings',
  'far-rated first queue player should remain waiting after closer match is selected',
  'long-wait wide rating gap should not auto-match without explicit acceptance',
  'one-sided wide rating consent should not match without the waiting player consent',
  'two-sided wide rating consent should allow an explicit wide match',
  'accepted wide match should expose wide_but_accepted quality tag',
  'accepted wide match should expose accepted 200-399 stage',
  'accepted wide match should explain explicit two-sided consent',
  'accepted wide match should keep explicit consent safeguard',
  'accepted wide match quality should not expose exact player ratings',
  'later wide consent requester should also wait before either player confirms',
  'first later wide consent should only update consent and preserve waiting',
  'second later wide consent should immediately match two existing waiting players',
  'later accepted wide match should explain explicit two-sided consent',
  'matched ranked opponent view',
  'must not expose opponent loadout hash',
  'matched view should expose match quality report version',
  'matched view should bucket rating delta instead of exposing exact hidden rating',
  'high-risk connection should not enter ranked live queue',
  'mixed measured/no-probe pair must not overstate connection health as passed',
  'matched view should expose passed connection health instead of not_measured',
  'matched view should record connection health gate safeguard',
  'matched view should expose first-match guide report version',
  'should expose turn timer report version',
  'should expose connection report version',
  'heartbeat route should accept a participant heartbeat',
  'participant should be able to submit a preset emote',
  'preset emote should advance public state version without starting combat',
  'opponent should see preset emote in public event feed',
  'repeat emote should be rate limited',
  'non-whitelisted emote should be rejected',
  'stale opponent should enter reconnect grace instead of immediate loss',
  'stale participant should be able to reconnect with heartbeat',
  'timer phase',
  'accepted play_card should keep current turn timer start',
  'accepted play_card should not extend current turn deadline',
  'route draw-tag card should resolve as a normal paid play_card intent',
  'HTTP card_cycled event should expose only public draw count fields',
  'HTTP card_cycled event must not return raw reducer payload',
  'HTTP card_cycled event must not leak internal card identity, effect tags, hand, deck, rating, or rewards',
  'route guard card should resolve as a normal paid play_card intent',
  'HTTP guard_stance event should expose only public status fields',
  'HTTP guard_stance event must not return raw reducer payload',
  'HTTP guard_stance event must not leak internal card identity, hand, deck, rating, or rewards',
  'route soft-control card should resolve as a normal paid play_card intent',
  'HTTP weak_focus event should expose only public status fields',
  'HTTP weak_focus event must not return raw reducer payload',
  'HTTP weak_focus event must not leak internal card identity, hand, deck, rating, or rewards',
  'route heal card should resolve as a normal paid play_card intent',
  'HTTP hp_recovered event should expose only public hp fields',
  'HTTP hp_recovered event must not return raw reducer payload',
  'HTTP hp_recovered event must not leak internal card identity, hand, deck, rating, or rewards',
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
  'live PVP test-only state route should stay unavailable outside DEFIER_PVP_TEST_MODE',
  'live PVP test-only state route should stay unavailable in production even when test mode is set',
  'live PVP test-only state route should reject scoped test matches without matching testMatchScope',
  'live PVP test-only state route should allow authenticated participants in DEFIER_PVP_TEST_MODE',
  'live PVP test-only state route should return the updated public opponent hp',
  'live PVP test-only state route should expose a public scoped setup event',
  'live PVP test-only state route should support protected defender follow-up setup',
  'live PVP test-only state route should return lowered opponent hp for protected defender',
  'opening protected defender should receive counterplay buffer on first turn',
  'opening protected defender should expose public counterplay buffer event',
  'opening protected defender should read own counterplay block through route state view',
  'normal lethal after opponent turn should finish',
  'live surrender should expose post-match review version',
  'surrender review should include friendly rematch next action',
  'winner should be able to request a friendly rematch from the finished live match',
  'friendly rematch requester should be able to read pending rematch status',
  'non-requesting opponent should not cancel a pending friendly rematch by surprise',
  'friendly rematch requester should be able to cancel pending rematch',
  'cancelled friendly rematch should expose stable reason',
  'cancelled friendly rematch should no longer expose a pending status',
  'fresh rematch after cancellation should wait instead of matching stale cancelled request',
  'second friendly rematch request should create a new live match',
  'friendly rematch state view should mark low-pressure friendly mode',
  'friendly rematch match should expose Bo3 target wins',
  'friendly rematch match should carry source score into Bo3',
  'friendly rematch requester should recover accepted rematch through current match',
  'accepted friendly rematch should become the current live match instead of opening a parallel queue',
  'friendly Bo3 round 2 should update tied source score',
  'tied Bo3 should allow a decider rematch',
  'Bo3 decider should keep the original series id',
  'Bo3 decider should keep the original series created time for display',
  'fresh Bo3 decider pending should not expire just because the series is old',
  'fresh Bo3 decider pending should remain readable while waiting for opponent',
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
  'live PVP test-only state route should support scoped heartbeat elapsed injection',
  'active non-turn heartbeat elapsed injection should not steal the current action window',
  'active non-turn heartbeat elapsed injection should mark the public opponent disconnected for the actor',
  'current actor should still submit end_turn while non-current opponent is disconnected',
  'disconnected seat should only lose after becoming the action owner',
  'handoff connection timeout should award the previous active seat only after authority passes',
  'live PVP test-only state route should restore forced connection status before follow-up combat checks',
  'non-current disconnected seat should not auto-finish before becoming the action owner',
  'current actor heartbeat inside reconnect grace should keep match active',
  'current actor heartbeat should not extend original turn deadline',
  'observer should recover opponent reconnect grace match through current endpoint',
  'observer current reconnect recovery should stay active during opponent grace',
  'observer current reconnect recovery should keep inactive submits blocked',
  'observer current reconnect recovery should preserve original turn timer start',
  'observer current reconnect recovery should not expose terminal review during active grace',
  'observer current reconnect recovery must not leak opponent hand',
  'current actor should recover active reconnect grace match through current endpoint',
  'current reconnect recovery should preserve actor seat',
  'current reconnect recovery should stay active during reconnect grace',
  'current reconnect recovery should keep stale submits blocked',
  'current reconnect recovery should preserve original turn timer start',
  'current reconnect recovery should preserve original turn deadline',
  'current reconnect recovery should not expose terminal review during active grace',
  'current reconnect recovery should not expose terminal timeout events',
  'current reconnect recovery must not leak opponent hand',
  'opponent view after reconnect should not contain terminal timeout events',
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
  'normal lethal loser review should expose a loadout recommendation report',
  'loadout recommendation should be based on public replay and public content only',
  'loadout recommendation must not use hidden information',
  'timed-out live match should release player for a new queue',
  'round14 draw route should emit match_finished round14_draw',
  'round14 draw route should expose draw review',
  'round14 draw route should not invent a loser',
  'round14 draw other seat should also receive draw review',
  'round14 draw should release player for a fresh queue',
  'round14 score route should emit match_finished round14_score',
  'round14 score winner should receive win review',
  'finished review should expose a real avoid-opponent action',
  'post-game action bridge should map avoid_opponent to the avoid-opponent UI action',
  'finished live match should accept an avoid-opponent preference',
  'avoid-opponent should return a stable receipt contract',
  'avoid-opponent receipt should expose the future matchmaking safeguard',
  'avoid-opponent preference should persist the opponent user',
  'non-participant should not be able to avoid an opponent through another live match',
  'stale setup live match should invalidate instead of finishing as a win/loss',
  'invalidated setup timeout should not expose post-match review',
  'setup timeout should emit match_invalidated ready_timeout reason',
  'ready participant should not be punished after opponent setup timeout',
  'frequent queue cancellation should block the next ranked join',
  'unready setup timeout participant should receive queue cooldown',
  'setup timeout should record unready cooldown only once during a single invalidation release chain',
  'queue_cancel_abuse',
  'ready_timeout',
  'pvp-live-matchmaking-guard-v1',
  'matched view should expose authoritative opener assignment report',
  'private invite match should expose authoritative opener assignment',
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
  'restarted closest-candidate ranked opponent view',
  'restarted closest persisted rating candidate should be consumed as the matched ticket',
  'restarted ranked match quality should derive rating delta bucket from joined ratings',
  'restarted ranked match quality should expose strict rating stage',
  'restarted ranked match quality should not expose exact player ratings',
  'older wider-gap persisted candidate should remain waiting after closest candidate is selected',
  'restarted saturated candidate search should restore beyond 32 candidates',
  'restarted saturated ranked opponent view',
  'restarted saturated candidate search should claim the near candidate row after the first 32 waiting rows',
  'restarted saturated match quality should count more than 32 queued candidates',
  'wide accepted waiting player should queue before restart',
  'restarted two-sided wide consent should restore consent from the waiting queue row',
  'restarted accepted wide-match ranked opponent view',
  'restarted accepted wide match should keep wide_but_accepted tag',
  'restarted accepted wide match should keep explicit consent safeguard',
  'restarted accepted wide match should consume the persisted consenting waiting ticket',
  'restarted active live match join should return matched',
  'restarted active match should take precedence over any stale waiting row',
  'restarted current match should keep latest state version',
  'active match row should persist state_version beside state_json',
  'store saveMatch should surface skipped stale persistence writes',
  'store saveMatch should mark skipped stale persistence writes',
  'store saveMatch should keep stale_state_version reason',
  'store saveMatch should not append events when match state persistence is skipped',
  'heartbeat stale save should reload the authoritative persisted match',
  'heartbeat stale save should return authoritative stateView instead of the local stale view',
  'heartbeat stale reload should refresh the in-memory match cache',
  'current match read should reload newer authoritative persisted active match before serving cached state',
  'current match read should refresh local cache with authoritative state',
  'direct match read should reload authoritative same-version-conflict state instead of stale local cache',
  'direct match read should refresh local cache with authoritative same-version state',
  'heartbeat same-version conflict should reload the authoritative persisted match',
  'heartbeat same-version conflict should return authoritative stateView instead of local dirty view',
  'heartbeat same-version conflict reload should refresh the in-memory combat state',
  'intent stale save should reload the authoritative persisted match',
  'intent stale save should ask the client to sync instead of returning accepted local state',
  'intent stale sync should not replay local accepted events that failed persistence',
  'intent stale reload should refresh the in-memory match cache',
  'stale duplicate intent already processed by authoritative state should return duplicate',
  'stale duplicate intent should keep reducer duplicate reason',
  'stale duplicate intent should return authoritative duplicate stateView',
  'stale duplicate intent should refresh local cache with authoritative state',
  'stale conflict intent should return authoritative duplicate conflict instead of generic sync',
  'stale conflict intent should keep reducer rejected result',
  'stale conflict intent should preserve persistence conflict reason on the replay result',
  'stale conflict intent should return authoritative conflict stateView',
  'stale conflict intent should refresh local cache with authoritative state',
  'terminal intent stale save should not settle the local dirty finished state',
  'terminal intent stale save should ask the client to sync instead of returning accepted surrender',
  'terminal intent stale sync should not replay local surrender events that failed persistence',
  'terminal intent stale sync should return authoritative status instead of local finished surrender',
  'terminal intent stale reload should replace the local dirty finished cache',
  'terminal intent stale reload should keep active map on authoritative active match',
  'already-reported terminal completion should persist/release once',
  'already-reported terminal completion should not call settlement provider again',
  'already-reported terminal completion should release viewer active map',
  'settlement report stale save should reload authoritative finished match for compensation',
  'settlement report stale save should retry the report save against authoritative finished state',
  'settlement report compensation should keep the accepted terminal intent result',
  'settlement report compensation should return authoritative finished state',
  'settlement report compensation should return the authoritative settlement report',
  'settlement report compensation should refresh local cache with the saved report',
  'settlement report conflict save should reload authoritative finished match for compensation',
  'settlement report conflict save should retry the report save against authoritative finished state',
  'settlement report conflict compensation should return the authoritative settlement report',
  'settlement report mismatch should ask the client to sync instead of accepting a dirty report',
  'settlement report mismatch should not attach a local report to authoritative state',
  'settlement report mismatch reload should keep authoritative outcome',
  'soft timeout stale save should attempt exactly one local automation save',
  'soft timeout stale save should reload the authoritative persisted match after route-level pre-read',
  'soft timeout stale save should return authoritative status instead of local automation state',
  'soft timeout stale save should return authoritative state version after reload',
  'soft timeout stale save should return authoritative player state after reload',
  'soft timeout stale reload should replace the local dirty automation cache',
  'soft timeout stale reload should keep viewer active map on authoritative active match',
  'soft timeout stale reload should keep opponent active map on authoritative active match',
  'timeout stale save should not settle the local dirty timeout result',
  'timeout stale save should reload the authoritative persisted match',
  'timeout stale save should return authoritative status instead of local timeout finished state',
  'timeout stale save should return authoritative state version after reload',
  'timeout stale save should return authoritative player state after reload',
  'timeout stale reload should replace the local dirty timeout cache',
  'timeout stale reload should keep viewer active map on authoritative active match',
  'timeout stale reload should keep opponent active map on authoritative active match',
  'invalidated stale release should reload the authoritative persisted match',
  'invalidated stale release should return authoritative status instead of local invalidated state',
  'invalidated stale release should return authoritative state version after reload',
  'invalidated stale release should return authoritative player state after reload',
  'invalidated stale release should replace the local dirty invalidated cache',
  'invalidated stale release should keep viewer active map on authoritative active match',
  'invalidated stale release should keep opponent active map on authoritative active match',
  'missing authoritative stale reload should not return the local dirty heartbeat view',
  'missing authoritative stale reload should evict the local dirty match cache',
  'missing authoritative stale reload should clear viewer active match cache',
  'missing authoritative stale reload should clear opponent active match cache',
  'persistence saveMatch should report accepted active snapshots as saved',
  'persistence saveMatch should not mark accepted active snapshots as skipped',
  'persistence accepted save result should expose saved reason',
  'persistence saveMatch should report stale lower-version saves as skipped',
  'persistence stale save result should mark skipped true',
  'persistence stale save result should expose a stable stale_state_version reason',
  'migrated stale lower-version saves should report skipped',
  'migrated stale save result should mark skipped true',
  'migrated stale save result should expose stale_state_version',
  'persistence CAS should reject stale active match saves with lower stateVersion',
  'persistence CAS should keep the latest combat state when a stale process saves later',
  'persistence saveMatch should report same-version active conflicts as skipped',
  'persistence same-version conflict result should mark skipped true',
  'persistence same-version conflict should expose a stable reason',
  'persistence CAS should reject same-version active saves with conflicting state',
  'persistence CAS should keep the latest combat state when a same-version process saves later',
  'persistence CAS should not regress same-version active connection heartbeat timeline',
  'persistence CAS should not regress same-version active reconnect timeline',
  'test-only forced connection snapshot save should be accepted',
  'test-only forced connection snapshot should overwrite active heartbeat timeline',
  'test-only forced connection snapshot should overwrite active reconnect timeline',
  'persistence CAS should restore newer heartbeat timeline after test-only forced snapshot',
  'persistence CAS should restore newer reconnect timeline after test-only forced snapshot',
  'persistence CAS should keep incoming same-version active heartbeat timeline during a write race',
  'persistence CAS should keep concurrently advanced same-version active heartbeat timeline',
  'persistence CAS should keep concurrently advanced same-version active reconnect timeline',
  'persistence post-read race should report skipped when a newer version wins before write',
  'persistence post-read race result should mark skipped true',
  'persistence post-read race should keep stale_state_version reason when persisted version advances',
  'persistence post-read race should keep the newer authoritative state version',
  'persistence CAS should derive existing revision from state_json for migrated rows',
  'migrated active match rows should keep latest combat state when state_version backfill is still zero',
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
  'restarted pending rematch requester should read pending rematch status before opponent accepts',
  'restarted pending rematch should create the friendly match instead of waiting again',
  'restarted pending rematch should keep original series id',
  'accepted pending rematch should be cleared after friendly match creation',
  'expired restarted pending rematch should expose stable expiry reason',
  'expired pending rematch should be cleared after status read',
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
  'SQLite live WS signal table should persist state_sync signals for state advances',
  'SQLite live WS signal table should include the latest persisted state version',
  'SQLite live WS signal cursor should load state_sync fanout signals by match id',
  'SQLite live WS signal cursor should not replay already consumed signals',
  'SQLite queue pair claim should fail when either ticket is missing',
  'SQLite queue pair claim should not partially claim when either ticket is missing',
  'SQLite queue pair claim should keep the first ticket when the pair is incomplete',
  'SQLite queue pair claim should reject duplicate ticket input',
  'SQLite queue pair claim should not delete duplicate ticket input',
  'SQLite queue pair claim should reject userId mismatch',
  'SQLite queue pair claim should not partially delete on userId mismatch',
  'SQLite queue pair claim should atomically claim both waiting tickets',
  'SQLite queue pair claim should report both claimed tickets',
  'pvp_live_match_events',
  'pvp_live_invites',
  'target_user_id',
  'target_user_name',
  'restarted server should not recover invalidated setup timeout as current live match',
  'restarted ready invalidated match should not block fresh queue',
  'restarted unready invalidated user should receive queue cooldown',
  'restarted unready invalidated user should preserve ready_timeout cooldown source',
  'same DB path',
  'DEFIER_DB_PATH',
].forEach((needle) => {
  assert.ok(
    pvpLivePersistenceChecks.includes(needle),
    `live PVP persistence sanity should pin SQLite restart-recovery marker: ${needle}`,
  );
});

[
  'state_version INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE pvp_live_matches ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0',
  'wide_match_consent INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE pvp_live_queue_tickets ADD COLUMN wide_match_consent INTEGER NOT NULL DEFAULT 0',
  'CREATE TABLE IF NOT EXISTS pvp_live_queue_handoffs',
  'idx_pvp_live_queue_handoffs_user',
  'CREATE TABLE IF NOT EXISTS pvp_live_match_events',
  'UNIQUE(match_id, event_id)',
  'UNIQUE(match_id, event_sequence)',
  'idx_pvp_live_match_events_match_sequence',
  'CREATE TABLE IF NOT EXISTS pvp_live_state_signals',
  'signal_id INTEGER PRIMARY KEY AUTOINCREMENT',
  'source_instance_id TEXT NOT NULL DEFAULT',
  'idx_pvp_live_state_signals_match_created',
  'CREATE TABLE IF NOT EXISTS pvp_live_matchmaking_guards',
  'idx_pvp_live_matchmaking_guards_cooldown',
].forEach((needle) => {
  assert.ok(
    pvpLiveDatabase.includes(needle),
    `live PVP database schema should pin append-only event table marker: ${needle}`,
  );
});

[
  "return { saved: false, skipped: true, reason: 'invalid_match' }",
  "return { saved: false, skipped: true, reason: 'invalid_seats' }",
  "reason: 'stale_state_version'",
  'skipped: true',
  "saved: true",
  "skipped: false",
  "reason: 'saved'",
  "reason: 'conflicting_state_version'",
  'function getStateVersion(state)',
  'async function loadPersistedMatchStateSnapshot(matchId)',
  'loadPersistedMatchStateSnapshot(match.matchId)',
  'function makeConnectionTimelineMaxSql(currentJsonExpression, incomingJsonExpression)',
  'json_patch(${currentJson}, ${incomingJson})',
  'json_set(${mergedJson}',
  'MAX(${makeConnectionTimestampSql(currentJson, jsonPath)}, ${makeConnectionTimestampSql(incomingJson, jsonPath)})',
  'const ACTIVE_CONNECTION_TIMELINE_SQL = makeConnectionTimelineMaxSql',
  'THEN ${ACTIVE_CONNECTION_TIMELINE_SQL}',
  'stateVersion < persistedStateVersion',
  'persistedState.stateJson !== serializedState',
  'const writeResult = await dbRun',
  'writeResult.changes === 0',
  'const latestPersistedState = await loadPersistedMatchStateSnapshot(match.matchId)',
  'stateVersion < latestPersistedStateVersion',
  'state_version = excluded.state_version',
  'excluded.state_version > pvp_live_matches.state_version',
  "pvp_live_matches.status != 'active'",
  "excluded.status != 'active'",
  'pvp_live_matches.state_json = excluded.state_json',
  'wideMatchConsent: Number(row.wide_match_consent) === 1',
  'wide_match_consent = excluded.wide_match_consent',
  'function makeQueueHandoffFromRow(row)',
  'async claimQueueEntry(queueTicket, userId)',
  'DELETE FROM pvp_live_queue_tickets WHERE queue_ticket = ? AND user_id = ?',
  'claimed: !!(result && result.changes > 0)',
  'async claimQueueEntries(queueClaims)',
  'claimable AS MATERIALIZED',
  '(SELECT total FROM claim_count) = ?',
  'claimedCount === claims.length',
  'async saveQueueHandoff(handoff)',
  'INSERT INTO pvp_live_queue_handoffs',
  'async loadQueueHandoff(queueTicket, userId)',
  'async saveMatchEvents(matchId, events = [])',
  'INSERT OR IGNORE INTO pvp_live_match_events',
  'async loadMatchEvents(matchId)',
  'ORDER BY event_sequence ASC',
  'function makeLiveWsSignalFromRow(row)',
  'async function appendLiveWsSignalRow',
  "safeReason === 'sync_required' || safeReason === 'duplicate_action'",
  'WHERE NOT EXISTS',
  'AND state_version = ?',
  'AND reason = ?',
  'INSERT INTO pvp_live_state_signals',
  'liveWsSignalAppended: !!liveWsSignal',
  'async appendLiveWsSignal(signal = {})',
  'async getLiveWsLatestSignalId()',
  'async loadLiveWsSignalsSince(signalId, limit = 100)',
  'FROM pvp_live_state_signals',
  'async saveMatchmakingGuard(profile)',
  'async loadMatchmakingGuard(userId)',
  'FROM pvp_live_matchmaking_guards',
  "async saveMatch(match, { liveWsSourceInstanceId = '', forceConnectionSnapshot = false } = {})",
  'const connectionAssignmentSql = forceConnectionSnapshot',
  "forceConnectionSnapshot\n                ? 'excluded.connection_json'",
  'sourceInstanceId: liveWsSourceInstanceId',
  "connection_timeout: ['seatId', 'disconnectedSeats', 'phase', 'elapsedMs']",
  "ready_timeout: ['unreadySeats', 'readyDeadlineAt', 'elapsedMs']",
  'Array.isArray(value)',
].forEach((needle) => {
  assert.ok(
    pvpLivePersistence.includes(needle),
    `live PVP persistence should pin append-only event stream marker: ${needle}`,
  );
});

[
  "return { saved: true, skipped: false, reason: 'no_persistence' }",
  "reason: 'legacy_persistence'",
  "saveResult.reason === 'conflicting_state_version'",
  'if (saveResult.saved === false) return saveResult',
  "async saveMatch(match, { liveWsSourceInstanceId = '', forceConnectionSnapshot = false } = {})",
  'this.persistence.saveMatch(match, { liveWsSourceInstanceId, forceConnectionSnapshot })',
  'isStaleStateSaveResult(saveResult)',
  'evictMatchCache(matchId)',
  'this.evictMatchCache(requestedMatchId)',
  'rehydrateAuthoritativeMatchForUser(userId, matchId)',
  'this.persistence.loadMatchForUser(userId, requestedMatchId)',
  'return authoritative ? { ...authoritative, saveResult } : null',
  "result: 'sync_required'",
  'this.makeStaleStateSyncResult(authoritative, saveResult)',
  'makeAuthoritativeDuplicateIntentResult(authoritative, intent, saveResult)',
  'processedIntents[`${intent.seatId}:${intent.intentId}`]',
  'const duplicateResult = reduceIntent(authoritative.match.state, intent)',
  "duplicateResult.result !== 'duplicate' && duplicateResult.reason !== 'duplicate_action_conflict'",
  'this.makeAuthoritativeDuplicateIntentResult(authoritative, intent, saveResult)',
  "async submitIntent(userId, matchId, intentInput, { liveWsSourceInstanceId = '' } = {})",
  'this.completeFinishedMatch(match, { liveWsSourceInstanceId })',
  'this.saveMatch(match, { liveWsSourceInstanceId })',
  'const authoritative = await this.rehydrateAuthoritativeMatchForUser(userId, activeMatchId)',
  'match = authoritative && authoritative.match || null',
  'getFinishedOutcome(state)',
  'async compensateSettlementReportSaveLoss(match, saveResult, options = {})',
  'this.canApplySettlementReportCompensation(match, authoritativeMatch)',
  '!sourceOutcome.finishReason || !sourceOutcome.winnerSeat',
  'authoritativeMatch.state.settlementReport = JSON.parse(JSON.stringify(match.state.settlementReport))',
  'const compensationSaveResult = await this.saveMatch(authoritativeMatch, options)',
  'reduced.state = completion.match.state',
  'const initialSaveResult = await this.saveMatch(match, options)',
  'return { completed: false, saveResult: initialSaveResult }',
  "match.state.settlementReport && match.state.settlementReport.reportVersion === 'pvp-live-settlement-report-v1'",
  'return { completed: true, saveResult: initialSaveResult }',
  'const compensation = await this.compensateSettlementReportSaveLoss(match, settlementSaveResult, options)',
  'const completion = await this.completeFinishedMatch(match, { liveWsSourceInstanceId })',
  'this.isStaleStateSaveResult(completion && completion.saveResult)',
  'return { completed: true, saveResult: settlementSaveResult || initialSaveResult }',
  'const automationResult = await this.executeFirstTimeoutAutomation(match, loserSeat, elapsed)',
  'return automationResult || { match, saveResult: null }',
  'async executeFirstTimeoutAutomation(match, seatId, elapsed)',
  'return this.completeInvalidatedMatch(match)',
  'const staleCompletion = results.find(result => this.isStaleStateSaveResult(result && result.saveResult))',
  'return staleCompletion || { match, saveResult: null }',
  'const sweepResult = await this.sweepMatchTimeout(match)',
  'this.isStaleStateSaveResult(sweepResult && sweepResult.saveResult)',
  'const releaseResult = await this.releaseIfTerminal(match)',
  'this.isStaleStateSaveResult(releaseResult && releaseResult.saveResult)',
  'return this.rehydrateAuthoritativeMatchForUser(userId, match.matchId)',
  "reason: saveResult && saveResult.reason || 'stale_state_version'",
  'async claimQueueEntry(queueEntry)',
  'this.persistence.claimQueueEntry(queueEntry.queueTicket, queueEntry.player.userId)',
  'async claimQueueEntries(queueEntries)',
  'this.persistence.claimQueueEntries',
  'const pairClaim = await this.claimQueueEntries([existingTicket, opponentTicket])',
  'if (!pairClaim.claimed)',
  'const opponentClaim = await this.claimQueueEntry(opponentTicket)',
  'if (opponentClaim.claimed)',
  'await this.persistence.saveMatchEvents(match.matchId, match.state.events)',
  'normalizeLivePvpTestMatchScope',
  'getMatchTestScope',
  'requestTestScope !== matchTestScope',
  'test_state_forced',
  'heartbeatElapsedMs',
  'forceConnectionSnapshot: changedFields.includes',
  'async recordQueueCancellation(userId)',
  'async recordReadyTimeoutCooldowns(match)',
  'async getActiveMatchmakingGuard(userId)',
  "reason: 'queue_cooldown'",
  "nextProfile.cooldownSource = 'queue_cancel_abuse'",
].forEach((needle) => {
  assert.ok(
    pvpLiveStore.includes(needle),
    `live PVP store should surface skipped persistence writes marker: ${needle}`,
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
  'ranked surrender season honor should include cosmetic-only reward track',
  'ranked season honor reward should be cosmetic only',
  'ranked season honor reward should expose new collection unlock state',
  'pvp-live-season-honor-collection-v1',
  'pvp-live-settlement-report-v1',
  'pvp-live-season-honor-v1',
  'pvp-live-season-honor-reward-v1',
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
  'data-live-season-honor-reward',
  'data-live-season-honor-reward-impact',
  'data-live-season-honor-reward-state',
  'data-live-season-honor-reward-collection',
  'pvp-live-settlement-report-v1',
  'pvp-live-season-honor-v1',
  'pvp-live-season-honor-reward-v1',
  'pvp-live-season-honor-collection-v1',
  'cosmeticReward',
  'collectionState',
  'collectionReport',
  'getLiveSettlementReport(',
  'renderLiveSettlementReport(',
  'data-live-post-review-audit-action',
  'lastReplay: replayMatchId && replayMatchId === activeLiveSourceId ? this.getLiveReplaySummary(state.lastReplay) : null',
  "getReplay({ visibility: \\'replay_self\\' })",
  'acceptLiveWideMatch',
  'data-live-waiting-action=\\"accept-wide-match\\"',
  'wideMatchConsent: true',
  'getLiveWaitingQualitySafeguard(',
  'recent_opponent_suppression',
  '.pvp-live-settlement-report',
  '.pvp-live-season-honor',
  '.pvp-live-season-honor-reward',
  '.pvp-live-season-honor-reward-collection',
].forEach((needle) => {
  assert.ok(
    pvpLiveUiContractChecks.includes(needle),
    `live PVP UI contract should pin settlement report marker: ${needle}`,
  );
});

[
  'longWaitThresholdMs: Number(process.env.PVP_LIVE_LONG_WAIT_THRESHOLD_MS)',
  'DEFIER_PVP_TEST_MODE',
  'testMatchScope: isLivePvpTestModeEnabled()',
  "process.env.NODE_ENV || '').toLowerCase() === 'production'",
  "router.post('/test/matches/:matchId/seats/:seatId'",
  'forceSeatStateForTest(',
  'sanitizePublicEvent',
  'events: Array.isArray(reduced.events) ? reduced.events.map(sanitizePublicEvent) : []',
].forEach((needle) => {
  assert.ok(
    pvpLiveRoute.includes(needle),
    `PVP live route should expose real-backend config/test-mode marker: ${needle}`,
  );
});

[
  "typeof options.testMatchScope === 'string'",
  'data.testMatchScope = options.testMatchScope.trim().slice(0, 64)'
].forEach((needle) => {
  assert.ok(
    backendClientSource.includes(needle),
    `BackendClient should forward live PVP scoped test marker: ${needle}`,
  );
});

[
  'settlementText',
  'settlementSource',
  'settlementHidden',
  'seasonHonorText',
  'seasonHonorPower',
  'seasonHonorRewardText',
  'seasonHonorRewardImpact',
  'seasonHonorRewardState',
  'seasonHonorRewardCollection',
  '正式积分',
  '天道币',
  '赛季荣誉',
  '外观目标',
  '收藏状态',
  "seasonHonorRewardImpact === 'cosmetic_only'",
  "seasonHonorRewardCollection === 'newly_unlocked'",
  "settlementSource === 'server_authoritative_settlement'",
  "settlementReport?.reportVersion === 'pvp-live-settlement-report-v1'",
  "seasonHonorReport?.reportVersion === 'pvp-live-season-honor-v1'",
  "cosmeticReward?.reportVersion === 'pvp-live-season-honor-reward-v1'",
  "collectionReport?.reportVersion === 'pvp-live-season-honor-collection-v1'",
  'real browser replay_public hides seat-specific settlement and season honor reports',
  'real browser audit_safe replay hides seat-specific settlement and season honor reports',
  'requestLivePvpReplay',
  'publicReplayProbe',
  'auditSafeReplayProbe',
  "visibility: 'replay_public'",
  "visibility: 'audit_safe'",
  '!publicReplayProbe.replay?.postMatchReview',
  '!publicReplayProbe.replay?.fairnessReceipt',
  '!publicReplayProbe.replay?.settlementReport',
  '!publicReplayProbe.replay?.seasonHonorReport',
  '!publicReplayProbe.replay?.cosmeticReward',
  '!publicReplayProbe.replay?.seasonHonorCollection',
  'postMatchReview|fairnessReceipt|settlementReport|seasonHonorReport|cosmeticReward|seasonHonorCollection|collectionState|viewerSeat',
  "auditSafeReplayProbe.replay?.sourceVisibilityLayer === 'replay_public'",
  'auditSafeReplayProbe.replay?.hiddenScan?.forbiddenTokenCount === 0',
  'Array.isArray(auditSafeReplayProbe.replay?.fieldPaths)',
  '!auditSafeReplayProbe.replay?.fairnessReceipt',
  '!auditSafeReplayProbe.replay?.cosmeticReward',
  '!auditSafeReplayProbe.replay?.seasonHonorCollection',
  'ready timeout invalidated terminal state does not expose settlement or season honor',
  'real browser current action disconnect resolves to authoritative connection-timeout review',
  'currentActionDisconnectPendingProbe',
  "currentActionDisconnectPendingProbe.response?.stateView?.connectionTempoReport?.tempoState === 'opponent_action_timeout_pending'",
  "currentActionFinishedObserver.postMatchReview?.finishReason === 'connection_timeout'",
  "currentActionFinishedActor.postMatchReview?.result === 'loss'",
  'currentActionDisconnectReloadProbe',
  '!/connection_timeout|turn_timeout|ready_timeout|ranked_authoritative|swap_sides|forfeit_disconnect/.test(currentActionDisconnectVisibleText)',
  'PVP_LIVE_LONG_WAIT_THRESHOLD_MS',
  'real browser long-wait waiting report exposes no-ghost no-score practice options',
  'real browser long-wait practice opens no-score drill after cancelling queue',
  'longWaitProbe.snapshot?.waitingReport?.longWait === true',
  'longWaitProbe.snapshot?.waitingReport?.longWaitThresholdMs === 1000',
  '/1 秒无真人/.test(longWaitProbe.waitingText)',
  "longWaitPracticeProbe.pending?.practiceOnly === true",
  "longWaitPracticeProbe.drillScenario?.reportVersion === 'pvp-live-drill-scenario-v1'",
  "longWaitPracticeProbe.drillScenario?.sourceVisibility === 'replay_self'",
  'longWaitPracticeProbe.drillScenario?.usesHiddenInformation === false',
  "longWaitPracticeProbe.drillScenario?.rankedImpact === 'none'",
  "!Object.prototype.hasOwnProperty.call(longWaitPracticeProbe.drillScenario || {}, 'practicePlan')",
  'invalidatedNoSeasonHonorProbe',
  "!invalidatedNoSeasonHonorProbe.snapshot?.postMatchReview",
  "!invalidatedNoSeasonHonorProbe.textPayload?.postMatchReview",
  'invalidatedNoSeasonHonorProbe.seasonHonorRewardText ===',
  "!invalidatedNoSeasonHonorProbe.seasonHonorRewardPresent",
  "invalidatedNoSeasonHonorProbe.snapshot?.phase === 'invalidated'",
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
  '/api/pvp/live/matches/pvplm%20test%2F1/rematch/cancel',
  '/api/pvp/live/invites',
  '/api/pvp/live/invites/current',
  '/api/pvp/live/invites/inbox',
  '/api/pvp/live/invites/TD%20AB%2F12/join',
  '/api/pvp/live/invites/TD%20AB%2F12/cancel',
  '/api/pvp/live/matches/pvplm%20test%2F1/heartbeat',
  '/api/pvp/live/matches/current',
  '/api/pvp/live/matches/pvplm-test/intents',
  '/api/pvp/live/matches/pvplm%20test%2F1/avoid-opponent',
  'BackendClient should expose requestLivePvpRematch',
  'BackendClient should expose getLivePvpRematchStatus',
  'BackendClient should expose cancelLivePvpRematch',
  'BackendClient should expose createLivePvpInvite',
  'BackendClient should expose joinLivePvpInvite',
  'BackendClient should expose cancelLivePvpInvite',
  'BackendClient should expose getCurrentLivePvpInvite',
  'BackendClient should expose getLivePvpInviteInbox',
  'BackendClient should expose heartbeatLivePvpMatch',
  'BackendClient should expose submitLivePvpAvoidOpponent',
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
  'live friendly rematch status should GET',
  'live friendly rematch cancel should POST',
  'live friendly rematch cancel should not send legacy settlement body',
  'BackendClient should expose createLivePvpReplayShare',
  'live replay share creation should encode match id',
  'public live replay share fetch should encode share token',
  'live replay share revoke should encode match id',
  'empty live replay share match id should not call requestServer',
  'empty public live replay share token should not call requestServer',
  'live heartbeat should POST',
  'live pvp client must not call legacy settlement path',
  'live queue join should forward display name and loadout snapshot candidate',
  'live queue join should forward explicit wide match consent only when selected',
  'live queue join should clone loadout before sending',
  'blocked connection health join should preserve backend health report',
  'queue cooldown join should preserve backend matchmaking guard report',
  'queue cooldown join should preserve cooldown source',
  'live intent should not add legacy didWin or matchTicket fields',
  'live intent stale failure should preserve server reason',
  'live avoid-opponent request should send only a bounded social safety payload',
  'empty live avoid-opponent match id should not call requestServer',
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
  'createLivePvpReplayShare',
  'getLivePvpReplayShare',
  'revokeLivePvpReplayShare',
  'requestLivePvpRematch',
  'getLivePvpRematchStatus',
  'cancelLivePvpRematch',
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
  'live replay share bridge should call BackendClient.createLivePvpReplayShare',
  'public replay share bridge should call BackendClient.getLivePvpReplayShare',
  'live replay share revoke bridge should call BackendClient.revokeLivePvpReplayShare',
  'live rematch bridge should call BackendClient.requestLivePvpRematch',
  'live rematch status bridge should call BackendClient.getLivePvpRematchStatus',
  'live rematch cancel bridge should call BackendClient.cancelLivePvpRematch',
  'live realtime bridge should call BackendClient.connectLivePvpWebSocket',
  'submitLivePvpIntent',
  'submitLivePvpAvoidOpponent',
  'live avoid-opponent bridge should call BackendClient.submitLivePvpAvoidOpponent',
  'connectRealtime',
].forEach((needle) => {
  assert.ok(
    pvpLiveServiceBridgeChecks.includes(needle),
    `live PVP service bridge sanity should pin legacy settlement isolation marker: ${needle}`,
  );
});

[
  'realtimeReconnectDelayMs = 750',
  'clearRealtimeReconnectTimer',
  'scheduleRealtimeReconnect',
  'live_ws_reconnecting',
  'realtimeConnectionId',
  'sanitizeSameVersionActiveStateView',
  'sanitizeActiveStateViewTerminalFallout',
  'filterActiveTerminalEvents',
  'getEventPublicData',
  'isActiveTerminalFalloutEvent',
  'formatLiveIntentRejectMessage',
  "not_current_turn: '还没轮到你行动",
  "not_enough_energy: '灵力不足",
  "card_not_in_hand: '这张牌已不在当前手牌",
  'soft_timeout_automation',
  'hasActiveTerminalEvents',
  'sameTurnTimer',
  "const isIdempotentDuplicate = result === 'duplicate' && intentResult.reason === 'duplicate_action'",
  "result === 'accepted' || isIdempotentDuplicate",
  'lastReplayMatchId',
  'getSnapshotMatchId(state) !== matchId',
].forEach((needle) => {
  assert.ok(
    pvpLiveSessionSource.includes(needle),
    `live PVP session source should pin client realtime reconnect marker: ${needle}`,
  );
});

[
  'live session should not expose client-reported result API',
  'live session should expose friendly rematch request API',
  'live session should expose friendly rematch polling API',
  'live session should expose friendly rematch cancel API',
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
  'heartbeat should preserve active reconnect grace turn deadline',
  'heartbeat should not surface terminal events during active reconnect grace',
  'current-match reconnect recovery should stay active after page refresh',
  'current-match reconnect recovery should preserve active turn deadline',
  'current-match reconnect recovery should keep reconnect grace tempo',
  'current-match reconnect recovery should keep stale submits blocked',
  'active current-match recovery should not surface stale terminal review',
  'active current-match recovery should scrub stale terminal stateView events',
  'active current-match recovery should not publish stale terminal events',
  'active current-match recovery should preserve soft timeout automation evidence',
  'active current-match recovery should publish soft timeout automation evidence',
  'same-version reconnect heartbeat should still accept recovered online presence',
  'same-version reconnect heartbeat should not regress active turn deadline',
  'same-version reconnect heartbeat should not surface stale terminal review',
  'same-version reconnect heartbeat should not surface stale terminal reconnect events',
  'same-version authoritative terminal heartbeat should still enter finished phase',
  'same-version authoritative terminal heartbeat should retain post-match review',
  'live session should not use legacy PVP paths',
  'session should inject latest heartbeat-refreshed stateVersion into live intent',
  'live session state must not expose opponent hand',
  'cancel queue should return session to idle',
  'sync_required should retain latest authoritative state view',
  'expired queue ticket should leave waiting phase',
  'long wait queue poll should keep waiting phase',
  'session should retain no ghost fallback safeguard',
  'surrender should move session into finished phase',
  'getReplay should bind stored replay payload to the current match id',
  'joining a new queue should clear the previous match replay payload',
  'late replay response from an old match should not publish stale replay data',
  'failed queue again after finished should clear stale match id',
  'failed queue again should preserve terminal recovery anchor for refresh retry',
  'successful queue again should clear old terminal recovery anchor',
  'finished terminal match should persist last reviewable match id for refresh recovery',
  'resumeCurrentMatch should restore finished terminal review from stored match id when current match is gone',
  'resumeCurrentMatch should restore pending friendly rematch after refreshing from terminal review',
  'terminal recovery with rematch action should ask pending rematch status before rendering finished',
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
  'cancelled friendly rematch should return to the finished review phase',
  'cancelled friendly rematch should expose stable cancellation reason',
  'expired friendly rematch should return to finished review instead of waiting forever',
  'expired friendly rematch should expose stable expiry reason',
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
  'live session should expose resumeRealtime for hidden-tab recovery',
  'live session should expose disconnectRealtime',
  'connectRealtime should mark realtime connecting',
  'connectRealtime should register message handler',
  'connected WS message should mark realtime connected',
  'state_sync WS message should update live phase',
  'events_replay WS message should replace last events with missed public events',
  'empty events_replay should not downgrade the last seen public event revision',
  'presence WS message should update connection report',
  'intent_result WS message should update state view',
  'intent_result WS message should expose the acknowledged intent id',
  'intent_result WS message should expose the authoritative result',
  'intent_result WS message should expose the acknowledged match id',
  'duplicate intent_result WS message should expose the authoritative duplicate result',
  'duplicate intent_result WS message should expose the reducer duplicate reason',
  'duplicate intent_result WS message should not surface an idempotent replay as a realtime error',
  'live session realtime helpers should send stable WS message envelopes',
  'live session realtime helpers should send stable WS message envelopes with last seen event revision',
  'visibility resume should replay pending join_match and heartbeat immediately with the latest public event revision',
  'visibility resume should send heartbeat_realtime with the pending join high-water mark as soon as the reconnected socket opens',
  'visibility resume should clear the delayed reconnect timer instead of waiting for the next interval',
  'disconnectRealtime should mark realtime closed',
  'onOpen should replay pending join_match after the socket becomes writable',
  'unexpected WS close should mark realtime reconnecting',
  'unexpected WS close should schedule a short reconnect delay',
  'reconnect timer should create a fresh realtime connection',
  'reconnected realtime socket should replay pending join_match without waiting for heartbeat',
  'manual disconnect should not schedule another reconnect',
  'stale state_sync WS message should not downgrade authoritative stateVersion',
  'stale intent_result WS message should not downgrade authoritative stateVersion',
  'stale intent_result WS message should still expose the acknowledged intent id for UI locks',
  'stale HTTP refresh should not downgrade authoritative stateVersion',
  'stale HTTP heartbeat should not downgrade authoritative stateVersion',
  'stale HTTP heartbeat should not downgrade active reconnect grace deadline',
  'stale HTTP heartbeat should not surface stale terminal reconnect events',
  'stale HTTP intent result should not downgrade authoritative stateVersion',
  'not-current rejection should explain that the player is waiting for opponent action',
  'energy rejection should suggest a lower-cost action or ending the turn',
  'missing-card rejection should tell the player to refresh the authoritative hand',
  'presence WS message should update authoritative connection tempo report',
  'queue cooldown block should retain structured matchmaking guard report',
  'queue cooldown block should retain cooldown source',
  'live session should expose public replay share API',
  'live session should expose public replay share revoke API',
  'createReplayShare should store returned public share receipt',
  'createReplayShare should bind share creation to the current match',
  'revokeReplayShare should store the revoked public share receipt',
  'revokeReplayShare should bind share revoke to the current match',
  'joining a new queue should clear the previous replay share receipt',
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
  'startLiveRealtime(state = null, { resume = false } = {})',
  'formatLiveRealtimeStatus(',
  'data-live-realtime-status',
  'session.joinRealtimeMatch(sourceState.matchId',
  'lastSeenRevision: this.getLiveLastSeenEventRevision(sourceState)',
  'Array.isArray(sourceState.lastEvents)',
  'this.stopLiveRealtime()',
  'PVPScene should bind page lifecycle events for live foreground resume',
  'PVPScene should listen for document visibility changes',
  'PVPScene should listen for pageshow foreground resumes',
  'PVPScene should listen for focus foreground resumes',
  'PVPScene should debounce live foreground resume signals',
  'PVPScene should expose a live foreground resume handler',
  'PVPScene should ignore hidden-page lifecycle signals',
  'PVPScene should immediately heartbeat when live page returns foreground',
  'PVPScene should re-render when live session receives realtime state',
  'PVPScene should batch realtime render updates',
  'PVPScene should persist post-review focus across realtime re-renders',
  'sendLiveHeartbeat should prefer realtime heartbeat when WS is connected',
  'sendLiveHeartbeat should keep HTTP heartbeat fallback',
  'sendLiveHeartbeat should expose foreground resume mode without changing interval ticks',
  'sendLiveHeartbeat should avoid duplicate realtime heartbeat after resumeRealtime succeeds',
  'submitLiveIntent should prefer realtime intent when WS is connected',
  'submitLiveIntent should keep HTTP intent fallback',
  'PVPScene should track one live realtime intent in-flight',
  'PVPScene should release live realtime intent locks from authoritative state changes',
  'PVPScene should mark realtime intents as pending after successful WS send',
  'PVPScene should clear live intent lock for HTTP fallback or released realtime state',
  'PVPScene should split action and social realtime intent locks',
  'PVPScene should release realtime intent locks from matching intent_result ack',
  'PVPScene should map action intent locks to matching authoritative event types',
  'PVPScene should not release action intent locks from social-only stateVersion changes',
  'resolveLiveIntentInFlight should require action event evidence before stateVersion unlocks action locks',
  'PVPScene should record event high-water marks when realtime intents become pending',
  'PVPScene should ignore stale action events when social stateVersion changes arrive later',
  'submitLiveIntent should surface a pending-action hint instead of sending duplicate live intents',
  'PVPScene should derive live input locks from authoritative connection tempo',
  'PVPScene should expose a shared connection tempo submit guard',
  'submitLiveIntent should block stale inputs before realtime or HTTP submit',
  'live controls should share authoritative connection tempo input lock',
  'live hand rendering should disable card clicks while a realtime intent is pending',
  'live emote buttons should be disabled by authoritative connection tempo or social realtime intent locks',
  'manual live refresh should be distinct from auto polling when clearing pending intents',
  'manual live refresh should clear local realtime intent locks after authoritative refresh',
  'share_replay',
  'createReplayShare({ ttlDays: 30 })',
  'copyLiveReplayShareLink(',
  'replay_share_created',
  'revokeLiveReplayShare(',
  'data-live-replay-share-revoke',
  'replay_share_revoked',
  'openLiveReplayShareViewer(',
  'getLiveReplayShareHighlights(',
  'renderLiveReplayShareViewer(',
  'data-live-replay-share-viewer',
  'data-live-replay-share-viewer-public-only',
  'data-live-replay-share-highlight-list',
].forEach((needle) => {
  assert.ok(
    pvpLiveUiContractChecks.includes(needle),
    `live PVP UI contract should pin authoritative heartbeat scheduling marker: ${needle}`,
  );
});

[
  'getLiveReplayShareHighlights(',
  'data-live-replay-share-highlight-list',
].forEach((needle) => {
  assert.ok(
    pvpSceneSource.includes(needle),
    `PVPScene should pin public replay share highlight marker: ${needle}`,
  );
});

[
  '.pvp-live-replay-share-highlights',
  '.pvp-live-replay-share-highlight',
].forEach((needle) => {
  assert.ok(
    pvpCss.includes(needle),
    `PVP CSS should pin public replay share highlight marker: ${needle}`,
  );
});

[
  'startLiveHeartbeat runtime should schedule the server heartbeat interval',
  'live snapshot should expose local realtime reconnecting status',
  'live snapshot should expose last local realtime sync timestamp',
  'live snapshot should expose cloned local realtime report for text renderers',
  'live snapshot should preserve local realtime reconnect reason for UI diagnostics',
  'getLiveLastSeenEventRevision should prefer replay event high-water marks when reconnecting',
  'startLiveHeartbeat runtime should not stack duplicate timers for the same interval',
  'sendLiveHeartbeat runtime should rebuild heartbeat timer after receiving a new server interval',
  'sendLiveHeartbeat runtime should clear stale timer after server interval changes',
  'live UI foreground resume should bind document visibilitychange',
  'live UI foreground resume should bind window focus',
  'live UI foreground resume should ignore hidden visibilitychange',
  'resume-visible live UI should trigger one immediate realtime resume after hidden-tab throttling',
  'live UI foreground resume should send one immediate heartbeat for reconnecting matches',
  'live UI foreground resume should rerender after the authority heartbeat',
  'live UI foreground resume should not double-fire focus after the same visibility return',
  'live UI foreground resume should not double-heartbeat after a follow-up focus task',
  'live UI foreground resume should not restart realtime after leaving the live tab',
  'live UI foreground resume should not heartbeat after leaving the live tab',
  'live UI local reconnect grace exposes remaining countdown',
  'live UI local disconnected state should not expose internal protocol codes',
  'post-match visible review should not expose internal protocol codes',
  'live UI local disconnected state keeps recovery conditional',
  'live UI match quality should expose passed connection health gate',
  'live UI should render recent-opponent waiting report before the long-wait threshold',
  'recent-opponent waiting safeguard should create a no-score practice handoff scenario',
  'recent_opponent_suppression',
  'live UI should render low-sample waiting report before the long-wait threshold',
  'low-sample waiting safeguard should create a no-score practice handoff scenario',
  'low_sample_protection',
  'queue cooldown should mark live entry safeguard as active',
  'blocked connection health should not expose queue cooldown countdown',
  'queue cooldown countdown should expose rounded remaining seconds',
  'queue cooldown countdown should prefer retryAt over stale server remaining time',
  'queue cooldown should relabel join button with retry countdown',
  'entry_safeguard:queue_cooldown',
  '排队冷却练习',
  'live UI should keep one realtime intent in-flight and ignore double-click submits',
  'live UI should not unlock action intent when social stateVersion advance includes stale action events',
  'live UI should unlock realtime action intent after matching authoritative action event advances stateVersion',
  'live UI should keep action intent in-flight during realtime reconnecting',
  'live UI should keep one social realtime intent in-flight and ignore double-click emotes',
  'live UI should not let a pending social intent block action intents',
  'live UI should unlock social intents after the matching intent_result ack',
  'live UI should keep lost-ack social intent pending before manual refresh',
  'manual live refresh should read authoritative match state while an intent is pending',
  'live UI should unlock pending realtime intents after manual authoritative refresh',
  'opening safeguard should render the authoritative opener assignment chip',
  'post-match review normalizer should preserve audit action ids for real UI buttons',
  'key-turn review action should fetch the authoritative replay_self layer',
  'key-turn replay should render each key turn as a clickable focus step',
  'key-turn focus should reuse matching public evidence details when available',
  'share_replay action should create a 30-day public replay share',
  'share_replay action should copy the front-end public replay viewer link',
  'public replay viewer should fetch by opaque share token only',
  'public replay viewer should not render raw match ids or seat-specific payload fields',
  'public replay share receipt should expose a revoke control',
  'replay share revoke control should call session revoke API',
  'revoked replay share receipt should hide the revoke control',
].forEach((needle) => {
  assert.ok(
    pvpLiveUiRuntimeChecks.includes(needle),
    `live PVP UI runtime should pin authoritative heartbeat scheduling marker: ${needle}`,
  );
});

[
  'getLiveReviewFocusedEvents(',
  'focusLiveKeyTurn(',
  'data-live-key-turn-focus',
  'key_turn:',
].forEach((needle) => {
  assert.ok(
    pvpSceneSource.includes(needle),
    `PVPScene should pin key-turn stepper marker: ${needle}`,
  );
});

[
  'formatLiveMatchStageLabel(',
  'formatLiveRatingDeltaBucketLabel(',
  'formatLiveWaitingReleaseModeLabel(',
  'formatLiveWaitingEligibleActionLabel(',
  "accepted_200_399: '双方确认宽分差'",
  "expanded_200_399: '宽分差 200-399'",
  "need_third_player: '等待更多真人'",
  "continue_waiting: '继续等待'",
].forEach((needle) => {
  assert.ok(
    pvpSceneSource.includes(needle),
    `PVPScene should pin player-readable match quality copy marker: ${needle}`,
  );
});

[
  'live UI match quality should map strict rating stage into player copy',
  'live UI match quality should map unknown connection health into generic player copy',
  'live UI accepted wide-match copy should not repeat the same conclusion twice',
  'live UI low-sample waiting report should not render raw waiting protocol enum values',
  'live UI match quality should not render raw matching enum values',
  'live UI wide match quality should not render raw matching enum values',
].forEach((needle) => {
  assert.ok(
    pvpLiveUiRuntimeChecks.includes(needle),
    `live PVP UI runtime should pin player-readable match quality marker: ${needle}`,
  );
});

[
  '新手公开池',
  '定级样本',
  '!/mvp_open_pool|unrated_mvp|strict_rating|near_0_99/.test(matchedProbe.matchQuality)',
  '放行剩余.*等待更多真人',
  '!/need_third_player|continue_waiting|accept_wide_match|practice|cancel_queue/.test(lowSampleWaitingProbe.report)',
].forEach((needle) => {
  assert.ok(
    browserPvpLiveAudit.includes(needle),
    `live PVP browser audit should pin player-readable match quality marker: ${needle}`,
  );
});

[
  "settlementSource: 'local_authority_gate'",
  "settlementSource: 'local_online_fallback'",
  "settlementSource: 'local_practice'",
  "settlementSource: 'server_authoritative'",
  "settlementSource: 'bmob_online'",
  "settlementSource: 'rejected'",
  'seasonHonorRewardTrack',
  'getSeasonHonorShowcase(options = {})',
  'pvp-live-season-honor-showcase-v1',
  'self_only_ranked_economy',
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
  "honorShowcase.reportVersion === 'pvp-live-season-honor-showcase-v1'",
  "honorShowcase.rewardImpact === 'cosmetic_only' && honorShowcase.powerImpact === 'none'",
  "honorShowcase.sourceVisibility === 'self_only_ranked_economy'",
  'archivedHonorShowcase.totalUnlocked === 0',
  'honorShowcase.ownedItems === undefined',
].forEach((needle) => {
  assert.ok(
    pvpServiceChecks.includes(needle),
    `PVP service sanity should pin settlement receipt marker: ${needle}`,
  );
});

[
  'seasonHonorShowcase',
  'data-season-honor-showcase="true"',
  'data-season-honor-showcase-report="pvp-live-season-honor-showcase-v1"',
  'data-season-honor-showcase-impact="cosmetic_only"',
  'data-season-honor-showcase-power="none"',
  'data-season-honor-showcase-visibility="self_only_ranked_economy"',
  'data-season-honor-showcase-chip="unlocked"',
  'data-season-honor-showcase-card="true"',
  'data-season-honor-showcase-cta="true"',
  '仅本人洞府只读可见，不进入公开回放或审计回放',
].forEach((needle) => {
  assert.ok(
    collectionHub.includes(needle),
    `collection hub should pin persistent season honor showcase marker: ${needle}`,
  );
});

[
  'data-season-honor-showcase="true"',
  "honorSummary?.dataset.seasonHonorShowcaseReport === 'pvp-live-season-honor-showcase-v1'",
  "honorSummary?.dataset.seasonHonorShowcaseImpact === 'cosmetic_only'",
  "honorSummary?.dataset.seasonHonorShowcasePower === 'none'",
  "honorSummary?.dataset.seasonHonorShowcaseVisibility === 'self_only_ranked_economy'",
  "honorCard?.dataset.seasonHonorShowcaseVisibility === 'self_only_ranked_economy'",
  'honorFitsViewport',
  'honorRect.bottom <= window.innerHeight + 2',
  '仅本人洞府只读可见，不进入公开回放或审计回放',
  '不授予卡牌、属性、资源、起手、匹配或战斗效果',
].forEach((needle) => {
  assert.ok(
    browserDongfuAudit.includes(needle),
    `dongfu browser audit should pin persistent season honor showcase marker: ${needle}`,
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
