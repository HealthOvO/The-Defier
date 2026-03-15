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
  mathObj.random = () => 0.25;

  const ctx = vm.createContext({
    console,
    window: {},
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => [],
      body: null
    },
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
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
  loadFile(ctx, path.join(root, 'js/data/fate_ring.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/core/battle.js'));

  const Player = vm.runInContext('Player', ctx);
  const Battle = vm.runInContext('Battle', ctx);
  const RUN_DESTINIES = vm.runInContext('RUN_DESTINIES', ctx);

  assert(Object.keys(RUN_DESTINIES).length >= 24, `expected >=24 run destinies, got ${Object.keys(RUN_DESTINIES).length}`);

  // 1) 命格元数据与设置
  {
    const player = new Player();
    const meta = player.setRunDestiny('foldedEdge', 1);
    assert(meta && meta.id === 'foldedEdge', 'setRunDestiny should resolve foldedEdge');
    assert(player.getRunDestinyMeta().name === '折锋', 'run destiny meta should expose localized name');
  }

  // 2) 开场护盾命格
  {
    const player = new Player();
    player.realm = 2;
    player.setRunDestiny('soulAnchor', 1);
    player.prepareBattle();
    assert(player.block >= 8, `soulAnchor should grant opening block, got ${player.block}`);
  }

  // 3) 首回合抽牌与回能
  {
    const player = new Player();
    player.realm = 2;
    player.setRunDestiny('mirrorHeart', 1);
    player.prepareBattle();
    const beforeHand = player.hand.length;
    player.startTurn();
    assert(player.currentEnergy >= 4, `mirrorHeart should grant first turn energy, got ${player.currentEnergy}`);
    assert(player.hand.length > beforeHand, `mirrorHeart should draw on first turn, hand ${beforeHand} -> ${player.hand.length}`);
  }

  // 4) 每回合首个技能抽牌
  {
    const player = new Player();
    player.realm = 2;
    player.setRunDestiny('echoScripture', 1);
    player.game = {
      playCardEffect: () => {},
      handleLegacyMissionProgress: () => {}
    };
    player.prepareBattle();
    player.currentEnergy = 5;
    player.turnNumber = 1;
    player.hand = [
      { id: 'skill_a', name: '术式', type: 'skill', cost: 0, effects: [], instanceId: 'skill_a' }
    ];
    player.drawPile = [
      { id: 'draw_a', name: '补牌', type: 'skill', cost: 0, effects: [], instanceId: 'draw_a' }
    ];
    const result = player.playCard(0, null);
    assert(result !== false, 'echoScripture skill card should be playable');
    assert(player.runDestinyBattleState.firstSkillDrawUsedThisTurn === true, 'first skill draw flag should be consumed');
    assert(player.drawPile.length === 0, 'echoScripture should draw one card from draw pile');
  }

  // 5) 溢出治疗转护盾
  {
    const player = new Player();
    player.realm = 2;
    player.maxHp = 80;
    player.currentHp = 70;
    player.block = 0;
    player.setRunDestiny('deepMeridian', 1);
    const healed = player.heal(20);
    assert(healed === 10, `deepMeridian should heal only missing hp, got ${healed}`);
    assert(player.block >= 10, `deepMeridian should convert overheal into block, got ${player.block}`);
  }

  // 6) 易伤与低血增伤
  {
    const player = new Player();
    player.realm = 2;
    player.maxHp = 80;
    player.currentHp = 30;
    player.setRunDestiny('doomGlyph', 1);
    player.game = { player, currentBattleNode: null, onBattleWon: () => {}, onBattleLost: () => {} };
    const battle = new Battle(player.game);
    battle.player = player;
    battle.game.battle = battle;
    const enemy = makeEnemy('doom-target', 80);
    enemy.buffs.vulnerable = 1;
    battle.enemies = [enemy];
    const dealt = battle.dealDamageToEnemy(enemy, 10);
    assert(dealt >= 16, `doomGlyph should amplify low-hp vulnerable hit, got ${dealt}`);
  }

  // 7) 破绽增伤与击杀回复
  {
    const player = new Player();
    player.realm = 2;
    player.currentHp = 18;
    player.maxHp = 80;
    player.setRunDestiny('deathChaser', 1);
    player.game = {
      player,
      currentBattleNode: null,
      battle: null,
      achievementSystem: { updateStat: () => {} },
      onBattleWon: () => {},
      onBattleLost: () => {}
    };
    const battle = new Battle(player.game);
    battle.player = player;
    battle.game.battle = battle;
    const enemy = makeEnemy('mark-target', 8);
    enemy.buffs.mark = 2;
    battle.enemies = [enemy];
    const beforeHp = player.currentHp;
    const dealt = battle.dealDamageToEnemy(enemy, 6);
    assert(dealt >= 13, `deathChaser should add mark bonus damage, got ${dealt}`);
    assert(player.currentHp > beforeHp, `deathChaser should heal on kill, hp ${beforeHp} -> ${player.currentHp}`);
  }

  console.log('Run destiny system checks passed.');
})();
