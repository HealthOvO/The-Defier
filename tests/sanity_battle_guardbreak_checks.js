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

  const ctx = vm.createContext({
    console,
    window: {},
    Math: mathObj,
    JSON,
    Date,
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
    },
    setTimeout,
    clearTimeout
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/core/battle.js'));
  const Battle = vm.runInContext('Battle', ctx);
  assert(typeof Battle === 'function', 'Battle class should be defined');

  const game = {
    player: {
      realm: 2,
      block: 20,
      buffs: {},
      activeResonances: [],
      collectedLaws: []
    }
  };
  const battle = new Battle(game);

  const sunderEnemy = { name: '破阵卫', isElite: true, eliteType: 'sunder', guardBreakUsedThisTurn: false };
  const damaged = battle.applyGuardBreakPressure(sunderEnemy, 10);
  assert(damaged === 15, `sunder should add guardbreak damage, got ${damaged}`);
  assert(game.player.block === 11, `sunder should shatter block once, block=${game.player.block}`);
  assert(sunderEnemy.guardBreakUsedThisTurn === true, 'sunder should lock guardbreak per turn');

  const secondDamage = battle.applyGuardBreakPressure(sunderEnemy, 10);
  assert(secondDamage === 10, `sunder second hit should not re-shatter in same turn, got ${secondDamage}`);
  assert(game.player.block === 11, 'block should remain unchanged on second same-turn hit');

  game.player.block = 24;
  const bossEnemy = { name: '天阙监军', isBoss: true, isElite: false, guardBreakUsedThisTurn: false };
  ctx.Math.random = () => 0.1; // trigger boss pressure path
  const bossDamage = battle.applyGuardBreakPressure(bossEnemy, 10);
  assert(bossDamage === 12, `boss pressure should add guardbreak damage, got ${bossDamage}`);
  assert(game.player.block === 17, `boss pressure should shatter some block, block=${game.player.block}`);

  console.log('Battle guardbreak checks passed.');
})();
