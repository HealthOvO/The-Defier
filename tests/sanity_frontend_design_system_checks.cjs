const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const designSystemCss = read('css/design-system.css');
const frontendUpgradeCss = read('css/frontend-upgrade.css');
const pvpCss = read('css/pvp.css');
const indexHtml = read('index.html');
const gameSource = read('js/game.js');
const mapView = read('js/views/MapView.js');
const battleRuntime = read('js/core/battle.js');
const characterSelectView = read('js/views/CharacterSelectView.js');
const rewardView = read('js/views/RewardView.js');
const systemView = read('js/views/SystemView.js');
const eventView = read('js/views/EventView.js');
const campfireView = read('js/views/CampfireView.js');
const inventoryView = read('js/views/InventoryView.js');
const uiGalleryAudit = read('tests/browser_ui_gallery_audit.mjs');
const automationBootAudit = read('tests/browser_automation_boot_audit.mjs');
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
  '.map-intel-drawer',
  '.battle-control-rail',
  '.story-intro-summary',
  '.reward-popup-content',
  '.system-prompt-content',
  '#reward-screen .reward-cards',
].forEach((needle) => {
  assert.ok(frontendUpgradeCss.includes(needle), `visual-density layer should own responsive surface: ${needle}`);
});

assert.ok(indexHtml.includes('class="battle-control-rail"'), 'battle environment and commands should share one semantic control rail');
assert.ok(mapView.includes('id="map-intel-drawer"'), 'map detail and expedition content should share one intel drawer');
assert.ok(mapView.includes("shell.classList.remove('show-map-tools')"), 'opening map intel should close the tools lane');
assert.ok(mapView.includes("shell.classList.remove('show-map-intel')"), 'opening map tools should close the intel drawer');
assert.ok(battleRuntime.includes("panel.closest('.battle-control-rail')"), 'battle command panel should no longer support free overlap while docked');
assert.ok(battleRuntime.includes('controlRail.appendChild(panel)'), 'battle command panel should mount inside the shared rail');
assert.ok(characterSelectView.includes("document.createElement('details')"), 'character lore should use progressive disclosure');
assert.ok(characterSelectView.includes("data-character-select"), 'character cards should use a native selection control');
assert.ok(characterSelectView.includes("?.setAttribute('aria-pressed'"), 'character controls should expose selection state');
assert.ok(characterSelectView.includes('details class="char-story-panel"'), 'selected character detail should use progressive disclosure');
assert.ok(rewardView.includes('reward-popup-content'), 'reward popup sizing should be CSS-owned');
assert.ok(systemView.includes('system-prompt-content'), 'system prompt sizing should be CSS-owned');
assert.ok(gameSource.includes('openModalWithFocus(modal'), 'modal openings should move focus into the active dialog');
assert.ok(gameSource.includes('closeModalElement(modal'), 'modal closures should restore the invoking control');
assert.ok(gameSource.includes("event.key !== 'Tab'"), 'shared modal focus handling should keep keyboard focus inside the active dialog');
assert.ok(systemView.includes("openModalWithFocus(modal, '.modal-close')"), 'the game guide should use shared modal focus handling');
assert.ok(systemView.includes("openModalWithFocus(modal, '#auth-username')"), 'authentication should focus its first field');
assert.ok(systemView.includes("openModalWithFocus(modal, '[data-system-action=\"select-slot\"]')"), 'save-slot selection should focus its first action');
assert.ok(eventView.includes("openModalWithFocus(modal, '.event-choice:not(.disabled)')"), 'event choices should use shared modal focus handling');
assert.ok(eventView.includes("openModalWithFocus(modal, '.event-upgrade-list [role=\"button\"]')"), 'event card upgrades should focus the first selectable card');
assert.ok(campfireView.includes("openModalWithFocus(modal, '.event-choice:not(.disabled)')"), 'campfire choices should use shared modal focus handling');
assert.ok(campfireView.includes("openModalWithFocus(modal, '.upgrade-card-grid [role=\"button\"]')"), 'campfire upgrades should focus the first selectable card');
assert.ok(campfireView.includes("openModalWithFocus(modal, '.purification-card-wrapper')"), 'campfire purification should focus the first selectable card');
assert.ok(inventoryView.includes('openModalWithFocus(modal, \'[data-inventory-action="close-treasure-bag"]\')'), 'treasure bag should use shared modal focus handling');
assert.ok(gameSource.includes('<details class="shop-advice-details">'), 'live shop renderer should collapse secondary budget guidance');
assert.ok(read('js/views/ShopView.js').includes('<details class="shop-advice-details">'), 'shop view module should mirror the live progressive-disclosure structure');
assert.ok(indexHtml.includes('class="compendium-advanced-filters"'), 'treasure compendium should collapse secondary filters and presets');
assert.match(frontendUpgradeCss, /#treasure-compendium \.compendium-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'mobile treasure compendium should keep cards in a compact two-column grid');
assert.match(frontendUpgradeCss, /#reward-screen \.reward-cards \{[\s\S]*display: grid;[\s\S]*scroll-snap-type: none;/, 'compact landscape rewards should override the mobile horizontal rail');
assert.match(frontendUpgradeCss, /#event-modal\.active::before,[\s\S]*#event-modal\.active::after \{[\s\S]*min-height: 8px;/, 'compact landscape event frames should fit inside the viewport gutters');
assert.match(frontendUpgradeCss, /#event-modal \.event-choices \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'compact landscape event choices should remain comparable in two columns');
assert.match(frontendUpgradeCss, /@media \(min-width: 560px\) and \(max-width: 1180px\) and \(max-height: 560px\)/, 'battle should define a compact landscape composition for narrow phones and tablets');
assert.match(frontendUpgradeCss, /\.battle-control-rail \.battle-command-list[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'compact battle commands should wrap into two columns instead of clipping horizontally');
assert.match(frontendUpgradeCss, /@media \(min-width: 560px\) and \(max-width: 768px\) and \(max-height: 520px\)/, 'map should define a compact landscape composition');
assert.match(pvpCss, /@media \(min-width: 769px\) and \(max-width: 960px\) and \(max-height: 560px\)/, 'PVP should define a compact landscape composition');
assert.match(pvpCss, /\.pvp-content-container > \.pvp-tab-pane\.active[\s\S]*overflow-y: auto/, 'every compact PVP tab should remain independently scrollable');

[
  '__THE_DEFIER_BOOT_CLICK_STATE__',
  '__THE_DEFIER_BOOT__',
  '__THE_DEFIER_LOAD_STATUS__',
  'the-defier:runtime-ready',
  'pendingActionId',
  "event.target.closest('[data-boot-action]')",
  'data-boot-click-queued',
].forEach((needle) => {
  assert.ok(indexHtml.includes(needle), `explicit main-menu boot dispatcher should expose marker: ${needle}`);
});
[
  'id="new-game-btn" data-boot-action="new-game"',
  'id="pvp-btn" data-boot-action="open-pvp"',
  "'open-pvp': () =>",
].forEach((needle) => {
  assert.ok(indexHtml.includes(needle), `main-menu boot action should be wired explicitly: ${needle}`);
});
assert.ok(gameSource.includes("window.dispatchEvent(new Event('the-defier:runtime-ready'))"), 'Game initialization should release queued cold-start clicks');
assert.ok(frontendUpgradeCss.includes('[data-boot-click-queued="true"]'), 'queued cold-start actions should expose visible busy feedback');
assert.ok(indexHtml.includes('id="runtime-load-status"'), 'cold-start and lazy modules should share an accessible status surface');
assert.ok(indexHtml.includes('载入时间较长，可以重试。'), 'slow cold starts should expose a retry action');
assert.ok(frontendUpgradeCss.includes('.runtime-load-status'), 'runtime loading feedback should have a stable responsive layout');
[
  'cold-start ${label} action queues before runtime and runs after Game initialization',
  'cold-start timeout exposes a visible retry action and clears it after recovery',
  'deferred ${readyKind} module failure can reload and resume the requested screen',
  "scenarioId: 'season-module-recovery'",
  "scenarioId: 'pvp-module-recovery'",
  "scenarioId: 'challenge-module-recovery'",
  "scenarioId: 'cold-start-new-game-action'",
  "scenarioId: 'cold-start-pvp-action'",
  "actionId: 'open-pvp'",
  "page.route('**/assets/index-*.js'",
  "page.route('**/js/main.js*'",
  'queuedProbe.interceptedClicks === 1',
  'replayProbe.replayedClicks === 1',
  'probe.pvpLivePaneActive',
  '!probe.pvpRankingPaneActive',
  'game is not defined|PVPScene is not defined',
].forEach((needle) => {
  assert.ok(automationBootAudit.includes(needle), `automation boot audit should cover cold-start click marker: ${needle}`);
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
