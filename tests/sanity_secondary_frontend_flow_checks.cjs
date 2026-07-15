const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const indexHtml = read('index.html');
const gameSource = read('js/game.js');
const frontendUpgradeCss = read('css/frontend-upgrade.css');
const styleCss = read('css/style.css');
const eventsCss = read('css/events.css');
const challengeHubSource = read('js/core/challenge_hub.js');
const rewardViewSource = read('js/views/RewardView.js');
const systemViewSource = read('js/views/SystemView.js');
const browserFrontendLayoutAudit = read('tests/browser_frontend_layout_audit.mjs');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(source, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = source.match(new RegExp(pattern.source, flags));
  return matches ? matches.length : 0;
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end >= 0, `missing end marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

function assertHasPattern(source, pattern, message) {
  assert.ok(pattern.test(source), message);
}

function assertSelectorBlockHas(cssSource, selector, patterns, messagePrefix) {
  const selectorPattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]{0,700}?)\\}`, 'g');
  const blocks = Array.from(cssSource.matchAll(selectorPattern)).map((match) => match[1]);
  assert.ok(blocks.length > 0, `${messagePrefix}: missing selector ${selector}`);
  patterns.forEach((pattern) => {
    assert.ok(
      blocks.some((block) => pattern.test(block)),
      `${messagePrefix}: selector ${selector} should include ${pattern}`,
    );
  });
}

assertHasPattern(
  indexHtml,
  /'open-login'\s*:\s*\(\)\s*=>\s*window\.game\.handleLoginMenuAction\(\)/,
  'boot action open-login should route through game.handleLoginMenuAction',
);
assert.strictEqual(
  countMatches(indexHtml, /'open-login'\s*:/),
  1,
  'boot action open-login should only be declared once',
);
assertHasPattern(
  indexHtml,
  /<button[^>]*id="login-btn"[^>]*data-boot-action="open-login"[^>]*>/,
  'login button should use the open-login boot action',
);

const checkLoginStatusSection = sliceBetween(gameSource, 'checkLoginStatus() {', '\n  handleLoginMenuAction() {');
const handleLoginMenuActionSection = sliceBetween(gameSource, 'handleLoginMenuAction() {', '\n  requestLogout() {');
const showChallengeHubSection = sliceBetween(gameSource, "showChallengeHub(tab = 'daily') {", '\n  initChallengeHub() {');
const requestLogoutSection = sliceBetween(gameSource, 'requestLogout() {', '\n  async checkForCloudSave() {');
const gameShowLoginSection = sliceBetween(gameSource, 'showLoginModal() {', '\n  async handleLogin() {');
const systemShowLoginSection = sliceBetween(systemViewSource, '  showLoginModal() {', '\n  renderSaveSlots(slots) {');

assertHasPattern(
  checkLoginStatusSection,
  /const btn = document\.getElementById\('login-btn'\);/,
  'checkLoginStatus should target login-btn',
);
assertHasPattern(
  checkLoginStatusSection,
  /btn\.onclick\s*=\s*null;/,
  'checkLoginStatus should clear any legacy onclick handler',
);
assert.strictEqual(
  countMatches(checkLoginStatusSection, /btn\.onclick\s*=/),
  1,
  'checkLoginStatus should not bind a second onclick for login-btn',
);
assertHasPattern(
  checkLoginStatusSection,
  /btn\.dataset\.bootAction\s*=\s*'open-login';/,
  'checkLoginStatus should keep login-btn on the delegated boot action',
);
assertHasPattern(
  handleLoginMenuActionSection,
  /this\.showSocialHub\('friends'\);/,
  'handleLoginMenuAction should open the account and social hub when already logged in',
);
assertHasPattern(
  showChallengeHubSection,
  /\['daily', 'weekly', 'global', 'rift'\]\.includes\(tab\)/,
  'cold challenge hub routing should preserve the world rift tab',
);
assertHasPattern(
  gameSource,
  /const pvpScene = this\.getPvpScene\(\);[\s\S]{0,180}pvpScene\.handleAuthStateChanged\(\)/,
  'auth refresh should use the optional deferred PVP scene instance',
);
assert.ok(
  !/\bif \(PVPScene &&/.test(gameSource),
  'lazy PVP integration must not read an undeclared global scene during auth transitions',
);
assertHasPattern(
  requestLogoutSection,
  /this\.showConfirmModal\(/,
  'requestLogout should remain implemented as a dedicated logout flow',
);
assertHasPattern(
  requestLogoutSection,
  /document\.getElementById\('auth-modal'\)\?\.classList\.remove\('active'\);/,
  'requestLogout should close any stale auth modal before opening logout confirmation',
);
[
  ['game showLoginModal', gameShowLoginSection],
  ['SystemView showLoginModal', systemShowLoginSection],
].forEach(([label, source]) => {
  assertHasPattern(
    source,
    /AuthService\.isLoggedIn\?\.\(\)/,
    `${label} should refuse to open the auth form for an authenticated account`,
  );
  assertHasPattern(
    source,
    /classList\.remove\('active'\)/,
    `${label} should clear a stale auth modal when the account is already authenticated`,
  );
});

assertHasPattern(
  indexHtml,
  /<header class="save-slots-header">/,
  'save slots modal should expose a save-slots-header element',
);
assertHasPattern(
  indexHtml,
  /<div class="slots-container" id="slots-container">/,
  'save slots modal should expose slots-container',
);
assertSelectorBlockHas(
  frontendUpgradeCss,
  '#save-slots-modal .slots-container',
  [
    /grid-auto-flow:\s*column;/,
    /overflow-x:\s*auto;/,
    /scroll-snap-type:\s*none;/,
    /scroll-padding-inline:\s*8px;/,
  ],
  'save slots mobile shell',
);
assertSelectorBlockHas(
  frontendUpgradeCss,
  '#save-slots-modal .save-slots-footer',
  [/display:\s*flex;/],
  'save slots mobile footer',
);

assertSelectorBlockHas(
  frontendUpgradeCss,
  '#character-selection-screen .character-cards-wrapper',
  [
    /grid-auto-flow:\s*column;/,
    /overflow-x:\s*auto;/,
    /scroll-snap-type:\s*x mandatory;/,
    /scroll-padding-inline:\s*18px;/,
  ],
  'character selection mobile carousel',
);
assertSelectorBlockHas(
  frontendUpgradeCss,
  '#character-selection-screen .character-card.challenge-card-locked',
  [/display:\s*none;/],
  'challenge-only locked characters',
);

assertHasPattern(
  challengeHubSource,
  /banner = document\.createElement\('details'\);/,
  'challenge banner should render as a native details element',
);
assertHasPattern(
  challengeHubSource,
  /<summary class="challenge-selection-head">/,
  'challenge banner should render a summary disclosure header',
);
assertHasPattern(
  challengeHubSource,
  /<span class="challenge-tag">天道裁定<\/span>/,
  'challenge authority tags should use player-facing copy',
);
assert.ok(
  !challengeHubSource.includes('<span class="challenge-tag">server_authoritative</span>'),
  'challenge screens should not expose internal trust-tier labels',
);
assert.ok(
  !challengeHubSource.includes('准入条件：server_authoritative + server_replayed + fullReplayPassed'),
  'challenge admission rules should not expose internal implementation flags',
);
[
  '均衡计分',
  '正式得分按基础表现结算',
  '确认出战即占用一次正式次数',
  '贡献由基础表现、战斗得分、生存状态与回合节奏共同结算',
].forEach((copy) => {
  assert.ok(challengeHubSource.includes(copy), `challenge screens should pin player-facing scoring copy: ${copy}`);
});
[
  'officialScore = server authoritative score',
  '预留 attempt 即消耗额度',
  'contribution = clamp(300 + score * 2',
].forEach((copy) => {
  assert.ok(!challengeHubSource.includes(copy), `challenge screens should not expose scoring implementation text: ${copy}`);
});
assertHasPattern(
  frontendUpgradeCss,
  /\.challenge-selection-banner\s*>\s*summary/,
  'challenge banner styles should target the summary trigger',
);

assertHasPattern(
  indexHtml,
  /<details id="reward-expedition-meta" class="reward-expedition-meta"[^>]*><\/details>/,
  'reward expedition meta container should be a details element',
);
assertHasPattern(
  indexHtml,
  /<details id="reward-run-path-meta" class="reward-run-path-meta"[^>]*><\/details>/,
  'reward run-path meta container should be a details element',
);

const rewardExpeditionSection = sliceBetween(rewardViewSource, 'renderRewardExpeditionMeta() {', '\n  renderRewardRunPathMeta() {');
const rewardRunPathSection = sliceBetween(rewardViewSource, 'renderRewardRunPathMeta() {', '\n  updateRewardNextStepCard(state = \'pending\', detail = \'\') {');

assertHasPattern(
  rewardExpeditionSection,
  /panel\.open\s*=\s*typeof window === 'undefined'\s*\|\|\s*!window\.matchMedia\('\(max-width: 840px\)'\)\.matches;/,
  'reward expedition disclosure should default closed on mobile',
);
assertHasPattern(
  browserFrontendLayoutAudit,
  /panelInitiallyOpen[\s\S]{0,240}panel\.querySelector\(':scope > summary'\)\?\.click\(\)/,
  'reward layout audit should expand the disclosure through its summary before checking mobile CTAs',
);
assertHasPattern(
  rewardExpeditionSection,
  /<summary class="reward-disclosure-summary">/,
  'RewardView should render expedition disclosure summary',
);
assertHasPattern(
  rewardRunPathSection,
  /panel\.open\s*=\s*typeof window === 'undefined' \|\| !window\.matchMedia\('\(max-width: 840px\)'\)\.matches;/,
  'reward run-path disclosure should default open only off mobile',
);
assertHasPattern(
  rewardRunPathSection,
  /<summary class="reward-disclosure-summary">/,
  'RewardView should render run-path disclosure summary',
);
assert.ok(
  countMatches(rewardViewSource, /<summary class="reward-disclosure-summary">/) >= 2,
  'RewardView should render disclosure summaries for both expedition and run-path reward panels',
);

assertHasPattern(
  gameSource,
  /resetScreenScrollPosition\(screen\)[\s\S]{0,500}'\.reward-container'/,
  'screen navigation should reset the reward scroll owner before each reward entry',
);
assertHasPattern(
  systemViewSource,
  /<div class="intro-character-grid">/,
  'guide character cards should use a responsive class instead of a fixed inline grid',
);
assertHasPattern(
  styleCss,
  /@media \(max-width: 480px\)[\s\S]{0,180}\.intro-character-grid\s*\{[\s\S]{0,100}grid-template-columns:\s*minmax\(0, 1fr\);/,
  'guide character cards should collapse to one column on narrow phones',
);
assertHasPattern(
  styleCss,
  /\.collection-inline-btn\.compact\s*\{[\s\S]{0,100}min-width:\s*44px;/,
  'compact challenge controls should still meet the 44px touch target',
);
assertHasPattern(
  eventsCss,
  /#event-modal \.event-body\s*\{[\s\S]{0,260}overflow-y:\s*auto;/,
  'long event and camp choices should scroll inside the stable modal frame',
);
assertHasPattern(
  frontendUpgradeCss,
  /#battle-screen #battle-command-panel \.battle-advisor-toggle\s*\{[\s\S]{0,140}min-height:\s*var\(--fd-hit-target\);/,
  'mobile battle advisor toggle should keep the design-system hit target despite legacy specificity',
);
assertHasPattern(
  styleCss,
  /\.battle-advisor-details > summary\s*\{[\s\S]{0,120}min-height:\s*44px;/,
  'battle advisor detail disclosure should keep a 44px touch target',
);
assertHasPattern(
  gameSource,
  /if \(!\['localhost', '127\.0\.0\.1', '::1'\]\.includes\(host\)\) return null;/,
  'automation boot routes should stay unavailable on production hosts',
);
assertHasPattern(
  gameSource,
  /if \(config\.mode === 'guest-camp'\) \{[\s\S]{0,260}this\.showCampfire\(surfaceNode\);/,
  'local automation should expose a deterministic camp state for browser layout audits',
);
assertHasPattern(
  gameSource,
  /'guest-event'[\s\S]{0,160}'guest-trial'[\s\S]{0,160}'guest-forge'[\s\S]{0,160}'guest-shop'[\s\S]{0,160}'guest-reward'/,
  'local automation should expose deterministic strategic surfaces instead of relying on random map generation',
);
assertHasPattern(
  gameSource,
  /if \(config\.mode === 'guest-event'\) \{[\s\S]{0,320}cloneEventTemplate\(config\.eventId\)[\s\S]{0,180}this\.showEventModal\(event, surfaceNode\);/,
  'event automation should resolve a real event template and open the production modal path',
);
assertHasPattern(
  gameSource,
  /if \(config\.mode === 'guest-shop'\) \{[\s\S]{0,260}this\.showShop\(surfaceNode\);/,
  'shop automation should render the production shop screen with a stable wallet',
);
assertHasPattern(
  gameSource,
  /if \(config\.mode === 'guest-reward'\) \{[\s\S]{0,300}this\.showRewardScreen\(config\.rewardGold, false, null, config\.rewardRingExp/,
  'reward automation should render the production reward screen with deterministic rewards',
);
assertHasPattern(
  gameSource,
  /if \(config\.mode === 'guest-save-slots'\) \{[\s\S]{0,700}renderSaveSlots\([\s\S]{0,420}currentHp: 0/,
  'save slots automation should expose a deterministic mobile history entry',
);
assertHasPattern(
  gameSource,
  /if \(config\.mode === 'guest-save-conflict'\) \{[\s\S]{0,320}this\.showSaveConflictModal\([\s\S]{0,260}currentHp: 0, gold: 0/,
  'save conflict automation should preserve and expose legitimate zero values',
);
assertHasPattern(
  gameSource,
  /if \(config\.mode === 'guest-save-history'\) \{[\s\S]{0,1400}renderCloudSaveHistory\([\s\S]{0,900}currentHp: 0, gold: 0/,
  'save history automation should expose a deterministic restorable revision',
);
assertHasPattern(
  systemViewSource,
  /const formatNumber = value => value !== null && value !== '' && Number\.isFinite\(Number\(value\)\) \? Number\(value\) : '\?';/,
  'save conflict summaries should render numeric zero instead of treating it as missing',
);
assertHasPattern(
  systemViewSource,
  /const hpValue = slotData\.player\?\.currentHp;[\s\S]{0,180}Number\.isFinite\(Number\(hpValue\)\)/,
  'save slot summaries should render numeric zero instead of treating it as missing',
);
assertHasPattern(
  frontendUpgradeCss,
  /#save-slots-modal \.slot-actions \.talisman-btn,[\s\S]{0,180}#save-slots-modal \.slot-actions \.save-history-btn[\s\S]{0,180}min-height:\s*44px;/,
  'mobile save slot actions should keep a 44px touch target',
);
assertSelectorBlockHas(
  styleCss,
  '.save-history-btn',
  [/min-height:\s*44px;/],
  'save history entry button',
);
assertSelectorBlockHas(
  styleCss,
  '.cloud-history-restore-btn',
  [/min-height:\s*44px;/],
  'cloud history restore button',
);
assertHasPattern(
  frontendUpgradeCss,
  /@media \(min-width: 769px\) and \(max-height: 680px\)[\s\S]{0,1800}#shop-screen \.shop-section h3/,
  'short desktop shop should compact its header, summary and section rhythm together',
);
assertHasPattern(
  frontendUpgradeCss,
  /\.modal\.upgrade-mode \.upgrade-card-grid\s*\{[\s\S]{0,520}scroll-snap-type:\s*x proximity;/,
  'mobile camp upgrades should expose a readable horizontal card rail',
);
assertHasPattern(
  frontendUpgradeCss,
  /@media \(min-width: 560px\) and \(max-width: 768px\) and \(max-height: 520px\)[\s\S]{0,900}\.modal\.upgrade-mode \.upgrade-modal-layout\s*\{[\s\S]{0,80}flex-direction:\s*row;/,
  'short landscape camp upgrades should keep selection and preview visible side by side',
);

console.log('Secondary frontend flow sanity checks passed.');
