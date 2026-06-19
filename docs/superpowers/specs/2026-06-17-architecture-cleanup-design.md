# Architecture Cleanup Design

## Goal

Optimize the current architecture without changing game behavior, then remove files proven to be stale or unused by the current runtime, build, test, and production deployment flows.

## Current Model

The browser runtime enters through `index.html` and `js/main.js`. `js/game.js` is the composition root and public compatibility surface for tests, browser automation, and inline HTML handlers. The hub modules under `js/core/*_hub.js` currently attach controllers by writing `window.__attach*HubController`, and `Game.attachHubControllers()` reads those globals.

Tests are intentionally path-sensitive: many sanity checks read `js/game.js`, `js/core/*.js`, `js/managers/*.js`, and `js/views/*.js` directly. This means the first architecture cleanup must preserve file paths, public method names, DOM ids/classes, storage keys, and `window.game` / `window.render_game_to_text`.

## Selected Approach

Add an explicit hub registry module and migrate collection, challenge, and expedition hub attachment through it. The hub modules will register their attach functions with the registry while retaining the existing global `__attach*HubController` fallback. `Game.attachHubControllers()` will prefer the registry and fall back to globals so older VM-style tests and any legacy manual scripts remain compatible.

This improves the architecture by turning an implicit global contract into an explicit runtime dependency, while avoiding a risky physical split of `js/game.js`, `js/core/battle.js`, or `js/core/map.js`.

## Cleanup Scope

Delete files that are not part of current runtime, build, test, deploy, or production evidence:

- `.nojekyll`: root copy is stale because `scripts/prepare-pages.sh` creates `.site/.nojekyll`.
- `main.js`: stale root Vite entry; real page entry is `js/main.js`.
- `scripts/build_prod.cjs`: obsolete custom bundler not used by package scripts and incompatible with the current module entry.
- `tests/layout_check.js`: manual console helper replaced by automated browser layout audits.
- `tests/pvp_verification.js`: manual console helper replaced by automated PVP browser audits.
- `verify_strength.js`: standalone conceptual CommonJS sketch; remove together with `package.json.main` because this app is not published as a Node library.

Do not delete `game-intro.html`, `progress.md`, `docs/archive/**`, `CNAME`, `js/config/bmob.config.example.js`, `output/`, server SQLite data, or `server/node_modules`.

## Verification

Use TDD for the architecture and cleanup contract:

1. Add a focused sanity test that requires `js/runtime/hub-registry.js`, registry usage in `js/game.js`, hub registration in the three hub modules, package metadata cleanup, and absence of the stale tracked files.
2. Run that test and confirm it fails before implementation.
3. Implement the registry and delete stale files.
4. Run the focused test, `npm run build:pages`, `npm run test:node`, and a fresh local release gate with a new `OUTPUT_ROOT`.
5. Inspect the fresh release `report.json` for 26 expected reports, zero failed findings, zero console errors, and no missing, duplicate, or unknown modules.

## Non-Goals

This pass does not move or split `js/game.js`, `js/core/battle.js`, `js/core/map.js`, browser audit scripts, docs archive files, or production deployment scripts.
