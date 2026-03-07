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

(async function run() {
  const root = path.resolve(__dirname, '..');

  const ctx = vm.createContext({
    console,
    window: {},
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => []
    },
    Utils: {
      sleep: () => Promise.resolve(),
      showBattleLog: () => {},
      addShakeEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {},
      random: (min) => min
    },
    Math,
    JSON,
    Date,
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
      realm: 1,
      buffs: {},
      activeResonances: [],
      collectedLaws: [],
      takeDamage: () => ({ damage: 0, dodged: false })
    },
    handleLegacyMissionProgress: () => false
  };
  const battle = new Battle(game);
  battle.markUIDirty = () => {};
  battle.updateBattleUI = () => {};
  battle.updateHandUI = () => {};

  const target = { name: '木桩', currentHp: 30, buffs: {}, isBoss: false };
  await battle.processEffect({ type: 'debuff', buffType: 'weak', value: 2 }, target, 0);
  assert(target.buffs.weak === 2, `weak should apply once, got ${target.buffs.weak}`);

  const stunTarget = { name: '眩晕木桩', currentHp: 30, buffs: {}, isBoss: false };
  await battle.processEffect({ type: 'debuff', buffType: 'stun', value: 1 }, stunTarget, 0);
  assert(stunTarget.buffs.stun === 1, `stun should apply once, got ${stunTarget.buffs.stun}`);
  assert(stunTarget.stunned === true, 'stun should set target.stunned');

  const immuneTarget = { name: '免疫木桩', currentHp: 30, buffs: { controlImmune: 1 }, isBoss: false };
  await battle.processEffect({ type: 'debuff', buffType: 'stun', value: 1 }, immuneTarget, 0);
  assert(!immuneTarget.buffs.stun, 'immune target should not receive stun stacks');
  assert(!immuneTarget.stunned, 'immune target should not be marked stunned');

  const aoeEnemy = { name: '群体木桩', currentHp: 30 };
  battle.enemies = [aoeEnemy];
  await battle.processEffect({ type: 'debuffAll', buffType: 'weak', value: 3 }, null, -1);
  assert(aoeEnemy.buffs && aoeEnemy.buffs.weak === 3, 'debuffAll should initialize buffs and apply once');

  console.log('Battle debuff checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
