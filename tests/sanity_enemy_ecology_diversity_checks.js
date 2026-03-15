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
  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/enemies.js'));
  const ENEMIES = vm.runInContext('ENEMIES', ctx);
  const ENEMY_ECOLOGY_TEMPLATES = vm.runInContext('ENEMY_ECOLOGY_TEMPLATES', ctx);
  const CHAPTER_ELITE_COMBOS = vm.runInContext('CHAPTER_ELITE_COMBOS', ctx);
  const getEnemiesForRealm = vm.runInContext('getEnemiesForRealm', ctx);

  const allIds = new Set(Object.keys(ENEMIES));
  assert(allIds.size >= 94, `enemy roster should reach V6.0 target (>=94), got ${allIds.size}`);
  assert(Object.keys(ENEMY_ECOLOGY_TEMPLATES || {}).length >= 6, 'chapter ecology templates should cover all 6 chapters');
  assert(Object.keys(CHAPTER_ELITE_COMBOS || {}).length >= 6, 'chapter elite combos should cover all 6 chapters');

  const globalCats = { attack: 0, defend: 0, debuff: 0, support: 0 };
  const attackTypes = new Set(['attack', 'multiAttack', 'executeDamage']);
  const defendTypes = new Set(['defend', 'heal']);
  const debuffTypes = new Set(['debuff', 'addStatus']);
  const supportTypes = new Set(['multiAction', 'summon']);

  for (let realm = 1; realm <= 18; realm += 1) {
    const enemies = getEnemiesForRealm(realm);
    assert(Array.isArray(enemies) && enemies.length >= 4, `realm ${realm} should provide >=4 enemies after ecology pack`);

    let hasBurstEnemy = false;
    let hasControlOrDefenseEnemy = false;
    let realmAttack = 0;
    let realmUtility = 0;

    enemies.forEach((enemy) => {
      assert(enemy && enemy.id, `realm ${realm} contains invalid enemy entry`);
      assert(enemy.ecologyGroup, `enemy ${enemy.id} should expose ecologyGroup`);
      assert(enemy.ecologyLabel, `enemy ${enemy.id} should expose ecologyLabel`);
      const patterns = Array.isArray(enemy.patterns) ? enemy.patterns : [];
      assert(patterns.length >= 2, `enemy ${enemy.id} should have >=2 behavior patterns`);

      let attackCount = 0;
      let utilityCount = 0;
      patterns.forEach((pattern) => {
        const type = pattern && pattern.type;
        if (!type) return;
        if (attackTypes.has(type)) {
          attackCount += 1;
          realmAttack += 1;
          globalCats.attack += 1;
        }
        if (defendTypes.has(type)) {
          utilityCount += 1;
          realmUtility += 1;
          globalCats.defend += 1;
        }
        if (debuffTypes.has(type)) {
          utilityCount += 1;
          realmUtility += 1;
          globalCats.debuff += 1;
        }
        if (supportTypes.has(type)) {
          utilityCount += 1;
          realmUtility += 1;
          globalCats.support += 1;
        }
      });

      if (attackCount >= 2) hasBurstEnemy = true;
      if (utilityCount >= 1) hasControlOrDefenseEnemy = true;
    });

    assert(realmAttack > 0, `realm ${realm} should include offensive patterns`);
    assert(realmUtility > 0, `realm ${realm} should include utility/control patterns`);
    assert(hasBurstEnemy, `realm ${realm} should include at least one burst-oriented enemy`);
    assert(hasControlOrDefenseEnemy, `realm ${realm} should include at least one control/defense enemy`);
  }

  assert(globalCats.attack > 0, 'global enemy ecology should include attack patterns');
  assert(globalCats.defend > 0, 'global enemy ecology should include defense patterns');
  assert(globalCats.debuff > 0, 'global enemy ecology should include debuff/control patterns');
  assert(globalCats.support > 0, 'global enemy ecology should include support patterns');

  for (let chapterIndex = 1; chapterIndex <= 6; chapterIndex += 1) {
    const template = ENEMY_ECOLOGY_TEMPLATES[chapterIndex];
    const combo = CHAPTER_ELITE_COMBOS[chapterIndex];
    assert(template && template.formation && template.elite, `chapter ${chapterIndex} should define both ecology and elite templates`);
    assert(combo && Array.isArray(combo.anchorEnemyIds) && combo.anchorEnemyIds.length >= 2, `chapter ${chapterIndex} should define anchor elite combo ids`);
  }

  console.log('Enemy ecology diversity checks passed.');
})();
