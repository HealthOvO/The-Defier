const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(function run() {
  const code = fs.readFileSync(path.resolve(__dirname, '../js/game.js'), 'utf8');

  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date,
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null
    },
    Utils: {
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'game.js' });
  const Game = vm.runInContext('Game', ctx);
  assert(typeof Game === 'function', 'Game class should exist');

  const harness = {
    featureFlags: { endlessModeV1: true },
    unlockedRealms: [1, 2, 3, 4, 5, 6, 7, 8],
    endlessState: null,
    player: {
      maxRealmReached: 8
    }
  };
  [
    'createDefaultEndlessState',
    'normalizeEndlessState',
    'ensureEndlessState',
    'isEndlessUnlocked',
    'isEndlessActive',
    'getEndlessMutatorPool',
    'getEndlessPhaseProfile',
    'getEndlessCycleThemeProfile',
    'getEndlessSeasonCatalog',
    'getEndlessWeekMeta',
    'getEndlessSeasonProfile',
    'syncEndlessSeasonState',
    'getEndlessModifiers',
    'getEndlessEventTuning',
    'getEndlessPressureBehaviorProfile',
    'buildEndlessPressurePatternVariant',
    'prepareEnemyForEndlessBattle'
  ].forEach((name) => {
    harness[name] = Game.prototype[name];
  });

  harness.endlessState = harness.createDefaultEndlessState();
  harness.endlessState.unlocked = true;
  harness.endlessState.active = true;
  harness.endlessState.activeMutators = [];
  harness.endlessState.pressure = 4;
  harness.syncEndlessSeasonState({ cycleOverride: 2, dateOverride: '2026-03-16T00:00:00.000Z' });

  // 1) 相位映射：3/6/9/12 轮触发阶段挑战
  const phase3 = harness.getEndlessPhaseProfile(2);
  const phase6 = harness.getEndlessPhaseProfile(5);
  const phase9 = harness.getEndlessPhaseProfile(8);
  const phase12 = harness.getEndlessPhaseProfile(11);
  assert(phase3.active && phase3.checkpoint === 3, `cycle=2 should map to checkpoint 3, got ${phase3.checkpoint}`);
  assert(phase6.active && phase6.checkpoint === 6, `cycle=5 should map to checkpoint 6, got ${phase6.checkpoint}`);
  assert(phase9.active && phase9.checkpoint === 9, `cycle=8 should map to checkpoint 9, got ${phase9.checkpoint}`);
  assert(phase12.active && phase12.checkpoint === 12, `cycle=11 should map to checkpoint 12, got ${phase12.checkpoint}`);

  // 2) 阶段挑战应提升无尽修饰器
  harness.endlessState.currentCycle = 1; // loopIndex=2, no phase
  const modsNoPhase = harness.getEndlessModifiers();
  harness.endlessState.currentCycle = 2; // loopIndex=3, phase_surge
  const modsPhase = harness.getEndlessModifiers();
  assert(modsPhase.enemyAtkMul > modsNoPhase.enemyAtkMul, 'phase challenge should increase enemy attack multiplier');
  assert(modsPhase.rewardExpMul > modsNoPhase.rewardExpMul, 'phase challenge should increase reward exp multiplier');
  assert(modsPhase.endlessSeason && modsPhase.endlessSeason.id, 'endless modifiers should include season metadata');
  assert(modsPhase.endlessSeason && modsPhase.endlessSeason.directiveId, 'endless modifiers should include season directive metadata');

  // 3) phase apex 下 Boss 应获得专属词缀行为
  harness.endlessState.currentCycle = 11; // loopIndex=12 -> apex
  harness.endlessState.pressure = 4;
  const boss = {
    id: 'phase_boss_probe',
    name: '相位测试体',
    isBoss: true,
    hp: 120,
    maxHp: 120,
    currentHp: 120,
    block: 0,
    buffs: {},
    patterns: [
      { type: 'attack', value: 12, intent: '⚔️' },
      { type: 'defend', value: 10, intent: '🛡️' }
    ]
  };
  const scaledBoss = harness.prepareEnemyForEndlessBattle(boss, harness.getEndlessModifiers());
  assert(scaledBoss && scaledBoss.__endlessScaled === true, 'phase-scaled boss should be marked');
  assert(scaledBoss.__endlessBossAffix === 'apex', `expected apex boss affix, got ${scaledBoss.__endlessBossAffix}`);
  assert(
    scaledBoss.__endlessPhaseProfile && scaledBoss.__endlessPhaseProfile.checkpoint === 12,
    'scaled boss should carry phase checkpoint metadata'
  );
  assert(
    scaledBoss.__endlessCycleTheme && scaledBoss.__endlessCycleTheme.segmentIndex >= 1,
    'scaled boss should carry endless cycle theme metadata'
  );
  assert(
    Array.isArray(scaledBoss.patterns) &&
      scaledBoss.patterns.some((p) => p && p.type === 'multiAttack' && (p.intent || '').includes('终压')),
    'apex phase boss should gain terminal multi-attack pattern'
  );
  assert(
    scaledBoss.patterns.some((p) => p && p.type === 'debuff' && p.buffType === 'vulnerable'),
    'apex phase boss should gain vulnerable debuff pattern'
  );

  // 4) 高相位应反映到行为画像与赐福调参
  const profile = harness.getEndlessPressureBehaviorProfile();
  assert(profile.phaseCheckpoint === 12, `pressure profile should expose phase checkpoint 12, got ${profile.phaseCheckpoint}`);
  assert(typeof profile.seasonId === 'string' && profile.seasonId.length > 0, 'pressure profile should expose season id');
  assert(typeof profile.seasonDirectiveName === 'string' && profile.seasonDirectiveName.length > 0, 'pressure profile should expose season directive name');
  const tuning = harness.getEndlessEventTuning();
  assert(tuning.boonRareBonusRate > 0.02, `phase tuning should boost rare boon rate, got ${tuning.boonRareBonusRate}`);

  console.log('Endless phase boss checks passed.');
})();
