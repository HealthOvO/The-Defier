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
  const storage = new Map();

  const ctx = vm.createContext({
    console,
    window: {},
    Math,
    JSON,
    Date,
    Game: function Game() {
      this.player = {
        currentHp: 56,
        maxHp: 80,
        collectedLaws: [{ id: 'lawA' }, { id: 'lawB' }],
        collectedTreasures: [{ id: 'treasureA' }],
        applyRunVow: () => true
      };
      this.currentScreen = 'main-menu';
      this.currentSaveSlot = 0;
      this.challengeProgressState = null;
      this.challengeHubState = null;
      this.pendingChallengeStart = null;
      this.activeChallengeRun = null;
      this.observatoryArchiveState = null;
      this.startedRealm = 0;
      this.unlocks = [];
    },
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null
    },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    Utils: {
      showBattleLog: () => {}
    },
    CHARACTERS: {
      linFeng: { name: '林风' },
      xiangYe: { name: '香叶' },
      wuYu: { name: '无欲' },
      yanHan: { name: '严寒' },
      moChen: { name: '墨尘' },
      ningXuan: { name: '宁玄' }
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  ctx.Game.prototype.getRunDestinyMetaById = function (id) {
    return { id, name: `命格-${id}`, category: '测试', tierLabel: '初印', icon: '✦' };
  };
  ctx.Game.prototype.getSpiritCompanionMetaById = function (id) {
    return { id, name: `灵契-${id}`, title: '测试灵契', category: '灵契', tierLabel: '初契', icon: '🪷', passiveDesc: '被动', activeDesc: '主动' };
  };
  ctx.Game.prototype.getRunVowMetaById = function (id) {
    return { id, name: `誓约-${id}` };
  };
  ctx.Game.prototype.recordCollectionUnlock = function (type, payload) {
    this.unlocks.push({ type, ...payload });
    return true;
  };
  ctx.Game.prototype.getCollectionUnlockHistory = function () {
    return this.unlocks.slice().reverse();
  };
  ctx.Game.prototype.formatCollectionTimestamp = function () {
    return '最近';
  };
  ctx.Game.prototype.startRealm = function (realm) {
    this.startedRealm = realm;
  };

  loadFile(ctx, path.join(root, 'js/data/challenge_rules.js'));
  loadFile(ctx, path.join(root, 'js/core/challenge_hub.js'));

  const Game = vm.runInContext('Game', ctx);
  const game = new Game();

  const bundle = game.buildChallengeBundle('daily', new Date('2026-03-14T08:00:00'));
  assert(bundle && bundle.rule, 'daily bundle should exist');
  assert(/^D-/.test(bundle.seedSignature || ''), `seed signature should be generated, got ${bundle.seedSignature}`);

  game.finishStrategicNode(
    { id: 101, type: 'observatory' },
    '福缘星轨已定',
    '第 2 重路线趋向：机缘补给线。\n天机 +1。',
    '🔭'
  );
  const omenSummary = game.getObservatoryArchiveSummary();
  assert(omenSummary.totalRecords === 1, `observatory omen should create one archive entry, got ${omenSummary.totalRecords}`);
  assert(omenSummary.latest && omenSummary.latest.type === 'omen', `latest observatory archive should be omen, got ${JSON.stringify(omenSummary.latest)}`);
  assert(game.unlocks.some((entry) => entry.type === 'observatory' && /观星留痕/.test(entry.name || '')), 'observatory omen should also enter unlock feed');

  game.applyChallengeRunStart(bundle);
  game.activeChallengeRun.progress.battleWins = 2;
  game.activeChallengeRun.progress.realmClears = 1;
  game.player.currentHp = 60;
  const completed = game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
  const progressEntry = game.getChallengeProgressEntry('daily', bundle.rotationKey, false);
  assert(completed && completed.completed === true, 'completed challenge run should finalize');
  assert(progressEntry && progressEntry.completions === 1, `official challenge progress should increment once, got ${progressEntry && progressEntry.completions}`);

  const challengeArchive = game.getObservatoryArchiveEntries({ types: ['challenge'], replayableOnly: true, limit: 1 })[0];
  assert(challengeArchive && challengeArchive.seedSignature === bundle.seedSignature, 'completed challenge should create replayable archive record with same seed signature');
  assert(challengeArchive.themeLabel && challengeArchive.featuredTier, `challenge archive should expose theme and tier, got ${JSON.stringify(challengeArchive)}`);
  assert(Array.isArray(challengeArchive.featuredTags) && challengeArchive.featuredTags.length >= 2, `challenge archive should expose featured tags, got ${JSON.stringify(challengeArchive.featuredTags)}`);
  assert(challengeArchive.insight && challengeArchive.insight.title && challengeArchive.insight.summary, `challenge archive should expose replay insight, got ${JSON.stringify(challengeArchive && challengeArchive.insight)}`);
  assert(Array.isArray(challengeArchive.insight?.trainingTags) && challengeArchive.insight.trainingTags.length >= 1, `challenge archive insight should expose training tags, got ${JSON.stringify(challengeArchive && challengeArchive.insight)}`);
  assert(challengeArchive.insight && challengeArchive.insight.drillObjective, `challenge archive insight should expose drill objective, got ${JSON.stringify(challengeArchive && challengeArchive.insight)}`);
  const defaultGuide = game.getSelectedObservatoryExpeditionGuide();
  assert(defaultGuide && defaultGuide.id === challengeArchive.id, `latest featured archive should become default expedition guide, got ${JSON.stringify(defaultGuide)}`);
  assert(defaultGuide && defaultGuide.insight && defaultGuide.insight.title, `selected guide should expose archive insight, got ${JSON.stringify(defaultGuide)}`);
  assert(defaultGuide && Array.isArray(defaultGuide.preferredNodes) && defaultGuide.preferredNodes.length >= 1, `selected guide should expose preferred nodes, got ${JSON.stringify(defaultGuide)}`);
  assert(defaultGuide && /优先节点/.test(defaultGuide.routeFocusLine || ''), `selected guide should expose route focus line, got ${JSON.stringify(defaultGuide)}`);
  assert(defaultGuide && Array.isArray(defaultGuide.trainingTags) && defaultGuide.trainingTags.length >= 1, `selected guide should expose training tags, got ${JSON.stringify(defaultGuide)}`);
  assert(defaultGuide && defaultGuide.compareHint && defaultGuide.drillObjective, `selected guide should expose compare hint and drill objective, got ${JSON.stringify(defaultGuide)}`);

  game.applyChallengeRunStart(bundle);
  game.activeChallengeRun.progress.battleWins = 3;
  game.activeChallengeRun.progress.eliteWins = 1;
  game.activeChallengeRun.progress.realmClears = 1;
  game.player.currentHp = 48;
  const secondCompleted = game.finalizeActiveChallengeRun({ completed: true, reason: 'goal_reached' });
  assert(secondCompleted && secondCompleted.completed === true, 'second challenge completion should also finalize');
  const comparison = game.buildObservatoryThemeComparison({ mode: 'daily', rule: bundle.rule });
  assert(comparison.entries.length >= 2, `same-theme comparison should expose at least two archive samples, got ${JSON.stringify(comparison)}`);
  assert(comparison.entries.every((entry) => entry && entry.insight && entry.insight.title), `same-theme comparison entries should expose insight, got ${JSON.stringify(comparison.entries)}`);
  assert(comparison.entries.every((entry) => Array.isArray(entry.compareAxes) && entry.compareAxes.length === 3), `same-theme comparison entries should expose comparison axes, got ${JSON.stringify(comparison.entries)}`);
  assert(comparison.entries.every((entry) => /优先节点/.test(entry.routeFocusLine || '')), `same-theme comparison entries should expose route focus line, got ${JSON.stringify(comparison.entries)}`);
  const expectedThemeLabels = {
    assault: ['前段节拍', '收头效率', '高压接战'],
    bulwark: ['血线稳定', '守阵容错', '续航补件'],
    forge: ['补件速度', '器灵换强', '高压兑现'],
    oracle: ['观测收益', '路线贴合', '控场稳定'],
    tempo: ['连段续速', '中盘滚动', '资源衰减'],
    marathon: ['跨章耐压', '终盘完整度', '高压答卷'],
  };
  assert(
    comparison.entries.every((entry) => {
      const labels = entry.compareAxes.map((axis) => axis.label);
      return (expectedThemeLabels[comparison.themeKey] || []).every((label) => labels.includes(label));
    }),
    `theme-specific comparison should use labels for ${comparison.themeKey}, got ${JSON.stringify(comparison.entries)}`
  );
  const alternateGuide = comparison.entries.find((entry) => entry.id !== challengeArchive.id);
  assert(alternateGuide && game.selectObservatoryExpeditionGuide(alternateGuide.id, { silent: true }) === true, 'player should be able to switch expedition guide inside same-theme comparison');
  const switchedGuide = game.getSelectedObservatoryExpeditionGuide();
  assert(switchedGuide && switchedGuide.id === alternateGuide.id, `selected expedition guide should switch to requested archive, got ${JSON.stringify(switchedGuide)}`);
  assert(switchedGuide && Array.isArray(switchedGuide.trainingTags) && switchedGuide.trainingTags.length >= 1, `switched expedition guide should retain training tags, got ${JSON.stringify(switchedGuide)}`);
  const trainingFocus = game.setObservatoryTrainingFocus({
    sourceRunId: 'chapter_focus_a',
    chapterName: '第 3 章',
    sourceTitle: switchedGuide?.title || '当前精选命盘',
    guideRecordId: switchedGuide?.id || '',
    themeKey: switchedGuide?.themeKey || 'assault',
    themeLabel: switchedGuide?.themeLabel || '前压爆发',
    ratingLabel: '贴题成卷',
    ratingTone: 'completed',
    trainingAdvice: `先按${switchedGuide?.themeLabel || '当前样本'}样本补齐前两手节奏，再回头校正悬赏合卷。`,
    highlightLine: '上一章已经给出主练方向，下一轮应该先回到对应命盘样本里找可复刻答卷。',
    routeFocusLine: switchedGuide?.routeFocusLine || '优先节点：战斗 / 精英 / 试炼',
    compareHint: switchedGuide?.compareHint || '对比先手压制、收头效率与能否稳定抢下前段节拍。',
    trainingTags: switchedGuide?.trainingTags || ['稳血收官'],
    goalHighlights: ['路线扣题：已按样本锁线', '样本实操：前两手资源必须贴题']
  }, { silent: true });
  assert(
    trainingFocus
      && trainingFocus.guideRecordId === switchedGuide.id
      && trainingFocus.themeKey === switchedGuide.themeKey
      && typeof trainingFocus.trainingAdvice === 'string'
      && trainingFocus.trainingAdvice.length > 0,
    `observatory guide state should accept persisted training focus relay, got ${JSON.stringify(trainingFocus)}`
  );

  const oracleRule = (ctx.CHALLENGE_RULES?.daily || []).find((rule) => rule.id === 'daily_star_script');
  assert(oracleRule, 'oracle daily rule should exist for theme-specific comparison coverage');
  game.recordObservatoryArchiveEntry({
    id: 'oracle_manual_a',
    type: 'challenge',
    mode: 'daily',
    rotationKey: '2026-03-14',
    title: oracleRule.name,
    score: 166,
    completed: true,
    at: Date.now() + 1,
    seedSignature: 'D-ORACLE-A',
    reason: 'goal_reached',
    replayOnly: false,
    metrics: {
      hpRatio: 0.74,
      lawGains: 2,
      treasureGains: 1,
      battleWins: 3,
      eliteWins: 1,
      bossWins: 0,
      realmClears: 3,
    },
    preferredNodes: ['observatory', 'event', 'memory_rift'],
    rule: oracleRule,
  });
  game.recordObservatoryArchiveEntry({
    id: 'oracle_manual_b',
    type: 'challenge',
    mode: 'daily',
    rotationKey: '2026-03-14',
    title: oracleRule.name,
    score: 148,
    completed: true,
    at: Date.now() + 2,
    seedSignature: 'D-ORACLE-B',
    reason: 'goal_reached',
    replayOnly: false,
    metrics: {
      hpRatio: 0.61,
      lawGains: 1,
      treasureGains: 0,
      battleWins: 2,
      eliteWins: 0,
      bossWins: 0,
      realmClears: 2,
    },
    preferredNodes: ['observatory', 'event', 'memory_rift'],
    rule: oracleRule,
  });
  const oracleComparison = game.buildObservatoryThemeComparison({ mode: 'daily', rule: oracleRule });
  assert(oracleComparison.themeKey === 'oracle', `oracle comparison should resolve oracle theme, got ${JSON.stringify(oracleComparison)}`);
  assert(
    oracleComparison.entries.length >= 2
      && oracleComparison.entries.every((entry) => {
        const labels = entry.compareAxes.map((axis) => axis.label);
        return labels.includes('观测收益') && labels.includes('路线贴合') && labels.includes('控场稳定');
      }),
    `oracle comparison should use oracle-specific labels, got ${JSON.stringify(oracleComparison.entries)}`
  );
  const weeklyRule = (ctx.CHALLENGE_RULES?.weekly || [])[0];
  assert(weeklyRule, 'weekly rule should exist for cross-scope observatory filter coverage');
  game.recordObservatoryArchiveEntry({
    id: 'weekly_manual_a',
    type: 'challenge',
    mode: 'weekly',
    rotationKey: '2026-W11',
    title: weeklyRule.name,
    score: 172,
    completed: true,
    at: Date.now() - 3600000,
    seedSignature: 'W-WEEKLY-A',
    reason: 'goal_reached',
    replayOnly: false,
    metrics: {
      hpRatio: 0.69,
      lawGains: 2,
      treasureGains: 1,
      battleWins: 4,
      eliteWins: 1,
      bossWins: 0,
      realmClears: 3,
    },
    preferredNodes: ['elite', 'trial', 'observatory'],
    rule: weeklyRule,
  });

  const replayStarted = game.beginObservatoryReplay(challengeArchive.id);
  assert(replayStarted === true, 'beginObservatoryReplay should start a pending replay');
  assert(game.pendingChallengeStart && game.pendingChallengeStart.replayOnly === true, 'pending replay should mark replayOnly');
  assert(game.pendingChallengeStart.bundleSnapshot && game.pendingChallengeStart.bundleSnapshot.replayOnly === true, 'pending replay should carry replay bundle snapshot');
  assert(game.pendingChallengeStart.archiveInsight && /回放/.test(game.pendingChallengeStart.archiveInsight.title || ''), `pending replay should carry replay insight, got ${JSON.stringify(game.pendingChallengeStart && game.pendingChallengeStart.archiveInsight)}`);

  const completionsBeforeReplay = progressEntry.completions;
  game.startNewGame('linFeng');
  assert(game.activeChallengeRun && game.activeChallengeRun.replayOnly === true, 'replay start should create replayOnly active run');
  assert(game.activeChallengeRun.archiveEntryId === challengeArchive.id, `replay run should remember source archive id, got ${game.activeChallengeRun.archiveEntryId}`);
  assert(game.startedRealm === 1, `replay start should enter realm 1, got ${game.startedRealm}`);
  assert(game.activeChallengeRun.archiveInsight && /回放/.test(game.activeChallengeRun.archiveInsight.title || ''), `active replay should preserve replay insight, got ${JSON.stringify(game.activeChallengeRun && game.activeChallengeRun.archiveInsight)}`);
  const replayPayload = game.getChallengeHubPayload();
  assert(replayPayload.activeRun && replayPayload.activeRun.archiveInsight && replayPayload.activeRun.archiveInsight.title, `payload should expose replay run insight, got ${JSON.stringify(replayPayload.activeRun)}`);

  game.activeChallengeRun.progress.battleWins = 1;
  game.player.currentHp = 50;
  const replayResult = game.finalizeActiveChallengeRun({ completed: false, reason: 'battle_lost' });
  const progressAfterReplay = game.getChallengeProgressEntry('daily', bundle.rotationKey, false);
  assert(replayResult && replayResult.replayOnly === true, 'replay finalize should return replay run');
  assert(progressAfterReplay && progressAfterReplay.completions === completionsBeforeReplay, 'replay finalize must not mutate official completion totals');

  const latestArchive = game.getObservatoryArchiveEntries({ limit: 1 })[0];
  assert(latestArchive && latestArchive.type === 'replay', `latest archive should be replay result, got ${JSON.stringify(latestArchive)}`);
  assert(/回放不计奖励/.test(latestArchive.note || ''), `replay note should mention non-reward replay, got ${latestArchive.note}`);
  assert(latestArchive.insight && /回放/.test(latestArchive.insight.title || ''), `replay archive should expose replay insight, got ${JSON.stringify(latestArchive && latestArchive.insight)}`);
  assert(game.unlocks.some((entry) => /命盘回放/.test(entry.name || '')), 'replay result should also appear in unlock feed');

  game.currentScreen = 'challenge-screen';
  game.challengeHubState = { tab: 'daily' };
  const liveHubBundle = game.buildChallengeBundle('daily');
  const defaultArchiveFilters = game.getChallengeArchiveFilterState('daily');
  assert(
    defaultArchiveFilters.scope === 'mode'
      && defaultArchiveFilters.track === 'playable'
      && defaultArchiveFilters.outcome === 'all'
      && defaultArchiveFilters.themeKey === 'all'
      && defaultArchiveFilters.sortBy === 'recent',
    `observatory archive filters should bootstrap to default state, got ${JSON.stringify(defaultArchiveFilters)}`
  );
  const defaultArchiveFilterBundle = game.buildChallengeArchiveFilterBundle(liveHubBundle);
  assert(
    defaultArchiveFilterBundle.matchedCount >= 3
      && defaultArchiveFilterBundle.scopeTotalCount >= defaultArchiveFilterBundle.matchedCount
      && defaultArchiveFilterBundle.trackLabel === '可回放'
      && defaultArchiveFilterBundle.sortLabel === '最新留痕'
      && Array.isArray(defaultArchiveFilterBundle.presetSlots)
      && defaultArchiveFilterBundle.presetSlots.length === 2,
    `default observatory archive filter bundle should expose playable history view, got ${JSON.stringify(defaultArchiveFilterBundle)}`
  );
  game.setChallengeArchiveFilter('scope', 'all', 'daily');
  game.setChallengeArchiveFilter('track', 'challenge', 'daily');
  game.setChallengeArchiveFilter('outcome', 'completed', 'daily');
  game.setChallengeArchiveFilter('themeKey', 'oracle', 'daily');
  game.setChallengeArchiveFilter('sortBy', 'score_desc', 'daily');
  const oracleFilterBundle = game.buildChallengeArchiveFilterBundle(liveHubBundle);
  assert(
    oracleFilterBundle.state.scope === 'all'
      && oracleFilterBundle.state.track === 'challenge'
      && oracleFilterBundle.state.outcome === 'completed'
      && oracleFilterBundle.state.themeKey === 'oracle'
      && oracleFilterBundle.state.sortBy === 'score_desc'
      && oracleFilterBundle.entries.length >= 2
      && oracleFilterBundle.entries.every((entry) => entry.type === 'challenge' && entry.completed && entry.themeKey === 'oracle')
      && oracleFilterBundle.entries[0].score >= oracleFilterBundle.entries[1].score
      && oracleFilterBundle.scopeTotalCount > oracleFilterBundle.entries.length,
    `archive filters should support cross-scope completed oracle challenge retrieval, got ${JSON.stringify(oracleFilterBundle)}`
  );
  assert(game.saveChallengeArchivePreset(0, 'daily') === true, 'player should be able to save current observatory archive preset');
  assert(/预设 1/.test(game.getChallengeArchivePresetLabel(0, 'daily')), 'saved observatory preset should expose slot label');
  const persistedFilterState = JSON.parse(storage.get('theDefierChallengeHubStateV1') || '{}');
  assert(
    persistedFilterState.archiveFilters?.daily?.scope === 'all'
      && persistedFilterState.archiveFilters?.daily?.track === 'challenge'
      && persistedFilterState.archiveFilters?.daily?.outcome === 'completed'
      && persistedFilterState.archiveFilters?.daily?.themeKey === 'oracle'
      && persistedFilterState.archiveFilters?.daily?.sortBy === 'score_desc'
      && persistedFilterState.archivePresets?.daily?.[0]?.state?.themeKey === 'oracle'
      && persistedFilterState.archivePresets?.daily?.[0]?.state?.sortBy === 'score_desc',
    `archive filter state should persist into localStorage, got ${JSON.stringify(persistedFilterState)}`
  );
  const reloadedGame = new Game();
  const reloadedFilters = reloadedGame.getChallengeArchiveFilterState('daily');
  assert(
    reloadedFilters.scope === 'all'
      && reloadedFilters.track === 'challenge'
      && reloadedFilters.outcome === 'completed'
      && reloadedFilters.themeKey === 'oracle'
      && reloadedFilters.sortBy === 'score_desc',
    `reloaded game should restore persisted archive filters, got ${JSON.stringify(reloadedFilters)}`
  );
  const reloadedPresetLabel = reloadedGame.getChallengeArchivePresetLabel(0, 'daily');
  assert(/高分优先/.test(reloadedPresetLabel || ''), `reloaded preset label should mention score sorting, got ${reloadedPresetLabel}`);
  game.setChallengeArchiveFilter('track', 'replay', 'daily');
  game.setChallengeArchiveFilter('outcome', 'failed', 'daily');
  game.setChallengeArchiveFilter('themeKey', 'all', 'daily');
  game.setChallengeArchiveFilter('sortBy', 'recent', 'daily');
  const failedReplayFilterBundle = game.buildChallengeArchiveFilterBundle(liveHubBundle);
  assert(
    failedReplayFilterBundle.entries.length >= 1
      && failedReplayFilterBundle.entries.every((entry) => entry.type === 'replay' && !entry.completed)
      && failedReplayFilterBundle.failedCount >= 1,
    `archive filters should isolate failed replay samples, got ${JSON.stringify(failedReplayFilterBundle)}`
  );
  game.resetChallengeArchiveFilters('daily');
  const resetArchiveFilters = game.getChallengeArchiveFilterState('daily');
  assert(
    resetArchiveFilters.scope === 'mode'
      && resetArchiveFilters.track === 'playable'
      && resetArchiveFilters.outcome === 'all'
      && resetArchiveFilters.themeKey === 'all'
      && resetArchiveFilters.sortBy === 'recent',
    `resetChallengeArchiveFilters should restore defaults, got ${JSON.stringify(resetArchiveFilters)}`
  );
  assert(game.applyChallengeArchivePreset(0, 'daily') === true, 'player should be able to apply saved observatory preset');
  const presetAppliedFilters = game.getChallengeArchiveFilterState('daily');
  assert(
    presetAppliedFilters.scope === 'all'
      && presetAppliedFilters.track === 'challenge'
      && presetAppliedFilters.outcome === 'completed'
      && presetAppliedFilters.themeKey === 'oracle'
      && presetAppliedFilters.sortBy === 'score_desc'
      && game.isChallengeArchivePresetActive(0, 'daily') === true,
    `applyChallengeArchivePreset should restore saved state, got ${JSON.stringify(presetAppliedFilters)}`
  );
  const presetAppliedBundle = game.buildChallengeArchiveFilterBundle(liveHubBundle);
  assert(
    presetAppliedBundle.entries.length >= 2
      && presetAppliedBundle.entries[0].score >= presetAppliedBundle.entries[1].score
      && presetAppliedBundle.presetSlots[0]?.active === true,
    `applied observatory preset should restore score-sorted oracle view, got ${JSON.stringify(presetAppliedBundle)}`
  );
  const payload = game.getChallengeHubPayload();
  assert(payload.archive && payload.archive.totalRecords >= 3, `payload should expose archive summary, got ${JSON.stringify(payload.archive)}`);
  assert(payload.hub && payload.hub.seedSignature === liveHubBundle.seedSignature, `hub payload should expose live seed signature, got ${JSON.stringify(payload.hub)}`);
  assert(payload.archive.selectedGuideId === switchedGuide.id, `payload should expose selected expedition guide, got ${JSON.stringify(payload.archive)}`);
  assert(payload.archive.latestInsight && payload.archive.latestInsight.summary && payload.archive.latestInsight.focusLines.length >= 1, `archive payload should expose latest insight detail, got ${JSON.stringify(payload.archive)}`);
  assert(payload.archive.latestInsightTitle && /回放|复刻|剖面/.test(payload.archive.latestInsightTitle), `archive payload should expose latest insight label, got ${JSON.stringify(payload.archive)}`);
  assert(
    payload.archive.filterState
      && payload.archive.filterState.scope === 'all'
      && payload.archive.filterState.track === 'challenge'
      && payload.archive.filterState.outcome === 'completed'
      && payload.archive.filterState.themeKey === 'oracle'
      && payload.archive.filterState.sortBy === 'score_desc'
      && payload.archive.filteredCount >= 2
      && payload.archive.scopeTotalCount > payload.archive.filteredCount
      && /跨赛道/.test(payload.archive.filteredScopeLabel || '')
      && /挑战成绩/.test(payload.archive.filteredTrackLabel || '')
      && /完成答卷/.test(payload.archive.filteredOutcomeLabel || '')
      && /oracle|推演控场|当前主题/.test(payload.archive.filteredThemeLabel || '')
      && /高分优先/.test(payload.archive.sortLabel || '')
      && Array.isArray(payload.archive.activePresetSlots)
      && payload.archive.activePresetSlots.includes(0)
      && Array.isArray(payload.archive.presetLabels)
      && /预设 1/.test(payload.archive.presetLabels[0] || ''),
    `archive payload should expose active observatory filter state and counts, got ${JSON.stringify(payload.archive)}`
  );
  assert(payload.hub.comparisonCount >= 2, `payload should expose same-theme comparison count, got ${JSON.stringify(payload.hub)}`);
  assert(payload.observatoryGuide && payload.observatoryGuide.featuredTags.length >= 2, `payload should expose observatory guide tags, got ${JSON.stringify(payload.observatoryGuide)}`);
  assert(payload.observatoryGuide && payload.observatoryGuide.trainingTags.length >= 1, `payload should expose observatory guide training tags, got ${JSON.stringify(payload.observatoryGuide)}`);
  assert(payload.observatoryGuide && payload.observatoryGuide.preferredNodes.length >= 1, `payload should expose observatory guide preferred nodes, got ${JSON.stringify(payload.observatoryGuide)}`);
  assert(payload.observatoryGuide && /优先节点/.test(payload.observatoryGuide.routeFocusLine || ''), `payload should expose observatory guide route focus line, got ${JSON.stringify(payload.observatoryGuide)}`);
  assert(payload.observatoryGuide && payload.observatoryGuide.compareHint && payload.observatoryGuide.drillObjective, `payload should expose observatory guide compare hint and drill objective, got ${JSON.stringify(payload.observatoryGuide)}`);
  assert(payload.observatoryGuide && payload.observatoryGuide.insight && payload.observatoryGuide.insight.title, `payload should expose observatory guide insight, got ${JSON.stringify(payload.observatoryGuide)}`);
  assert(
    payload.trainingFocus
      && payload.trainingFocus.guideRecordId === switchedGuide.id
      && payload.trainingFocus.themeKey === switchedGuide.themeKey
      && typeof payload.trainingFocus.trainingAdvice === 'string'
      && payload.trainingFocus.trainingAdvice.length > 0
      && Array.isArray(payload.trainingFocus.goalHighlights)
      && payload.trainingFocus.goalHighlights.length >= 1
      && payload.archive.trainingFocusAdvice === payload.trainingFocus.trainingAdvice
      && payload.archive.trainingFocusThemeLabel === payload.trainingFocus.themeLabel,
    `payload should expose persisted observatory training focus relay, got ${JSON.stringify(payload)}` 
  );
  assert(game.applyObservatoryTrainingFocus('daily') === true, 'player should be able to jump archive filters back to the persisted training focus');
  const trainingFocusFilters = game.getChallengeArchiveFilterState('daily');
  assert(
    trainingFocusFilters.scope === 'all'
      && trainingFocusFilters.track === 'playable'
      && trainingFocusFilters.outcome === 'all'
      && trainingFocusFilters.themeKey === switchedGuide.themeKey
      && trainingFocusFilters.sortBy === 'score_desc',
    `applyObservatoryTrainingFocus should restore the expected cross-scope playable view, got ${JSON.stringify(trainingFocusFilters)}`
  );
  const persistedGuideState = JSON.parse(storage.get('theDefierObservatoryGuideStateV1') || '{}');
  assert(
    persistedGuideState.trainingFocus?.guideRecordId === switchedGuide.id
      && persistedGuideState.trainingFocus?.themeKey === switchedGuide.themeKey
      && persistedGuideState.trainingFocus?.trainingAdvice === trainingFocus.trainingAdvice,
    `observatory guide state should persist training focus into localStorage, got ${JSON.stringify(persistedGuideState)}`
  );
  const reloadedFocusGame = new Game();
  const reloadedTrainingFocus = reloadedFocusGame.getObservatoryTrainingFocus();
  assert(
    reloadedTrainingFocus
      && reloadedTrainingFocus.guideRecordId === switchedGuide.id
      && reloadedTrainingFocus.themeKey === switchedGuide.themeKey
      && reloadedTrainingFocus.trainingAdvice === trainingFocus.trainingAdvice,
    `reloaded game should restore observatory training focus relay, got ${JSON.stringify(reloadedTrainingFocus)}`
  );

  console.log('Observatory archive checks passed.');
})();
