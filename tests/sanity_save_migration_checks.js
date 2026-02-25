const fs = require('fs');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(function run() {
  const code = fs.readFileSync('/Users/health/workspace/The Defier/js/game.js', 'utf8');
  const ctx = vm.createContext({
    console,
    window: {},
    document: {
      addEventListener: () => {},
      querySelectorAll: () => [],
      getElementById: () => null
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    setTimeout: () => 0,
    clearTimeout: () => {}
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'game.js' });
  const Game = vm.runInContext('Game', ctx);

  const legacySave = {
    version: '5.0.0',
    player: {
      stance: 'neutral',
      currentHp: 20,
      deck: [{ id: 'strike' }]
    },
    map: { nodes: [], currentNodeIndex: -1, completedNodes: [] },
    unlockedRealms: [1],
    currentScreen: 'map-screen'
  };

  const migrated = Game.prototype.migrateSaveData.call({
    featureFlags: {
      combatDepthV2: true,
      pvpRuleSyncV2: true,
      mapNodeTrialForge: true
    }
  }, legacySave);

  assert(migrated.version === '5.1.0', 'legacy save should migrate to 5.1.0');
  assert(migrated.combatMeta && migrated.combatMeta.ruleVersion === 'combat-v2', 'combatMeta should be attached');
  assert(migrated.pvpMeta && migrated.pvpMeta.ruleVersion === 'pvp-v2', 'pvpMeta should be attached');
  assert(migrated.featureFlags && migrated.featureFlags.combatDepthV2 === true, 'featureFlags should be attached');
  assert(typeof migrated.schemaMigratedAt === 'number', 'schemaMigratedAt should be timestamp');

  console.log('Save migration sanity checks passed.');
})();
