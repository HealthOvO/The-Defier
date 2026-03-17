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
        stats: { maxHp: 86, gold: 120, energy: 3 },
        relic: null,
        keywords: ['爆发', '斩杀'],
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
      upgradeCard: (card) => ({ ...card, upgraded: true }),
      deepClone: (value) => JSON.parse(JSON.stringify(value))
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
  loadFile(ctx, path.join(root, 'js/data/run_destinies.js'));
  loadFile(ctx, path.join(root, 'js/data/run_vows.js'));
  loadFile(ctx, path.join(root, 'js/data/spirit_companions.js'));
  loadFile(ctx, path.join(root, 'js/data/fate_ring.js'));
  loadFile(ctx, path.join(root, 'js/core/fateRing.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/game.js'));
  loadFile(ctx, path.join(root, 'js/core/collection_hub.js'));

  const Game = vm.runInContext('Game', ctx);
  const Player = vm.runInContext('Player', ctx);
  const LAWS = vm.runInContext('LAWS', ctx);

  const game = Object.create(Game.prototype);
  game.player = new Player('linFeng');
  game.player.game = game;
  game.collectionHubState = null;
  game.collectionUnlockHistory = null;
  game.bossMemoryRecords = null;
  game.unlockedRealms = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  game.currentScreen = 'collection';
  game.currentSaveSlot = 0;
  game.featureFlags = {};
  game.legacyProgress = { essence: 20, spent: 0, upgrades: {} };
  game.endlessState = Game.prototype.createDefaultEndlessState.call(game);
  game.encounterState = Game.prototype.createDefaultEncounterState.call(game);
  game.performanceStats = { battleUIUpdates: 0 };
  game.map = {
    nodes: [],
    currentNodeIndex: 0,
    completedNodes: [],
    getRealmName: (realm) => `第 ${realm} 重`
  };
  game.loadGame = () => true;
  game.showCollection = (section) => {
    game.lastCollectionSection = section;
    game.currentScreen = 'collection';
  };
  game.selectBossArchiveEntry = (bossId) => {
    game.lastSelectedBoss = bossId;
    game.selectedBossArchiveId = bossId;
  };
  game.showRewardModal = (title, message) => {
    game.lastRewardModal = { title, message };
  };
  game.updateRealmBackground = () => {};
  game.awardLegacyEssence = (amount) => {
    game.legacyProgress.essence += amount;
    return amount;
  };
  game.startBattle = (enemies, node) => {
    game.startedBattle = { enemies, node };
    game.currentBattleNode = node;
    return game.startedBattle;
  };

  game.player.collectLaw(LAWS.flameTruth || Object.values(LAWS)[0]);
  game.player.collectLaw(LAWS.thunderLaw || Object.values(LAWS)[1]);
  game.player.maxRealmReached = 10;
  game.achievementSystem = {
    stats: { realmCleared: 9, bossesDefeated: 3 },
    unlockedAchievements: [],
    claimedAchievements: [],
    updateStat: () => {}
  };

  const emptyRecord = game.getBossMemoryRecord('danZun');
  assert(emptyRecord.attempts === 0 && emptyRecord.clears === 0, `expected empty boss memory record, got ${JSON.stringify(emptyRecord)}`);

  const victoryRecord = game.recordBossMemoryResult('danZun', 'victory', 6);
  assert(victoryRecord.attempts === 1, `expected attempts to reach 1, got ${victoryRecord.attempts}`);
  assert(victoryRecord.clears === 1, `expected clears to reach 1, got ${victoryRecord.clears}`);
  assert(victoryRecord.bestTurn === 6, `expected best turn 6, got ${victoryRecord.bestTurn}`);

  const defeatRecord = game.recordBossMemoryResult('danZun', 'defeat', 9);
  assert(defeatRecord.attempts === 2, `expected attempts to reach 2, got ${defeatRecord.attempts}`);
  assert(defeatRecord.clears === 1, `expected clears to remain 1, got ${defeatRecord.clears}`);
  assert(defeatRecord.bestTurn === 6, `expected best turn to stay 6 after defeat, got ${defeatRecord.bestTurn}`);

  const bossEntries = game.getBossArchiveEntries();
  const danZun = bossEntries.find((entry) => entry.id === 'danZun');
  const heavenlyDao = bossEntries.find((entry) => entry.id === 'heavenlyDao');
  assert(danZun && danZun.memoryReady === true, `danZun should unlock memory battle after defeat, got ${JSON.stringify(danZun)}`);
  assert(danZun && danZun.memoryRecord.clears === 1, `danZun memory clears should be reflected in archive, got ${JSON.stringify(danZun && danZun.memoryRecord)}`);
  assert(danZun && danZun.memoryStatus === 'logged', `danZun memory status should become logged, got ${danZun && danZun.memoryStatus}`);
  assert(heavenlyDao && /终焉裁问/.test(heavenlyDao.finisher || ''), `heavenlyDao should expose chapter-boss finisher copy, got ${heavenlyDao && heavenlyDao.finisher}`);
  assert(heavenlyDao && Array.isArray(heavenlyDao.actPreview) && heavenlyDao.actPreview.length >= 2, `heavenlyDao should expose three-act preview lines, got ${JSON.stringify(heavenlyDao && heavenlyDao.actPreview)}`);

  game.captureBossMemorySession = Game.prototype.captureBossMemorySession;
  game.startBossMemoryBattle = Game.prototype.startBossMemoryBattle;
  game.buildRuntimeSaveSnapshot = Game.prototype.buildRuntimeSaveSnapshot;
  game.getBossArchiveEntries = Game.prototype.getBossArchiveEntries;
  game.getBossMemoryRecord = Game.prototype.getBossMemoryRecord;
  game.getCollectionHubState = Game.prototype.getCollectionHubState;
  game.ensureCollectionHubBootState = Game.prototype.ensureCollectionHubBootState;
  game.normalizeCollectionHubState = Game.prototype.normalizeCollectionHubState;
  game.resolveBossPressureLabel = Game.prototype.resolveBossPressureLabel;
  game.formatEnemyPatternSummary = Game.prototype.formatEnemyPatternSummary;
  game.getBossBreakHint = Game.prototype.getBossBreakHint;
  game.getCollectionRealmProgress = Game.prototype.getCollectionRealmProgress;
  game.getChapterProfileCatalog = Game.prototype.getChapterProfileCatalog;
  game.resolveChapterDangerProfile = Game.prototype.resolveChapterDangerProfile;
  game.getChapterProfileForRealm = Game.prototype.getChapterProfileForRealm;
  game.getBossMemoryClearCount = Game.prototype.getBossMemoryClearCount;
  game.getBossMemoryAttemptCount = Game.prototype.getBossMemoryAttemptCount;

  const started = game.startBossMemoryBattle('danZun');
  assert(started === true, 'startBossMemoryBattle should start a defeated boss memory battle');
  assert(game.startedBattle && game.startedBattle.node.type === 'boss_memory', `expected boss_memory node, got ${JSON.stringify(game.startedBattle)}`);
  assert(game.startedBattle.enemies[0].name.includes('记忆战'), `expected memory battle boss naming, got ${game.startedBattle.enemies[0].name}`);
  assert(game.bossMemorySession && game.bossMemorySession.bossId === 'danZun', 'memory battle should capture restore session');

  game.restoreBossMemorySession = () => true;
  game.finishBossMemoryBattle = Game.prototype.finishBossMemoryBattle;
  game.currentBattleNode = { type: 'boss_memory', bossId: 'danZun' };
  const result = game.finishBossMemoryBattle('victory', { bossId: 'danZun', turns: 5 });
  assert(result && result.firstClear === false, `repeat victory should not count as first clear, got ${JSON.stringify(result)}`);
  assert(game.lastCollectionSection === 'bosses', `expected return to boss archive, got ${game.lastCollectionSection}`);
  assert(game.lastSelectedBoss === 'danZun', `expected danZun to stay selected, got ${game.lastSelectedBoss}`);
  assert(game.lastRewardModal && /记忆战胜利/.test(game.lastRewardModal.title), `expected reward modal for memory victory, got ${JSON.stringify(game.lastRewardModal)}`);

  console.log('Boss memory battle checks passed.');
})();
