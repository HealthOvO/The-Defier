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
  let dirtyCalls = 0;

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
        stats: { maxHp: 88, gold: 100, energy: 3 },
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

  const player = new Player();
  player.realm = 2;
  player.turnNumber = 1;
  player.drawCount = 0;
  player.hand = [];
  player.drawPile = [
    { id: 'mockCardA', name: 'Mock A', cost: 1, baseCost: 1, effects: [] },
    { id: 'mockCardB', name: 'Mock B', cost: 1, baseCost: 1, effects: [] }
  ];
  player.archetypeResonance = null;
  player.legacyRunDoctrine = {
    presetId: 'bulwark',
    bulwarkLegacyProcEnabled: true,
    bulwarkLegacyDraw: 1,
    bulwarkLegacyCounterDamage: 2,
    bulwarkProcUsedThisTurn: false
  };

  const target = { name: '木甲守卫', currentHp: 18, buffs: {} };
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
        dirtyCalls += 1;
      }
    }
  };

  player.addBlock(6);
  const procCallsAfterFirst = missionCalls.filter((entry) => entry.eventType === 'bulwarkBlockProc');
  assert(player.hand.length === 1, 'bulwark legacy doctrine should draw one card on first block gain');
  assert(target.currentHp === 16, 'bulwark legacy doctrine should deal configured counter damage');
  assert(player.legacyRunDoctrine.bulwarkProcUsedThisTurn === true, 'bulwark block proc should lock in current turn');
  assert(dirtyCalls === 1, 'bulwark block proc should mark battle UI dirty');
  assert(
    procCallsAfterFirst.length === 1,
    'bulwark block proc should report mission progress'
  );

  player.addBlock(3);
  const procCallsAfterSecond = missionCalls.filter((entry) => entry.eventType === 'bulwarkBlockProc');
  assert(player.hand.length === 1, 'bulwark block proc should not retrigger in same turn');
  assert(target.currentHp === 16, 'bulwark block proc should not deal damage twice in same turn');
  assert(procCallsAfterSecond.length === 1, 'bulwark mission progress should not retrigger in same turn');

  player.startTurn();
  assert(player.legacyRunDoctrine.bulwarkProcUsedThisTurn === false, 'new turn should reset bulwark block proc flag');

  player.addBlock(4);
  const procCallsAfterThird = missionCalls.filter((entry) => entry.eventType === 'bulwarkBlockProc');
  assert(player.hand.length === 2, 'next turn first block should trigger draw again');
  assert(target.currentHp === 14, 'next turn first block should deal damage again');
  assert(dirtyCalls === 2, 'next turn proc should mark UI dirty again');
  assert(procCallsAfterThird.length === 2, 'next turn proc should report mission progress again');

  console.log('Bulwark doctrine checks passed.');
})();
