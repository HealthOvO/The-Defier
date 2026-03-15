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

function makePlayer(realm = 1) {
  return {
    realm,
    turnNumber: 0,
    currentHp: 60,
    maxHp: 60,
    block: 0,
    currentEnergy: 3,
    baseEnergy: 3,
    hand: [],
    buffs: {},
    collectedLaws: [],
    activeResonances: [],
    equippedTreasures: [],
    treasures: [],
    fateRing: { path: 'neutral' },
    addBlock(amount) {
      this.block = Math.max(0, Math.floor(Number(this.block) || 0)) + Math.max(0, Math.floor(Number(amount) || 0));
    },
    heal(amount) {
      const before = Math.max(0, Math.floor(Number(this.currentHp) || 0));
      this.currentHp = Math.min(
        Math.max(1, Math.floor(Number(this.maxHp) || 1)),
        before + Math.max(0, Math.floor(Number(amount) || 0))
      );
      return this.currentHp - before;
    },
    gainEnergy(amount) {
      this.currentEnergy = Math.max(0, Math.floor(Number(this.currentEnergy) || 0)) + Math.max(0, Math.floor(Number(amount) || 0));
    },
    drawCards(count) {
      const total = Math.max(0, Math.floor(Number(count) || 0));
      for (let i = 0; i < total; i += 1) {
        this.hand.push({ id: `draw_${this.turnNumber}_${this.hand.length}_${i}`, name: '推演牌' });
      }
    }
  };
}

function makeChapterSnapshot(chapterIndex, stageIndex, name, skyOmen, leyline) {
  return {
    chapterIndex,
    stageIndex,
    stageLabel: ['前段·示章', '中段·转势', '末段·问锋'][Math.max(0, stageIndex - 1)] || '前段·示章',
    fullName: `第${chapterIndex}章·${name}`,
    name,
    skyOmen: {
      name: skyOmen,
      desc: `${skyOmen} 测试描述`
    },
    leyline: {
      name: leyline,
      desc: `${leyline} 测试描述`
    }
  };
}

function makeEnemy(id, name, patterns, hp = 40) {
  return {
    id,
    name,
    currentHp: hp,
    maxHp: hp,
    block: 0,
    buffs: {},
    patterns: Array.isArray(patterns) ? patterns.map((pattern) => ({ ...pattern })) : [],
    currentPatternIndex: 0
  };
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date,
    CARDS: {},
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null
    },
    Utils: {
      showBattleLog: () => {},
      sleep: () => Promise.resolve(),
      addShakeEffect: () => {},
      addFlashEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {},
      showTooltip: () => {},
      hideTooltip: () => {},
      getCanonicalElement: (value) => String(value || 'none'),
      getElementIcon: () => '✦'
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/core/battle.js'));
  const Battle = vm.runInContext('Battle', ctx);
  assert(typeof Battle === 'function', 'Battle class should be defined');

  // Chapter 1: omen + leyline + frontline formation
  {
    const player = makePlayer(2);
    player.turnNumber = 1;
    player.currentHp = 26;
    player.maxHp = 60;
    const snapshot = makeChapterSnapshot(1, 2, '碎誓外域', '裂誓流火', '逆誓余烬');
    const game = {
      player,
      currentBattleNode: { id: 'ch1-node', type: 'enemy' },
      getChapterDisplaySnapshot: () => snapshot
    };
    const battle = new Battle(game);
    battle.enemies = [
      makeEnemy('fracture_alpha', '裂锋甲', [{ type: 'attack', value: 15, intent: '⚔️' }], 44),
      makeEnemy('fracture_beta', '裂锋乙', [{ type: 'attack', value: 9, intent: '⚔️' }, { type: 'defend', value: 6, intent: '🛡️' }], 42)
    ];

    const field = battle.initializeChapterBattlefieldRules();
    const anchor = battle.getChapterFormationAnchorEnemy();
    assert(field && field.chapterIndex === 1, 'chapter 1 battlefield should initialize');
    assert(anchor && anchor.id === 'fracture_alpha', `chapter 1 anchor should be highest attack enemy, got ${anchor && anchor.id}`);
    assert((player.buffs.nextAttackBonus || 0) > 0, 'chapter 1 omen should grant next attack bonus on turn 1');

    const boosted = battle.applyChapterBattlefieldPlayerDamageModifiers(anchor, 20);
    assert(boosted > 20, `chapter 1 leyline should boost low-hp damage, got ${boosted}`);

    const blockBefore = player.block;
    battle.handleChapterBattlefieldEnemyDamaged(anchor, 8);
    assert(player.block > blockBefore, 'hitting chapter 1 anchor should convert pressure into block');

    battle.handleChapterBattlefieldEnemyKilled(anchor);
    assert(field.formation.broken === true, 'chapter 1 formation should break when anchor dies');
    assert((battle.enemies[1].buffs.weak || 0) >= 1, 'chapter 1 survivors should receive weak after anchor death');
  }

  // Chapter 2: forge-sea omen + shield leyline + clamp formation
  {
    const player = makePlayer(5);
    player.turnNumber = 1;
    player.block = 12;
    player.equippedTreasures = [{ id: 'anvil', name: '锻砧符' }];
    const snapshot = makeChapterSnapshot(2, 2, '炉海天阙', '炉海炙潮', '淬器火脉');
    const game = {
      player,
      currentBattleNode: { id: 'ch2-node', type: 'enemy' },
      getChapterDisplaySnapshot: () => snapshot
    };
    const battle = new Battle(game);
    battle.enemies = [
      makeEnemy('forge_anchor', '炉锚卫', [{ type: 'attack', value: 10, intent: '⚔️' }], 58),
      makeEnemy('forge_guard', '淬炉从', [{ type: 'defend', value: 7, intent: '🛡️' }], 42)
    ];

    const field = battle.initializeChapterBattlefieldRules();
    const anchor = battle.getChapterFormationAnchorEnemy();
    assert(field && field.chapterIndex === 2, 'chapter 2 battlefield should initialize');
    assert(anchor && anchor.id === 'forge_anchor', `chapter 2 anchor should prefer highest hp enemy, got ${anchor && anchor.id}`);
    assert((player.buffs.nextAttackBonus || 0) > 0, 'chapter 2 odd-turn omen should convert block into next-attack bonus');

    const boosted = battle.applyChapterBattlefieldPlayerDamageModifiers(anchor, 18);
    assert(boosted > 18, `chapter 2 leyline should convert block into bonus damage, got ${boosted}`);

    const anchorBlockBefore = anchor.block;
    battle.handleChapterBattlefieldEnemyDamaged(battle.enemies[1], 7);
    assert(anchor.block > anchorBlockBefore, 'chapter 2 hitting non-anchor first should reforge block onto the anchor');

    player.turnNumber = 2;
    field.turnState.turnStartApplied = 0;
    const energyBefore = player.currentEnergy;
    const blockBefore = player.block;
    battle.applyChapterBattlefieldTurnStart('player', { force: true });
    assert(player.currentEnergy === energyBefore + 1, 'chapter 2 even-turn omen should reward treasure/forge prep with energy');
    assert(player.block > blockBefore, 'chapter 2 even-turn omen should also add block');

    const bonusBeforeHit = Math.max(0, Math.floor(Number(player.buffs.nextAttackBonus) || 0));
    battle.handleChapterBattlefieldPlayerDamaged(9, battle.enemies[0], { type: 'attack' });
    assert((player.buffs.nextAttackBonus || 0) > bonusBeforeHit, 'chapter 2 leyline should prime a stronger counterattack after taking damage');

    player.turnNumber = 3;
    field.formation.firstDamageResolvedPlayerTurn = 0;
    const energyBeforeAnchor = player.currentEnergy;
    const blockBeforeAnchor = player.block;
    battle.handleChapterBattlefieldEnemyDamaged(anchor, 8);
    assert(player.currentEnergy === energyBeforeAnchor + 1, 'chapter 2 hitting anchor first should grant energy');
    assert(player.block > blockBeforeAnchor, 'chapter 2 hitting anchor first should also grant block');

    battle.enemies[1].block = 12;
    const energyBeforeKill = player.currentEnergy;
    battle.handleChapterBattlefieldEnemyKilled(anchor);
    assert(player.currentEnergy === energyBeforeKill + 1, 'chapter 2 killing anchor should grant energy');
    assert(battle.enemies[1].block === 0, 'chapter 2 survivors should lose block after anchor death');
    assert((battle.enemies[1].buffs.weak || 0) >= 1, 'chapter 2 survivors should receive weak after anchor death');
  }

  // Chapter 3: omen cycle + combo leyline + star-chain formation
  {
    const player = makePlayer(8);
    player.turnNumber = 1;
    player.hand = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const snapshot = makeChapterSnapshot(3, 2, '沉星古庭', '沉星轮转', '星律地脉');
    const game = {
      player,
      currentBattleNode: { id: 'ch3-node', type: 'enemy' },
      getChapterDisplaySnapshot: () => snapshot
    };
    const battle = new Battle(game);
    battle.enemies = [
      makeEnemy('star_striker', '沉星锋', [{ type: 'attack', value: 13, intent: '⚔️' }], 48),
      makeEnemy('star_support', '沉星核', [{ type: 'defend', value: 7, intent: '🛡️' }, { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀' }], 46),
      makeEnemy('star_tail', '沉星尾', [{ type: 'attack', value: 9, intent: '⚔️' }], 44)
    ];

    const field = battle.initializeChapterBattlefieldRules();
    const anchor = battle.getChapterFormationAnchorEnemy();
    assert(field && field.chapterIndex === 3, 'chapter 3 battlefield should initialize');
    assert(anchor && anchor.id === 'star_support', `chapter 3 anchor should prefer support backline, got ${anchor && anchor.id}`);
    assert(player.hand.length === 5, `chapter 3 odd-turn omen should draw 1 card, got hand=${player.hand.length}`);

    player.turnNumber = 2;
    field.turnState.turnStartApplied = 0;
    const energyBefore = player.currentEnergy;
    battle.applyChapterBattlefieldTurnStart('player', { force: true });
    assert(player.currentEnergy === energyBefore + 1, 'chapter 3 even-turn omen should grant energy');

    const anchorBlockBefore = anchor.block;
    battle.handleChapterBattlefieldEnemyDamaged(battle.enemies[0], 6);
    assert(anchor.block > anchorBlockBefore, 'chapter 3 missing first hit on anchor should grant it block');

    player.turnNumber = 3;
    field.turnState.turnStartApplied = 0;
    battle.applyChapterBattlefieldTurnStart('player', { force: true });
    const handBefore = player.hand.length;
    battle.handleChapterBattlefieldEnemyDamaged(anchor, 7);
    assert(player.hand.length === handBefore + 1, 'chapter 3 first hit on anchor should draw 1 card');

    battle.cardsPlayedThisTurn = 3;
    const blockBefore = player.block;
    battle.handleChapterBattlefieldCardPlayed({ id: 'star_combo' });
    assert(player.block > blockBefore, 'chapter 3 leyline should grant block on every third card');

    const energyBeforeKill = player.currentEnergy;
    battle.handleChapterBattlefieldEnemyKilled(anchor);
    assert(player.currentEnergy === energyBeforeKill + 1, 'chapter 3 killing anchor should grant energy');
  }

  // Chapter 4: mirror omen + curse leyline + fold formation
  {
    const player = makePlayer(11);
    player.turnNumber = 1;
    player.buffs.weak = 1;
    const snapshot = makeChapterSnapshot(4, 2, '悬镜深渊', '悬镜反照', '幻咒回波');
    const game = {
      player,
      currentBattleNode: { id: 'ch4-node', type: 'enemy' },
      getChapterDisplaySnapshot: () => snapshot
    };
    const battle = new Battle(game);
    battle.enemies = [
      makeEnemy('mirror_core', '悬镜心', [{ type: 'debuff', buffType: 'weak', value: 1, intent: '🌀' }, { type: 'defend', value: 7, intent: '🛡️' }], 50),
      makeEnemy('mirror_guard', '镜从', [{ type: 'attack', value: 10, intent: '⚔️' }], 44)
    ];

    const field = battle.initializeChapterBattlefieldRules();
    const anchor = battle.getChapterFormationAnchorEnemy();
    assert(field && field.chapterIndex === 4, 'chapter 4 battlefield should initialize');
    assert(anchor && anchor.id === 'mirror_core', `chapter 4 anchor should prefer hex/debuff backline, got ${anchor && anchor.id}`);
    assert((player.buffs.weak || 0) === 0, 'chapter 4 odd-turn omen should cleanse one debuff');
    assert(player.block > 0, 'chapter 4 odd-turn omen should grant block after cleansing');

    battle.enemies[1].buffs.vulnerable = 1;
    const boosted = battle.applyChapterBattlefieldPlayerDamageModifiers(battle.enemies[1], 15);
    assert(boosted > 15, `chapter 4 leyline should reward hitting debuffed enemies, got ${boosted}`);

    battle.handleChapterBattlefieldEnemyDamaged(battle.enemies[1], 6);
    assert((anchor.buffs.reflect || 0) >= 1, 'chapter 4 hitting a non-anchor first should prime anchor reflect');

    player.turnNumber = 2;
    field.formation.firstDamageResolvedPlayerTurn = 0;
    player.buffs.poison = 1;
    const poisonBefore = player.buffs.poison || 0;
    const blockBeforeAnchor = player.block;
    battle.handleChapterBattlefieldEnemyDamaged(anchor, 7);
    assert((player.buffs.poison || 0) < poisonBefore, 'chapter 4 hitting anchor first should cleanse a debuff');
    assert(player.block > blockBeforeAnchor, 'chapter 4 hitting anchor first should also grant block after cleansing');

    player.buffs.vulnerable = 1;
    const blockBeforeDamaged = player.block;
    battle.handleChapterBattlefieldPlayerDamaged(8, battle.enemies[1], { type: 'attack' });
    assert(player.block > blockBeforeDamaged, 'chapter 4 leyline should grant block after taking damage');
    assert((player.buffs.vulnerable || 0) === 0, 'chapter 4 leyline should cleanse one debuff after taking damage');

    const energyBeforeKill = player.currentEnergy;
    battle.handleChapterBattlefieldEnemyKilled(anchor);
    assert(player.currentEnergy === energyBeforeKill + 1, 'chapter 4 killing anchor should grant energy');
    assert((battle.enemies[1].buffs.vulnerable || 0) >= 2, 'chapter 4 survivors should gain vulnerable after anchor death');
  }

  // Chapter 5: blood-moon omen + retaliatory leyline + altar formation
  {
    const player = makePlayer(14);
    player.turnNumber = 1;
    player.currentHp = 54;
    player.maxHp = 72;
    const snapshot = makeChapterSnapshot(5, 3, '血月禁庭', '血月覆庭', '献祭狂脉');
    const game = {
      player,
      currentBattleNode: { id: 'ch5-node', type: 'enemy' },
      getChapterDisplaySnapshot: () => snapshot
    };
    const battle = new Battle(game);
    battle.enemies = [
      makeEnemy('blood_eye', '血祭眼', [{ type: 'attack', value: 8, intent: '⚔️' }], 24),
      makeEnemy('blood_guard', '血祭从', [{ type: 'attack', value: 11, intent: '⚔️' }], 40)
    ];

    const field = battle.initializeChapterBattlefieldRules();
    const anchor = battle.getChapterFormationAnchorEnemy();
    assert(field && field.chapterIndex === 5, 'chapter 5 battlefield should initialize');
    assert(anchor && anchor.id === 'blood_eye', `chapter 5 anchor should be lowest-hp enemy, got ${anchor && anchor.id}`);
    assert(player.currentEnergy >= 4, `chapter 5 rising omen should grant energy, got ${player.currentEnergy}`);

    player.turnNumber = 3;
    player.currentHp = 28;
    field.turnState.turnStartApplied = 0;
    const blockBefore = player.block;
    const nextAttackBefore = Math.max(0, Math.floor(Number(player.buffs.nextAttackBonus) || 0));
    battle.applyChapterBattlefieldTurnStart('player', { force: true });
    assert((player.buffs.nextAttackBonus || 0) > nextAttackBefore, 'chapter 5 blood-roar omen should add next-attack bonus');
    assert(player.block > blockBefore, 'chapter 5 blood-roar omen should add block at low hp');

    const hpBefore = player.currentHp;
    battle.handleChapterBattlefieldEnemyDamaged(anchor, 9);
    assert(player.currentHp > hpBefore, 'chapter 5 hitting altar anchor should heal the player');

    const guardBlockBefore = player.block;
    battle.handleChapterBattlefieldPlayerDamaged(10, battle.enemies[1], { type: 'attack' });
    assert(player.block > guardBlockBefore, 'chapter 5 leyline should grant block after taking damage');

    const energyBeforeKill = player.currentEnergy;
    battle.handleChapterBattlefieldEnemyKilled(anchor);
    assert(player.currentEnergy === energyBeforeKill + 1, 'chapter 5 killing altar anchor should grant energy');
    assert((battle.enemies[1].buffs.vulnerable || 0) >= 1, 'chapter 5 survivors should receive vulnerable after altar anchor dies');
  }

  // Chapter 6: final-court omen + synergy leyline + verdict formation
  {
    const player = makePlayer(17);
    player.turnNumber = 1;
    player.runDestiny = { id: 'preceptSeal', tier: 1 };
    player.getRunDestinyMeta = () => ({ id: 'preceptSeal', name: '戒律封印' });
    player.runVows = [{ id: 'realmBreak', tier: 1 }, { id: 'heavenlyGaze', tier: 1 }];
    player.getRunVowMetas = () => [{ id: 'realmBreak', name: '破界' }, { id: 'heavenlyGaze', name: '天鉴' }];
    player.fateRing = {
      path: 'analysis',
      getSocketedLaws: () => ['law_a', 'law_b', 'law_c']
    };
    player.equippedTreasures = [
      { id: 'xj_1', name: '玄甲一式', setTag: 'xuanjia' },
      { id: 'xj_2', name: '玄甲二式', setTag: 'xuanjia' }
    ];
    player.getEquippedTreasureSetCounts = () => ({ xuanjia: 2 });
    player.getSpiritCompanionMeta = () => ({ id: 'artifactSoul', name: '器灵' });
    const snapshot = makeChapterSnapshot(6, 3, '终焉命庭', '终焉问命', '编庭法脉');
    const game = {
      player,
      currentBattleNode: { id: 'ch6-node', type: 'enemy' },
      getChapterDisplaySnapshot: () => snapshot
    };
    const battle = new Battle(game);
    battle.enemies = [
      makeEnemy('final_judge', '终审司', [{ type: 'defend', value: 8, intent: '🛡️' }, { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀' }], 64),
      makeEnemy('final_guard', '律从甲', [{ type: 'attack', value: 12, intent: '⚔️' }], 48),
      makeEnemy('final_tail', '律从乙', [{ type: 'attack', value: 9, intent: '⚔️' }], 46)
    ];

    const field = battle.initializeChapterBattlefieldRules();
    const display = battle.getChapterBattlefieldDisplayState();
    const anchor = battle.getChapterFormationAnchorEnemy();
    assert(field && field.chapterIndex === 6, 'chapter 6 battlefield should initialize');
    assert(anchor && anchor.id === 'final_judge', `chapter 6 anchor should prefer support/judge backline, got ${anchor && anchor.id}`);
    assert(display && display.synergy && display.synergy.axes === 5, `chapter 6 synergy axes should be 5, got ${JSON.stringify(display && display.synergy)}`);
    assert(/5轴/.test(display.leyline.activeLabel || ''), `chapter 6 leyline label should surface synergy axes, got ${display.leyline.activeLabel}`);
    assert(field.omen.phaseLabel === '万象同判', `chapter 6 high-synergy omen should resolve to 万象同判, got ${field.omen.phaseLabel}`);
    assert(player.currentEnergy >= 4, `chapter 6 opening omen should grant energy, got ${player.currentEnergy}`);
    assert((player.buffs.nextAttackBonus || 0) > 0, 'chapter 6 opening omen should grant next-attack bonus');
    assert(player.hand.length >= 1, 'chapter 6 opening omen should draw when all axes are active');

    const boosted = battle.applyChapterBattlefieldPlayerDamageModifiers(anchor, 20);
    assert(boosted > 20, `chapter 6 leyline should boost damage based on multi-axis synergy, got ${boosted}`);

    player.buffs.weak = 1;
    const blockBeforeDamaged = player.block;
    battle.handleChapterBattlefieldPlayerDamaged(9, battle.enemies[1], { type: 'attack' });
    assert(player.block > blockBeforeDamaged, 'chapter 6 leyline should add block after taking damage');
    assert((player.buffs.weak || 0) === 0, 'chapter 6 leyline should cleanse one debuff at high synergy');

    player.turnNumber = 2;
    field.formation.firstDamageResolvedPlayerTurn = 0;
    const energyBeforeAnchor = player.currentEnergy;
    const handBeforeAnchor = player.hand.length;
    const bonusBeforeAnchor = Math.max(0, Math.floor(Number(player.buffs.nextAttackBonus) || 0));
    battle.handleChapterBattlefieldEnemyDamaged(anchor, 8);
    assert((player.buffs.nextAttackBonus || 0) > bonusBeforeAnchor, 'chapter 6 hitting anchor first should further raise next-attack bonus');
    assert(player.currentEnergy === energyBeforeAnchor + 1, 'chapter 6 hitting anchor first should grant energy');
    assert(player.hand.length === handBeforeAnchor + 1, 'chapter 6 hitting anchor first at full synergy should draw');

    const energyBeforeKill = player.currentEnergy;
    battle.handleChapterBattlefieldEnemyKilled(anchor);
    assert(player.currentEnergy === energyBeforeKill + 1, 'chapter 6 killing anchor should grant energy');
    assert((battle.enemies[1].buffs.weak || 0) >= 1, 'chapter 6 survivors should receive weak after anchor death');
    assert((battle.enemies[1].buffs.vulnerable || 0) >= 1, 'chapter 6 survivors should receive vulnerable at high synergy after anchor death');
  }

  console.log('Chapter battlefield runtime checks passed.');
})();
