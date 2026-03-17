const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadFile(ctx, filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, ctx, { filename: filePath });
}

(function run() {
  const root = path.resolve(__dirname, '..');
  const storage = () => {
    const map = new Map();
    return {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key)
    };
  };

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
    localStorage: storage(),
    sessionStorage: storage(),
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 0;
    },
    clearTimeout: () => {},
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
  loadFile(ctx, path.join(root, 'js/core/fateRing.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/core/achievements.js'));
  loadFile(ctx, path.join(root, 'js/game.js'));
  loadFile(ctx, path.join(root, 'js/core/collection_hub.js'));

  const Game = vm.runInContext('Game', ctx);
  const Player = vm.runInContext('Player', ctx);
  const AchievementSystem = vm.runInContext('AchievementSystem', ctx);
  const ACHIEVEMENTS = vm.runInContext('ACHIEVEMENTS', ctx);
  const LAWS = vm.runInContext('LAWS', ctx);

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
  game.achievementSystem.updateStat('realmCleared', 6, 'max');
  game.achievementSystem.updateStat('bossesDefeated', 2, 'max');
  game.achievementSystem.updateStat('maxCombo', 8, 'max');
  game.achievementSystem.updateStat('singleDamage', 42, 'max');
  game.encounterState.maxStreak = 3;
  game.endlessState.clearedCycles = 1;
  game.recordBossMemoryResult('danZun', 'victory', 5);
  game.recordRunPathCompletion(game.getRunPathMetaById('insight'), {
    completedAt: Date.now(),
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
    completedAt: Date.now() - 1000
  });
  game.recordCollectionUnlock('run_path', {
    id: 'runPathInsightRecord',
    name: '命盘观测录',
    icon: '🔮',
    note: '已收入洞府·命途碑廊，可继续复盘窥命流的套装与 Boss 读法。'
  });

  const spirits = game.getSpiritCodexEntries();
  const currentSpirit = spirits.find((entry) => entry.id === 'emberCrow');
  assert(spirits.length >= 8, `spirit codex should expose multiple spirits, got ${spirits.length}`);
  assert(currentSpirit && currentSpirit.status === 'current', `emberCrow should be current spirit, got ${currentSpirit && currentSpirit.status}`);
  assert(
    spirits.some((entry) => entry.isHidden),
    'spirit codex should retain hidden entries with clue state'
  );

  const chapters = game.getChapterCodexEntries();
  assert(chapters.length === 6, `chapter codex should expose 6 chapters, got ${chapters.length}`);
  assert(chapters[0].enemies.length >= 2, `chapter 1 should list ecology enemies, got ${chapters[0].enemies.length}`);
  assert(chapters[1].bosses.length >= 1, `chapter 2 should list at least one boss, got ${chapters[1].bosses.length}`);
  assert(chapters[0].ecologyTemplates && chapters[0].ecologyTemplates.formation, 'chapter 1 should expose ecology template metadata');
  assert(chapters[5].eliteCombo && /终庭/.test(chapters[5].eliteCombo.name), `chapter 6 should expose elite combo summary, got ${JSON.stringify(chapters[5].eliteCombo)}`);

  const enemies = game.getEnemyCodexEntries();
  const graveRaven = enemies.find((entry) => entry.id === 'graveRaven');
  const fateShackle = enemies.find((entry) => entry.id === 'fateShackle');
  assert(enemies.length >= 12, `enemy codex should expose many regular enemies, got ${enemies.length}`);
  assert(graveRaven && graveRaven.roleLabel === '控场型', `graveRaven should resolve to control role, got ${graveRaven && graveRaven.roleLabel}`);
  assert(graveRaven && graveRaven.threatTags.includes('状态压制'), `graveRaven should expose debuff threat tags, got ${graveRaven && JSON.stringify(graveRaven.threatTags)}`);
  assert(fateShackle && /终庭/.test(fateShackle.ecologyLabel), `fateShackle should expose final chapter ecology label, got ${fateShackle && fateShackle.ecologyLabel}`);
  assert(fateShackle && fateShackle.threatTags.includes('污染负担'), `fateShackle should expose addStatus threat tag, got ${fateShackle && JSON.stringify(fateShackle.threatTags)}`);

  const bosses = game.getBossArchiveEntries();
  const danZun = bosses.find((entry) => entry.id === 'danZun');
  const heavenlyDao = bosses.find((entry) => entry.id === 'heavenlyDao');
  assert(bosses.length >= 6, `boss archive should expose many bosses, got ${bosses.length}`);
  assert(danZun && danZun.counterTreasures.length >= 1, 'danZun should expose counter treasure guidance');
  assert(danZun && /灼烧|净化|冰/.test(danZun.breakHint), `danZun break hint should mention counterplay, got ${danZun && danZun.breakHint}`);
  assert(danZun && danZun.memoryRecord.clears >= 1, `danZun should carry boss memory record, got ${danZun && JSON.stringify(danZun.memoryRecord)}`);
  assert(danZun && danZun.memoryReady === true, `danZun should unlock boss memory battle after defeat, got ${danZun && danZun.memoryReady}`);
  assert(danZun && danZun.runPathFitLabel === '留冗余手牌', `danZun should expose current run path matchup guidance, got ${danZun && JSON.stringify(danZun.runPathMatchup)}`);
  assert(danZun && danZun.sampleCount >= 1, `danZun should expose archived sample count, got ${danZun && JSON.stringify(danZun.sampleBoard)}`);
  assert(danZun && danZun.sampleBoard && danZun.sampleBoard.entries.some((entry) => /林枫/.test(entry.headline)), `danZun should expose sample board entries, got ${danZun && JSON.stringify(danZun.sampleBoard)}`);
  assert(
    danZun && danZun.sampleBoard && danZun.sampleBoard.recommendation && Array.isArray(danZun.sampleBoard.recommendation.lines) && danZun.sampleBoard.recommendation.lines.some((line) => /推荐角色/.test(line)),
    `danZun should expose recommendation lines in sample board, got ${danZun && JSON.stringify(danZun.sampleBoard)}`
  );
  assert(heavenlyDao && /终焉裁问/.test(heavenlyDao.finisher || ''), `heavenlyDao should expose finisher metadata, got ${heavenlyDao && heavenlyDao.finisher}`);
  assert(heavenlyDao && Array.isArray(heavenlyDao.actPreview) && heavenlyDao.actPreview.length >= 2, `heavenlyDao should expose act previews, got ${JSON.stringify(heavenlyDao && heavenlyDao.actPreview)}`);
  assert(heavenlyDao && heavenlyDao.runPathFitLabel === '终章控尾', `heavenlyDao should expose boss-specific run path fit label, got ${heavenlyDao && JSON.stringify(heavenlyDao.runPathMatchup)}`);
  assert(heavenlyDao && /适配评级 终章控尾/.test(heavenlyDao.runPathCounterText || ''), `heavenlyDao should expose run path counter text, got ${heavenlyDao && heavenlyDao.runPathCounterText}`);
  assert(heavenlyDao && /章节场域.*终焉命庭/.test(heavenlyDao.runPathCounterText || ''), `heavenlyDao should expose chapter cue in counter text, got ${heavenlyDao && heavenlyDao.runPathCounterText}`);
  assert(heavenlyDao && /章节补题|场域拆法/.test(heavenlyDao.runPathCounterText || ''), `heavenlyDao should expose chapter environment solve in counter text, got ${heavenlyDao && heavenlyDao.runPathCounterText}`);

  const build = game.getBuildSnapshotData();
  assert(build.profile.size >= 5, `build snapshot should see starter deck, got ${build.profile.size}`);
  assert(build.strengths.length >= 1, 'build snapshot should summarize at least one strength');
  assert(build.gaps.length >= 1, 'build snapshot should summarize at least one gap');
  assert(build.nextTargets.length >= 1, 'build snapshot should recommend next targets');
  assert(build.runPath && build.runPath.id === 'insight', `build snapshot should expose current run path, got ${JSON.stringify(build.runPath)}`);
  assert(build.runPathRecord && build.runPathRecord.clears >= 1, `build snapshot should expose run path archive record, got ${JSON.stringify(build.runPathRecord)}`);
  assert(build.runPathSampleBoard && build.runPathSampleBoard.count >= 1, `build snapshot should expose run path sample board, got ${JSON.stringify(build.runPathSampleBoard)}`);
  assert(build.runPathSampleRecommendation && build.runPathSampleRecommendation.character, `build snapshot should expose run path sample recommendation, got ${JSON.stringify(build.runPathSampleRecommendation)}`);
  assert(build.runPathSampleRecommendation && build.runPathSampleRecommendation.chapter && build.runPathSampleRecommendation.chapter.fitScore >= 1, `build snapshot should expose chapter fit recommendation, got ${JSON.stringify(build.runPathSampleRecommendation)}`);
  assert(Array.isArray(build.nextChapterRiskTags) && build.nextChapterRiskTags.length >= 1, `build snapshot should expose next chapter risk tags, got ${JSON.stringify(build.nextChapterRiskTags)}`);
  assert(Array.isArray(build.priorityQueue) && build.priorityQueue.length >= 1, `build snapshot should expose a priority queue, got ${JSON.stringify(build.priorityQueue)}`);
  assert(build.priorityQueue[0] && build.priorityQueue[0].rank === 1, `priority queue should be explicitly ranked, got ${JSON.stringify(build.priorityQueue)}`);
  assert(build.strengths.some((line) => /样本对照/.test(line)), `build snapshot should mention sample board strengths, got ${JSON.stringify(build.strengths)}`);
  assert(build.strengths.some((line) => /样本推荐角色|样本推荐套装/.test(line)), `build snapshot should include recommendation-driven strengths, got ${JSON.stringify(build.strengths)}`);
  assert(build.strengths.some((line) => /章节适配|场域拟合分/.test(line)), `build snapshot should include chapter-fit strengths, got ${JSON.stringify(build.strengths)}`);
  assert(build.nextTargets.some((line) => /裂变参考|样本目标|章节适配/.test(line)), `build snapshot should expose recommendation-driven next targets, got ${JSON.stringify(build.nextTargets)}`);
  assert(build.sampleMismatchWarning === null || /拟合分|误配/.test(build.sampleMismatchWarning.text || ''), `sample mismatch warning should explain the drift when present, got ${JSON.stringify(build.sampleMismatchWarning)}`);

  const sanctum = game.getSanctumOverviewData();
  assert(sanctum.rooms.length === 5, `sanctum should expose 5 rooms, got ${sanctum.rooms.length}`);
  assert(sanctum.researches.length >= 11, `sanctum should expose forge research items plus run path sample study, got ${sanctum.researches.length}`);
  assert(sanctum.rooms.some((room) => room.id === 'forge' && room.actionType === 'treasure'), 'forge room should jump into treasure research');
  assert(sanctum.rooms.some((room) => room.id === 'run_path_gallery' && room.actionValue === 'builds'), 'sanctum should expose run path gallery room');
  assert(sanctum.rooms.some((room) => room.id === 'demon_platform' && room.actionValue === 'enemies'), 'demon platform should jump into enemy codex');
  assert(sanctum.researches.some((research) => research.id === 'forge_atlas' && research.actionType === 'treasure'), 'sanctum should expose forge atlas research');
  assert(sanctum.researches.some((research) => research.id === 'run_path_archive' && research.progress >= 1), 'sanctum should expose run path archive research');
  assert(sanctum.researches.some((research) => research.id === 'sample_board' && research.progress >= 1), 'sanctum should expose run path sample board research');
  assert(sanctum.researches.some((research) => research.id === 'memory_duel' && research.section === 'bosses'), 'sanctum should expose boss memory duel research');
  assert(sanctum.progress.collectedLaws >= 2, `sanctum progress should include collected laws, got ${sanctum.progress.collectedLaws}`);
  assert(sanctum.progress.collectedTreasures >= 2, `sanctum progress should include collected treasures, got ${sanctum.progress.collectedTreasures}`);
  assert(sanctum.progress.forgeCoreTotal >= 6, `sanctum progress should expose forge core totals, got ${sanctum.progress.forgeCoreTotal}`);
  assert(sanctum.progress.forgeFormTotal >= 8, `sanctum progress should expose forge form totals, got ${sanctum.progress.forgeFormTotal}`);
  assert(sanctum.progress.seenEnemies >= 3, `sanctum progress should include seen enemies, got ${sanctum.progress.seenEnemies}`);
  assert(sanctum.progress.clearedBossMemories >= 1, `sanctum progress should include boss memory clears, got ${sanctum.progress.clearedBossMemories}`);
  assert(sanctum.progress.completedRunPaths >= 1, `sanctum progress should include completed run paths, got ${sanctum.progress.completedRunPaths}`);
  assert(sanctum.progress.totalRunPaths === 3, `sanctum progress should expose total run paths, got ${sanctum.progress.totalRunPaths}`);
  assert(sanctum.progress.runPathBossSampleCount >= 1, `sanctum progress should expose sample board count, got ${JSON.stringify(sanctum.progress)}`);
  assert(sanctum.recentUnlocks.length >= 4, `sanctum should accumulate recent unlock history, got ${sanctum.recentUnlocks.length}`);
  assert(sanctum.recentUnlocks.some((entry) => entry.type === 'run_path' && entry.name === '命盘观测录'), 'sanctum recent unlocks should include run path archive');
  assert(sanctum.goals.length >= 1, 'sanctum should expose at least one actionable goal');

  console.log('Codex sanctum checks passed.');
})();
