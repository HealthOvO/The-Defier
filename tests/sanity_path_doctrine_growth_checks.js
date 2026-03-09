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

function makeEnemy(id, hp = 120) {
  return {
    id,
    name: `敌人-${id}`,
    currentHp: hp,
    maxHp: hp,
    block: 0,
    buffs: {},
    patterns: [{ type: 'attack', value: 10, intent: '⚔️' }],
    currentPatternIndex: 0
  };
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const mathObj = Object.create(Math);
  mathObj.random = () => 0.31;

  const ctx = vm.createContext({
    console,
    window: {},
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ className: '', style: {}, innerHTML: '' })
    },
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
    CHARACTERS: {
      linFeng: {
        stats: { maxHp: 88, gold: 100, energy: 3 },
        relic: null,
        deck: ['strike', 'defend', 'strike', 'defend', 'strike']
      }
    },
    SKILLS: {},
    STARTER_DECK: ['strike', 'defend', 'strike', 'defend', 'strike'],
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {},
      random: (min) => min,
      sleep: () => Promise.resolve(),
      addShakeEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {},
      getCanonicalElement: (value) => String(value || 'none')
    },
    Math: mathObj,
    JSON,
    Date
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/data/fate_ring.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/core/battle.js'));

  const Player = vm.runInContext('Player', ctx);
  const Battle = vm.runInContext('Battle', ctx);

  // 1) 命环教义分层阈值
  {
    const player = new Player();
    player.fateRing.level = 0;
    assert(player.getPathDoctrineTier() === 0, 'tier should be 0 at ring level 0');
    player.fateRing.level = 4;
    assert(player.getPathDoctrineTier() === 1, 'tier should be 1 at ring level 4');
    player.fateRing.level = 7;
    assert(player.getPathDoctrineTier() === 2, 'tier should be 2 at ring level 7');
    player.fateRing.level = 10;
    assert(player.getPathDoctrineTier() === 3, 'tier should be 3 at ring level 10');
  }

  // 2) 回响教义：技能链护阵 + 第二段抽牌
  {
    const player = new Player();
    player.realm = 2;
    player.fateRing.path = 'resonance';
    player.fateRing.level = 7;
    player.currentEnergy = 10;
    player.turnNumber = 1;
    player.hand = [
      { id: 'skill_chain_1', name: '链一', type: 'skill', cost: 0, effects: [], instanceId: 'skill_chain_1' },
      { id: 'skill_chain_2', name: '链二', type: 'skill', cost: 0, effects: [], instanceId: 'skill_chain_2' }
    ];
    player.drawPile = [
      { id: 'draw_a', name: 'A', type: 'skill', cost: 0, effects: [], instanceId: 'draw_a' },
      { id: 'draw_b', name: 'B', type: 'skill', cost: 0, effects: [], instanceId: 'draw_b' },
      { id: 'draw_c', name: 'C', type: 'skill', cost: 0, effects: [], instanceId: 'draw_c' }
    ];
    player.game = {
      playCardEffect: () => {},
      handleLegacyMissionProgress: () => {}
    };

    const ok1 = player.playCard(0, null);
    assert(ok1 !== false, 'first skill chain card should cast');
    assert(player.block >= 4, `first skill chain should add doctrine block, got ${player.block}`);

    const ok2 = player.playCard(0, null);
    assert(ok2 !== false, 'second skill chain card should cast');
    assert(player.pathDoctrineSkillChainDrawUsedThisTurn === true, 'second skill chain should consume doctrine draw trigger');

    player.startTurn();
    assert(player.pathDoctrineSkillChainCountThisTurn === 0, 'new turn should reset doctrine skill chain counter');
    assert(player.pathDoctrineSkillChainDrawUsedThisTurn === false, 'new turn should reset doctrine draw flag');
  }

  // 3) 毁灭教义：治疗衰减 + 低护盾增伤
  {
    const player = new Player();
    player.realm = 2;
    player.fateRing.path = 'destruction';
    player.fateRing.level = 10;
    player.currentHp = 30;
    player.maxHp = 80;
    player.block = 0;

    const healed = player.heal(10);
    assert(healed === 8, `destruction doctrine should reduce heal to 8 at tier 3, got ${healed}`);

    const damageResult = player.executeEffect({ type: 'damage', value: 10, target: 'enemy' }, null, {});
    assert(damageResult && damageResult.value >= 15, `destruction doctrine low-block damage bonus expected >=15, got ${damageResult && damageResult.value}`);
  }

  // 4) 汇流教义：战场指令降耗 + 攻击充能成长
  {
    const player = new Player();
    player.realm = 10;
    player.currentHp = 70;
    player.maxHp = 100;
    player.block = 0;
    player.fateRing.path = 'convergence';
    player.fateRing.level = 10;
    player.equippedTreasures = [];
    player.treasures = [];

    const game = {
      mode: 'pve',
      player,
      currentBattleNode: { id: 9901, type: 'enemy', row: 1, col: 1 },
      isEndlessActive() { return false; },
      onBattleWon: () => {},
      onBattleLost: () => {}
    };

    const battle = new Battle(game);
    battle.enemies = [makeEnemy('doctrine')];
    battle.initializeBattleCommandSystem();
    battle.commandState.firstCommandDiscountUsed = true;

    const effectiveCost = battle.resolveBattleCommandEffectiveCost({ id: 'hunt_order', cost: 4 });
    assert(effectiveCost <= 3, `convergence doctrine should discount hunt command, got cost=${effectiveCost}`);

    battle.commandState.points = 0;
    battle.cardsPlayedThisTurn = 1;
    battle.emit('cardPlayed', { card: { id: 'atk', type: 'attack' }, cardsPlayedThisTurn: 1 });
    assert((battle.commandState.points || 0) >= 5, `convergence doctrine tier 3 should grant >=5 command points, got ${battle.commandState.points}`);
  }

  // 5) 智慧教义：商会偏置参数
  {
    const player = new Player();
    player.fateRing.path = 'wisdom';
    player.fateRing.level = 10;
    const profile = player.getPathDoctrineProfile();
    assert(profile.shopOfferBonus >= 1, 'wisdom doctrine should grant shop offer bonus at high tier');
    assert(profile.commandCostDiscount >= 1, 'wisdom doctrine should grant extra command cost discount at high tier');
    assert(profile.shopPriceMultiplier < 1, 'wisdom doctrine should lower temporary shop prices');
  }

  console.log('Path doctrine growth checks passed.');
})();
