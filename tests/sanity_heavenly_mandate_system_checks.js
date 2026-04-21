const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

function loadFile(ctx, filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, ctx, { filename: filePath });
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const localStorage = createStorage();
  const sessionStorage = createStorage();

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
    localStorage,
    sessionStorage,
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    cancelAnimationFrame: () => {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    alert: () => {},
    AuthService: {
      isLoggedIn: () => false,
      saveCloudData: () => Promise.resolve({ success: false })
    },
    CHARACTERS: {
      linFeng: {
        name: '林枫',
        title: '逆命剑徒',
        stats: { maxHp: 80, gold: 100, energy: 3 },
        relic: null,
        keywords: ['连击', '爆发'],
        deck: ['strike', 'strike', 'defend', 'defend', 'quickDraw', 'spiritBoost']
      }
    },
    SKILLS: {},
    STARTER_DECK: ['strike', 'strike', 'defend', 'defend', 'quickDraw', 'spiritBoost'],
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
    PVPService: {
      getCurrentSeasonMeta: () => ({
        id: 'heavenly_mandate_test_season',
        name: '天道试锋'
      }),
      getRecentMatchHistory: () => [],
      getEconomySnapshot: () => null
    },
    JSON,
    Date,
    Math
  });
  ctx.window = ctx;
  ctx.global = ctx;

  [
    'js/data/cards.js',
    'js/data/laws.js',
    'js/data/treasures.js',
    'js/data/enemies.js',
    'js/data/boss_mechanics.js',
    'js/data/achievements.js',
    'js/data/run_destinies.js',
    'js/data/run_paths.js',
    'js/data/run_vows.js',
    'js/data/spirit_companions.js',
    'js/data/fate_ring.js',
    'js/data/challenge_rules.js',
    'js/data/expedition_systems.js',
    'js/core/fateRing.js',
    'js/core/player.js',
    'js/game.js',
    'js/core/challenge_hub.js',
    'js/core/expedition_hub.js',
    'js/core/collection_hub.js'
  ].forEach((file) => loadFile(ctx, path.join(root, file)));

  const Game = vm.runInContext('Game', ctx);
  const Player = vm.runInContext('Player', ctx);
  const LAWS = vm.runInContext('LAWS', ctx);

  function createGame() {
    const game = Object.create(Game.prototype);
    game.player = new Player('linFeng');
    game.player.game = game;
    game.unlockedRealms = [1, 2, 3, 4, 5, 6, 7, 8];
    game.currentScreen = 'collection';
    game.currentSaveSlot = null;
    game.cachedSlots = {};
    game.performanceStats = { battleUIUpdates: 0 };
    game.legacyProgress = { essence: 0, spent: 0, upgrades: {} };
    game.featureFlags = {
      combatDepthV2: true,
      pvpRuleSyncV2: true,
      mapNodeTrialForge: true,
      endlessModeV1: true
    };
    game.map = {
      nodes: [],
      currentNodeIndex: 0,
      completedNodes: []
    };
    game.endlessState = Game.prototype.createDefaultEndlessState.call(game);
    game.encounterState = Game.prototype.createDefaultEncounterState.call(game);
    game.sanctumAgendaState = Game.prototype.createDefaultSanctumAgendaState.call(game);
    game.heavenlyMandateState = Game.prototype.createDefaultHeavenlyMandateState.call(game);
    game.seasonVerificationState = Game.prototype.createDefaultSeasonVerificationState.call(game);
    game.chapterEventLedger = Game.prototype.createDefaultChapterEventLedger.call(game);
    game.challengeHubState = null;
    game.observatoryGuideState = null;
    game.expeditionState = null;
    game.achievementSystem = {
      unlockedAchievements: [],
      claimedAchievements: []
    };
    game.initCollection = () => {};
    game.showScreen = () => {};
    game.renderExpeditionMapPanels = () => {};
    game.autoSave = () => {};
    game.saveLegacyProgress = () => {};
    game.player.collectLaw(LAWS.flameTruth || Object.values(LAWS)[0]);
    game.player.playerRealm = 6;
    game.player.realm = 6;
    game.player.heavenlyInsight = 6;
    game.player.karma = 5;
    return game;
  }

  function buildSlate(id, timestamp, overrides = {}) {
    return {
      id,
      chapterIndex: overrides.chapterIndex || 6,
      chapterName: overrides.chapterName || '第 6 章·星镜归档',
      endingId: overrides.endingId || 'alliance',
      endingName: overrides.endingName || '星图合卷',
      endingIcon: overrides.endingIcon || '🔭',
      score: overrides.score || 256,
      scoreBreakdown: overrides.scoreBreakdown || [
        '章节答卷：天象合卷 · 3/3 项达成',
        '训练建议：继续沿观测锁线压路线贴合与控场节奏'
      ],
      branchName: overrides.branchName || '观测锁线',
      bountyNames: overrides.bountyNames || ['星轨巡检'],
      factionSummary: overrides.factionSummary || ['星港议会·协力'],
      nemesisName: overrides.nemesisName || '镜池守望者',
      nemesisStatus: overrides.nemesisStatus || 'allied',
      nemesisStatusLabel: overrides.nemesisStatusLabel || '已结盟',
      tags: overrides.tags || ['课题·推演控场', '答卷·天象合卷', '训练·路线贴合'],
      practiceTopic: overrides.practiceTopic || {
        id: `${id}_topic`,
        sourceRecordId: `${id}_guide`,
        sourceTitle: '星镜试锋',
        themeKey: 'oracle',
        themeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '对比观测收益、路线贴合与控场稳定。',
        trainingTags: ['路线贴合', '控场稳定'],
        goalLines: ['先走观星线再补事件收益']
      },
      observatoryLink: overrides.observatoryLink || {
        sourceRecordId: `${id}_guide`,
        sourceTitle: '星镜试锋',
        sourceThemeKey: 'oracle',
        sourceThemeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '对比观测收益、路线贴合与控场稳定。',
        trainingTags: ['路线贴合', '控场稳定'],
        drillObjective: '连续两次走观星相关节点并维持控场稳定。'
      },
      answerReview: overrides.answerReview || {
        title: '章节观星回响',
        ratingLabel: '天象合卷',
        ratingTone: 'completed',
        trainingAdvice: '先沿观星链路把线索写满，再回事件节点补收益兑现。',
        highlightLine: '这章已经把观测样本写成完整答卷，下一轮继续按同轴复盘。',
        overviewLine: '章节答卷已稳定成卷。'
      },
      themeKey: overrides.themeKey || 'oracle',
      themeLabel: overrides.themeLabel || '推演控场',
      ratingLabel: overrides.ratingLabel || '天象合卷',
      ratingTone: overrides.ratingTone || 'completed',
      timestamp
    };
  }

  const migrated = Game.prototype.migrateSaveData.call({
    featureFlags: {
      combatDepthV2: true,
      pvpRuleSyncV2: true,
      mapNodeTrialForge: true,
      endlessModeV1: true
    }
  }, {
    version: '5.0.0',
    player: {
      stance: 'neutral',
      currentHp: 20,
      deck: [{ id: 'strike' }]
    },
    map: { nodes: [], currentNodeIndex: -1, completedNodes: [] },
    unlockedRealms: [1],
    currentScreen: 'map-screen'
  });
  assert(migrated.heavenlyMandateState && typeof migrated.heavenlyMandateState === 'object', 'save migration should attach heavenly mandate state');
  assert(Array.isArray(migrated.heavenlyMandateState.lanes), 'migrated heavenly mandate state should include lanes array');

  const game = createGame();
  ctx.game = game;
  ctx.window.game = game;
  ctx.render_game_to_text = () => game.renderGameToText();
  ctx.window.render_game_to_text = ctx.render_game_to_text;
  const currentWeekTag = game.getHeavenlyMandateWeekMeta().weekTag;
  const oldSlate = buildSlate('run_slate_old_week', Date.now() - (8 * 24 * 60 * 60 * 1000), {
    chapterName: '第 5 章·旧周归卷'
  });
  game.runSlateArchive = game.normalizeRunSlateArchive([oldSlate]);
  game.persistRunSlateArchive();

  const staleBoard = game.getHeavenlyMandateExpeditionSnapshot();
  const staleExpeditionLane = staleBoard?.lanes?.find((lane) => lane.id === 'expedition') || null;
  const staleRunSlateTask = staleExpeditionLane?.tasks?.find((task) => task.id === 'weekly_run_slate') || null;
  assert(staleRunSlateTask && !staleRunSlateTask.completed, `old-week slate should not complete weekly run task, got ${JSON.stringify(staleRunSlateTask)}`);

  const freshSlate = buildSlate('run_slate_current_week', Date.now());
  game.runSlateArchive = game.normalizeRunSlateArchive([freshSlate, oldSlate]);
  game.persistRunSlateArchive();
  const focus = game.buildObservatoryTrainingFocusFromSlate(freshSlate);
  game.setObservatoryTrainingFocus(focus, { silent: true });

  const mandateSnapshot = game.getHeavenlyMandateExpeditionSnapshot();
  assert(mandateSnapshot && mandateSnapshot.weekTag === currentWeekTag, `mandate snapshot should use current week tag ${currentWeekTag}, got ${JSON.stringify(mandateSnapshot)}`);
  assert(Array.isArray(mandateSnapshot.lanes) && mandateSnapshot.lanes.length === 3, `mandate snapshot should expose 3 lanes, got ${JSON.stringify(mandateSnapshot)}`);
  const expeditionLane = mandateSnapshot.lanes.find((lane) => lane.id === 'expedition');
  const trainingLane = mandateSnapshot.lanes.find((lane) => lane.id === 'training');
  assert(expeditionLane && trainingLane, `mandate lanes should include expedition and training, got ${JSON.stringify(mandateSnapshot.lanes)}`);
  const runSlateTask = expeditionLane.tasks.find((task) => task.id === 'weekly_run_slate');
  assert(runSlateTask && runSlateTask.completed, `current-week slate should complete weekly run task, got ${JSON.stringify(runSlateTask)}`);
  assert(trainingLane.tasks.some((task) => task.id === 'weekly_training_focus' && task.completed), `training lane should acknowledge current focus, got ${JSON.stringify(trainingLane)}`);

  const payload = game.getExpeditionPayload();
  assert(payload && payload.mandate && payload.mandate.weekTag === currentWeekTag, `expedition payload should expose heavenly mandate snapshot, got ${JSON.stringify(payload)}`);
  assert(Array.isArray(payload.mandate.lanes) && payload.mandate.lanes.length === 3, `expedition payload mandate should preserve lanes, got ${JSON.stringify(payload?.mandate)}`);

  const renderedPayload = JSON.parse(game.renderGameToText());
  assert(renderedPayload?.expedition?.mandate?.weekTag === currentWeekTag, `render payload should expose expedition mandate, got ${JSON.stringify(renderedPayload?.expedition?.mandate)}`);

  const sanctumOverview = game.getSanctumOverviewData();
  assert(sanctumOverview?.heavenlyMandate?.weekTag === currentWeekTag, `sanctum overview should expose heavenly mandate view model, got ${JSON.stringify(sanctumOverview?.heavenlyMandate)}`);
  assert(Array.isArray(sanctumOverview?.heavenlyMandate?.lanes) && sanctumOverview.heavenlyMandate.lanes.length === 3, `sanctum overview should expose mandate lanes, got ${JSON.stringify(sanctumOverview?.heavenlyMandate)}`);
  assert(sanctumOverview.goals.some((goal) => goal.id === 'heavenly_mandate_goal'), `sanctum overview should inject a heavenly mandate goal card, got ${JSON.stringify(sanctumOverview.goals)}`);

  const debtGame = createGame();
  ctx.game = debtGame;
  ctx.window.game = debtGame;
  const debtCurrentWeekTag = debtGame.getHeavenlyMandateWeekMeta().weekTag;
  const debtSlate = buildSlate('heavenly_mandate_debt_pack', Date.now() - (8 * 24 * 60 * 60 * 1000), {
    chapterName: '第 5 章·镜债旧卷',
    ratingLabel: '留痕待补',
    ratingTone: 'selected',
    score: 204
  });
  debtGame.runSlateArchive = debtGame.normalizeRunSlateArchive([debtSlate]);
  debtGame.persistRunSlateArchive();
  debtGame.sanctumAgendaState = debtGame.normalizeSanctumAgendaState({
    lastResolved: {
      agendaId: 'heavenly_mandate_debt_agenda',
      icon: '🧮',
      name: '镜债校卷',
      sourceRunId: debtSlate.id,
      sourceTitle: '镜债试锋',
      themeKey: 'oracle',
      themeLabel: '推演控场',
      ratingLabel: '留痕待补',
      ratingTone: 'selected',
      trainingAdvice: '先把上一道押卷留下的债账补掉，再考虑冲更高压样本。',
      highlightLine: '这轮押卷没有真正结成，下一章需要优先清账。',
      routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
      focusNodeTypes: ['observatory', 'event', 'memory_rift'],
      focusNodeLine: '优先节点：观星 / 事件 / 裂隙',
      progress: 1,
      target: 3,
      selectedDecisionLabel: '保卷回收',
      selectedDecisionLine: '先保住残卷，再找机会补押卷主轴。',
      selectedContractLabel: '镜债锁线',
      selectedContractLine: '锁住观星 / 事件 / 裂隙线路，但欠下一笔清账任务。',
      contractResolved: true,
      contractSuccess: false,
      contractResolutionLine: '锁线契约：镜债锁线未兑现 · 契押：🔮 1',
      contractSignCostLine: '🔮 1',
      outcome: 'failed',
      outcomeLabel: '研究未成',
      grantedLine: '',
      reasonLine: '本轮没有把锁线答卷真正补成卷，洞府改以债账方式追踪。',
      summaryLine: '镜债校卷没有结成，留下了一笔待清的研究债账。',
      recoveryEligible: true,
      recoveryLabel: '残卷回收',
      recoveryTier: 'partial',
      recoveryTierLabel: '轻回收',
      recoveryLine: '洞府已回收一部分残卷，但下一轮要优先补这笔镜债。',
      recoveryHintLine: '先去高压环境补一轮镜债验证，再决定要不要继续冲榜。',
      rewardTrackId: 'observatory',
      rewardTrackName: '命盘档案室',
      rewardTrackIcon: '🔭'
    },
    history: [],
    totalCompleted: 0,
    totalFailed: 1
  });
  const debtEndlessState = debtGame.ensureEndlessState();
  debtEndlessState.currentCycle = 1;
  debtEndlessState.seasonWeekTag = debtCurrentWeekTag;
  debtEndlessState.seasonCycleClears = 1;
  debtEndlessState.seasonScore = 128;
  const debtMandateSnapshot = debtGame.getHeavenlyMandateExpeditionSnapshot();
  const occupiedMandateTask = (debtMandateSnapshot?.lanes || [])
    .flatMap((lane) => (Array.isArray(lane?.tasks)
      ? lane.tasks.map((task) => ({ ...task, laneId: lane.id }))
      : []))
    .find((task) => task.id === debtMandateSnapshot?.focusTask?.id) || null;
  assert(
    debtMandateSnapshot?.focusTask?.source === 'seasonDebtPack'
      && !debtMandateSnapshot?.focusTask?.isPlaceholder
      && debtMandateSnapshot?.focusTask?.occupiesStrongSlot
      && occupiedMandateTask?.occupiesStrongSlot
      && occupiedMandateTask?.laneId === 'versus'
      && /债|欠卷|清/.test(String(debtMandateSnapshot?.focusTask?.label || '')),
    `mandate snapshot should expose a real debt-occupied strong slot, got ${JSON.stringify({ debtMandateSnapshot, occupiedMandateTask })}`
  );
  const debtPayload = debtGame.getExpeditionPayload();
  const payloadOccupiedTask = (debtPayload?.mandate?.lanes || [])
    .flatMap((lane) => (Array.isArray(lane?.tasks) ? lane.tasks : []))
    .find((task) => task.id === debtMandateSnapshot?.focusTask?.id) || null;
  assert(
    JSON.stringify(debtPayload?.mandate?.focusTask || null) === JSON.stringify(debtMandateSnapshot?.focusTask || null),
    `expedition payload should mirror mandate focus task, got ${JSON.stringify(debtPayload?.mandate)} vs ${JSON.stringify(debtMandateSnapshot)}`
  );
  assert(
    payloadOccupiedTask?.id === debtMandateSnapshot?.focusTask?.id,
    `expedition payload should mirror the occupied mandate lane task, got ${JSON.stringify(debtPayload?.mandate)}`
  );
  const debtRenderedPayload = JSON.parse(debtGame.renderGameToText());
  assert(
    JSON.stringify(debtRenderedPayload?.expedition?.mandate?.focusTask || null) === JSON.stringify(debtRenderedPayload?.map?.chapter?.mandate?.focusTask || null)
      && JSON.stringify(debtRenderedPayload?.expedition?.mandate?.focusTask || null) === JSON.stringify(debtMandateSnapshot?.focusTask || null),
    `render payload should mirror mandate focus task into expedition/map, got ${JSON.stringify(debtRenderedPayload?.expedition?.mandate)} vs ${JSON.stringify(debtRenderedPayload?.map?.chapter?.mandate)}`
  );
  assert(
    (debtRenderedPayload?.expedition?.mandate?.lanes || [])
      .flatMap((lane) => (Array.isArray(lane?.tasks) ? lane.tasks : []))
      .some((task) => task.id === debtMandateSnapshot?.focusTask?.id),
    `render payload should mirror the occupied debt task into mandate lanes, got ${JSON.stringify(debtRenderedPayload?.expedition?.mandate)}`
  );
  const debtSanctumOverview = debtGame.getSanctumOverviewData();
  assert(
    debtSanctumOverview?.heavenlyMandate?.focusTask?.source === 'seasonDebtPack',
    `sanctum overview should preserve the mandate debt focus task, got ${JSON.stringify(debtSanctumOverview?.heavenlyMandate)}`
  );
  assert(
    /债|欠卷|清/.test(String(debtSanctumOverview?.heavenlyMandate?.goalTitle || ''))
      && /债|欠卷|清/.test(String(debtSanctumOverview?.heavenlyMandate?.detailLine || ''))
      && /债|欠卷|清/.test(String(debtSanctumOverview?.heavenlyMandate?.guideLine || '')),
    `sanctum heavenly mandate copy should pivot to the debt-clearing focus, got ${JSON.stringify(debtSanctumOverview?.heavenlyMandate)}`
  );
  assert(
    debtSanctumOverview.goals.some((goal) =>
      goal.id === 'heavenly_mandate_goal'
      && /债|欠卷|清/.test(`${String(goal.title || '')} ${String(goal.note || '')}`)
    ),
    `sanctum heavenly mandate goal card should surface the debt focus task, got ${JSON.stringify(debtSanctumOverview.goals)}`
  );
  const debtMandateGoal = debtSanctumOverview.goals.find((goal) => goal.id === 'heavenly_mandate_goal') || null;
  assert(
    debtMandateGoal?.action === 'screen' && debtMandateGoal?.value === 'map-screen',
    `sanctum heavenly mandate goal card should route using the focus task action surface, got ${JSON.stringify(debtMandateGoal)}`
  );
  debtGame.recordSeasonVerificationResult({
    role: 'primary',
    sourceMode: 'endless',
    sourceModeLabel: '无尽轮回',
    label: '无尽高压验证',
    resultStatus: 'verified',
    writebackMode: 'clear_debt',
    writebackLine: '无尽轮回主验证通过，欠卷会被清账并释放天命强目标。',
    resolvedRunId: 'heavenly_mandate_clear_debt_run',
    chapterIndex: debtSlate.chapterIndex,
    proofQuality: 'solid',
    lineageStyle: '长压试炼',
    summaryLine: '无尽通关已补齐主验证，这笔欠卷可以在季盘上清账。',
    detailLine: '主验证成功后，天命敕令应该把强目标还给常规推进。',
    statusLine: '无尽轮回 · 通过',
    anchorSection: 'endless',
    priority: 1
  });
  const releasedMandateSnapshot = debtGame.getHeavenlyMandateExpeditionSnapshot();
  const releasedOccupiedTask = (releasedMandateSnapshot?.lanes || [])
    .flatMap((lane) => (Array.isArray(lane?.tasks) ? lane.tasks : []))
    .find((task) => task.id === debtMandateSnapshot?.focusTask?.id) || null;
  assert(
    !releasedMandateSnapshot?.focusTask
      && !releasedOccupiedTask
      && releasedMandateSnapshot?.lanes?.find((lane) => lane.id === 'versus')?.tasks?.[0]?.id === 'weekly_endless_clear',
    `cleared debt should release the heavenly mandate strong slot and restore the regular lane task, got ${JSON.stringify(releasedMandateSnapshot)}`
  );
  const releasedSanctumOverview = debtGame.getSanctumOverviewData();
  assert(
    !releasedSanctumOverview?.heavenlyMandate?.focusTask,
    `sanctum heavenly mandate view should also release the debt focus after main verification clears it, got ${JSON.stringify(releasedSanctumOverview?.heavenlyMandate)}`
  );

  ctx.game = game;
  ctx.window.game = game;

  game.saveGame();
  const saved = JSON.parse(localStorage.getItem('theDefierSave') || '{}');
  assert(saved.heavenlyMandateState && saved.heavenlyMandateState.weekTag === currentWeekTag, `saved game should persist heavenly mandate state, got ${JSON.stringify(saved.heavenlyMandateState)}`);

  console.log('sanity_heavenly_mandate_system_checks passed');
})();
