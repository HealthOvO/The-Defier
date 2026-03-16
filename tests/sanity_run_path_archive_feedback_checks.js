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

function buildRunPathMeta(catalog, runPath, progress) {
  if (!runPath || !catalog[runPath.id]) return null;
  const base = catalog[runPath.id];
  const phases = Array.isArray(base.phases) ? base.phases : [];
  const phaseIndex = Math.max(0, Math.min(phases.length - 1, Number(progress.currentPhaseIndex) || 0));
  return {
    ...base,
    currentPhase: phases[phaseIndex] || null,
    phaseIndex,
    phaseCount: phases.length,
    progress
  };
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
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value))
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    Utils: {
      shuffle: (arr) => arr.slice(),
      showBattleLog: () => {}
    }
  });
  ctx.window = ctx;
  ctx.global = ctx;

  [
    'js/data/characters.js',
    'js/data/run_destinies.js',
    'js/data/run_paths.js',
    'js/data/spirit_companions.js',
    'js/data/run_vows.js',
    'js/data/narrative_templates.js',
    'js/game.js',
    'js/core/collection_hub.js'
  ].forEach((file) => loadFile(ctx, path.join(root, file)));

  const Game = vm.runInContext('Game', ctx);
  const RUN_PATHS = vm.runInContext('RUN_PATHS', ctx);

  const game = Object.create(Game.prototype);
  game.shuffleList = (arr) => arr.slice();
  game.pendingRunPathDrafts = {};
  game.pendingRunDestinyDrafts = { yanHan: ['foldedEdge', 'rebelScale', 'emberHeart'] };
  game.pendingSpiritCompanionDrafts = { yanHan: ['swordWraith', 'spiritApe', 'starFox'] };
  game.selectedCharacterId = 'yanHan';
  game.selectedRunPathId = 'insight';
  game.currentScreen = 'battle-screen';
  game.map = null;
  game.unlockedRealms = [1, 2, 3, 4, 5, 6];
  game.ensureEndlessState = () => null;
  game.getEndlessPhaseProfile = () => null;
  game.getEndlessCycleThemeProfile = () => null;
  game.ensureEncounterState = () => ({});
  game.legacyProgress = {};
  game.getLegacyUnspentEssence = () => 0;
  game.refreshLegacyMissionTrackers = () => {};
  game.autoSave = () => {};
  game.showScreen = (screen) => {
    game.currentScreen = screen;
  };
  game.dismissRunPathMapFeedback = Game.prototype.dismissRunPathMapFeedback;

  const fakePlayer = {
    currentHp: 84,
    maxHp: 84,
    block: 0,
    currentEnergy: 3,
    baseEnergy: 3,
    characterId: 'yanHan',
    realm: 6,
    hand: [],
    drawPile: [],
    discardPile: [],
    equippedTreasures: [],
    collectedLaws: [],
    fateRing: {
      getSocketedLaws: () => []
    },
    runDestiny: null,
    runVows: [],
    spiritCompanion: null,
    runPath: { id: 'insight' },
    runPathProgress: {
      pathId: 'insight',
      currentPhaseIndex: 2,
      phaseProgress: 0,
      completedPhases: ['insight_opening', 'insight_mid'],
      rewardHistory: [],
      completed: false,
      lastRewardText: ''
    },
    getRunDestinyMeta: () => null,
    getRunVowMetas: () => [],
    getSpiritCompanionMeta: () => null,
    getTreasureWorkshopSnapshot: () => [],
    getTreasureWorkshopResearchOverview: () => null,
    grantAdventureBuff: () => true,
    ensureRunPathProgress() {
      return this.runPathProgress;
    },
    getRunPathMeta() {
      return buildRunPathMeta(RUN_PATHS, this.runPath, this.runPathProgress);
    },
    getRunPathEffects() {
      const meta = this.getRunPathMeta();
      return meta ? { ...(meta.effects || {}) } : {};
    }
  };

  game.player = fakePlayer;

  assert(game.handleRunPathProgress('bossWin', 1, { nodeType: 'boss' }), 'final insight phase should complete');

  const archiveRecord = game.getRunPathRecord('insight');
  assert(archiveRecord && archiveRecord.recordName === '命盘观测录', `archive record should keep completion record name, got ${JSON.stringify(archiveRecord)}`);
  assert(archiveRecord && archiveRecord.clears === 1, `archive record should persist clears, got ${JSON.stringify(archiveRecord)}`);
  assert(archiveRecord && archiveRecord.lastCharacterName === '严寒', `archive record should resolve last character name, got ${JSON.stringify(archiveRecord)}`);
  assert(archiveRecord && archiveRecord.lastRealm === 6, `archive record should persist realm, got ${JSON.stringify(archiveRecord)}`);

  const history = game.getCollectionUnlockHistory(3);
  assert(history.length >= 1, 'collection history should record run path archive unlock');
  assert(history[0].type === 'run_path', `latest history should be run_path, got ${JSON.stringify(history[0])}`);
  assert(/命途碑廊/.test(history[0].note || ''), `history note should mention run path gallery, got ${history[0].note}`);

  const progress = game.getCollectionProgressSnapshot();
  assert(progress.completedRunPaths === 1, `progress should count completed run paths, got ${progress.completedRunPaths}`);
  assert(progress.totalRunPaths === 3, `progress should expose total run paths, got ${progress.totalRunPaths}`);
  assert(progress.totalRunPathClears === 1, `progress should expose total run path clears, got ${progress.totalRunPathClears}`);

  const build = game.getBuildSnapshotData();
  assert(build.runPath && build.runPath.id === 'insight', `build snapshot should expose current run path, got ${JSON.stringify(build.runPath)}`);
  assert(build.runPathRecord && build.runPathRecord.clears === 1, `build snapshot should expose current run path archive, got ${JSON.stringify(build.runPathRecord)}`);
  assert(build.nextTargets.some((line) => /命途碑廊/.test(line)), `build snapshot should mention run path archive feedback, got ${JSON.stringify(build.nextTargets)}`);

  const sanctum = game.getSanctumOverviewData();
  assert(sanctum.rooms.some((room) => room.id === 'run_path_gallery'), 'sanctum should expose run path gallery room');
  assert(sanctum.researches.some((research) => research.id === 'run_path_archive' && research.progress === 1 && research.goal === 3), `sanctum should expose run path archive research, got ${JSON.stringify(sanctum.researches.find((item) => item.id === 'run_path_archive'))}`);
  assert(sanctum.recentUnlocks.some((entry) => entry.type === 'run_path' && entry.name === '命盘观测录'), `sanctum recent unlocks should include run path archive, got ${JSON.stringify(sanctum.recentUnlocks)}`);
  assert(sanctum.progress.completedRunPaths === 1, `sanctum progress should mirror completed run paths, got ${sanctum.progress.completedRunPaths}`);

  game.currentScreen = 'reward-screen';
  const rewardPayload = JSON.parse(game.renderGameToText());
  assert(rewardPayload.reward && rewardPayload.reward.runPath && rewardPayload.reward.runPath.archive, `reward payload should expose archive feedback, got ${JSON.stringify(rewardPayload.reward)}`);
  assert(rewardPayload.reward.runPath.archive.recordName === '命盘观测录', `reward payload archive should expose record name, got ${JSON.stringify(rewardPayload.reward.runPath.archive)}`);
  assert(rewardPayload.reward.runPath.archive.firstClear === true, `reward payload archive should mark first clear, got ${JSON.stringify(rewardPayload.reward.runPath.archive)}`);

  console.log('Run path archive feedback checks passed.');
})();
