const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertEndlessDangerProfile(profile, label = 'danger profile') {
  assert(profile && typeof profile === 'object', `${label} should exist`);
  assert(Number.isFinite(Number(profile.index)), `${label} should expose numeric index`);
  assert(typeof profile.tierId === 'string' && profile.tierId.length > 0, `${label} should expose tierId`);
  assert(typeof profile.tierLabel === 'string' && profile.tierLabel.length > 0, `${label} should expose tierLabel`);
  assert(typeof profile.dominantAxisId === 'string' && profile.dominantAxisId.length > 0, `${label} should expose dominantAxisId`);
  assert(typeof profile.dominantAxisLabel === 'string' && profile.dominantAxisLabel.length > 0, `${label} should expose dominantAxisLabel`);
  assert(typeof profile.summary === 'string' && profile.summary.length > 0, `${label} should expose summary`);
  assert(typeof profile.counterplay === 'string' && profile.counterplay.length > 0, `${label} should expose counterplay`);
  assert(typeof profile.reserveGuidance === 'string' && profile.reserveGuidance.length > 0, `${label} should expose reserveGuidance`);
  assert(typeof profile.line === 'string' && /DRI/.test(profile.line), `${label} should expose DRI line`);
  assert(Array.isArray(profile.axes) && profile.axes.length === 4, `${label} should expose four axes`);

  const axisIds = profile.axes.map((axis) => axis && axis.id);
  ['burst', 'attrition', 'control', 'execution'].forEach((axisId) => {
    assert(axisIds.includes(axisId), `${label} should include ${axisId} axis`);
  });
  profile.axes.forEach((axis) => {
    assert(axis && typeof axis === 'object', `${label} axis should be object`);
    assert(typeof axis.label === 'string' && axis.label.length > 0, `${label} axis ${axis && axis.id} should expose label`);
    assert(Number.isFinite(Number(axis.value)) && Number(axis.value) >= 0 && Number(axis.value) <= 100, `${label} axis ${axis && axis.id} should clamp value`);
  });
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
    },
    getRandomCard: () => ({
      id: 'mockRare',
      name: 'Mock Rare',
      rarity: 'rare',
      cost: 1
    })
  });
  ctx.window = ctx;
  ctx.global = ctx;

  vm.runInContext(code, ctx, { filename: 'game.js' });
  const Game = vm.runInContext('Game', ctx);
  assert(typeof Game === 'function', 'Game class should exist');

  const defaults = Game.prototype.createDefaultEndlessState.call({});
  assert(defaults && defaults.active === false, 'default endless state should be inactive');
  assert(defaults.currentCycle === 0, 'default cycle should be 0');
  assert(defaults.pressure === 0, 'default pressure should be 0');
  assert(Array.isArray(defaults.activeParanoiaBurdens) && defaults.activeParanoiaBurdens.length === 0, 'default paranoia burdens should exist');
  assert(Array.isArray(defaults.activeParanoiaBoons) && defaults.activeParanoiaBoons.length === 0, 'default paranoia boons should exist');
  assert(defaults.boonStats && defaults.boonStats.rewardGoldMul === 0, 'default boon stats should exist');
  assert(defaults.seasonId === null, 'default season id should initialize as null');
  assert(defaults.seasonWeekTag === '', 'default season week tag should initialize as empty');
  assert(defaults.seasonScore === 0, 'default season score should initialize as 0');
  assert(defaults.seasonArchive && typeof defaults.seasonArchive === 'object', 'default season archive should exist');
  assert(defaults.seasonDirectiveSelection && defaults.seasonDirectiveSelection.source === 'auto', 'default season directive selection should initialize as auto');
  assert(defaults.seasonDirectiveClearCounts && typeof defaults.seasonDirectiveClearCounts === 'object', 'default directive clear counts should exist');
  assert(defaults.seasonCollapseStats && typeof defaults.seasonCollapseStats === 'object', 'default collapse stats should exist');

  function createHarness() {
    const calls = {
      mapGenerate: 0,
      showScreen: 0,
      autoSave: 0,
      awardEssence: 0,
      renderTreasures: 0
    };

    const harness = {
      featureFlags: { endlessModeV1: true },
      unlockedRealms: [1, 2, 3, 4, 5, 6, 7],
      endlessState: null,
      player: {
        maxRealmReached: 7,
        realm: 6,
        floor: 0,
        maxHp: 100,
        currentHp: 60,
        gold: 80,
        characterId: 'linFeng',
        isReplay: false,
        isRecultivation: false,
        heal(amount) {
          this.currentHp = Math.min(this.maxHp, this.currentHp + Math.max(0, Math.floor(amount || 0)));
        },
        addCardToDeck(card) {
          this.deck = Array.isArray(this.deck) ? this.deck : [];
          this.deck.push(card);
        },
        fateRing: {
          level: 0,
          exp: 0,
          gainExp(amount) {
            this.exp += Math.max(0, Math.floor(amount || 0));
            if (this.exp >= 100) this.level = Math.max(this.level, 1);
          }
        },
        checkSkillUnlock() {}
      },
      map: {
        getRealmName: (realm) => `Realm-${realm}`,
        generate(realm) {
          calls.mapGenerate += 1;
          this.lastRealm = realm;
        }
      },
      showScreen() {
        calls.showScreen += 1;
      },
      autoSave() {
        calls.autoSave += 1;
      },
      awardLegacyEssence() {
        calls.awardEssence += 1;
        return 1;
      },
      renderTreasures() {
        calls.renderTreasures += 1;
      }
    };

    [
      'createDefaultEndlessState',
      'normalizeEndlessState',
      'ensureEndlessState',
      'isEndlessUnlocked',
      'isEndlessActive',
      'getMapCacheKey',
      'getEndlessRealmForCycle',
      'getDisplayRealmName',
      'getEndlessMutatorPool',
      'rollNextEndlessMutator',
      'getEndlessParanoiaBurdenPool',
      'getEndlessParanoiaBoonPool',
      'getEndlessParanoiaEffects',
      'getEndlessParanoiaTreasureSlotBonus',
      'getEndlessParanoiaHandLimitPenalty',
      'getEndlessParanoiaEliteMutatorId',
      'getEndlessActiveMutatorIds',
      'getEndlessParanoiaChoices',
      'grantEndlessParanoiaBoonImmediate',
      'applyEndlessParanoiaChoice',
      'showEndlessParanoiaSelection',
      'getEndlessPhaseProfile',
      'getEndlessCycleThemeProfile',
      'getEndlessSeasonCatalog',
      'getEndlessSeasonCollapseCatalog',
      'getEndlessSeasonDirectiveRiskScore',
      'getEndlessSeasonProgressSnapshot',
      'getEndlessSeasonGoals',
      'persistEndlessSeasonLedger',
      'getEndlessWeekMeta',
      'getEndlessSeasonProfile',
      'syncEndlessSeasonState',
      'setEndlessSeasonDirective',
      'getEndlessCollapseAnalysis',
      'recordEndlessSeasonCollapse',
      'getEndlessModifiers',
      'getEndlessHealingMultiplier',
      'getEndlessEventTuning',
      'getEndlessMapConfig',
      'getEndlessPressureBehaviorProfile',
      'getEndlessDangerProfile',
      'buildEndlessPressurePatternVariant',
      'getEndlessBoonPool',
      'getEndlessBoonChoices',
      'applyEndlessBoon',
      'showEndlessBoonSelection',
      'prepareEnemyForEndlessBattle',
      'startEndlessMode',
      'handleEndlessRealmComplete'
    ].forEach((name) => {
      harness[name] = Game.prototype[name];
    });

    return { harness, calls };
  }

  // 归一化与解锁判定
  {
    const { harness } = createHarness();
    const normalized = harness.normalizeEndlessState({
      unlocked: false,
      active: true,
      currentCycle: '4.7',
      clearedCycles: -2,
      pressure: 99,
      activeMutators: ['iron_wall', 1, null],
      boonStats: { rewardGoldMul: '0.2', healMul: '-10' }
    });
    assert(normalized.unlocked === true, 'normalize should auto-unlock endless when progression >= 6');
    assert(normalized.active === true, 'normalize should keep active when unlocked');
    assert(normalized.currentCycle === 4, 'cycle should floor to integer');
    assert(normalized.clearedCycles === 0, 'clearedCycles should clamp at 0');
    assert(normalized.pressure === 9, 'pressure should clamp in [0,9]');
    assert(Array.isArray(normalized.activeMutators) && normalized.activeMutators.length === 1, 'mutator ids should be sanitized');
    assert(Array.isArray(normalized.activeParanoiaBurdens) && normalized.activeParanoiaBurdens.length === 0, 'paranoia burdens should sanitize to empty');
    assert(Array.isArray(normalized.activeParanoiaBoons) && normalized.activeParanoiaBoons.length === 0, 'paranoia boons should sanitize to empty');
    assert(normalized.boonStats.rewardGoldMul > 0, 'boon rewardGoldMul should parse numeric');
    assert(normalized.boonStats.healMul === 0, 'boon healMul should clamp at 0');
    assert(typeof normalized.seasonWeekTag === 'string', 'seasonWeekTag should sanitize to string');
    assert(normalized.seasonScore >= 0, 'seasonScore should sanitize to non-negative');
    assert(normalized.seasonArchive && typeof normalized.seasonArchive === 'object', 'seasonArchive should sanitize to object');
  }

  // 轮次映射
  {
    const { harness } = createHarness();
    assert(harness.getEndlessRealmForCycle(0) === 6, 'cycle 0 should map to realm 6');
    assert(harness.getEndlessRealmForCycle(12) === 18, 'cycle 12 should map to realm 18');
    assert(harness.getEndlessRealmForCycle(13) === 6, 'cycle 13 should loop back to realm 6');
  }

  // 轮段主题映射
  {
    const { harness } = createHarness();
    harness.endlessState = harness.createDefaultEndlessState();
    harness.endlessState.unlocked = true;
    harness.endlessState.active = true;

    const seen = new Set();
    for (let cycle = 0; cycle < 10; cycle += 1) {
      const profile = harness.getEndlessCycleThemeProfile(cycle);
      assert(profile && typeof profile === 'object', `cycle theme profile should exist at cycle=${cycle}`);
      assert(Number(profile.segmentIndex) >= 1 && Number(profile.segmentIndex) <= 5, `segment index should be [1,5], got ${profile.segmentIndex}`);
      assert(typeof profile.enemyDirective === 'string' && profile.enemyDirective.length > 0, 'cycle theme should expose directive');
      seen.add(profile.id);
    }
    assert(seen.size >= 5, `cycle theme should rotate through >=5 themes, got ${seen.size}`);
  }

  // 赛季映射与账本归档
  {
    const { harness } = createHarness();
    harness.endlessState = harness.createDefaultEndlessState();
    harness.endlessState.unlocked = true;
    harness.endlessState.active = true;
    harness.endlessState.currentCycle = 4;

    const seasonA = harness.getEndlessSeasonProfile(4, '2026-03-16T00:00:00.000Z');
    assert(seasonA && typeof seasonA === 'object', 'season profile should be generated');
    assert(typeof seasonA.id === 'string' && seasonA.id.length > 0, 'season profile should include id');
    assert(typeof seasonA.directiveId === 'string' && seasonA.directiveId.length > 0, 'season profile should include directive id');
    assert(/^20\d{2}-W\d{2}$/.test(seasonA.weekTag || ''), `season profile should include ISO week tag, got ${seasonA.weekTag}`);
    assert(Array.isArray(seasonA.directiveChoices) && seasonA.directiveChoices.length >= 3, 'season profile should expose selectable directive choices');
    assert(Array.isArray(seasonA.goals) && seasonA.goals.length === 3, 'season profile should expose three-tier season goals');
    assert(typeof seasonA.directiveRiskLabel === 'string' && seasonA.directiveRiskLabel.length > 0, 'season profile should expose active directive risk label');

    const syncedA = harness.syncEndlessSeasonState({
      cycleOverride: 4,
      dateOverride: '2026-03-16T00:00:00.000Z',
      cycleDelta: 2,
      bossDelta: 1,
      scoreDelta: 320,
      bestCycle: 7,
      directiveClearId: seasonA.directiveId
    });
    const stateAfterA = harness.ensureEndlessState();
    assert(syncedA && syncedA.id === seasonA.id, 'sync should return active season profile');
    assert(stateAfterA.seasonId === seasonA.id, 'sync should persist season id');
    assert(stateAfterA.seasonCycleClears >= 2, `sync should accumulate season clears, got ${stateAfterA.seasonCycleClears}`);
    assert(stateAfterA.seasonBossDefeated >= 1, `sync should accumulate season bosses, got ${stateAfterA.seasonBossDefeated}`);
    assert(stateAfterA.seasonScore >= 320, `sync should accumulate season score, got ${stateAfterA.seasonScore}`);
    assert((stateAfterA.seasonDirectiveClearCounts?.[seasonA.directiveId] || 0) >= 2, 'sync should track directive-based clear counts');

    const seasonB = harness.syncEndlessSeasonState({
      cycleOverride: 4,
      dateOverride: '2026-03-23T00:00:00.000Z'
    });
    const stateAfterB = harness.ensureEndlessState();
    const archiveKeys = Object.keys(stateAfterB.seasonArchive || {});
    assert(seasonB && seasonB.weekTag !== seasonA.weekTag, 'cross-week sync should rotate season week tag');
    assert(stateAfterB.seasonWeekTag === seasonB.weekTag, 'sync should persist latest week tag');
    assert(archiveKeys.length >= 1, 'cross-week sync should preserve season archive snapshots');
  }

  // 季签切换 + 高风险目标链
  {
    const { harness } = createHarness();
    harness.endlessState = harness.createDefaultEndlessState();
    harness.endlessState.unlocked = true;
    harness.endlessState.active = true;
    harness.endlessState.currentCycle = 6;

    const season = harness.getEndlessSeasonProfile(6);
    const volatileDirective = season.directiveChoices.find((item) => item.riskTier === 'volatile') || season.directiveChoices[0];
    const selected = harness.setEndlessSeasonDirective(volatileDirective.id);
    const selectionState = harness.ensureEndlessState();

    assert(selected && selected.directiveId === volatileDirective.id, 'directive selection should switch active directive');
    assert(selectionState.seasonDirectiveSelection && selectionState.seasonDirectiveSelection.directiveId === volatileDirective.id, 'directive selection should persist into endless state');
    assert(selected.activeDirectiveSource === 'player', 'directive selection should mark player override source');

    harness.syncEndlessSeasonState({
      cycleOverride: 6,
      cycleDelta: 2,
      bossDelta: 1,
      scoreDelta: 960,
      bestCycle: 10,
      directiveClearId: volatileDirective.id
    });
    const updated = harness.getEndlessSeasonProfile(6);
    const extremeGoal = updated.goals.find((goal) => goal.tier === 'extreme');
    assert(extremeGoal && /激进季签/.test(extremeGoal.progressText || ''), 'extreme season goal should track risky directive clears');
    assert(updated.directiveChoices.some((item) => item.id === volatileDirective.id && item.selected), 'active directive choice should be reflected in profile choices');
  }

  // 无尽 DRI 同轴画像
  {
    const { harness } = createHarness();
    harness.endlessState = harness.createDefaultEndlessState();
    harness.endlessState.unlocked = true;
    harness.endlessState.active = true;
    harness.endlessState.currentCycle = 6;
    harness.endlessState.pressure = 2;

    const baseline = harness.getEndlessDangerProfile(6);
    assertEndlessDangerProfile(baseline, 'baseline endless danger profile');

    const season = harness.getEndlessSeasonProfile(6);
    const volatileDirective = season.directiveChoices.find((item) => item.riskTier === 'volatile') || season.directiveChoices[0];
    harness.setEndlessSeasonDirective(volatileDirective.id);
    const volatileProfile = harness.getEndlessDangerProfile(6);
    assertEndlessDangerProfile(volatileProfile, 'volatile endless danger profile');
    assert(
      volatileProfile.index !== baseline.index ||
        volatileProfile.dominantAxisId !== baseline.dominantAxisId ||
        volatileProfile.summary !== baseline.summary ||
        volatileProfile.counterplay !== baseline.counterplay,
      `volatile directive should affect endless danger profile, baseline=${JSON.stringify(baseline)}, volatile=${JSON.stringify(volatileProfile)}`
    );

    harness.endlessState.pressure = 8;
    harness.endlessState.paranoiaLevel = 1;
    harness.endlessState.seasonCollapseStats = {
      pressure_overload: 2,
      sustain_break: 1,
      mechanic_check: 1
    };
    const highPressureProfile = harness.getEndlessDangerProfile(6);
    assertEndlessDangerProfile(highPressureProfile, 'high pressure endless danger profile');
    assert(
      highPressureProfile.index >= volatileProfile.index,
      `high pressure state should not lower danger index, volatile=${volatileProfile.index}, high=${highPressureProfile.index}`
    );
    assert(
      highPressureProfile.summary !== volatileProfile.summary ||
        highPressureProfile.counterplay !== volatileProfile.counterplay ||
        highPressureProfile.dominantAxisId !== volatileProfile.dominantAxisId,
      'high pressure / collapse state should further reshape endless danger profile messaging'
    );
  }

  // 崩盘账本统计
  {
    const { harness } = createHarness();
    harness.endlessState = harness.createDefaultEndlessState();
    harness.endlessState.unlocked = true;
    harness.endlessState.active = true;
    harness.endlessState.currentCycle = 9;
    harness.endlessState.pressure = 8;
    harness.player.currentHp = 1;

    const collapse = harness.recordEndlessSeasonCollapse();
    const state = harness.ensureEndlessState();
    const season = harness.getEndlessSeasonProfile(9);

    assert(collapse && collapse.id === 'pressure_overload', `high pressure collapse should prefer pressure_overload, got ${collapse ? collapse.id : 'null'}`);
    assert((state.seasonCollapseStats?.pressure_overload || 0) >= 1, 'collapse stats should increment within endless state');
    assert(state.lastSeasonCollapse && state.lastSeasonCollapse.label === collapse.label, 'last collapse should be stored for UI replay');
    assert(Array.isArray(season.collapseSummary) && season.collapseSummary.some((item) => item.id === 'pressure_overload'), 'season profile should expose collapse summary for UI');
  }

  // 词缀轮换 + 修饰器合并
  {
    const { harness } = createHarness();
    harness.endlessState = harness.createDefaultEndlessState();
    harness.endlessState.unlocked = true;
    harness.endlessState.active = true;
    harness.endlessState.currentCycle = 5;
    harness.endlessState.pressure = 5;
    for (let i = 0; i < 6; i += 1) {
      harness.rollNextEndlessMutator();
    }
    assert(harness.endlessState.activeMutators.length <= 3, 'active mutators should cap at 3');

    harness.endlessState.boonStats.rewardGoldMul = 0.2;
    harness.endlessState.boonStats.shopDiscountMul = 0.12;
    const modifiers = harness.getEndlessModifiers();
    assert(modifiers.enemyHpMul >= 1.1, 'enemy hp multiplier should scale with cycle');
    assert(modifiers.enemyAtkMul >= 1.05, 'enemy atk multiplier should scale with cycle');
    assert(modifiers.rewardGoldMul > 1.1, 'gold multiplier should include cycle/boon gain');
    assert(modifiers.shopPriceMul > 0.74, 'shop multiplier should remain in safe range');
    assert(modifiers.healMul >= 0.45 && modifiers.healMul <= 1.35, 'heal multiplier should be clamped');
    assert(modifiers.enemyHpMul > 1.3, 'pressure should contribute to enemy hp scaling');
    assert(modifiers.cycleTheme && modifiers.cycleTheme.id, 'endless modifiers should expose active cycle theme metadata');
    assert(modifiers.endlessSeason && modifiers.endlessSeason.id, 'endless modifiers should expose active season metadata');
    assert(modifiers.endlessSeason && modifiers.endlessSeason.directiveId, 'endless modifiers should expose active season directive metadata');

    const profile = harness.getEndlessPressureBehaviorProfile();
    assert(profile && profile.tierId === 'tense', `pressure profile tier should match pressure=5, got ${profile ? profile.tierId : 'null'}`);
    assert(profile.enemyOpeningBlock >= 6, 'pressure profile should grant opening block at mid pressure');
    assert(profile.extraAttackPatterns >= 1, 'pressure profile should add extra attack patterns at mid pressure');
    assert(profile.themeId && profile.themeSegmentIndex >= 1, 'pressure profile should expose theme metadata');
    assert(typeof profile.seasonId === 'string' && profile.seasonId.length > 0, 'pressure profile should expose season id');
    assert(typeof profile.seasonDirectiveId === 'string' && profile.seasonDirectiveId.length > 0, 'pressure profile should expose season directive id');

    const dangerProfile = harness.getEndlessDangerProfile();
    assertEndlessDangerProfile(dangerProfile, 'modifier-linked endless danger profile');
  }

  // 事件联动调参
  {
    const { harness } = createHarness();
    harness.endlessState = harness.createDefaultEndlessState();
    harness.endlessState.unlocked = true;
    harness.endlessState.active = true;
    harness.endlessState.activeMutators = ['war_market', 'trial_inferno', 'void_tax'];
    harness.endlessState.pressure = 8;
    const tuning = harness.getEndlessEventTuning();
    assert(tuning.tempShopOfferBonus >= 1, 'event tuning should increase temporary shop offer count');
    assert(tuning.tempShopPriceMul < 1, 'event tuning should allow temporary shop price mitigation');
    assert(tuning.forceRelief === true, 'event tuning should force relief under void_tax');
    assert(tuning.trialRewardMul > 1, 'event tuning should boost trial reward multiplier');
    assert(tuning.ringExpFlat > 0, 'event tuning should add ringExp bonus');
    assert(tuning.forceRareBoonChoice === true, 'event tuning should force rare boon choice at high pressure');
    assert(tuning.boonRareBonusRate > 0.1, 'event tuning should boost rare boon rate under high pressure');

    const profile = harness.getEndlessPressureBehaviorProfile();
    assert(profile.tierId === 'cataclysm', 'pressure=8 should map to cataclysm pressure behavior tier');
    assert(profile.enemyOpeningStrength >= 2, 'high pressure should grant stronger opening strength');
    assert(profile.extraAttackPatterns >= 2, 'high pressure should add multiple extra attack patterns');
    assert(profile.injectDebuffPattern === true, 'high pressure should inject debuff pattern');
  }

  // 高压力敌人行为注入
  {
    const { harness } = createHarness();
    harness.endlessState = harness.createDefaultEndlessState();
    harness.endlessState.unlocked = true;
    harness.endlessState.active = true;
    harness.endlessState.currentCycle = 7;
    harness.endlessState.pressure = 8;

    const enemy = {
      id: 'mockEndlessEnemy',
      name: 'Mock Endless Enemy',
      maxHp: 100,
      currentHp: 100,
      block: 0,
      patterns: [
        { type: 'attack', value: 10, intent: '⚔️' },
        { type: 'defend', value: 8, intent: '🛡️' }
      ],
      buffs: {}
    };

    const scaled = harness.prepareEnemyForEndlessBattle(enemy, harness.getEndlessModifiers());
    assert(scaled && scaled.__endlessScaled === true, 'scaled enemy should be marked as endless-scaled');
    assert((scaled.block || 0) >= 14, `high pressure should enforce opening block, got ${scaled.block}`);
    assert((scaled.buffs?.strength || 0) >= 2, `high pressure should inject opening strength, got ${scaled.buffs?.strength}`);
    assert(Array.isArray(scaled.patterns) && scaled.patterns.length >= 4, 'high pressure should append extra pressure patterns');
    assert(
      scaled.patterns.some((p) => p && p.type === 'debuff' && (p.buffType === 'weak' || p.buffType === 'vulnerable')),
      'high pressure should append a pressure debuff pattern'
    );
    assert(
      scaled.patterns.some((p) => p && p.type === 'multiAttack' && (p.intent || '').includes('压')),
      'high pressure should append pressure-flavored multi attack'
    );
  }

  // 赐福应用
  {
    const { harness } = createHarness();
    harness.endlessState = harness.createDefaultEndlessState();
    harness.endlessState.unlocked = true;
    harness.endlessState.active = true;

    const preMaxHp = harness.player.maxHp;
    const merchant = harness.applyEndlessBoon('merchant_seal');
    assert(merchant && merchant.id === 'merchant_seal', 'merchant boon should apply');
    assert(harness.endlessState.boonStats.shopDiscountMul > 0, 'merchant boon should add shop discount');

    const vitality = harness.applyEndlessBoon('vitality_root');
    assert(vitality && vitality.id === 'vitality_root', 'vitality boon should apply');
    assert(harness.player.maxHp > preMaxHp, 'vitality boon should increase max hp');

    const cache = harness.applyEndlessBoon('fortune_cache');
    assert(cache && cache.id === 'fortune_cache', 'fortune boon should apply');
    assert(harness.player.gold > 80, 'fortune boon should grant gold');

    // 连续普通赐福后，应触发稀有保底候选
    harness.endlessState.boonRarePity = 2;
    harness.endlessState.boonRareGuaranteedEvery = 3;
    const choices = harness.getEndlessBoonChoices();
    assert(Array.isArray(choices) && choices.length >= 1, 'boon choices should be returned');
    assert(choices.some((boon) => boon.rarity === 'rare'), 'rare pity should inject at least one rare boon choice');

    const rareBoon = choices.find((boon) => boon.rarity === 'rare');
    if (rareBoon) {
      harness.applyEndlessBoon(rareBoon.id);
      assert(harness.endlessState.boonRarePity === 0, 'selecting rare boon should reset rare pity');
    }

    harness.endlessState.boonRarePity = 0;
    harness.endlessState.pressure = 8;
    const pressureChoices = harness.getEndlessBoonChoices();
    assert(
      pressureChoices.some((boon) => boon.rarity === 'rare'),
      'high pressure should force at least one rare boon choice'
    );
  }

  // 轮回偏执系统
  {
    const { harness } = createHarness();
    harness.endlessState = harness.createDefaultEndlessState();
    harness.endlessState.unlocked = true;
    harness.endlessState.active = true;
    harness.endlessState.currentCycle = 12;
    harness.currentBattleNode = { type: 'elite' };

    const choices = harness.getEndlessParanoiaChoices();
    assert(Array.isArray(choices) && choices.length === 3, 'paranoia choices should offer three options');
    assert(choices.every((choice) => choice && choice.burden && choice.boon), 'paranoia choices should include burden and boon');

    const eliteChoice = choices.find((choice) => choice.burdenId === 'elite_echo') || choices[0];
    const applied = harness.applyEndlessParanoiaChoice(eliteChoice, 13);
    assert(applied && applied.burdenId && applied.boonId, 'paranoia choice should apply one burden and one boon');
    assert(harness.endlessState.paranoiaHistory.length === 1, 'paranoia history should append after apply');
    assert(harness.endlessState.lastParanoiaCycle === 13, 'last paranoia cycle should record applied cycle');

    const effects = harness.getEndlessParanoiaEffects();
    assert(effects.activeBurdenIds.length >= 1, 'paranoia effects should expose active burden ids');
    if (applied.burdenId === 'elite_echo') {
      const activeMutatorIds = harness.getEndlessActiveMutatorIds();
      assert(activeMutatorIds.length >= harness.endlessState.activeMutators.length, 'elite paranoia should contribute transient mutator ids');
      assert(effects.eliteExtraMutator === true, 'elite paranoia should toggle extra mutator flag');
    }
    if (applied.boonId === 'vault_slot') {
      assert(harness.getEndlessParanoiaTreasureSlotBonus() >= 1, 'vault_slot should grant treasure slot bonus');
    }
    if (applied.boonId === 'fate_spark') {
      assert(harness.player.fateRing.exp > 0, 'fate_spark should grant fate ring exp immediately');
    }

    harness.endlessState.activeParanoiaBurdens = ['withered_mend', 'thin_harvest'];
    harness.endlessState.activeParanoiaBoons = ['rare_surge', 'vault_slot'];
    const tuned = harness.getEndlessModifiers();
    assert(tuned.healMul < 1, 'withered_mend should reduce endless healing multiplier');
    assert(tuned.rewardRareChance > 0, 'rare_surge should increase reward rare chance');
    assert(tuned.extraTreasureSlots >= 1, 'vault_slot should surface extra treasure slots in modifiers');
  }

  // 地图配置合法性
  {
    const { harness } = createHarness();
    harness.endlessState = harness.createDefaultEndlessState();
    harness.endlessState.unlocked = true;
    harness.endlessState.active = true;
    harness.endlessState.currentCycle = 9;
    const cfg = harness.getEndlessMapConfig(10);
    assert(cfg.rows >= 8 && cfg.rows <= 12, `rows should be 8-12, got ${cfg.rows}`);
    assert(Array.isArray(cfg.nodesSequence), 'nodesSequence should be array');
    assert(cfg.nodesSequence.length === cfg.rows - 1, 'nodesSequence length should be rows-1');
    assert(cfg.nodesSequence.every((n) => Number.isInteger(n) && n >= 2 && n <= 4), 'node count per row should stay in [2,4]');
  }

  // 启动流程 + 结算推进
  {
    const { harness, calls } = createHarness();
    const started = harness.startEndlessMode();
    assert(started === true, 'startEndlessMode should succeed when unlocked');
    assert(harness.isEndlessActive() === true, 'endless should be active after start');
    assert(calls.mapGenerate === 1, 'startEndlessMode should generate map once');
    assert(typeof harness.ensureEndlessState().seasonId === 'string' && harness.ensureEndlessState().seasonId.length > 0, 'start should initialize season id');
    assert(typeof harness.ensureEndlessState().seasonWeekTag === 'string' && harness.ensureEndlessState().seasonWeekTag.length > 0, 'start should initialize season week tag');
    const startCycle = harness.ensureEndlessState().currentCycle;
    const startPressure = harness.ensureEndlessState().pressure;
    const startSeasonClears = harness.ensureEndlessState().seasonCycleClears;
    const startSeasonBosses = harness.ensureEndlessState().seasonBossDefeated;

    harness.handleEndlessRealmComplete();
    const nextState = harness.ensureEndlessState();
    assert(nextState.currentCycle === startCycle + 1, 'realm complete should advance endless cycle');
    assert(nextState.pressure >= Math.min(9, startPressure + 1), 'realm complete should raise pressure by at least 1');
    assert(nextState.totalBossDefeated >= 1, 'realm complete should increase boss kill count');
    assert(nextState.seasonCycleClears >= startSeasonClears + 1, 'realm complete should update season cycle clears');
    assert(nextState.seasonBossDefeated >= startSeasonBosses + 1, 'realm complete should update season boss count');
    assert(nextState.seasonScore > 0, 'realm complete should grant season score');
    assert(calls.mapGenerate >= 2, 'realm complete should generate next map');
    assert(calls.autoSave >= 2, 'start + advance should trigger autosave');

    harness.endlessState.currentCycle = 12;
    harness.handleEndlessRealmComplete();
    const loopState = harness.ensureEndlessState();
    assert(loopState.currentCycle === 13, 'loop completion should advance to next big cycle');
    assert(loopState.paranoiaHistory.length >= 1, 'big loop advance should trigger paranoia selection fallback');
    assert(loopState.lastParanoiaCycle === 13, 'big loop paranoia should record its cycle');
  }

  console.log('Endless mode sanity checks passed.');
})();
