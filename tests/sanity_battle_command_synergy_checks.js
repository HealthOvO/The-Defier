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

function makeEnemy(id, hp = 130) {
  return {
    id,
    name: `敌人-${id}`,
    currentHp: hp,
    maxHp: hp,
    block: 5,
    buffs: {},
    patterns: [{ type: 'attack', value: 11, intent: '⚔️' }],
    currentPatternIndex: 0
  };
}

function makePlayer() {
  return {
    realm: 11,
    currentHp: 72,
    maxHp: 120,
    block: 0,
    currentEnergy: 3,
    maxMilkCandy: 6,
    milkCandy: 2,
    buffs: {},
    hand: [],
    drawPile: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    discardPile: [],
    fateRing: { path: 'convergence' },
    archetypeResonance: { id: 'entropy' },
    equippedTreasures: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
    activeResonances: [],
    collectedLaws: [],
    addBlock(v) {
      this.block = Math.max(0, this.block + Math.floor(Number(v) || 0));
    },
    drawCards(n) {
      const c = Math.max(0, Math.floor(Number(n) || 0));
      for (let i = 0; i < c; i += 1) {
        if (this.drawPile.length <= 0) break;
        this.hand.push(this.drawPile.shift());
      }
    },
    heal(v) {
      this.currentHp = Math.min(this.maxHp, this.currentHp + Math.max(0, Math.floor(Number(v) || 0)));
    },
    takeDamage(v) {
      const damage = Math.max(0, Math.floor(Number(v) || 0));
      this.currentHp = Math.max(0, this.currentHp - damage);
      return { damage, dodged: false, thorns: 0 };
    },
    isAlive() {
      return this.currentHp > 0;
    }
  };
}

(async function run() {
  const root = path.resolve(__dirname, '..');
  const mathObj = Object.create(Math);
  mathObj.random = () => 0.36;

  const ctx = vm.createContext({
    console,
    window: {},
    Math: mathObj,
    JSON,
    Date,
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
    CARDS: { heartDemon: { id: 'heartDemon', name: '心魔' } },
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, innerHTML: '', className: '' })
    },
    Utils: {
      showBattleLog: () => {},
      sleep: () => Promise.resolve(),
      addShakeEffect: () => {},
      showFloatingNumber: () => {},
      createFloatingText: () => {},
      getCanonicalElement: (v) => String(v || 'none')
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  loadFile(ctx, path.join(root, 'js/core/battle.js'));
  const Battle = vm.runInContext('Battle', ctx);
  assert(typeof Battle === 'function', 'Battle class should exist');

  const game = {
    mode: 'pve',
    player: makePlayer(),
    currentBattleNode: { id: 8801, type: 'enemy', row: 1, col: 1 },
    _endless: { active: true, pressure: 8 },
    isEndlessActive() { return !!this._endless.active; },
    ensureEndlessState() { return this._endless; },
    onBattleWon: () => {},
    onBattleLost: () => {}
  };

  const battle = new Battle(game);
  battle.enemies = [makeEnemy('a'), makeEnemy('b')];
  battle.initializeBattleCommandSystem();
  assert(battle.commandState.enabled, 'command state should be enabled');
  assert(
    battle.commandState.commands.some((command) => command && command.id === 'rift_surge_order'),
    'endless battle should include exclusive rift command'
  );
  assert(
    battle.commandState.commands.some((command) =>
      command && (command.id === 'phase_anchor_order' || command.id === 'void_pursuit_order' || command.id === 'horizon_barter_order' || command.id === 'resonance_matrix_order')),
    'endless battle should include at least one extra endless-exclusive command'
  );
  assert(
    battle.getBattleCommandCatalog().some((command) => command && command.id === 'horizon_barter_order'),
    'endless catalog should include horizon barter command'
  );
  assert(
    battle.getBattleCommandCatalog().some((command) => command && command.id === 'resonance_matrix_order'),
    'endless catalog should include resonance matrix command'
  );
  assert((battle.commandState.maxPoints || 0) >= 14, 'high endless pressure should increase command cap');

  // 指令成本联动（智慧 + 宝物首发减免 + 高压减免）
  game.player.fateRing.path = 'wisdom';
  const tempo = battle.getBattleCommandById('tempo_order');
  if (tempo) {
    battle.commandState.firstCommandDiscountUsed = false;
    const effectiveCost = battle.resolveBattleCommandEffectiveCost(tempo);
    assert(effectiveCost <= Math.max(1, tempo.cost - 2), 'wisdom/treasure synergy should reduce command cost');
  }

  // 出牌联动充能（汇流攻击 + 熵流技能）
  battle.commandState.points = 0;
  battle.cardsPlayedThisTurn = 1;
  game.player.fateRing.path = 'convergence';
  game.player.archetypeResonance = { id: 'entropy' };
  battle.emit('cardPlayed', { card: { id: 'atk', type: 'attack' }, cardsPlayedThisTurn: 1 });
  assert((battle.commandState.points || 0) >= 3, 'convergence attack should provide bonus command gain');

  battle.emit('cardPlayed', { card: { id: 'skl', type: 'skill' }, cardsPlayedThisTurn: 2 });
  assert((battle.commandState.points || 0) >= 5, 'entropy skill should provide bonus command gain');

  // 新增无尽专属指令：相位锚定（防守/净化/稳压）
  game.ensureEndlessState().pressure = 8;
  game.player.block = 0;
  game.player.buffs = { weak: 1, burn: 1 };
  const anchorPressureBefore = game.ensureEndlessState().pressure;
  const anchorBlockBefore = game.player.block;
  const anchorOk = await battle.executeBattleCommandEffect({ id: 'phase_anchor_order' });
  assert(anchorOk === true, 'phase anchor command should execute');
  assert(game.player.block > anchorBlockBefore, 'phase anchor should grant block');
  assert((game.player.buffs.weak || 0) === 0, 'phase anchor should cleanse weak');
  assert((game.player.buffs.vulnerable || 0) >= 1, 'phase anchor high-pressure branch should add vulnerable exposure');
  assert(
    game.ensureEndlessState().pressure === anchorPressureBefore - 1,
    'phase anchor should reduce pressure by 1 when pressure is high'
  );

  // 新增无尽专属指令：裂界追猎（猎杀/扩散/高压代价稳压）
  game.ensureEndlessState().pressure = 8;
  battle.enemies = [makeEnemy('focus-a', 180), makeEnemy('focus-b', 160)];
  const pursuitPressureBefore = game.ensureEndlessState().pressure;
  const pursuitHpBefore = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  const pursuitPlayerHpBefore = game.player.currentHp;
  const pursuitOk = await battle.executeBattleCommandEffect({ id: 'void_pursuit_order' });
  const pursuitHpAfter = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  assert(pursuitOk === true, 'void pursuit command should execute');
  assert(pursuitHpAfter < pursuitHpBefore, 'void pursuit should deal damage to enemy lineup');
  assert(game.player.currentHp < pursuitPlayerHpBefore, 'void pursuit high-pressure branch should cost player hp');
  assert(
    game.ensureEndlessState().pressure === pursuitPressureBefore - 1,
    'void pursuit should reduce pressure by 1 at high pressure'
  );

  // 路径分支：智慧高阶可延后相位锚定的暴露阈值
  game.player.fateRing.path = 'wisdom';
  game.player.getPathDoctrineProfile = () => ({
    path: 'wisdom',
    tier: 2,
    commandCostDiscount: 1,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  game.player.buffs = { weak: 1 };
  game.player.block = 0;
  game.ensureEndlessState().pressure = 8;
  const wisdomAnchorOk = await battle.executeBattleCommandEffect({ id: 'phase_anchor_order' });
  assert(wisdomAnchorOk === true, 'wisdom phase anchor should execute');
  assert((game.player.buffs.vulnerable || 0) === 0, 'wisdom doctrine should avoid vulnerable exposure at pressure 8');

  // 路径分支：毁灭高阶应提高裂界追猎的自损代价
  battle.enemies = [makeEnemy('cost-a', 180), makeEnemy('cost-b', 140)];
  game.ensureEndlessState().pressure = 8;
  game.player.currentHp = 110;
  game.player.fateRing.path = 'convergence';
  game.player.getPathDoctrineProfile = () => ({
    path: 'convergence',
    tier: 0,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  const hpBeforeBase = game.player.currentHp;
  await battle.executeBattleCommandEffect({ id: 'void_pursuit_order' });
  const baseLoss = hpBeforeBase - game.player.currentHp;

  battle.enemies = [makeEnemy('cost-c', 180), makeEnemy('cost-d', 140)];
  game.ensureEndlessState().pressure = 8;
  game.player.currentHp = 110;
  game.player.fateRing.path = 'destruction';
  game.player.getPathDoctrineProfile = () => ({
    path: 'destruction',
    tier: 2,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  const hpBeforeDest = game.player.currentHp;
  await battle.executeBattleCommandEffect({ id: 'void_pursuit_order' });
  const destructionLoss = hpBeforeDest - game.player.currentHp;
  assert(destructionLoss > baseLoss, 'destruction doctrine should increase void pursuit hp cost');

  // 新增无尽专属指令：界隙交易（资源博弈）
  game.player.fateRing.path = 'convergence';
  game.player.getPathDoctrineProfile = () => ({
    path: 'convergence',
    tier: 2,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  battle.enemies = [makeEnemy('barter-a', 150), makeEnemy('barter-b', 130)];
  game.player.currentEnergy = 1;
  game.player.hand = [];
  game.player.drawPile = [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }];
  game.player.milkCandy = 2;
  game.ensureEndlessState().pressure = 7;
  const barterPressureBefore = game.ensureEndlessState().pressure;
  const barterEnergyBefore = game.player.currentEnergy;
  const barterHandBefore = game.player.hand.length;
  const barterOk = await battle.executeBattleCommandEffect({ id: 'horizon_barter_order' });
  assert(barterOk === true, 'horizon barter should execute');
  assert(game.player.milkCandy === 0, 'horizon barter should consume available milk candy');
  assert(game.player.currentEnergy > barterEnergyBefore, 'horizon barter should restore energy');
  assert(game.player.hand.length > barterHandBefore, 'horizon barter should draw cards');
  assert(game.ensureEndlessState().pressure === barterPressureBefore - 1, 'horizon barter should reduce pressure with enough candy');

  // 交易档位：保守档应限制奶糖投入并保持低风险
  battle.enemies = [makeEnemy('barter-mode-a', 120)];
  game.player.milkCandy = 3;
  game.player.currentEnergy = 0;
  game.player.hand = [];
  game.player.drawPile = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }];
  game.ensureEndlessState().pressure = 5;
  const modeCandyBefore = game.player.milkCandy;
  const conservativeOk = await battle.executeBattleCommandEffect({ id: 'horizon_barter_order', mode: 'conservative' });
  assert(conservativeOk === true, 'conservative barter mode should execute');
  assert(modeCandyBefore - game.player.milkCandy <= 1, 'conservative barter should spend at most 1 candy');

  // 交易档位：激进档在空投入下应触发更强压力反噬
  battle.enemies = [makeEnemy('barter-mode-b', 120)];
  game.player.milkCandy = 0;
  game.player.currentEnergy = 0;
  game.player.hand = [];
  game.player.drawPile = [{ id: 'a1' }, { id: 'a2' }];
  game.player.fateRing.path = 'convergence';
  game.player.getPathDoctrineProfile = () => ({
    path: 'convergence',
    tier: 0,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  game.ensureEndlessState().pressure = 3;
  const pressureBeforeAggressive = game.ensureEndlessState().pressure;
  const aggressiveOk = await battle.executeBattleCommandEffect({ id: 'horizon_barter_order', mode: 'aggressive' });
  assert(aggressiveOk === true, 'aggressive barter mode should execute');
  assert(
    game.ensureEndlessState().pressure >= pressureBeforeAggressive + 2,
    'aggressive zero-candy barter should cause stronger pressure backlash'
  );

  // 智慧分支：无奶糖时界隙交易不应触发压力反噬
  game.player.fateRing.path = 'wisdom';
  game.player.getPathDoctrineProfile = () => ({
    path: 'wisdom',
    tier: 1,
    commandCostDiscount: 1,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  battle.enemies = [makeEnemy('barter-c', 120)];
  game.player.milkCandy = 0;
  game.player.currentEnergy = 0;
  game.player.hand = [];
  game.player.drawPile = [{ id: 'w1' }, { id: 'w2' }];
  game.ensureEndlessState().pressure = 3;
  const wisdomBarterPressureBefore = game.ensureEndlessState().pressure;
  const wisdomBarterOk = await battle.executeBattleCommandEffect({ id: 'horizon_barter_order' });
  assert(wisdomBarterOk === true, 'wisdom horizon barter should execute with zero candy');
  assert(
    game.ensureEndlessState().pressure === wisdomBarterPressureBefore,
    'wisdom doctrine should prevent pressure backlash when no candy is spent'
  );

  // 反交易词缀：应削弱奶糖收益并阻断稳压
  battle.enemies = [makeEnemy('barter-counter-a', 150), makeEnemy('barter-counter-b', 130)];
  battle.enemies.forEach((enemy) => {
    enemy.__endlessAntiCandy = 1;
    enemy.__endlessAntiDraw = 1;
    enemy.__endlessAntiStabilize = 1;
  });
  game.player.fateRing.path = 'convergence';
  game.player.getPathDoctrineProfile = () => ({
    path: 'convergence',
    tier: 1,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  game.player.milkCandy = 2;
  game.player.currentEnergy = 0;
  game.player.hand = [];
  game.player.drawPile = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }];
  game.ensureEndlessState().pressure = 7;
  const counterPressureBefore = game.ensureEndlessState().pressure;
  const counterHandBefore = game.player.hand.length;
  const counterOk = await battle.executeBattleCommandEffect({ id: 'horizon_barter_order', mode: 'balanced' });
  assert(counterOk === true, 'horizon barter should still execute under counter affix');
  assert(game.ensureEndlessState().pressure === counterPressureBefore, 'anti-stabilize should block pressure reduction');
  assert(
    game.player.hand.length <= counterHandBefore + 2,
    'anti-draw should reduce horizon barter card draw ceiling'
  );

  // 命环共振：破阵回路（敌方高护盾时应优先破阵）
  battle.enemies = [{
    ...makeEnemy('matrix-break', 180),
    block: 24,
    buffs: {},
    patterns: [
      { type: 'defend', value: 12, intent: '🛡️固守' },
      { type: 'attack', value: 8, intent: '⚔️' }
    ]
  }];
  game.player.fateRing.path = 'convergence';
  game.player.getPathDoctrineProfile = () => ({
    path: 'convergence',
    tier: 2,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  game.player.currentHp = 95;
  game.player.maxHp = 120;
  game.player.buffs = {};
  game.ensureEndlessState().pressure = 7;
  const matrixBreakBlockBefore = battle.enemies[0].block;
  const matrixBreakHpBefore = battle.enemies[0].currentHp;
  const matrixBreakOk = await battle.executeBattleCommandEffect({ id: 'resonance_matrix_order' });
  assert(matrixBreakOk === true, 'resonance matrix should execute on break branch');
  assert(battle.enemies[0].block < matrixBreakBlockBefore, 'resonance matrix break branch should reduce enemy block');
  assert((battle.enemies[0].buffs.vulnerable || 0) >= 1, 'resonance matrix break branch should add vulnerable');
  assert(battle.enemies[0].currentHp < matrixBreakHpBefore, 'resonance matrix break branch should deal damage');

  // 命环共振：净域回路（敌方控场威胁时优先净化与过牌，并可稳压）
  battle.enemies = [{
    ...makeEnemy('matrix-cleanse', 150),
    block: 4,
    buffs: {},
    patterns: [
      { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀扰法' },
      { type: 'addStatus', cardId: 'heartDemon', count: 1, intent: '🕳️侵染' },
      { type: 'attack', value: 9, intent: '⚔️' }
    ],
    __endlessAntiDraw: 0,
    __endlessAntiStabilize: 0
  }];
  game.player.fateRing.path = 'wisdom';
  game.player.getPathDoctrineProfile = () => ({
    path: 'wisdom',
    tier: 1,
    commandCostDiscount: 1,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  game.player.currentHp = 104;
  game.player.maxHp = 120;
  game.player.buffs = { weak: 1, burn: 1 };
  game.player.hand = [];
  game.player.drawPile = [{ id: 'mx1' }, { id: 'mx2' }, { id: 'mx3' }];
  game.ensureEndlessState().pressure = 7;
  const matrixCleanseHandBefore = game.player.hand.length;
  const matrixCleansePressureBefore = game.ensureEndlessState().pressure;
  const matrixCleanseOk = await battle.executeBattleCommandEffect({ id: 'resonance_matrix_order' });
  assert(matrixCleanseOk === true, 'resonance matrix should execute on cleanse branch');
  assert((game.player.buffs.weak || 0) === 0, 'resonance matrix cleanse branch should cleanse weak debuff');
  assert(game.player.hand.length > matrixCleanseHandBefore, 'resonance matrix cleanse branch should draw cards');
  assert(
    game.ensureEndlessState().pressure === matrixCleansePressureBefore - 1,
    'resonance matrix cleanse branch should reduce pressure when cleanse is effective'
  );

  // 命环共振：守势回路（高爆发威胁且低血时优先保命）
  battle.enemies = [{
    ...makeEnemy('matrix-defend', 168),
    block: 6,
    buffs: {},
    patterns: [
      { type: 'multiAttack', value: 8, count: 3, intent: '⚔️连斩' },
      { type: 'attack', value: 12, intent: '⚔️' }
    ]
  }];
  game.player.fateRing.path = 'resonance';
  game.player.getPathDoctrineProfile = () => ({
    path: 'resonance',
    tier: 1,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  game.player.currentHp = 60;
  game.player.maxHp = 120;
  game.player.block = 0;
  game.player.buffs = { weak: 1 };
  game.player.hand = [];
  game.player.drawPile = [{ id: 'df1' }, { id: 'df2' }];
  game.ensureEndlessState().pressure = 7;
  const matrixDefendBlockBefore = game.player.block;
  const matrixDefendHandBefore = game.player.hand.length;
  const matrixDefendOk = await battle.executeBattleCommandEffect({ id: 'resonance_matrix_order' });
  assert(matrixDefendOk === true, 'resonance matrix should execute on defend branch');
  assert(game.player.block > matrixDefendBlockBefore, 'resonance matrix defend branch should grant block');
  assert((game.player.buffs.weak || 0) === 0, 'resonance matrix defend branch should cleanse at least one debuff');
  assert(game.player.hand.length > matrixDefendHandBefore, 'resonance matrix defend branch should draw on resonance doctrine');

  // 命环共振：策略模式应可覆盖自适应结果（低血场景强制破阵）
  battle.enemies = [{
    ...makeEnemy('matrix-force-break', 176),
    block: 28,
    buffs: {},
    patterns: [
      { type: 'multiAttack', value: 9, count: 3, intent: '⚔️连斩' },
      { type: 'attack', value: 14, intent: '⚔️斩击' }
    ]
  }];
  game.player.fateRing.path = 'convergence';
  game.player.getPathDoctrineProfile = () => ({
    path: 'convergence',
    tier: 2,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  game.player.currentHp = 46;
  game.player.maxHp = 120;
  game.player.block = 0;
  game.player.buffs = {};
  game.ensureEndlessState().pressure = 8;
  const forceBreakEnemyBlockBefore = battle.enemies[0].block;
  const forceBreakPlayerBlockBefore = game.player.block;
  const forceBreakOk = await battle.executeBattleCommandEffect({ id: 'resonance_matrix_order', strategy: 'break' });
  assert(forceBreakOk === true, 'resonance matrix forced break strategy should execute');
  assert(battle.enemies[0].block < forceBreakEnemyBlockBefore, 'forced break strategy should reduce enemy block');
  assert(game.player.block === forceBreakPlayerBlockBefore, 'forced break strategy should not switch to guard branch');

  // 命环共振：反制词缀应抑制爆发伤害与回收
  battle.enemies = [makeEnemy('matrix-anti-burst', 180), makeEnemy('matrix-anti-burst-2', 168)];
  battle.enemies.forEach((enemy) => {
    enemy.__endlessAntiBurst = 1;
    enemy.__endlessAntiRefund = 1;
  });
  game.player.fateRing.path = 'convergence';
  game.player.getPathDoctrineProfile = () => ({
    path: 'convergence',
    tier: 2,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  game.player.currentHp = 104;
  game.player.maxHp = 120;
  game.player.block = 0;
  game.player.buffs = {};
  game.ensureEndlessState().pressure = 7;
  battle.commandState.points = 4;
  const antiBurstHpBefore = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  const antiBurstPointsBefore = battle.commandState.points;
  const antiBurstOk = await battle.executeBattleCommandEffect({ id: 'resonance_matrix_order', strategy: 'burst' });
  const antiBurstHpAfter = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  assert(antiBurstOk === true, 'resonance matrix burst strategy should execute under anti affix');
  assert(antiBurstHpAfter < antiBurstHpBefore, 'resonance matrix should still deal damage under anti-burst');
  assert(
    battle.commandState.points === antiBurstPointsBefore,
    'anti-refund should prevent resonance matrix burst refund'
  );

  // 裂界追猎：反制词缀应降低爆发总伤害
  battle.enemies = [makeEnemy('void-base-a', 180), makeEnemy('void-base-b', 160)];
  game.player.fateRing.path = 'convergence';
  game.player.getPathDoctrineProfile = () => ({
    path: 'convergence',
    tier: 1,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  game.player.currentHp = 112;
  game.player.maxHp = 120;
  game.ensureEndlessState().pressure = 7;
  const voidBaseHpBefore = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  await battle.executeBattleCommandEffect({ id: 'void_pursuit_order' });
  const voidBaseHpAfter = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  const voidBaseDamage = voidBaseHpBefore - voidBaseHpAfter;

  battle.enemies = [makeEnemy('void-anti-a', 180), makeEnemy('void-anti-b', 160)];
  battle.enemies.forEach((enemy) => {
    enemy.__endlessAntiBurst = 1;
  });
  game.player.currentHp = 112;
  game.ensureEndlessState().pressure = 7;
  const voidAntiHpBefore = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  await battle.executeBattleCommandEffect({ id: 'void_pursuit_order' });
  const voidAntiHpAfter = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  const voidAntiDamage = voidAntiHpBefore - voidAntiHpAfter;
  assert(voidAntiDamage < voidBaseDamage, 'anti-burst should reduce void pursuit total damage');

  // 界隙交易：反制词缀应降低回能、爆发与回收
  game.player.fateRing.path = 'convergence';
  game.player.getPathDoctrineProfile = () => ({
    path: 'convergence',
    tier: 2,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  battle.enemies = [makeEnemy('barter-base-energy', 156), makeEnemy('barter-base-energy-2', 142)];
  game.player.milkCandy = 3;
  game.player.currentEnergy = 0;
  game.player.hand = [];
  game.player.drawPile = [{ id: 'be1' }, { id: 'be2' }, { id: 'be3' }, { id: 'be4' }];
  game.ensureEndlessState().pressure = 7;
  battle.commandState.points = 4;
  const basePointsBefore = battle.commandState.points;
  const baseEnergyBefore = game.player.currentEnergy;
  const baseBarterHpBefore = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  await battle.executeBattleCommandEffect({ id: 'horizon_barter_order', mode: 'aggressive' });
  const baseEnergyGain = game.player.currentEnergy - baseEnergyBefore;
  const basePointGain = battle.commandState.points - basePointsBefore;
  const baseBarterDamage = baseBarterHpBefore - battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);

  battle.enemies = [makeEnemy('barter-anti-energy', 156), makeEnemy('barter-anti-energy-2', 142)];
  battle.enemies.forEach((enemy) => {
    enemy.__endlessAntiEnergy = 1;
    enemy.__endlessAntiBurst = 1;
    enemy.__endlessAntiRefund = 1;
  });
  game.player.milkCandy = 3;
  game.player.currentEnergy = 0;
  game.player.hand = [];
  game.player.drawPile = [{ id: 'ae1' }, { id: 'ae2' }, { id: 'ae3' }, { id: 'ae4' }];
  game.ensureEndlessState().pressure = 7;
  battle.commandState.points = 4;
  const antiEnergyBefore = game.player.currentEnergy;
  const antiBarterHpBefore = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  const antiBarterPointsBefore = battle.commandState.points;
  const antiBarterOk = await battle.executeBattleCommandEffect({ id: 'horizon_barter_order', mode: 'aggressive' });
  const antiBarterHpAfter = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  assert(antiBarterOk === true, 'horizon barter should execute under anti-energy/refund affix');
  assert(game.player.currentEnergy - antiEnergyBefore < baseEnergyGain, 'anti-energy should reduce horizon barter energy gain');
  assert(antiBarterHpBefore - antiBarterHpAfter < baseBarterDamage, 'anti-burst should reduce horizon barter damage output');
  assert(antiBarterHpAfter < antiBarterHpBefore, 'horizon barter should still deal damage under anti-burst');
  assert(
    battle.commandState.points - antiBarterPointsBefore < basePointGain,
    'anti-refund should reduce horizon barter command refund'
  );

  // 无尽专属指令：高压稳压 + 伤害 + 回收
  battle.currentTurn = 'player';
  battle.battleEnded = false;
  battle.isTurnTransitioning = false;
  battle.isProcessingCard = false;
  game.ensureEndlessState().pressure = 8;
  battle.commandState.points = battle.commandState.maxPoints;
  const beforePressure = game.ensureEndlessState().pressure;
  const beforeHp = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);

  const used = await battle.activateBattleCommand('rift_surge_order');
  assert(used === true, 'rift command should be castable in endless mode');
  const afterPressure = game.ensureEndlessState().pressure;
  const afterHp = battle.enemies.reduce((sum, enemy) => sum + (enemy.currentHp || 0), 0);
  assert(afterPressure === beforePressure - 1, 'rift command should reduce pressure by 1 at high pressure');
  assert(afterHp < beforeHp, 'rift command should damage enemies');

  // 回响路径缩短冷却
  game.player.getPathDoctrineProfile = (pathId = null) => ({
    path: String(pathId || game.player.fateRing.path || ''),
    tier: 0,
    commandCostDiscount: 0,
    commandGainBonus: 0,
    lowBlockDamageBonus: 0
  });
  game.player.fateRing.path = 'resonance';
  const resonanceGame = {
    ...game,
    player: game.player,
    _endless: { active: false, pressure: 0 },
    isEndlessActive() { return false; }
  };
  const battle2 = new Battle(resonanceGame);
  battle2.enemies = [makeEnemy('solo')];
  battle2.initializeBattleCommandSystem();
  battle2.currentTurn = 'player';
  battle2.commandState.points = battle2.commandState.maxPoints;
  const tempo2 = battle2.getBattleCommandById('tempo_order');
  if (tempo2) {
    const ok = await battle2.activateBattleCommand('tempo_order');
    assert(ok === true, 'tempo command should cast in non-endless battle');
    assert(
      tempo2.cooldownRemaining <= Math.max(0, tempo2.cooldown - 1),
      'resonance path should reduce command cooldown'
    );
  }

  console.log('Battle command synergy checks passed.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
