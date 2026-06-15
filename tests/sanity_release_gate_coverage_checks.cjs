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
const browserFeatureAudit = read('tests/browser_feature_audit.mjs');
const browserEventBranchAudit = read('tests/browser_event_branch_audit.mjs');
const browserRunPathEventAudit = read('tests/browser_run_path_event_audit.mjs');
const browserMobileAudit = read('tests/browser_mobile_layout_audit.mjs');
const challengeMobileAudit = read('tests/browser_challenge_mobile_flow_audit.mjs');
const strategicNodeChecks = read('tests/sanity_strategic_node_system_checks.cjs');
const runVowChecks = read('tests/sanity_run_vow_system_checks.cjs');
const runNodeChecks = read('tests/run_node_checks.sh');
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
  'node tests/browser_run_path_event_audit.mjs "$BASE_URL" "$OUTPUT_ROOT/run-path-events"',
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
  'cardLimitConditionVisible',
  'card-limit trial fails after seven real browser card plays and clears trial state',
  'treasureHuntRewardVisible',
  'treasure trial grants a real treasure reward after browser victory and clears trial state',
  'maxCardsPlayed',
  'trialChallengeProbe.choiceCount >= 6',
].forEach((needle) => {
  assert.ok(
    browserFeatureAudit.includes(needle),
    `browser feature audit should cover trial card-limit marker: ${needle}`,
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
].forEach((needle) => {
  assert.ok(
    runNodeChecks.includes(needle),
    `node release checks should include strategic gameplay sanity marker: ${needle}`,
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
  'fateRingEchoShrine bias too weak',
  'echoRate',
].forEach((needle) => {
  assert.ok(
    read('tests/sanity_event_bias_distribution_checks.cjs').includes(needle),
    `event bias sanity should cover fate-path echo marker: ${needle}`,
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
  'buildObservatoryRouteForecast',
  '星轨预报',
  'visibleNodeCount === 4',
  'focusNodeTypes.includes(\'trial\')',
  'forecast.topRisk && forecast.topRisk.type === \'trial\'',
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
  'observatory node previews future realm and can lock a route forecast',
  '星轨预报',
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
  'hasCardLimit',
  'hasTreasureHunt',
  'cardLimitConditionVisible',
  'treasureHuntConditionVisible',
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
  'fallbackCompensationAvoided',
].forEach((needle) => {
  assert.ok(
    backendClientSmoke.includes(needle),
    `browser backend smoke should cover authoritative PVP settlement marker: ${needle}`,
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

console.log('Release gate coverage checks passed.');
