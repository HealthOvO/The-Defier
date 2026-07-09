# Frontend Global Optimization Design

Date: 2026-07-09
Worktree: `/Users/bytedance/Desktop/workspace/IDEAProjects/The-Defier/.worktrees/frontend-global-optimization-20260709`
Branch: `feat/frontend-global-optimization-20260709`

## Design Brief

The product is The Defier, an existing full-interaction browser game. The visual source is the current production-style game UI in this repository, including the V10 PVP surface and the frontend-upgrade assets already merged to `main`. The work should keep the established ink/gold cultivation-game language, not introduce a new brand direction, and should remain fully functional across desktop, short desktop, and mobile/touch viewports.

## Baseline Evidence

Fresh baseline checks before this pass:

- `npm run build:pages` passed.
- `npm run test:node` passed.
- `.site` preview at `http://127.0.0.1:4176/` ran `npm run test:browser:release -- http://127.0.0.1:4176 output/release-browser-audits-frontend-global-baseline-20260709` and passed.

The baseline proves there is no known release-gate failure on current `origin/main`. The optimization target is therefore not a broken build; it is a set of high-confidence quality gaps found by code inspection and browser-gate coverage review.

## Goals

- Make player-visible version and PVP practice wording consistent across main menu, guide, system view, PVP scene, services, and tests.
- Improve main-menu utility controls so icon-only buttons have accessible names and remain readable on mobile.
- Reduce medium-width PVP header overlap risk and narrow mobile collection-tab crowding.
- Make character portrait fallback behavior consistent when an image fails to load.
- Strengthen real browser checks for hit testing, image loading, mobile crowding, and coverage guardrails.

## Non-Goals

- No new game mechanics, ranking rules, economy changes, or backend protocol changes.
- No new visual brand, no landing page, and no decorative-only redesign.
- No production deployment in this pass unless requested separately.

## First Optimization Batch

1. Copy and version consistency:
   - Use `V10 真 PVP · 前端焕新` as the public version family where the current player-facing update is named.
   - Use `镜像练习` for practice-mode wording in current player-facing surfaces.
   - Preserve historical `progress.md` archive text unless the current top summary needs a new entry.

2. Main menu accessibility:
   - Add explicit accessible names and tooltips to `.util-btn`.
   - Keep the visual labels, but make the button itself self-describing for keyboard/screen-reader users and automated audits.

3. Responsive layout hardening:
   - Add a medium-width PVP header mode for `961px-1240px` style screens where the title, back button, and rank badge can otherwise compete for space.
   - Change mobile collection tabs from a cramped fixed 4-column rail to a denser-but-readable 2-column or adaptive rail with no clipped labels at narrow widths.

4. Character portrait fallback:
   - Render the fallback emoji span for all image-backed branches, not only `char.image`.
   - Normalize `yanHan` to expose `image` while keeping the existing avatar value compatible.

5. Browser checks:
   - Add utility-button accessible-name and label non-overlap probes to `browser_ui_gallery_audit.mjs`.
   - Add collection-tab clipping and PVP medium-header overlap probes to `browser_frontend_layout_audit.mjs`.
   - Add mobile battle reachability checks for key HUD controls in `browser_mobile_layout_audit.mjs`.
   - Update release-gate coverage guardrails so these checks cannot be deleted silently.

## Verification Strategy

Targeted red/green checks first:

- `node tests/sanity_intro_progress_sync_checks.cjs`
- `node tests/sanity_release_gate_coverage_checks.cjs`
- `npm run test:browser:mobile -- http://127.0.0.1:4177 output/frontend-global-targeted-20260709/mobile`
- `node tests/browser_ui_gallery_audit.mjs http://127.0.0.1:4177 output/frontend-global-targeted-20260709/ui-gallery`
- `node tests/browser_frontend_layout_audit.mjs http://127.0.0.1:4177 output/frontend-global-targeted-20260709/frontend-layout`

Final release checks:

- `npm run build:pages`
- `npm run test:node`
- `.site` preview
- `npm run test:browser:release -- http://127.0.0.1:4178 output/release-browser-audits-frontend-global-final-20260709`
