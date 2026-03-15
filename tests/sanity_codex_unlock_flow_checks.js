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
    sessionStorage: { getItem: () => null, setItem: () => {} },
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
    'js/data/run_vows.js',
    'js/data/spirit_companions.js',
    'js/data/narrative_templates.js',
    'js/data/enemies.js',
    'js/game.js',
    'js/core/collection_hub.js'
  ].forEach((file) => loadFile(ctx, path.join(root, file)));

  const Game = vm.runInContext('Game', ctx);
  const game = Object.create(Game.prototype);
  game.player = {
    characterId: 'linFeng',
    realm: 18,
    getSpiritCompanionMeta: () => null
  };
  game.selectedCharacterId = 'linFeng';
  game.pendingSpiritCompanionDrafts = { linFeng: ['frostChi', 'emberCrow', 'starFox'] };
  game.getCollectionUnlockHistory = () => [];
  game.getCollectionRealmProgress = () => ({
    currentRealm: 18,
    currentChapterIndex: 6,
    clearedRealm: 18
  });

  const spiritEntries = game.getSpiritCodexEntries();
  assert(spiritEntries.length >= 8, `expected 8+ spirit entries, got ${spiritEntries.length}`);
  spiritEntries.forEach((entry) => {
    assert(entry.storyProfile, `${entry.id} should expose storyProfile`);
    assert(typeof entry.storyProfile.acquisitionSummary === 'string' && entry.storyProfile.acquisitionSummary.length >= 10, `${entry.id} should expose acquisition story`);
    assert(typeof entry.storyProfile.witnessSummary === 'string' && entry.storyProfile.witnessSummary.length >= 10, `${entry.id} should expose witness story`);
    assert(typeof entry.storyProfile.growthGoal === 'string' && entry.storyProfile.growthGoal.length >= 10, `${entry.id} should expose growth goal`);
  });

  const chapterEntries = game.getChapterCodexEntries();
  assert(chapterEntries.length === 6, `expected 6 chapter entries, got ${chapterEntries.length}`);
  chapterEntries.forEach((entry) => {
    assert(entry.narrativeProfile, `chapter ${entry.chapterIndex} should expose narrativeProfile`);
    assert(Array.isArray(entry.narrativeProfile.beats) && entry.narrativeProfile.beats.length >= 3, `chapter ${entry.chapterIndex} should expose 3 narrative beats`);
    assert(typeof entry.narrativeProfile.summary === 'string' && entry.narrativeProfile.summary.length >= 12, `chapter ${entry.chapterIndex} should expose narrative summary`);
  });
  const finalChapter = chapterEntries.find((entry) => entry.chapterIndex === 6);
  assert(finalChapter && finalChapter.narrativeProfile.finaleRecall, 'chapter 6 should expose finale recall');
  assert(finalChapter.narrativeProfile.finaleRecall.summary.length >= 20, 'chapter 6 finale recall should expose summary');
  assert(Array.isArray(finalChapter.narrativeProfile.finaleRecall.systems) && finalChapter.narrativeProfile.finaleRecall.systems.length >= 5, 'chapter 6 finale recall should link 5 systems');

  console.log('Codex unlock flow checks passed.');
})();
