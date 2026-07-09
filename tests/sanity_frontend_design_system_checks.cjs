const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const designSystemCss = read('css/design-system.css');
const frontendUpgradeCss = read('css/frontend-upgrade.css');
const uiGalleryAudit = read('tests/browser_ui_gallery_audit.mjs');
const releaseCoverageChecks = read('tests/sanity_release_gate_coverage_checks.cjs');
const runNodeChecks = read('tests/run_node_checks.sh');

[
  '--fd-space-1',
  '--fd-space-2',
  '--fd-space-3',
  '--fd-space-4',
  '--fd-radius-panel',
  '--fd-radius-control',
  '--fd-hit-target',
  '--fd-surface-panel',
  '--fd-surface-panel-strong',
  '--fd-border-muted',
  '--fd-border-strong',
  '--fd-text-muted',
  '--fd-accent-gold',
  '--fd-accent-blue',
].forEach((needle) => {
  assert.ok(designSystemCss.includes(needle), `design system should expose reusable token: ${needle}`);
});

[
  '.fd-surface',
  '.fd-panel',
  '.fd-control',
  '.fd-button',
  '.fd-button-primary',
  '.fd-tab',
  '.fd-chip',
  '.fd-scroll-area',
  '.fd-action-bar',
  '.fd-mobile-stack',
].forEach((needle) => {
  assert.ok(designSystemCss.includes(needle), `design system should define primitive class: ${needle}`);
});

[
  'var(--fd-surface-panel)',
  'var(--fd-radius-panel)',
  'var(--fd-hit-target)',
  'var(--fd-space-3)',
].forEach((needle) => {
  assert.ok(frontendUpgradeCss.includes(needle), `frontend upgrade layer should consume fd token: ${needle}`);
});

[
  '.character-selection-container',
  '#map-screen .map-screen-v3',
  '.reward-shell',
  '#pvp-screen .pvp-live-status-card',
  '#pvp-screen .pvp-live-seat-panel',
  '#pvp-screen .pvp-live-event-panel',
  '.collection-tab-btn',
  '#pvp-screen .rune-tab',
  '#pvp-screen .pvp-live-action-bar .challenge-btn',
  '.reward-actions button',
  '#map-screen [data-map-action]',
  '#pvp-screen .pvp-live-mode-boundary',
  '#pvp-screen .pvp-live-action-receipt',
  '#pvp-screen .pvp-live-public-status',
  '#pvp-screen .pvp-live-seat-badge',
  '#map-screen .map-status-chip',
  '.reward-section-eyebrow',
].forEach((needle) => {
  assert.ok(
    frontendUpgradeCss.includes(needle),
    `highest-impact frontend surface should be adopted by the phase-1 design-system layer: ${needle}`,
  );
});

[
  'collectDesignSystemProbe',
  'design system primitives are loaded and adopted on the visible character selection shell',
  'design system primitives are loaded and adopted on the visible map controls',
  'design system primitives are loaded and adopted on the visible reward controls',
  'design system primitives are loaded and adopted on the visible pvp live controls',
  'fdTokenChecks',
  'fdSurfaceChecks',
  'activeScreenId',
  'requireViewportFit',
].forEach((needle) => {
  assert.ok(uiGalleryAudit.includes(needle), `browser UI gallery audit should cover design-system marker: ${needle}`);
});

[
  'sanity_frontend_design_system_checks.cjs',
  'collectDesignSystemProbe',
  'fdTokenChecks',
  'fdSurfaceChecks',
].forEach((needle) => {
  assert.ok(
    releaseCoverageChecks.includes(needle) || runNodeChecks.includes(needle),
    `release/node gate should pin design-system coverage marker: ${needle}`,
  );
});

console.log('Frontend design system checks passed.');
