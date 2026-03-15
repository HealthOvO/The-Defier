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

function makeEnemy(id, hp = 40) {
  return {
    id,
    name: `敌人-${id}`,
    currentHp: hp,
    maxHp: hp,
    block: 0,
    buffs: {},
    patterns: [{ type: 'attack', value: 10, intent: '⚔️' }],
    currentPatternIndex: 0,
    isElite: false,
    isBoss: false
  };
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const mathObj = Object.create(Math);
  mathObj.random = () => 0.31;

  const storage = () => {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key)
    };
  };

  const ctx = vm.createContext({
    console,
    window: {},
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: null
    },
    localStorage: storage(),
    sessionStorage: storage(),
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
    alert: () => {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    CHARACTERS: {
      linFeng: {
        stats: { maxHp: 80, gold: 100, energy: 3 },
        relic: null,
        deck: ['strike', 'defend', 'quickDraw', 'defend', 'strike']
      }
    },
    SKILLS: {},
    STARTER_DECK: ['strike', 'defend', 'quickDraw', 'defend', 'strike'],
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {},
      random: (min) => min,
      sleep: () => Promise.resolve(),
      addShakeEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {},
      addFlashEffect: () => {},
      getCanonicalElement: (value) => String(value || 'none'),
      getElementIcon: () => '✦',
      upgradeCard: (card) => ({ ...card, upgraded: true })
    },
    Math: mathObj,
    JSON,
    Date
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/data/run_destinies.js'));
  loadFile(ctx, path.join(root, 'js/data/run_vows.js'));
  loadFile(ctx, path.join(root, 'js/data/fate_ring.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/core/battle.js'));
  loadFile(ctx, path.join(root, 'js/game.js'));

  const Player = vm.runInContext('Player', ctx);
  const Battle = vm.runInContext('Battle', ctx);
  const Game = vm.runInContext('Game', ctx);
  const RUN_VOWS = vm.runInContext('RUN_VOWS', ctx);

  assert(Object.keys(RUN_VOWS).length >= 6, `expected >=6 run vows, got ${Object.keys(RUN_VOWS).length}`);

  // 1) 立誓与升阶代价
  {
    const player = new Player();
    const baseMaxHp = player.maxHp;
    const first = player.applyRunVow('blazingLife');
    assert(first && first.type === 'new', 'blazingLife first application should create a new vow');
    assert(player.maxHp === baseMaxHp - 8, `blazingLife should reduce max hp by 8, got ${player.maxHp}`);
    const second = player.applyRunVow('blazingLife');
    assert(second && second.type === 'upgrade', 'blazingLife second application should upgrade the vow');
    assert(player.maxHp === baseMaxHp - 12, `blazingLife tier 2 should total -12 max hp, got ${player.maxHp}`);
  }

  // 2) 镇狱誓：开场护盾与治疗折减
  {
    const player = new Player();
    player.realm = 2;
    player.setRunVows([{ id: 'wardingPrison', tier: 1 }]);
    player.prepareBattle();
    assert(player.block >= 10, `wardingPrison should amplify opening block, got ${player.block}`);
    player.currentHp = 50;
    const healed = player.heal(20);
    assert(healed === 14, `wardingPrison should reduce heal to 14, got ${healed}`);
  }

  // 3) 归寂誓：首次消耗回牌
  {
    const player = new Player();
    player.realm = 2;
    player.setRunVows([{ id: 'silentReturn', tier: 1 }]);
    player.game = {
      playCardEffect: () => {},
      handleLegacyMissionProgress: () => {}
    };
    player.prepareBattle();
    player.startTurn();
    player.currentEnergy = 5;
    player.hand = [
      { id: 'vow_exhaust', name: '绝息诀', type: 'skill', cost: 0, effects: [], exhaust: true, instanceId: 'vow_exhaust' }
    ];
    player.drawPile = [
      { id: 'draw_a', name: '补牌', type: 'skill', cost: 0, effects: [], instanceId: 'draw_a' }
    ];
    const result = player.playCard(0, null);
    assert(result !== false, 'silentReturn exhaust card should be playable');
    assert(player.runVowBattleState.firstExhaustDrawUsedThisTurn === true, 'silentReturn should consume first exhaust draw flag');
    assert(player.drawPile.length === 0, 'silentReturn should draw one card from draw pile');
  }

  // 4) 破界誓：战场指令上限与费用修正
  {
    const player = new Player();
    player.realm = 2;
    player.setRunVows([{ id: 'realmBreak', tier: 1 }]);
    const game = {
      player,
      mode: 'pve',
      currentBattleNode: null,
      isEndlessActive: () => false
    };
    const battle = new Battle(game);
    battle.player = player;
    battle.game = game;
    game.battle = battle;
    battle.enemies = [makeEnemy('command_target', 60)];
    battle.initializeBattleCommandSystem();
    assert(battle.commandState.enabled === true, 'realmBreak battle should initialize command system');
    assert(battle.commandState.maxPoints >= 14, `realmBreak should increase max command points, got ${battle.commandState.maxPoints}`);
    const firstCommand = battle.commandState.commands[0];
    assert(!!firstCommand, 'realmBreak should provide at least one command');
    const effectiveCost = battle.resolveBattleCommandEffectiveCost(firstCommand);
    assert(effectiveCost <= Math.max(1, firstCommand.cost - 1), `realmBreak should discount command cost, got ${effectiveCost} from ${firstCommand.cost}`);
  }

  // 5) 焚命誓：低血增伤
  {
    const player = new Player();
    player.realm = 2;
    player.maxHp = 80;
    player.currentHp = 30;
    player.setRunVows([{ id: 'blazingLife', tier: 1 }]);
    player.game = { player, currentBattleNode: null, onBattleWon: () => {}, onBattleLost: () => {} };
    const battle = new Battle(player.game);
    battle.player = player;
    battle.game.battle = battle;
    const enemy = makeEnemy('lowhp_target', 80);
    battle.enemies = [enemy];
    const dealt = battle.dealDamageToEnemy(enemy, 10);
    assert(dealt >= 12, `blazingLife should amplify low-hp damage, got ${dealt}`);
  }

  // 6) Game helper：章末提供誓约与商店倍率会受窥天誓影响
  {
    const player = new Player();
    player.realm = 2;
    const fakeGame = Object.create(Game.prototype);
    fakeGame.player = player;
    fakeGame.isEndlessActive = () => false;
    const basePriceMult = fakeGame.getShopPriceMultiplier(0.15);
    player.setRunVows([{ id: 'heavenlyGaze', tier: 1 }]);
    const vowPriceMult = fakeGame.getShopPriceMultiplier(0.15);
    assert(vowPriceMult > basePriceMult, `heavenlyGaze should increase shop price multiplier, ${basePriceMult} -> ${vowPriceMult}`);
    assert(fakeGame.shouldOfferRunVowAfterRealm(3) === true, 'realm 3 should offer a vow when slots remain');
    const draft = fakeGame.draftRunVowChoices(3);
    assert(Array.isArray(draft) && draft.length >= 2, `run vow draft should provide 2+ choices, got ${JSON.stringify(draft)}`);
  }

  console.log('Run vow system checks passed.');
})();
