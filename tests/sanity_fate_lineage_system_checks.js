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
        id: 'fate_lineage_test_season',
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
      score: overrides.score || 268,
      scoreBreakdown: overrides.scoreBreakdown || [
        '章节答卷：天象合卷 · 3/3 项达成',
        '训练建议：继续沿观测锁线压路线贴合与控场节奏'
      ],
      branchName: overrides.branchName || '观测锁线',
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

  const game = createGame();
  ctx.game = game;
  ctx.window.game = game;
  ctx.render_game_to_text = () => game.renderGameToText();
  ctx.window.render_game_to_text = ctx.render_game_to_text;

  game.player.collectLaw(LAWS.flameTruth || Object.values(LAWS)[0]);
  game.player.collectLaw(LAWS.thunderLaw || Object.values(LAWS)[1]);
  game.player.addTreasure('soul_jade');
  game.player.addTreasure('ice_spirit_bead');
  game.player.setRunPath('insight');
  game.player.setRunDestiny('rebelScale', 2);
  game.player.setSpiritCompanion('emberCrow', 1);
  game.player.fateRing.getSocketedLaws = () => ['flameTruth', 'thunderLaw'].filter((id) => !!LAWS[id]);

  const freshSlate = buildSlate('run_slate_lineage_current', Date.now());
  game.runSlateArchive = game.normalizeRunSlateArchive([freshSlate]);
  game.persistRunSlateArchive();
  const trainingFocus = game.buildObservatoryTrainingFocusFromSlate(freshSlate);
  game.setObservatoryTrainingFocus(trainingFocus, { silent: true });

  game.recordRunPathCompletion(game.getRunPathMetaById('insight'), {
    completedAt: Date.now() - 4000,
    realm: 6,
    characterId: 'linFeng',
    phaseMeta: { id: 'insight_final', title: '命盘问真' },
    rewardText: '天机 +2 / 灵石 +80'
  });
  game.recordRunPathBossSample(game.getRunPathMetaById('insight'), {
    id: 'danZun',
    name: '丹尊',
    icon: '🗿',
    realm: 6
  }, {
    characterId: 'linFeng',
    turns: 4,
    completedAt: Date.now() - 3000
  });
  game.recordRunPathBossSample(game.getRunPathMetaById('insight'), {
    id: 'heavenlyDao',
    name: '天道',
    icon: '☯',
    realm: 18
  }, {
    characterId: 'linFeng',
    turns: 8,
    completedAt: Date.now() - 2000
  });
  game.recordObservatoryArchiveEntry({
    id: 'fate-lineage-observatory-record',
    type: 'challenge',
    mode: 'daily',
    modeLabel: '今日天机',
    rotationKey: '2026-04-17',
    rotationLabel: '2026.04.17',
    seedSignature: 'FATE-LINEAGE-AUDIT',
    title: '星镜试锋',
    note: '完成 · 得分 420',
    icon: '🔭',
    score: 420,
    completed: true,
    at: Date.now() - 1000,
    reason: 'goal_reached',
    themeKey: 'oracle',
    themeLabel: '推演控场',
    preferredNodes: ['observatory', 'event', 'rift'],
    trainingTags: ['路线贴合', '控场稳定'],
    rule: {
      id: 'fate_lineage_rule',
      name: '星镜试锋',
      goalRealm: 3,
      characterId: 'linFeng',
      runDestinyId: 'rebelScale',
      spiritCompanionId: 'emberCrow'
    }
  });

  const now = Date.now();
  game.sanctumAgendaState = game.normalizeSanctumAgendaState({
    lastResolved: {
      agendaId: 'lineage_steady',
      icon: '🧮',
      name: '星镜稳线',
      sourceRunId: freshSlate.id,
      sourceTitle: '星镜试锋',
      themeKey: 'oracle',
      themeLabel: '推演控场',
      ratingLabel: '天象合卷',
      ratingTone: 'completed',
      trainingAdvice: '继续沿观测锁线压路线贴合与控场节奏。',
      highlightLine: '把星镜试锋压成可复用周样本。',
      routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
      focusNodeTypes: ['observatory', 'event', 'rift'],
      focusNodeLine: '优先节点：观星 / 事件 / 裂隙',
      progress: 3,
      target: 3,
      selectedDecisionLabel: '加倍投入',
      selectedDecisionLine: '继续沿观星链路补齐收益兑现。',
      selectedContractLabel: '星镜锁线',
      selectedContractLine: '锁定观星 / 事件 / 裂隙线路。',
      contractResolved: true,
      contractSuccess: true,
      contractResolutionLine: '锁线契约：星镜锁线已兑现 · 契押：🔮 1',
      contractSignCostLine: '🔮 1',
      outcome: 'success',
      outcomeLabel: '结题成功',
      grantedLine: '洞府奖励：观星留痕 +1',
      summaryLine: '星镜稳线已结题，路线贴合与控场节奏进入长期记录。',
      rewardTrackId: 'observatory',
      rewardTrackName: '命盘档案室',
      rewardTrackIcon: '🔭',
      selectedAt: now - 2000,
      updatedAt: now - 1500
    },
    history: [
      {
        agendaId: 'archive_thread',
        icon: '🧮',
        name: '残卷归档',
        sourceRunId: 'run_slate_lineage_history',
        sourceTitle: '旧档归卷',
        themeKey: 'oracle',
        themeLabel: '答卷归档',
        routeFocusLine: '优先节点：观星 / 记忆裂隙 / 事件',
        focusNodeTypes: ['observatory', 'memory_rift', 'event'],
        focusNodeLine: '优先节点：观星 / 记忆裂隙 / 事件',
        progress: 2,
        target: 2,
        selectedDecisionLabel: '稳步归档',
        selectedDecisionLine: '优先把已成型样本收入洞府。',
        selectedContractLabel: '镜段封样',
        selectedContractLine: '优先观星 / 记忆裂隙 / 事件。',
        contractResolved: true,
        contractSuccess: true,
        contractResolutionLine: '锁线契约：镜段封样已兑现',
        outcome: 'success',
        outcomeLabel: '结题成功',
        summaryLine: '残卷归档稳定完成，研究侧开始保留长期存档偏好。',
        selectedAt: now - 6000,
        updatedAt: now - 5500
      }
    ],
    totalCompleted: 2,
    totalFailed: 0
  });
  game.recordSeasonVerificationResult({
    weekTag: '2026-W14',
    weekLabel: '第14周',
    role: 'primary',
    sourceMode: 'endless',
    sourceModeLabel: '无尽轮回',
    sourceLabel: '无尽高压账本',
    label: '无尽清账验证',
    resultStatus: 'verified',
    writebackMode: 'clear_debt',
    writebackLine: '无尽主验证通过，旧欠卷已经清账并释放强目标位。',
    resolvedRunId: 'fate_lineage_endless_clear',
    chapterIndex: freshSlate.chapterIndex - 1,
    proofQuality: 'solid',
    lineageStyle: '长压试炼',
    summaryLine: '无尽账本证明这笔旧债可以在高压环境下补清。',
    detailLine: '欠卷被真主验证收掉，谱系开始记录先清账再扩线的习惯。',
    statusLine: '无尽轮回 · 通过',
    anchorSection: 'endless',
    priority: 1,
    createdAt: now - 14000,
    updatedAt: now - 14000
  });
  game.recordSeasonVerificationResult({
    weekTag: '2026-W15',
    weekLabel: '第15周',
    role: 'primary',
    sourceMode: 'sanctum',
    sourceModeLabel: '洞府锁线',
    sourceLabel: '洞府清账延后',
    label: '洞府账本延期',
    resultStatus: 'deferred',
    writebackMode: 'carry_forward',
    writebackLine: '这笔账暂缓处理，会继续带入下周强目标位。',
    resolvedRunId: 'fate_lineage_deferred_cleanup',
    chapterIndex: freshSlate.chapterIndex - 1,
    proofQuality: '',
    lineageStyle: '稳线归档',
    summaryLine: '本周选择先保留锁线资源，这笔账会继续压到后续周转。',
    detailLine: '拖延没有蒸发，只是把清账压力继续顺延。',
    statusLine: '洞府锁线 · 延期',
    anchorSection: 'sanctum',
    priority: 2,
    carryIntoNextWeek: true,
    createdAt: now - 9000,
    updatedAt: now - 9000
  });
  game.recordSeasonVerificationResult({
    role: 'primary',
    sourceMode: 'pvp',
    sourceModeLabel: '天道榜',
    sourceLabel: '天道试锋 · 镜池守望者',
    label: '天道榜账本验证',
    resultStatus: 'verified',
    writebackMode: 'upgrade_verdict',
    writebackLine: '天道榜主验证通过，本周押卷会升级为正卷。',
    resolvedRunId: 'fate_lineage_pvp_proof',
    chapterIndex: freshSlate.chapterIndex,
    proofQuality: 'solid',
    lineageStyle: '推演控场',
    summaryLine: '天道榜对局已经证明这条主修在外场也能成立。',
    detailLine: '镜战样本把主修从章节内成立推进到了跨模成立。',
    statusLine: '天道榜 · 通过',
    anchorSection: 'pvp',
    priority: 1
  });

  const lineageSnapshot = game.getFateLineageSnapshot({ latestSlate: freshSlate });
  assert(lineageSnapshot && lineageSnapshot.available === true, `fate lineage snapshot should be available, got ${JSON.stringify(lineageSnapshot)}`);
  assert(Array.isArray(lineageSnapshot.tracks) && lineageSnapshot.tracks.length >= 4, `fate lineage should expose four tracks, got ${JSON.stringify(lineageSnapshot?.tracks)}`);
  assert(['character', 'style', 'node', 'research'].every((id) => lineageSnapshot.tracks.some((track) => track.id === id)), `fate lineage should expose character/style/node/research tracks, got ${JSON.stringify(lineageSnapshot.tracks)}`);
  assert(
    /赛季回写|天道榜主验证通过/.test(String(lineageSnapshot.detailLine || ''))
      && /主验证/.test(String(lineageSnapshot.currentFocusLine || ''))
      && Array.isArray(lineageSnapshot.nextTargets)
      && lineageSnapshot.nextTargets.some((line) => /谱系回写|主验证已回写|外场也能成立/.test(String(line || ''))),
    `fate lineage should absorb season verification writeback cues into detail/current-focus/next-target lines, got ${JSON.stringify(lineageSnapshot)}`
  );
  assert(
    lineageSnapshot.progress?.trackedVerdictStyles === 3
      && lineageSnapshot.researchTrack?.dominantLabel === '押榜抢线'
      && Array.isArray(lineageSnapshot.researchTrack?.entries)
      && ['清账风格', '押榜风格', '拖延风格'].every((label) => lineageSnapshot.researchTrack.entries.some((entry) => entry.label === label))
      && /押榜抢线/.test(String(lineageSnapshot.summaryLine || '')),
    `fate lineage should expose clear/push/deferred verdict styles, got ${JSON.stringify(lineageSnapshot?.researchTrack)}`
  );
  const seasonVerificationSnapshot = game.getSeasonVerificationSnapshot();
  assert(
    Array.isArray(seasonVerificationSnapshot.history)
      && seasonVerificationSnapshot.history.length === 3
      && seasonVerificationSnapshot.history[0]?.resolvedRunId === 'fate_lineage_pvp_proof'
      && seasonVerificationSnapshot.history[1]?.writebackMode === 'carry_forward'
      && seasonVerificationSnapshot.history[1]?.carryIntoNextWeek === true
      && seasonVerificationSnapshot.history[2]?.resolvedRunId === 'fate_lineage_endless_clear',
    `season verification history should keep sorted archive order and preserve deferred carry-forward metadata, got ${JSON.stringify(seasonVerificationSnapshot?.history)}`
  );
  assert(
    lineageSnapshot.progress?.researchHistoryCount === seasonVerificationSnapshot.history.length,
    `fate lineage should count season verification archive size directly, got ${JSON.stringify({ progress: lineageSnapshot.progress, history: seasonVerificationSnapshot.history })}`
  );
  const repeatedSnapshot = game.getFateLineageSnapshot({ latestSlate: freshSlate });
  assert(
    JSON.stringify(repeatedSnapshot.progress) === JSON.stringify(lineageSnapshot.progress),
    `repeated fate lineage snapshots should be stable, got ${JSON.stringify({ first: lineageSnapshot.progress, second: repeatedSnapshot.progress })}`
  );

  const build = game.getBuildSnapshotData();
  assert(build.lineage && build.lineage.available, `build snapshot should expose fate lineage data, got ${JSON.stringify(build.lineage)}`);
  assert(build.strengths.some((line) => /命盘谱系：/.test(line)), `build strengths should mention fate lineage, got ${JSON.stringify(build.strengths)}`);
  assert(build.nextTargets.some((line) => /谱系校准：|谱系推进：/.test(line)), `build next targets should expose lineage follow-up, got ${JSON.stringify(build.nextTargets)}`);

  const sanctum = game.getSanctumOverviewData();
  assert(sanctum.lineage && sanctum.lineage.available, `sanctum overview should expose fate lineage data, got ${JSON.stringify(sanctum.lineage)}`);
  assert(sanctum.researches.some((research) => research.id === 'fate_lineage_record_layer'), `sanctum researches should include fate lineage record layer, got ${JSON.stringify(sanctum.researches)}`);
  assert(sanctum.goals.some((goal) => goal.id === 'fate_lineage_goal'), `sanctum goals should include fate lineage goal, got ${JSON.stringify(sanctum.goals)}`);

  const expeditionPayload = game.getExpeditionPayload();
  assert(expeditionPayload && expeditionPayload.lineage && expeditionPayload.lineage.summaryLine, `expedition payload should expose lineage summary, got ${JSON.stringify(expeditionPayload)}`);
  assert(Array.isArray(expeditionPayload.lineage.tracks) && expeditionPayload.lineage.tracks.length >= 4, `expedition payload lineage should keep track list, got ${JSON.stringify(expeditionPayload.lineage)}`);

  game.lastExpeditionRewardMeta = game.buildRewardExpeditionMeta(freshSlate);
  const rewardMeta = game.getRewardExpeditionMeta();
  assert(rewardMeta && rewardMeta.lineage && rewardMeta.lineage.summaryLine, `reward expedition meta should preserve structured lineage, got ${JSON.stringify(rewardMeta)}`);

  game.currentScreen = 'reward-screen';
  const renderedPayload = JSON.parse(game.renderGameToText());
  assert(
    renderedPayload?.expedition?.lineage?.summaryLine === expeditionPayload.lineage.summaryLine,
    `render payload should mirror expedition lineage summary, got ${JSON.stringify(renderedPayload?.expedition?.lineage)}`
  );
  assert(
    renderedPayload?.map?.chapter?.lineage?.summaryLine === expeditionPayload.lineage.summaryLine,
    `render payload chapter mirror should match expedition lineage summary, got ${JSON.stringify(renderedPayload?.map?.chapter?.lineage)}`
  );
  assert(
    renderedPayload?.reward?.expedition?.lineage?.summaryLine === rewardMeta.lineage.summaryLine,
    `reward payload should export structured lineage, got ${JSON.stringify(renderedPayload?.reward?.expedition)}`
  );

  console.log('Fate lineage system checks passed.');
})();
