# Frontend Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade The Defier frontend visual system, core flow readability, mobile adaptation, and missing image assets in the isolated worktree.

**Architecture:** Keep the current single-page game architecture and add a focused upgrade CSS layer plus narrow HTML/data wiring. Avoid rewriting high-coupling runtime files unless a focused test requires it.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Vite build, Node sanity tests, Playwright-based browser audits, generated bitmap WebP assets.

---

## File Structure

- Create: `css/frontend-upgrade.css`
  - Shared upgrade layer for menu, character cards, reusable panels, responsive shell fixes, and light visual normalization.
- Modify: `index.html`
  - Include `css/frontend-upgrade.css`.
  - Add main-menu hero image element.
- Modify: `js/data/characters.js`
  - Add `image` fields for `moChen` and `ningXuan`.
- Modify: `css/pvp.css`
  - PVP live layout and mobile information hierarchy improvements.
- No dedicated `css/mobile.css` edit unless a mobile-only defect cannot live cleanly in `frontend-upgrade.css`.
- Create: `assets/images/ui/main-menu-hero.webp`
- Create: `assets/images/characters/mo_chen.webp`
- Create: `assets/images/characters/ning_xuan.webp`
- Modify or create focused tests:
  - `tests/sanity_frontend_upgrade_asset_checks.cjs`
  - `tests/run_node_checks.sh`

## Task 1: Asset Contract Check

**Files:**
- Create: `tests/sanity_frontend_upgrade_asset_checks.cjs`
- Modify: `tests/run_node_checks.sh`

- [ ] **Step 1: Write the failing asset contract test**

Create `tests/sanity_frontend_upgrade_asset_checks.cjs`:

```js
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function assertFile(relativePath) {
  const absolute = path.join(root, relativePath);
  assert.ok(fs.existsSync(absolute), `${relativePath} should exist`);
  const stat = fs.statSync(absolute);
  assert.ok(stat.size > 1024, `${relativePath} should be a real image asset`);
}

assertFile('assets/images/ui/main-menu-hero.webp');
assertFile('assets/images/characters/mo_chen.webp');
assertFile('assets/images/characters/ning_xuan.webp');

const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(indexHtml.includes('css/frontend-upgrade.css'), 'index.html should include frontend-upgrade.css');
assert.ok(indexHtml.includes('assets/images/ui/main-menu-hero.webp'), 'main menu should reference the generated hero asset');

const characterData = fs.readFileSync(path.join(root, 'js/data/characters.js'), 'utf8');
assert.ok(characterData.includes('assets/images/characters/mo_chen.webp'), 'moChen should use generated portrait');
assert.ok(characterData.includes('assets/images/characters/ning_xuan.webp'), 'ningXuan should use generated portrait');

console.log('Frontend upgrade asset checks passed.');
```

- [ ] **Step 2: Register and verify the test fails**

Add this command near the other frontend/content sanity checks in `tests/run_node_checks.sh`:

```bash
node tests/sanity_frontend_upgrade_asset_checks.cjs
```

Run:

```bash
node tests/sanity_frontend_upgrade_asset_checks.cjs
```

Expected: FAIL because the new files and references do not exist yet.

- [ ] **Step 3: Keep the failure as the red state**

Do not weaken the test. It must fail until the assets, CSS include, and character references are real.

## Task 2: Generate And Save Required Assets

**Files:**
- Create: `assets/images/ui/main-menu-hero.webp`
- Create: `assets/images/characters/mo_chen.webp`
- Create: `assets/images/characters/ning_xuan.webp`

- [ ] **Step 1: Generate the main menu hero image**

Use built-in image generation. Prompt:

```text
Use case: stylized-concept
Asset type: game main menu hero background, wide banner
Primary request: A dark xianxia cultivation world for The Defier, deep void sky, distant floating mountain silhouettes, subtle golden talisman light, mist layers, cinematic but readable behind UI.
Scene/backdrop: ancient cultivation realm at night, no modern objects.
Composition: 16:9 wide banner, central negative space for menu UI, strongest detail around edges, no text, no logo, no watermark.
Style: polished game key art, painterly realism, dark blue-black and restrained antique gold, no cute style, no bright purple dominance.
```

Move the selected project asset to:

```text
assets/images/ui/main-menu-hero.webp
```

- [ ] **Step 2: Generate `mo_chen` portrait**

Use built-in image generation. Prompt:

```text
Use case: stylized-concept
Asset type: character portrait for a xianxia deckbuilder game
Primary request: Mo Chen, a reserved male cultivator scholar-warrior, ink-black robe with muted gold trim, calm expression, subtle shadow talisman energy, shoulder-up portrait.
Composition: transparent-feeling portrait on simple dark painterly background, centered bust, same scale as existing character card art, no text, no logo, no watermark.
Style: polished Chinese fantasy game character art, painterly realism, restrained blue-black and antique gold palette.
```

Move the selected project asset to:

```text
assets/images/characters/mo_chen.webp
```

- [ ] **Step 3: Generate `ning_xuan` portrait**

Use built-in image generation. Prompt:

```text
Use case: stylized-concept
Asset type: character portrait for a xianxia deckbuilder game
Primary request: Ning Xuan, a poised female cultivator strategist, white and deep teal robe with antique gold details, cold moonlit aura, focused expression, shoulder-up portrait.
Composition: simple dark painterly background, centered bust, same scale as existing character card art, no text, no logo, no watermark.
Style: polished Chinese fantasy game character art, painterly realism, restrained moonlight, teal, blue-black, and antique gold palette.
```

Move the selected project asset to:

```text
assets/images/characters/ning_xuan.webp
```

- [ ] **Step 4: Verify assets exist**

Run:

```bash
ls -lh assets/images/ui/main-menu-hero.webp assets/images/characters/mo_chen.webp assets/images/characters/ning_xuan.webp
```

Expected: all three files exist and are larger than 1 KiB.

## Task 3: Wire Assets And Shared Upgrade CSS

**Files:**
- Modify: `index.html`
- Modify: `js/data/characters.js`
- Create: `css/frontend-upgrade.css`

- [ ] **Step 1: Include the upgrade CSS**

In `index.html`, add this after existing CSS links:

```html
<link rel="stylesheet" href="css/frontend-upgrade.css">
```

- [ ] **Step 2: Add the main menu hero image**

Inside `#main-menu .menu-content`, before `.game-logo`, add:

```html
<img class="frontend-upgrade-hero" src="assets/images/ui/main-menu-hero.webp" alt="" aria-hidden="true">
```

The image should be decorative. Keep menu buttons and current IDs unchanged.

- [ ] **Step 3: Wire character portraits**

In `js/data/characters.js`, add `image` fields next to each existing `avatar` field:

```js
moChen: {
  id: 'moChen',
  name: '墨尘',
  title: '星律巡使',
  avatar: '🌠',
  image: 'assets/images/characters/mo_chen.webp',
  // keep the existing remaining fields unchanged
}

ningXuan: {
  id: 'ningXuan',
  name: '宁玄',
  title: '灵器行者',
  avatar: '🪬',
  image: 'assets/images/characters/ning_xuan.webp',
  // keep the existing remaining fields unchanged
}
```

Do not remove the existing emoji `avatar`; tests and fallback UI may still use it.

- [ ] **Step 4: Create initial `css/frontend-upgrade.css`**

Create:

```css
/* Frontend upgrade layer: narrow, additive, and loaded after legacy styles. */

#main-menu .menu-content {
    isolation: isolate;
    overflow: hidden;
}

.frontend-upgrade-hero {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.34;
    z-index: 0;
    pointer-events: none;
    filter: saturate(0.9) contrast(1.08) brightness(0.72);
}

#main-menu .menu-content::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    background:
        linear-gradient(90deg, rgba(3, 6, 12, 0.78), rgba(3, 6, 12, 0.36) 48%, rgba(3, 6, 12, 0.78)),
        linear-gradient(180deg, rgba(2, 4, 10, 0.18), rgba(2, 4, 10, 0.72));
}

#main-menu .menu-content > :not(.frontend-upgrade-hero) {
    position: relative;
    z-index: 2;
}

.char-avatar-wrapper {
    overflow: hidden;
}

.character-card .char-avatar-img,
.character-portrait,
.char-portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

@media screen and (max-width: 768px) {
    .frontend-upgrade-hero {
        opacity: 0.25;
        object-position: 50% 50%;
    }
}
```

- [ ] **Step 5: Verify the red test turns green**

Run:

```bash
node tests/sanity_frontend_upgrade_asset_checks.cjs
```

Expected: PASS with `Frontend upgrade asset checks passed.`

## Task 4: Core Visual Shell Improvements

**Files:**
- Modify: `css/frontend-upgrade.css`

- [ ] **Step 1: Add reusable surface and button normalization**

Append additive selectors for repeated UI shells. Use current class names only:

```css
.screen-header,
.challenge-shell,
.reward-shell,
.realm-select-layout,
.shop-container,
.achievements-container,
.inheritance-container,
#pvp-screen .pvp-layout-split {
    border-color: rgba(155, 190, 255, 0.22);
}

.challenge-btn,
.menu-btn,
.talisman-btn,
.back-btn,
.rune-tab,
.shop-tab-btn,
.challenge-tab-btn {
    text-wrap: balance;
}

.challenge-btn,
.menu-btn,
.talisman-btn,
.back-btn {
    min-height: 44px;
}
```

- [ ] **Step 2: Add stable text and overflow rules**

Append:

```css
.pvp-risk-title,
.pvp-risk-subtitle,
.challenge-section-title,
.reward-title,
.map-risk-value,
.map-overview-value,
.codex-card-title {
    overflow-wrap: anywhere;
}

.ranking-scroll-area,
.challenge-scroll-container,
.reward-container,
.realm-list-container,
.realm-preview-panel {
    scroll-padding: 16px;
}
```

- [ ] **Step 3: Run focused build**

Run:

```bash
npm run build:pages
```

Expected: PASS.

## Task 5: PVP Live Layout Cleanup

**Files:**
- Modify: `css/pvp.css`

- [ ] **Step 1: Improve live meta and board layout without changing hooks**

Update the existing live PVP layout rules in place (`.pvp-live-meta-grid`, `.pvp-live-duel-grid`, `.pvp-live-action-bar`, and the mobile `.pvp-live-action-bar .challenge-btn`) so the behavior stays close to the owning stylesheet:

```css
.pvp-live-meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    gap: 10px;
}

.pvp-live-duel-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 14px;
}

.pvp-live-action-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.pvp-live-action-bar .challenge-btn {
    flex: 1 1 150px;
    min-width: 0;
    justify-content: center;
}

.pvp-live-event-panel {
    min-width: 0;
}

.pvp-live-event-log {
    overflow-wrap: anywhere;
}

@media screen and (max-width: 768px) {
    .pvp-live-duel-grid {
        grid-template-columns: 1fr;
    }

    .pvp-live-action-bar .challenge-btn {
        flex-basis: calc(50% - 8px);
        min-width: 0;
    }
}
```

Preserve all `data-live-*` attributes and existing action methods.

- [ ] **Step 2: Verify PVP contract tests**

Run:

```bash
node tests/sanity_pvp_live_ui_contract_checks.cjs
node tests/sanity_pvp_live_ui_runtime_checks.mjs
```

Expected: both PASS.

## Task 6: Mobile Adaptation Pass

**Files:**
- Modify: `css/frontend-upgrade.css`

- [ ] **Step 1: Add mobile guardrails**

Add rules that prevent horizontal overflow and keep key action bars reachable:

```css
@media screen and (max-width: 768px) {
    .screen-header,
    .menu-content,
    .character-selection-container,
    .realm-select-layout,
    .challenge-shell,
    .reward-shell,
    #pvp-screen .pvp-layout-split,
    .shop-container {
        width: min(100% - 16px, 100%);
    }

    .screen-header {
        border-radius: 18px;
    }

    .challenge-btn,
    .menu-btn,
    .talisman-btn {
        max-width: 100%;
    }
}
```

- [ ] **Step 2: Run mobile-focused browser checks**

Start preview or use the release preview if already running, then run:

```bash
npm run test:browser:mobile
```

Expected: PASS. If it fails, inspect the generated output directory named by the script and fix the specific overflow or clickability failure.

## Task 7: Full Verification And Fresh Browser Audit

**Files:**
- No planned source edits unless verification finds issues.

- [ ] **Step 1: Run build**

```bash
npm run build:pages
```

Expected: PASS.

- [ ] **Step 2: Run node gate**

```bash
npm run test:node
```

Expected: PASS. If `tests/sanity_pvp_live_cross_process_ws_fanout_checks.cjs` fails with the known terminal heartbeat `presence` timeout, immediately rerun:

```bash
node tests/sanity_pvp_live_cross_process_ws_fanout_checks.cjs
```

If the single test passes, record it as a suite-order flaky in the final verification notes and do not hide the full-suite failure.

- [ ] **Step 3: Run browser release gate**

Start preview:

```bash
npm run build:pages
npx vite preview --host 127.0.0.1 --port 4174 --strictPort --outDir .site
```

In another shell:

```bash
npm run test:browser:release -- http://127.0.0.1:4174 output/release-browser-audits-frontend-upgrade-20260708
```

Expected: aggregate `report.json` exists, reports 29 expected modules, `failedFindings` is 0, and `consoleErrors` is 0.

- [ ] **Step 4: Inspect fresh screenshots**

Inspect only this run's fresh output directory:

```text
output/release-browser-audits-frontend-upgrade-20260708
```

Required manual review surfaces:

- `frontend-layout`
- `mobile`
- `reward-mobile`
- `pvp`
- `pvp-live-real`
- `pvp-live-mobile-real`
- `guide`

Fix any visible overlap, blank asset, bad crop, inaccessible button, or text overflow before claiming completion.
