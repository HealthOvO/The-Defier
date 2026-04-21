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

function getExpectedSeasonBoardAction(anchorSection = '') {
  const anchor = String(anchorSection || '').trim();
  switch (anchor) {
    case 'pvp':
      return { action: 'screen', value: 'pvp-screen' };
    case 'endless':
    case 'map':
      return { action: 'screen', value: 'map-screen' };
    case 'challenge':
      return { action: 'challenge', value: 'weekly' };
    default:
      return { action: 'collection', value: anchor || 'sanctum' };
  }
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
        id: 'season_board_test_season',
        name: '天道试锋'
      }),
      getRecentMatchHistory: () => ([
        {
          seasonId: 'season_board_test_season',
          opponentName: '镜池守望者'
        }
      ]),
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
    game.player.collectLaw(LAWS.thunderLaw || Object.values(LAWS)[1]);
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
      score: overrides.score || 286,
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
        trainingAdvice: '继续沿观测锁线压路线贴合与控场节奏。',
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

  if (typeof game.player.setRunPath === 'function') game.player.setRunPath('insight');
  if (typeof game.player.setRunDestiny === 'function') game.player.setRunDestiny('rebelScale', 2);
  if (game.player?.fateRing) {
    game.player.fateRing.getSocketedLaws = () => ['flameTruth', 'thunderLaw'].filter((id) => !!LAWS[id]);
  }

  const freshSlate = buildSlate('season_board_current', Date.now());
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
    completedAt: Date.now() - 2000
  });

  const now = Date.now();
  game.sanctumAgendaState = game.normalizeSanctumAgendaState({
    lastResolved: {
      agendaId: 'season_board_agenda',
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
      focusNodeTypes: ['observatory', 'event', 'memory_rift'],
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
    history: [],
    totalCompleted: 1,
    totalFailed: 0
  });

  game.fateAftereffectState = game.normalizeFateAftereffectState({
    records: [
      {
        recordId: 'season_board_aftereffect',
        icon: '🧭',
        name: '星镜余痕',
        sourceRunId: freshSlate.id,
        sourceAgendaId: 'season_board_agenda',
        sourceLabel: '星镜稳线',
        sourceContractLabel: '星镜锁线',
        templateId: 'route_bias',
        outcomeId: 'contract_success',
        chapterIndex: freshSlate.chapterIndex,
        chapterName: freshSlate.chapterName,
        durationChapters: 2,
        positiveLine: '观星 / 事件 / 裂隙更容易连成同轴路线。',
        negativeLine: '战斗与营地窗口会略少，路线更容易被细线样本牵走。',
        summaryLine: '星镜余痕：契约兑现后，观星锁线会继续牵引下一章路线。',
        detailLine: '来源：星镜稳线 · 契约「星镜锁线」｜正向：观星 / 事件 / 裂隙更容易连成同轴路线。｜代价：战斗与营地窗口会略少，路线更容易被细线样本牵走。',
        createdAt: now - 800
      }
    ],
    history: [],
    lastResolved: {
      recordId: 'season_board_aftereffect',
      icon: '🧭',
      name: '星镜余痕',
      sourceRunId: freshSlate.id,
      sourceAgendaId: 'season_board_agenda',
      sourceLabel: '星镜稳线',
      sourceContractLabel: '星镜锁线',
      templateId: 'route_bias',
      outcomeId: 'contract_success',
      chapterIndex: freshSlate.chapterIndex,
      chapterName: freshSlate.chapterName,
      durationChapters: 2,
      positiveLine: '观星 / 事件 / 裂隙更容易连成同轴路线。',
      negativeLine: '战斗与营地窗口会略少，路线更容易被细线样本牵走。',
      summaryLine: '星镜余痕：契约兑现后，观星锁线会继续牵引下一章路线。',
      detailLine: '来源：星镜稳线 · 契约「星镜锁线」｜正向：观星 / 事件 / 裂隙更容易连成同轴路线。｜代价：战斗与营地窗口会略少，路线更容易被细线样本牵走。',
      createdAt: now - 800
    }
  });

  const weeklyBundle = game.buildChallengeBundle('weekly', new Date());
  const weeklyEntry = game.getChallengeProgressEntry('weekly', weeklyBundle.rotationKey, true);
  weeklyEntry.totalScore = 820;
  if (typeof game.saveChallengeProgressState === 'function') game.saveChallengeProgressState();

  const endlessState = game.ensureEndlessState();
  const currentWeekTag = game.getHeavenlyMandateWeekMeta().weekTag;
  endlessState.currentCycle = 2;
  endlessState.seasonWeekTag = currentWeekTag;
  endlessState.seasonCycleClears = 1;
  endlessState.seasonScore = 180;

  const seasonBoard = game.getSeasonBoardSnapshot({ latestSlate: freshSlate });
  assert(seasonBoard, 'season board snapshot should exist');
  assert(seasonBoard.phaseId === 'ranking', `season board should enter ranking phase, got ${JSON.stringify(seasonBoard)}`);
  assert(
    seasonBoard.lanes.map((lane) => lane.id).join(',') === 'training,expedition,verification',
    `season board should keep stable lane ids, got ${JSON.stringify(seasonBoard.lanes)}`
  );
  assert(
    seasonBoard.completedTaskCount === 5 && seasonBoard.totalTaskCount === 6,
    `season board should report deterministic progress totals, got ${JSON.stringify(seasonBoard)}`
  );
  assert(
    /路线引导：/.test(String(seasonBoard.guideLine || '')),
    `season board guide should surface route guidance, got ${JSON.stringify(seasonBoard)}`
  );
  assert(
    seasonBoard.settlement?.outcomeLabel === '正卷',
    `season board should classify the ranking snapshot as a positive sheet once cross-mode verification exists, got ${JSON.stringify(seasonBoard?.settlement)}`
  );
  assert(
    !seasonBoard.debtPack,
    `season board should not emit a debt pack for a settled positive sheet, got ${JSON.stringify(seasonBoard?.debtPack)}`
  );
  assert(
    Array.isArray(seasonBoard.verificationOrders) && seasonBoard.verificationOrders.length === 2,
    `season board should expose verification orders in ranking phase, got ${JSON.stringify(seasonBoard?.verificationOrders)}`
  );
  assert(
    seasonBoard.verificationOrders?.[1]?.anchorSection === 'challenge'
      && /七日劫数|挑战/.test(String(seasonBoard.verificationOrders?.[1]?.label || '')),
    `positive ranking board should expose challenge as the optional side verification, got ${JSON.stringify(seasonBoard?.verificationOrders)}`
  );
  assert(
    seasonBoard.verificationOrders?.[0]?.role === 'primary'
      && seasonBoard.verificationOrders?.[1]?.role === 'side',
    `season board verification orders should expose explicit primary/side roles, got ${JSON.stringify(seasonBoard?.verificationOrders)}`
  );
  assert(
    seasonBoard.weekVerdictLedger?.current?.settlementOutcomeId === 'positive_sheet'
      && seasonBoard.weekVerdictLedger?.current?.primaryVerificationOrderId === seasonBoard.verificationOrders?.[0]?.id
      && seasonBoard.weekVerdictLedger?.current?.sideVerificationOrderId === seasonBoard.verificationOrders?.[1]?.id
      && !seasonBoard.weekVerdictLedger?.current?.debtPackId,
    `positive ranking board should expose a current-week verdict ledger, got ${JSON.stringify(seasonBoard?.weekVerdictLedger)}`
  );
  const rankingRouteShift = game.getSeasonBoardWeightShift({ latestSlate: freshSlate });
  assert(
    rankingRouteShift && rankingRouteShift.trial > 0 && rankingRouteShift.enemy > 0,
    `ranking-phase season board should expose a verification route shift, got ${JSON.stringify(rankingRouteShift)}`
  );

  const rewardMeta = game.buildRewardExpeditionMeta(freshSlate);
  game.lastExpeditionRewardMeta = rewardMeta;
  const normalizedRewardMeta = game.getRewardExpeditionMeta();
  assert(normalizedRewardMeta?.seasonBoard, `reward expedition meta should carry season board, got ${JSON.stringify(normalizedRewardMeta)}`);
  assert(
    normalizedRewardMeta.seasonBoard.phaseId === 'ranking',
    `reward expedition season board should stay in ranking phase, got ${JSON.stringify(normalizedRewardMeta.seasonBoard)}`
  );
  assert(
    normalizedRewardMeta.seasonBoard?.settlement?.outcomeLabel === '正卷',
    `reward expedition season board should keep the positive settlement snapshot, got ${JSON.stringify(normalizedRewardMeta?.seasonBoard)}`
  );

  const rewardBrief = game.getRewardNarrativeBriefMeta();
  assert(
    rewardBrief?.kicker === '赛季裁定',
    `reward brief should switch the expedition surface into season settlement mode, got ${JSON.stringify(rewardBrief)}`
  );
  assert(
    rewardBrief?.title?.includes(normalizedRewardMeta.seasonBoard.settlement.outcomeLabel || ''),
    `reward brief title should carry the settlement outcome label, got ${JSON.stringify(rewardBrief)}`
  );
  assert(
    rewardBrief?.body === (
      normalizedRewardMeta.seasonBoard.verificationOrders?.[0]?.summaryLine
      || normalizedRewardMeta.seasonBoard.verificationOrders?.[0]?.hintLine
      || normalizedRewardMeta.seasonBoard.summaryLine
    ),
    `reward brief should prioritize the primary verification action, got ${JSON.stringify(rewardBrief)}`
  );
  assert(
    !!rewardBrief?.foot
      && rewardBrief.foot.includes(
        normalizedRewardMeta.seasonBoard.verificationOrders?.[0]?.statusLine
          || normalizedRewardMeta.seasonBoard.statusLine
          || ''
      ),
    `reward brief foot should surface the verification progress/status line, got ${JSON.stringify(rewardBrief)}`
  );

  const expeditionPayload = game.getExpeditionPayload();
  assert(expeditionPayload?.seasonBoard, `expedition payload should include season board, got ${JSON.stringify(expeditionPayload)}`);
  assert(
    expeditionPayload.seasonBoard.phaseId === 'ranking',
    `expedition payload season board should stay in ranking phase, got ${JSON.stringify(expeditionPayload.seasonBoard)}`
  );
  assert(
    expeditionPayload.seasonBoard?.settlement?.outcomeLabel === '正卷',
    `expedition payload season board should mirror positive settlement state, got ${JSON.stringify(expeditionPayload.seasonBoard)}`
  );

  const sanctumData = game.getSanctumOverviewData();
  assert(sanctumData?.seasonBoard, `sanctum data should include season board, got ${JSON.stringify(sanctumData)}`);
  assert(
    sanctumData.progress?.seasonBoardPhaseLabel === '定榜期',
    `sanctum progress should expose season board phase, got ${JSON.stringify(sanctumData.progress)}`
  );
  assert(
    Array.isArray(sanctumData.goals) && sanctumData.goals.some((goal) => /季押卷/.test(String(goal.title || ''))),
    `sanctum goals should surface a season settlement goal, got ${JSON.stringify(sanctumData?.goals)}`
  );
  assert(
    Array.isArray(sanctumData.goals) && sanctumData.goals.some((goal) => /结业验证状/.test(String(goal.title || ''))),
    `sanctum goals should surface a season verification goal, got ${JSON.stringify(sanctumData?.goals)}`
  );
  assert(
    Array.isArray(sanctumData.goals) && sanctumData.goals.some((goal) => /旁验证状/.test(String(goal.title || ''))),
    `sanctum goals should surface an optional side verification goal, got ${JSON.stringify(sanctumData?.goals)}`
  );
  const positiveVerificationGoal = Array.isArray(sanctumData.goals)
    ? sanctumData.goals.find((goal) => /^season_board_verification_goal_/.test(String(goal.id || '')))
    : null;
  const positiveSideVerificationGoal = Array.isArray(sanctumData.goals)
    ? sanctumData.goals.find((goal) => /^season_board_side_verification_goal_/.test(String(goal.id || '')))
    : null;
  const expectedPositiveVerificationAction = getExpectedSeasonBoardAction(sanctumData?.seasonBoard?.verificationOrders?.[0]?.anchorSection);
  const expectedPositiveSideVerificationAction = getExpectedSeasonBoardAction(sanctumData?.seasonBoard?.verificationOrders?.[1]?.anchorSection);
  assert(
    positiveVerificationGoal?.action === expectedPositiveVerificationAction.action
      && positiveVerificationGoal?.value === expectedPositiveVerificationAction.value,
    `positive sanctum verification goal should route to the verification surface, got ${JSON.stringify(positiveVerificationGoal)}`
  );
  assert(
    positiveSideVerificationGoal?.action === expectedPositiveSideVerificationAction.action
      && positiveSideVerificationGoal?.value === expectedPositiveSideVerificationAction.value,
    `positive sanctum side verification goal should route to the challenge surface, got ${JSON.stringify(positiveSideVerificationGoal)}`
  );
  assert(
    Array.isArray(sanctumData.researches) && sanctumData.researches.some((research) => /季押卷/.test(String(research.name || ''))),
    `sanctum researches should surface a season settlement research item, got ${JSON.stringify(sanctumData?.researches)}`
  );
  const positiveVerificationResearch = Array.isArray(sanctumData.researches)
    ? sanctumData.researches.find((research) => /^season_board_verification_/.test(String(research.id || '')))
    : null;
  const positiveSideVerificationResearch = Array.isArray(sanctumData.researches)
    ? sanctumData.researches.find((research) => /^season_board_side_verification_/.test(String(research.id || '')))
    : null;
  assert(
    positiveVerificationResearch?.actionType === expectedPositiveVerificationAction.action
      && positiveVerificationResearch?.actionValue === expectedPositiveVerificationAction.value,
    `positive sanctum verification research should route to the verification surface, got ${JSON.stringify(positiveVerificationResearch)}`
  );
  assert(
    positiveSideVerificationResearch?.actionType === expectedPositiveSideVerificationAction.action
      && positiveSideVerificationResearch?.actionValue === expectedPositiveSideVerificationAction.value,
    `positive sanctum side verification research should route to the challenge surface, got ${JSON.stringify(positiveSideVerificationResearch)}`
  );

  const buildSnapshot = game.getBuildSnapshotData();
  assert(buildSnapshot?.seasonBoard, `build snapshot should include season board, got ${JSON.stringify(buildSnapshot)}`);
  assert(
    Array.isArray(buildSnapshot.strengths) && buildSnapshot.strengths.some((line) => /赛季押卷/.test(String(line || ''))),
    `build snapshot strengths should mention the season settlement result, got ${JSON.stringify(buildSnapshot.strengths)}`
  );
  assert(
    Array.isArray(buildSnapshot.nextTargets) && buildSnapshot.nextTargets.some((line) => /赛季天道盘/.test(String(line || ''))),
    `build snapshot next targets should mention season board, got ${JSON.stringify(buildSnapshot.nextTargets)}`
  );
  assert(
    Array.isArray(buildSnapshot.nextTargets) && buildSnapshot.nextTargets.some((line) => /结业验证/.test(String(line || ''))),
    `build snapshot next targets should surface the primary verification order, got ${JSON.stringify(buildSnapshot.nextTargets)}`
  );
  assert(
    Array.isArray(buildSnapshot.nextTargets) && buildSnapshot.nextTargets.some((line) => /旁验证|七日劫数/.test(String(line || ''))),
    `build snapshot next targets should surface the optional side verification order, got ${JSON.stringify(buildSnapshot.nextTargets)}`
  );

  game.currentScreen = 'reward-screen';
  const payload = JSON.parse(game.renderGameToText());
  assert(
    payload?.reward?.expedition?.seasonBoard,
    `reward payload should include reward.expedition.seasonBoard, got ${JSON.stringify(payload?.reward)}`
  );
  assert(
    payload?.reward?.expedition?.seasonBoard?.settlement?.outcomeLabel === '正卷',
    `reward payload should mirror positive settlement state, got ${JSON.stringify(payload?.reward?.expedition?.seasonBoard)}`
  );
  assert(
    payload?.expedition?.seasonBoard,
    `render payload should include expedition.seasonBoard, got ${JSON.stringify(payload?.expedition)}`
  );
  assert(
    payload?.map?.chapter?.seasonBoard,
    `render payload should mirror season board into map.chapter, got ${JSON.stringify(payload?.map?.chapter)}`
  );
  assert(
    payload.map.chapter.seasonBoard.phaseId === payload.expedition.seasonBoard.phaseId,
    `map.chapter season board should mirror expedition season board, got ${JSON.stringify(payload.map.chapter.seasonBoard)} vs ${JSON.stringify(payload.expedition.seasonBoard)}`
  );
  assert(
    JSON.stringify(payload?.reward?.expedition?.seasonBoard?.settlement || null) === JSON.stringify(payload?.expedition?.seasonBoard?.settlement || null)
      && JSON.stringify(payload?.reward?.expedition?.seasonBoard?.settlement || null) === JSON.stringify(payload?.map?.chapter?.seasonBoard?.settlement || null),
    `reward / expedition / map payload should mirror settlement state, got ${JSON.stringify(payload?.reward?.expedition?.seasonBoard)} vs ${JSON.stringify(payload?.expedition?.seasonBoard)} vs ${JSON.stringify(payload?.map?.chapter?.seasonBoard)}`
  );
  assert(
    JSON.stringify(payload?.reward?.expedition?.seasonBoard?.verificationOrders || []) === JSON.stringify(payload?.expedition?.seasonBoard?.verificationOrders || [])
      && JSON.stringify(payload?.reward?.expedition?.seasonBoard?.verificationOrders || []) === JSON.stringify(payload?.map?.chapter?.seasonBoard?.verificationOrders || []),
    `reward / expedition / map payload should mirror verification orders, got ${JSON.stringify(payload?.reward?.expedition?.seasonBoard)} vs ${JSON.stringify(payload?.expedition?.seasonBoard)} vs ${JSON.stringify(payload?.map?.chapter?.seasonBoard)}`
  );
  assert(
    JSON.stringify(payload?.reward?.expedition?.seasonBoard?.weekVerdictLedger || null) === JSON.stringify(payload?.expedition?.seasonBoard?.weekVerdictLedger || null)
      && JSON.stringify(payload?.reward?.expedition?.seasonBoard?.weekVerdictLedger || null) === JSON.stringify(payload?.map?.chapter?.seasonBoard?.weekVerdictLedger || null),
    `reward / expedition / map payload should mirror week verdict ledger state, got ${JSON.stringify(payload?.reward?.expedition?.seasonBoard)} vs ${JSON.stringify(payload?.expedition?.seasonBoard)} vs ${JSON.stringify(payload?.map?.chapter?.seasonBoard)}`
  );

  const originalPvpSeasonMeta = ctx.PVPService.getCurrentSeasonMeta;
  const originalPvpRecentMatchHistory = ctx.PVPService.getRecentMatchHistory;
  const resetStorages = () => {
    ctx.localStorage = createStorage();
    ctx.sessionStorage = createStorage();
    ctx.window.localStorage = ctx.localStorage;
    ctx.window.sessionStorage = ctx.sessionStorage;
  };

  ctx.PVPService.getRecentMatchHistory = () => [];
  resetStorages();
  const samplingGame = createGame();
  const samplingBoard = samplingGame.getSeasonBoardSnapshot();
  assert(
    samplingBoard.phaseId === 'sampling',
    `season board should stay in sampling phase without weekly, slate, agenda, endless or pvp signals, got ${JSON.stringify(samplingBoard)}`
  );

  resetStorages();
  const locklineGame = createGame();
  const locklineSlate = buildSlate('season_board_lockline', Date.now(), {
    ratingLabel: '样本入档',
    ratingTone: 'selected',
    score: 188
  });
  locklineGame.runSlateArchive = locklineGame.normalizeRunSlateArchive([locklineSlate]);
  locklineGame.persistRunSlateArchive();
  const locklineFocus = locklineGame.buildObservatoryTrainingFocusFromSlate(locklineSlate);
  locklineGame.setObservatoryTrainingFocus(locklineFocus, { silent: true });
  const locklineBoard = locklineGame.getSeasonBoardSnapshot({ latestSlate: locklineSlate });
  assert(
    locklineBoard.phaseId === 'lockline',
    `season board should stay in lockline phase when only training and slate signals are ready, got ${JSON.stringify(locklineBoard)}`
  );
  assert(
    locklineBoard.settlement?.outcomeId === 'locking_sheet' && locklineBoard.settlement?.outcomeLabel === '押卷中',
    `lockline season board should classify the snapshot as a locking sheet, got ${JSON.stringify(locklineBoard?.settlement)}`
  );
  assert(
    !locklineBoard.debtPack,
    `lockline season board should not emit a debt pack, got ${JSON.stringify(locklineBoard?.debtPack)}`
  );
  assert(
    locklineBoard.nextTask?.label && locklineBoard.nextTask?.hintLine,
    `lockline season board should keep a next-task action available, got ${JSON.stringify(locklineBoard?.nextTask)}`
  );
  assert(
    locklineBoard.nextTask?.id === 'season_commitment'
      && locklineBoard.nextTask?.laneId === 'expedition'
      && locklineBoard.nextTask?.anchorSection === 'sanctum',
    `lockline season board should prioritize the expedition commitment action, got ${JSON.stringify(locklineBoard?.nextTask)}`
  );
  assert(
    /路线引导：/.test(String(locklineBoard.guideLine || '')),
    `lockline season board should include route guidance, got ${JSON.stringify(locklineBoard)}`
  );
  const locklineRouteShift = locklineGame.getSeasonBoardWeightShift({ latestSlate: locklineSlate });
  assert(
    locklineRouteShift && locklineRouteShift.observatory > 0 && locklineRouteShift.memory_rift > 0,
    `lockline season board should bias training-facing nodes, got ${JSON.stringify(locklineRouteShift)}`
  );
  const locklineRewardMeta = locklineGame.buildRewardExpeditionMeta(locklineSlate);
  locklineGame.lastExpeditionRewardMeta = locklineRewardMeta;
  const normalizedLocklineRewardMeta = locklineGame.getRewardExpeditionMeta();
  assert(
    normalizedLocklineRewardMeta?.seasonBoard?.phaseId === 'lockline',
    `lockline reward expedition meta should stay in lockline phase, got ${JSON.stringify(normalizedLocklineRewardMeta?.seasonBoard)}`
  );
  assert(
    normalizedLocklineRewardMeta?.seasonBoard?.settlement?.outcomeId === 'locking_sheet',
    `lockline reward expedition meta should keep the locking settlement snapshot, got ${JSON.stringify(normalizedLocklineRewardMeta?.seasonBoard)}`
  );
  assert(
    normalizedLocklineRewardMeta?.seasonBoard?.nextTask?.label === locklineBoard.nextTask?.label,
    `lockline reward expedition meta should preserve the next-task action, got ${JSON.stringify(normalizedLocklineRewardMeta?.seasonBoard?.nextTask)}`
  );
  const locklineRewardBrief = locklineGame.getRewardNarrativeBriefMeta();
  assert(
    locklineRewardBrief?.kicker === '赛季裁定',
    `lockline reward brief should switch the expedition surface into season settlement mode, got ${JSON.stringify(locklineRewardBrief)}`
  );
  assert(
    locklineRewardBrief?.title?.includes(normalizedLocklineRewardMeta.seasonBoard.settlement?.outcomeLabel || ''),
    `lockline reward brief title should carry the locking settlement label, got ${JSON.stringify(locklineRewardBrief)}`
  );
  assert(
    locklineRewardBrief?.body === (
      normalizedLocklineRewardMeta.seasonBoard.nextTask?.hintLine
      || (normalizedLocklineRewardMeta.seasonBoard.nextTask?.label
        ? `当前押卷行动：${normalizedLocklineRewardMeta.seasonBoard.nextTask.label}`
        : '')
      || normalizedLocklineRewardMeta.seasonBoard.settlement?.summaryLine
      || normalizedLocklineRewardMeta.seasonBoard.summaryLine
    ),
    `lockline reward brief should prioritize the next-task action, got ${JSON.stringify(locklineRewardBrief)}`
  );
  assert(
    !!locklineRewardBrief?.foot
      && (
        locklineRewardBrief.foot.includes(normalizedLocklineRewardMeta.seasonBoard.nextTask?.progressText || '')
        || locklineRewardBrief.foot.includes(normalizedLocklineRewardMeta.seasonBoard.nextTask?.statusLine || '')
      ),
    `lockline reward brief foot should surface next-task progress or status, got ${JSON.stringify(locklineRewardBrief)}`
  );
  const locklineExpeditionPayload = locklineGame.getExpeditionPayload();
  assert(
    locklineExpeditionPayload?.seasonBoard?.settlement?.outcomeId === 'locking_sheet',
    `lockline expedition payload should mirror locking settlement state, got ${JSON.stringify(locklineExpeditionPayload?.seasonBoard)}`
  );
  assert(
    locklineExpeditionPayload?.seasonBoard?.nextTask?.label === locklineBoard.nextTask?.label,
    `lockline expedition payload should mirror next-task state, got ${JSON.stringify(locklineExpeditionPayload?.seasonBoard)}` 
  );
  locklineGame.currentScreen = 'reward-screen';
  const locklinePayload = JSON.parse(locklineGame.renderGameToText());
  assert(
    locklinePayload?.reward?.expedition?.seasonBoard?.settlement?.outcomeId === 'locking_sheet',
    `lockline reward payload should mirror locking settlement state, got ${JSON.stringify(locklinePayload?.reward?.expedition?.seasonBoard)}`
  );
  assert(
    locklinePayload?.expedition?.seasonBoard?.settlement?.outcomeId === 'locking_sheet',
    `lockline render payload should include expedition season board mirror, got ${JSON.stringify(locklinePayload?.expedition?.seasonBoard)}`
  );
  assert(
    locklinePayload?.map?.chapter?.seasonBoard?.settlement?.outcomeId === 'locking_sheet',
    `lockline render payload should mirror season board into map.chapter, got ${JSON.stringify(locklinePayload?.map?.chapter?.seasonBoard)}`
  );
  assert(
    JSON.stringify(locklinePayload?.reward?.expedition?.seasonBoard?.settlement || null) === JSON.stringify(locklinePayload?.expedition?.seasonBoard?.settlement || null)
      && JSON.stringify(locklinePayload?.reward?.expedition?.seasonBoard?.settlement || null) === JSON.stringify(locklinePayload?.map?.chapter?.seasonBoard?.settlement || null),
    `lockline reward / expedition / map payload should mirror settlement state, got ${JSON.stringify(locklinePayload?.reward?.expedition?.seasonBoard)} vs ${JSON.stringify(locklinePayload?.expedition?.seasonBoard)} vs ${JSON.stringify(locklinePayload?.map?.chapter?.seasonBoard)}`
  );
  assert(
    JSON.stringify(locklinePayload?.reward?.expedition?.seasonBoard?.nextTask || null) === JSON.stringify(locklinePayload?.expedition?.seasonBoard?.nextTask || null)
      && JSON.stringify(locklinePayload?.reward?.expedition?.seasonBoard?.nextTask || null) === JSON.stringify(locklinePayload?.map?.chapter?.seasonBoard?.nextTask || null),
    `lockline reward / expedition / map payload should mirror next-task state, got ${JSON.stringify(locklinePayload?.reward?.expedition?.seasonBoard)} vs ${JSON.stringify(locklinePayload?.expedition?.seasonBoard)} vs ${JSON.stringify(locklinePayload?.map?.chapter?.seasonBoard)}`
  );
  const locklineNextTaskNeedle = locklineBoard.nextTask?.hintLine || locklineBoard.nextTask?.label || '';
  const locklineSanctumData = locklineGame.getSanctumOverviewData();
  assert(
    locklineSanctumData?.seasonBoard?.nextTask?.id === 'season_commitment',
    `lockline sanctum data should preserve the next-task action, got ${JSON.stringify(locklineSanctumData?.seasonBoard)}`
  );
  assert(
    Array.isArray(locklineSanctumData.goals)
      && locklineSanctumData.goals.some((goal) => /季押卷/.test(String(goal.title || '')) && /押卷中/.test(`${String(goal.title || '')} ${String(goal.note || '')}`)),
    `lockline sanctum goals should keep the locking settlement visible, got ${JSON.stringify(locklineSanctumData?.goals)}`
  );
  assert(
    Array.isArray(locklineSanctumData.goals)
      && locklineSanctumData.goals.some((goal) => /^season_board_next_task_goal_/.test(String(goal.id || '')) && String(goal.title || '').includes(locklineBoard.nextTask?.label || '')),
    `lockline sanctum goals should surface the current next-task action, got ${JSON.stringify(locklineSanctumData?.goals)}`
  );
  assert(
    Array.isArray(locklineSanctumData.goals)
      && !locklineSanctumData.goals.some((goal) => /^season_board_verification_goal_/.test(String(goal.id || '')) || /结业验证状/.test(String(goal.title || ''))),
    `lockline sanctum goals should hide verification goals before ranking, got ${JSON.stringify(locklineSanctumData?.goals)}`
  );
  assert(
    Array.isArray(locklineSanctumData.researches)
      && locklineSanctumData.researches.some((research) => /^season_board_next_task_/.test(String(research.id || '')) && String(research.name || '').includes(locklineBoard.nextTask?.label || '')),
    `lockline sanctum researches should surface the current next-task action, got ${JSON.stringify(locklineSanctumData?.researches)}`
  );
  assert(
    Array.isArray(locklineSanctumData.researches)
      && !locklineSanctumData.researches.some((research) => /^season_board_verification_/.test(String(research.id || '')) || /结业验证状/.test(String(research.name || ''))),
    `lockline sanctum researches should hide verification items before ranking, got ${JSON.stringify(locklineSanctumData?.researches)}`
  );
  const locklineBuildSnapshot = locklineGame.getBuildSnapshotData();
  assert(
    locklineBuildSnapshot?.seasonBoard?.nextTask?.id === 'season_commitment',
    `lockline build snapshot should preserve the next-task action, got ${JSON.stringify(locklineBuildSnapshot?.seasonBoard)}`
  );
  assert(
    Array.isArray(locklineBuildSnapshot.nextTargets)
      && locklineBuildSnapshot.nextTargets.some((line) => /季盘推进/.test(String(line || '')) && String(line || '').includes(locklineNextTaskNeedle)),
    `lockline build snapshot should surface the next-task action instead of a verification prompt, got ${JSON.stringify(locklineBuildSnapshot?.nextTargets)}`
  );
  assert(
    Array.isArray(locklineBuildSnapshot.nextTargets)
      && !locklineBuildSnapshot.nextTargets.some((line) => /结业验证|外场验证|高压验证/.test(String(line || ''))),
    `lockline build snapshot should not surface verification follow-up before ranking, got ${JSON.stringify(locklineBuildSnapshot?.nextTargets)}`
  );
  assert(
    Array.isArray(locklineBuildSnapshot.priorityQueue)
      && locklineBuildSnapshot.priorityQueue.some((entry) => entry.label === '季盘推进' && String(entry.detail || '').includes(locklineNextTaskNeedle)),
    `lockline build snapshot priority queue should prioritize the current season-board action, got ${JSON.stringify(locklineBuildSnapshot?.priorityQueue)}`
  );

  resetStorages();
  const rankingLockedGame = createGame();
  const rankingLockedSlate = buildSlate('season_board_ranking_locked', Date.now(), {
    ratingLabel: '定榜样本',
    score: 233
  });
  rankingLockedGame.runSlateArchive = rankingLockedGame.normalizeRunSlateArchive([rankingLockedSlate]);
  rankingLockedGame.persistRunSlateArchive();
  const rankingLockedFocus = rankingLockedGame.buildObservatoryTrainingFocusFromSlate(rankingLockedSlate);
  rankingLockedGame.setObservatoryTrainingFocus(rankingLockedFocus, { silent: true });
  rankingLockedGame.sanctumAgendaState = rankingLockedGame.normalizeSanctumAgendaState({
    activeAgenda: {
      agendaId: 'season_board_ranking_lock',
      icon: '🧮',
      name: '镜火押卷',
      sourceRunId: rankingLockedSlate.id,
      sourceTitle: '镜火试锋',
      themeKey: 'oracle',
      themeLabel: '推演控场',
      focusNodeTypes: ['observatory', 'event', 'memory_rift'],
      focusNodeLine: '优先节点：观星 / 事件 / 裂隙',
      progress: 1,
      target: 2,
      phaseLabel: '推进中',
      phaseLine: '沿观星 / 事件 / 裂隙继续压卷。',
      selectedContractLabel: '镜火锁线',
      selectedContractLine: '锁定观星 / 事件 / 裂隙线路。',
      boundChapterIndex: rankingLockedSlate.chapterIndex,
      updatedAt: Date.now() - 500
    },
    lastResolved: null,
    history: [],
    totalCompleted: 0,
    totalFailed: 0
  });
  const rankingLockedEndlessState = rankingLockedGame.ensureEndlessState();
  rankingLockedEndlessState.currentCycle = 1;
  rankingLockedEndlessState.seasonWeekTag = rankingLockedGame.getHeavenlyMandateWeekMeta().weekTag;
  rankingLockedEndlessState.seasonCycleClears = 1;
  rankingLockedEndlessState.seasonScore = 140;
  ctx.PVPService.getCurrentSeasonMeta = () => ({
    id: 'season_board_ranking_locked',
    name: '镜战定榜'
  });
  ctx.PVPService.getRecentMatchHistory = () => ([
    {
      seasonId: 'season_board_ranking_locked',
      opponentName: '定榜镜像'
    }
  ]);
  const rankingLockedBoard = rankingLockedGame.getSeasonBoardSnapshot({ latestSlate: rankingLockedSlate });
  assert(
    rankingLockedBoard.phaseId === 'ranking',
    `season board should still enter ranking phase when cross-mode signals are ready, got ${JSON.stringify(rankingLockedBoard)}`
  );
  assert(
    /不再额外改写地图权重/.test(String(rankingLockedBoard.guideLine || '')),
    `ranking phase with locked agenda should explain that season board no longer adds weight shift, got ${JSON.stringify(rankingLockedBoard)}`
  );
  const rankingLockedRouteShift = rankingLockedGame.getSeasonBoardWeightShift({ latestSlate: rankingLockedSlate });
  assert(
    rankingLockedRouteShift === null,
    `ranking phase should not add extra season-board map bias when agenda focus nodes are already locked, got ${JSON.stringify(rankingLockedRouteShift)}`
  );

  resetStorages();
  const rankingOpenGame = createGame();
  const rankingOpenSlate = buildSlate('season_board_ranking_open', Date.now(), {
    ratingLabel: '定榜样本',
    score: 219
  });
  rankingOpenGame.runSlateArchive = rankingOpenGame.normalizeRunSlateArchive([rankingOpenSlate]);
  rankingOpenGame.persistRunSlateArchive();
  const rankingOpenFocus = rankingOpenGame.buildObservatoryTrainingFocusFromSlate(rankingOpenSlate);
  rankingOpenGame.setObservatoryTrainingFocus(rankingOpenFocus, { silent: true });
  const rankingOpenEndlessState = rankingOpenGame.ensureEndlessState();
  rankingOpenEndlessState.currentCycle = 1;
  rankingOpenEndlessState.seasonWeekTag = rankingOpenGame.getHeavenlyMandateWeekMeta().weekTag;
  rankingOpenEndlessState.seasonCycleClears = 1;
  rankingOpenEndlessState.seasonScore = 155;
  ctx.PVPService.getCurrentSeasonMeta = () => ({
    id: 'season_board_ranking_open',
    name: '开天试锋'
  });
  ctx.PVPService.getRecentMatchHistory = () => ([
    {
      seasonId: 'season_board_ranking_open',
      opponentName: '开天镜像'
    }
  ]);
  const rankingOpenBoard = rankingOpenGame.getSeasonBoardSnapshot({ latestSlate: rankingOpenSlate });
  assert(
    rankingOpenBoard.phaseId === 'ranking',
    `season board should enter ranking phase when only cross-mode verification signals are ready, got ${JSON.stringify(rankingOpenBoard)}`
  );
  assert(
    /试炼 \/ 精英 \/ 战斗 \/ 禁术/.test(String(rankingOpenBoard.guideLine || '')),
    `ranking guide should surface the full verification node set, got ${JSON.stringify(rankingOpenBoard)}`
  );
  const rankingOpenRouteShift = rankingOpenGame.getSeasonBoardWeightShift({ latestSlate: rankingOpenSlate });
  assert(
    rankingOpenRouteShift
      && rankingOpenRouteShift.trial > 0
      && rankingOpenRouteShift.enemy > 0
      && rankingOpenRouteShift.forbidden_altar > 0,
    `ranking phase without agenda lock should keep verification route shift, got ${JSON.stringify(rankingOpenRouteShift)}`
  );
  assert(
    rankingOpenBoard.settlement?.outcomeLabel === '正卷',
    `ranking phase with verification signals should classify the board as a positive sheet, got ${JSON.stringify(rankingOpenBoard?.settlement)}`
  );

  resetStorages();
  const debtGame = createGame();
  const debtSlate = buildSlate('season_board_debt_pack', Date.now() - (8 * 24 * 60 * 60 * 1000), {
    ratingLabel: '留痕待补',
    ratingTone: 'selected',
    score: 202
  });
  debtGame.runSlateArchive = debtGame.normalizeRunSlateArchive([debtSlate]);
  debtGame.persistRunSlateArchive();
  const debtFocus = debtGame.buildObservatoryTrainingFocusFromSlate(debtSlate);
  debtGame.setObservatoryTrainingFocus(debtFocus, { silent: true });
  debtGame.sanctumAgendaState = debtGame.normalizeSanctumAgendaState({
    lastResolved: {
      agendaId: 'season_board_debt_agenda',
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
  debtEndlessState.seasonWeekTag = debtGame.getHeavenlyMandateWeekMeta().weekTag;
  debtEndlessState.seasonCycleClears = 1;
  debtEndlessState.seasonScore = 132;
  const debtBoard = debtGame.getSeasonBoardSnapshot({ latestSlate: debtSlate });
  assert(
    debtBoard.phaseId === 'ranking',
    `debt-board fixture should still enter ranking phase via cross-mode signals, got ${JSON.stringify(debtBoard)}`
  );
  assert(
    debtBoard.settlement?.outcomeLabel === '欠卷',
    `ranking debt board should classify the sheet as debt, got ${JSON.stringify(debtBoard?.settlement)}`
  );
  assert(
    debtBoard.debtPack?.summaryLine && /研究债账|镜债/.test(String(debtBoard.debtPack.summaryLine || '')),
    `ranking debt board should expose a debt pack summary, got ${JSON.stringify(debtBoard?.debtPack)}`
  );
  assert(
    debtBoard.debtPack?.status === 'deferred'
      && debtBoard.debtPack?.deferCount >= 1
      && debtBoard.debtPack?.carryIntoWeekTag === debtBoard.weekTag
      && debtBoard.debtPack?.openedWeekTag
      && debtBoard.debtPack?.openedWeekTag !== debtBoard.weekTag,
    `ranking debt board should expose cross-week debt lifecycle fields, got ${JSON.stringify(debtBoard?.debtPack)}`
  );
  assert(
    debtBoard.debtPack?.occupiesStrongSlot
      && !!debtBoard.debtPack?.occupiedMandateTaskId,
    `ranking debt board should reserve a mandate strong slot for debt clearing, got ${JSON.stringify(debtBoard?.debtPack)}`
  );
  assert(
    Array.isArray(debtBoard.verificationOrders)
      && debtBoard.verificationOrders[0]?.label
      && /欠卷|清/.test(String(debtBoard.verificationOrders[0].label || '')),
    `ranking debt board should prioritize a debt-clearing verification order, got ${JSON.stringify(debtBoard?.verificationOrders)}`
  );
  assert(
    debtBoard.verificationOrders?.length === 2,
    `ranking debt board should keep one primary and one follow-up verification order, got ${JSON.stringify(debtBoard?.verificationOrders)}`
  );
  assert(
    debtBoard.verificationOrders?.[0]?.role === 'primary'
      && debtBoard.verificationOrders?.[1]?.role === 'side',
    `ranking debt board should expose explicit primary/side verification roles, got ${JSON.stringify(debtBoard?.verificationOrders)}`
  );
  assert(
    debtBoard.weekVerdictLedger?.current?.settlementOutcomeId === 'debt_sheet'
      && debtBoard.weekVerdictLedger?.current?.debtPackId === debtBoard.debtPack?.id
      && debtBoard.weekVerdictLedger?.current?.deferCount === debtBoard.debtPack?.deferCount,
    `ranking debt board should expose a current-week verdict ledger that matches the debt pack, got ${JSON.stringify(debtBoard?.weekVerdictLedger)}`
  );
  const debtSanctumData = debtGame.getSanctumOverviewData();
  assert(
    Array.isArray(debtSanctumData.goals) && debtSanctumData.goals.some((goal) => /债账包/.test(String(goal.title || ''))),
    `debt sanctum goals should surface a debt-pack goal, got ${JSON.stringify(debtSanctumData?.goals)}`
  );
  assert(
    Array.isArray(debtSanctumData.goals) && debtSanctumData.goals.some((goal) => /结业验证状/.test(String(goal.title || ''))),
    `debt sanctum goals should surface a debt-clearing verification goal, got ${JSON.stringify(debtSanctumData?.goals)}`
  );
  const debtVerificationGoal = Array.isArray(debtSanctumData.goals)
    ? debtSanctumData.goals.find((goal) => /^season_board_verification_goal_/.test(String(goal.id || '')))
    : null;
  const expectedDebtVerificationAction = getExpectedSeasonBoardAction(debtSanctumData?.seasonBoard?.verificationOrders?.[0]?.anchorSection);
  assert(
    debtVerificationGoal?.action === expectedDebtVerificationAction.action
      && debtVerificationGoal?.value === expectedDebtVerificationAction.value,
    `debt sanctum verification goal should route to the debt-clearing proof surface, got ${JSON.stringify(debtVerificationGoal)}`
  );
  assert(
    Array.isArray(debtSanctumData.researches) && debtSanctumData.researches.some((research) => /研究债账包/.test(String(research.name || ''))),
    `debt sanctum researches should surface a debt-pack research item, got ${JSON.stringify(debtSanctumData?.researches)}`
  );
  const debtBuildSnapshot = debtGame.getBuildSnapshotData();
  assert(
    Array.isArray(debtBuildSnapshot.gaps) && debtBuildSnapshot.gaps.some((line) => /研究债账包|欠卷/.test(String(line || ''))),
    `debt build snapshot gaps should surface the debt settlement, got ${JSON.stringify(debtBuildSnapshot?.gaps)}`
  );
  assert(
    Array.isArray(debtBuildSnapshot.nextTargets) && debtBuildSnapshot.nextTargets.some((line) => /债账回流/.test(String(line || ''))),
    `debt build snapshot next targets should surface debt recovery guidance, got ${JSON.stringify(debtBuildSnapshot?.nextTargets)}`
  );
  const debtRewardMeta = debtGame.buildRewardExpeditionMeta(debtSlate);
  debtGame.lastExpeditionRewardMeta = debtRewardMeta;
  const normalizedDebtRewardMeta = debtGame.getRewardExpeditionMeta();
  assert(
    normalizedDebtRewardMeta?.seasonBoard?.debtPack?.summaryLine === debtBoard.debtPack.summaryLine,
    `reward expedition meta should mirror season-board debt pack summary, got ${JSON.stringify(normalizedDebtRewardMeta?.seasonBoard)}`
  );
  const debtRewardBrief = debtGame.getRewardNarrativeBriefMeta();
  assert(
    debtRewardBrief?.kicker === '赛季裁定',
    `debt reward brief should switch the expedition surface into season settlement mode, got ${JSON.stringify(debtRewardBrief)}`
  );
  assert(
    debtRewardBrief?.title?.includes(normalizedDebtRewardMeta.seasonBoard.settlement?.outcomeLabel || ''),
    `debt reward brief title should carry the debt settlement label, got ${JSON.stringify(debtRewardBrief)}`
  );
  assert(
    debtRewardBrief?.body === (
      normalizedDebtRewardMeta.seasonBoard.debtPack?.guideLine
      || normalizedDebtRewardMeta.seasonBoard.verificationOrders?.[0]?.summaryLine
      || normalizedDebtRewardMeta.seasonBoard.summaryLine
    ),
    `debt reward brief should prioritize the debt-clearing action, got ${JSON.stringify(debtRewardBrief)}`
  );
  assert(
    !!debtRewardBrief?.foot
      && (
        debtRewardBrief.foot.includes(normalizedDebtRewardMeta.seasonBoard.debtPack?.settleWindowText || '')
        || debtRewardBrief.foot.includes(normalizedDebtRewardMeta.seasonBoard.debtPack?.progressText || '')
      ),
    `debt reward brief foot should surface the debt window or progress, got ${JSON.stringify(debtRewardBrief)}`
  );
  debtGame.currentScreen = 'reward-screen';
  const debtPayload = JSON.parse(debtGame.renderGameToText());
  assert(
    debtPayload?.reward?.expedition?.seasonBoard?.debtPack?.summaryLine === debtBoard.debtPack.summaryLine,
    `reward payload should mirror season-board debt pack summary, got ${JSON.stringify(debtPayload?.reward?.expedition?.seasonBoard)}`
  );
  assert(
    debtPayload?.expedition?.seasonBoard?.settlement?.outcomeLabel === '欠卷'
      && debtPayload?.map?.chapter?.seasonBoard?.settlement?.outcomeLabel === '欠卷',
    `expedition/map payload should mirror debt settlement state, got ${JSON.stringify(debtPayload?.expedition?.seasonBoard)} vs ${JSON.stringify(debtPayload?.map?.chapter?.seasonBoard)}`
  );
  assert(
    JSON.stringify(debtPayload?.reward?.expedition?.seasonBoard?.debtPack || null) === JSON.stringify(debtPayload?.expedition?.seasonBoard?.debtPack || null)
      && JSON.stringify(debtPayload?.reward?.expedition?.seasonBoard?.debtPack || null) === JSON.stringify(debtPayload?.map?.chapter?.seasonBoard?.debtPack || null),
    `reward / expedition / map payload should mirror debt-pack state, got ${JSON.stringify(debtPayload?.reward?.expedition?.seasonBoard)} vs ${JSON.stringify(debtPayload?.expedition?.seasonBoard)} vs ${JSON.stringify(debtPayload?.map?.chapter?.seasonBoard)}`
  );
  assert(
    JSON.stringify(debtPayload?.reward?.expedition?.seasonBoard?.weekVerdictLedger || null) === JSON.stringify(debtPayload?.expedition?.seasonBoard?.weekVerdictLedger || null)
      && JSON.stringify(debtPayload?.reward?.expedition?.seasonBoard?.weekVerdictLedger || null) === JSON.stringify(debtPayload?.map?.chapter?.seasonBoard?.weekVerdictLedger || null),
    `reward / expedition / map payload should mirror debt week verdict ledger state, got ${JSON.stringify(debtPayload?.reward?.expedition?.seasonBoard)} vs ${JSON.stringify(debtPayload?.expedition?.seasonBoard)} vs ${JSON.stringify(debtPayload?.map?.chapter?.seasonBoard)}` 
  );
  debtGame.recordSeasonVerificationResult({
    role: 'primary',
    sourceMode: 'endless',
    sourceModeLabel: '无尽轮回',
    label: '无尽高压验证',
    resultStatus: 'verified',
    writebackMode: 'clear_debt',
    writebackLine: '无尽轮回主验证通过，欠卷会被清账并释放天命强目标。',
    resolvedRunId: 'season_board_debt_clear_run',
    chapterIndex: debtSlate.chapterIndex,
    proofQuality: 'solid',
    lineageStyle: '长压试炼',
    summaryLine: '无尽通关已补齐主验证，这笔欠卷可以在季盘上清账。',
    detailLine: '无尽长压验证通过，说明旧债已经被真正消化。',
    statusLine: '无尽轮回 · 通过',
    anchorSection: 'endless',
    priority: 1
  });
  const clearedDebtBoard = debtGame.getSeasonBoardSnapshot({ latestSlate: debtSlate });
  assert(
    clearedDebtBoard.settlement?.outcomeId === 'positive_sheet'
      && clearedDebtBoard.settlement?.resolvedStatus === 'verified'
      && clearedDebtBoard.settlement?.primaryVerificationRecordId,
    `explicit primary verification success should upgrade the debt board into a positive sheet, got ${JSON.stringify(clearedDebtBoard?.settlement)}`
  );
  assert(
    clearedDebtBoard.debtPack?.status === 'cleared'
      && !clearedDebtBoard.debtPack?.occupiesStrongSlot
      && /清账|已清/.test(String(
        clearedDebtBoard.debtPack?.progressText
        || clearedDebtBoard.debtPack?.writebackLine
        || clearedDebtBoard.debtPack?.statusLine
        || ''
      )),
    `explicit primary verification success should keep a cleared debt record without occupying the strong slot, got ${JSON.stringify(clearedDebtBoard?.debtPack)}`
  );
  assert(
    clearedDebtBoard.verificationOrders?.[0]?.resultStatus === 'verified'
      && clearedDebtBoard.verificationOrders?.[0]?.writebackMode === 'clear_debt'
      && clearedDebtBoard.verificationOrders?.[0]?.anchorSection === 'endless',
    `explicit primary verification success should surface the resolved endless writeback order, got ${JSON.stringify(clearedDebtBoard?.verificationOrders)}`
  );
  assert(
    clearedDebtBoard.weekVerdictLedger?.current?.resolvedStatus === 'verified'
      && clearedDebtBoard.weekVerdictLedger?.current?.primaryVerificationResultStatus === 'verified'
      && clearedDebtBoard.weekVerdictLedger?.current?.primaryWritebackMode === 'clear_debt',
    `debt-clear writeback should flow into the week verdict ledger, got ${JSON.stringify(clearedDebtBoard?.weekVerdictLedger)}`
  );

  resetStorages();
  const degradedDebtGame = createGame();
  degradedDebtGame.runSlateArchive = degradedDebtGame.normalizeRunSlateArchive([debtSlate]);
  degradedDebtGame.persistRunSlateArchive();
  degradedDebtGame.setObservatoryTrainingFocus(debtFocus, { silent: true });
  degradedDebtGame.sanctumAgendaState = degradedDebtGame.normalizeSanctumAgendaState({
    activeAgenda: null,
    lastResolved: {
      agendaId: 'season_board_debt_agenda',
      name: '镜债回流',
      sourceRunId: debtSlate.id,
      sourceLabel: '镜债回流',
      boundChapterIndex: debtSlate.chapterIndex,
      selectedContractLabel: '逆压还债',
      selectedContractLine: '先用高压验证清账，再决定本周是否继续冲榜。',
      selectedDecisionLabel: '回流清账',
      contractResolved: false,
      contractSuccess: false,
      contractResolutionLine: '上一道镜债锁线尚未彻底清账。',
      recoveryEligible: true,
      recoveryLine: '镜债未清，仍需下一轮主验证回写。',
      recoveryHintLine: '无尽或天道榜主验证通过后才能真正释放本周强目标。',
      outcome: 'failed',
      outcomeLabel: '欠卷待清',
      updatedAt: Date.now() - (8 * 24 * 60 * 60 * 1000),
      openedWeekTag: debtGame.getHeavenlyMandateWeekMeta(Date.now() - (8 * 24 * 60 * 60 * 1000)).weekTag
    },
    history: []
  });
  degradedDebtGame.fateAftereffectState = degradedDebtGame.normalizeFateAftereffectState({
    records: [],
    history: [],
    lastResolved: {
      recordId: 'season_board_debt_aftereffect',
      icon: '🩸',
      name: '镜债回流',
      sourceRunId: debtSlate.id,
      sourceAgendaId: 'season_board_debt_agenda',
      sourceLabel: '镜债回流',
      templateId: 'risk_bias',
      outcomeId: 'recovery',
      chapterIndex: debtSlate.chapterIndex,
      chapterName: debtSlate.chapterName,
      durationChapters: 2,
      positiveLine: '先清账再扩线。',
      negativeLine: '若继续强压，会把旧债拖成跨周风险。',
      summaryLine: '镜债回流：旧债仍未真正清账。',
      detailLine: '研究债账仍在回流，需要主验证给出真正写回。',
      createdAt: Date.now() - (7 * 24 * 60 * 60 * 1000)
    }
  });
  const degradedEndlessState = degradedDebtGame.ensureEndlessState();
  degradedEndlessState.currentCycle = 1;
  degradedEndlessState.seasonWeekTag = degradedDebtGame.getHeavenlyMandateWeekMeta().weekTag;
  degradedEndlessState.seasonCycleClears = 1;
  degradedEndlessState.seasonScore = 120;
  degradedDebtGame.recordSeasonVerificationResult({
    role: 'primary',
    sourceMode: 'pvp',
    sourceModeLabel: '天道榜',
    label: '天道榜反证',
    resultStatus: 'failed',
    writebackMode: 'degrade',
    writebackLine: '天道榜给出了反证，本周押卷会先转入险卷/反例处理。',
    resolvedRunId: 'season_board_debt_degrade_pvp',
    chapterIndex: debtSlate.chapterIndex,
    proofQuality: 'thin',
    lineageStyle: '镜战压强',
    summaryLine: '天道榜给出反证，这条旧债路线还不足以重新定榜。',
    detailLine: '镜战题面说明这条旧债路线还没完成真正修正。',
    statusLine: '天道榜 · 反证已入账',
    anchorSection: 'pvp',
    priority: 1
  });
  const degradedDebtBoard = degradedDebtGame.getSeasonBoardSnapshot({ latestSlate: debtSlate });
  assert(
    degradedDebtBoard.settlement?.outcomeId === 'risky_sheet'
      && degradedDebtBoard.settlement?.resolvedStatus === 'failed',
    `explicit primary verification failure should degrade a debt board into a risky sheet, got ${JSON.stringify(degradedDebtBoard?.settlement)}`
  );
  assert(
    degradedDebtBoard.debtPack?.status === 'degraded'
      && !degradedDebtBoard.debtPack?.occupiesStrongSlot
      && /反证/.test(String(degradedDebtBoard.debtPack?.progressText || degradedDebtBoard.debtPack?.statusLine || '')),
    `explicit primary verification failure should keep a degraded debt record without occupying the strong slot, got ${JSON.stringify(degradedDebtBoard?.debtPack)}`
  );
  assert(
    degradedDebtBoard.verificationOrders?.[0]?.resultStatus === 'failed'
      && degradedDebtBoard.verificationOrders?.[0]?.writebackMode === 'degrade'
      && degradedDebtBoard.verificationOrders?.[0]?.anchorSection === 'pvp',
    `explicit primary verification failure should surface the failed primary writeback order, got ${JSON.stringify(degradedDebtBoard?.verificationOrders)}`
  );

  resetStorages();
  ctx.PVPService.getCurrentSeasonMeta = () => null;
  ctx.PVPService.getRecentMatchHistory = () => [];
  const aftereffectTransitionGame = createGame();
  const aftereffectTransitionSlate = buildSlate('season_board_aftereffect_transition', Date.now(), {
    chapterIndex: 5,
    chapterName: '第 5 章·镜湖归档',
    ratingLabel: '锁线归卷',
    score: 241
  });
  aftereffectTransitionGame.player.realm = 5;
  aftereffectTransitionGame.player.playerRealm = 5;
  aftereffectTransitionGame.runSlateArchive = aftereffectTransitionGame.normalizeRunSlateArchive([aftereffectTransitionSlate]);
  aftereffectTransitionGame.persistRunSlateArchive();
  const aftereffectTransitionFocus = aftereffectTransitionGame.buildObservatoryTrainingFocusFromSlate(aftereffectTransitionSlate);
  aftereffectTransitionGame.setObservatoryTrainingFocus(aftereffectTransitionFocus, { silent: true });
  aftereffectTransitionGame.fateAftereffectState = aftereffectTransitionGame.normalizeFateAftereffectState({
    records: [
      {
        recordId: 'season_board_transition_aftereffect',
        icon: '🧭',
        name: '稳线回响',
        sourceRunId: aftereffectTransitionSlate.id,
        sourceAgendaId: 'season_board_transition_agenda',
        sourceLabel: '稳线试锋',
        sourceContractLabel: '稳线锁线',
        templateId: 'route_bias',
        outcomeId: 'stabilized',
        chapterIndex: aftereffectTransitionSlate.chapterIndex,
        chapterName: aftereffectTransitionSlate.chapterName,
        durationChapters: 2,
        positiveLine: '观星 / 事件 / 裂隙更容易连成同轴路线。',
        negativeLine: '战斗与营地窗口会略少，路线更容易被细线样本牵走。',
        summaryLine: '稳线回响：结题后的稳线研究留下了短期路线偏置。',
        detailLine: '来源：稳线试锋 · 结题后的短期路线偏置仍会继续牵引下一章。',
        weightShift: {
          observatory: 0.016,
          event: 0.012,
          memory_rift: 0.008,
          rest: -0.006
        },
        createdAt: Date.now() - 600
      }
    ],
    history: [],
    lastResolved: {
      recordId: 'season_board_transition_aftereffect',
      icon: '🧭',
      name: '稳线回响',
      sourceRunId: aftereffectTransitionSlate.id,
      sourceAgendaId: 'season_board_transition_agenda',
      sourceLabel: '稳线试锋',
      sourceContractLabel: '稳线锁线',
      templateId: 'route_bias',
      outcomeId: 'stabilized',
      chapterIndex: aftereffectTransitionSlate.chapterIndex,
      chapterName: aftereffectTransitionSlate.chapterName,
      durationChapters: 2,
      positiveLine: '观星 / 事件 / 裂隙更容易连成同轴路线。',
      negativeLine: '战斗与营地窗口会略少，路线更容易被细线样本牵走。',
      summaryLine: '稳线回响：结题后的稳线研究留下了短期路线偏置。',
      detailLine: '来源：稳线试锋 · 结题后的短期路线偏置仍会继续牵引下一章。',
      weightShift: {
        observatory: 0.016,
        event: 0.012,
        memory_rift: 0.008,
        rest: -0.006
      },
      createdAt: Date.now() - 600
    }
  });
  const pendingAftereffectSnapshot = aftereffectTransitionGame.getFateAftereffectSnapshot({
    latestRunId: aftereffectTransitionSlate.id,
    latestSlate: aftereffectTransitionSlate
  });
  assert(
    pendingAftereffectSnapshot?.pendingCount === 1 && pendingAftereffectSnapshot?.activeCount === 0,
    `aftereffect should stay pending before next chapter, got ${JSON.stringify(pendingAftereffectSnapshot)}`
  );
  const preActivationBoard = aftereffectTransitionGame.getSeasonBoardSnapshot({ latestSlate: aftereffectTransitionSlate });
  assert(
    preActivationBoard.phaseId === 'lockline',
    `season board should stay in lockline before aftereffect activation, got ${JSON.stringify(preActivationBoard)}`
  );
  assert(
    /事件 \/ 观星 \/ 裂隙/.test(String(preActivationBoard.guideLine || '')),
    `pre-activation guide should still point to lockline route, got ${JSON.stringify(preActivationBoard)}`
  );
  const preActivationRouteShift = aftereffectTransitionGame.getSeasonBoardWeightShift({ latestSlate: aftereffectTransitionSlate });
  assert(
    preActivationRouteShift
      && preActivationRouteShift.event > 0
      && preActivationRouteShift.observatory > 0
      && !preActivationRouteShift.forbidden_altar,
    `pre-activation season board should still use lockline route bias, got ${JSON.stringify(preActivationRouteShift)}`
  );
  aftereffectTransitionGame.expeditionState = { chapterIndex: aftereffectTransitionSlate.chapterIndex + 1, realm: aftereffectTransitionSlate.chapterIndex + 1 };
  const activeAftereffectSnapshot = aftereffectTransitionGame.getFateAftereffectSnapshot({
    latestRunId: aftereffectTransitionSlate.id,
    latestSlate: aftereffectTransitionSlate,
    expeditionState: aftereffectTransitionGame.expeditionState
  });
  assert(
    activeAftereffectSnapshot?.activeCount === 1 && activeAftereffectSnapshot?.pendingCount === 0,
    `aftereffect should become active in the next chapter, got ${JSON.stringify(activeAftereffectSnapshot)}`
  );
  assert(
    /当前生效/.test(String(activeAftereffectSnapshot?.currentStatusLine || ''))
      && /当前后效【稳线回响】仍在生效/.test(String(activeAftereffectSnapshot?.guideLine || '')),
    `active aftereffect snapshot should expose active status and guide, got ${JSON.stringify(activeAftereffectSnapshot)}`
  );
  const postActivationBoard = aftereffectTransitionGame.getSeasonBoardSnapshot({ latestSlate: aftereffectTransitionSlate });
  assert(
    postActivationBoard.phaseId === 'ranking',
    `season board should enter ranking once the aftereffect becomes active, got ${JSON.stringify(postActivationBoard)}`
  );
  assert(
    postActivationBoard.settlement?.outcomeId === 'risky_sheet' && postActivationBoard.settlement?.outcomeLabel === '险卷',
    `post-activation season board should classify the board as a risky sheet before cross-mode proofs arrive, got ${JSON.stringify(postActivationBoard?.settlement)}`
  );
  assert(
    !postActivationBoard.debtPack,
    `post-activation risky board should not emit a debt pack, got ${JSON.stringify(postActivationBoard?.debtPack)}`
  );
  assert(
    Array.isArray(postActivationBoard.verificationOrders)
      && /高压验证|险卷/.test(String(postActivationBoard.verificationOrders[0]?.label || '')),
    `post-activation risky board should prioritize a verification-first order, got ${JSON.stringify(postActivationBoard?.verificationOrders)}`
  );
  assert(
    postActivationBoard.verificationOrders?.length === 2
      && postActivationBoard.verificationOrders?.[1]?.anchorSection === 'challenge',
    `post-activation risky board should expose challenge as the optional side verification, got ${JSON.stringify(postActivationBoard?.verificationOrders)}`
  );
  assert(
    /试炼 \/ 精英 \/ 战斗 \/ 禁术/.test(String(postActivationBoard.guideLine || '')),
    `post-activation guide should switch to verification route, got ${JSON.stringify(postActivationBoard)}` 
  );
  const postActivationRouteShift = aftereffectTransitionGame.getSeasonBoardWeightShift({ latestSlate: aftereffectTransitionSlate });
  assert(
    postActivationRouteShift
      && postActivationRouteShift.trial > 0
      && postActivationRouteShift.forbidden_altar > 0
      && postActivationRouteShift.rest < 0,
    `post-activation season board should switch to verification route bias, got ${JSON.stringify(postActivationRouteShift)}`
  );
  const riskyRewardMeta = aftereffectTransitionGame.buildRewardExpeditionMeta(aftereffectTransitionSlate);
  aftereffectTransitionGame.lastExpeditionRewardMeta = riskyRewardMeta;
  const normalizedRiskyRewardMeta = aftereffectTransitionGame.getRewardExpeditionMeta();
  assert(
    normalizedRiskyRewardMeta?.seasonBoard?.settlement?.outcomeId === 'risky_sheet',
    `risky reward expedition meta should mirror the risky settlement snapshot, got ${JSON.stringify(normalizedRiskyRewardMeta?.seasonBoard)}`
  );
  const riskyRewardBrief = aftereffectTransitionGame.getRewardNarrativeBriefMeta();
  assert(
    riskyRewardBrief?.kicker === '赛季裁定',
    `risky reward brief should switch the expedition surface into season settlement mode, got ${JSON.stringify(riskyRewardBrief)}`
  );
  assert(
    riskyRewardBrief?.title?.includes(normalizedRiskyRewardMeta.seasonBoard.settlement?.outcomeLabel || ''),
    `risky reward brief title should carry the risky settlement label, got ${JSON.stringify(riskyRewardBrief)}`
  );
  assert(
    riskyRewardBrief?.body === (
      normalizedRiskyRewardMeta.seasonBoard.verificationOrders?.[0]?.summaryLine
      || normalizedRiskyRewardMeta.seasonBoard.verificationOrders?.[0]?.hintLine
      || normalizedRiskyRewardMeta.seasonBoard.summaryLine
    ),
    `risky reward brief should prioritize the primary verification action, got ${JSON.stringify(riskyRewardBrief)}`
  );
  assert(
    !!riskyRewardBrief?.foot
      && riskyRewardBrief.foot.includes(
        normalizedRiskyRewardMeta.seasonBoard.verificationOrders?.[0]?.statusLine
          || normalizedRiskyRewardMeta.seasonBoard.statusLine
          || ''
      ),
    `risky reward brief foot should surface the verification progress/status line, got ${JSON.stringify(riskyRewardBrief)}`
  );
  const riskyExpeditionPayload = aftereffectTransitionGame.getExpeditionPayload();
  assert(
    riskyExpeditionPayload?.seasonBoard?.settlement?.outcomeId === 'risky_sheet',
    `risky expedition payload should mirror risky settlement state, got ${JSON.stringify(riskyExpeditionPayload?.seasonBoard)}`
  );
  const riskySanctumData = aftereffectTransitionGame.getSanctumOverviewData();
  assert(
    Array.isArray(riskySanctumData.goals)
      && riskySanctumData.goals.some((goal) => /季押卷/.test(String(goal.title || '')) && /险卷/.test(`${String(goal.title || '')} ${String(goal.note || '')}`)),
    `risky sanctum goals should surface the risky settlement goal, got ${JSON.stringify(riskySanctumData?.goals)}`
  );
  assert(
    Array.isArray(riskySanctumData.goals)
      && riskySanctumData.goals.some((goal) => /结业验证状/.test(String(goal.title || '')) && /高压验证|外场验证|险卷/.test(`${String(goal.title || '')} ${String(goal.note || '')}`)),
    `risky sanctum goals should surface a risky verification goal, got ${JSON.stringify(riskySanctumData?.goals)}`
  );
  assert(
    Array.isArray(riskySanctumData.goals)
      && riskySanctumData.goals.some((goal) => /旁验证状/.test(String(goal.title || '')) && /七日劫数|挑战/.test(`${String(goal.title || '')} ${String(goal.note || '')}`)),
    `risky sanctum goals should surface an optional challenge side verification goal, got ${JSON.stringify(riskySanctumData?.goals)}`
  );
  const riskyVerificationGoal = Array.isArray(riskySanctumData.goals)
    ? riskySanctumData.goals.find((goal) => /^season_board_verification_goal_/.test(String(goal.id || '')))
    : null;
  const riskySideVerificationGoal = Array.isArray(riskySanctumData.goals)
    ? riskySanctumData.goals.find((goal) => /^season_board_side_verification_goal_/.test(String(goal.id || '')))
    : null;
  const expectedRiskyVerificationAction = getExpectedSeasonBoardAction(riskySanctumData?.seasonBoard?.verificationOrders?.[0]?.anchorSection);
  const expectedRiskySideVerificationAction = getExpectedSeasonBoardAction(riskySanctumData?.seasonBoard?.verificationOrders?.[1]?.anchorSection);
  assert(
    riskyVerificationGoal?.action === expectedRiskyVerificationAction.action
      && riskyVerificationGoal?.value === expectedRiskyVerificationAction.value,
    `risky sanctum verification goal should route to the proof surface, got ${JSON.stringify(riskyVerificationGoal)}`
  );
  assert(
    riskySideVerificationGoal?.action === expectedRiskySideVerificationAction.action
      && riskySideVerificationGoal?.value === expectedRiskySideVerificationAction.value,
    `risky sanctum side verification goal should route to the challenge surface, got ${JSON.stringify(riskySideVerificationGoal)}`
  );
  const riskyBuildSnapshot = aftereffectTransitionGame.getBuildSnapshotData();
  assert(
    Array.isArray(riskyBuildSnapshot.gaps)
      && riskyBuildSnapshot.gaps.some((line) => /季押卷仍属险卷/.test(String(line || ''))),
    `risky build snapshot gaps should mention the risky settlement pressure, got ${JSON.stringify(riskyBuildSnapshot?.gaps)}`
  );
  assert(
    Array.isArray(riskyBuildSnapshot.nextTargets)
      && riskyBuildSnapshot.nextTargets.some((line) => /结业验证/.test(String(line || '')) && /高压|外场|险卷/.test(String(line || ''))),
    `risky build snapshot next targets should prioritize verification follow-up, got ${JSON.stringify(riskyBuildSnapshot?.nextTargets)}`
  );
  assert(
    Array.isArray(riskyBuildSnapshot.nextTargets)
      && riskyBuildSnapshot.nextTargets.some((line) => /旁验证|七日劫数/.test(String(line || ''))),
    `risky build snapshot next targets should surface the optional challenge side verification, got ${JSON.stringify(riskyBuildSnapshot?.nextTargets)}`
  );
  aftereffectTransitionGame.currentScreen = 'reward-screen';
  const riskyPayload = JSON.parse(aftereffectTransitionGame.renderGameToText());
  assert(
    riskyPayload?.reward?.expedition?.seasonBoard?.settlement?.outcomeId === 'risky_sheet',
    `risky reward payload should mirror risky settlement state, got ${JSON.stringify(riskyPayload?.reward?.expedition?.seasonBoard)}`
  );
  assert(
    riskyPayload?.expedition?.seasonBoard?.settlement?.outcomeId === 'risky_sheet',
    `risky render payload should include expedition season board mirror, got ${JSON.stringify(riskyPayload?.expedition?.seasonBoard)}`
  );
  assert(
    riskyPayload?.map?.chapter?.seasonBoard?.settlement?.outcomeId === 'risky_sheet',
    `risky render payload should mirror season board into map.chapter, got ${JSON.stringify(riskyPayload?.map?.chapter?.seasonBoard)}`
  );
  assert(
    JSON.stringify(riskyPayload?.reward?.expedition?.seasonBoard?.settlement || null) === JSON.stringify(riskyPayload?.expedition?.seasonBoard?.settlement || null)
      && JSON.stringify(riskyPayload?.reward?.expedition?.seasonBoard?.settlement || null) === JSON.stringify(riskyPayload?.map?.chapter?.seasonBoard?.settlement || null),
    `risky reward / expedition / map payload should mirror settlement state, got ${JSON.stringify(riskyPayload?.reward?.expedition?.seasonBoard)} vs ${JSON.stringify(riskyPayload?.expedition?.seasonBoard)} vs ${JSON.stringify(riskyPayload?.map?.chapter?.seasonBoard)}`
  );
  assert(
    JSON.stringify(riskyPayload?.reward?.expedition?.seasonBoard?.verificationOrders || []) === JSON.stringify(riskyPayload?.expedition?.seasonBoard?.verificationOrders || [])
      && JSON.stringify(riskyPayload?.reward?.expedition?.seasonBoard?.verificationOrders || []) === JSON.stringify(riskyPayload?.map?.chapter?.seasonBoard?.verificationOrders || []),
    `risky reward / expedition / map payload should mirror verification orders, got ${JSON.stringify(riskyPayload?.reward?.expedition?.seasonBoard)} vs ${JSON.stringify(riskyPayload?.expedition?.seasonBoard)} vs ${JSON.stringify(riskyPayload?.map?.chapter?.seasonBoard)}` 
  );
  aftereffectTransitionGame.recordSeasonVerificationResult({
    role: 'side',
    sourceMode: 'challenge',
    sourceModeLabel: '七日劫数',
    label: '七日劫数旁证',
    resultStatus: 'verified',
    writebackMode: 'boost_recommendation',
    writebackLine: '周挑战旁证已经回写，季盘会更偏向当前主修并给出更稳的复盘建议。',
    resolvedRunId: 'season_board_risky_side_challenge',
    chapterIndex: aftereffectTransitionSlate.chapterIndex,
    proofQuality: 'thin',
    lineageStyle: '推演控场',
    summaryLine: '七日劫数已经补上一张稳定旁证，这周主练不再只靠单一路线说话。',
    detailLine: '挑战旁证会强化赛季推荐，但不会直接替代主验证。',
    statusLine: '七日劫数 · 已归档 412 分',
    anchorSection: 'challenge',
    priority: 2
  });
  const reinforcedRiskyBoard = aftereffectTransitionGame.getSeasonBoardSnapshot({ latestSlate: aftereffectTransitionSlate });
  assert(
    reinforcedRiskyBoard.settlement?.outcomeId === 'risky_sheet'
      && !reinforcedRiskyBoard.debtPack,
    `explicit side verification success should reinforce but not overturn the risky sheet, got ${JSON.stringify(reinforcedRiskyBoard)}`
  );
  assert(
    reinforcedRiskyBoard.verificationOrders?.[1]?.resultStatus === 'verified'
      && reinforcedRiskyBoard.verificationOrders?.[1]?.writebackMode === 'boost_recommendation'
      && reinforcedRiskyBoard.verificationOrders?.[1]?.anchorSection === 'challenge',
    `explicit side verification success should surface the resolved challenge side order, got ${JSON.stringify(reinforcedRiskyBoard?.verificationOrders)}`
  );
  assert(
    reinforcedRiskyBoard.weekVerdictLedger?.current?.sideVerificationResultStatus === 'verified'
      && reinforcedRiskyBoard.weekVerdictLedger?.current?.sideWritebackMode === 'boost_recommendation',
    `explicit side verification success should write back into the week verdict ledger without clearing debt, got ${JSON.stringify(reinforcedRiskyBoard?.weekVerdictLedger)}`
  );
  assert(
    /旁验证|旁证|周挑战/.test(String(reinforcedRiskyBoard.settlement?.detailLine || reinforcedRiskyBoard.settlement?.guideLine || '')),
    `explicit side verification success should reinforce the risky board copy, got ${JSON.stringify(reinforcedRiskyBoard?.settlement)}`
  );

  resetStorages();
  const staleGame = createGame();
  const staleDate = new Date();
  staleDate.setUTCDate(staleDate.getUTCDate() - 8);
  const staleSlate = buildSlate('season_board_stale', staleDate.getTime(), {
    ratingLabel: '旧周归卷',
    score: 244
  });
  staleGame.runSlateArchive = staleGame.normalizeRunSlateArchive([staleSlate]);
  staleGame.persistRunSlateArchive();
  const staleEndlessState = staleGame.ensureEndlessState();
  staleEndlessState.currentCycle = 4;
  staleEndlessState.seasonWeekTag = staleGame.getHeavenlyMandateWeekMeta(staleDate).weekTag;
  staleEndlessState.seasonCycleClears = 2;
  staleEndlessState.seasonScore = 360;
  ctx.PVPService.getCurrentSeasonMeta = () => ({
    id: 'season_board_live_season',
    name: '天道试锋'
  });
  ctx.PVPService.getRecentMatchHistory = () => ([
    {
      seasonId: 'season_board_old_season',
      opponentName: '旧周镜像'
    }
  ]);
  const staleBoard = staleGame.getSeasonBoardSnapshot();
  assert(
    staleBoard.phaseId === 'sampling',
    `season board should ignore stale-week endless/slate and mismatched-season pvp signals, got ${JSON.stringify(staleBoard)}`
  );
  const staleVerificationLane = Array.isArray(staleBoard.lanes)
    ? staleBoard.lanes.find((lane) => lane.id === 'verification')
    : null;
  const staleEndlessTask = staleVerificationLane?.tasks?.find((task) => task.id === 'season_endless_clear') || null;
  const stalePvpTask = staleVerificationLane?.tasks?.find((task) => task.id === 'season_pvp_ledger') || null;
  assert(
    staleEndlessTask?.progress === 0 && stalePvpTask?.progress === 0,
    `stale cross-mode data should not advance verification lane, got ${JSON.stringify(staleVerificationLane)}`
  );

  ctx.PVPService.getCurrentSeasonMeta = originalPvpSeasonMeta;
  ctx.PVPService.getRecentMatchHistory = originalPvpRecentMatchHistory;

  console.log('Season board system checks passed.');
})();
