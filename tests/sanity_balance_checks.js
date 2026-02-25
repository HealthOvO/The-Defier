const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadFile(ctx, filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, ctx, { filename: filePath });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async function run() {
  const ctx = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    Math,
    Date,
    JSON,
    Array,
    Object,
    Number,
    String,
    Boolean,
    Promise,
    // Minimal DOM stubs
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} })
    },
    window: {},
    Utils: {
      showBattleLog: () => {},
      random: (min, max) => min,
      shuffle: (arr) => arr.slice(),
      upgradeCard: (card) => ({ ...card, upgraded: true }),
      getCanonicalElement: (e) => e,
      getElementIcon: () => '',
      createFloatingText: () => {},
      showFloatingNumber: () => {},
      addShakeEffect: () => {},
      renderBuffs: () => '',
      sleep: async () => {},
      createCardElement: () => ({ style: {}, remove() {} }),
      createEnemyElement: () => ({ addEventListener() {}, dataset: {}, classList: { add() {}, remove() {} } })
    }
  });

  // Make window/global point to context for scripts that assign to window
  ctx.window = ctx;
  ctx.global = ctx;

  const root = '/Users/health/workspace/The Defier';

  // Load data dependencies first
  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/data/characters.js'));
  loadFile(ctx, path.join(root, 'js/data/skills.js'));
  loadFile(ctx, path.join(root, 'js/data/fate_ring.js'));
  loadFile(ctx, path.join(root, 'js/data/laws.js'));
  loadFile(ctx, path.join(root, 'js/data/treasures.js'));
  loadFile(ctx, path.join(root, 'js/data/enemies.js'));
  loadFile(ctx, path.join(root, 'js/data/boss_mechanics.js'));

  // Load core classes
  loadFile(ctx, path.join(root, 'js/core/fateRing.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/core/battle.js'));
  loadFile(ctx, path.join(root, 'js/core/map.js'));
  loadFile(ctx, path.join(root, 'js/core/ai-controller.js'));
  loadFile(ctx, path.join(root, 'js/entities/ghost-enemy.js'));

  const Player = vm.runInContext('Player', ctx);
  const Battle = vm.runInContext('Battle', ctx);
  const GameMap = vm.runInContext('GameMap', ctx);
  const GhostEnemy = vm.runInContext('GhostEnemy', ctx);
  const BossMechanicsHandler = vm.runInContext('BossMechanicsHandler', ctx);
  const CARDS = vm.runInContext('CARDS', ctx);

  // Test: Environment card cost (+1 for cost>1)
  const player = new Player();
  const game = { player, achievementSystem: { updateStat: () => {} } };
  player.game = game;

  const battle = new Battle(game);
  battle.activeEnvironment = { modifyCardCost: (card) => (card.cost > 1 ? card.cost + 1 : card.cost) };

  assert(battle.getEffectiveCardCost({ cost: 2, consumeCandy: false }) === 3, 'Gravity cost+1 failed');
  assert(battle.getEffectiveCardCost({ cost: 1, consumeCandy: false }) === 1, 'Gravity should not affect cost<=1');

  // Test: Environment state gravity fallback
  battle.activeEnvironment = null;
  battle.environmentState = { gravity: true };
  assert(battle.getEffectiveCardCost({ cost: 2, consumeCandy: false }) === 3, 'Gravity fallback cost+1 failed');

  // Test: Realm 12 no-block environment
  ctx.window.game = { battle: { environmentState: { noBlock: true } } };
  player.block = 0;
  player.addBlock(10);
  assert(player.block === 0, 'noBlock should prevent block gain');

  ctx.window.game = { battle: { environmentState: { noBlock: false } } };
  player.addBlock(10);
  assert(player.block > 0, 'block should be gained when noBlock is false');

  // Test: Realm 12 attack damage bonus +20%
  player.realm = 12;
  ctx.window.game = { battle: { environmentState: { damageBonus: 0.2 } } };
  const dmgResult = player.executeEffect({ type: 'damage', value: 10, target: 'enemy' }, null, { card: { type: 'attack' } });
  assert(dmgResult.value === 12, 'realm12 damage bonus failed');

  // Test: Defiance death immunity
  player.block = 0;
  player.buffs = {};
  player.fateRing.deathImmunityCount = 1;
  player.maxHp = 10;
  player.currentHp = 1;
  const res = player.takeDamage(10);
  assert(player.currentHp === 1, 'defiance death immunity should keep HP at 1');
  assert(player.fateRing.deathImmunityCount === 0, 'defiance immunity count should decrement');

  // Test: spaceRift dodge uses dodgeChance
  player.buffs = {};
  player.collectedLaws = [{ id: 'spaceRift', passive: { dodgeChance: 1 } }];
  const dodgeRes = player.takeDamage(5);
  assert(dodgeRes.dodged === true, 'spaceRift dodge should trigger at 100%');

  // Test: Insight kill heal
  player.fateRing.path = 'insight';
  player.currentHp = 5;
  player.maxHp = 10;
  const enemy = { currentHp: 1, maxHp: 10, block: 0, buffs: {}, isBoss: false };
  battle.enemies = [enemy];
  battle.checkBattleEnd = () => false;
  battle.game = game;
  battle.dealDamageToEnemy(enemy, 5);
  assert(player.currentHp === 10, 'insight kill heal should heal +5 (capped at max)');

  // Test: combo bonus applied as percentage
  game.getComboBonus = () => 0.1; // +10%
  const enemy2 = { currentHp: 100, maxHp: 100, block: 0, buffs: {}, isBoss: false };
  battle.enemies = [enemy2];
  battle.game = game;
  const dmg = battle.dealDamageToEnemy(enemy2, 10);
  assert(dmg === 11, 'combo bonus should increase damage by 10%');

  // Test: enemy dodge layer should dodge once and consume stack
  const enemyDodge = { currentHp: 30, maxHp: 30, block: 0, buffs: { dodge: 1 }, isBoss: false, name: 'dodgeEnemy' };
  const dodgeDamage = battle.dealDamageToEnemy(enemyDodge, 10);
  assert(dodgeDamage === 0, 'enemy dodge stack should avoid damage');
  assert(enemyDodge.buffs.dodge === 0, 'enemy dodge stack should be consumed');

  // Test: createEnemyInstance should keep hp/maxHp in sync after scaling
  const created = battle.createEnemyInstance({
    id: 'tmpEnemy',
    name: 'tmpEnemy',
    hp: 100,
    patterns: [{ type: 'attack', value: 10, intent: '⚔️' }],
    isBoss: false
  });
  assert(created.hp === created.maxHp, 'enemy hp should sync to maxHp after scaling');

  // Test: Dual boss HP split uses base hp
  const gm = new GameMap({
    player: { realm: 11 },
    startBattle: (enemies) => { gm._captured = enemies; },
    currentBattleNode: null
  });
  gm.startBossBattle({ id: 999, type: 'boss' });
  assert(Array.isArray(gm._captured) && gm._captured.length === 2, 'dual boss should spawn 2 enemies');
  const expectedHp = 280; // stormSummoner hp 400 * 0.7
  assert(gm._captured[0].hp === expectedHp, 'dual boss hp split incorrect (A)');
  assert(gm._captured[1].hp === expectedHp, 'dual boss hp split incorrect (B)');

  // Test: Ghost damage should not double-consume block
  const pvpPlayer = new Player();
  pvpPlayer.buffs = {};
  pvpPlayer.currentHp = 20;
  pvpPlayer.maxHp = 20;
  pvpPlayer.block = 5;
  const ghost = new GhostEnemy({
    maxHp: 20,
    currentHp: 20,
    maxEnergy: 3,
    deck: ['strike'],
    buffs: {}
  });
  const pvpBattle = {
    player: pvpPlayer,
    updateBattleUI: () => {}
  };
  ghost.applyEffectReal({ type: 'damage', value: 4 }, pvpBattle);
  assert(pvpPlayer.currentHp === 20, 'ghost damage should not bypass remaining block');
  assert(pvpPlayer.block === 1, 'ghost damage should consume block exactly once');

  // Test: Ghost penetrate should ignore block
  pvpPlayer.block = 10;
  pvpPlayer.currentHp = 20;
  ghost.applyEffectReal({ type: 'penetrate', value: 4 }, pvpBattle);
  assert(pvpPlayer.currentHp === 16, 'ghost penetrate should damage HP directly');
  assert(pvpPlayer.block === 10, 'ghost penetrate should not consume block');

  // Test: addBlock should pass through onGainBlock treasure hook
  player.realm = 2; // avoid realm 1 shield penalty
  player.block = 0;
  player.equippedTreasures = [{
    callbacks: {
      onGainBlock: (p, amount) => amount + 5
    }
  }];
  player.treasures = player.equippedTreasures;
  player.addBlock(10);
  assert(player.block === 15, 'onGainBlock hook should modify gained block');

  // Test: onBeforeTakeDamage numeric return should be applied
  player.currentHp = 20;
  player.maxHp = 20;
  player.block = 0;
  player.buffs = {};
  player.collectedLaws = [];
  player.activeResonances = [];
  player.equippedTreasures = [{
    callbacks: {
      onBeforeTakeDamage: (p, amount) => 0
    }
  }];
  player.treasures = player.equippedTreasures;
  const preventedHit = player.takeDamage(10);
  assert(preventedHit.damage === 0, 'onBeforeTakeDamage should reduce incoming damage');
  assert(player.currentHp === 20, 'onBeforeTakeDamage(0) should keep hp unchanged');

  // Test: onBeforeDeath should be able to prevent lethal
  player.currentHp = 1;
  player.maxHp = 20;
  player.block = 0;
  player.buffs = {};
  player.equippedTreasures = [{
    callbacks: {
      onBeforeDeath: (p) => {
        p.currentHp = 1;
        return true;
      }
    }
  }];
  player.treasures = player.equippedTreasures;
  const deathSave = player.takeDamage(10);
  assert(deathSave.prevented === true, 'onBeforeDeath should report prevented lethal');
  assert(player.currentHp === 1, 'onBeforeDeath should keep hp above 0');

  // Test: hasCounterTreasure should compare by treasure id
  const counterPlayer = { treasures: [{ id: 'heart_mirror' }] };
  assert(
    BossMechanicsHandler.hasCounterTreasure(counterPlayer, 'swordElder') === true,
    'hasCounterTreasure should match by treasure.id'
  );

  // Test: boss penetrate mechanic should return ignoreBlock flag on attack-before stage
  const prevRandom = ctx.Math.random;
  ctx.Math.random = () => 0; // force trigger for chance-based mechanics
  const penetrateBoss = battle.createEnemyInstance({
    id: 'swordElder',
    name: 'swordElder',
    hp: 100,
    patterns: [{ type: 'attack', value: 10, intent: '⚔️' }],
    isBoss: true
  });
  const beforeAttack = BossMechanicsHandler.processOnAttack(battle, penetrateBoss, 10, { stage: 'before' });
  ctx.Math.random = prevRandom;
  assert(beforeAttack && beforeAttack.ignoreBlock === true, 'boss penetrate should mark ignoreBlock');

  // Test: createEnemyInstance should provide compatibility methods used by mechanics/treasures
  const methodEnemy = battle.createEnemyInstance({
    id: 'methodEnemy',
    name: 'methodEnemy',
    hp: 20,
    patterns: [{ type: 'attack', value: 5, intent: '⚔️' }],
    isBoss: false
  });
  methodEnemy.addBuff('burn', 2);
  const healed = methodEnemy.heal(3);
  const damaged = methodEnemy.takeDamage(5, { ignoreBlock: true });
  assert(typeof methodEnemy.isAlive === 'function', 'enemy should expose isAlive method');
  assert(methodEnemy.buffs.burn === 2, 'enemy.addBuff should apply buff');
  assert(healed >= 0 && damaged >= 0, 'enemy heal/takeDamage methods should return numeric value');

  // Test: executeEffect should support discardRandom / energyLoss result typing
  const discardRandomResult = player.executeEffect({ type: 'discardRandom', value: 1, trigger: 'turnEnd' }, null, {});
  assert(discardRandomResult.type === 'discardRandom', 'discardRandom should return typed result');
  const energyLossResult = player.executeEffect({ type: 'energyLoss', value: 1, trigger: 'turnEnd' }, null, {});
  assert(energyLossResult.type === 'energyLoss', 'energyLoss should return typed result');

  // Test: processEffect should apply discardRandom / energyLoss when resolved immediately
  const prevUpdateBattleUI = battle.updateBattleUI;
  battle.updateBattleUI = () => {};
  player.hand = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  player.discardPile = [];
  await battle.processEffect({ type: 'discardRandom', value: 2 }, null, 0);
  assert(player.hand.length === 1, 'discardRandom process should reduce hand size');
  assert(player.discardPile.length === 2, 'discardRandom process should move cards to discard');

  player.currentEnergy = 3;
  await battle.processEffect({ type: 'energyLoss', value: 2 }, null, 0);
  assert(player.currentEnergy === 1, 'energyLoss process should reduce current energy');
  battle.updateBattleUI = prevUpdateBattleUI;

  // Integration: enemyTurn should trigger onEnemyTurnEnd treasure hook
  let enemyTurnEndTriggered = false;
  player.triggerTreasureEffect = (triggerType) => {
    if (triggerType === 'onEnemyTurnEnd') enemyTurnEndTriggered = true;
    return null;
  };
  battle.enemies = [];
  await battle.enemyTurn();
  assert(enemyTurnEndTriggered === true, 'enemyTurn should trigger onEnemyTurnEnd');

  // Integration: endTurn should trigger onTurnEnd treasure hook
  let turnEndTriggered = false;
  const oldGetElementById = ctx.document.getElementById;
  ctx.document.getElementById = () => ({ disabled: false, style: {}, textContent: '', classList: { add() {}, remove() {} } });
  battle.currentTurn = 'player';
  battle.battleEnded = false;
  battle.isProcessingCard = false;
  battle.activeEnvironment = null;
  battle.player.endTurn = () => {};
  battle.player.startTurn = () => {};
  battle.enemyTurn = async () => {};
  battle.checkBattleEnd = () => false;
  battle.updateBattleUI = () => {};
  player.triggerTreasureEffect = (triggerType) => {
    if (triggerType === 'onTurnEnd') turnEndTriggered = true;
    return null;
  };
  await battle.endTurn();
  ctx.document.getElementById = oldGetElementById;
  assert(turnEndTriggered === true, 'endTurn should trigger onTurnEnd');

  // Integration: boss penetrate + onBeforeTakePenetrate should bypass block and reduce damage
  const penPlayer = new Player();
  const penGame = {
    player: penPlayer,
    achievementSystem: { updateStat: () => {} },
    onBattleWon: () => {},
    onBattleLost: () => {}
  };
  penPlayer.game = penGame;
  const penBattle = new Battle(penGame);
  penBattle.updateBattleUI = () => {};
  penPlayer.realm = 2;
  penPlayer.maxHp = 30;
  penPlayer.currentHp = 30;
  penPlayer.block = 10;
  penPlayer.buffs = {};
  penPlayer.collectedLaws = [];
  penPlayer.activeResonances = [];
  penPlayer.equippedTreasures = [{
    callbacks: {
      onBeforeTakePenetrate: (p, amount) => Math.max(0, amount - 4)
    }
  }];
  penPlayer.treasures = penPlayer.equippedTreasures;

  const penBoss = penBattle.createEnemyInstance({
    id: 'swordElder',
    name: 'swordElder',
    hp: 100,
    patterns: [{ type: 'attack', value: 10, intent: '⚔️' }],
    isBoss: true
  });
  const oldRandom2 = ctx.Math.random;
  ctx.Math.random = () => 0; // force penetrate trigger
  await penBattle.processEnemyPattern(penBoss, { type: 'attack', value: 10, intent: '⚔️' }, 0);
  ctx.Math.random = oldRandom2;
  assert(penPlayer.block === 10, 'penetrate should bypass block without consuming it');
  assert(penPlayer.currentHp === 24, 'onBeforeTakePenetrate should reduce penetrate damage');

  // New mechanic: stance switching
  const stanceRes = player.executeEffect({ type: 'setStance', stance: 'aggressive' }, null, {});
  assert(stanceRes.type === 'stance', 'setStance should return stance result type');
  assert(player.stance === 'aggressive', 'setStance should update player stance');

  // New mechanic: mark should be consumed on hit
  const markedEnemy = battle.createEnemyInstance({
    id: 'markedEnemy',
    name: 'markedEnemy',
    hp: 30,
    patterns: [{ type: 'attack', value: 4, intent: '⚔️' }],
    isBoss: false
  });
  markedEnemy.buffs.mark = 5;
  const markDamage = battle.dealDamageToEnemy(markedEnemy, 10);
  assert(markDamage >= 15, 'mark should increase the next incoming damage');
  assert(!markedEnemy.buffs.mark, 'mark should be consumed after trigger');

  // New mechanic: bleed should tick and decay on enemy debuff phase
  const bleedEnemy = battle.createEnemyInstance({
    id: 'bleedEnemy',
    name: 'bleedEnemy',
    hp: 40,
    patterns: [{ type: 'attack', value: 4, intent: '⚔️' }],
    isBoss: false
  });
  bleedEnemy.currentHp = 40;
  bleedEnemy.buffs.bleed = 3;
  battle.checkBattleEnd = () => false;
  await battle.processEnemyDebuffs(bleedEnemy, 0);
  assert(bleedEnemy.currentHp === 37, 'bleed should deal direct damage at turn tick');
  assert(bleedEnemy.buffs.bleed === 2, 'bleed should decay by one layer');

  // New mechanic: archetype resonance should be resolved from deck and amplify bleed
  const resonancePlayer = new Player();
  resonancePlayer.characterId = 'linFeng';
  resonancePlayer.deck = [
    { ...CARDS.bloodlettingSlash }, { ...CARDS.bloodlettingSlash },
    { ...CARDS.crimsonCascade }, { ...CARDS.serratedRitual },
    { ...CARDS.coagulatedGuard }, { ...CARDS.arteryRupture },
    { ...CARDS.scarletJudgement }, { ...CARDS.hemorrhageRain },
    { ...CARDS.strike }
  ];
  resonancePlayer.prepareBattle();
  assert(resonancePlayer.archetypeResonance && resonancePlayer.archetypeResonance.id === 'hemorrhage', 'hemorrhage resonance should activate');
  const bleedRes = resonancePlayer.executeEffect({ type: 'applyBleed', value: 2, target: 'enemy' }, null, {});
  assert(bleedRes.value >= 3, 'hemorrhage resonance should increase bleed application');

  // New mechanic: precision resonance should grant first-mark-hit draw
  const precisionPlayer = new Player();
  precisionPlayer.deck = [
    { ...CARDS.punctureMark }, { ...CARDS.tacticalExpose }, { ...CARDS.hunterSeal },
    { ...CARDS.weakpointSurvey }, { ...CARDS.duetFeint }, { ...CARDS.poisedCounter },
    { ...CARDS.razorFocus }, { ...CARDS.focusBreak }, { ...CARDS.defend }
  ];
  precisionPlayer.prepareBattle();
  precisionPlayer.hand = [];
  precisionPlayer.drawPile = [{ ...CARDS.strike, instanceId: 'tmp-draw-card' }];
  const precisionGame = { player: precisionPlayer, achievementSystem: { updateStat: () => {} } };
  const precisionBattle = new Battle(precisionGame);
  precisionBattle.player = precisionPlayer;
  precisionBattle.updateBattleUI = () => {};
  const precisionEnemy = precisionBattle.createEnemyInstance({
    id: 'precisionEnemy',
    name: 'precisionEnemy',
    hp: 30,
    patterns: [{ type: 'attack', value: 4, intent: '⚔️' }],
    isBoss: false
  });
  precisionEnemy.buffs.mark = 3;
  precisionBattle.dealDamageToEnemy(precisionEnemy, 6);
  assert(precisionPlayer.hand.length === 1, 'precision resonance should draw on first marked hit each turn');

  // New mechanic: forge node choices should produce distinct outcomes
  const forgeGame = {
    player: new Player(),
    showShop: () => {},
    showCampfire: () => {},
    showEventModal: () => {},
    startBattle: () => {},
    onRealmComplete: () => {}
  };
  forgeGame.player.characterId = 'linFeng';
  forgeGame.player.realm = 3;
  forgeGame.player.gold = 500;
  forgeGame.player.deck = [{ ...CARDS.strike }, { ...CARDS.defend }, { ...CARDS.heavyStrike }];
  const forgeMap = new GameMap(forgeGame);
  forgeMap.completeNode = () => { forgeMap._completed = true; };
  forgeMap.applyForgeChoice({ id: 1001, row: 2, type: 'forge' }, 'steady', { forgeCost: 50, premiumCost: 120, temperCost: 30 });
  const upgradedCount = forgeGame.player.deck.filter(c => c.upgraded).length;
  assert(upgradedCount >= 1, 'steady forge should upgrade at least one card');
  const deckSizeAfterSteady = forgeGame.player.deck.length;
  forgeMap.applyForgeChoice({ id: 1002, row: 2, type: 'forge' }, 'temper', { forgeCost: 50, premiumCost: 120, temperCost: 30 });
  assert(forgeGame.player.deck.length >= deckSizeAfterSteady + 1, 'temper forge should add a card to deck');
  assert(forgeMap._completed === true, 'forge choice should complete map node');

  // New mechanic: tempo doctrine should grant first-hit bonus once per battle
  const tempoPlayer = new Player();
  tempoPlayer.realm = 2;
  tempoPlayer.legacyRunDoctrine = {
    presetId: 'tempo',
    openingBattleBlockBonus: 0,
    firstAttackBonusPerBattle: 3,
    firstForgeExtraUpgradeOnce: 0,
    firstForgeBoostUsed: false
  };
  const tempoGame = { player: tempoPlayer, achievementSystem: { updateStat: () => {} } };
  tempoGame._tempoMissionCount = 0;
  tempoGame.handleLegacyMissionProgress = (eventType, amount) => {
    if (eventType === 'tempoFirstStrike') tempoGame._tempoMissionCount += amount;
  };
  const tempoBattle = new Battle(tempoGame);
  tempoBattle.player = tempoPlayer;
  tempoBattle.updateBattleUI = () => {};
  const tempoEnemy = tempoBattle.createEnemyInstance({
    id: 'tempoEnemy',
    name: 'tempoEnemy',
    hp: 60,
    patterns: [{ type: 'attack', value: 4, intent: '⚔️' }],
    isBoss: false
  });
  const firstHit = tempoBattle.dealDamageToEnemy(tempoEnemy, 10);
  const secondHit = tempoBattle.dealDamageToEnemy(tempoEnemy, 10);
  assert(firstHit >= 13, 'tempo doctrine should increase first hit damage');
  assert(secondHit === 10, 'tempo doctrine bonus should only apply once per battle');
  assert(tempoGame._tempoMissionCount === 1, 'tempo doctrine trigger should report mission progress once');

  // New mechanic: survivor doctrine should grant opening block each battle
  const survivorPlayer = new Player();
  survivorPlayer.realm = 2;
  survivorPlayer.legacyRunDoctrine = {
    presetId: 'survivor',
    openingBattleBlockBonus: 4,
    firstAttackBonusPerBattle: 0,
    firstForgeExtraUpgradeOnce: 0,
    firstForgeBoostUsed: false
  };
  survivorPlayer.prepareBattle();
  assert(survivorPlayer.block >= 4, 'survivor doctrine should grant opening block');

  // New mechanic: smith doctrine should grant first forge extra upgrade once
  const smithGame = {
    player: new Player(),
    showShop: () => {},
    showCampfire: () => {},
    showEventModal: () => {},
    startBattle: () => {},
    onRealmComplete: () => {}
  };
  smithGame._forgeMissionCount = 0;
  smithGame.handleLegacyMissionProgress = (eventType, amount) => {
    if (eventType === 'forgeComplete') smithGame._forgeMissionCount += amount;
  };
  smithGame.player.characterId = 'linFeng';
  smithGame.player.realm = 3;
  smithGame.player.gold = 500;
  smithGame.player.deck = [{ ...CARDS.strike }, { ...CARDS.defend }, { ...CARDS.heavyStrike }, { ...CARDS.quickSlash }];
  smithGame.player.legacyRunDoctrine = {
    presetId: 'smith',
    openingBattleBlockBonus: 0,
    firstAttackBonusPerBattle: 0,
    firstForgeExtraUpgradeOnce: 1,
    firstForgeBoostUsed: false
  };
  const smithMap = new GameMap(smithGame);
  smithMap.completeNode = () => {};
  smithMap.applyForgeChoice({ id: 2001, row: 2, type: 'forge' }, 'steady', { forgeCost: 50, premiumCost: 120, temperCost: 30 });
  const smithUpgradedAfterFirst = smithGame.player.deck.filter(c => c.upgraded).length;
  assert(smithUpgradedAfterFirst >= 2, 'smith doctrine first forge should upgrade one extra card');
  assert(smithGame.player.legacyRunDoctrine.firstForgeBoostUsed === true, 'smith doctrine should mark first forge boost as used');
  smithMap.applyForgeChoice({ id: 2002, row: 2, type: 'forge' }, 'steady', { forgeCost: 50, premiumCost: 120, temperCost: 30 });
  const smithUpgradedAfterSecond = smithGame.player.deck.filter(c => c.upgraded).length;
  assert(smithUpgradedAfterSecond - smithUpgradedAfterFirst === 1, 'smith doctrine extra upgrade should only apply on first forge');
  assert(smithGame._forgeMissionCount === 2, 'forge choices should report mission progress');

  console.log('All sanity checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
