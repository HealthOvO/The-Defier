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

  // 1) cursebound: 首次自损应转化为抽牌、护盾与追击
  {
    uiDirtyCalls = 0;
    const player = new Player();
    player.realm = 2;
    player.turnNumber = 1;
    player.currentHp = 70;
    player.maxHp = 90;
    player.block = 0;
    player.deck = ARCHETYPE_PACKS.cursebound.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
    player.resolveArchetypeResonance();
    assert(player.archetypeResonance && player.archetypeResonance.id === 'cursebound', 'cursebound resonance should resolve');
    assert(player.archetypeResonance.tier === 1, 'cursebound resonance tier should be 1 for 10-card core');

    player.drawPile = [
      { ...CARDS.strike, instanceId: 'curse_draw_1' },
      { ...CARDS.defend, instanceId: 'curse_draw_2' }
    ];
    player.hand = [];
    const target = { name: '契靶', currentHp: 30, buffs: {} };
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

    const results = player.executeCardEffects({ ...CARDS.blacktidePact }, target, {});
    const selfDamageResult = results.find((entry) => entry && entry.type === 'selfDamage');
    assert(selfDamageResult && selfDamageResult.value === 3, `blacktidePact should self-damage for 3, got ${selfDamageResult ? selfDamageResult.value : 'null'}`);
    assert(player.currentHp === 67, `cursebound self damage should reduce hp to 67, got ${player.currentHp}`);
    assert(player.block >= 5, `cursebound proc should grant >=5 block, got ${player.block}`);
    assert(player.currentEnergy >= 4, `blacktidePact should grant 1 energy, got ${player.currentEnergy}`);
    assert(player.hand.length === 2, `cursebound proc + card draw should add 2 cards, got ${player.hand.length}`);
    assert(target.currentHp === 27, `cursebound proc should deal 3 damage, got target hp ${target.currentHp}`);
    assert(player.archetypeResonance.procUsedThisTurn === true, 'cursebound proc flag should be consumed');
    assert(uiDirtyCalls === 1, 'cursebound proc should mark UI dirty once');

    player.executeEffect({ type: 'selfDamage', value: 2, target: 'self' }, target, {});
    assert(target.currentHp === 27, 'cursebound proc should not retrigger in same turn');
    assert(uiDirtyCalls === 1, 'cursebound proc should not mark UI dirty twice');
  }

  // 2) soulforge: 首次生成构件应触发抽牌、护盾与追击
  {
    uiDirtyCalls = 0;
    const player = new Player();
    player.realm = 2;
    player.turnNumber = 1;
    player.currentHp = 80;
    player.maxHp = 90;
    player.block = 0;
    player.deck = ARCHETYPE_PACKS.soulforge.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
    player.resolveArchetypeResonance();
    assert(player.archetypeResonance && player.archetypeResonance.id === 'soulforge', 'soulforge resonance should resolve');
    assert(player.archetypeResonance.tier === 1, 'soulforge resonance tier should be 1 for 10-card core');

    player.drawPile = [
      { ...CARDS.strike, instanceId: 'forge_draw_1' },
      { ...CARDS.defend, instanceId: 'forge_draw_2' }
    ];
    player.hand = [];
    const target = { name: '炉靶', currentHp: 32, buffs: {} };
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

    const results = player.executeCardEffects({ ...CARDS.emberPuppetScript }, target, {});
    const createResult = results.find((entry) => entry && entry.type === 'createCard');
    assert(createResult && createResult.count === 1, `emberPuppetScript should create 1 construct, got ${createResult ? createResult.count : 'null'}`);
    assert(player.hand.length === 3, `createCard + resonance draw + card draw should leave 3 cards in hand, got ${player.hand.length}`);
    assert(player.block >= 6, `soulforge proc should grant >=6 block, got ${player.block}`);
    assert(target.currentHp === 29, `soulforge proc should deal 3 damage, got target hp ${target.currentHp}`);
    assert(player.archetypeResonance.procUsedThisTurn === true, 'soulforge proc flag should be consumed');
    assert(uiDirtyCalls === 1, 'soulforge proc should mark UI dirty once');

    player.executeCardEffects({ ...CARDS.spareSoulCore }, target, {});
    assert(target.currentHp === 29, 'soulforge proc should not retrigger in same turn');
    assert(uiDirtyCalls === 1, 'soulforge proc should not mark UI dirty twice');
  }

  console.log('Cursebound & soulforge resonance checks passed.');
})();
