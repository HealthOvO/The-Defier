# Frontend Core Loop Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the playable battle to reward to map loop with compact continuity cues and real browser guardrails.

**Architecture:** Keep the behavior local to existing view/render modules. Battle computes a display-only loop context, RewardView owns reward next-step copy, and MapView renders a compact route brief from existing state. Browser audits prove visibility and mobile hit safety.

**Tech Stack:** Static HTML/CSS, ES modules, Vite, Node sanity scripts, Playwright browser audits.

---

### Task 1: Battle Loop Rail

**Files:**
- Modify: `js/ui/battle-hud.js`
- Modify: `js/core/battle.js`
- Modify: `css/battle-hud.css`
- Modify: `tests/sanity_battle_hud_module_checks.cjs`
- Modify: `tests/browser_mobile_layout_audit.mjs`

- [ ] Add a failing Node assertion in `tests/sanity_battle_hud_module_checks.cjs` that `buildBattleCommandPanelMarkup({ loop: { nodeLabel: '精英战', phaseLabel: '玩家回合', nextLabel: '胜利后进入战利结算，再回章节地图' } })` renders `.battle-loop-rail`, `data-core-loop-rail="battle"`, and the three text values.
- [ ] Run `node tests/sanity_battle_hud_module_checks.cjs` and confirm it fails because the loop rail is missing.
- [ ] Add `buildBattleLoopRailMarkup(input)` to `js/ui/battle-hud.js`, escape all text, and include it under the command header.
- [ ] Add `resolveBattleCoreLoopContext()` to `js/core/battle.js`; map node types to player-facing labels and pass `loop` into `buildBattleCommandPanelMarkup()`.
- [ ] Add compact styles for `.battle-loop-rail` in `css/battle-hud.css`, including mobile wrapping without increasing the command panel beyond the existing mobile audit limits.
- [ ] Extend `tests/browser_mobile_layout_audit.mjs` to require `.battle-loop-rail` to be visible, inside viewport, and not overlapping `#end-turn-btn` or the first visible hand card.
- [ ] Rerun `node tests/sanity_battle_hud_module_checks.cjs` and focused mobile browser audit.

### Task 2: Reward Next-Step Card

**Files:**
- Modify: `index.html`
- Modify: `js/views/RewardView.js`
- Modify: `css/frontend-upgrade.css`
- Modify: `css/mobile.css`
- Modify: `tests/test_reward_view.cjs`
- Modify: `tests/browser_run_path_reward_audit.mjs`

- [ ] Add a failing browser-context assertion in `tests/test_reward_view.cjs` that `#reward-next-step-card` exists after `showRewardScreen()`, starts with pending copy, then changes to ready copy after `selectRewardCard()`.
- [ ] Run `node tests/test_reward_view.cjs` and confirm it fails because the next-step host or update method is missing.
- [ ] Add `<div id="reward-next-step-card" class="reward-next-step-card" aria-live="polite"></div>` above reward action buttons in `index.html`.
- [ ] Add `updateRewardNextStepCard(state, detail)` to `RewardView`, call it from `showRewardScreen()`, `selectRewardCard()`, and failed `skipRewardCard()`.
- [ ] Style `.reward-next-step-card` as a compact action-status panel with stable dimensions and mobile-safe wrapping.
- [ ] Extend `tests/browser_run_path_reward_audit.mjs` to check pending and ready next-step copy in the real reward screen.
- [ ] Rerun `node tests/test_reward_view.cjs` and `node tests/browser_run_path_reward_audit.mjs <preview-url> <out-dir>`.

### Task 3: Map Route Brief

**Files:**
- Modify: `js/views/MapView.js`
- Modify: `css/frontend-upgrade.css`
- Modify: `css/mobile.css`
- Modify: `tests/browser_run_path_audit.mjs`
- Modify: `tests/browser_frontend_layout_audit.mjs`

- [ ] Add a failing browser assertion that the map screen renders `[data-core-loop-rail="map"]` with current chapter/realm text and at least one next-node count or fallback action line.
- [ ] Run the focused map browser audit and confirm it fails before implementation.
- [ ] Add `getMapCoreLoopBrief()` to `MapView`, using existing player realm, map nodes, and `game.lastRunPathMapFeedback`.
- [ ] Render the brief in `.map-canvas-header` below the subtitle and before the legend.
- [ ] Style `.map-core-loop-brief` to be dense, readable, and non-overlapping on mobile and medium desktop.
- [ ] Rerun focused map/browser layout audits.

### Task 4: Release Coverage Guardrails

**Files:**
- Modify: `tests/sanity_release_gate_coverage_checks.cjs`
- Modify: `tests/run_node_checks.sh` only if a new Node file is created

- [ ] Add marker checks for `data-core-loop-rail="battle"`, `reward-next-step-card`, and `data-core-loop-rail="map"`.
- [ ] Add marker checks that the browser audits contain overlap or center-hit probes for the new battle, reward, and map surfaces.
- [ ] Run `node tests/sanity_release_gate_coverage_checks.cjs` and confirm it passes after Tasks 1-3.

### Task 5: Final Verification

**Files:**
- No production files unless checks reveal a defect.

- [ ] Run `npm run build:pages`.
- [ ] Run `npm run test:node`.
- [ ] Start `.site` preview on an unused local port.
- [ ] Run focused browser audits for mobile battle, reward, and map into a fresh `output/frontend-core-loop-experience-20260709/` directory.
- [ ] Run browser release gate if focused audits pass.
- [ ] Inspect fresh `report.json` files and screenshots for failed findings, console errors, blank surfaces, text clipping, or hit-target conflicts.
