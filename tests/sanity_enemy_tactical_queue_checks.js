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
  mathObj.random = () => 0.28;

  const ctx = vm.createContext({
    console,
    window: {},
    Math: mathObj,
    JSON,
    Date,
    CARDS: { heartDemon: { id: 'heartDemon', name: '心魔' } },
    document: {
      querySelector: () => null,
      getElementById: () => null,
      querySelectorAll: () => []
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
  assert(typeof Battle === 'function', 'Battle should be defined');

  const game = {
    mode: 'pve',
    player: {
      realm: 12,
      currentHp: 90,
      maxHp: 120,
      block: 0,
      buffs: {},
      activeResonances: [],
      collectedLaws: []
    },
    currentBattleNode: { id: 9901, type: 'enemy', row: 1, col: 1 },
    isEndlessActive: () => false,
    ensureEncounterState: () => ({ currentStreakId: null, currentStreak: 0, themeStats: {} }),
    registerEncounterThemeStart: () => 1
  };

  const battle = new Battle(game);

  // 1) 攻击型敌人应生成有效战术队列
  const strikerEnemy = battle.createEnemyInstance({
    id: 'queue_striker',
    name: '突袭者',
    hp: 70,
    maxHp: 70,
    patterns: [
      { type: 'attack', value: 12, intent: '⚔️' },
      { type: 'multiAttack', value: 7, count: 2, intent: '⚔️连斩' },
      { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀' }
    ]
  });
  assert(!!strikerEnemy, 'createEnemyInstance should return enemy');
  assert(typeof strikerEnemy.tacticalPlanLabel === 'string' && strikerEnemy.tacticalPlanLabel.length > 0, 'enemy should have tactical plan label');
  assert(Array.isArray(strikerEnemy.tacticalQueue) && strikerEnemy.tacticalQueue.length >= 3, 'enemy should have tactical queue');

  const strikerIndexes = [];
  for (let i = 0; i < 8; i += 1) {
    const idx = battle.getNextEnemyPatternIndex(strikerEnemy);
    strikerIndexes.push(idx);
    assert(idx >= 0 && idx < strikerEnemy.patterns.length, `queue index out of range: ${idx}`);
  }
  const uniqueIndexes = new Set(strikerIndexes);
  assert(uniqueIndexes.size >= 2, 'tactical queue should provide non-trivial pattern variety');

  // 2) 防御型敌人队列前段应优先含防御动作
  const guardianEnemy = battle.createEnemyInstance({
    id: 'queue_guardian',
    name: '坚甲卫',
    hp: 88,
    maxHp: 88,
    patterns: [
      { type: 'defend', value: 12, intent: '🛡️' },
      { type: 'defend', value: 9, intent: '🛡️固守' },
      { type: 'attack', value: 8, intent: '⚔️' }
    ]
  });
  const firstIdx = battle.getNextEnemyPatternIndex(guardianEnemy);
  const firstPattern = guardianEnemy.patterns[firstIdx];
  assert(firstPattern && (firstPattern.type === 'defend' || firstPattern.type === 'heal'), 'guardian queue should open with defensive intent');

  // 3) 阶段转换后队列应刷新到新模式集
  const phaseEnemy = battle.createEnemyInstance({
    id: 'queue_phase',
    name: '异变体',
    hp: 100,
    maxHp: 100,
    patterns: [
      { type: 'attack', value: 10, intent: '⚔️' },
      { type: 'debuff', buffType: 'weak', value: 1, intent: '🌀' }
    ],
    phaseConfig: [
      {
        threshold: 0.6,
        name: '狂暴',
        patterns: [
          { type: 'multiAttack', value: 6, count: 3, intent: '⚔️狂斩' },
          { type: 'attack', value: 16, intent: '⚔️重击' }
        ]
      }
    ]
  });
  phaseEnemy.currentHp = 55;
  battle.checkPhaseChange(phaseEnemy);
  assert(phaseEnemy.currentPhase >= 1, 'phase should advance when hp below threshold');
  assert(phaseEnemy.__tacticalPatternCount === phaseEnemy.patterns.length, 'phase swap should refresh tactical pattern count');
  assert(Array.isArray(phaseEnemy.tacticalQueue) && phaseEnemy.tacticalQueue.length > 0, 'phase swap should rebuild tactical queue');

  // 4) 遭遇词条注入新行为后，战术队列应同步刷新
  battle.enemies = [{
    id: 'enc_queue',
    name: '遭遇敌',
    currentHp: 90,
    maxHp: 90,
    block: 0,
    buffs: {},
    patterns: [{ type: 'attack', value: 9, intent: '⚔️' }],
    currentPatternIndex: 0
  }];
  battle.applyEncounterThemeProfile({
    id: 'haze_ritual',
    name: '蚀雾术场',
    shortTag: '蚀雾',
    icon: '🌫️',
    description: '测试',
    tier: 'early',
    nodeType: 'enemy',
    attackMul: 1.02,
    openingBlock: 2,
    injectDebuffType: 'weak',
    injectDebuffValue: 1,
    playerOpeningBlock: 0
  });
  const encounterEnemy = battle.enemies[0];
  assert(
    encounterEnemy.__tacticalPatternCount === encounterEnemy.patterns.length,
    'encounter pattern injection should refresh tactical queue metadata'
  );
  assert(typeof encounterEnemy.tacticalPlanLabel === 'string' && encounterEnemy.tacticalPlanLabel.length > 0, 'encounter enemy should keep tactical label');

  console.log('Enemy tactical queue checks passed.');
})();
