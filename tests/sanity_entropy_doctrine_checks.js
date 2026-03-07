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
  const missionCalls = [];

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
    CARDS: {},
    Math,
    JSON,
    Date
  });

  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/core/player.js'));
  const Player = vm.runInContext('Player', ctx);
  assert(typeof Player === 'function', 'Player class should be defined');

  const player = new Player();
  player.drawPile = [{ id: 'dummy', cost: 1, baseCost: 1 }];
  player.hand = [];
  player.currentEnergy = 3;
  player.legacyRunDoctrine = {
    presetId: 'entropy',
    entropyLegacyProcEnabled: true,
    entropyLegacyDraw: 1,
    entropyLegacyDiscardDamage: 2,
    entropyProcUsedThisTurn: false,
    entropyBonusEnergyOnce: 1,
    entropyBonusEnergyUsed: false
  };

  const target = { name: '训练木桩', currentHp: 20, buffs: {} };
  let markDirtyCalls = 0;
  player.game = {
    handleLegacyMissionProgress(eventType, amount) {
      missionCalls.push({ eventType, amount });
      return true;
    },
    battle: {
      enemies: [target],
      dealDamageToEnemy(enemy, amount) {
        enemy.currentHp -= amount;
        return amount;
      },
      markUIDirty() {
        markDirtyCalls += 1;
      }
    }
  };

  player.triggerArchetypeDiscardProc(1);
  assert(player.hand.length === 1, 'entropy legacy doctrine should draw one card on first discard');
  assert(player.currentEnergy === 4, 'entropy legacy doctrine should grant one bonus energy once per battle');
  assert(target.currentHp === 18, 'entropy legacy doctrine should deal configured discard damage');
  assert(player.legacyRunDoctrine.entropyProcUsedThisTurn === true, 'discard proc should lock for current turn');
  assert(player.legacyRunDoctrine.entropyBonusEnergyUsed === true, 'bonus energy flag should be consumed after first proc');
  assert(markDirtyCalls === 1, 'discard proc should mark battle UI dirty');
  assert(
    missionCalls.length === 1 && missionCalls[0].eventType === 'entropyDiscardProc',
    'discard proc should report entropy mission progress'
  );

  player.triggerArchetypeDiscardProc(1);
  assert(player.hand.length === 1, 'discard proc should not retrigger in the same turn');
  assert(target.currentHp === 18, 'discard proc should not deal damage twice in the same turn');
  assert(missionCalls.length === 1, 'discard proc should not report mission progress twice in same turn');

  console.log('Entropy doctrine checks passed.');
})();
