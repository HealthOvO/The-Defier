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
  let uiDirtyCalls = 0;

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
        stats: { maxHp: 90, gold: 100, energy: 3 },
        relic: null,
        deck: []
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
  const ARCHETYPE_PACKS = vm.runInContext('ARCHETYPE_PACKS', ctx);

  const player = new Player();
  player.realm = 2;
  player.deck = ARCHETYPE_PACKS.bulwark.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
  player.resolveArchetypeResonance();
  assert(player.archetypeResonance && player.archetypeResonance.id === 'bulwark', 'bulwark resonance should be resolved');
  assert(player.archetypeResonance.tier === 1, 'tier should be 1 for 10 matching cards');

  player.turnNumber = 1;
  player.hand = [];
  player.drawPile = [
    { id: 'mockA', name: 'Mock A', cost: 1, baseCost: 1, effects: [{ type: 'draw', value: 1 }] },
    { id: 'mockB', name: 'Mock B', cost: 1, baseCost: 1, effects: [{ type: 'draw', value: 1 }] }
  ];

  const target = { name: '玄铁傀儡', currentHp: 30, buffs: {} };
  player.game = {
    battle: {
      enemies: [target],
      dealDamageToEnemy(enemy, amount) {
        enemy.currentHp -= amount;
        return amount;
      },
      markUIDirty() {
        uiDirtyCalls += 1;
      }
    }
  };

  player.addBlock(6);
  assert(player.block >= 6, 'block should be gained');
  assert(player.hand.length === 1, 'first block proc should draw once');
  assert(target.currentHp === 27, 'first block proc should counter attack once');
  assert(player.archetypeResonance.procUsedThisTurn === true, 'block proc should lock for current turn');
  assert(uiDirtyCalls === 1, 'first block proc should mark UI dirty');

  player.addBlock(4);
  assert(player.hand.length === 1, 'block proc should not retrigger in same turn');
  assert(target.currentHp === 27, 'counter damage should not trigger twice in same turn');

  player.startTurn();
  assert(player.archetypeResonance.procUsedThisTurn === false, 'new turn should reset block proc flag');

  player.addBlock(3);
  assert(player.hand.length >= 2, 'new turn first block should trigger draw again');
  assert(target.currentHp === 24, 'new turn first block should trigger counter damage again');
  assert(uiDirtyCalls === 2, 'second turn trigger should mark UI dirty again');

  console.log('Bulwark resonance checks passed.');
})();
