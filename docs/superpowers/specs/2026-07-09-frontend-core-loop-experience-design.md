# Frontend Core Loop Experience Design

Date: 2026-07-09
Worktree: `/Users/bytedance/Desktop/workspace/IDEAProjects/The-Defier/.worktrees/frontend-core-loop-experience-20260709`
Branch: `feat/frontend-core-loop-experience-20260709`

## Design Brief

The next frontend goal is to improve the primary playable loop: battle, post-battle reward, and return-to-map decision making. The visual source is the existing The Defier UI plus the merged frontend design-system foundation. The work keeps the ink/gold cultivation-game language, remains fully interactive, and does not change combat math, reward rules, backend protocols, ranking, economy, or production deployment.

## Current Baseline

Fresh baseline in the new worktree:

- `npm install` at repo root passed.
- `npm install` in `server/` passed.
- `npm run build:pages` passed.
- `npm run test:node` passed.

The baseline proves the branch starts from a clean local build and Node gate.

## Goals

- Make battle state answer "where am I in the run loop and what happens after this fight" without opening another panel.
- Make the reward screen explain the next required action before the continue button becomes active.
- Make the map screen preserve continuity after returning from reward by showing a compact current-route brief.
- Add real browser checks that catch invisible panels, cramped mobile layout, center-hit failures, and stale release-gate coverage.

## Non-Goals

- No new cards, enemies, rewards, damage formulas, node rules, or backend state.
- No major redesign of the battle board, reward page, or map graph.
- No production deployment.
- No broad file splitting in `js/game.js` or `js/core/battle.js`.

## Interaction Design

### Battle Loop Rail

The battle command panel gets a compact rail named "本轮推进". It summarizes:

- Current node type, such as 普通战, 精英战, 主宰战, or 事件战.
- Current combat phase, such as 玩家回合, 敌方回合, or 结算中.
- Next step, always phrased as "胜利后进入战利结算，再回章节地图".

The rail is informational only. It does not add a new action or alter command availability.

### Reward Next Step Card

The reward action panel gets a small next-step card above the buttons. It shows:

- "先选牌或付费跳过" while continue is disabled.
- "已选定奖励，可继续回章节地图" after selecting a card.
- "灵石不足，无法跳过" when skip is blocked by cost.

The continue and skip buttons remain the actual controls. The card prevents the right column from feeling like a dead end on mobile.

### Map Route Brief

The map canvas header gets a compact current-route brief. It shows:

- Current chapter or realm label.
- Count of accessible next nodes.
- Last run-path feedback if available, otherwise a stable "选择高亮节点继续推进" line.

The brief must fit inside the existing map header area and must not obscure nodes or footer controls.

## Technical Design

- `js/core/battle.js` computes a small loop context object during `updateBattleCommandUI()` and passes it to `DefierBattleHud.buildBattleCommandPanelMarkup()`.
- `js/ui/battle-hud.js` renders the battle loop rail with escaped text and stable selectors.
- `js/views/RewardView.js` owns reward next-step state and updates it from `showRewardScreen()`, `selectRewardCard()`, and failed skip attempts.
- `index.html` adds a stable reward next-step host in the reward action panel.
- `js/views/MapView.js` renders the map route brief during full map rebuild.
- CSS is added in existing frontend files near related battle, reward, and map styling.

## Test Strategy

Test-first work is required for each behavior:

- Node guardrails:
  - `tests/sanity_battle_hud_module_checks.cjs` locks the battle loop rail markup.
  - `tests/test_reward_view.cjs` locks reward next-step state.
  - `tests/sanity_release_gate_coverage_checks.cjs` locks browser audit markers.
- Browser audits:
  - `tests/browser_mobile_layout_audit.mjs` checks battle loop rail visibility and hit-safe mobile layout.
  - `tests/browser_run_path_reward_audit.mjs` checks reward next-step copy before and after reward selection.
  - `tests/browser_run_path_audit.mjs` or `tests/browser_frontend_layout_audit.mjs` checks the map route brief and node separation.

Final verification uses:

- `npm run build:pages`
- `npm run test:node`
- `.site` preview
- Focused browser audits for mobile battle, reward, and map
- Release browser gate when focused checks are green
