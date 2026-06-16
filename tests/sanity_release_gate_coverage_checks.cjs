const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const prodReadScript = read('scripts/check-production-read-only.sh');
const browserReleaseScript = read('tests/run_browser_release_checks.sh');
const backendSecurityChecks = read('tests/backend_security_checks.cjs');
const backendClientSmoke = read('tests/browser_backend_client_smoke.mjs');
const browserAudit = read('tests/browser_audit.mjs');
const browserPvpAudit = read('tests/browser_pvp_audit.mjs');
const browserFeatureAudit = read('tests/browser_feature_audit.mjs');
const browserMetaAudit = read('tests/browser_meta_screen_audit.mjs');
const browserEventBranchAudit = read('tests/browser_event_branch_audit.mjs');
const browserRunPathEventAudit = read('tests/browser_run_path_event_audit.mjs');
const browserMobileAudit = read('tests/browser_mobile_layout_audit.mjs');
const challengeMobileAudit = read('tests/browser_challenge_mobile_flow_audit.mjs');
const browserChapterFlowAudit = read('tests/browser_chapter_flow_audit.mjs');
const browserRunPathRewardAudit = read('tests/browser_run_path_reward_audit.mjs');
const codexSanctumChecks = read('tests/sanity_codex_sanctum_checks.cjs');
const strategicNodeChecks = read('tests/sanity_strategic_node_system_checks.cjs');
const runVowChecks = read('tests/sanity_run_vow_system_checks.cjs');
const trialChallengeChecks = read('tests/sanity_trial_challenge_checks.cjs');
const pvpService = read('js/services/pvp-service.js');
const pvpServiceChecks = read('tests/sanity_pvp_service_checks.cjs');
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
  'node tests/test_e2e_backend.cjs',
].forEach((needle) => {
  assert.ok(
    runNodeChecks.includes(needle),
    `node release checks should include strategic gameplay sanity marker: ${needle}`,
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
  'memory-rift engineering event overlay + reward uplift',
  'floatingMarketRift',
  'artifactConfluxBazaar',
  'after.ringExp > before.ringExp',
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
  'reward chapter-arc drill CTA stores chapter training focus and opens weekly challenge hub',
  'data-season-board-chapter-drill-cta',
  "seasonBoardChapterDrillMode === 'weekly'",
  "seasonBoardChapterDrillSource === 'chapter_arc'",
  'seasonBoardChapterDrillFocusId',
  'focus?.sourceRunId === expectedFocusId',
  "window.game?.challengeHubState?.tab === 'weekly'",
].forEach((needle) => {
  assert.ok(
    browserRunPathRewardAudit.includes(needle),
    `browser run path reward audit should cover chapter arc drill handoff marker: ${needle}`,
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
