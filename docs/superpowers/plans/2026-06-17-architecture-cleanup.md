# Architecture Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit hub registry, preserve runtime compatibility, and remove proven stale files without changing behavior.

**Architecture:** `js/runtime/hub-registry.js` owns named hub attach functions. Hub modules register their attach functions there and keep legacy global exports. `Game.attachHubControllers()` prefers registry attachment and falls back to legacy globals.

**Tech Stack:** Browser ES modules, Node CommonJS sanity checks, Vite build, Playwright release audits.

---

### Task 1: Add Cleanup Contract Test

**Files:**
- Create: `tests/sanity_architecture_cleanup_checks.cjs`
- Modify: `tests/run_node_checks.sh`

- [ ] **Step 1: Write the failing test**

Create `tests/sanity_architecture_cleanup_checks.cjs` with assertions that:

```js
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));

assert.ok(exists('js/runtime/hub-registry.js'), 'hub registry module should exist');

const registry = read('js/runtime/hub-registry.js');
assert.ok(registry.includes('registerHubController'), 'registry should export registerHubController');
assert.ok(registry.includes('attachRegisteredHubControllers'), 'registry should export attachRegisteredHubControllers');
assert.ok(registry.includes('collection'), 'registry should support collection hub key');
assert.ok(registry.includes('challenge'), 'registry should support challenge hub key');
assert.ok(registry.includes('expedition'), 'registry should support expedition hub key');

const game = read('js/game.js');
assert.ok(game.includes('attachRegisteredHubControllers'), 'game should import registry attachment');
assert.ok(game.includes('attachLegacyHubControllers'), 'game should retain legacy fallback');

[
  ['js/core/collection_hub.js', 'collection'],
  ['js/core/challenge_hub.js', 'challenge'],
  ['js/core/expedition_hub.js', 'expedition'],
].forEach(([file, key]) => {
  const source = read(file);
  assert.ok(source.includes('registerHubController'), `${file} should register with hub registry`);
  assert.ok(source.includes(`'${key}'`) || source.includes(`"${key}"`), `${file} should register ${key} key`);
  assert.ok(source.includes('__attach'), `${file} should keep legacy global attach fallback`);
});

const packageJson = JSON.parse(read('package.json'));
assert.ok(!Object.prototype.hasOwnProperty.call(packageJson, 'main'), 'package.json should not point at stale verify_strength.js');

[
  '.nojekyll',
  'main.js',
  'scripts/build_prod.cjs',
  'tests/layout_check.js',
  'tests/pvp_verification.js',
  'verify_strength.js',
].forEach((file) => {
  assert.ok(!exists(file), `${file} should be removed as stale cleanup`);
});

console.log('Architecture cleanup checks passed.');
```

Add `node tests/sanity_architecture_cleanup_checks.cjs` near `sanity_hub_controller_smoke.cjs` in `tests/run_node_checks.sh`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/sanity_architecture_cleanup_checks.cjs`

Expected: FAIL with `hub registry module should exist`.

### Task 2: Implement Hub Registry

**Files:**
- Create: `js/runtime/hub-registry.js`
- Modify: `js/core/collection_hub.js`
- Modify: `js/core/challenge_hub.js`
- Modify: `js/core/expedition_hub.js`
- Modify: `js/game.js`
- Modify: `tests/sanity_hub_controller_smoke.cjs`

- [ ] **Step 1: Add registry module**

Create `js/runtime/hub-registry.js`:

```js
const HUB_KEYS = Object.freeze(['collection', 'challenge', 'expedition']);
const hubControllers = new Map();

export function registerHubController(name, attachController) {
  if (!HUB_KEYS.includes(name) || typeof attachController !== 'function') return false;
  hubControllers.set(name, attachController);
  return true;
}

export function attachRegisteredHubControllers(game) {
  if (!game) return {};
  const attached = {};
  HUB_KEYS.forEach((name) => {
    const attachController = hubControllers.get(name);
    if (typeof attachController === 'function') {
      attached[name] = attachController(game);
    }
  });
  return attached;
}

export function getRegisteredHubControllerNames() {
  return HUB_KEYS.filter((name) => hubControllers.has(name));
}
```

- [ ] **Step 2: Register each hub**

In each hub module, import `registerHubController` and call it after defining `attach*HubController`:

```js
import { registerHubController } from "../runtime/hub-registry.js";
registerHubController('collection', attachCollectionHubController);
```

Use `challenge` and `expedition` in their respective modules.

- [ ] **Step 3: Prefer registry in Game**

Import `attachRegisteredHubControllers` in `js/game.js`. Change `attachHubControllers()` so it calls the registry first, assigns `collectionHub`, `challengeHub`, and `expeditionHub` from returned values, then calls a new `attachLegacyHubControllers(runtimeGlobal)` helper to preserve old global fallback for any controller not registered.

- [ ] **Step 4: Update smoke test**

Update `tests/sanity_hub_controller_smoke.cjs` to assert the registry import and registry attachment path while retaining assertions that global attach fallbacks still exist in the hub modules.

- [ ] **Step 5: Run focused tests**

Run:

```bash
node tests/sanity_architecture_cleanup_checks.cjs
node tests/sanity_hub_controller_smoke.cjs
```

Expected: architecture cleanup test still fails only on stale files before deletion; hub smoke passes.

### Task 3: Remove Stale Files

**Files:**
- Delete: `.nojekyll`
- Delete: `main.js`
- Delete: `scripts/build_prod.cjs`
- Delete: `tests/layout_check.js`
- Delete: `tests/pvp_verification.js`
- Delete: `verify_strength.js`
- Modify: `package.json`

- [ ] **Step 1: Remove package stale main field**

Delete the top-level `"main": "verify_strength.js"` property from `package.json` and keep valid JSON.

- [ ] **Step 2: Delete stale files**

Remove the six stale tracked files listed above.

- [ ] **Step 3: Run cleanup contract**

Run: `node tests/sanity_architecture_cleanup_checks.cjs`

Expected: PASS with `Architecture cleanup checks passed.`

### Task 4: Fresh Verification

**Files:**
- Generated only: `.site/`, `dist/`, `output/release-browser-audits-local-20260617-architecture-cleanup/`

- [ ] **Step 1: Build pages artifact**

Run: `npm run build:pages`

Expected: exit 0 and `.site/index.html` generated.

- [ ] **Step 2: Run Node gate**

Run: `npm run test:node`

Expected: exit 0 with `All node checks passed.`

- [ ] **Step 3: Run fresh release gate**

Run:

```bash
PORT=4173 OUTPUT_ROOT=output/release-browser-audits-local-20260617-architecture-cleanup npm run test:release:local
```

Expected: exit 0 with `All browser release audits passed.`

- [ ] **Step 4: Inspect fresh report**

Read `output/release-browser-audits-local-20260617-architecture-cleanup/report.json` and verify:

```text
expectedReportCount = 26
reportCount = 26
failedFindings = 0
consoleErrors = 0
failedReportCount = 0
missingModules = []
duplicateModules = []
unknownModules = []
```
