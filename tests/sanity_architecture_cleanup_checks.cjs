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
assert.ok(game.includes("import('./core/challenge_hub.js')"), 'game should lazy-load challenge hub on demand');
assert.ok(game.includes('this.attachHubControllers();'), 'challenge lazy-load should re-attach hub controllers');

[
  ['js/core/collection_hub.js', 'collection', 'CollectionHubController', 'collectionHub'],
  ['js/core/challenge_hub.js', 'challenge', 'ChallengeHubController', 'challengeHub'],
  ['js/core/expedition_hub.js', 'expedition', 'ExpeditionHubController', 'expeditionHub'],
].forEach(([file, key, controllerName, propertyName]) => {
  const source = read(file);
  assert.ok(source.includes('registerHubController'), `${file} should register with hub registry`);
  assert.ok(source.includes(`'${key}'`) || source.includes(`"${key}"`), `${file} should register ${key} key`);
  assert.ok(source.includes('__attach'), `${file} should keep legacy global attach fallback`);
  assert.ok(source.includes(`game.${propertyName} instanceof ${controllerName}`), `${file} should keep idempotent attach`);
  assert.ok(source.includes('game[name] = bound'), `${file} should keep facade methods on game`);
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
