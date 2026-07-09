const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const designSystemCss = read('css/design-system.css');
const frontendUpgradeCss = read('css/frontend-upgrade.css');
const uiGalleryAudit = read('tests/browser_ui_gallery_audit.mjs');
const nodeGate = read('tests/run_node_checks.sh');
const releaseCoverage = read('tests/sanity_release_gate_coverage_checks.cjs');

[
  '--fd-mobile-edge',
  '--fd-safe-bottom',
  '--fd-mobile-action-gap',
  '--fd-sticky-action-offset',
].forEach((needle) => {
  assert.ok(designSystemCss.includes(needle), `design system should expose mobile interaction token: ${needle}`);
});

[
  '.fd-safe-scroll',
  '.fd-safe-action-bar',
  '.fd-touch-grid',
].forEach((needle) => {
  assert.ok(designSystemCss.includes(needle), `design system should define mobile interaction primitive: ${needle}`);
});

[
  '.character-selection-footer',
  '#map-screen .map-footer',
  '.reward-actions',
  '#pvp-screen .pvp-nav-footer',
  '.expedition-branch-card',
  '.expedition-bounty-card',
  '[data-expedition-action]',
  'env(safe-area-inset-bottom)',
  'var(--fd-safe-bottom)',
  'var(--fd-mobile-action-gap)',
  'var(--fd-sticky-action-offset)',
  'scroll-padding-bottom',
].forEach((needle) => {
  assert.ok(frontendUpgradeCss.includes(needle), `frontend upgrade should adopt mobile interaction system marker: ${needle}`);
});

[
  'expedition-branch-card',
  'expedition-bounty-card',
].forEach((needle) => {
  assert.ok(read('js/core/expedition_hub.js').includes(needle), `expedition map panels should expose mobile-priority class: ${needle}`);
});

[
  '--fd-safe-bottom',
  '.fd-safe-action-bar',
  '.fd-touch-grid',
  'mobile interaction primitives keep safe action bars and touch grids measurable',
  'fdMobileInteractionChecks',
].forEach((needle) => {
  assert.ok(uiGalleryAudit.includes(needle), `browser UI gallery audit should prove mobile interaction primitive: ${needle}`);
});

[
  'safeBottomLimit',
  'initialPrimaryCtaOk',
  'isRectInSafeTapZone',
].forEach((needle) => {
  assert.ok(read('tests/browser_mobile_layout_audit.mjs').includes(needle), `mobile layout audit should enforce safe first-screen CTA marker: ${needle}`);
});

[
  'safeBottomLimit',
  'safeAreaOk',
].forEach((needle) => {
  assert.ok(read('tests/browser_reward_meta_mobile_audit.mjs').includes(needle), `reward mobile audit should enforce safe-area CTA marker: ${needle}`);
});

[
  'node tests/sanity_mobile_interaction_system_checks.cjs',
].forEach((needle) => {
  assert.ok(nodeGate.includes(needle), `node gate should run mobile interaction system check: ${needle}`);
  assert.ok(releaseCoverage.includes(needle), `release coverage gate should enforce mobile interaction system check: ${needle}`);
});

console.log('Mobile interaction system checks passed.');
