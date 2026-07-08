# The Defier Frontend Upgrade Design

## Context

This work happens in the isolated worktree:

`/Users/bytedance/Desktop/workspace/IDEAProjects/The-Defier-frontend-upgrade-20260708`

The current app is a single-page game shell. `index.html` owns the major DOM screens, `js/game.js` and `js/views/*` coordinate stateful rendering, and feature CSS is split across `css/style.css`, `css/design-system.css`, `css/mobile.css`, `css/pvp.css`, battle HUD CSS, and feature-specific files.

Baseline checks before design:

- `npm run build:pages` passed and produced `.site`.
- `npm run test:node` initially failed in `tests/sanity_pvp_live_cross_process_ws_fanout_checks.cjs` while waiting for a terminal heartbeat `presence` after many queued `state_sync` messages.
- The same PVP live fanout test passed when run alone, so the full-suite failure is tracked as a flaky or suite-order risk for final verification, not as a current frontend design blocker.

## Product Goal

Upgrade the frontend broadly without replacing the current runtime architecture. The upgrade must make the game feel more coherent, readable, and usable across desktop and mobile while preserving existing gameplay contracts, especially live PVP authority, hidden-information boundaries, map/reward flow state, and browser release gates.

## Design Direction

Use the existing dark xianxia identity as the base, but reduce the current split between old ink-and-talisman styling and newer blue-gold glass panels.

The target visual language is:

- Deep void background with restrained realm atmosphere.
- Dark blue-black surfaces with controlled amber/gold emphasis.
- Less decorative noise in dense operational screens.
- Stronger first-screen product signal through real bitmap assets, not only gradients, emoji, or prose.
- Compact, stable components for repeated play: buttons, tabs, chips, panels, cards, status rails, modal shells, and mobile toolbars.

The target interaction language is:

- Keep `.screen.active` navigation and `SystemView.showScreen()`.
- Keep inline entrypoints working while slowly centralizing style and state conventions.
- Preserve `MapView.render()` and other runtime redraw paths.
- Preserve PVP live public/private information rules: only public state in active play, no ghost fallback as ranked, no practice score pollution.
- Avoid hiding important status feedback simply to make screens look cleaner.

## Upgrade Scope

### Track 1: Entry And Character Selection

The first playable surface should feel intentional and current.

Changes:

- Improve main menu hierarchy so the primary play actions, PVP, guide, and account utilities have clearer visual priority.
- Add a project-local hero/world image for the main menu.
- Add missing formal character portraits for `moChen` and `ningXuan` if the current character data still references fallback or missing images.
- Make character cards use a consistent portrait ratio, text hierarchy, and mobile layout.
- Keep all current start/continue/PVP/guide/account entrypoints reachable.

### Track 2: Main Run Loop

Map, battle, reward, challenge, and expedition screens should read as the same product.

Changes:

- Introduce a small shared upgrade CSS layer for tokens and reusable shells without rewriting every legacy selector.
- Normalize dense panel treatments: borders, radii, shadows, chip sizing, scroll gutters, and button states.
- Improve map and reward mobile constraints so text and CTA controls do not collide or drift off-screen.
- Keep existing runtime-generated HTML intact unless a specific test proves the generated structure needs adjustment.
- Do not reduce visible explanations for risk, rewards, challenge modifiers, or run-path consequences.

### Track 3: PVP Live Information Architecture

PVP live should separate the player's next action from lower-priority status telemetry.

Changes:

- Reorganize the live tab visually into ranked intent, match status, duel board, event/review details, and secondary social/invite controls.
- Keep the existing `data-live-*` hooks and PVPScene methods intact unless a focused test covers a deliberate change.
- Keep practice, friendly invite, ranked, and mirror/ghost mode boundaries explicit.
- Keep connection status, realtime transport, action receipt, counterplay, fairness, and post-match review visible but grouped by priority.
- Improve mobile PVP readability around action buttons, seat panels, hidden-hand text, and event logs.

### Track 4: Asset System

Missing visual assets should be real bitmap assets stored in the repo.

Initial project-bound assets:

- `assets/images/ui/main-menu-hero.webp`: wide atmospheric world image for the main menu.
- `assets/images/characters/mo_chen.webp`: character portrait matching existing character art scale.
- `assets/images/characters/ning_xuan.webp`: character portrait matching existing character art scale.

Generated assets must be copied into the workspace and referenced from code. No production screen may depend on an image left under Codex state or temp directories.

## Implementation Boundaries

Preferred change locations:

- `css/frontend-upgrade.css` for new shared upgrade layer.
- `index.html` for stylesheet include and narrow structural additions.
- `css/mobile.css` for targeted mobile fixes only when shared CSS is not enough.
- `css/pvp.css` for PVP-specific layout cleanup.
- `js/data/characters.js` only if character image paths need updating.
- `tests/*` only for focused upgrade coverage and release-gate coverage sync.
- `game-intro.html`, `progress.md`, and `js/views/SystemView.js` only if visible version/copy changes require sync.

Avoid broad rewrites of:

- `js/game.js`
- `js/core/map.js`
- `js/scenes/pvp-scene.js`
- `tests/run_browser_release_checks.sh`
- `tests/browser_audit.mjs`

Those files are high-coupling chokepoints and should only change for a directly tested reason.

## Testing Strategy

Use test-driven edits for behavior or contract changes. CSS-only visual improvements can be guarded by browser audit assertions and screenshot review.

Minimum verification after implementation:

- `npm run build:pages`
- `npm run test:node`
- A local preview server with browser checks against the fresh build.
- `npm run test:browser:release -- http://127.0.0.1:4174 output/release-browser-audits-frontend-upgrade-20260708`
- Manual review of fresh screenshots for:
  - frontend layout desktop/short/mobile
  - mobile battle/reward
  - PVP desktop/mobile
  - PVP live real backend desktop/mobile if run by the release gate
  - guide modal if copy changed

Do not use old `output/` directories as completion evidence.

## Acceptance Criteria

- The new worktree contains a coherent frontend upgrade with visible improvements on the first screen and core play screens.
- Missing character images identified in current data are generated, saved in the repo, and wired into the character selection path.
- Desktop and mobile layouts preserve all major game actions and status feedback.
- PVP live keeps ranked/practice/friendly/ghost boundaries explicit and does not weaken hidden-information or server-authority copy.
- Fresh build and tests complete, or any remaining failure is isolated with a root-cause note and not caused by the frontend upgrade.
- Fresh browser output exists for this run and is inspected before claiming completion.
