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
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => []
    },
    CHARACTERS: {
      linFeng: {
        stats: { maxHp: 80, gold: 100, energy: 3 },
        relic: null
      }
    },
    SKILLS: {},
    STARTER_DECK: [],
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {},
      random: (min) => min
    },
    Math,
    JSON,
    Date
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));

  const Player = vm.runInContext('Player', ctx);
  const CARDS = vm.runInContext('CARDS', ctx);
  assert(CARDS.bastionCrash, 'bastionCrash card should exist');
  assert(CARDS.fortressEdict, 'fortressEdict card should exist');

  const player = new Player();
  player.realm = 2;
  player.block = 20;

  const burstA = player.executeEffect(
    { type: 'blockBurst', ratio: 1, maxConsume: 12, minDamage: 4, target: 'enemy' },
    { currentHp: 40, buffs: {} },
    {}
  );
  assert(burstA.type === 'blockBurst', 'blockBurst effect should return blockBurst result');
  assert(burstA.consumedBlock === 12, `blockBurst should consume capped block, got ${burstA.consumedBlock}`);
  assert(burstA.value === 12, `blockBurst damage mismatch, got ${burstA.value}`);
  assert(player.block === 8, `blockBurst should reduce player block, block=${player.block}`);

  player.block = 3;
  const burstB = player.executeEffect(
    { type: 'blockBurst', ratio: 1.3, minDamage: 8, target: 'enemy' },
    { currentHp: 40, buffs: {} },
    {}
  );
  assert(burstB.consumedBlock === 3, `blockBurst should consume all remaining block, got ${burstB.consumedBlock}`);
  assert(burstB.value === 8, `blockBurst should respect minDamage floor, got ${burstB.value}`);
  assert(player.block === 0, 'block should be fully consumed');

  console.log('Bulwark blockburst checks passed.');
})();
