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
    'js/core/expedition_hub.js'
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
    game.legacyProgress = { essence: 0, spent: 0, upgrades: {} };
    game.featureFlags = {};
    game.endlessState = Game.prototype.createDefaultEndlessState.call(game);
    game.encounterState = Game.prototype.createDefaultEncounterState.call(game);
    game.sanctumAgendaState = Game.prototype.createDefaultSanctumAgendaState.call(game);
    game.challengeHubState = null;
    game.observatoryGuideState = null;
    game.expeditionState = null;
    game.initCollection = () => {};
    game.showScreen = () => {};
    game.autoSave = () => {};
    game.player.collectLaw(LAWS.flameTruth || Object.values(LAWS)[0]);
    game.player.playerRealm = 6;
    game.player.realm = 6;
    game.player.heavenlyInsight = 6;
    game.player.karma = 5;
    return game;
  }

  const rawArchive = [
    {
      id: 'run_slate_oracle_6',
      chapterIndex: 6,
      chapterName: '第 6 章·星镜归档',
      endingId: 'alliance',
      endingName: '星图合卷',
      endingIcon: '🔭',
      score: 256,
      scoreBreakdown: [
        '章节答卷：天象合卷 · 3/3 项达成',
        '训练建议：继续沿观测锁线压路线贴合与控场节奏'
      ],
      branchName: '观测锁线',
      bountyNames: ['星轨巡检'],
      factionSummary: ['星港议会·协力'],
      nemesisName: '镜池守望者',
      nemesisStatus: 'allied',
      nemesisStatusLabel: '已结盟',
      tags: ['课题·推演控场', '答卷·天象合卷', '训练·路线贴合'],
      practiceTopic: {
        id: 'topic_oracle_6',
        sourceRecordId: 'guide_oracle_6',
        sourceTitle: '星镜试锋',
        themeKey: 'oracle',
        themeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '对比观测收益、路线贴合与控场稳定。',
        trainingTags: ['路线贴合', '控场稳定'],
        goalLines: ['先走观星线再补事件收益']
      },
      observatoryLink: {
        sourceRecordId: 'guide_oracle_6',
        sourceTitle: '星镜试锋',
        sourceThemeKey: 'oracle',
        sourceThemeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '对比观测收益、路线贴合与控场稳定。',
        trainingTags: ['路线贴合', '控场稳定'],
        drillObjective: '连续两次走观星相关节点并维持控场稳定。'
      },
      answerReview: {
        title: '章节观星回响',
        ratingLabel: '天象合卷',
        ratingTone: 'completed',
        trainingAdvice: '先沿观星链路把线索写满，再回事件节点补收益兑现。',
        highlightLine: '这章已经把观测样本写成完整答卷，下一轮继续按同轴复盘。',
        overviewLine: '章节答卷已稳定成卷。'
      },
      themeKey: 'oracle',
      themeLabel: '推演控场',
      ratingLabel: '天象合卷',
      ratingTone: 'completed',
      timestamp: 256000
    }
  ];

  const game = createGame();
  game.runSlateArchive = game.normalizeRunSlateArchive(rawArchive);
  game.persistRunSlateArchive();
  const focus = game.buildObservatoryTrainingFocusFromSlate(rawArchive[0]);
  game.setObservatoryTrainingFocus(focus, { silent: true });

  const dashboard = game.getSanctumAgendaDashboard();
  assert(dashboard.source && dashboard.source.ready, `sanctum agenda should have a ready source, got ${JSON.stringify(dashboard.source)}`);
  assert(Array.isArray(dashboard.candidates) && dashboard.candidates.length === 3, `sanctum agenda should expose three candidates, got ${JSON.stringify(dashboard.candidates)}`);
  assert(dashboard.candidates.some((entry) => entry.agendaId === 'steady_line' && entry.affordable), `steady line should be affordable, got ${JSON.stringify(dashboard.candidates)}`);

  const active = game.activateSanctumAgenda('steady_line');
  assert(active && active.agendaId === 'steady_line', `steady line should activate, got ${JSON.stringify(active)}`);
  assert(game.player.heavenlyInsight === 3, `steady line should spend 3 insight, got ${game.player.heavenlyInsight}`);
  const weightShift = game.getSanctumAgendaWeightShift();
  assert(weightShift && weightShift.observatory > 0 && weightShift.event > 0, `steady line should bias map weights, got ${JSON.stringify(weightShift)}`);

  game.recordSanctumAgendaNodeProgress('observatory', { nodeId: 'node_a', chapterIndex: 7, realm: 7, row: 1 });
  let activeState = game.ensureSanctumAgendaState().activeAgenda;
  assert(activeState && activeState.decisionState === 'pending', `agenda should unlock a pending chapter decision after first key node, got ${JSON.stringify(activeState)}`);
  assert(Array.isArray(activeState.decisionOptions) && activeState.decisionOptions.length === 2, `agenda should expose two chapter decisions, got ${JSON.stringify(activeState)}`);
  const decisionPick = game.chooseSanctumAgendaDecision('double_commit');
  assert(decisionPick && decisionPick.selectedDecisionId === 'double_commit', `double commit decision should be selectable, got ${JSON.stringify(decisionPick)}`);
  assert(decisionPick.target === 4, `double commit should raise target to 4, got ${JSON.stringify(decisionPick)}`);
  assert(decisionPick.minCompletedGoals === 3, `double commit should raise minimum completed goals to 3, got ${JSON.stringify(decisionPick)}`);
  const agendaSnapshot = game.getSanctumAgendaExpeditionSnapshot({ latestRunId: rawArchive[0].id });
  assert(agendaSnapshot && agendaSnapshot.active && agendaSnapshot.active.selectedDecisionLabel === '加倍投入', `agenda snapshot should expose selected decision, got ${JSON.stringify(agendaSnapshot)}`);
  game.recordSanctumAgendaNodeProgress('observatory', { nodeId: 'node_a', chapterIndex: 7, realm: 7, row: 1 });
  game.recordSanctumAgendaNodeProgress('event', { nodeId: 'node_b', chapterIndex: 7, realm: 7, row: 2 });
  activeState = game.ensureSanctumAgendaState().activeAgenda;
  assert(activeState && activeState.contractState === 'pending', `agenda should unlock a pending contract after the second key node, got ${JSON.stringify(activeState)}`);
  assert(Array.isArray(activeState.contractOptions) && activeState.contractOptions.length === 3, `agenda should expose three contract options after branch expansion, got ${JSON.stringify(activeState)}`);
  assert(activeState.contractOptions.some((entry) => entry.id === 'rift_margin'), `steady line should expose the new rift_margin branch, got ${JSON.stringify(activeState.contractOptions)}`);
  const contractPick = game.chooseSanctumAgendaContract('starlock_trace');
  assert(contractPick && contractPick.selectedContractId === 'starlock_trace', `starlock_trace contract should be selectable, got ${JSON.stringify(contractPick)}`);
  assert(contractPick.contractProgress === 2 && contractPick.contractTarget === 2, `selected contract should inherit prior matching samples, got ${JSON.stringify(contractPick)}`);
  assert(contractPick.contractSignCostLine === '🔮 1', `selected contract should preserve the sign cost line, got ${JSON.stringify(contractPick)}`);
  assert(game.player.heavenlyInsight === 2, `starlock_trace should consume 1 extra insight as contract stake, got ${game.player.heavenlyInsight}`);
  const contractSnapshot = game.getSanctumAgendaExpeditionSnapshot({ latestRunId: rawArchive[0].id });
  assert(contractSnapshot && contractSnapshot.active && contractSnapshot.active.selectedContractLabel === '星镜锁线', `agenda snapshot should expose selected contract, got ${JSON.stringify(contractSnapshot)}`);
  assert(contractSnapshot && contractSnapshot.active && contractSnapshot.active.contractSignCostLine === '🔮 1', `agenda snapshot should expose the selected contract stake, got ${JSON.stringify(contractSnapshot)}`);
  game.recordSanctumAgendaNodeProgress('rest', { nodeId: 'node_c', chapterIndex: 7, realm: 7, row: 3 });
  game.recordSanctumAgendaNodeProgress('event', { nodeId: 'node_d', chapterIndex: 7, realm: 7, row: 4 });
  activeState = game.ensureSanctumAgendaState().activeAgenda;
  assert(activeState && activeState.progress === 4, `agenda progress should count unique matching nodes only, got ${JSON.stringify(activeState)}`);
  assert(activeState.phaseLabel === '收束期', `agenda should enter closing phase once target is met, got ${JSON.stringify(activeState)}`);

  const successResolution = game.resolveSanctumAgenda('realm_clear', {
    slate: rawArchive[0],
    answerSheet: {
      completedGoals: 3,
      totalGoals: 3,
      ratingTone: 'completed',
      ratingLabel: '天象合卷',
      goals: [
        { deviated: false },
        { deviated: false },
        { deviated: false }
      ]
    }
  });
  assert(successResolution && successResolution.outcome === 'success', `steady line should resolve successfully, got ${JSON.stringify(successResolution)}`);
  assert(successResolution.selectedDecisionLabel === '加倍投入', `resolved agenda should remember selected decision, got ${JSON.stringify(successResolution)}`);
  assert(successResolution.selectedContractLabel === '星镜锁线', `resolved agenda should remember selected contract, got ${JSON.stringify(successResolution)}`);
  assert(successResolution.contractSuccess === true, `steady line contract should resolve as success, got ${JSON.stringify(successResolution)}`);
  assert(/锁线契约/.test(successResolution.contractResolutionLine || ''), `successful contract should emit a resolution line, got ${JSON.stringify(successResolution)}`);
  assert(/契押/.test(successResolution.contractResolutionLine || ''), `successful contract should mention the paid stake, got ${JSON.stringify(successResolution)}`);
  assert(game.ensureSanctumAgendaState().activeAgenda === null, 'successful resolution should clear the active agenda');
  const successSnapshot = game.getSanctumAgendaExpeditionSnapshot({ latestRunId: rawArchive[0].id });
  assert(successSnapshot && successSnapshot.lastResolved && successSnapshot.lastResolved.selectedContractLabel === '星镜锁线', `last resolved snapshot should expose selected contract, got ${JSON.stringify(successSnapshot)}`);
  assert(/锁线契约/.test(successSnapshot.lastResolved.contractResolutionLine || ''), `last resolved snapshot should expose contract resolution line, got ${JSON.stringify(successSnapshot)}`);
  assert(successSnapshot && successSnapshot.lastResolved && successSnapshot.lastResolved.contractSignCostLine === '🔮 1', `last resolved snapshot should preserve the contract stake, got ${JSON.stringify(successSnapshot)}`);
  assert(game.getSanctumAgendaExpeditionSnapshot({ latestRunId: 'run_slate_wrong_success' }) === null, 'snapshot should return null when latestRunId does not match the resolved run');
  const observatoryTrack = game.getStrategicEngineeringTrackSnapshot('observatory');
  assert(observatoryTrack && observatoryTrack.progress === 1, `successful agenda should advance observatory engineering, got ${JSON.stringify(observatoryTrack)}`);
  assert(game.ensureSanctumAgendaState().totalCompleted === 1, `completed agenda should increment completion count, got ${JSON.stringify(game.ensureSanctumAgendaState())}`);
  const rewardMeta = game.buildRewardExpeditionMeta(rawArchive[0], { agendaResolution: successResolution });
  assert(rewardMeta && rewardMeta.agenda && rewardMeta.agenda.outcome === 'success', `reward meta should expose agenda resolution, got ${JSON.stringify(rewardMeta)}`);
  assert(rewardMeta.agenda.selectedDecisionLabel === undefined || rewardMeta.agenda.summaryLine.includes('加倍投入'), `reward meta should carry decision-inflected summary, got ${JSON.stringify(rewardMeta.agenda)}`);
  assert(rewardMeta.agenda.selectedContractLabel === '星镜锁线', `reward meta should expose selected contract, got ${JSON.stringify(rewardMeta.agenda)}`);
  assert(rewardMeta.agenda.contractSuccess === true, `reward meta should expose contract success, got ${JSON.stringify(rewardMeta.agenda)}`);
  assert(/锁线契约/.test(rewardMeta.agenda.contractResolutionLine || ''), `reward meta should expose contract resolution line, got ${JSON.stringify(rewardMeta.agenda)}`);
  assert(rewardMeta.agenda.contractSignCostLine === '🔮 1', `reward meta should expose contract stake, got ${JSON.stringify(rewardMeta.agenda)}`);
  assert(Array.isArray(rewardMeta.focusLines) && /结题成功/.test(rewardMeta.focusLines[0] || ''), `reward focus lines should include agenda summary, got ${JSON.stringify(rewardMeta.focusLines)}`);
  assert(Array.isArray(rewardMeta.focusLines) && rewardMeta.focusLines.some((line) => /锁线契约/.test(line || '')), `reward focus lines should include contract resolution, got ${JSON.stringify(rewardMeta.focusLines)}`);
  assert(Array.isArray(rewardMeta.focusLines) && rewardMeta.focusLines.some((line) => /契押：🔮 1/.test(line || '')), `reward focus lines should surface the contract stake, got ${JSON.stringify(rewardMeta.focusLines)}`);
  assert(Array.isArray(rewardMeta.tags) && rewardMeta.tags.some((tag) => /议程·结题成功/.test(tag || '')), `reward tags should include agenda outcome, got ${JSON.stringify(rewardMeta.tags)}`);
  assert(Array.isArray(rewardMeta.tags) && rewardMeta.tags.some((tag) => /契约·兑现/.test(tag || '')), `reward tags should include contract outcome, got ${JSON.stringify(rewardMeta.tags)}`);

  const archiveAgenda = game.activateSanctumAgenda('archive_line');
  assert(archiveAgenda && archiveAgenda.agendaId === 'archive_line', `archive line should activate after previous resolution, got ${JSON.stringify(archiveAgenda)}`);
  const archiveChapterIndex = archiveAgenda.boundChapterIndex || 7;
  game.recordSanctumAgendaNodeProgress('observatory', { nodeId: 'archive_a', chapterIndex: archiveChapterIndex, realm: archiveChapterIndex, row: 1 });
  const archiveDecision = game.chooseSanctumAgendaDecision('complete_volume');
  assert(archiveDecision && archiveDecision.selectedDecisionId === 'complete_volume', `archive line should allow choosing complete volume, got ${JSON.stringify(archiveDecision)}`);
  game.recordSanctumAgendaNodeProgress('memory_rift', { nodeId: 'archive_b', chapterIndex: archiveChapterIndex, realm: archiveChapterIndex, row: 2 });
  activeState = game.ensureSanctumAgendaState().activeAgenda;
  assert(activeState && activeState.contractState === 'pending', `archive line should unlock a pending contract after second key node, got ${JSON.stringify(activeState)}`);
  assert(Array.isArray(activeState.contractOptions) && activeState.contractOptions.length === 3, `archive line should expose three contract branches, got ${JSON.stringify(activeState)}`);
  assert(activeState.contractOptions.some((entry) => entry.id === 'echo_annotation'), `archive line should expose the new echo_annotation branch, got ${JSON.stringify(activeState.contractOptions)}`);
  const archiveContract = game.chooseSanctumAgendaContract('spirit_volume_sync');
  assert(archiveContract && archiveContract.selectedContractId === 'spirit_volume_sync', `archive line should allow selecting a contract, got ${JSON.stringify(archiveContract)}`);
  assert(archiveContract.contractProgress === 1, `selected archive contract should only count existing matching samples, got ${JSON.stringify(archiveContract)}`);
  assert(archiveContract.contractSignCostLine === '🜂 1', `archive contract should preserve the karma stake, got ${JSON.stringify(archiveContract)}`);
  assert(game.player.karma === 3, `spirit_volume_sync should consume 1 extra karma as contract stake, got ${game.player.karma}`);
  game.recordSanctumAgendaNodeProgress('memory_rift', { nodeId: 'archive_c', chapterIndex: archiveChapterIndex, realm: archiveChapterIndex, row: 3 });
  const contractMissResolution = game.resolveSanctumAgenda('realm_clear', {
    slate: {
      ...rawArchive[0],
      id: 'run_slate_archive_8',
      chapterIndex: 8,
      chapterName: '第 8 章·归卷续作'
    },
    answerSheet: {
      completedGoals: 3,
      totalGoals: 3,
      ratingTone: 'completed',
      ratingLabel: '全卷成书',
      goals: [
        { deviated: false },
        { deviated: false },
        { deviated: false }
      ]
    }
  });
  assert(contractMissResolution && contractMissResolution.outcome === 'success', `archive line should still resolve successfully on the base agenda, got ${JSON.stringify(contractMissResolution)}`);
  assert(contractMissResolution.selectedContractLabel === '灵契合卷', `archive line should remember selected contract on miss, got ${JSON.stringify(contractMissResolution)}`);
  assert(contractMissResolution.contractSuccess === false, `archive line contract should miss without downgrading the base agenda, got ${JSON.stringify(contractMissResolution)}`);
  assert(/未兑现/.test(contractMissResolution.contractResolutionLine || ''), `contract miss should emit a miss line, got ${JSON.stringify(contractMissResolution)}`);
  assert(/契押/.test(contractMissResolution.contractResolutionLine || ''), `contract miss should mention the paid stake, got ${JSON.stringify(contractMissResolution)}`);

  const pressureAgenda = game.activateSanctumAgenda('pressure_line');
  assert(pressureAgenda && pressureAgenda.agendaId === 'pressure_line', `pressure line should activate after previous resolution, got ${JSON.stringify(pressureAgenda)}`);
  assert(game.player.karma === 0, `pressure line should spend 3 karma after the archive line consumed 2 karma, got ${game.player.karma}`);
  game.recordSanctumAgendaNodeProgress('elite', { nodeId: 'elite_a', chapterIndex: 8, realm: 8, row: 2 });
  const failedResolution = game.resolveSanctumAgenda('battle_lost', {
    slate: {
      ...rawArchive[0],
      id: 'run_slate_fail_8',
      chapterIndex: 8,
      chapterName: '第 8 章·高压断卷'
    },
    answerSheet: {
      completedGoals: 1,
      totalGoals: 3,
      ratingTone: 'selected',
      ratingLabel: '待复盘',
      goals: [{ deviated: false }]
    }
  });
  assert(failedResolution && failedResolution.outcome === 'failed', `battle_lost should fail the active agenda, got ${JSON.stringify(failedResolution)}`);
  assert(failedResolution.recoveryEligible === true, `failed agenda with partial progress should trigger recovery, got ${JSON.stringify(failedResolution)}`);
  assert(failedResolution.recoveryLabel === '残卷回收', `failed agenda should use the recovery label, got ${JSON.stringify(failedResolution)}`);
  assert(failedResolution.recoveryTier === 'trace', `single-sample failure should fall into trace recovery, got ${JSON.stringify(failedResolution)}`);
  assert(failedResolution.recoveryReward && failedResolution.recoveryReward.karma === 1, `pressure line failure should refund 1 karma, got ${JSON.stringify(failedResolution)}`);
  assert(failedResolution.recoveryReward && failedResolution.recoveryReward.ringExp === 2, `trace recovery should grant 2 ring exp, got ${JSON.stringify(failedResolution)}`);
  assert(/残卷回收/.test(failedResolution.recoveryLine || ''), `failed agenda should emit a recovery line, got ${JSON.stringify(failedResolution)}`);
  assert(/补卷提示/.test(failedResolution.recoveryHintLine || ''), `failed agenda should emit a recovery hint line, got ${JSON.stringify(failedResolution)}`);
  assert(/残卷回收/.test(failedResolution.grantedLine || ''), `failed agenda should surface recovery through grantedLine, got ${JSON.stringify(failedResolution)}`);
  assert(game.player.karma === 1, `failed recovery should refund 1 karma after the pressure line cost, got ${game.player.karma}`);
  assert(game.ensureSanctumAgendaState().totalFailed === 1, `failed agenda should increment failure count, got ${JSON.stringify(game.ensureSanctumAgendaState())}`);
  const failedSnapshot = game.getSanctumAgendaExpeditionSnapshot({ latestRunId: 'run_slate_fail_8' });
  assert(failedSnapshot && failedSnapshot.lastResolved && /残卷回收/.test(failedSnapshot.lastResolved.recoveryLine || ''), `failed snapshot should expose recovery info, got ${JSON.stringify(failedSnapshot)}`);
  const failedRewardMeta = game.buildRewardExpeditionMeta({
    ...rawArchive[0],
    id: 'run_slate_fail_8',
    chapterIndex: 8,
    chapterName: '第 8 章·高压断卷'
  }, { agendaResolution: failedResolution });
  assert(failedRewardMeta && failedRewardMeta.agenda && failedRewardMeta.agenda.recoveryEligible === true, `failed reward meta should expose recovery eligibility, got ${JSON.stringify(failedRewardMeta)}`);
  assert(/残卷回收/.test(failedRewardMeta.agenda.recoveryLine || ''), `failed reward meta should expose recovery line, got ${JSON.stringify(failedRewardMeta)}`);
  assert(Array.isArray(failedRewardMeta.focusLines) && failedRewardMeta.focusLines.some((line) => /残卷回收/.test(line || '')), `failed reward meta should surface recovery in focus lines, got ${JSON.stringify(failedRewardMeta)}`);
  assert(Array.isArray(failedRewardMeta.tags) && failedRewardMeta.tags.some((tag) => /回收·/.test(tag || '')), `failed reward meta should emit a recovery tag, got ${JSON.stringify(failedRewardMeta)}`);
  const failedRewardMetaFromSnapshot = game.buildRewardExpeditionMeta({
    ...rawArchive[0],
    id: 'run_slate_fail_8',
    chapterIndex: 8,
    chapterName: '第 8 章·高压断卷'
  });
  assert(failedRewardMetaFromSnapshot && failedRewardMetaFromSnapshot.agenda && failedRewardMetaFromSnapshot.agenda.recoveryTier === 'trace', `reward meta should fallback to lastResolved for trace recovery, got ${JSON.stringify(failedRewardMetaFromSnapshot)}`);
  assert(/补卷提示/.test(failedRewardMetaFromSnapshot.agenda.recoveryHintLine || ''), `implicit reward meta should preserve recovery hints, got ${JSON.stringify(failedRewardMetaFromSnapshot)}`);
  const failedNotice = game.buildSanctumAgendaFailureRecoveryNotice(failedResolution);
  assert(failedNotice && failedNotice.icon === '🗒️', `trace recovery should map to the trace icon, got ${JSON.stringify(failedNotice)}`);
  assert(failedNotice && failedNotice.summaryLine === `洞府已执行${failedResolution.recoveryLabel}（${failedResolution.recoveryTierLabel}）`, `trace recovery notice should expose the summary line payload, got ${JSON.stringify(failedNotice)}`);

  const coldGame = createGame();
  coldGame.runSlateArchive = coldGame.normalizeRunSlateArchive(rawArchive);
  coldGame.persistRunSlateArchive();
  coldGame.setObservatoryTrainingFocus(focus, { silent: true });
  const coldAgenda = coldGame.activateSanctumAgenda('pressure_line');
  assert(coldAgenda && coldAgenda.agendaId === 'pressure_line', `cold pressure line should activate, got ${JSON.stringify(coldAgenda)}`);
  const coldFailure = coldGame.resolveSanctumAgenda('battle_lost', {
    slate: {
      ...rawArchive[0],
      id: 'run_slate_fail_cold',
      chapterIndex: 7,
      chapterName: '第 7 章·半途折卷'
    },
    answerSheet: {
      completedGoals: 0,
      totalGoals: 3,
      ratingTone: 'idle',
      ratingLabel: '未成卷',
      goals: []
    }
  });
  assert(coldFailure && coldFailure.outcome === 'failed', `cold failure should still fail the agenda, got ${JSON.stringify(coldFailure)}`);
  assert(!coldFailure.recoveryEligible, `cold failure with zero samples should not trigger recovery, got ${JSON.stringify(coldFailure)}`);
  assert(!coldFailure.recoveryLine, `cold failure should not emit a recovery line, got ${JSON.stringify(coldFailure)}`);
  assert(coldGame.player.karma === 2, `cold failure should not refund karma without samples, got ${coldGame.player.karma}`);
  assert(coldGame.buildSanctumAgendaFailureRecoveryNotice(coldFailure) === null, `cold failure should not build a recovery notice, got ${JSON.stringify(coldGame.buildSanctumAgendaFailureRecoveryNotice(coldFailure))}`);

  const branchGame = createGame();
  branchGame.runSlateArchive = branchGame.normalizeRunSlateArchive(rawArchive);
  branchGame.persistRunSlateArchive();
  branchGame.setObservatoryTrainingFocus(focus, { silent: true });
  const branchAgenda = branchGame.activateSanctumAgenda('steady_line');
  assert(branchAgenda && branchAgenda.agendaId === 'steady_line', `branch case should activate steady line, got ${JSON.stringify(branchAgenda)}`);
  const branchChapterIndex = branchAgenda.boundChapterIndex || 7;
  branchGame.recordSanctumAgendaNodeProgress('observatory', { nodeId: 'branch_a', chapterIndex: branchChapterIndex, realm: branchChapterIndex, row: 1 });
  const branchDecision = branchGame.chooseSanctumAgendaDecision('seal_outline');
  assert(branchDecision && branchDecision.selectedDecisionId === 'seal_outline', `branch case should allow choosing seal_outline, got ${JSON.stringify(branchDecision)}`);
  branchGame.recordSanctumAgendaNodeProgress('event', { nodeId: 'branch_b', chapterIndex: branchChapterIndex, realm: branchChapterIndex, row: 2 });
  const branchState = branchGame.ensureSanctumAgendaState().activeAgenda;
  assert(branchState && Array.isArray(branchState.contractOptions) && branchState.contractOptions.some((entry) => entry.id === 'rift_margin'), `branch case should expose the new steady-line contract branch, got ${JSON.stringify(branchState)}`);
  const branchContract = branchGame.chooseSanctumAgendaContract('rift_margin');
  assert(branchContract && branchContract.selectedContractId === 'rift_margin', `new steady-line contract branch should be selectable, got ${JSON.stringify(branchContract)}`);
  assert(branchContract.contractSignCostLine === '🔮 1 / 🜂 1', `new steady-line contract branch should preserve the dual-resource stake, got ${JSON.stringify(branchContract)}`);
  assert(/裂隙/.test(branchContract.contractBurdenLine || ''), `new steady-line contract branch should preserve its burden line, got ${JSON.stringify(branchContract)}`);
  assert(branchGame.player.heavenlyInsight === 2 && branchGame.player.karma === 4, `new steady-line contract branch should spend both insight and karma, got insight=${branchGame.player.heavenlyInsight}, karma=${branchGame.player.karma}`);

  const salvageGame = createGame();
  salvageGame.runSlateArchive = salvageGame.normalizeRunSlateArchive(rawArchive);
  salvageGame.persistRunSlateArchive();
  salvageGame.setObservatoryTrainingFocus(focus, { silent: true });
  const salvageAgenda = salvageGame.activateSanctumAgenda('steady_line');
  assert(salvageAgenda && salvageAgenda.agendaId === 'steady_line', `salvage case should activate steady line, got ${JSON.stringify(salvageAgenda)}`);
  const salvageChapterIndex = salvageAgenda.boundChapterIndex || 7;
  salvageGame.recordSanctumAgendaNodeProgress('observatory', { nodeId: 'salvage_a', chapterIndex: salvageChapterIndex, realm: salvageChapterIndex, row: 1 });
  salvageGame.recordSanctumAgendaNodeProgress('event', { nodeId: 'salvage_b', chapterIndex: salvageChapterIndex, realm: salvageChapterIndex, row: 2 });
  const salvageFailure = salvageGame.resolveSanctumAgenda('realm_clear', {
    slate: {
      ...rawArchive[0],
      id: 'run_slate_salvage_steady',
      chapterIndex: salvageChapterIndex,
      chapterName: '第 7 章·稳线缺口'
    },
    answerSheet: {
      completedGoals: 3,
      totalGoals: 3,
      ratingTone: 'completed',
      ratingLabel: '稳线留稿',
      goals: [
        { deviated: false },
        { deviated: false },
        { deviated: false }
      ]
    }
  });
  assert(salvageFailure && salvageFailure.reasonId === 'node_shortfall', `steady line near-miss should fail via node_shortfall, got ${JSON.stringify(salvageFailure)}`);
  assert(salvageFailure.recoveryTier === 'salvage', `steady line near-miss should trigger salvage recovery, got ${JSON.stringify(salvageFailure)}`);
  assert(salvageFailure.recoveryReward && salvageFailure.recoveryReward.insight === 1, `steady line salvage should refund 1 insight, got ${JSON.stringify(salvageFailure)}`);
  assert(salvageFailure.recoveryReward && salvageFailure.recoveryReward.karma === 0, `steady line salvage should not refund karma, got ${JSON.stringify(salvageFailure)}`);
  assert(salvageFailure.recoveryReward && salvageFailure.recoveryReward.ringExp === 4, `steady line salvage should grant 4 ring exp, got ${JSON.stringify(salvageFailure)}`);
  assert(/关键节点补满/.test(salvageFailure.recoveryHintLine || ''), `node_shortfall should point players back to missing nodes, got ${JSON.stringify(salvageFailure)}`);
  const salvageSnapshot = salvageGame.getSanctumAgendaExpeditionSnapshot({ latestRunId: 'run_slate_salvage_steady' });
  assert(salvageSnapshot && salvageSnapshot.lastResolved && salvageSnapshot.lastResolved.recoveryTier === 'salvage', `salvage snapshot should expose the salvage tier, got ${JSON.stringify(salvageSnapshot)}`);
  const salvageRewardMeta = salvageGame.buildRewardExpeditionMeta({
    ...rawArchive[0],
    id: 'run_slate_salvage_steady',
    chapterIndex: salvageChapterIndex,
    chapterName: '第 7 章·稳线缺口'
  }, { agendaResolution: salvageFailure });
  assert(salvageRewardMeta && salvageRewardMeta.agenda && salvageRewardMeta.agenda.recoveryTier === 'salvage', `salvage reward meta should expose the salvage tier, got ${JSON.stringify(salvageRewardMeta)}`);
  assert(Array.isArray(salvageRewardMeta.focusLines) && salvageRewardMeta.focusLines.some((line) => /关键节点补满|残卷回收/.test(line || '')), `salvage reward meta should surface the recovery follow-up, got ${JSON.stringify(salvageRewardMeta)}`);
  const salvageNotice = salvageGame.buildSanctumAgendaFailureRecoveryNotice(salvageFailure);
  assert(salvageNotice && /残卷回收/.test(salvageNotice.title || ''), `salvage recovery should build a notice title, got ${JSON.stringify(salvageNotice)}`);
  assert(salvageNotice && /关键节点补满/.test(salvageNotice.message || ''), `salvage recovery notice should keep the node-shortfall hint, got ${JSON.stringify(salvageNotice)}`);
  assert(salvageNotice && salvageNotice.icon === '📜', `salvage recovery should map to the salvage icon, got ${JSON.stringify(salvageNotice)}`);

  const deepGame = createGame();
  deepGame.runSlateArchive = deepGame.normalizeRunSlateArchive(rawArchive);
  deepGame.persistRunSlateArchive();
  deepGame.setObservatoryTrainingFocus(focus, { silent: true });
  const deepAgenda = deepGame.activateSanctumAgenda('archive_line');
  assert(deepAgenda && deepAgenda.agendaId === 'archive_line', `deep recovery case should activate archive line, got ${JSON.stringify(deepAgenda)}`);
  const deepChapterIndex = deepAgenda.boundChapterIndex || 7;
  deepGame.recordSanctumAgendaNodeProgress('observatory', { nodeId: 'deep_a', chapterIndex: deepChapterIndex, realm: deepChapterIndex, row: 1 });
  const deepDecision = deepGame.chooseSanctumAgendaDecision('capture_excerpt');
  assert(deepDecision && deepDecision.selectedDecisionId === 'capture_excerpt', `deep recovery case should choose capture_excerpt, got ${JSON.stringify(deepDecision)}`);
  deepGame.recordSanctumAgendaNodeProgress('memory_rift', { nodeId: 'deep_b', chapterIndex: deepChapterIndex, realm: deepChapterIndex, row: 2 });
  const deepContract = deepGame.chooseSanctumAgendaContract('mirror_excerpt_lock');
  assert(deepContract && deepContract.selectedContractId === 'mirror_excerpt_lock', `deep recovery case should choose mirror_excerpt_lock, got ${JSON.stringify(deepContract)}`);
  const deepFailure = deepGame.resolveSanctumAgenda('realm_clear', {
    slate: {
      ...rawArchive[0],
      id: 'run_slate_deep_archive',
      chapterIndex: deepChapterIndex,
      chapterName: '第 7 章·偏题残卷'
    },
    answerSheet: {
      completedGoals: 1,
      totalGoals: 3,
      ratingTone: 'selected',
      ratingLabel: '偏卷留痕',
      goals: [{ deviated: true }]
    }
  });
  assert(deepFailure && deepFailure.reasonId === 'route_deviated', `deviated archive line should fail via route_deviated, got ${JSON.stringify(deepFailure)}`);
  assert(deepFailure.selectedContractLabel === '镜段封样', `deep recovery should preserve selected contract label, got ${JSON.stringify(deepFailure)}`);
  assert(deepFailure.contractResolved === true && deepFailure.contractSuccess === false, `deep recovery should still resolve the contract as failed, got ${JSON.stringify(deepFailure)}`);
  assert(/基础议程尚未结题/.test(deepFailure.contractResolutionLine || ''), `failed agenda with contract should keep the base-failed contract line, got ${JSON.stringify(deepFailure)}`);
  assert(deepFailure.recoveryTier === 'deep', `contract-backed archive failure should trigger deep recovery, got ${JSON.stringify(deepFailure)}`);
  assert(deepFailure.recoveryReward && deepFailure.recoveryReward.insight === 1, `deep archive recovery should refund 1 insight, got ${JSON.stringify(deepFailure)}`);
  assert(deepFailure.recoveryReward && deepFailure.recoveryReward.karma === 1, `deep archive recovery should refund 1 karma, got ${JSON.stringify(deepFailure)}`);
  assert(deepFailure.recoveryReward && deepFailure.recoveryReward.ringExp === 8, `deep archive recovery should grant 8 ring exp, got ${JSON.stringify(deepFailure)}`);
  assert(/契约旁注/.test(deepFailure.recoveryLine || ''), `deep recovery should keep contract residue in recovery line, got ${JSON.stringify(deepFailure)}`);
  assert(/答卷拉回主轴/.test(deepFailure.recoveryHintLine || ''), `route_deviated should point players back to the main axis, got ${JSON.stringify(deepFailure)}`);
  const deepSnapshot = deepGame.getSanctumAgendaExpeditionSnapshot({ latestRunId: 'run_slate_deep_archive' });
  assert(deepSnapshot && deepSnapshot.lastResolved && deepSnapshot.lastResolved.recoveryTier === 'deep', `deep snapshot should expose the deep recovery tier, got ${JSON.stringify(deepSnapshot)}`);
  assert(deepSnapshot && deepSnapshot.lastResolved && deepSnapshot.lastResolved.selectedContractLabel === '镜段封样', `deep snapshot should preserve the selected contract label, got ${JSON.stringify(deepSnapshot)}`);
  const deepRewardMeta = deepGame.buildRewardExpeditionMeta({
    ...rawArchive[0],
    id: 'run_slate_deep_archive',
    chapterIndex: deepChapterIndex,
    chapterName: '第 7 章·偏题残卷'
  }, { agendaResolution: deepFailure });
  assert(deepRewardMeta && deepRewardMeta.agenda && deepRewardMeta.agenda.recoveryTier === 'deep', `deep reward meta should expose the deep recovery tier, got ${JSON.stringify(deepRewardMeta)}`);
  assert(deepRewardMeta && deepRewardMeta.agenda && deepRewardMeta.agenda.selectedContractLabel === '镜段封样', `deep reward meta should preserve the selected contract label, got ${JSON.stringify(deepRewardMeta)}`);
  assert(Array.isArray(deepRewardMeta.focusLines) && deepRewardMeta.focusLines.some((line) => /契约旁注|残卷回收/.test(line || '')), `deep reward meta should surface contract residue and recovery, got ${JSON.stringify(deepRewardMeta)}`);
  const deepNotice = deepGame.buildSanctumAgendaFailureRecoveryNotice(deepFailure);
  assert(deepNotice && /残卷回收/.test(deepNotice.title || ''), `deep recovery should build a recovery notice title, got ${JSON.stringify(deepNotice)}`);
  assert(deepNotice && /补卷提示/.test(deepNotice.message || ''), `deep recovery notice should include the recovery hint, got ${JSON.stringify(deepNotice)}`);
  assert(deepNotice && deepNotice.icon === '📚', `deep recovery should map to the deep icon, got ${JSON.stringify(deepNotice)}`);
  assert(deepNotice && deepNotice.summaryLine === `洞府已执行${deepFailure.recoveryLabel}（${deepFailure.recoveryTierLabel}）`, `deep recovery notice should expose the summary line payload, got ${JSON.stringify(deepNotice)}`);

  const incompleteGame = createGame();
  incompleteGame.runSlateArchive = incompleteGame.normalizeRunSlateArchive(rawArchive);
  incompleteGame.persistRunSlateArchive();
  incompleteGame.setObservatoryTrainingFocus(focus, { silent: true });
  const incompleteAgenda = incompleteGame.activateSanctumAgenda('archive_line');
  assert(incompleteAgenda && incompleteAgenda.agendaId === 'archive_line', `answer incomplete case should activate archive line, got ${JSON.stringify(incompleteAgenda)}`);
  const incompleteChapterIndex = incompleteAgenda.boundChapterIndex || 7;
  incompleteGame.recordSanctumAgendaNodeProgress('observatory', { nodeId: 'incomplete_a', chapterIndex: incompleteChapterIndex, realm: incompleteChapterIndex, row: 1 });
  incompleteGame.recordSanctumAgendaNodeProgress('memory_rift', { nodeId: 'incomplete_b', chapterIndex: incompleteChapterIndex, realm: incompleteChapterIndex, row: 2 });
  const incompleteFailure = incompleteGame.resolveSanctumAgenda('realm_clear', {
    slate: {
      ...rawArchive[0],
      id: 'run_slate_incomplete_archive',
      chapterIndex: incompleteChapterIndex,
      chapterName: '第 7 章·未成补卷'
    },
    answerSheet: {
      completedGoals: 1,
      totalGoals: 3,
      ratingTone: 'idle',
      ratingLabel: '未成卷',
      goals: [{ deviated: false }]
    }
  });
  assert(incompleteFailure && incompleteFailure.reasonId === 'answer_incomplete', `archive line should fail via answer_incomplete when goals are missing, got ${JSON.stringify(incompleteFailure)}`);
  assert(incompleteFailure.recoveryTier === 'salvage', `answer_incomplete with full nodes should still salvage, got ${JSON.stringify(incompleteFailure)}`);
  assert(incompleteFailure.recoveryReward && incompleteFailure.recoveryReward.insight === 1, `answer_incomplete archive recovery should refund 1 insight, got ${JSON.stringify(incompleteFailure)}`);
  assert(incompleteFailure.recoveryReward && incompleteFailure.recoveryReward.karma === 1, `answer_incomplete archive recovery should refund 1 karma, got ${JSON.stringify(incompleteFailure)}`);
  assert(incompleteFailure.recoveryReward && incompleteFailure.recoveryReward.ringExp === 4, `answer_incomplete archive recovery should grant 4 ring exp, got ${JSON.stringify(incompleteFailure)}`);
  assert(/1\/3 条作答留痕/.test(incompleteFailure.recoveryLine || ''), `answer_incomplete recovery should mention retained goal traces, got ${JSON.stringify(incompleteFailure)}`);
  assert(/至少再补 1 条作答目标/.test(incompleteFailure.recoveryHintLine || ''), `answer_incomplete should point players to missing goal count, got ${JSON.stringify(incompleteFailure)}`);
  const incompleteSnapshot = incompleteGame.getSanctumAgendaExpeditionSnapshot({ latestRunId: 'run_slate_incomplete_archive' });
  assert(incompleteSnapshot && incompleteSnapshot.lastResolved && incompleteSnapshot.lastResolved.recoveryTier === 'salvage', `answer_incomplete snapshot should expose the salvage recovery tier, got ${JSON.stringify(incompleteSnapshot)}`);
  assert(incompleteSnapshot && incompleteSnapshot.lastResolved && /至少再补 1 条作答目标/.test(incompleteSnapshot.lastResolved.recoveryHintLine || ''), `answer_incomplete snapshot should preserve the missing-answer hint, got ${JSON.stringify(incompleteSnapshot)}`);
  assert(incompleteSnapshot && incompleteSnapshot.lastResolved && incompleteSnapshot.lastResolved.recoveryReward && incompleteSnapshot.lastResolved.recoveryReward.ringExp === 4, `answer_incomplete snapshot should preserve recovery rewards, got ${JSON.stringify(incompleteSnapshot)}`);
  const incompleteRewardMeta = incompleteGame.buildRewardExpeditionMeta({
    ...rawArchive[0],
    id: 'run_slate_incomplete_archive',
    chapterIndex: incompleteChapterIndex,
    chapterName: '第 7 章·未成补卷'
  }, { agendaResolution: incompleteFailure });
  assert(incompleteRewardMeta && incompleteRewardMeta.agenda && incompleteRewardMeta.agenda.recoveryTier === 'salvage', `answer_incomplete reward meta should expose the salvage tier, got ${JSON.stringify(incompleteRewardMeta)}`);
  assert(incompleteRewardMeta && incompleteRewardMeta.agenda && /至少再补 1 条作答目标/.test(incompleteRewardMeta.agenda.recoveryHintLine || ''), `answer_incomplete reward meta should preserve the missing-answer hint, got ${JSON.stringify(incompleteRewardMeta)}`);
  assert(incompleteRewardMeta && incompleteRewardMeta.agenda && incompleteRewardMeta.agenda.recoveryReward && incompleteRewardMeta.agenda.recoveryReward.ringExp === 4, `answer_incomplete reward meta should preserve recovery rewards, got ${JSON.stringify(incompleteRewardMeta)}`);
  assert(Array.isArray(incompleteRewardMeta.focusLines) && incompleteRewardMeta.focusLines.some((line) => /作答目标|残卷回收/.test(line || '')), `answer_incomplete reward meta should surface the missing-answer follow-up, got ${JSON.stringify(incompleteRewardMeta)}`);
  const incompleteRewardMetaFromSnapshot = incompleteGame.buildRewardExpeditionMeta({
    ...rawArchive[0],
    id: 'run_slate_incomplete_archive',
    chapterIndex: incompleteChapterIndex,
    chapterName: '第 7 章·未成补卷'
  });
  assert(incompleteRewardMetaFromSnapshot && incompleteRewardMetaFromSnapshot.agenda && incompleteRewardMetaFromSnapshot.agenda.recoveryTier === 'salvage', `implicit reward meta should recover answer_incomplete resolution from snapshot, got ${JSON.stringify(incompleteRewardMetaFromSnapshot)}`);
  assert(incompleteRewardMetaFromSnapshot && incompleteRewardMetaFromSnapshot.agenda && /至少再补 1 条作答目标/.test(incompleteRewardMetaFromSnapshot.agenda.recoveryHintLine || ''), `implicit reward meta should preserve answer_incomplete hinting, got ${JSON.stringify(incompleteRewardMetaFromSnapshot)}`);
  assert(incompleteRewardMetaFromSnapshot && incompleteRewardMetaFromSnapshot.agenda && incompleteRewardMetaFromSnapshot.agenda.recoveryReward && incompleteRewardMetaFromSnapshot.agenda.recoveryReward.karma === 1, `implicit reward meta should preserve answer_incomplete recovery rewards, got ${JSON.stringify(incompleteRewardMetaFromSnapshot)}`);
  const incompleteNotice = incompleteGame.buildSanctumAgendaFailureRecoveryNotice(incompleteFailure);
  assert(incompleteNotice && /残卷回收/.test(incompleteNotice.title || ''), `answer_incomplete recovery should build a notice title, got ${JSON.stringify(incompleteNotice)}`);
  assert(incompleteNotice && /至少再补 1 条作答目标/.test(incompleteNotice.message || ''), `answer_incomplete notice should keep the missing-answer hint, got ${JSON.stringify(incompleteNotice)}`);
  assert(incompleteNotice && incompleteNotice.icon === '📜', `answer_incomplete salvage should map to the salvage icon, got ${JSON.stringify(incompleteNotice)}`);

  const normalizedState = game.normalizeSanctumAgendaState({
    lastResolved: successResolution,
    totalCompleted: 1,
    totalFailed: 1
  });
  assert(normalizedState.lastResolved && normalizedState.lastResolved.agendaId === 'steady_line', `normalized state should preserve agenda resolution, got ${JSON.stringify(normalizedState)}`);

  console.log('sanity_dongfu_agenda_system_checks passed');
})();
