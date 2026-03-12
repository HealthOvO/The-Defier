const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(function run() {
  const code = fs.readFileSync(path.resolve(__dirname, '../js/core/battle.js'), 'utf8');
  const logs = [];
  const ctx = vm.createContext({
    console,
    Math,
    JSON,
    Date,
    performance: { now: () => 0 },
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout: () => {},
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({
        style: {},
        className: '',
        appendChild: () => {},
        remove: () => {},
        set innerHTML(v) { this._html = v; },
        get innerHTML() { return this._html || ''; }
      }),
      body: { appendChild: () => {} }
    },
    window: {},
    global: {},
    ENEMIES: {
      banditLeader: { id: 'banditLeader' },
      demonWolf: { id: 'demonWolf' },
      mahayanaSupreme: { id: 'mahayanaSupreme' }
    },
    BOSS_MECHANICS: {
      banditLeader: { mechanics: { description: '试炼封签会持续锁住你的节奏。' }, countersBy: ['mirrorShield'] },
      demonWolf: { mechanics: { description: '试炼虹吸会吞噬你的护盾。' }, countersBy: ['wardCore'] },
      mahayanaSupreme: { mechanics: { description: '试炼映照会复诵你的最后一张牌。' }, countersBy: ['echoSilk'] }
    },
    TREASURES: {
      mirrorShield: { name: '照影镜盾' },
      wardCore: { name: '守脉核心' },
      echoSilk: { name: '寂照回音绫' }
    },
    CARDS: {
      demonDoubt: { id: 'demonDoubt', name: '心魔·疑心', type: 'curse', effects: [] }
    },
    cloneCardTemplate: (id) => ({ id, name: '心魔·疑心', type: 'curse', effects: [] }),
    Utils: {
      showBattleLog: (msg) => logs.push(String(msg || '')),
      addShakeEffect: () => {},
      addFlashEffect: () => {},
      createFloatingText: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'battle.js' });
  const Battle = vm.runInContext('Battle', ctx);
  assert(typeof Battle === 'function', 'Battle class should exist');

  const player = {
    block: 0,
    currentHp: 100,
    maxHp: 100,
    hand: [],
    discardPile: [],
    milkCandy: 3,
    currentEnergy: 3,
    addBlock(amount) {
      this.block += Math.max(0, Math.floor(Number(amount) || 0));
    },
    takeDamage(amount) {
      this.currentHp = Math.max(0, this.currentHp - Math.max(0, Math.floor(Number(amount) || 0)));
    },
    generateCardId: (() => {
      let id = 0;
      return () => `generated_${++id}`;
    })(),
    isAlive() {
      return this.currentHp > 0;
    }
  };

  const battle = new Battle({ player });
  battle.getEnemyVariationBlueprint = () => null;
  battle.refreshEnemyTacticalPlan = () => {};
  battle.markUIDirty = () => {};
  battle.clearEventListeners = () => {};
  battle.endTargetingMode = () => {};
  battle.emit = () => {};

  const createBoss = (id, memoryName) => battle.createEnemyInstance({
    id,
    name: memoryName,
    isBoss: true,
    maxHp: 100,
    patterns: [{ type: 'attack', value: 10, intent: '⚔️' }],
    phaseConfig: [
      { threshold: 0.68, name: '对抗试炼', heal: 0.05, patterns: [{ type: 'attack', value: 14, intent: '⚔️对抗' }] },
      { threshold: 0.34, name: '逆转试炼', heal: 0.1, patterns: [{ type: 'attack', value: 20, intent: '⚔️逆转' }] }
    ]
  });

  // 1) 创建时自动挂接三幕式状态
  const sealBoss = createBoss('banditLeader', '封签试体');
  assert(sealBoss && sealBoss.bossActState, 'boss should initialize three-act state during creation');
  assert(Array.isArray(sealBoss.bossActState.acts) && sealBoss.bossActState.acts.length === 3, 'boss should expose 3 acts');
  assert(sealBoss.currentBossAct === 0, 'boss should start at act 0');

  // 2) 血线跨阈值时应进入后续幕并替换行动模式
  battle.enemies = [sealBoss];
  sealBoss.currentHp = Math.floor(sealBoss.maxHp * 0.62);
  battle.checkBossThreeActTransition(sealBoss);
  assert(sealBoss.currentBossAct === 1, `boss should transition to act 1, got ${sealBoss.currentBossAct}`);
  assert(sealBoss.patterns[0].value === 14, `act 2 patterns should apply, got ${sealBoss.patterns[0].value}`);
  sealBoss.currentHp = Math.floor(sealBoss.maxHp * 0.28);
  battle.checkBossThreeActTransition(sealBoss);
  assert(sealBoss.currentBossAct === 2, `boss should transition to act 2, got ${sealBoss.currentBossAct}`);
  assert(sealBoss.patterns[0].value === 20, `act 3 patterns should apply, got ${sealBoss.patterns[0].value}`);

  // 3) seal_card 应锁定手牌，并在打出时追加反噬与诅咒
  player.currentHp = 100;
  player.hand = [
    { id: 'strike_a', name: '裂斩', type: 'attack', cost: 1, effects: [] },
    { id: 'guard_a', name: '归元', type: 'defense', cost: 1, effects: [] }
  ];
  player.discardPile = [];
  sealBoss.currentBossAct = 0;
  sealBoss.bossActState.currentActIndex = 0;
  battle.turnNumber = 1;
  battle.processBossThreeActPlayerTurnStart(sealBoss);
  const sealedCard = player.hand.find((card) => card.__bossSealed);
  assert(sealedCard, 'seal_card memory should mark one hand card');
  battle.handleBossSealedCardPlayed(sealedCard);
  assert(player.currentHp === 96, `sealed card backlash should deal 4 damage, got hp ${player.currentHp}`);
  assert(player.discardPile.some((card) => card.id === 'demonDoubt'), 'sealed card backlash should add demonDoubt to discard');

  // 4) siphon_block 应虹吸首次护盾并治疗 Boss
  const siphonBoss = createBoss('demonWolf', '虹吸试体');
  battle.enemies = [siphonBoss];
  battle.turnNumber = 2;
  siphonBoss.currentHp = 120;
  siphonBoss.maxHp = 160;
  player.block = 0;
  battle.installBattlePlayerHooks();
  player.addBlock(10);
  battle.restoreBattlePlayerHooks();
  assert(player.block === 6, `siphon_block should leave 6 block after siphoning 4, got ${player.block}`);
  assert(siphonBoss.currentHp === 124, `siphon_block should heal boss by 4, got ${siphonBoss.currentHp}`);

  // 5) echo_last_card 应在敌回合开始复制上一张牌的类型收益
  const echoBoss = createBoss('mahayanaSupreme', '映照试体');
  battle.enemies = [echoBoss];
  battle.turnNumber = 3;
  battle.lastPlayerCardSnapshot = { id: 'slash_last', name: '斩空', type: 'attack' };
  battle.processBossThreeActEnemyTurnStart(echoBoss);
  assert((echoBoss.buffs.strength || 0) >= 1, `echo_last_card should grant strength, got ${echoBoss.buffs.strength || 0}`);

  console.log('Boss three-act checks passed.');
})();
