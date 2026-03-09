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
  mathObj.random = () => 0; // deterministic target pick

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
      random: (min) => min,
      sleep: () => Promise.resolve(),
      addShakeEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {}
    },
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
    Math: mathObj,
    JSON,
    Date
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/core/battle.js'));

  const Player = vm.runInContext('Player', ctx);
  const Battle = vm.runInContext('Battle', ctx);
  const CARDS = vm.runInContext('CARDS', ctx);
  const ARCHETYPE_PACKS = vm.runInContext('ARCHETYPE_PACKS', ctx);

  // 1) stormcraft: 首次命中易伤目标触发追击 + 抽牌
  {
    const player = new Player();
    player.deck = ARCHETYPE_PACKS.stormcraft.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
    player.resolveArchetypeResonance();
    assert(player.archetypeResonance && player.archetypeResonance.id === 'stormcraft', 'stormcraft resonance should resolve');
    assert(player.archetypeResonance.tier === 1, 'stormcraft resonance tier should be 1 for 10-card core');

    player.turnNumber = 1;
    player.hand = [];
    player.drawPile = [{ ...CARDS.strike, instanceId: 'storm_draw_1' }];
    const game = { player };
    const battle = new Battle(game);
    game.battle = battle;
    player.game = game;

    const e1 = {
      id: 'storm_dummy_1',
      name: '雷靶一号',
      maxHp: 50,
      currentHp: 50,
      block: 0,
      buffs: { vulnerable: 1 }
    };
    battle.enemies = [e1];
    const dealt1 = battle.dealDamageToEnemy(e1, 10);
    assert(dealt1 === 14, `stormcraft first vulnerable strike should deal 14, got ${dealt1}`);
    assert(player.hand.length === 1, `stormcraft first vulnerable strike should draw 1, got ${player.hand.length}`);
    assert(player.archetypeResonance.procUsedThisTurn === true, 'stormcraft proc flag should be consumed');

    const e2 = {
      id: 'storm_dummy_2',
      name: '雷靶二号',
      maxHp: 50,
      currentHp: 50,
      block: 0,
      buffs: { vulnerable: 1 }
    };
    battle.enemies = [e2];
    const dealt2 = battle.dealDamageToEnemy(e2, 10);
    assert(dealt2 === 11, `stormcraft proc should not retrigger in same turn, expected 11 got ${dealt2}`);
    assert(player.hand.length === 1, 'stormcraft should not draw again in same turn');
  }

  // 2) vitalweave: 首次治疗触发护盾与追击
  {
    const player = new Player();
    player.realm = 2;
    player.deck = ARCHETYPE_PACKS.vitalweave.cards.slice(0, 10).map((id) => ({ ...CARDS[id] }));
    player.resolveArchetypeResonance();
    assert(player.archetypeResonance && player.archetypeResonance.id === 'vitalweave', 'vitalweave resonance should resolve');
    assert(player.archetypeResonance.tier === 1, 'vitalweave resonance tier should be 1 for 10-card core');

    player.turnNumber = 1;
    player.currentHp = 40;
    player.maxHp = 80;
    player.block = 0;
    const target = { name: '木桩', currentHp: 30, buffs: {} };
    let dirtyCalls = 0;
    player.game = {
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

    const healed1 = player.heal(10);
    assert(healed1 === 10, `heal should return actual heal amount 10, got ${healed1}`);
    assert(player.block >= 6, `vitalweave heal proc should grant >=6 block, got ${player.block}`);
    assert(target.currentHp === 25, `vitalweave heal proc should deal 5 damage, got target hp ${target.currentHp}`);
    assert(player.archetypeResonance.procUsedThisTurn === true, 'vitalweave proc flag should be consumed');
    assert(dirtyCalls === 1, 'vitalweave heal proc should mark UI dirty once');

    player.heal(5);
    assert(target.currentHp === 25, 'vitalweave should not retrigger in same turn');
    assert(dirtyCalls === 1, 'vitalweave should not mark UI dirty twice in same turn');
  }

  // 3) stormcraft doctrine: 无共鸣也应触发易伤追击与任务进度
  {
    const player = new Player();
    player.archetypeResonance = null;
    player.legacyRunDoctrine = {
      ...(player.legacyRunDoctrine || {}),
      stormcraftLegacyProcEnabled: true,
      stormcraftLegacyBonusDamage: 4,
      stormcraftLegacyDraw: 1,
      stormcraftProcUsedThisTurn: false
    };
    player.turnNumber = 1;
    player.hand = [];
    player.drawPile = [{ ...CARDS.strike, instanceId: 'storm_legacy_draw' }];
    const missionCalls = [];
    const game = {
      player,
      handleLegacyMissionProgress(eventType, amount) {
        missionCalls.push({ eventType, amount });
      }
    };
    const battle = new Battle(game);
    game.battle = battle;
    player.game = game;

    const target = {
      id: 'storm_legacy_target',
      name: '雷靶道统',
      maxHp: 60,
      currentHp: 60,
      block: 0,
      buffs: { vulnerable: 1 }
    };
    battle.enemies = [target];
    const dealt = battle.dealDamageToEnemy(target, 10);
    assert(dealt === 15, `stormcraft doctrine proc should deal 15 damage, got ${dealt}`);
    assert(player.hand.length === 1, 'stormcraft doctrine proc should draw 1 card');
    assert(player.legacyRunDoctrine.stormcraftProcUsedThisTurn === true, 'stormcraft doctrine flag should be consumed');
    assert(
      missionCalls.length === 1 && missionCalls[0].eventType === 'stormcraftVulnerableProc',
      'stormcraft doctrine proc should report mission progress'
    );

    const target2 = {
      id: 'storm_legacy_target_2',
      name: '雷靶道统二号',
      maxHp: 60,
      currentHp: 60,
      block: 0,
      buffs: { vulnerable: 1 }
    };
    battle.enemies = [target2];
    const dealt2 = battle.dealDamageToEnemy(target2, 10);
    assert(dealt2 === 11, `stormcraft doctrine should not retrigger in same turn, got ${dealt2}`);
    assert(missionCalls.length === 1, 'stormcraft doctrine mission should not retrigger in same turn');
  }

  // 4) vitalweave doctrine: 无共鸣也应触发回生转化与任务进度
  {
    const player = new Player();
    player.realm = 2;
    player.archetypeResonance = null;
    player.legacyRunDoctrine = {
      ...(player.legacyRunDoctrine || {}),
      vitalweaveLegacyProcEnabled: true,
      vitalweaveLegacyBlockRatio: 0.5,
      vitalweaveLegacyBurstDamage: 4,
      vitalweaveLegacyDraw: 1,
      vitalweaveProcUsedThisTurn: false
    };
    player.turnNumber = 1;
    player.currentHp = 40;
    player.maxHp = 80;
    player.block = 0;
    player.drawPile = [{ ...CARDS.defend, instanceId: 'vital_legacy_draw' }];

    const target = { name: '回脉木桩', currentHp: 30, buffs: {} };
    const missionCalls = [];
    player.game = {
      handleLegacyMissionProgress(eventType, amount) {
        missionCalls.push({ eventType, amount });
      },
      battle: {
        enemies: [target],
        dealDamageToEnemy(enemy, amount) {
          enemy.currentHp -= amount;
          return amount;
        },
        markUIDirty() {}
      }
    };

    const healed = player.heal(10);
    assert(healed === 10, `vitalweave doctrine heal should still heal 10, got ${healed}`);
    assert(player.block >= 5, `vitalweave doctrine should grant >=5 block, got ${player.block}`);
    assert(target.currentHp === 24, `vitalweave doctrine burst should deal 6, got target hp ${target.currentHp}`);
    assert(player.legacyRunDoctrine.vitalweaveProcUsedThisTurn === true, 'vitalweave doctrine flag should be consumed');
    const vitalweaveMissionCalls = missionCalls.filter((entry) => entry.eventType === 'vitalweaveHealProc');
    assert(
      vitalweaveMissionCalls.length === 1,
      'vitalweave doctrine should report mission progress'
    );

    player.heal(5);
    assert(target.currentHp === 24, 'vitalweave doctrine should not retrigger in same turn');
    const vitalweaveMissionCallsAfterSecond = missionCalls.filter((entry) => entry.eventType === 'vitalweaveHealProc');
    assert(vitalweaveMissionCallsAfterSecond.length === 1, 'vitalweave doctrine mission should not retrigger in same turn');
  }

  console.log('Stormcraft & vitalweave resonance checks passed.');
})();
