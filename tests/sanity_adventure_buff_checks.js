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
        stats: { maxHp: 88, gold: 100, energy: 3 },
        relic: null,
        deck: ['mockStrike', 'mockGuard']
      }
    },
    SKILLS: {},
    STARTER_DECK: ['mockStrike', 'mockGuard'],
    FATE_RING: {
      levels: {
        0: { bonus: {} }
      },
      paths: {}
    },
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {},
      random: (min) => min
    },
    CARDS: {
      mockStrike: {
        id: 'mockStrike',
        name: 'Mock Strike',
        type: 'attack',
        cost: 1,
        damage: 6,
        effects: []
      },
      mockGuard: {
        id: 'mockGuard',
        name: 'Mock Guard',
        type: 'skill',
        cost: 1,
        block: 6,
        effects: []
      }
    },
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
  player.drawCount = 0;

  player.ensureAdventureBuffs();
  assert(player.adventureBuffs.firstTurnDrawBoostBattles === 0, 'firstTurnDraw buff should default to 0');
  assert(player.adventureBuffs.openingBlockBoostBattles === 0, 'openingBlock buff should default to 0');
  assert(player.adventureBuffs.victoryGoldBoostBattles === 0, 'victoryGold buff should default to 0');
  assert(player.adventureBuffs.firstTurnEnergyBoostBattles === 0, 'firstTurnEnergy buff should default to 0');
  assert(player.adventureBuffs.ringExpBoostBattles === 0, 'ringExp buff should default to 0');
  assert(player.adventureBuffs.victoryHealBoostBattles === 0, 'victoryHeal buff should default to 0');

  player.adventureBuffs = {
    firstTurnDrawBoostBattles: -3,
    openingBlockBoostBattles: '2.8',
    victoryGoldBoostBattles: 'bad',
    firstTurnEnergyBoostBattles: -1,
    ringExpBoostBattles: 1.9,
    victoryHealBoostBattles: -99
  };
  player.ensureAdventureBuffs();
  assert(player.adventureBuffs.firstTurnDrawBoostBattles === 0, 'ensureAdventureBuffs should clamp negative draw buff');
  assert(player.adventureBuffs.openingBlockBoostBattles === 2, 'ensureAdventureBuffs should floor numeric-like openingBlock buff');
  assert(player.adventureBuffs.victoryGoldBoostBattles === 0, 'ensureAdventureBuffs should sanitize invalid victoryGold buff');
  assert(player.adventureBuffs.firstTurnEnergyBoostBattles === 0, 'ensureAdventureBuffs should clamp negative firstTurnEnergy buff');
  assert(player.adventureBuffs.ringExpBoostBattles === 1, 'ensureAdventureBuffs should floor ringExp buff');
  assert(player.adventureBuffs.victoryHealBoostBattles === 0, 'ensureAdventureBuffs should clamp negative victoryHeal buff');

  player.adventureBuffs = {
    firstTurnDrawBoostBattles: 0,
    openingBlockBoostBattles: 0,
    victoryGoldBoostBattles: 0,
    firstTurnEnergyBoostBattles: 0,
    ringExpBoostBattles: 0,
    victoryHealBoostBattles: 0
  };

  assert(player.grantAdventureBuff('firstTurnDrawBoostBattles', 2), 'grant firstTurnDraw buff should succeed');
  assert(player.grantAdventureBuff('openingBlockBoostBattles', 2), 'grant openingBlock buff should succeed');
  assert(player.grantAdventureBuff('victoryGoldBoostBattles', 2), 'grant victoryGold buff should succeed');
  assert(player.grantAdventureBuff('firstTurnEnergyBoostBattles', 2), 'grant firstTurnEnergy buff should succeed');
  assert(player.grantAdventureBuff('ringExpBoostBattles', 2), 'grant ringExp buff should succeed');
  assert(player.grantAdventureBuff('victoryHealBoostBattles', 2), 'grant victoryHeal buff should succeed');

  player.prepareBattle();
  assert(player.adventureBuffs.openingBlockBoostBattles === 1, 'prepareBattle should consume one openingBlock charge');
  assert(player.block >= 10, `prepareBattle should grant opening block, got ${player.block}`);

  const firstTurnEnergyBefore = player.currentEnergy;
  player.startTurn();
  assert(player.adventureBuffs.firstTurnDrawBoostBattles === 1, 'startTurn should consume one firstTurnDraw charge on turn 1');
  assert(player.adventureBuffs.firstTurnEnergyBoostBattles === 1, 'startTurn should consume one firstTurnEnergy charge on turn 1');
  assert(player.hand.length >= 1, `startTurn should draw extra card from adventure buff, got hand=${player.hand.length}`);
  assert(player.currentEnergy > firstTurnEnergyBefore, 'startTurn should increase energy with firstTurnEnergy buff');

  player.startTurn();
  assert(player.adventureBuffs.firstTurnEnergyBoostBattles === 1, 'turn 2 should not consume firstTurnEnergy charge');

  const goldBonus1 = player.consumeAdventureVictoryGoldBoost(100);
  assert(goldBonus1 === 50, `victory gold bonus should be 50% of base, got ${goldBonus1}`);
  assert(player.adventureBuffs.victoryGoldBoostBattles === 1, 'consumeAdventureVictoryGoldBoost should consume one charge');

  const expBonus1 = player.consumeAdventureRingExpBoost(100);
  assert(expBonus1 === 30, `ring exp bonus should be 30% of base, got ${expBonus1}`);
  const expBonus2 = player.consumeAdventureRingExpBoost(50);
  assert(expBonus2 === 15, `second ring exp bonus should be 15, got ${expBonus2}`);
  const expBonus3 = player.consumeAdventureRingExpBoost(50);
  assert(expBonus3 === 0, `ring exp bonus should be 0 when charges exhausted, got ${expBonus3}`);

  const healBonus1 = player.consumeAdventureVictoryHealBoost(player.maxHp);
  assert(healBonus1 >= 6, `victory heal bonus should be at least 6, got ${healBonus1}`);
  assert(player.adventureBuffs.victoryHealBoostBattles === 1, 'consumeAdventureVictoryHealBoost should consume one charge');
  const healBonus2 = player.consumeAdventureVictoryHealBoost(player.maxHp);
  assert(healBonus2 >= 6, `second victory heal bonus should be at least 6, got ${healBonus2}`);
  const healBonus3 = player.consumeAdventureVictoryHealBoost(player.maxHp);
  assert(healBonus3 === 0, `victory heal bonus should be 0 when charges exhausted, got ${healBonus3}`);

  player.prepareBattle();
  assert(player.adventureBuffs.openingBlockBoostBattles === 0, 'second prepareBattle should consume remaining openingBlock charge');

  player.prepareBattle();
  assert(player.adventureBuffs.openingBlockBoostBattles === 0, 'openingBlock charges should not go negative');

  const goldBonus2 = player.consumeAdventureVictoryGoldBoost(80);
  assert(goldBonus2 === 40, `second victory gold bonus should be 40, got ${goldBonus2}`);
  const goldBonus3 = player.consumeAdventureVictoryGoldBoost(80);
  assert(goldBonus3 === 0, `victory gold bonus should be 0 when charges exhausted, got ${goldBonus3}`);

  console.log('Adventure buff checks passed.');
})();
