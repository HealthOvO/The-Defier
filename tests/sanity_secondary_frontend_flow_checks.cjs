const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const indexHtml = read('index.html');
const gameSource = read('js/game.js');
const frontendUpgradeCss = read('css/frontend-upgrade.css');
const challengeHubSource = read('js/core/challenge_hub.js');
const rewardViewSource = read('js/views/RewardView.js');

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
const requestLogoutSection = sliceBetween(gameSource, 'requestLogout() {', '\n  async checkForCloudSave() {');

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
  /this\.requestLogout\(\);/,
  'handleLoginMenuAction should delegate logout to requestLogout when already logged in',
);
assertHasPattern(
  requestLogoutSection,
  /this\.showConfirmModal\(/,
  'requestLogout should remain implemented as a dedicated logout flow',
);

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
    /scroll-snap-type:\s*x mandatory;/,
    /scroll-padding-inline:\s*8px;/,
  ],
  'save slots mobile shell',
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
  /panel\.open\s*=\s*typeof window === 'undefined' \|\| !window\.matchMedia\('\(max-width: 840px\)'\)\.matches;/,
  'reward expedition disclosure should default open only off mobile',
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

console.log('Secondary frontend flow sanity checks passed.');
