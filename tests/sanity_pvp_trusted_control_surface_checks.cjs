const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const html = read('index.html');
const upgradeCss = read('css/frontend-upgrade.css');
const liveBrowserAudit = read('tests/browser_pvp_live_audit.mjs');
const nodeGate = read('tests/run_node_checks.sh');
const releaseCoverage = read('tests/sanity_release_gate_coverage_checks.cjs');

[
  'data-live-trust-grid',
  'data-live-trust-item="match-quality"',
  'data-live-trust-item="mode-boundary"',
  'data-live-trust-item="turn-timer"',
  'data-live-trust-item="connection"',
  'data-live-trust-item="realtime"',
  'data-live-trust-item="fairness"',
  'data-live-trust-item="action-receipt"',
  'data-live-trust-item="momentum"',
  'data-live-trust-item="intent"',
  'data-live-command-rail',
  'data-live-command-group="queue"',
  'data-live-command-group="turn"',
  'data-live-command-group="practice"',
  'data-live-command-group="danger"',
].forEach((needle) => {
  assert.ok(html.includes(needle), `live PVP trusted control surface should expose marker: ${needle}`);
});

[
  ['pvp-live-connection-status', 'data-live-connection-status'],
  ['pvp-live-realtime-status', 'data-live-realtime-status'],
  ['pvp-live-action-receipt', 'data-live-action-receipt'],
].forEach(([className, marker]) => {
  const pattern = new RegExp(`<div\\b(?=[^>]*class="[^"]*${className})(?=[^>]*${marker})(?=[^>]*role="status")(?=[^>]*aria-live="polite")`, 's');
  assert.ok(pattern.test(html), `${className} should be an aria-live status region`);
});

[
  '#pvp-screen .pvp-live-trust-grid',
  '#pvp-screen .pvp-live-trust-grid > [data-live-trust-item]',
  '#pvp-screen .pvp-live-trust-grid > [data-live-trust-item="mode-boundary"]',
  '#pvp-screen .pvp-live-trust-grid > [data-live-trust-item="action-receipt"]',
  '#pvp-screen .pvp-live-command-rail',
  '#pvp-screen .pvp-live-command-group',
  '#pvp-screen .pvp-live-command-group[data-live-command-group="danger"]',
].forEach((needle) => {
  assert.ok(upgradeCss.includes(needle), `frontend upgrade CSS should style trusted PVP control surface: ${needle}`);
});

[
  'pvp live trusted control surface keeps essential idle status and command rail readable',
  'data-live-trust-grid',
  'data-live-trust-item',
  'data-live-command-rail',
  'data-live-command-group',
  "['match-quality', 'mode-boundary', 'connection', 'realtime']",
  "['turn-timer', 'fairness', 'action-receipt', 'momentum', 'intent']",
  '!mediumEntryProbe.trustItems.some',
  "['flex', 'grid'].includes(mediumEntryProbe.commandRailDisplay)",
  'ariaLive',
].forEach((needle) => {
  assert.ok(liveBrowserAudit.includes(needle), `browser live PVP audit should prove trusted control surface: ${needle}`);
});

[
  'node tests/sanity_pvp_trusted_control_surface_checks.cjs',
].forEach((needle) => {
  assert.ok(nodeGate.includes(needle), `node gate should run trusted PVP control surface check: ${needle}`);
  assert.ok(releaseCoverage.includes(needle), `release coverage gate should enforce trusted PVP control surface check: ${needle}`);
});
