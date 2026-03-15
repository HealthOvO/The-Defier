const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  mathObj.random = () => 0.18;

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
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    alert: () => {},
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
  loadFile(ctx, path.join(root, 'js/data/spirit_companions.js'));
  loadFile(ctx, path.join(root, 'js/data/fate_ring.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/core/battle.js'));
  loadFile(ctx, path.join(root, 'js/game.js'));

  const Player = vm.runInContext('Player', ctx);
  const Battle = vm.runInContext('Battle', ctx);
  const Game = vm.runInContext('Game', ctx);
  const SPIRIT_COMPANIONS = vm.runInContext('SPIRIT_COMPANIONS', ctx);

  assert(Object.keys(SPIRIT_COMPANIONS).length >= 8, `expected >=8 spirit companions, got ${Object.keys(SPIRIT_COMPANIONS).length}`);

  // 1) 灵契元数据
  {
    const player = new Player();
    const meta = player.setSpiritCompanion('frostChi', 1);
    assert(meta && meta.id === 'frostChi', 'setSpiritCompanion should resolve frostChi');
    assert(meta.name === '霜螭', `frostChi should expose localized name, got ${meta && meta.name}`);
    assert(meta.chargeMax === 5, `frostChi charge max should be 5, got ${meta && meta.chargeMax}`);
  }

  // 2) 角色草案 helper
  {
    const game = Object.create(Game.prototype);
    game.pendingSpiritCompanionDrafts = {};
    const draft = game.draftSpiritCompanionsForCharacter('yanHan');
    assert(Array.isArray(draft) && draft.length === 3, `yanHan spirit draft should provide 3 choices, got ${JSON.stringify(draft)}`);
    assert(draft[0] === 'frostChi' && draft[1] === 'starFox', `yanHan draft should prioritize affinity spirits, got ${JSON.stringify(draft)}`);
    assert(game.resolveDefaultSpiritCompanionId('yanHan') === draft[0], 'default spirit should be the first drafted entry');
  }

  // 3) 霜螭：开场虚弱 + 主动护道
  {
    const player = new Player();
    player.realm = 2;
    player.setSpiritCompanion('frostChi', 1);
    const game = {
      player,
      currentBattleNode: null,
      mode: 'pve',
      isEndlessActive: () => false,
      onBattleWon: () => {},
      onBattleLost: () => {}
    };
    const battle = new Battle(game);
    battle.player = player;
    battle.game.battle = battle;
    battle.currentTurn = 'player';
    battle.enemies = [makeEnemy('frost-a', 42), makeEnemy('frost-b', 36)];

    const opened = battle.applySpiritCompanionBattleStart();
    assert(opened === true, 'frostChi battle-start passive should trigger');
    assert(battle.enemies.every((enemy) => enemy.buffs.weak === 1), `frostChi should apply 1 weak to all enemies, got ${JSON.stringify(battle.enemies.map((enemy) => enemy.buffs))}`);

    player.gainSpiritCharge(5);
    const used = battle.activateSpiritCompanion();
    assert(used === true, 'frostChi active should be usable at full charge');
    assert(player.block >= 8, `frostChi active should grant block, got ${player.block}`);
    assert(battle.enemies.every((enemy) => enemy.buffs.weak === 3), `frostChi active should add 2 more weak, got ${JSON.stringify(battle.enemies.map((enemy) => enemy.buffs))}`);
    assert(player.spiritCompanionBattleState.charge === 0, `frostChi active should consume all charge, got ${player.spiritCompanionBattleState.charge}`);
  }

  // 4) 玄龟：首段护盾强化
  {
    const player = new Player();
    player.realm = 2;
    player.setSpiritCompanion('blackTortoise', 1);
    player.prepareBattle();
    player.startTurn();
    player.block = 0;
    player.addBlock(5);
    assert(player.block >= 9, `blackTortoise should add +4 on first block gain, got ${player.block}`);
    assert(player.spiritCompanionBattleState.firstBlockBonusUsedThisTurn === true, 'blackTortoise should consume first-block flag');
  }

  // 5) 星狐：首个技能抽牌并蓄能
  {
    const player = new Player();
    player.realm = 2;
    player.setSpiritCompanion('starFox', 2);
    player.game = {
      playCardEffect: () => {},
      handleLegacyMissionProgress: () => {}
    };
    player.prepareBattle();
    player.startTurn();
    player.currentEnergy = 5;
    player.hand = [
      { id: 'skill_a', name: '星引术', type: 'skill', cost: 0, effects: [], instanceId: 'skill_a' }
    ];
    player.drawPile = [
      { id: 'draw_a', name: '补牌', type: 'skill', cost: 0, effects: [], instanceId: 'draw_a' }
    ];
    const result = player.playCard(0, null);
    assert(result !== false, 'starFox skill card should be playable');
    assert(player.spiritCompanionBattleState.firstSkillDrawUsedThisTurn === true, 'starFox should consume first-skill draw flag');
    assert(player.drawPile.length === 0, 'starFox should draw one card from draw pile');
    assert(player.spiritCompanionBattleState.charge === 2, `starFox tier 2 should end at 2 charge (base play + passive), got ${player.spiritCompanionBattleState.charge}`);
  }

  // 6) 灵猿：三踏回灵
  {
    const player = new Player();
    player.realm = 2;
    player.setSpiritCompanion('spiritApe', 2);
    player.prepareBattle();
    player.currentEnergy = 1;
    const game = {
      player,
      currentBattleNode: null,
      mode: 'pve',
      isEndlessActive: () => false,
      onBattleWon: () => {},
      onBattleLost: () => {}
    };
    const battle = new Battle(game);
    battle.player = player;
    battle.cardsPlayedThisTurn = 3;
    const triggered = battle.handleSpiritCompanionCardPlayed({ id: 'combo-card' });
    assert(triggered === true, 'spiritApe passive should trigger on every 3rd card');
    assert(player.currentEnergy === 2, `spiritApe should restore 1 energy, got ${player.currentEnergy}`);
    assert(player.spiritCompanionBattleState.charge === 1, `spiritApe tier 2 should grant 1 bonus charge on first proc, got ${player.spiritCompanionBattleState.charge}`);
  }

  // 7) 剑魄：对护盾目标额外伤害
  {
    const player = new Player();
    player.realm = 2;
    player.setSpiritCompanion('swordWraith', 1);
    player.game = {
      player,
      currentBattleNode: null,
      mode: 'pve',
      isEndlessActive: () => false,
      onBattleWon: () => {},
      onBattleLost: () => {}
    };
    const battle = new Battle(player.game);
    battle.player = player;
    battle.game.battle = battle;
    const enemy = makeEnemy('shielded', 50);
    enemy.block = 5;
    battle.enemies = [enemy];
    const dealt = battle.dealDamageToEnemy(enemy, 10);
    assert(dealt >= 10, `swordWraith should push 10 hp damage through 5 block, got ${dealt}`);
  }

  // 8) 存档序列化
  {
    const player = new Player();
    player.setSpiritCompanion('artifactSoul', 1);
    player.gainSpiritCharge(3);
    const save = player.getState();
    assert(save.spiritCompanion && save.spiritCompanion.id === 'artifactSoul', 'save payload should include selected spirit companion');
    assert(save.spiritCompanionBattleState && save.spiritCompanionBattleState.charge === 3, `save payload should keep current spirit charge, got ${JSON.stringify(save.spiritCompanionBattleState)}`);
  }

  // 9) render_game_to_text
  {
    const player = new Player();
    player.setSpiritCompanion('artifactSoul', 1);
    player.gainSpiritCharge(3);

    const game = Object.create(Game.prototype);
    game.currentScreen = 'character-selection-screen';
    game.player = player;
    game.selectedCharacterId = 'linFeng';
    game.selectedRunDestinyId = 'foldedEdge';
    game.selectedSpiritCompanionId = 'artifactSoul';
    game.pendingRunDestinyDrafts = { linFeng: ['foldedEdge', 'soulAnchor', 'deepMeridian'] };
    game.pendingSpiritCompanionDrafts = { linFeng: ['artifactSoul', 'frostChi', 'starFox'] };
    game.map = { getAccessibleNodes: () => [] };
    game.battle = null;
    game.legacyProgress = { essence: 0, upgrades: {}, lastPreset: null, secondaryPreset: null };
    game.getLegacyUnspentEssence = () => 0;
    game.ensureEndlessState = () => ({ active: false });
    game.getEndlessPhaseProfile = () => null;
    game.getEndlessCycleThemeProfile = () => null;
    game.ensureEncounterState = () => ({});
    game.performanceStats = null;

    const payload = JSON.parse(game.renderGameToText());
    assert(payload.player && payload.player.spiritCompanion && payload.player.spiritCompanion.id === 'artifactSoul', 'render_game_to_text should expose current spirit companion');
    assert(payload.player && payload.player.spiritCharge && payload.player.spiritCharge.charge === 3, `render_game_to_text should expose current spirit charge, got ${JSON.stringify(payload.player && payload.player.spiritCharge)}`);
    assert(payload.draft && payload.draft.selectedSpiritCompanionId === 'artifactSoul', 'draft payload should expose selected spirit companion');
    assert(Array.isArray(payload.draft.spiritCompanions) && payload.draft.spiritCompanions.length === 3, 'draft payload should expose spirit draft options');
  }

  console.log('Spirit companion checks passed.');
})();
