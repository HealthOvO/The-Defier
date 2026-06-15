const fs = require('fs');

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function(p, enc) {
    let c = originalReadFileSync(p, enc);
    if (enc === 'utf8' && p.endsWith('.js')) {
        c = c.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
        c = c.replace(/^export\s+\{.*?\};?/gm, '');
        c = c.replace(/^import\s+.*?;/gm, '');
    }
    return c;
};

const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function loadFile(ctx, filePath) {
  let code = fs.readFileSync(filePath, 'utf8');
  code = code.replace(/^export\s+(const|let|var|class|function|default)/gm, '$1');
  code = code.replace(/^export\s+\{.*?\};?/gm, '');
  code = code.replace(/^import\s+.*?;/gm, '');
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

(async function run() {
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
      createElement: () => ({
        id: '',
        className: '',
        style: {},
        dataset: {},
        innerHTML: '',
        parentElement: null,
        firstChild: null,
        classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
        appendChild() {},
        removeChild() {},
        insertBefore() {},
        insertAdjacentElement() {},
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {}
      }),
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
  loadFile(ctx, path.join(root, 'js/managers/EventManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/MetaProgressionManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/EndlessManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/RunManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/SeasonBoardManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/SanctumAgendaManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/ShopManager.js'));
    loadFile(ctx, path.join(root, 'js/managers/SaveManager.js'));
    loadFile(ctx, path.join(root, 'js/core/map.js'));
    loadFile(ctx, path.join(root, 'js/core/events.js'));
    loadFile(ctx, path.join(root, 'js/core/achievements.js'));
    loadFile(ctx, path.join(root, 'js/core/fateRing.js'));
    loadFile(ctx, path.join(root, 'js/game.js'));
  loadFile(ctx, path.join(root, 'js/views/EventView.js'));
  loadFile(ctx, path.join(root, 'js/views/RewardView.js'));

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
    const plainPlayer = new Player();
    plainPlayer.realm = 2;
    const plainGame = {
      player: plainPlayer,
      mode: 'pve',
      currentBattleNode: null,
      isEndlessActive: () => false
    };
    const plainBattle = new Battle(plainGame);
    plainBattle.player = plainPlayer;
    plainBattle.game = plainGame;
    plainGame.battle = plainBattle;
    plainBattle.enemies = [makeEnemy('plain_command_target', 60)];
    plainBattle.initializeBattleCommandSystem();
    assert(!plainBattle.commandState.commands.some(command => command && command.id === 'realm_break_order'), 'plain battle should not leak realmBreak dedicated command');

    const frostPlayer = new Player();
    frostPlayer.realm = 2;
    frostPlayer.setRunVows([{ id: 'frostSeal', tier: 1 }]);
    const frostGame = {
      player: frostPlayer,
      mode: 'pve',
      currentBattleNode: null,
      isEndlessActive: () => false
    };
    const frostBattle = new Battle(frostGame);
    frostBattle.player = frostPlayer;
    frostBattle.game = frostGame;
    frostGame.battle = frostBattle;
    frostBattle.enemies = [makeEnemy('frost_command_target', 60)];
    frostBattle.initializeBattleCommandSystem();
    assert(!frostBattle.commandState.commands.some(command => command && command.id === 'realm_break_order'), 'non-realmBreak vow should not unlock realmBreak dedicated command');

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
    const realmBreakCommand = battle.commandState.commands.find(command => command && command.id === 'realm_break_order');
    assert(!!realmBreakCommand, `realmBreak should add dedicated realm break command, got ${battle.commandState.commands.map(command => command.id).join(',')}`);
    const commandCost = battle.resolveBattleCommandEffectiveCost(realmBreakCommand);
    battle.commandState.points = battle.commandState.maxPoints;
    player.hand = [];
    player.drawPile = [
      { id: 'realm_break_draw', name: '裂令补牌', type: 'skill', cost: 0, effects: [], instanceId: 'realm_break_draw' }
    ];
    const targetHpBefore = battle.enemies[0].currentHp;
    const pointsBefore = battle.commandState.points;
    const ok = await battle.activateBattleCommand('realm_break_order');
    assert(ok === true, 'realmBreak dedicated command should activate');
    assert(battle.commandState.lastCommandId === 'realm_break_order', 'realmBreak command should become last activated command');
    assert(battle.enemies[0].currentHp < targetHpBefore, `realmBreak command should damage enemy, ${targetHpBefore} -> ${battle.enemies[0].currentHp}`);
    assert(player.hand.some(card => card && card.id === 'realm_break_draw'), 'realmBreak command should draw when hand is thin');
    assert(battle.commandState.points === pointsBefore - commandCost + 1, `realmBreak command should refund 1 command point after spending, got ${battle.commandState.points}, before=${pointsBefore}, cost=${commandCost}`);

    const endlessPlayer = new Player();
    endlessPlayer.realm = 2;
    endlessPlayer.setRunVows([{ id: 'realmBreak', tier: 1 }]);
    const endlessGame = {
      player: endlessPlayer,
      mode: 'pve',
      currentBattleNode: null,
      isEndlessActive: () => true
    };
    const endlessBattle = new Battle(endlessGame);
    endlessBattle.player = endlessPlayer;
    endlessBattle.game = endlessGame;
    endlessGame.battle = endlessBattle;
    endlessBattle.enemies = [makeEnemy('endless_command_target', 60)];
    endlessBattle.initializeBattleCommandSystem();
    const endlessCommandIds = endlessBattle.commandState.commands.map(command => command && command.id);
    assert(endlessCommandIds[0] === 'realm_break_order', `realmBreak + endless should keep dedicated command first, got ${endlessCommandIds.join(',')}`);
    assert(endlessCommandIds.includes('rift_surge_order'), `realmBreak + endless should preserve forced endless command, got ${endlessCommandIds.join(',')}`);
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

  // 6) 星债誓：借首拍换后续债务与奖励倾向
  {
    assert(RUN_VOWS.starDebt, 'starDebt vow should exist');
    const player = new Player();
    player.realm = 2;
    player.currentHp = 40;
    player.setRunVows([{ id: 'starDebt', tier: 1 }]);
    const starDebtMeta = player.getRunVowMetas()[0];
    assert(starDebtMeta.buildFit && /首拍|关键件/.test(starDebtMeta.buildFit), 'starDebt meta should expose build fit for battle readability');
    assert(starDebtMeta.counterplay && /首拍|溢价|容错/.test(starDebtMeta.counterplay), 'starDebt meta should expose counterplay for battle readability');
    assert(starDebtMeta.uiMeta && /还债/.test(starDebtMeta.uiMeta.readableCue || ''), 'starDebt meta should expose readable cue for battle readability');
    const effects = player.getRunVowEffects();
    assert(effects.battleStartHpLoss === 3, `starDebt tier 1 should start each battle with 3 hp debt, got ${effects.battleStartHpLoss}`);
    assert(effects.firstTurnEnergy === 1, `starDebt tier 1 should grant first-turn energy, got ${effects.firstTurnEnergy}`);
    assert(effects.rewardRareChance >= 0.12, `starDebt tier 1 should raise rare reward chance, got ${effects.rewardRareChance}`);
    assert(effects.shopPriceMul > 1, `starDebt tier 1 should make shop debt visible, got ${effects.shopPriceMul}`);
    player.prepareBattle();
    assert(player.currentHp === 37, `starDebt should collect hp debt on battle start, got ${player.currentHp}`);

    const tier2Player = new Player();
    tier2Player.realm = 2;
    tier2Player.currentHp = 40;
    tier2Player.setRunVows([{ id: 'starDebt', tier: 2 }]);
    const tier2Effects = tier2Player.getRunVowEffects();
    assert(tier2Effects.battleStartHpLoss === 5, `starDebt tier 2 should start each battle with 5 hp debt, got ${tier2Effects.battleStartHpLoss}`);
    assert(tier2Effects.firstTurnEnergy === 1, `starDebt tier 2 should keep first-turn energy, got ${tier2Effects.firstTurnEnergy}`);
    assert(tier2Effects.firstAttackBonusPerBattle === 3, `starDebt tier 2 should grant first attack bonus +3, got ${tier2Effects.firstAttackBonusPerBattle}`);
    assert(tier2Effects.rewardRareChance >= 0.22, `starDebt tier 2 should further raise rare reward chance, got ${tier2Effects.rewardRareChance}`);
    assert(tier2Effects.shopPriceMul >= 1.18, `starDebt tier 2 should raise shop debt to 18%, got ${tier2Effects.shopPriceMul}`);
    tier2Player.prepareBattle();
    assert(tier2Player.currentHp === 35, `starDebt tier 2 should collect 5 hp debt on battle start, got ${tier2Player.currentHp}`);
  }

  // 7) 霜封誓：开场控场压制
  {
    assert(RUN_VOWS.frostSeal, 'frostSeal vow should exist');
    const player = new Player();
    player.realm = 2;
    player.currentHp = 60;
    player.setRunVows([{ id: 'frostSeal', tier: 1 }]);
    const frostMeta = player.getRunVowMetas()[0];
    assert(frostMeta.buildFit && /虚弱|控场/.test(frostMeta.buildFit), 'frostSeal meta should expose control build fit');
    assert(frostMeta.counterplay && /治疗|拖/.test(frostMeta.counterplay), 'frostSeal meta should expose sustain counterplay');
    assert(frostMeta.uiMeta && /虚弱/.test(frostMeta.uiMeta.readableCue || ''), 'frostSeal meta should expose readable weak cue');
    const effects = player.getRunVowEffects();
    assert(effects.battleStartEnemyWeakAll === 1, `frostSeal tier 1 should apply 1 enemy weak on battle start, got ${effects.battleStartEnemyWeakAll}`);
    assert(effects.firstTurnDraw === 1, `frostSeal tier 1 should draw on first turn, got ${effects.firstTurnDraw}`);
    assert(effects.healMultiplier < 1, `frostSeal tier 1 should reduce healing, got ${effects.healMultiplier}`);
    assert(effects.mapWeightShift.observatory > 0, 'frostSeal should bias routes toward observatory planning nodes');
    assert(effects.mapWeightShift.elite < 0, 'frostSeal should reduce elite route pressure');

    const game = {
      player,
      mode: 'pve',
      currentBattleNode: null,
      isEndlessActive: () => false,
      onBattleWon: () => {},
      onBattleLost: () => {}
    };
    const battle = new Battle(game);
    game.battle = battle;
    battle.player = player;
    battle.enemies = [makeEnemy('frost_a', 60), makeEnemy('frost_b', 60)];
    battle.startBattle();
    assert(battle.enemies.every(enemy => (enemy.buffs.weak || 0) >= 1), 'frostSeal should apply weak to all enemies at battle start');

    const tier2Player = new Player();
    tier2Player.realm = 2;
    tier2Player.setRunVows([{ id: 'frostSeal', tier: 2 }]);
    const tier2Effects = tier2Player.getRunVowEffects();
    assert(tier2Effects.battleStartEnemyWeakAll === 2, `frostSeal tier 2 should apply 2 enemy weak, got ${tier2Effects.battleStartEnemyWeakAll}`);
    assert(tier2Effects.openingBlock >= 6, `frostSeal tier 2 should add opening block, got ${tier2Effects.openingBlock}`);
  }

  // 8) Game helper：章末提供誓约与商店倍率会受窥天誓影响
  {
    const player = new Player();
    player.realm = 2;const fakeGame = Object.create(Game.prototype);

    if (typeof fakeGame.attachHubControllers === 'function') fakeGame.attachHubControllers();
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
})().catch(error => {
  console.error(error);
  process.exit(1);
});
