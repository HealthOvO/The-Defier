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
        stats: { maxHp: 80, gold: 100, energy: 3 },
        relic: null,
        deck: ['strike', 'defend', 'quickDraw', 'defend', 'strike']
      }
    },
    SKILLS: {},
    STARTER_DECK: ['strike', 'defend', 'quickDraw', 'defend', 'strike'],
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
  loadFile(ctx, path.join(root, 'js/data/run_destinies.js'));
  loadFile(ctx, path.join(root, 'js/data/run_vows.js'));
  loadFile(ctx, path.join(root, 'js/data/spirit_companions.js'));
  loadFile(ctx, path.join(root, 'js/data/fate_ring.js'));
  loadFile(ctx, path.join(root, 'js/core/player.js'));
  loadFile(ctx, path.join(root, 'js/game.js'));

  const Player = vm.runInContext('Player', ctx);
  const Game = vm.runInContext('Game', ctx);

  const game = Object.create(Game.prototype);
  game.isEndlessActive = () => false;
  game.getDisplayRealmName = Game.prototype.getDisplayRealmName;
  game.getChapterProfileCatalog = Game.prototype.getChapterProfileCatalog;
  game.getChapterProfileForRealm = Game.prototype.getChapterProfileForRealm;
  game.getChapterDisplaySnapshot = Game.prototype.getChapterDisplaySnapshot;
  game.getRunDestinyMetaById = Game.prototype.getRunDestinyMetaById;
  game.getRunVowMetaById = Game.prototype.getRunVowMetaById;
  game.getSpiritCompanionMetaById = Game.prototype.getSpiritCompanionMetaById;
  game.player = new Player();

  const chapterOne = game.getChapterProfileForRealm(1);
  assert(chapterOne.chapterIndex === 1, `realm 1 should resolve to chapter 1, got ${chapterOne.chapterIndex}`);
  assert(chapterOne.name === '碎誓外域', `chapter 1 name mismatch: ${chapterOne.name}`);
  assert(chapterOne.stageLabel.includes('前段'), `realm 1 should be front stage, got ${chapterOne.stageLabel}`);
  assert(chapterOne.recommendedDestinies.length >= 3, 'chapter 1 should expose destiny recommendations');

  const chapterThree = game.getChapterProfileForRealm(8);
  assert(chapterThree.chapterIndex === 3, `realm 8 should resolve to chapter 3, got ${chapterThree.chapterIndex}`);
  assert(chapterThree.name === '沉星古庭', `chapter 3 name mismatch: ${chapterThree.name}`);
  assert(chapterThree.leyline.name === '星律地脉', `chapter 3 leyline mismatch: ${chapterThree.leyline.name}`);
  assert(chapterThree.stageLabel.includes('中段'), `realm 8 should be middle stage, got ${chapterThree.stageLabel}`);

  const chapterSix = game.getChapterProfileForRealm(18);
  assert(chapterSix.chapterIndex === 6, `realm 18 should resolve to chapter 6, got ${chapterSix.chapterIndex}`);
  assert(chapterSix.name === '终焉命庭', `chapter 6 name mismatch: ${chapterSix.name}`);
  assert(chapterSix.stageLabel.includes('末段'), `realm 18 should be final stage, got ${chapterSix.stageLabel}`);

  game.player.setRunDestiny('rebelScale', 1);
  game.player.setSpiritCompanion('emberCrow', 1);
  game.player.applyRunVow('blazingLife');
  const chapterFiveSnapshot = game.getChapterDisplaySnapshot(14);
  assert(chapterFiveSnapshot.chapterIndex === 5, `realm 14 should resolve to chapter 5, got ${chapterFiveSnapshot.chapterIndex}`);
  assert(chapterFiveSnapshot.destinyRecommended === true, 'chapter 5 should mark rebelScale as recommended');
  assert(chapterFiveSnapshot.spiritRecommended === true, 'chapter 5 should mark emberCrow as recommended');
  assert(chapterFiveSnapshot.vowRecommended === true, 'chapter 5 should mark blazingLife as recommended');
  assert(
    chapterFiveSnapshot.currentVows.some((meta) => meta.id === 'blazingLife'),
    `chapter 5 snapshot should include active vow blazingLife, got ${JSON.stringify(chapterFiveSnapshot.currentVows)}`
  );

  const chapterFourSnapshot = game.getChapterDisplaySnapshot(11);
  assert(chapterFourSnapshot.chapterIndex === 4, `realm 11 should resolve to chapter 4, got ${chapterFourSnapshot.chapterIndex}`);
  assert(Array.isArray(chapterFourSnapshot.focusTags) && chapterFourSnapshot.focusTags.includes('复制反照'), 'chapter 4 should keep mirror focus tags');

  console.log('Chapter world rule checks passed.');
})();
