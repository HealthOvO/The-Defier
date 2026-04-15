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

  loadFile(ctx, path.join(root, 'js/data/cards.js'));
  loadFile(ctx, path.join(root, 'js/data/laws.js'));
  loadFile(ctx, path.join(root, 'js/data/treasures.js'));
  loadFile(ctx, path.join(root, 'js/data/enemies.js'));
  loadFile(ctx, path.join(root, 'js/data/boss_mechanics.js'));
  loadFile(ctx, path.join(root, 'js/data/achievements.js'));
  loadFile(ctx, path.join(root, 'js/data/run_destinies.js'));
  loadFile(ctx, path.join(root, 'js/data/run_paths.js'));
  loadFile(ctx, path.join(root, 'js/data/run_vows.js'));
  loadFile(ctx, path.join(root, 'js/data/spirit_companions.js'));
  loadFile(ctx, path.join(root, 'js/data/fate_ring.js'));
  loadFile(ctx, path.join(root, 'js/data/challenge_rules.js'));
  loadFile(ctx, path.join(root, 'js/data/expedition_systems.js'));
  loadFile(ctx, path.join(root, 'js/core/fateRing.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/core/achievements.js'));
  loadFile(ctx, path.join(root, 'js/game.js'));
  loadFile(ctx, path.join(root, 'js/core/collection_hub.js'));
  loadFile(ctx, path.join(root, 'js/core/challenge_hub.js'));
  loadFile(ctx, path.join(root, 'js/core/expedition_hub.js'));

  const Game = vm.runInContext('Game', ctx);
  const Player = vm.runInContext('Player', ctx);
  const AchievementSystem = vm.runInContext('AchievementSystem', ctx);
  const ACHIEVEMENTS = vm.runInContext('ACHIEVEMENTS', ctx);
  const LAWS = vm.runInContext('LAWS', ctx);

  function createGame() {
    const game = Object.create(Game.prototype);
    game.player = new Player('linFeng');
    game.player.game = game;
    game.achievementSystem = new AchievementSystem(game);
    game.achievementSystem.queuePopup = () => {};
    game.achievementSystem.showNextPopup = () => {};
    game.unlockedRealms = [1, 2, 3, 4, 5, 6, 7];
    game.pendingSpiritCompanionDrafts = { linFeng: ['emberCrow', 'spiritApe'] };
    game.selectedCharacterId = 'linFeng';
    game.endlessState = Game.prototype.createDefaultEndlessState.call(game);
    game.encounterState = Game.prototype.createDefaultEncounterState.call(game);
    game.currentScreen = 'collection';
    game.initCollection = () => {};
    game.showScreen = () => {};

    game.player.setRunDestiny('rebelScale', 1);
    game.player.setRunPath('insight');
    game.player.setSpiritCompanion('emberCrow', 1);
    game.player.collectLaw(LAWS.flameTruth || Object.values(LAWS)[0]);
    game.player.collectLaw(LAWS.thunderLaw || Object.values(LAWS)[1]);
    game.player.addTreasure('soul_jade');
    game.player.addTreasure('ice_spirit_bead');
    game.player.fateRing.getSocketedLaws = () => ['flameTruth', 'thunderLaw'].filter((id) => !!LAWS[id]);

    const firstAchievementId = Object.keys(ACHIEVEMENTS)[0];
    game.achievementSystem.unlockAchievement(firstAchievementId);
    return game;
  }

  const rawArchive = [
    {
      id: 'run_slate_oracle_5',
      chapterIndex: 5,
      chapterName: '第 5 章·星穹回廊',
      endingId: 'alliance',
      endingName: '星图合卷',
      endingIcon: '🔭',
      score: 246,
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
        id: 'topic_oracle_5',
        sourceRecordId: 'guide_oracle_5',
        sourceTitle: '星镜试锋',
        themeKey: 'oracle',
        themeLabel: '推演控场',
        routeFocusLine: '优先节点：观星 / 事件 / 裂隙',
        compareHint: '对比观测收益、路线贴合与控场稳定。',
        trainingTags: ['路线贴合', '控场稳定'],
        goalLines: ['先走观星线再补事件收益']
      },
      observatoryLink: {
        sourceRecordId: 'guide_oracle_5',
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
      timestamp: 246000
    },
    {
      id: 'run_slate_assault_4',
      chapterIndex: 4,
      chapterName: '第 4 章·焚城试炼',
      endingId: 'hunt',
      endingName: '火线追猎',
      endingIcon: '🔥',
      score: 214,
      scoreBreakdown: [
        '章节答卷：贴题成卷 · 2/3 项达成',
        '训练建议：先抢前两手节奏，再把爆发留给高压段'
      ],
      branchName: '火线突进',
      bountyNames: ['前锋清缴'],
      factionSummary: ['燎原盟·支援'],
      nemesisName: '炽烬追猎者',
      nemesisStatus: 'released',
      nemesisStatusLabel: '已解卷',
      tags: ['课题·前压爆发', '答卷·贴题成卷', '训练·稳血收官'],
      practiceTopic: {
        id: 'topic_assault_4',
        sourceRecordId: 'guide_assault_4',
        sourceTitle: '焚脉试锋',
        themeKey: 'assault',
        themeLabel: '前压爆发',
        routeFocusLine: '优先节点：战斗 / 精英 / 试炼',
        compareHint: '对比先手压制、收头效率与高压段处理。',
        trainingTags: ['稳血收官', '高压过线'],
        goalLines: ['保留一段爆发或兜底']
      },
      observatoryLink: {
        sourceRecordId: 'guide_assault_4',
        sourceTitle: '焚脉试锋',
        sourceThemeKey: 'assault',
        sourceThemeLabel: '前压爆发',
        routeFocusLine: '优先节点：战斗 / 精英 / 试炼',
        compareHint: '对比先手压制、收头效率与高压段处理。',
        trainingTags: ['稳血收官', '高压过线'],
        drillObjective: '在第 2 次高压战前保留一段爆发或兜底。'
      },
      answerReview: {
        title: '章节观星回响',
        ratingLabel: '贴题成卷',
        ratingTone: 'completed',
        trainingAdvice: '先抢前两手节奏，再把爆发资源留到高压段兑现。',
        highlightLine: '前段答卷已经贴题，下一轮继续沿战斗稠密线补题。',
        overviewLine: '章节答卷已经开始成卷。'
      },
      themeKey: 'assault',
      themeLabel: '前压爆发',
      ratingLabel: '贴题成卷',
      ratingTone: 'completed',
      timestamp: 214000
    },
    {
      id: 'run_slate_forge_2',
      chapterIndex: 2,
      chapterName: '第 2 章·铸脉工坊',
      endingId: 'sealed',
      endingName: '工坊压题',
      endingIcon: '⚒',
      score: 162,
      scoreBreakdown: [
        '章节答卷：仍在校卷 · 1/3 项达成',
        '训练建议：先补炼器节点，再回主线校正爆发窗口'
      ],
      branchName: '锻线回补',
      bountyNames: ['锻炉勘验'],
      factionSummary: ['工坊会盟·观望'],
      nemesisName: '炉心监工',
      nemesisStatus: 'hunting',
      nemesisStatusLabel: '追猎中',
      tags: ['课题·补件速度', '答卷·仍在校卷', '训练·补件速度'],
      practiceTopic: {
        id: 'topic_forge_2',
        sourceRecordId: 'guide_forge_2',
        sourceTitle: '炉脉校谱',
        themeKey: 'forge',
        themeLabel: '补件速度',
        routeFocusLine: '优先节点：锻炉 / 商店 / 精英',
        compareHint: '对比补件速度、器灵换强与高压兑现。',
        trainingTags: ['补件速度', '器灵换强'],
        goalLines: ['先补核心件再接高压战']
      },
      observatoryLink: {
        sourceRecordId: 'guide_forge_2',
        sourceTitle: '炉脉校谱',
        sourceThemeKey: 'forge',
        sourceThemeLabel: '补件速度',
        routeFocusLine: '优先节点：锻炉 / 商店 / 精英',
        compareHint: '对比补件速度、器灵换强与高压兑现。',
        trainingTags: ['补件速度', '器灵换强'],
        drillObjective: '在进入高压节点前补出 1 个核心件或换强点。'
      },
      answerReview: {
        title: '章节观星回响',
        ratingLabel: '仍在校卷',
        ratingTone: 'selected',
        trainingAdvice: '先补炼器节点，再回主线校正资源与爆发窗口。',
        highlightLine: '这章还在校卷，先把补件节奏拉顺再谈高压兑现。',
        overviewLine: '章节答卷仍在校卷。'
      },
      themeKey: 'forge',
      themeLabel: '补件速度',
      ratingLabel: '仍在校卷',
      ratingTone: 'selected',
      timestamp: 162000
    }
  ];

  const game = createGame();
  game.runSlateArchive = game.normalizeRunSlateArchive(rawArchive);
  game.persistRunSlateArchive();

  assert(Array.isArray(game.runSlateArchive) && game.runSlateArchive.length === 3, `run slate shelf should normalize and keep 3 entries, got ${JSON.stringify(game.runSlateArchive)}`);
  assert(game.runSlateArchive[0].id === 'run_slate_oracle_5', `run slate shelf should sort archive by recent timestamp, got ${JSON.stringify(game.runSlateArchive.map((entry) => entry.id))}`);

  const latestSlate = game.runSlateArchive[0];
  const latestFocus = typeof game.buildObservatoryTrainingFocusFromSlate === 'function'
    ? game.buildObservatoryTrainingFocusFromSlate(latestSlate)
    : null;
  assert(
    latestFocus
      && latestFocus.sourceRunId === latestSlate.id
      && latestFocus.chapterName === latestSlate.chapterName
      && latestFocus.themeKey === 'oracle'
      && latestFocus.themeLabel === '推演控场'
      && latestFocus.ratingLabel === '天象合卷'
      && latestFocus.ratingTone === 'completed'
      && /观星链路|线索写满/.test(latestFocus.trainingAdvice || ''),
    `run slate shelf should preserve theme and rating context for training reference actions, got slate=${JSON.stringify(latestSlate)} focus=${JSON.stringify(latestFocus)}`
  );

  const archiveSummary = game.getRunSlateArchiveSummary();
  assert(
    archiveSummary.count === 3
      && archiveSummary.latest?.id === 'run_slate_oracle_5'
      && archiveSummary.topScore === 246,
    `run slate shelf summary should expose archive count, latest entry and top score, got ${JSON.stringify(archiveSummary)}`
  );

  game.switchCollectionSection('slates');
  game.setRunSlateShelfThemeFilter('oracle');
  game.setRunSlateShelfChapterFilter('chapter_5');
  game.setRunSlateShelfRatingFilter('completed');
  const collectionState = game.getCollectionHubState();
  assert(
    collectionState.section === 'slates'
      && collectionState.slateTheme === 'oracle'
      && collectionState.slateChapter === 'chapter_5'
      && collectionState.slateRating === 'completed',
    `run slate shelf filters should persist in collection state, got ${JSON.stringify(collectionState)}`
  );

  const storedFocus = game.setObservatoryTrainingFocus(latestFocus, { silent: true });
  assert(
    storedFocus
      && storedFocus.sourceRunId === latestSlate.id
      && storedFocus.themeKey === latestFocus.themeKey
      && storedFocus.ratingLabel === latestFocus.ratingLabel,
    `setting a run slate as current training reference should persist the latest slate focus, got ${JSON.stringify(storedFocus)}`
  );
  const persistedFocus = game.getObservatoryTrainingFocus();
  assert(
    persistedFocus
      && persistedFocus.sourceRunId === latestSlate.id
      && persistedFocus.themeKey === 'oracle'
      && persistedFocus.trainingAdvice === latestFocus.trainingAdvice,
    `training reference should reload from observatory guide state, got ${JSON.stringify(persistedFocus)}`
  );

  assert(game.applyObservatoryTrainingFocus('daily') === true, 'run slate review action should be able to hand control back to the observatory archive lens');
  const reviewFilters = game.getChallengeArchiveFilterState('daily');
  assert(
    reviewFilters.scope === 'all'
      && reviewFilters.track === 'playable'
      && reviewFilters.outcome === 'all'
      && reviewFilters.themeKey === 'oracle'
      && reviewFilters.sortBy === 'score_desc',
    `continuing review from a run slate should retarget observatory archive filters toward the shelf theme, got ${JSON.stringify(reviewFilters)}`
  );

  const sanctum = game.getSanctumOverviewData();
  const archiveRoom = sanctum.rooms.find((room) => room.id === 'run_slate_archive');
  const archiveResearch = sanctum.researches.find((research) => research.id === 'run_slate_archive_research');
  const archiveGoal = sanctum.goals.find((goal) => goal.id === 'run_slate_archive_goal');
  assert(
    archiveRoom
      && archiveRoom.actionType === 'collection'
      && archiveRoom.actionValue === 'slates',
    `sanctum archive room should jump into the run slate shelf instead of builds, got ${JSON.stringify(archiveRoom)}`
  );
  assert(
    archiveResearch
      && archiveResearch.section === 'slates',
    `sanctum archive research should jump into the run slate shelf instead of builds, got ${JSON.stringify(archiveResearch)}`
  );
  assert(
    archiveGoal
      && archiveGoal.value === 'slates',
    `sanctum archive goal should jump into the run slate shelf instead of builds, got ${JSON.stringify(archiveGoal)}`
  );

  const reloadedGame = createGame();
  reloadedGame.runSlateArchive = reloadedGame.loadRunSlateArchive();
  assert(reloadedGame.runSlateArchive.length === 3, `reloaded run slate shelf should restore archive entries from storage, got ${JSON.stringify(reloadedGame.runSlateArchive)}`);
  const reloadedFocus = reloadedGame.buildObservatoryTrainingFocusFromSlate(reloadedGame.runSlateArchive[0]);
  assert(
    reloadedFocus
      && reloadedFocus.sourceRunId === 'run_slate_oracle_5'
      && reloadedFocus.themeKey === 'oracle'
      && reloadedFocus.ratingLabel === '天象合卷',
    `reloaded run slate shelf should keep enough data for training reference and review actions, got ${JSON.stringify(reloadedFocus)}`
  );

  console.log('Run slate shelf checks passed.');
})();
