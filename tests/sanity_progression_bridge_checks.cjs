const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const game = read('js/game.js');
const challengeHub = read('js/core/challenge_hub.js');
const expeditionHub = read('js/core/expedition_hub.js');
const backendClient = read('js/services/backend-client.js');
const authService = read('js/services/authService.js');
const progressionClient = read('js/services/progression-service.js');
const liveSettlement = read('server/pvp-live/live-settlement.js');
const progressionService = read('server/progression/service.js');
const progressionRoute = read('server/routes/progression.js');
const documentation = read('docs/backend_progression_platform_v1.md');

[
  'progressionPathPrefix',
  'getProgressionStatus',
  'submitProgressionEvents',
  'claimProgressionReward',
  'getProgressionLedger',
  'createSessionIntegrityFields',
  '/events',
  '/rewards/${encodeURIComponent(safeObjectiveId)}/claim',
].forEach(marker => {
  assert.ok(backendClient.includes(marker), `backend client should expose progression marker: ${marker}`);
});

[
  'recordBattleWin',
  'recordActivityCompleted',
  'flush',
  'MAX_BATCH_SIZE',
].forEach(marker => {
  assert.ok(progressionClient.includes(marker), `progression client should expose queue marker: ${marker}`);
});

assert.ok(authService.includes('ProgressionService.flush'), 'auth success should flush the current account progression queue');

const battleWonSource = game.slice(
  game.indexOf('async onBattleWon(enemies)'),
  game.indexOf('// 命环获得经验', game.indexOf('async onBattleWon(enemies)')),
);
assert.ok(battleWonSource.includes("this.mode === 'pvp'"), 'legacy PVP battle path should leave before observed PVE events');
assert.ok(battleWonSource.includes('ProgressionService.recordBattleWin'), 'PVE victory should enqueue a cross-mode battle receipt');
assert.ok(battleWonSource.indexOf("this.mode === 'pvp'") < battleWonSource.indexOf('ProgressionService.recordBattleWin'), 'legacy PVP return should happen before client-observed receipt');
assert.ok(battleWonSource.includes("? 'challenge'"), 'battle receipt should distinguish challenge mode');
assert.ok(battleWonSource.includes("? 'expedition'"), 'battle receipt should distinguish expedition mode');
assert.ok(battleWonSource.includes(": 'pve'"), 'battle receipt should preserve ordinary PVE mode');

const challengeFinalize = challengeHub.slice(
  challengeHub.indexOf('challengeHubMethods.finalizeActiveChallengeRun'),
  challengeHub.indexOf('challengeHubMethods.grantChallengePvpCoins'),
);
assert.ok(challengeHub.includes('ProgressionService'), 'challenge hub should import progression client');
assert.ok(challengeFinalize.includes('ProgressionService.recordActivityCompleted'), 'completed challenge should enqueue activity completion');
assert.ok(challengeFinalize.includes('!run.replayOnly') && challengeFinalize.includes('!run.practiceOnly') && challengeFinalize.includes('options.completed'), 'challenge bridge should exclude replay, practice and failed runs');
assert.ok(challengeFinalize.includes("mode: 'challenge'"), 'challenge completion should use challenge mode');

const expeditionFinalize = expeditionHub.slice(
  expeditionHub.indexOf('expeditionHubMethods.finalizeExpeditionChapter'),
  expeditionHub.indexOf('expeditionHubMethods.getLatestRunSlate'),
);
assert.ok(expeditionHub.includes('ProgressionService'), 'expedition hub should import progression client');
assert.ok(expeditionFinalize.includes('ProgressionService.recordActivityCompleted'), 'realm-clear expedition should enqueue activity completion');
assert.ok(expeditionFinalize.includes("reason === 'realm_clear'"), 'expedition bridge should exclude failed chapters');
assert.ok(expeditionFinalize.includes("mode: 'expedition'"), 'expedition completion should use expedition mode');

[
  'makeTrustedPvpProgressionEvent',
  'recordTrustedProgressionSettlement',
  'INSERT OR IGNORE INTO progression_events',
  "trustTier: 'server_authoritative'",
].forEach(marker => {
  assert.ok(liveSettlement.includes(marker) || progressionService.includes(marker), `live settlement should own trusted progression marker: ${marker}`);
});
assert.ok(progressionRoute.includes("router.post('/events'"), 'progression route should expose observed event ingestion');
assert.ok(progressionRoute.includes("router.get('/ops/overview'"), 'progression route should expose aggregate ops overview');

[
  '`server_authoritative`',
  '`client_observed`',
  '不能证明客户端报告的战斗结果真实',
  '不得兑换战力、PVP 积分',
  '不包含线上部署',
].forEach(marker => {
  assert.ok(documentation.includes(marker), `progression documentation should pin authority boundary: ${marker}`);
});

console.log('Progression bridge checks passed.');
