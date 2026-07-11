const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const html = read('index.html');
const game = read('js/game.js');
const view = read('js/views/SeasonOpsView.js');
const systemView = read('js/views/SystemView.js');
const css = read('css/season-ops.css');
const challengeRules = read('js/data/challenge_rules.js');

[
  'id="season-ops-screen"',
  "game.showSeasonOps('contracts')",
  'aria-label="赛季司"',
].forEach(marker => {
  assert.ok(html.includes(marker), `season ops entry should include ${marker}`);
});

[
  'import { SeasonOpsView }',
  "showSeasonOps(tab = 'contracts')",
  "this.showScreen('season-ops-screen')",
  'this.seasonOpsView.show({ tab })',
  'this.seasonOpsView.handleAuthStateChanged()',
].forEach(marker => {
  assert.ok(game.includes(marker), `game integration should include ${marker}`);
});

[
  'const TAB_ORDER = ["contracts", "store", "leaderboard", "ledger"]',
  'getSeasonOpsDashboard({ expectedUserId })',
  'claimProgressionReward(safeObjectiveId, safeCycleId)',
  'purchaseSeasonOpsOffer(safeOfferId, safeSeasonId',
  'this.purchaseMutationIds.get(safeOfferId)',
  'this.purchaseMutationIds.set(safeOfferId, mutationId)',
  'this.purchaseMutationIds.delete(safeOfferId)',
  '!offer.available',
  '商店未开放',
  'this.isStaleResponse(requestId, expectedUserId, generation)',
  'generation !== this.viewGeneration',
  'cursor !== this.dashboard.ledgerNextCursor',
  'window.addEventListener("storage", this.boundStorageHandler)',
  'role="tablist"',
  'role="tab"',
  'aria-selected=',
  'role="tabpanel"',
  'aria-live=',
  'this.isSameUser(userId)',
  'requestPurchaseConfirmation(offer)',
  'data-season-ops-action="switch-tab"',
  'aria-label="返回主菜单"',
  'data-season-ops-action="claim"',
  'data-season-ops-action="purchase"',
  'data-season-ops-action="load-ledger"',
  'getSeasonOpsLedger({',
  '只统计正式真人对局的服务端权威结算',
  '奖励不影响战力',
].forEach(marker => {
  assert.ok(view.includes(marker), `season ops view should include ${marker}`);
});

[
  '奖励均为 cosmetic_only',
  '仅限 cosmetic_only',
  '不暴露内部 source id',
  '同一 mutation 会复用原回执',
].forEach(copy => {
  assert.ok(!view.includes(copy), `player-facing UI must not expose protocol copy: ${copy}`);
});
assert.doesNotMatch(challengeRules, /kind:\s*['"]pvp(?:Coins|Item)['"]/, 'challenge rewards must not write the legacy PVP economy');
assert.doesNotMatch(challengeRules, /天道币/, 'challenge reward copy must not promise legacy PVP currency');
assert.match(
  systemView,
  /const finishConfirmation = confirmed => \{[\s\S]*?typeof onCancel === 'function'[\s\S]*?onCancel\(\)/,
  'closing a purchase confirmation must resolve it through the cancel callback',
);
assert.ok(systemView.includes("event.key === 'Escape'"), 'purchase confirmation should handle Escape inside the dialog');
assert.ok(systemView.includes("event.key !== 'Tab'"), 'purchase confirmation should trap Tab focus inside the dialog');
assert.ok(systemView.includes("closeBtn.setAttribute('aria-label', '关闭确认框')"), 'purchase confirmation close control should have an accessible name');
assert.ok(game.includes('activeConfirm.__systemCancelHandler();'), 'programmatic modal closure should resolve an active confirmation through its cancel path');

[
  '#season-ops-screen',
  '@media (max-width: 768px)',
  '@media (max-width: 430px)',
  'overflow-x: hidden',
  'grid-template-columns: repeat(2, minmax(0, 1fr))',
  'overflow-wrap: anywhere',
].forEach(marker => {
  assert.ok(css.includes(marker), `season ops responsive CSS should include ${marker}`);
});

assert.doesNotMatch(css, /radial-gradient/i, 'season ops must not use decorative gradient orbs');
for (const match of css.matchAll(/letter-spacing:\s*([^;]+);/g)) {
  assert.equal(match[1].trim(), '0', 'season ops letter spacing must remain zero');
}

console.log('Season ops UI checks passed.');
