# Frontend Global Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve high-confidence frontend quality gaps across copy consistency, accessibility, responsive layout, image fallback, and real-browser gate coverage.

**Architecture:** Keep changes localized to existing HTML, CSS, view rendering, and browser-audit scripts. Add tests before production edits, then use the existing release gate to prove the integrated result.

**Tech Stack:** Static HTML/CSS, ES modules, Vite, Node sanity checks, Playwright browser audits.

---

### Task 1: Player-Facing Copy Consistency

**Files:**
- Modify: `index.html`
- Modify: `game-intro.html`
- Modify: `js/views/SystemView.js`
- Modify: `js/scenes/pvp-scene.js`
- Modify: `js/services/pvp-service.js`
- Modify: `tests/sanity_intro_progress_sync_checks.cjs`
- Modify: `tests/browser_guide_modal_audit.mjs`
- Modify: `tests/browser_pvp_live_audit.mjs`
- Modify: `tests/sanity_pvp_live_ui_contract_checks.cjs`

- [ ] Update tests to expect `V10 真 PVP · 前端焕新` and current-surface `镜像练习` wording.
- [ ] Run `node tests/sanity_intro_progress_sync_checks.cjs` and confirm it fails on stale current copy.
- [ ] Update current player-facing surfaces to use the unified wording.
- [ ] Rerun `node tests/sanity_intro_progress_sync_checks.cjs` and confirm it passes.

### Task 2: Main Menu Accessible Utility Controls

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`
- Modify: `css/mobile.css`
- Modify: `tests/browser_ui_gallery_audit.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [ ] Add a browser-ui-gallery assertion that every `#main-menu .util-btn` has an accessible name and that mobile `.util-label` elements do not overlap `.menu-oracle-strip`.
- [ ] Run `node tests/browser_ui_gallery_audit.mjs http://127.0.0.1:4177 output/frontend-global-red/ui-gallery` and confirm it fails before HTML changes.
- [ ] Add `aria-label` and `title` attributes to the utility buttons.
- [ ] Adjust mobile label spacing only if the new assertion exposes a real overlap.
- [ ] Rerun the focused gallery audit and coverage guardrail.

### Task 3: Responsive Layout Hardening

**Files:**
- Modify: `css/layout-fixes.css`
- Modify: `css/pvp.css`
- Modify: `tests/browser_frontend_layout_audit.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [ ] Add medium desktop viewports `1024x768` and `1180x720` to the frontend layout audit.
- [ ] Add PVP header intersection checks for `.back-btn`, `.header-title-group`, and `.player-rank-badge`.
- [ ] Add mobile collection tab text-clipping checks for `.collection-tab-btn`.
- [ ] Run focused frontend-layout audit and confirm the new assertions expose any current risk.
- [ ] Add CSS for medium PVP headers and mobile collection tabs until the focused audit passes.

### Task 4: Character Portrait Fallback

**Files:**
- Modify: `js/data/characters.js`
- Modify: `js/views/CharacterSelectView.js`
- Modify: `tests/browser_ui_gallery_audit.mjs`

- [ ] Add a gallery probe that temporarily forces one image-backed character portrait to fail and checks that `.char-avatar-emoji` becomes visible without collapsing the card.
- [ ] Run the focused gallery audit and confirm the fallback probe fails before implementation.
- [ ] Render fallback emoji spans for every image-backed branch.
- [ ] Add `image: 'assets/images/characters/yan_han.webp'` to `yanHan` while preserving existing compatibility.
- [ ] Rerun the focused gallery audit.

### Task 5: Mobile Battle Reachability

**Files:**
- Modify: `tests/browser_mobile_layout_audit.mjs`
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`

- [ ] Add center-hit checks for `#end-turn-btn`, `.battle-advisor-toggle`, `.battle-advisor-spirit-btn`, and the first visible hand card.
- [ ] Add an expanded-advisor screenshot after toggling the tactical advisor.
- [ ] Run `node tests/browser_mobile_layout_audit.mjs http://127.0.0.1:4177 output/frontend-global-mobile` and confirm the new assertions pass on the adjusted UI.

### Task 6: Final Verification

**Files:**
- No production files unless final checks reveal a defect.

- [ ] Run `npm run build:pages`.
- [ ] Run `npm run test:node`.
- [ ] Start `.site` preview with `npx vite preview --host 127.0.0.1 --port 4178 --strictPort --outDir .site`.
- [ ] Run `npm run test:browser:release -- http://127.0.0.1:4178 output/release-browser-audits-frontend-global-final-20260709`.
- [ ] Inspect final `report.json` outputs and screenshots for failed findings, console errors, blank images, or crowded layouts.
