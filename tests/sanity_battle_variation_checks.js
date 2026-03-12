const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadFile(ctx, filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, ctx, { filename: filePath });
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const mathObj = Object.create(Math);
  mathObj.random = () => 0.95; // avoid random elite mutation in this test

  const ctx = vm.createContext({
    console,
    window: {},
    Math: mathObj,
    JSON,
    Date,
    CARDS: {
      heartDemon: { id: 'heartDemon', name: '心魔' }
    },
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => []
    },
    Utils: {
      showBattleLog: () => {},
      sleep: () => Promise.resolve(),
      addShakeEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/core/battle.js'));
  const Battle = vm.runInContext('Battle', ctx);
  assert(typeof Battle === 'function', 'Battle class should be defined');

  const game = {
    player: {
      realm: 14,
      buffs: {},
      activeResonances: [],
      collectedLaws: []
    }
  };
  const battle = new Battle(game);

  // 1) Archetype detection should distinguish enemy styles
  const strikerRole = battle.resolveEnemyCombatArchetype([
    { type: 'attack', value: 8 },
    { type: 'multiAttack', value: 5, count: 2 }
  ]);
  const guardianRole = battle.resolveEnemyCombatArchetype([
    { type: 'defend', value: 10 },
    { type: 'defend', value: 8 },
    { type: 'attack', value: 4 }
  ]);
  assert(strikerRole === 'striker', `expected striker role, got ${strikerRole}`);
  assert(guardianRole === 'guardian', `expected guardian role, got ${guardianRole}`);

  // 2) Variation blueprint should be generated for non-boss enemies in higher realms
  const blueprint = battle.getEnemyVariationBlueprint(
    { id: 'realm14_sentinel', name: '玄卫' },
    [{ type: 'attack', value: 9 }, { type: 'debuff', buffType: 'weak', value: 1 }],
    120
  );
  assert(blueprint && typeof blueprint === 'object', 'variation blueprint should exist');
  assert(typeof blueprint.tag === 'string' && blueprint.tag.length > 0, 'variation blueprint should include tag');
  assert(Array.isArray(blueprint.appendPatterns), 'variation blueprint should include append patterns');

  // 3) createEnemyInstance should carry variation tag and pattern enrichment
  const baseEnemy = {
    id: 'realm14_sentinel',
    name: '玄卫',
    hp: 60,
    maxHp: 60,
    patterns: [{ type: 'attack', value: 10, intent: '⚔️' }]
  };
  const enemy = battle.createEnemyInstance(baseEnemy);
  assert(enemy && typeof enemy === 'object', 'createEnemyInstance should return enemy object');
  assert(typeof enemy.enemyVariantTag === 'string' && enemy.enemyVariantTag.length > 0, 'enemy should carry variation tag');
  assert(enemy.name.includes('·'), `enemy name should include variation suffix, got ${enemy.name}`);
  assert(enemy.patterns.length >= 2, 'variation should enrich enemy pattern list');

  // 4) Squad ecology should attach formation tags and enrich multi-enemy encounters
  const squadEnemies = [
    battle.createEnemyInstance({
      id: 'squad_probe_a',
      name: '潮锋甲',
      hp: 64,
      maxHp: 64,
      patterns: [{ type: 'attack', value: 9, intent: '⚔️' }]
    }),
    battle.createEnemyInstance({
      id: 'squad_probe_b',
      name: '潮锋乙',
      hp: 68,
      maxHp: 68,
      patterns: [{ type: 'defend', value: 8, intent: '🛡️' }, { type: 'attack', value: 7, intent: '⚔️' }]
    }),
    battle.createEnemyInstance({
      id: 'squad_probe_c',
      name: '潮锋丙',
      hp: 66,
      maxHp: 66,
      patterns: [{ type: 'debuff', buffType: 'weak', value: 1, intent: '🌀' }, { type: 'attack', value: 8, intent: '⚔️' }]
    })
  ];
  battle.enemies = squadEnemies.filter(Boolean);
  battle.applyEnemySquadEcology();
  assert(battle.activeSquadEcology && battle.activeSquadEcology.id, 'squad ecology should produce active formation metadata');
  assert(
    battle.enemies.every((e) => typeof e.enemySquadTag === 'string' && e.enemySquadTag.length > 0),
    'squad enemies should carry squad tag for UI rendering'
  );
  assert(
    battle.enemies.some((e) => Array.isArray(e.patterns) && e.patterns.length >= 3),
    'squad ecology should enrich at least one enemy behavior pattern set'
  );
  const squadReward = battle.consumeSquadEcologyVictoryBonusSummary();
  assert(squadReward && typeof squadReward === 'object', 'squad ecology should generate victory reward summary');
  assert(Number(squadReward.goldBonus || 0) > 0, 'squad reward should grant extra gold');
  assert(Number(squadReward.ringExpBonus || 0) > 0, 'squad reward should grant ring exp bonus');
  assert(Array.isArray(squadReward.adventureBuffRewards), 'squad reward should expose adventure buff rewards');
  assert(battle.consumeSquadEcologyVictoryBonusSummary() === null, 'squad reward summary should be consumable only once');

  // 5) Bosses should not receive normal variation tags
  const boss = battle.createEnemyInstance({
    id: 'boss_case',
    name: '天劫化身',
    isBoss: true,
    hp: 100,
    maxHp: 100,
    patterns: [{ type: 'attack', value: 12, intent: '⚔️' }]
  });
  assert(!boss.enemyVariantTag, 'boss should not receive normal variation tag');

  // 6) Candy display snapshot should remain stable for HUD rendering logic
  battle.player.milkCandy = 5;
  battle.player.maxMilkCandy = 7;
  const candyA = battle.getCandyDisplaySnapshot(6);
  assert(candyA.collapsed === false, 'milk candy <= threshold should not collapse');
  assert(candyA.iconCount === 5, `expected 5 candy icons, got ${candyA.iconCount}`);
  assert(candyA.text === '5/7', `expected text 5/7, got ${candyA.text}`);

  battle.player.milkCandy = 9;
  battle.player.maxMilkCandy = 9;
  const candyB = battle.getCandyDisplaySnapshot(6);
  assert(candyB.collapsed === true, 'milk candy > threshold should collapse');
  assert(candyB.iconCount === 1, `collapsed candy should render one icon, got ${candyB.iconCount}`);
  assert(candyB.text === '9/9', `expected text 9/9, got ${candyB.text}`);

  console.log('Battle variation checks passed.');
})();
