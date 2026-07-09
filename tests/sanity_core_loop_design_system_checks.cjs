const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const frontendUpgradeCss = read('css/frontend-upgrade.css');
const uiGalleryAudit = read('tests/browser_ui_gallery_audit.mjs');
const releaseCoverageChecks = read('tests/sanity_release_gate_coverage_checks.cjs');
const runNodeChecks = read('tests/run_node_checks.sh');

[
  '#battle-screen #battle-command-panel',
  '#battle-screen #boss-act-panel',
  '#battle-screen .battle-command-btn',
  '#battle-screen .battle-advisor-toggle',
  '#battle-screen #end-turn-btn',
  '#battle-screen #hand-cards .card',
  '#map-screen .map-detail-panels',
  '#map-screen .map-footer',
  '#map-screen .map-node-v3',
  '#map-screen .expedition-panel-card',
  '#map-screen .map-route-chip',
  '#reward-screen .reward-panel',
  '#reward-screen .reward-expedition-meta',
  '#reward-screen [data-season-board-handoff-cta="true"]',
].forEach((needle) => {
  assert.ok(
    frontendUpgradeCss.includes(needle),
    `core play-loop surface should be adopted by the phase-2 design-system layer: ${needle}`,
  );
});

[
  'collectCoreLoopDesignSystemProbe',
  'core play-loop design system primitives are visible on battle HUD',
  'core play-loop design system primitives are visible on map route controls',
  'core play-loop design system primitives are visible on reward handoff controls',
  'coreLoopSurfaceChecks',
  'coreLoopHitTargetChecks',
].forEach((needle) => {
  assert.ok(uiGalleryAudit.includes(needle), `browser UI gallery audit should cover core-loop marker: ${needle}`);
});

[
  'sanity_core_loop_design_system_checks.cjs',
  'collectCoreLoopDesignSystemProbe',
  'coreLoopSurfaceChecks',
  'coreLoopHitTargetChecks',
].forEach((needle) => {
  assert.ok(
    releaseCoverageChecks.includes(needle) || runNodeChecks.includes(needle),
    `release/node gate should pin core-loop design-system coverage marker: ${needle}`,
  );
});

console.log('Core loop design system checks passed.');
