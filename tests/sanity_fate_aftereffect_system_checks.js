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
        id: 'fate_aftereffect_test_season',
        name: '界痕试锋'
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
    game.fateAftereffectState = Game.prototype.createDefaultFateAftereffectState.call(game);
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
    const chapterIndex = overrides.chapterIndex || 6;
    return {
      id,
      chapterIndex,
      chapterName: overrides.chapterName || `第 ${chapterIndex} 章·界痕归卷`,
      endingId: overrides.endingId || 'aftereffect_audit',
      endingName: overrides.endingName || '契账回声',
      endingIcon: overrides.endingIcon || '🧭',
      score: overrides.score || 274,
      scoreBreakdown: overrides.scoreBreakdown || [
        '章节答卷：界痕抉择 · 3/3 项达成',
        '训练建议：继续沿锁线主轴验证后效在下一章的真实牵引'
      ],
      branchName: overrides.branchName || '界痕锁线',
      tags: overrides.tags || ['课题·界痕抉择', '答卷·契账回声', '训练·跨章偏置'],
      practiceTopic: overrides.practiceTopic || {
        id: `${id}_topic`,
        sourceRecordId: `${id}_guide`,
        sourceTitle: '界痕试锋',
        themeKey: 'oracle',
        themeLabel: '界痕抉择',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '对比契约兑现、欠契追账与残卷回收在下一章的偏置差异。',
        trainingTags: ['路线贴合', '跨章偏置'],
        goalLines: ['先锁主线，再观察后效在下一章如何追账']
      },
      observatoryLink: overrides.observatoryLink || {
        sourceRecordId: `${id}_guide`,
        sourceTitle: '界痕试锋',
        sourceThemeKey: 'oracle',
        sourceThemeLabel: '界痕抉择',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '对比契约兑现、欠契追账与残卷回收在下一章的偏置差异。',
        trainingTags: ['路线贴合', '跨章偏置'],
        drillObjective: '跨两章记录后效状态变化，并确认章节推进会更新剩余时长。'
      },
      answerReview: overrides.answerReview || {
        title: '界痕回响',
        ratingLabel: '契账回声',
        ratingTone: 'completed',
        trainingAdvice: '下一轮优先观察后效状态栏，再用路线结果反证洞府议程的长期代价。',
        highlightLine: '这章的研究并没有在结算页结束，它会把账追到下一章。',
        overviewLine: '界痕后效已被登记到本章归卷。'
      },
      themeKey: overrides.themeKey || 'oracle',
      themeLabel: overrides.themeLabel || '界痕抉择',
      ratingLabel: overrides.ratingLabel || '契账回声',
      ratingTone: overrides.ratingTone || 'completed',
      timestamp
    };
  }

  function buildResolvedAgenda(kind, sourceRunId, chapterIndex, overrides = {}) {
    const rewardTrackId = overrides.rewardTrackId || 'observatory';
    const rewardTrackMeta = {
      observatory: { name: '命盘档案室', icon: '🔭' },
      forbidden_altar: { name: '禁术祭坛', icon: '🩸' },
      memory_rift: { name: '记忆裂隙', icon: '🪞' }
    };
    const track = rewardTrackMeta[rewardTrackId] || rewardTrackMeta.observatory;
    const base = {
      agendaId: overrides.agendaId || `aftereffect_${kind}_${sourceRunId}`,
      icon: overrides.icon || '🧮',
      name: overrides.name || '界痕试锋',
      sourceRunId,
      sourceTitle: overrides.sourceTitle || '界痕试锋',
      themeKey: overrides.themeKey || 'oracle',
      themeLabel: overrides.themeLabel || '界痕抉择',
      ratingLabel: overrides.ratingLabel || '契账回声',
      ratingTone: overrides.ratingTone || 'completed',
      trainingAdvice: overrides.trainingAdvice || '下一章继续按锁线主轴推进，并记录后效在路线上造成的偏置。',
      highlightLine: overrides.highlightLine || '洞府会继续追踪这笔契账是否在下一章放大或收口。',
      routeFocusLine: overrides.routeFocusLine || '优先节点：观星 / 事件 / 裂隙',
      focusNodeTypes: overrides.focusNodeTypes || ['observatory', 'event', 'memory_rift'],
      focusNodeLine: overrides.focusNodeLine || '优先节点：观星 / 事件 / 裂隙',
      progress: overrides.progress || 3,
      target: overrides.target || 3,
      selectedDecisionLabel: overrides.selectedDecisionLabel || '锁线复盘',
      selectedDecisionLine: overrides.selectedDecisionLine || '继续沿观星链路补齐样本。',
      selectedContractLabel: overrides.selectedContractLabel || '界痕锁线',
      selectedContractLine: overrides.selectedContractLine || '锁定观星 / 事件 / 裂隙线路。',
      boundChapterIndex: chapterIndex,
      boundChapterName: overrides.boundChapterName || `第 ${chapterIndex} 章·界痕归卷`,
      chapterName: overrides.chapterName || `第 ${chapterIndex} 章·界痕归卷`,
      rewardTrackId,
      rewardTrackName: overrides.rewardTrackName || track.name,
      rewardTrackIcon: overrides.rewardTrackIcon || track.icon,
      selectedAt: overrides.selectedAt || (Date.now() - 1000),
      updatedAt: overrides.updatedAt || Date.now()
    };

    if (kind === 'contract_success') {
      return {
        ...base,
        contractResolved: true,
        contractSuccess: true,
        recoveryEligible: false,
        contractResolutionLine: '锁线契约：界痕锁线已兑现 · 契押：🔮 1',
        contractSignCostLine: '🔮 1',
        outcome: 'success',
        outcomeLabel: '结题成功',
        outcomeTone: 'completed',
        grantedLine: '洞府奖励：后效账本 +1',
        summaryLine: '界痕试锋已成功结题，契约兑现会把路线惯性继续压到下一章。'
      };
    }

    if (kind === 'contract_miss') {
      return {
        ...base,
        contractResolved: true,
        contractSuccess: false,
        recoveryEligible: false,
        contractResolutionLine: '锁线契约：界痕锁线未兑现 · 契押：🔮 1',
        contractSignCostLine: '🔮 1',
        outcome: 'failed',
        outcomeLabel: '未能结题',
        outcomeTone: 'suggested',
        reasonLine: '主线样本没有补齐，欠契账会继续压到下一章。',
        summaryLine: '这章没有把契约做完，洞府会在下章继续追这笔账。'
      };
    }

    return {
      ...base,
      contractResolved: false,
      contractSuccess: false,
      recoveryEligible: true,
      recoveryLabel: '残卷回收',
      recoveryTier: 'partial',
      recoveryTierLabel: '残卷',
      recoveryLine: '失败回收：洞府已回收残卷样本，可在下一章继续补完。',
      recoveryHintLine: '偏压较轻，但旧样本仍会在下一章留下牵引。',
      outcome: 'failed',
      outcomeLabel: '残卷回收',
      outcomeTone: 'selected',
      grantedLine: '洞府回收：残卷样本 1 份',
      summaryLine: '虽然未能结题，但残卷回收仍会在下章留下较轻的后效。'
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
  assert(migrated.fateAftereffectState && typeof migrated.fateAftereffectState === 'object', 'save migration should attach fate aftereffect state');
  assert(Array.isArray(migrated.fateAftereffectState.records), 'migrated fate aftereffect state should include records array');
  assert(Array.isArray(migrated.fateAftereffectState.history), 'migrated fate aftereffect state should include history array');

  const successGame = createGame();
  const missGame = createGame();
  const recoveryGame = createGame();
  const successRecord = successGame.createFateAftereffectFromSanctumAgenda(buildResolvedAgenda('contract_success', 'run_aftereffect_success', 6), { chapterIndex: 6 });
  const missRecord = missGame.createFateAftereffectFromSanctumAgenda(buildResolvedAgenda('contract_miss', 'run_aftereffect_miss', 6), { chapterIndex: 6 });
  const recoveryRecord = recoveryGame.createFateAftereffectFromSanctumAgenda(buildResolvedAgenda('recovery', 'run_aftereffect_recovery', 6), { chapterIndex: 6 });
  assert(successRecord && successRecord.outcomeId === 'contract_success', `contract success should create success aftereffect, got ${JSON.stringify(successRecord)}`);
  assert(missRecord && missRecord.outcomeId === 'contract_miss', `contract miss should create miss aftereffect, got ${JSON.stringify(missRecord)}`);
  assert(recoveryRecord && recoveryRecord.outcomeId === 'recovery', `recovery should create recovery aftereffect, got ${JSON.stringify(recoveryRecord)}`);
  assert(successRecord.summaryLine !== missRecord.summaryLine, 'contract success and contract miss aftereffects should not share the same summary');
  assert(missRecord.summaryLine !== recoveryRecord.summaryLine, 'contract miss and recovery aftereffects should not share the same summary');
  assert(successRecord.durationChapters === 2, `contract success route bias should last 2 chapters, got ${JSON.stringify(successRecord)}`);
  assert(missRecord.durationChapters === 1 && recoveryRecord.durationChapters === 1, `contract miss / recovery route bias should last 1 chapter, got ${JSON.stringify({ missRecord, recoveryRecord })}`);

  const timelineGame = createGame();
  const timelineRecord = timelineGame.createFateAftereffectFromSanctumAgenda(buildResolvedAgenda('contract_success', 'run_aftereffect_timeline', 6), { chapterIndex: 6 });
  const pendingRuntime = timelineGame.getFateAftereffectRuntimeRecord(timelineRecord, { currentChapterIndex: 6 });
  const activeRuntime = timelineGame.getFateAftereffectRuntimeRecord(timelineRecord, { currentChapterIndex: 7 });
  const lateActiveRuntime = timelineGame.getFateAftereffectRuntimeRecord(timelineRecord, { currentChapterIndex: 8 });
  const expiredRuntime = timelineGame.getFateAftereffectRuntimeRecord(timelineRecord, { currentChapterIndex: 9 });
  assert(pendingRuntime.status === 'pending', `new aftereffect should be pending in the source chapter, got ${JSON.stringify(pendingRuntime)}`);
  assert(pendingRuntime.remainingChapters === 2 && pendingRuntime.activationChapterIndex === 7, `pending aftereffect should preserve full duration and next chapter activation, got ${JSON.stringify(pendingRuntime)}`);
  assert(activeRuntime.status === 'active' && activeRuntime.remainingChapters === 2, `aftereffect should activate next chapter with full remaining duration, got ${JSON.stringify(activeRuntime)}`);
  assert(lateActiveRuntime.status === 'active' && lateActiveRuntime.remainingChapters === 1, `aftereffect should tick down after another chapter, got ${JSON.stringify(lateActiveRuntime)}`);
  assert(expiredRuntime.status === 'expired' && expiredRuntime.remainingChapters === 0, `aftereffect should expire after its duration is spent, got ${JSON.stringify(expiredRuntime)}`);
  const activeSnapshot = timelineGame.getFateAftereffectSnapshot({
    latestRunId: 'run_aftereffect_timeline',
    currentChapterIndex: 7
  });
  assert(activeSnapshot && activeSnapshot.activeCount === 1 && activeSnapshot.pendingCount === 0, `snapshot should mark the timeline aftereffect as active next chapter, got ${JSON.stringify(activeSnapshot)}`);
  timelineGame.ensureFateAftereffectState({ pruneExpired: true, currentChapterIndex: 9 });
  assert(Array.isArray(timelineGame.fateAftereffectState.records) && timelineGame.fateAftereffectState.records.length === 0, `expired aftereffect should be pruned out of active records, got ${JSON.stringify(timelineGame.fateAftereffectState)}`);

  const chapterPriorityGame = createGame();
  chapterPriorityGame.createFateAftereffectFromSanctumAgenda(buildResolvedAgenda('contract_success', 'run_aftereffect_priority', 2), { chapterIndex: 2 });
  chapterPriorityGame.runSlateArchive = chapterPriorityGame.normalizeRunSlateArchive([
    buildSlate('run_aftereffect_priority', Date.now(), { chapterIndex: 2 })
  ]);
  chapterPriorityGame.player.realm = 3;
  const chapterPrioritySnapshot = chapterPriorityGame.getFateAftereffectSnapshot({
    latestRunId: 'run_aftereffect_priority'
  });
  assert(chapterPrioritySnapshot && chapterPrioritySnapshot.currentChapterIndex === 3, `chapter priority should use the newer player realm outside expedition state, got ${JSON.stringify(chapterPrioritySnapshot)}`);
  assert(chapterPrioritySnapshot.primary?.status === 'active', `chapter priority should activate the aftereffect once the player reaches the next chapter, got ${JSON.stringify(chapterPrioritySnapshot?.primary)}`);

  const pruneByPlayerRealmGame = createGame();
  pruneByPlayerRealmGame.createFateAftereffectFromSanctumAgenda(buildResolvedAgenda('contract_miss', 'run_aftereffect_prune', 2), { chapterIndex: 2 });
  pruneByPlayerRealmGame.runSlateArchive = pruneByPlayerRealmGame.normalizeRunSlateArchive([
    buildSlate('run_aftereffect_prune', Date.now(), { chapterIndex: 2 })
  ]);
  pruneByPlayerRealmGame.player.realm = 4;
  pruneByPlayerRealmGame.getFateAftereffectSaveState();
  assert(pruneByPlayerRealmGame.fateAftereffectState.records.length === 0, `save pruning should drop expired aftereffects when the player is already beyond the source slate chapter, got ${JSON.stringify(pruneByPlayerRealmGame.fateAftereffectState)}`);

  const historyConsistencyGame = createGame();
  const historyRecord = historyConsistencyGame.createFateAftereffectFromSanctumAgenda(buildResolvedAgenda('contract_miss', 'run_aftereffect_history', 2), { chapterIndex: 2 });
  historyConsistencyGame.createFateAftereffectFromSanctumAgenda(buildResolvedAgenda('contract_success', 'run_aftereffect_other', 5), { chapterIndex: 5 });
  historyConsistencyGame.ensureFateAftereffectState({ pruneExpired: true, currentChapterIndex: 6 });
  const historySnapshot = historyConsistencyGame.getFateAftereffectSnapshot({
    latestRunId: 'run_aftereffect_history',
    currentChapterIndex: 6
  });
  assert(historySnapshot && historySnapshot.primary?.recordId === historyRecord.recordId, `history snapshot should keep the requested run as primary, got ${JSON.stringify(historySnapshot)}`);
  assert(Array.isArray(historySnapshot.records) && historySnapshot.records.length > 0, `history snapshot should still provide records for the requested run, got ${JSON.stringify(historySnapshot)}`);
  assert(historySnapshot.records.every((entry) => entry.sourceRunId === 'run_aftereffect_history'), `history snapshot records should not mix active records from another run, got ${JSON.stringify(historySnapshot.records)}`);
  assert(historySnapshot.records[0].recordId === historySnapshot.primary.recordId, `history snapshot primary should align with its first record, got ${JSON.stringify(historySnapshot)}`);

  const game = createGame();
  ctx.game = game;
  ctx.window.game = game;
  ctx.render_game_to_text = () => game.renderGameToText();
  ctx.window.render_game_to_text = ctx.render_game_to_text;

  const slate = buildSlate('run_aftereffect_payload', Date.now(), { chapterIndex: 6 });
  const agendaResolution = buildResolvedAgenda('contract_success', slate.id, slate.chapterIndex);
  const payloadRecord = game.createFateAftereffectFromSanctumAgenda(agendaResolution, { chapterIndex: slate.chapterIndex });
  game.runSlateArchive = game.normalizeRunSlateArchive([slate]);
  game.persistRunSlateArchive();

  const expeditionPayload = game.getExpeditionPayload();
  assert(expeditionPayload && expeditionPayload.aftereffects && expeditionPayload.aftereffects.summaryLine, `expedition payload should expose fate aftereffects, got ${JSON.stringify(expeditionPayload)}`);
  assert(expeditionPayload.aftereffects.primary && expeditionPayload.aftereffects.primary.recordId === payloadRecord.recordId, `expedition payload should expose the matching primary aftereffect, got ${JSON.stringify(expeditionPayload.aftereffects)}`);
  assert(expeditionPayload.aftereffects.primary.status === 'pending', `expedition payload should keep current-chapter aftereffect pending, got ${JSON.stringify(expeditionPayload.aftereffects.primary)}`);

  game.lastExpeditionRewardMeta = game.buildRewardExpeditionMeta(slate, { agendaResolution });
  const rewardMeta = game.getRewardExpeditionMeta();
  assert(rewardMeta && rewardMeta.aftereffects && rewardMeta.aftereffects.summaryLine, `reward expedition meta should preserve structured aftereffects, got ${JSON.stringify(rewardMeta)}`);
  assert(rewardMeta.aftereffects.primary && rewardMeta.aftereffects.primary.recordId === payloadRecord.recordId, `reward expedition meta should preserve primary aftereffect identity, got ${JSON.stringify(rewardMeta.aftereffects)}`);
  assert(rewardMeta.focusLines.some((line) => /锁线契约|契押/.test(line)), `reward focus lines should keep immediate contract resolution visible, got ${JSON.stringify(rewardMeta.focusLines)}`);
  assert(rewardMeta.breakdown.some((line) => /契约后效：/.test(line)), `reward breakdown should mention aftereffect detail, got ${JSON.stringify(rewardMeta.breakdown)}`);

  const rewardBrief = game.getRewardNarrativeBriefMeta();
  assert(rewardBrief && /第 7 章起生效|后效|界痕/.test(String(rewardBrief.foot || '')), `reward brief should surface aftereffect status or summary in the foot line, got ${JSON.stringify(rewardBrief)}`);

  game.currentScreen = 'reward-screen';
  const renderedPayload = JSON.parse(game.renderGameToText());
  assert(
    renderedPayload?.expedition?.aftereffects?.summaryLine === expeditionPayload.aftereffects.summaryLine,
    `render payload should mirror expedition aftereffects, got ${JSON.stringify(renderedPayload?.expedition?.aftereffects)}`
  );
  assert(
    renderedPayload?.map?.chapter?.aftereffects?.summaryLine === expeditionPayload.aftereffects.summaryLine,
    `render payload chapter mirror should match expedition aftereffects, got ${JSON.stringify(renderedPayload?.map?.chapter?.aftereffects)}`
  );
  assert(
    renderedPayload?.reward?.expedition?.aftereffects?.summaryLine === rewardMeta.aftereffects.summaryLine,
    `reward payload should export structured aftereffects, got ${JSON.stringify(renderedPayload?.reward?.expedition?.aftereffects)}`
  );
  assert(
    renderedPayload?.reward?.expedition?.aftereffects?.primary?.status === rewardMeta.aftereffects.primary.status,
    `reward payload should preserve primary aftereffect runtime status, got ${JSON.stringify(renderedPayload?.reward?.expedition?.aftereffects?.primary)}`
  );

  console.log('sanity_fate_aftereffect_system_checks passed');
})();
